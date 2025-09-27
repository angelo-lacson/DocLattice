"""
Enhanced storage backends with connection pooling and caching.
"""
import threading
from functools import lru_cache
from storages.backends.s3boto3 import S3Boto3Storage as BaseS3Storage
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# Thread-local storage for boto3 clients
_thread_local = threading.local()


class PooledS3Boto3Storage(BaseS3Storage):
    """
    S3 storage with connection pooling and client reuse.

    This significantly improves performance by:
    1. Reusing boto3 S3 clients across requests
    2. Maintaining a connection pool
    3. Caching URL generation parameters
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Set connection pool size from settings
        self.config = {
            'max_pool_connections': getattr(settings, 'AWS_S3_CONNECTION_POOL_SIZE', 10),
            'region_name': self.region_name,
        }
        logger.info(f"Initializing S3 storage with connection pool size: {self.config['max_pool_connections']}")

    @property
    def connection(self):
        """
        Get or create a cached boto3 S3 client with connection pooling.

        This overrides the parent's connection property to:
        1. Reuse the same client within a thread
        2. Configure connection pooling
        """
        # Check if we already have a client for this thread
        if not hasattr(_thread_local, 's3_connection'):
            import boto3
            from botocore.config import Config

            # Create boto3 config with connection pooling
            boto_config = Config(
                max_pool_connections=self.config['max_pool_connections'],
                # Also set retries for resilience
                retries={
                    'max_attempts': 3,
                    'mode': 'adaptive'
                }
            )

            # Create the S3 client with pooling config
            session = boto3.Session()
            _thread_local.s3_connection = session.client(
                's3',
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                aws_session_token=self.security_token,
                region_name=self.config['region_name'],
                use_ssl=self.use_ssl,
                endpoint_url=self.endpoint_url,
                config=boto_config,  # Use our pooling config
            )
            logger.debug("Created new S3 client with connection pooling")

        return _thread_local.s3_connection

    def _get_key(self, name):
        """Get the S3 key for the given file name."""
        # Use parent class method to clean and normalize the name
        name = super()._normalize_name(name)
        return name

    @lru_cache(maxsize=1024)
    def _get_url_params_cached(self, name):
        """
        Cache URL generation parameters that don't change often.
        This avoids recalculating the same values repeatedly.
        """
        return {
            'Bucket': self.bucket_name,
            'Key': self._get_key(name)
        }

    def url(self, name, parameters=None, expire=None, http_method=None):
        """
        Generate presigned URL with optimizations.
        """
        # For non-S3 custom domains, use parent implementation
        if self.custom_domain:
            return super().url(name, parameters, expire, http_method)

        # Use cached parameters for common case
        if not parameters and not http_method:
            params = self._get_url_params_cached(name)

            # Use the pooled connection to generate URL
            return self.connection.generate_presigned_url(
                'get_object',
                Params=params,
                ExpiresIn=expire or self.querystring_expire,
            )

        # Fall back to parent for complex cases
        return super().url(name, parameters, expire, http_method)


class PooledMediaRootS3Storage(PooledS3Boto3Storage):
    """Media files storage with connection pooling."""
    location = "media"
    file_overwrite = False


class PooledStaticRootS3Storage(PooledS3Boto3Storage):
    """Static files storage with connection pooling."""
    location = "static"
    default_acl = "public-read"