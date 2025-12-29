"""MCP Tool implementations for OpenContracts.

Tools provide dynamic operations - they execute queries and return results.
"""

from __future__ import annotations

from django.contrib.auth.models import AnonymousUser
from django.db.models import Count, Q

from .formatters import (
    format_annotation,
    format_corpus_summary,
    format_document_summary,
    format_message,
    format_message_with_replies,
    format_thread_summary,
)


def list_public_corpuses(limit: int = 20, offset: int = 0, search: str = "") -> dict:
    """
    List public corpuses visible to anonymous users.

    Args:
        limit: Number of results (default 20, max 100)
        offset: Pagination offset
        search: Optional search filter for title/description

    Returns:
        Dict with total_count and list of corpus summaries
    """
    from opencontractserver.corpuses.models import Corpus

    # Enforce max limit
    limit = min(limit, 100)

    anonymous = AnonymousUser()
    qs = Corpus.objects.visible_to_user(anonymous)

    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

    total_count = qs.count()
    corpuses = list(qs[offset : offset + limit])

    return {
        "total_count": total_count,
        "corpuses": [format_corpus_summary(c) for c in corpuses],
    }


def list_documents(
    corpus_slug: str, limit: int = 50, offset: int = 0, search: str = ""
) -> dict:
    """
    List documents in a public corpus.

    Args:
        corpus_slug: Corpus identifier
        limit: Number of results (default 50, max 100)
        offset: Pagination offset
        search: Optional search filter

    Returns:
        Dict with total_count and list of document summaries
    """
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    limit = min(limit, 100)
    anonymous = AnonymousUser()

    # Get corpus (raises Corpus.DoesNotExist if not found or not public)
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    # Get public documents in this corpus
    qs = Document.objects.visible_to_user(anonymous).filter(corpuses=corpus)

    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(description__icontains=search))

    total_count = qs.count()
    documents = list(qs[offset : offset + limit])

    return {
        "total_count": total_count,
        "documents": [format_document_summary(d) for d in documents],
    }


def get_document_text(corpus_slug: str, document_slug: str) -> dict:
    """
    Retrieve full extracted text from a document.

    Args:
        corpus_slug: Corpus identifier
        document_slug: Document identifier

    Returns:
        Dict with document slug, page count, and full text
    """
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    anonymous = AnonymousUser()

    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)
    document = Document.objects.visible_to_user(anonymous).get(
        corpuses=corpus, slug=document_slug
    )

    full_text = ""
    if document.txt_extract_file:
        try:
            with document.txt_extract_file.open("r") as f:
                full_text = f.read()
        except Exception:
            full_text = ""

    return {
        "document_slug": document.slug,
        "page_count": document.page_count or 0,
        "text": full_text,
    }


def list_annotations(
    corpus_slug: str,
    document_slug: str,
    page: int | None = None,
    label_text: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """
    List annotations on a document with optional filtering.

    Args:
        corpus_slug: Corpus identifier
        document_slug: Document identifier
        page: Optional page number filter
        label_text: Optional label text filter
        limit: Number of results (max 100)
        offset: Pagination offset

    Returns:
        Dict with total_count and list of annotations
    """
    from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    limit = min(limit, 100)
    anonymous = AnonymousUser()

    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)
    document = Document.objects.visible_to_user(anonymous).get(
        corpuses=corpus, slug=document_slug
    )

    # Use query optimizer - eliminates N+1 permission queries
    qs = AnnotationQueryOptimizer.get_document_annotations(
        document_id=document.id, user=anonymous, corpus_id=corpus.id
    )

    # Apply filters
    if page is not None:
        qs = qs.filter(page=page)

    if label_text:
        qs = qs.filter(annotation_label__text=label_text)

    total_count = qs.count()
    annotations = list(qs.select_related("annotation_label")[offset : offset + limit])

    return {
        "total_count": total_count,
        "annotations": [format_annotation(a) for a in annotations],
    }


def search_corpus(corpus_slug: str, query: str, limit: int = 10) -> dict:
    """
    Semantic search within a corpus using vector embeddings.

    Falls back to text search if embeddings are unavailable.

    Args:
        corpus_slug: Corpus identifier
        query: Search query text
        limit: Number of results (max 50)

    Returns:
        Dict with query and ranked results
    """
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    limit = min(limit, 50)
    anonymous = AnonymousUser()
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    # Try to use vector search
    try:
        # embed_text() returns (embedder_path, query_vector) tuple
        embedder_path, query_vector = corpus.embed_text(query)

        if query_vector:
            # Search documents using vector similarity
            doc_results = list(
                Document.objects.visible_to_user(anonymous)
                .filter(corpuses=corpus)
                .search_by_embedding(query_vector, embedder_path, top_k=limit)
            )

            results = []
            for doc in doc_results:
                results.append(
                    {
                        "type": "document",
                        "slug": doc.slug,
                        "title": doc.title or "",
                        "similarity_score": float(getattr(doc, "similarity_score", 0)),
                    }
                )

            return {"query": query, "results": results}
    except Exception:
        pass

    # Fallback to text search
    return _text_search_fallback(corpus, query, limit, anonymous)


def _text_search_fallback(corpus, query: str, limit: int, user) -> dict:
    """Fallback to text search when embeddings are unavailable."""
    from opencontractserver.documents.models import Document

    documents = list(
        Document.objects.visible_to_user(user)
        .filter(corpuses=corpus)
        .filter(Q(title__icontains=query) | Q(description__icontains=query))[:limit]
    )

    results = []
    for doc in documents:
        results.append(
            {
                "type": "document",
                "slug": doc.slug,
                "title": doc.title or "",
                "similarity_score": None,
            }
        )

    return {"query": query, "results": results}


def list_threads(
    corpus_slug: str, document_slug: str | None = None, limit: int = 20, offset: int = 0
) -> dict:
    """
    List discussion threads in a corpus or document.

    Args:
        corpus_slug: Corpus identifier
        document_slug: Optional document filter
        limit: Number of results (max 100)
        offset: Pagination offset

    Returns:
        Dict with total_count and list of thread summaries
    """
    from opencontractserver.conversations.models import (
        Conversation,
        ConversationTypeChoices,
    )
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    limit = min(limit, 100)
    anonymous = AnonymousUser()
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    qs = (
        Conversation.objects.visible_to_user(anonymous)
        .filter(
            conversation_type=ConversationTypeChoices.THREAD, chat_with_corpus=corpus
        )
        .annotate(message_count=Count("messages"))
    )

    if document_slug:
        document = Document.objects.visible_to_user(anonymous).get(
            corpuses=corpus, slug=document_slug
        )
        qs = qs.filter(chat_with_document=document)

    # Order by pinned first, then recent activity
    qs = qs.order_by("-is_pinned", "-modified")

    total_count = qs.count()
    threads = list(qs[offset : offset + limit])

    return {
        "total_count": total_count,
        "threads": [format_thread_summary(t) for t in threads],
    }


def get_thread_messages(
    corpus_slug: str, thread_id: int, flatten: bool = False
) -> dict:
    """
    Retrieve all messages in a thread with hierarchical structure.

    Args:
        corpus_slug: Corpus identifier
        thread_id: Thread identifier
        flatten: If True, return flat list instead of tree

    Returns:
        Dict with thread_id, title, and messages
    """
    from django.core.exceptions import ObjectDoesNotExist

    from opencontractserver.conversations.models import (
        ChatMessage,
        Conversation,
        ConversationTypeChoices,
    )
    from opencontractserver.corpuses.models import Corpus

    anonymous = AnonymousUser()
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    thread = (
        Conversation.objects.visible_to_user(anonymous)
        .filter(
            conversation_type=ConversationTypeChoices.THREAD,
            chat_with_corpus=corpus,
            id=thread_id,
        )
        .first()
    )

    if not thread:
        raise ObjectDoesNotExist(f"Thread {thread_id} not found")

    if flatten:
        messages = list(
            ChatMessage.objects.visible_to_user(anonymous)
            .filter(conversation=thread)
            .order_by("created_at")
        )
        return {
            "thread_id": str(thread.id),
            "title": thread.title or "",
            "messages": [format_message(m) for m in messages],
        }

    # Build hierarchical structure with prefetch
    root_messages = list(
        ChatMessage.objects.visible_to_user(anonymous)
        .filter(conversation=thread, parent_message__isnull=True)
        .prefetch_related("replies__replies")
        .order_by("created_at")
    )

    return {
        "thread_id": str(thread.id),
        "title": thread.title or "",
        "messages": [format_message_with_replies(m, anonymous) for m in root_messages],
    }
