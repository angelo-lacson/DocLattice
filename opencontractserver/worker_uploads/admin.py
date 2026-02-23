from django.contrib import admin

from opencontractserver.worker_uploads.models import (
    CorpusAccessToken,
    WorkerAccount,
    WorkerDocumentUpload,
)


@admin.register(WorkerAccount)
class WorkerAccountAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "user", "creator", "created")
    list_filter = ("is_active",)
    search_fields = ("name", "user__username")
    readonly_fields = ("created", "modified")
    raw_id_fields = ("user", "creator")


@admin.register(CorpusAccessToken)
class CorpusAccessTokenAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "worker_account",
        "corpus",
        "is_active",
        "expires_at",
        "rate_limit_per_minute",
        "created",
    )
    list_filter = ("is_active",)
    search_fields = ("worker_account__name",)
    readonly_fields = ("key", "created", "modified")
    raw_id_fields = ("worker_account", "corpus")


@admin.register(WorkerDocumentUpload)
class WorkerDocumentUploadAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "corpus",
        "status",
        "created",
        "processing_started",
        "processing_finished",
    )
    list_filter = ("status",)
    search_fields = ("id",)
    readonly_fields = (
        "id",
        "created",
        "processing_started",
        "processing_finished",
    )
    raw_id_fields = ("corpus_access_token", "corpus", "result_document")
