import secrets
import uuid

from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone

from opencontractserver.shared.utils import calc_oc_file_path

User = get_user_model()

TOKEN_KEY_LENGTH = 64  # 256-bit random hex token


def _generate_token_key() -> str:
    return secrets.token_hex(TOKEN_KEY_LENGTH // 2)


def _upload_staging_path(instance, filename):
    return calc_oc_file_path(instance, filename, "worker_uploads/staging/")


class WorkerAccount(models.Model):
    """
    Service account for external document processing workers.

    Each WorkerAccount has an auto-created Django User for permission
    compatibility with the existing guardian-based permission system.
    The linked User is created with an unusable password and is_staff=False.
    """

    name = models.CharField(
        max_length=255,
        unique=True,
        help_text="Human-readable name for this worker account.",
    )
    description = models.TextField(
        blank=True,
        default="",
        help_text="Description of what this worker does.",
    )
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="worker_account",
        help_text="Auto-created Django User for permission compatibility.",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Inactive accounts cannot authenticate.",
    )
    creator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_worker_accounts",
        help_text="Admin who created this worker account.",
    )
    created = models.DateTimeField(default=timezone.now, db_index=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["is_active"]),
        ]

    def __str__(self):
        status = "active" if self.is_active else "inactive"
        return f"WorkerAccount({self.name}, {status})"

    @classmethod
    def create_with_user(cls, *, name: str, description: str = "", creator=None):
        """
        Create a WorkerAccount with an auto-generated Django User.

        The User is created with:
        - username: worker_<uuid> (guaranteed unique)
        - unusable password (no login possible)
        - is_staff=False, is_superuser=False
        """
        username = f"worker_{uuid.uuid4().hex[:12]}"
        user = User.objects.create_user(
            username=username,
            email=f"{username}@workers.internal",
            password=None,  # create_user(password=None) sets unusable password
            is_staff=False,
            is_superuser=False,
        )

        return cls.objects.create(
            name=name,
            description=description,
            user=user,
            creator=creator,
        )


class CorpusAccessToken(models.Model):
    """
    Scoped access token granting a WorkerAccount upload access to a specific corpus.

    Tokens are long-lived (configurable expiry) and can be revoked individually.
    Each token is scoped to exactly one corpus. Create multiple tokens for
    multi-corpus access.
    """

    # Stored in plaintext for simplicity. A hashed-token approach (store only
    # SHA-256, show full key once at creation) would improve defense-in-depth
    # against database breaches. Tracked as a follow-up improvement.
    key = models.CharField(
        max_length=TOKEN_KEY_LENGTH,
        unique=True,
        db_index=True,
        default=_generate_token_key,
        help_text="Cryptographically random access token.",
    )
    worker_account = models.ForeignKey(
        WorkerAccount,
        on_delete=models.CASCADE,
        related_name="access_tokens",
        help_text="Worker account this token belongs to.",
    )
    corpus = models.ForeignKey(
        "corpuses.Corpus",
        on_delete=models.CASCADE,
        related_name="worker_access_tokens",
        help_text="Corpus this token grants upload access to.",
    )
    expires_at = models.DateTimeField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Token expiry. Null means no expiry.",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Revoked tokens have is_active=False.",
    )
    rate_limit_per_minute = models.PositiveIntegerField(
        default=0,
        help_text="Max uploads per minute. 0 means unlimited.",
    )
    created = models.DateTimeField(default=timezone.now, db_index=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created"]
        indexes = [
            models.Index(fields=["worker_account", "corpus"]),
            models.Index(fields=["is_active", "expires_at"]),
        ]

    def __str__(self):
        status = "active" if self.is_active else "revoked"
        return f"CorpusAccessToken(worker={self.worker_account.name}, corpus={self.corpus_id}, {status})"

    @property
    def is_valid(self) -> bool:
        """
        Check if token is currently valid (active, not expired, account active).

        Note: accesses self.worker_account.is_active. The auth backend
        (WorkerTokenAuthentication) uses select_related("worker_account") so
        this is already cached on the request path. If calling is_valid outside
        the auth flow, ensure worker_account is prefetched to avoid an extra query.
        """
        if not self.is_active:
            return False
        if not self.worker_account.is_active:
            return False
        if self.expires_at and timezone.now() >= self.expires_at:
            return False
        return True


class UploadStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PROCESSING = "PROCESSING", "Processing"
    COMPLETED = "COMPLETED", "Completed"
    FAILED = "FAILED", "Failed"


class WorkerDocumentUpload(models.Model):
    """
    Staging table for worker document uploads.

    Uploads are written here by the REST endpoint and drained by a batch
    processor Celery task. This database-backed queue avoids Redis saturation
    when handling millions of uploads.

    The batch processor uses SELECT ... FOR UPDATE SKIP LOCKED to allow
    concurrent processing without conflicts.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )
    corpus_access_token = models.ForeignKey(
        CorpusAccessToken,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploads",
        help_text="Token used for this upload.",
    )
    corpus = models.ForeignKey(
        "corpuses.Corpus",
        on_delete=models.CASCADE,
        related_name="worker_uploads",
        help_text="Target corpus for this upload.",
    )
    status = models.CharField(
        max_length=20,
        choices=UploadStatus.choices,
        default=UploadStatus.PENDING,
        db_index=True,
    )
    file = models.FileField(
        upload_to=_upload_staging_path,
        help_text="The uploaded document file.",
    )
    metadata = models.JSONField(
        default=dict,
        help_text="JSON payload with annotations, embeddings, labels, and target path.",
    )
    error_message = models.TextField(
        blank=True,
        default="",
        help_text="Error details if processing failed.",
    )
    result_document = models.ForeignKey(
        "documents.Document",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="worker_upload_records",
        help_text="The Document created after successful processing.",
    )
    created = models.DateTimeField(default=timezone.now, db_index=True)
    processing_started = models.DateTimeField(null=True, blank=True)
    processing_finished = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created"]
        indexes = [
            models.Index(fields=["status", "created"]),
            models.Index(fields=["corpus", "status"]),
            models.Index(fields=["corpus_access_token"]),
        ]

    def __str__(self):
        return f"WorkerDocumentUpload({self.id}, {self.status})"
