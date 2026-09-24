"""AWS Infrastructure provisioning script for RadExtract.

Provisions serverless AWS resources via boto3:
1. DynamoDB tables (PAY_PER_REQUEST billing) with GSIs.
2. S3 buckets (frontend hosting + document storage) with CORS configuration.
3. IAM execution role for Lambda with least-privilege policies.
4. API Gateway HTTP API (v2) with Lambda integration and CORS.
5. ECR repository for container-based Lambda (required for Antigravity SDK).
"""
from __future__ import annotations
import json
import logging
import time
from typing import Dict, Any, Optional

import boto3
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("radextract.deploy.infra")

TABLE_DEFINITIONS = [
    {
        "table_name": "users",
        "key_schema": [{"AttributeName": "user_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "user_id", "AttributeType": "S"},
            {"AttributeName": "username", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "username-index",
                "KeySchema": [{"AttributeName": "username", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "user_sessions",
        "key_schema": [{"AttributeName": "session_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "session_id", "AttributeType": "S"},
            {"AttributeName": "refresh_token", "AttributeType": "S"},
            {"AttributeName": "user_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "refresh_token-index",
                "KeySchema": [{"AttributeName": "refresh_token", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
            {
                "IndexName": "user_id-index",
                "KeySchema": [{"AttributeName": "user_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
    },
    {
        "table_name": "projects",
        "key_schema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
        "attribute_definitions": [{"AttributeName": "project_id", "AttributeType": "S"}],
    },
    {
        "table_name": "project_members",
        "key_schema": [{"AttributeName": "member_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "member_id", "AttributeType": "S"},
            {"AttributeName": "project_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "project_id-index",
                "KeySchema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "studies",
        "key_schema": [{"AttributeName": "study_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "study_id", "AttributeType": "S"},
            {"AttributeName": "project_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "project_id-index",
                "KeySchema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "variables",
        "key_schema": [{"AttributeName": "variable_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "variable_id", "AttributeType": "S"},
            {"AttributeName": "project_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "project_id-index",
                "KeySchema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "extractions",
        "key_schema": [{"AttributeName": "extraction_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "extraction_id", "AttributeType": "S"},
            {"AttributeName": "study_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "study_id-index",
                "KeySchema": [{"AttributeName": "study_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "screening_decisions",
        "key_schema": [{"AttributeName": "decision_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "decision_id", "AttributeType": "S"},
            {"AttributeName": "project_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "project_id-index",
                "KeySchema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "screening_conflicts",
        "key_schema": [{"AttributeName": "conflict_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "conflict_id", "AttributeType": "S"},
            {"AttributeName": "project_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "project_id-index",
                "KeySchema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "meta_analyses",
        "key_schema": [{"AttributeName": "meta_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "meta_id", "AttributeType": "S"},
            {"AttributeName": "project_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "project_id-index",
                "KeySchema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "meta_analysis_studies",
        "key_schema": [{"AttributeName": "meta_study_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "meta_study_id", "AttributeType": "S"},
            {"AttributeName": "meta_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "meta_id-index",
                "KeySchema": [{"AttributeName": "meta_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "rob_assessments",
        "key_schema": [{"AttributeName": "assessment_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "assessment_id", "AttributeType": "S"},
            {"AttributeName": "project_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "project_id-index",
                "KeySchema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "grade_assessments",
        "key_schema": [{"AttributeName": "grade_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "grade_id", "AttributeType": "S"},
            {"AttributeName": "project_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "project_id-index",
                "KeySchema": [{"AttributeName": "project_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
    {
        "table_name": "pdf_documents",
        "key_schema": [{"AttributeName": "doc_id", "KeyType": "HASH"}],
        "attribute_definitions": [
            {"AttributeName": "doc_id", "AttributeType": "S"},
            {"AttributeName": "study_id", "AttributeType": "S"},
        ],
        "global_secondary_indexes": [
            {
                "IndexName": "study_id-index",
                "KeySchema": [{"AttributeName": "study_id", "KeyType": "HASH"}],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
    },
]


def ensure_dynamodb_tables(prefix: str = "radextract", region: str = "us-east-1", endpoint_url: Optional[str] = None):
    """Create DynamoDB tables if they do not exist."""
    client = boto3.client("dynamodb", region_name=region, endpoint_url=endpoint_url)
    existing_tables = client.list_tables().get("TableNames", [])

    for table in TABLE_DEFINITIONS:
        full_name = f"{prefix}_{table['table_name']}" if prefix else table["table_name"]
        if full_name in existing_tables:
            logger.info(f"DynamoDB table '{full_name}' already exists.")
            continue

        logger.info(f"Creating DynamoDB table '{full_name}'...")
        kwargs: Dict[str, Any] = {
            "TableName": full_name,
            "KeySchema": table["key_schema"],
            "AttributeDefinitions": table["attribute_definitions"],
            "BillingMode": "PAY_PER_REQUEST",
        }
        if "global_secondary_indexes" in table:
            kwargs["GlobalSecondaryIndexes"] = table["global_secondary_indexes"]

        client.create_table(**kwargs)
        logger.info(f"Created table '{full_name}'.")


def ensure_s3_buckets(storage_bucket: str, frontend_bucket: str, region: str = "us-east-1", endpoint_url: Optional[str] = None):
    """Create S3 storage and frontend buckets with CORS and public website config."""
    s3 = boto3.client("s3", region_name=region, endpoint_url=endpoint_url)

    for bucket in [storage_bucket, frontend_bucket]:
        try:
            if region == "us-east-1":
                s3.create_bucket(Bucket=bucket)
            else:
                s3.create_bucket(
                    Bucket=bucket,
                    CreateBucketConfiguration={"LocationConstraint": region},
                )
            logger.info(f"Created S3 bucket '{bucket}'.")
        except ClientError as e:
            if e.response["Error"]["Code"] in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                logger.info(f"S3 bucket '{bucket}' already exists.")
            else:
                raise

    # Configure CORS on storage bucket
    cors_configuration = {
        "CORSRules": [
            {
                "AllowedHeaders": ["*"],
                "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
                "AllowedOrigins": ["*"],
                "MaxAgeSeconds": 3000,
            }
        ]
    }
    s3.put_bucket_cors(Bucket=storage_bucket, CORSConfiguration=cors_configuration)
    logger.info(f"Configured CORS for storage bucket '{storage_bucket}'.")


def ensure_lambda_role(role_name: str = "radextract-lambda-exec-role", region: str = "us-east-1") -> str:
    """Create IAM role for Lambda execution."""
    iam = boto3.client("iam", region_name=region)
    assume_role_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole",
            }
        ],
    }

    try:
        res = iam.get_role(RoleName=role_name)
        logger.info(f"IAM role '{role_name}' already exists.")
        return res["Role"]["Arn"]
    except ClientError as e:
        if e.response["Error"]["Code"] != "NoSuchEntity":
            raise

    logger.info(f"Creating IAM role '{role_name}'...")
    res = iam.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=json.dumps(assume_role_policy),
        Description="Execution role for RadExtract backend Lambda function",
    )
    role_arn = res["Role"]["Arn"]

    # Attach basic execution and DynamoDB/S3 access
    policies = [
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
        "arn:aws:iam::aws:policy/AmazonS3FullAccess",
    ]
    for p in policies:
        iam.attach_role_policy(RoleName=role_name, PolicyArn=p)
        logger.info(f"Attached policy '{p}' to '{role_name}'.")

    # Give AWS time to propagate IAM role
    time.sleep(5)
    return role_arn


def ensure_api_gateway(
    api_name: str,
    lambda_arn: str,
    region: str = "us-east-1",
) -> str:
    """Create or update API Gateway HTTP API (v2) integrating with Lambda."""
    apigw = boto3.client("apigatewayv2", region_name=region)

    apis = apigw.get_apis().get("Items", [])
    api_id = None
    for api in apis:
        if api["Name"] == api_name:
            api_id = api["ApiId"]
            logger.info(f"API Gateway '{api_name}' already exists (ID: {api_id}).")
            break

    if not api_id:
        logger.info(f"Creating API Gateway HTTP API '{api_name}'...")
        res = apigw.create_api(
            Name=api_name,
            ProtocolType="HTTP",
            CorsConfiguration={
                "AllowHeaders": ["*"],
                "AllowMethods": ["*"],
                "AllowOrigins": ["*"],
                "AllowCredentials": True,
            },
        )
        api_id = res["ApiId"]

    # Create Lambda Integration
    integrations = apigw.get_integrations(ApiId=api_id).get("Items", [])
    integration_id = integrations[0]["IntegrationId"] if integrations else None

    if not integration_id:
        logger.info("Creating Lambda proxy integration...")
        int_res = apigw.create_integration(
            ApiId=api_id,
            IntegrationType="AWS_PROXY",
            IntegrationUri=lambda_arn,
            PayloadFormatVersion="2.0",
        )
        integration_id = int_res["IntegrationId"]

    # Create default catch-all route ($default)
    routes = apigw.get_routes(ApiId=api_id).get("Items", [])
    has_default = any(r.get("RouteKey") == "$default" for r in routes)
    if not has_default:
        logger.info("Creating $default catch-all route...")
        apigw.create_route(
            ApiId=api_id,
            RouteKey="$default",
            Target=f"integrations/{integration_id}",
        )

    # Create auto-deploy $default stage
    stages = apigw.get_stages(ApiId=api_id).get("Items", [])
    has_stage = any(s.get("StageName") == "$default" for s in stages)
    if not has_stage:
        logger.info("Creating $default stage with auto-deploy...")
        apigw.create_stage(
            ApiId=api_id,
            StageName="$default",
            AutoDeploy=True,
        )

    # Add Lambda resource-based permission for API Gateway invocation
    lambda_client = boto3.client("lambda", region_name=region)
    func_name = lambda_arn.split(":")[-1]
    statement_id = f"apigw-{api_id}-permission"
    try:
        lambda_client.add_permission(
            FunctionName=func_name,
            StatementId=statement_id,
            Action="lambda:InvokeFunction",
            Principal="apigateway.amazonaws.com",
            SourceArn=f"arn:aws:execute-api:{region}:*:{api_id}/*",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceConflictException":
            logger.warning(f"Lambda permission warning: {e}")

    api_endpoint = f"https://{api_id}.execute-api.{region}.amazonaws.com"
    logger.info(f"API Gateway HTTP API deployed at: {api_endpoint}")
    return api_endpoint


def ensure_ecr_repository(
    repository_name: str = "radextract-lambda",
    region: str = "us-east-1",
) -> str:
    """Create an ECR repository for container-based Lambda images.

    Required when using the Antigravity SDK, which includes a compiled Go
    binary that exceeds the 250MB ZIP Lambda limit.

    Returns:
        The ECR repository URI.
    """
    ecr = boto3.client("ecr", region_name=region)

    try:
        res = ecr.describe_repositories(repositoryNames=[repository_name])
        repo_uri = res["repositories"][0]["repositoryUri"]
        logger.info(f"ECR repository '{repository_name}' already exists: {repo_uri}")
        return repo_uri
    except ClientError as e:
        if e.response["Error"]["Code"] != "RepositoryNotFoundException":
            raise

    logger.info(f"Creating ECR repository '{repository_name}'...")
    res = ecr.create_repository(
        repositoryName=repository_name,
        imageScanningConfiguration={"scanOnPush": True},
        encryptionConfiguration={"encryptionType": "AES256"},
    )
    repo_uri = res["repository"]["repositoryUri"]
    logger.info(f"Created ECR repository: {repo_uri}")
    return repo_uri


def deploy_container_lambda(
    func_name: str,
    role_arn: str,
    ecr_image_uri: str,
    env_vars: dict,
    region: str = "us-east-1",
    timeout: int = 900,
    memory_size: int = 2048,
) -> str:
    """Create or update a container-based Lambda function from an ECR image.

    Container-based Lambda is required for the Antigravity SDK (compiled Go
    binary). Uses increased timeout (900s) and memory (2048MB) for agent
    endpoints that make multiple LLM calls per study.

    Args:
        func_name: Lambda function name.
        role_arn: IAM execution role ARN.
        ecr_image_uri: Full ECR image URI (account.dkr.ecr.region.amazonaws.com/repo:tag).
        env_vars: Environment variables dict.
        region: AWS region.
        timeout: Lambda timeout in seconds (default 900 for agent endpoints).
        memory_size: Lambda memory in MB (default 2048).

    Returns:
        The Lambda function ARN.
    """
    client = boto3.client("lambda", region_name=region)

    try:
        client.get_function(FunctionName=func_name)
        logger.info(f"Updating container image for existing Lambda '{func_name}'...")
        client.update_function_code(
            FunctionName=func_name,
            ImageUri=ecr_image_uri,
        )
        logger.info(f"Updating configuration for '{func_name}'...")
        res = client.update_function_configuration(
            FunctionName=func_name,
            Role=role_arn,
            Timeout=timeout,
            MemorySize=memory_size,
            Environment={"Variables": env_vars},
        )
        return res["FunctionArn"]
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise

    logger.info(f"Creating container-based Lambda '{func_name}'...")
    res = client.create_function(
        FunctionName=func_name,
        Role=role_arn,
        PackageType="Image",
        Code={"ImageUri": ecr_image_uri},
        Timeout=timeout,
        MemorySize=memory_size,
        Environment={"Variables": env_vars},
    )
    return res["FunctionArn"]
