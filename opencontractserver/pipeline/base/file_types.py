from enum import Enum

# Canonical mapping from MIME type strings to FileTypeEnum short labels.
# This is the single source of truth for MIME ↔ enum conversion.
MIME_TO_FILE_TYPE: dict[str, str] = {
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

# Reverse mapping: short label → MIME type
FILE_TYPE_TO_MIME: dict[str, str] = {v: k for k, v in MIME_TO_FILE_TYPE.items()}

# Human-readable labels for each file type
FILE_TYPE_LABELS: dict[str, str] = {
    "pdf": "PDF",
    "txt": "Plain Text",
    "docx": "Word Document",
}

# Legacy MIME type aliases that should be accepted as equivalent
LEGACY_MIME_ALIASES: dict[str, str] = {
    "application/txt": "text/plain",
}


class FileTypeEnum(str, Enum):
    PDF = "pdf"
    TXT = "txt"
    DOCX = "docx"
    # HTML = "html"  # Removed as we don't support it
    # Add more as needed

    @classmethod
    def from_mimetype(cls, mimetype: str) -> "FileTypeEnum | None":
        """
        Convert a MIME type to a FileTypeEnum.

        Args:
            mimetype: The MIME type to convert

        Returns:
            The corresponding FileTypeEnum, or None if not found
        """
        # Resolve legacy aliases first
        resolved = LEGACY_MIME_ALIASES.get(mimetype, mimetype)
        file_type_value = MIME_TO_FILE_TYPE.get(resolved)
        if file_type_value is None:
            return None
        return cls(file_type_value)

    @property
    def mimetype(self) -> str:
        """Return the canonical MIME type string for this file type."""
        return FILE_TYPE_TO_MIME[self.value]

    @property
    def label(self) -> str:
        """Return a human-readable label for this file type."""
        return FILE_TYPE_LABELS.get(self.value, self.value.upper())
