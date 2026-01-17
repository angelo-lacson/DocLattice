"""REST API views for annotation endpoints."""

import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from opencontractserver.llms.tools.image_tools import (
    get_annotation_images_with_permission,
)

logger = logging.getLogger(__name__)


class AnnotationImagesThrottle(UserRateThrottle):
    """Rate limiting for annotation image retrieval endpoint."""

    scope = "annotation_images"


class AnnotationImagesView(APIView):
    """
    REST endpoint to fetch image data for an annotation.

    GET /api/annotations/<annotation_id>/images/

    Returns JSON with base64-encoded images for the specified annotation.
    Uses get_annotation_images_with_permission() which:
    - Verifies user has READ permission on annotation's document
    - Returns empty array for unauthorized/missing (IDOR protection)

    Rate limited to 200 requests/hour per user to prevent resource exhaustion.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [AnnotationImagesThrottle]

    def get(self, request, annotation_id):
        """
        Fetch all images referenced by an annotation.

        Args:
            request: Django request object
            annotation_id: ID of the annotation

        Returns:
            JSON response with images array containing base64 data
        """
        try:
            images = get_annotation_images_with_permission(
                user=request.user, annotation_id=annotation_id
            )

            # Convert ImageData Pydantic models to dicts for JSON serialization
            images_data = [
                {
                    "base64_data": img.base64_data,
                    "format": img.format,
                    "data_url": img.data_url,
                    "page_index": img.page_index,
                    "token_index": img.token_index,
                }
                for img in images
            ]

            return Response(
                {
                    "annotation_id": str(annotation_id),
                    "images": images_data,
                    "count": len(images_data),
                },
                status=status.HTTP_200_OK,
            )

        except Exception:
            # Log with full traceback for debugging, but don't expose details to client
            logger.exception(
                f"Unexpected error fetching annotation images for annotation_id={annotation_id}"
            )
            # Return empty array for any error (IDOR protection)
            # Same response for missing, unauthorized, or unexpected errors
            return Response(
                {"annotation_id": str(annotation_id), "images": [], "count": 0},
                status=status.HTTP_200_OK,
            )
