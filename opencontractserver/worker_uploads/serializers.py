import json

from rest_framework import serializers

from opencontractserver.worker_uploads.models import WorkerDocumentUpload


class WorkerDocumentUploadSerializer(serializers.Serializer):
    """
    Serializer for the multipart worker document upload endpoint.

    Expects:
    - file: the document file (PDF, etc.)
    - metadata: JSON string containing the WorkerDocumentUploadMetadataType payload
    """

    file = serializers.FileField(required=True)
    metadata = serializers.CharField(required=True)

    def validate_metadata(self, value):
        try:
            data = json.loads(value)
        except (json.JSONDecodeError, TypeError) as e:
            raise serializers.ValidationError(f"Invalid JSON in metadata: {e}")

        if not isinstance(data, dict):
            raise serializers.ValidationError("Metadata must be a JSON object.")

        required_fields = ["title", "content", "page_count", "pawls_file_content"]
        missing = [f for f in required_fields if f not in data]
        if missing:
            raise serializers.ValidationError(
                f"Missing required fields in metadata: {missing}"
            )

        if not isinstance(data["pawls_file_content"], list):
            raise serializers.ValidationError(
                "pawls_file_content must be a list of page objects."
            )

        # Validate embeddings structure if present
        embeddings = data.get("embeddings")
        if embeddings:
            if not isinstance(embeddings, dict):
                raise serializers.ValidationError("embeddings must be a JSON object.")
            if "embedder_path" not in embeddings:
                raise serializers.ValidationError(
                    "embeddings.embedder_path is required when providing embeddings."
                )
            doc_emb = embeddings.get("document_embedding")
            if doc_emb is not None and not isinstance(doc_emb, list):
                raise serializers.ValidationError(
                    "embeddings.document_embedding must be a list of floats."
                )
            annot_embs = embeddings.get("annotation_embeddings")
            if annot_embs is not None and not isinstance(annot_embs, dict):
                raise serializers.ValidationError(
                    "embeddings.annotation_embeddings must be a dict."
                )

        return data


class WorkerDocumentUploadStatusSerializer(serializers.ModelSerializer):
    """Read-only serializer for upload status responses."""

    upload_id = serializers.UUIDField(source="id", read_only=True)
    document_id = serializers.IntegerField(
        source="result_document_id", read_only=True, allow_null=True
    )

    class Meta:
        model = WorkerDocumentUpload
        fields = [
            "upload_id",
            "status",
            "corpus",
            "document_id",
            "error_message",
            "created",
            "processing_started",
            "processing_finished",
        ]
        read_only_fields = fields
