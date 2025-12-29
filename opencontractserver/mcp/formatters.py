"""Response formatters for MCP resources and tools."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from opencontractserver.annotations.models import Annotation
    from opencontractserver.conversations.models import ChatMessage, Conversation
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document


def format_corpus_summary(corpus: Corpus) -> dict:
    """Format a corpus for list display."""
    return {
        "slug": corpus.slug,
        "title": corpus.title,
        "description": corpus.description or "",
        "document_count": (
            corpus.document_count() if hasattr(corpus, "document_count") else 0
        ),
        "created": corpus.created.isoformat() if corpus.created else None,
    }


def format_document_summary(document: Document) -> dict:
    """Format a document for list display."""
    return {
        "slug": document.slug,
        "title": document.title or "",
        "description": document.description or "",
        "page_count": document.page_count or 0,
        "file_type": document.file_type or "unknown",
        "created": document.created.isoformat() if document.created else None,
    }


def format_annotation(annotation: Annotation) -> dict:
    """Format an annotation for API response."""
    label_data = None
    if annotation.annotation_label:
        label_data = {
            "text": annotation.annotation_label.text,
            "color": annotation.annotation_label.color or "#000000",
            "label_type": annotation.annotation_label.label_type,
        }

    return {
        "id": str(annotation.id),
        "page": annotation.page,
        "raw_text": annotation.raw_text or "",
        "annotation_label": label_data,
        "structural": annotation.structural,
        "created": annotation.created.isoformat() if annotation.created else None,
    }


def format_thread_summary(thread: Conversation) -> dict:
    """Format a thread for list display."""
    return {
        "id": str(thread.id),
        "title": thread.title or "",
        "description": thread.description or "",
        "message_count": getattr(thread, "message_count", 0),
        "is_pinned": thread.is_pinned,
        "is_locked": thread.is_locked,
        "created_at": thread.created.isoformat() if thread.created else None,
        "last_activity": thread.modified.isoformat() if thread.modified else None,
    }


def format_message(message: ChatMessage) -> dict:
    """Format a single message without replies."""
    return {
        "id": str(message.id),
        "content": message.content,
        "msg_type": message.msg_type,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "upvote_count": message.upvote_count,
        "downvote_count": message.downvote_count,
    }


def format_message_with_replies(
    message: ChatMessage, user, max_depth: int = 3, current_depth: int = 0
) -> dict:
    """
    Format a message with its replies recursively.

    Uses prefetched replies to avoid N+1 queries.
    Limits recursion depth to prevent deeply nested structures.
    """
    formatted = format_message(message)

    if current_depth >= max_depth:
        formatted["replies"] = []
        formatted["has_more_replies"] = (
            message.replies.exists() if hasattr(message, "replies") else False
        )
        return formatted

    # Access prefetched replies (no additional queries if prefetched)
    replies = list(message.replies.all()) if hasattr(message, "replies") else []

    formatted["replies"] = [
        format_message_with_replies(reply, user, max_depth, current_depth + 1)
        for reply in replies
    ]

    return formatted
