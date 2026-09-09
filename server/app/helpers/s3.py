"""Thin S3/MinIO wrapper for generated exports and raw Feishu snapshots."""

import logging
import os
from io import BytesIO
from typing import Optional
from urllib.parse import quote

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "smc")
S3_ENDPOINT_URL = os.environ.get("S3_ENDPOINT_URL") or None
S3_PUBLIC_ENDPOINT_URL = os.environ.get("S3_PUBLIC_ENDPOINT_URL") or S3_ENDPOINT_URL
S3_PUBLIC_BASE_URL = os.environ.get("S3_PUBLIC_BASE_URL") or S3_PUBLIC_ENDPOINT_URL
S3_ADDRESSING_STYLE = os.environ.get("S3_ADDRESSING_STYLE", "path")


class S3Service:
    """Upload and read objects in the project's MinIO bucket."""

    def __init__(self):
        client_options = {
            "aws_access_key_id": AWS_ACCESS_KEY_ID,
            "aws_secret_access_key": AWS_SECRET_ACCESS_KEY,
            "region_name": AWS_REGION,
            "config": Config(s3={"addressing_style": S3_ADDRESSING_STYLE}),
        }
        self.s3_client = boto3.client("s3", endpoint_url=S3_ENDPOINT_URL, **client_options)  # type: ignore
        self.public_s3_client = boto3.client(
            "s3", endpoint_url=S3_PUBLIC_ENDPOINT_URL, **client_options  # type: ignore
        )
        self.bucket_name = S3_BUCKET_NAME
        self.public_base_url = (S3_PUBLIC_BASE_URL or "").rstrip("/")

    def build_public_url(self, object_key: str) -> str:
        if self.public_base_url:
            return f"{self.public_base_url}/{quote(object_key, safe='/')}"
        return self.s3_client.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket_name, "Key": object_key}
        )

    def upload_bytes(
        self, data: BytesIO, object_key: str, content_type: str
    ) -> tuple[str, str]:
        """Store raw bytes and return the object key plus its public URL."""
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=object_key,
                Body=data,
                ContentType=content_type,
            )
        except ClientError as e:
            logger.error(f"Error uploading {object_key} to S3: {e}")
            raise ValueError("Failed to upload file to S3")
        return object_key, self.build_public_url(object_key)

    def download_bytes(self, object_key: str) -> bytes:
        try:
            response = self.s3_client.get_object(Bucket=self.bucket_name, Key=object_key)
            body = response.get("Body")
            if body is None:
                raise ValueError(f"S3 object {object_key} has no body")
            return body.read()
        except ClientError as e:
            logger.error(f"Error downloading {object_key} from S3: {e}")
            raise ValueError(f"Failed to download file from S3: {object_key}") from e

    def generate_presigned_url(
        self, object_key: str, expiration: int = 86400
    ) -> Optional[str]:
        try:
            return self.public_s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket_name, "Key": object_key},
                ExpiresIn=expiration,
            )
        except ClientError as e:
            logger.error(f"Error generating presigned URL: {e}")
            return None


s3_service = S3Service()
