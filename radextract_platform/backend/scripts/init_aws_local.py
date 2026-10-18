"""Initialize AWS resources against LocalStack (no Docker)."""
import os
import sys
from pathlib import Path
import boto3

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from config import settings

ENDPOINT = os.getenv("RADEXTRACT_AWS_ENDPOINT_URL", "http://localhost:4566")
REGION = os.getenv("RADEXTRACT_AWS_REGION", "us-east-1")
KEY = os.getenv("RADEXTRACT_AWS_ACCESS_KEY_ID", "test")
SECRET = os.getenv("RADEXTRACT_AWS_SECRET_ACCESS_KEY", "test")


def init_s3():
    s3 = boto3.client(
        "s3",
        endpoint_url=ENDPOINT,
        region_name=REGION,
        aws_access_key_id=KEY,
        aws_secret_access_key=SECRET,
    )
    for bucket in [settings.s3_pdf_bucket, settings.s3_export_bucket, "radextract-frontend"]:
        try:
            s3.create_bucket(Bucket=bucket)
            print(f"Created S3 bucket: {bucket}")
        except Exception as e:
            if "BucketAlreadyOwnedByYou" in str(e) or "BucketAlreadyExists" in str(e):
                print(f"S3 bucket already exists: {bucket}")
            else:
                print(f"Note on S3 bucket {bucket}: {e}")


def init_dynamodb():
    from services.db_backend import init_dynamodb_tables
    settings.aws_endpoint_url = ENDPOINT
    settings.db_backend = "dynamodb"
    try:
        init_dynamodb_tables()
        print("DynamoDB tables initialized successfully.")
    except Exception as e:
        print(f"Note on DynamoDB table init: {e}")


if __name__ == "__main__":
    print(f"Connecting to LocalStack at {ENDPOINT} (region: {REGION})...")
    init_s3()
    if os.getenv("RADEXTRACT_DB_BACKEND") == "dynamodb" or "--dynamodb" in sys.argv:
        init_dynamodb()
    print("Local AWS resource initialization complete.")
