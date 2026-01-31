"""
Constants for document processing pipeline.
"""

# Default path prefix for documents uploaded without explicit path
# Used when generating document paths in corpus operations
DEFAULT_DOCUMENT_PATH_PREFIX = "/documents"

# Default batch size for embedding generation tasks
# Controls how many annotations are processed per Celery task to prevent queue flooding
EMBEDDING_BATCH_SIZE = 100

# Maximum length for error message stored on Document.processing_error
MAX_PROCESSING_ERROR_LENGTH = 5000

# Maximum length for traceback stored on Document.processing_error_traceback
MAX_PROCESSING_TRACEBACK_LENGTH = 10000

# Maximum length for error message in GraphQL display (UI truncation)
MAX_PROCESSING_ERROR_DISPLAY_LENGTH = 500
