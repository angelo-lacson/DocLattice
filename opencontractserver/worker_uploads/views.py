"""
REST API views for worker document uploads.

POST /api/worker-uploads/documents/     — submit a new document upload
GET  /api/worker-uploads/documents/     — list uploads for the authenticated token
GET  /api/worker-uploads/documents/<id> — check status of a specific upload
"""

import logging

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from opencontractserver.worker_uploads.auth import WorkerTokenAuthentication
from opencontractserver.worker_uploads.models import (
    CorpusAccessToken,
    UploadStatus,
    WorkerDocumentUpload,
)
from opencontractserver.worker_uploads.serializers import (
    WorkerDocumentUploadSerializer,
    WorkerDocumentUploadStatusSerializer,
)

logger = logging.getLogger(__name__)


class IsValidWorkerToken(permissions.BasePermission):
    """Ensure request.auth is a valid CorpusAccessToken."""

    def has_permission(self, request, view):
        return isinstance(request.auth, CorpusAccessToken) and request.auth.is_valid


class WorkerDocumentUploadView(APIView):
    """
    Accept a single-document upload from an external worker.

    The document and metadata are staged in the database for asynchronous
    processing by the batch drain task. Returns 202 Accepted immediately.

    Rate limiting is enforced per-token if configured.
    """

    authentication_classes = [WorkerTokenAuthentication]
    permission_classes = [IsValidWorkerToken]
    parser_classes = [MultiPartParser]

    def post(self, request):
        token: CorpusAccessToken = request.auth

        # Enforce per-token rate limit
        if token.rate_limit_per_minute > 0:
            window_start = timezone.now() - timezone.timedelta(minutes=1)
            recent_count = WorkerDocumentUpload.objects.filter(
                corpus_access_token=token,
                created__gte=window_start,
            ).count()
            if recent_count >= token.rate_limit_per_minute:
                return Response(
                    {
                        "error": "Rate limit exceeded.",
                        "detail": (
                            f"Token allows {token.rate_limit_per_minute} "
                            f"uploads per minute."
                        ),
                    },
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

        serializer = WorkerDocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        upload = WorkerDocumentUpload.objects.create(
            corpus_access_token=token,
            corpus=token.corpus,
            file=serializer.validated_data["file"],
            metadata=serializer.validated_data["metadata"],
            status=UploadStatus.PENDING,
        )

        logger.info(
            f"Worker upload staged: {upload.id} for corpus {token.corpus_id} "
            f"(token={token.id}, worker={token.worker_account.name})"
        )

        # Trigger the batch processor if not already running.
        # This is a lightweight nudge — the processor is also scheduled via Beat.
        from opencontractserver.worker_uploads.tasks import process_pending_uploads

        process_pending_uploads.apply_async(
            queue="worker_uploads",
            ignore_result=True,
        )

        response_serializer = WorkerDocumentUploadStatusSerializer(upload)
        return Response(response_serializer.data, status=status.HTTP_202_ACCEPTED)


class WorkerDocumentUploadStatusView(RetrieveAPIView):
    """Check the status of a specific upload."""

    authentication_classes = [WorkerTokenAuthentication]
    permission_classes = [IsValidWorkerToken]
    serializer_class = WorkerDocumentUploadStatusSerializer
    lookup_field = "id"
    lookup_url_kwarg = "upload_id"

    def get_queryset(self):
        token: CorpusAccessToken = self.request.auth
        return WorkerDocumentUpload.objects.filter(corpus_access_token=token)


class WorkerDocumentUploadListView(ListAPIView):
    """List uploads for the authenticated token (paginated)."""

    authentication_classes = [WorkerTokenAuthentication]
    permission_classes = [IsValidWorkerToken]
    serializer_class = WorkerDocumentUploadStatusSerializer

    def get_queryset(self):
        token: CorpusAccessToken = self.request.auth
        qs = WorkerDocumentUpload.objects.filter(corpus_access_token=token)

        # Optional status filter
        status_filter = self.request.query_params.get("status")
        if status_filter and status_filter in UploadStatus.values:
            qs = qs.filter(status=status_filter)

        return qs.order_by("-created")
