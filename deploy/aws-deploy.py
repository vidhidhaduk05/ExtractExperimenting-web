"""Master deployment orchestrator for RadExtract AWS Serverless.

Supports two deployment modes:
  1. ZIP-based (default) — for deployments without the Antigravity SDK.
  2. Container-based (--container) — required when antigravity_enabled=true,
     since the SDK includes a compiled Go binary that exceeds the 250MB ZIP limit.

Usage:
    # ZIP-based (no Antigravity SDK)
    python deploy/aws-deploy.py --env production --region us-east-1

    # Container-based (with Antigravity SDK)
    python deploy/aws-deploy.py --env production --region us-east-1 --container

    # Skip frontend
    python deploy/aws-deploy.py --env staging --skip-frontend
"""
from __future__ import annotations
import argparse
import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError

from infra import (
    ensure_dynamodb_tables,
    ensure_s3_buckets,
    ensure_lambda_role,
    ensure_api_gateway,
    ensure_ecr_repository,
    deploy_container_lambda,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("radextract.deploy")

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "radextract_platform" / "backend"
FRONTEND_DIR = ROOT_DIR / "radextract_platform" / "frontend"
BUILD_DIR = ROOT_DIR / "build"


def deploy_lambda_function(
    func_name: str,
    role_arn: str,
    zip_path: Path,
    env_vars: dict,
    region: str = "us-east-1",
) -> str:
    """Create or update AWS Lambda function with the packaged ZIP."""
    client = boto3.client("lambda", region_name=region)
    with open(zip_path, "rb") as f:
        zip_bytes = f.read()

    try:
        # Check if function exists
        client.get_function(FunctionName=func_name)
        logger.info(f"Updating code for existing Lambda function '{func_name}'...")
        client.update_function_code(
            FunctionName=func_name,
            ZipFile=zip_bytes,
        )
        logger.info(f"Updating configuration for '{func_name}'...")
        res = client.update_function_configuration(
            FunctionName=func_name,
            Runtime="python3.11",
            Role=role_arn,
            Handler="main.handler",
            Timeout=60,
            MemorySize=1024,
            Environment={"Variables": env_vars},
        )
        return res["FunctionArn"]
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise

    logger.info(f"Creating new Lambda function '{func_name}'...")
    res = client.create_function(
        FunctionName=func_name,
        Runtime="python3.11",
        Role=role_arn,
        Handler="main.handler",
        Code={"ZipFile": zip_bytes},
        Timeout=60,
        MemorySize=1024,
        Environment={"Variables": env_vars},
    )
    return res["FunctionArn"]


def deploy_frontend(
    frontend_bucket: str,
    api_url: str,
    region: str = "us-east-1",
):
    """Build and upload Vite frontend application to S3."""
    logger.info(f"Building frontend application targeting API: {api_url}...")
    env = os.environ.copy()
    env["VITE_API_BASE_URL"] = api_url

    # Check if npm is available
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    subprocess.run([npm_cmd, "run", "build"], cwd=str(FRONTEND_DIR), env=env, check=True)

    dist_dir = FRONTEND_DIR / "dist"
    if not dist_dir.exists():
        raise RuntimeError("Frontend build directory 'dist' does not exist.")

    logger.info(f"Syncing frontend build to S3 bucket '{frontend_bucket}'...")
    s3 = boto3.client("s3", region_name=region)

    content_types = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".ico": "image/x-icon",
    }

    for root, _, files in os.walk(dist_dir):
        for file in files:
            file_path = Path(root) / file
            key = str(file_path.relative_to(dist_dir)).replace("\\", "/")
            ctype = content_types.get(file_path.suffix.lower(), "application/octet-stream")

            s3.upload_file(
                Filename=str(file_path),
                Bucket=frontend_bucket,
                Key=key,
                ExtraArgs={"ContentType": ctype},
            )
            logger.info(f"Uploaded: {key} ({ctype})")

    logger.info("Frontend deployment complete.")


def build_and_push_container_image(
    ecr_repo_uri: str,
    region: str = "us-east-1",
    image_tag: str = "latest",
) -> str:
    """Build the Docker image and push it to ECR.

    Returns the full ECR image URI for the Lambda function.
    """
    logger.info("Building container image for Lambda...")

    dockerfile_path = ROOT_DIR / "deploy" / "Dockerfile.lambda"
    image_name = "radextract-lambda"

    # Build the Docker image
    subprocess.run(
        [
            "docker", "build",
            "-t", image_name,
            "-f", str(dockerfile_path),
            str(ROOT_DIR),
        ],
        check=True,
    )

    # Authenticate with ECR
    ecr_client = boto3.client("ecr", region_name=region)
    auth_data = ecr_client.get_authorization_token()
    token = auth_data["authorizationData"][0]["authorizationToken"]
    import base64
    username, password = base64.b64decode(token).decode().split(":")

    registry = ecr_repo_uri.split("/")[0]
    subprocess.run(
        [
            "docker", "login",
            "--username", username,
            "--password-stdin",
            registry,
        ],
        input=password.encode(),
        check=True,
    )

    # Tag and push
    ecr_image_uri = f"{ecr_repo_uri}:{image_tag}"
    subprocess.run(["docker", "tag", f"{image_name}:latest", ecr_image_uri], check=True)
    logger.info(f"Pushing image to ECR: {ecr_image_uri}")
    subprocess.run(["docker", "push", ecr_image_uri], check=True)

    logger.info(f"Image pushed successfully: {ecr_image_uri}")
    return ecr_image_uri


def main():
    parser = argparse.ArgumentParser(description="Deploy RadExtract to AWS Serverless")
    parser.add_argument("--env", default="production", choices=["production", "staging", "dev"])
    parser.add_argument("--region", default="us-east-1")
    parser.add_argument("--skip-infra", action="store_true")
    parser.add_argument("--skip-backend", action="store_true")
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--jwt-secret", default=os.getenv("JWT_SECRET", "production-secret-key-change-in-env"))
    parser.add_argument(
        "--container",
        action="store_true",
        help="Use container-based Lambda (required for Antigravity SDK). "
             "Builds a Docker image and pushes to ECR instead of ZIP deployment.",
    )
    parser.add_argument(
        "--gemini-api-key",
        default=os.getenv("GEMINI_API_KEY", ""),
        help="Gemini API key for the Antigravity agent. Required when --container is used.",
    )
    args = parser.parse_args()

    storage_bucket = f"radextract-storage-{args.env}"
    frontend_bucket = f"radextract-frontend-{args.env}"
    func_name = f"radextract-backend-{args.env}"
    api_name = f"radextract-api-{args.env}"
    role_name = f"radextract-lambda-exec-{args.env}"
    table_prefix = f"radextract_{args.env}"
    ecr_repo_name = f"radextract-lambda-{args.env}"

    logger.info("=" * 60)
    logger.info(f"Starting RadExtract AWS Deployment [{args.env.upper()}] in {args.region}")
    if args.container:
        logger.info("Deployment mode: CONTAINER (ECR + container-based Lambda)")
    else:
        logger.info("Deployment mode: ZIP (standard Lambda)")
    logger.info("=" * 60)

    # 1. Infrastructure Provisioning
    if not args.skip_infra:
        logger.info("Phase 1: Infrastructure Provisioning...")
        ensure_dynamodb_tables(prefix=table_prefix, region=args.region)
        ensure_s3_buckets(storage_bucket, frontend_bucket, region=args.region)
        role_arn = ensure_lambda_role(role_name=role_name, region=args.region)
        if args.container:
            ecr_repo_uri = ensure_ecr_repository(
                repository_name=ecr_repo_name, region=args.region
            )
    else:
        iam = boto3.client("iam", region_name=args.region)
        role_arn = iam.get_role(RoleName=role_name)["Role"]["Arn"]
        if args.container:
            ecr = boto3.client("ecr", region_name=args.region)
            try:
                res = ecr.describe_repositories(repositoryNames=[ecr_repo_name])
                ecr_repo_uri = res["repositories"][0]["repositoryUri"]
            except ClientError:
                raise RuntimeError(f"ECR repository '{ecr_repo_name}' not found. Run without --skip-infra first.")

    # 2. Package and Deploy Backend
    api_url = ""
    if not args.skip_backend:
        logger.info("Phase 2: Backend Packaging & Lambda Deployment...")

        env_vars = {
            "DB_BACKEND": "dynamodb",
            "STORAGE_BACKEND": "s3",
            "DYNAMODB_TABLE_PREFIX": f"{table_prefix}_",
            "S3_BUCKET_NAME": storage_bucket,
            "AWS_REGION": args.region,
            "ENV": args.env,
            "JWT_SECRET": args.jwt_secret,
            "ALLOW_DEV_FALLBACK": "false",
        }

        # Optional Jev screening: only forwarded when configured, so default deploys are unchanged.
        jev_key = os.getenv("RADEXTRACT_JEV_API_KEY") or os.getenv("TYPESAFE_API_KEY")
        if jev_key:
            env_vars["RADEXTRACT_JEV_API_KEY"] = jev_key
            env_vars["RADEXTRACT_JEV_MODE"] = os.getenv("RADEXTRACT_JEV_MODE", "shadow")

        if args.container:
            # Container-based deployment (Antigravity SDK)
            if not args.gemini_api_key:
                logger.warning(
                    "No GEMINI_API_KEY provided. Agent endpoints will return 503. "
                    "Set --gemini-api-key or GEMINI_API_KEY env var."
                )
            env_vars["RADEXTRACT_ANTIGRAVITY_ENABLED"] = "true" if args.gemini_api_key else "false"
            env_vars["GEMINI_API_KEY"] = args.gemini_api_key
            env_vars["RADEXTRACT_ANTIGRAVITY_MODEL"] = "gemini-2.5-flash"

            ecr_image_uri = build_and_push_container_image(
                ecr_repo_uri=ecr_repo_uri,
                region=args.region,
            )

            lambda_arn = deploy_container_lambda(
                func_name=func_name,
                role_arn=role_arn,
                ecr_image_uri=ecr_image_uri,
                env_vars=env_vars,
                region=args.region,
                timeout=900,  # 15 min for agent endpoints
                memory_size=2048,
            )
        else:
            # ZIP-based deployment (no Antigravity SDK)
            pkg_script = ROOT_DIR / "deploy" / "lambda-package.py"
            subprocess.run([sys.executable, str(pkg_script)], check=True)

            zip_path = BUILD_DIR / "lambda-package.zip"
            lambda_arn = deploy_lambda_function(
                func_name=func_name,
                role_arn=role_arn,
                zip_path=zip_path,
                env_vars=env_vars,
                region=args.region,
            )

        api_url = ensure_api_gateway(
            api_name=api_name,
            lambda_arn=lambda_arn,
            region=args.region,
        )
    else:
        apigw = boto3.client("apigatewayv2", region_name=args.region)
        for api in apigw.get_apis().get("Items", []):
            if api["Name"] == api_name:
                api_url = f"https://{api['ApiId']}.execute-api.{args.region}.amazonaws.com"
                break

    # 3. Deploy Frontend
    if not args.skip_frontend:
        logger.info("Phase 3: Frontend Build & S3 Upload...")
        deploy_frontend(
            frontend_bucket=frontend_bucket,
            api_url=api_url,
            region=args.region,
        )

    logger.info("=" * 60)
    logger.info("Deployment Successfully Completed!")
    logger.info(f"API Gateway Endpoint: {api_url}")
    logger.info(f"Frontend S3 Website:  http://{frontend_bucket}.s3-website-{args.region}.amazonaws.com")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
