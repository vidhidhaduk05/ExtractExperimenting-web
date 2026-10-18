"""AWS Lambda handler for RadExtract FastAPI app using Mangum ASGI adapter."""
from __future__ import annotations

try:
    from mangum import Mangum
except ImportError:
    Mangum = None

from main import create_app

app = create_app()

if Mangum:
    handler = Mangum(app, lifespan="off")
else:
    def handler(event, context):
        raise RuntimeError("Mangum package is not installed. Install mangum to run on AWS Lambda.")
