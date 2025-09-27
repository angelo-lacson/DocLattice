"""
Optimized storage backends that reuse SDK clients as per AWS best practices.
"""
import threading
from storages.backends.s3boto3 import S3Boto3Storage as BaseS3Storage
from django.conf import settings

# Thread-safe client storage
_storage_clients = threading.local()


class OptimizedS3Boto3Storage(BaseS3Storage):
    """
    Optimized S3 storage that reuses boto3 client for better performance.

    Key optimization: Reuses the same S3 client across multiple operations
    as recommended by AWS for performance.
    """

    @property
    def connection(self):
        """
        Reuse S3 client connection instead of creating new ones.
        Thread-safe implementation using thread locals.
        """
        # Check if we already have a client for this thread
        if not hasattr(_storage_clients, 's3_client'):
            # Create client once per thread
            _storage_clients.s3_client = super().connection

        return _storage_clients.s3_client


class OptimizedMediaRootS3Storage(OptimizedS3Boto3Storage):
    """Optimized S3 storage for media files."""
    location = "media"
    file_overwrite = False


class OptimizedStaticRootS3Storage(OptimizedS3Boto3Storage):
    """Optimized S3 storage for static files."""
    location = "static"
    default_acl = "public-read"


# Similarly for GCS if needed
try:
    from storages.backends.gcloud import GoogleCloudStorage as BaseGCSStorage

    class OptimizedGoogleCloudStorage(BaseGCSStorage):
        """
        Optimized GCS storage that reuses client for better performance.
        """

        @property
        def client(self):
            """Reuse GCS client connection."""
            if not hasattr(_storage_clients, 'gcs_client'):
                _storage_clients.gcs_client = super().client
            return _storage_clients.gcs_client


    class OptimizedMediaRootGCSStorage(OptimizedGoogleCloudStorage):
        """Optimized GCS storage for media files."""
        location = "media"
        file_overwrite = False


    class OptimizedStaticRootGCSStorage(OptimizedGoogleCloudStorage):
        """Optimized GCS storage for static files."""
        location = "static"
        default_acl = "publicRead"

except ImportError:
    # GCS not available
    pass