from django.urls import path

from opencontractserver.worker_uploads.views import (
    WorkerDocumentUploadListView,
    WorkerDocumentUploadStatusView,
    WorkerDocumentUploadView,
)

app_name = "worker_uploads"

urlpatterns = [
    path(
        "documents/",
        WorkerDocumentUploadView.as_view(),
        name="upload",
    ),
    path(
        "documents/list/",
        WorkerDocumentUploadListView.as_view(),
        name="list",
    ),
    path(
        "documents/<uuid:upload_id>/",
        WorkerDocumentUploadStatusView.as_view(),
        name="status",
    ),
]
