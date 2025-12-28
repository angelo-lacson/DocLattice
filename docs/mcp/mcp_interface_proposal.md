# OpenContracts MCP Interface Proposal

## Overview

This document proposes an elegant, performant Model Context Protocol (MCP) interface for OpenContracts that provides **read-only access to public resources**. The interface follows a **one-corpus-at-a-time** model, allowing AI assistants and other MCP clients to explore public corpuses, documents, annotations, and discussion threads.

## Design Principles

1. **Public-Only Access**: Only resources where `is_public=True` are accessible
2. **Read-Only Operations**: No mutations - pure information retrieval
3. **One Corpus Context**: Users select a corpus, then explore within that scope
4. **Performance First**: Leverage existing query optimizers and manager methods
5. **Anonymous User Model**: Operate as anonymous user with READ permissions only
6. **Respect Permission Model**: Follow existing permissioning rules (document + corpus both must be public)

## Architecture

### Permission Strategy

The MCP server operates as an **anonymous user**, which means:

```python
# Permission checks follow anonymous user rules from permissioning guide:
# - Corpus: is_public=True
# - Document: is_public=True AND (no corpus OR corpus.is_public=True)
# - Annotation: document.is_public=True AND corpus.is_public=True
# - Thread: is_public=True
# - ChatMessage: thread.is_public=True

from django.contrib.auth.models import AnonymousUser

# All queries use visible_to_user() with AnonymousUser
anonymous = AnonymousUser()
public_corpuses = Corpus.objects.visible_to_user(anonymous)
```

### Resource Naming Convention

MCP resources follow a hierarchical URI pattern:

```
corpus://{corpus_slug}
document://{corpus_slug}/{document_slug}
annotation://{corpus_slug}/{document_slug}/{annotation_id}
thread://{corpus_slug}/threads/{thread_id}
```

## MCP Resources

Resources provide **static content** for context windows. They represent specific entities.

### 1. Corpus Resource

**URI**: `corpus://{corpus_slug}`

**Content**: Full corpus metadata and summary statistics

```json
{
  "slug": "legal-contracts-2024",
  "title": "Legal Contracts Database 2024",
  "description": "Curated collection of legal contracts...",
  "document_count": 1247,
  "annotation_count": 15632,
  "thread_count": 89,
  "created": "2024-01-15T10:30:00Z",
  "modified": "2024-12-20T14:22:00Z",
  "label_set": {
    "title": "Legal Annotation Labels",
    "labels": [
      {"text": "indemnification", "color": "#FF5733", "label_type": "TOKEN_LABEL"},
      {"text": "termination", "color": "#33FF57", "label_type": "SPAN_LABEL"}
    ]
  }
}
```

**Implementation**:
```python
def get_corpus_resource(corpus_slug: str) -> str:
    anonymous = AnonymousUser()
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    return json.dumps({
        "slug": corpus.slug,
        "title": corpus.title,
        "description": corpus.description,
        "document_count": corpus.document_count(),
        "created": corpus.created.isoformat(),
        "modified": corpus.modified.isoformat(),
        # ... statistics and metadata
    })
```

### 2. Document Resource

**URI**: `document://{corpus_slug}/{document_slug}`

**Content**: Document metadata, extracted text, and structural information

```json
{
  "slug": "employment-agreement-acme-2024",
  "title": "Employment Agreement - Acme Corp 2024",
  "description": "Standard employment contract template",
  "file_type": "application/pdf",
  "page_count": 12,
  "text_preview": "This Employment Agreement is entered into...",
  "full_text": "[Full extracted text content]",
  "created": "2024-03-10T09:15:00Z",
  "corpus": "legal-contracts-2024"
}
```

**Implementation**:
```python
def get_document_resource(corpus_slug: str, document_slug: str) -> str:
    anonymous = AnonymousUser()

    # Get corpus context
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    # Get document within corpus (both must be public)
    document = (Document.objects
                .visible_to_user(anonymous)
                .filter(corpuses=corpus, slug=document_slug)
                .first())

    if not document:
        from opencontractserver.documents.models import Document
        raise Document.DoesNotExist(f"Document '{document_slug}' not found in corpus '{corpus_slug}'")

    # Read extracted text
    full_text = ""
    if document.txt_extract_file:
        with document.txt_extract_file.open('r') as f:
            full_text = f.read()

    return json.dumps({
        "slug": document.slug,
        "title": document.title,
        "description": document.description,
        "page_count": document.page_count,
        "full_text": full_text,
        # ...
    })
```

### 3. Annotation Resource

**URI**: `annotation://{corpus_slug}/{document_slug}/{annotation_id}`

**Content**: Specific annotation with location and metadata

```json
{
  "id": "12345",
  "page": 3,
  "raw_text": "indemnification clause",
  "annotation_label": {
    "text": "indemnification",
    "color": "#FF5733",
    "label_type": "SPAN_LABEL"
  },
  "bounding_box": {
    "top": 120,
    "left": 50,
    "right": 450,
    "bottom": 145
  },
  "structural": false,
  "created": "2024-03-12T11:20:00Z"
}
```

**Implementation**:
```python
def get_annotation_resource(corpus_slug: str, document_slug: str, annotation_id: int) -> str:
    from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer
    anonymous = AnonymousUser()

    # Get corpus and document
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)
    document = Document.objects.visible_to_user(anonymous).get(
        corpuses=corpus, slug=document_slug
    )

    # Use query optimizer for efficient permission checking
    annotations = AnnotationQueryOptimizer.get_document_annotations(
        document_id=document.id,
        user=anonymous,
        corpus_id=corpus.id
    )

    annotation = annotations.get(id=annotation_id)

    return json.dumps({
        "id": str(annotation.id),
        "page": annotation.page,
        "raw_text": annotation.raw_text,
        # ...
    })
```

### 4. Thread Resource

**URI**: `thread://{corpus_slug}/threads/{thread_id}`

**Content**: Discussion thread with messages

```json
{
  "id": "9876",
  "title": "Question about indemnification clause interpretation",
  "description": "Discussion about standard indemnification language",
  "message_count": 12,
  "is_locked": false,
  "is_pinned": true,
  "created_at": "2024-11-15T14:30:00Z",
  "messages": [
    {
      "id": "msg-1",
      "content": "Can someone explain the scope of this indemnification clause?",
      "msg_type": "HUMAN",
      "created_at": "2024-11-15T14:30:00Z",
      "upvote_count": 5,
      "downvote_count": 0,
      "replies": [
        {
          "id": "msg-2",
          "content": "This clause provides protection for...",
          "msg_type": "HUMAN",
          "created_at": "2024-11-15T15:10:00Z",
          "upvote_count": 8,
          "downvote_count": 0
        }
      ]
    }
  ]
}
```

**Implementation**:
```python
def get_thread_resource(corpus_slug: str, thread_id: int, include_messages: bool = True) -> str:
    """Get a discussion thread resource."""
    import json
    from django.contrib.auth.models import AnonymousUser
    from opencontractserver.conversations.models import (
        ChatMessage,
        Conversation,
        ConversationTypeChoices,
    )
    from opencontractserver.corpuses.models import Corpus

    anonymous = AnonymousUser()
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    # Get public thread in this corpus
    thread = (Conversation.objects
              .visible_to_user(anonymous)
              .filter(
                  conversation_type=ConversationTypeChoices.THREAD,
                  chat_with_corpus=corpus,
                  id=thread_id
              )
              .first())

    if not thread:
        raise Conversation.DoesNotExist(f"Thread '{thread_id}' not found in corpus '{corpus_slug}'")

    data = {
        "id": str(thread.id),
        "title": thread.title or "",
        "description": thread.description or "",
        "is_locked": thread.is_locked,
        "is_pinned": thread.is_pinned,
        "created_at": thread.created.isoformat() if thread.created else None,
    }

    if include_messages:
        messages = build_threaded_messages(thread, anonymous)
        data["messages"] = messages

    return json.dumps(data)


def build_threaded_messages(thread, user) -> list:
    """
    Build hierarchical message tree.

    Uses prefetch_related to avoid N+1 queries when accessing nested replies.
    """
    from opencontractserver.conversations.models import ChatMessage

    messages = list(ChatMessage.objects
                    .visible_to_user(user)
                    .filter(conversation=thread, parent_message__isnull=True)
                    .prefetch_related('replies__replies')  # Prefetch 2 levels
                    .order_by('created_at'))

    return [format_message_with_replies(msg, user) for msg in messages]
```

## MCP Tools

Tools provide **dynamic operations** - they execute queries and return results.

### 1. list_public_corpuses

**Purpose**: Discover available public corpuses

**Parameters**:
- `limit` (optional, default=20): Number of results
- `offset` (optional, default=0): Pagination offset
- `search` (optional): Filter by title/description

**Returns**: List of corpus summaries

```json
{
  "total_count": 47,
  "corpuses": [
    {
      "slug": "legal-contracts-2024",
      "title": "Legal Contracts Database 2024",
      "description": "Curated collection...",
      "document_count": 1247,
      "created": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Implementation**:
```python
def list_public_corpuses(limit: int = 20, offset: int = 0, search: str = "") -> dict:
    """
    List public corpuses visible to anonymous users.

    Note: This is a synchronous implementation. Django ORM operations are blocking,
    so we keep this synchronous for simplicity. For async, wrap ORM calls with
    sync_to_async from asgiref.sync.
    """
    from django.contrib.auth.models import AnonymousUser
    from django.db.models import Q
    from opencontractserver.corpuses.models import Corpus

    anonymous = AnonymousUser()
    qs = Corpus.objects.visible_to_user(anonymous)

    if search:
        qs = qs.filter(
            Q(title__icontains=search) | Q(description__icontains=search)
        )

    total_count = qs.count()
    corpuses = list(qs[offset:offset+limit])

    return {
        "total_count": total_count,
        "corpuses": [format_corpus_summary(c) for c in corpuses]
    }


def format_corpus_summary(corpus) -> dict:
    """Format a corpus for list display."""
    return {
        "slug": corpus.slug,
        "title": corpus.title,
        "description": corpus.description or "",
        "document_count": corpus.document_count(),
        "created": corpus.created.isoformat(),
    }
```

### 2. list_documents

**Purpose**: List documents in a corpus

**Parameters**:
- `corpus_slug` (required): Corpus identifier
- `limit` (optional, default=50): Number of results
- `offset` (optional, default=0): Pagination offset
- `search` (optional): Filter by title/description

**Returns**: List of document summaries

```json
{
  "total_count": 1247,
  "documents": [
    {
      "slug": "employment-agreement-acme-2024",
      "title": "Employment Agreement - Acme Corp 2024",
      "page_count": 12,
      "created": "2024-03-10T09:15:00Z"
    }
  ]
}
```

**Implementation**:
```python
def list_documents(
    corpus_slug: str,
    limit: int = 50,
    offset: int = 0,
    search: str = ""
) -> dict:
    """List documents in a public corpus."""
    from django.contrib.auth.models import AnonymousUser
    from django.db.models import Q
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    anonymous = AnonymousUser()

    # Get corpus (raises Corpus.DoesNotExist if not found or not public)
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    # Get public documents in this corpus
    qs = (Document.objects
          .visible_to_user(anonymous)
          .filter(corpuses=corpus))

    if search:
        qs = qs.filter(
            Q(title__icontains=search) | Q(description__icontains=search)
        )

    total_count = qs.count()
    documents = list(qs[offset:offset+limit])

    return {
        "total_count": total_count,
        "documents": [format_document_summary(d) for d in documents]
    }


def format_document_summary(document) -> dict:
    """Format a document for list display."""
    return {
        "slug": document.slug,
        "title": document.title,
        "description": document.description or "",
        "page_count": document.page_count,
        "file_type": document.file_type or "unknown",
        "created": document.created.isoformat(),
    }
```

### 3. get_document_text

**Purpose**: Retrieve full extracted text from a document

**Parameters**:
- `corpus_slug` (required): Corpus identifier
- `document_slug` (required): Document identifier

**Returns**: Plain text content

```json
{
  "document_slug": "employment-agreement-acme-2024",
  "page_count": 12,
  "text": "This Employment Agreement is entered into as of January 1, 2024..."
}
```

**Implementation**:
```python
def get_document_text(corpus_slug: str, document_slug: str) -> dict:
    """Retrieve full extracted text from a document."""
    from django.contrib.auth.models import AnonymousUser
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    anonymous = AnonymousUser()

    # Raises Corpus.DoesNotExist if not found/not public
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    # Raises Document.DoesNotExist if not found/not public
    document = (Document.objects
                .visible_to_user(anonymous)
                .get(corpuses=corpus, slug=document_slug))

    full_text = ""
    if document.txt_extract_file:
        with document.txt_extract_file.open('r') as f:
            full_text = f.read()

    return {
        "document_slug": document.slug,
        "page_count": document.page_count,
        "text": full_text
    }
```

### 4. list_annotations

**Purpose**: List annotations on a document

**Parameters**:
- `corpus_slug` (required): Corpus identifier
- `document_slug` (required): Document identifier
- `page` (optional): Filter to specific page
- `label_text` (optional): Filter by label text
- `limit` (optional, default=100): Number of results
- `offset` (optional, default=0): Pagination offset

**Returns**: List of annotations

```json
{
  "total_count": 156,
  "annotations": [
    {
      "id": "12345",
      "page": 3,
      "raw_text": "indemnification clause",
      "annotation_label": {
        "text": "indemnification",
        "color": "#FF5733"
      },
      "structural": false
    }
  ]
}
```

**Implementation**:
```python
def list_annotations(
    corpus_slug: str,
    document_slug: str,
    page: int | None = None,
    label_text: str | None = None,
    limit: int = 100,
    offset: int = 0
) -> dict:
    """List annotations on a document with optional filtering."""
    from django.contrib.auth.models import AnonymousUser
    from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    anonymous = AnonymousUser()

    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)
    document = Document.objects.visible_to_user(anonymous).get(
        corpuses=corpus, slug=document_slug
    )

    # Use query optimizer - eliminates N+1 permission queries
    qs = AnnotationQueryOptimizer.get_document_annotations(
        document_id=document.id,
        user=anonymous,
        corpus_id=corpus.id
    )

    # Apply filters
    if page is not None:
        qs = qs.filter(page=page)

    if label_text:
        qs = qs.filter(annotation_label__text=label_text)

    total_count = qs.count()
    annotations = list(qs.select_related('annotation_label')[offset:offset+limit])

    return {
        "total_count": total_count,
        "annotations": [format_annotation(a) for a in annotations]
    }


def format_annotation(annotation) -> dict:
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
```

### 5. search_corpus

**Purpose**: Semantic search within a corpus using vector embeddings

**Parameters**:
- `corpus_slug` (required): Corpus identifier
- `query` (required): Search query text
- `limit` (optional, default=10): Number of results

**Returns**: Ranked list of relevant documents and annotations

```json
{
  "query": "indemnification provisions",
  "results": [
    {
      "type": "document",
      "slug": "employment-agreement-acme-2024",
      "title": "Employment Agreement - Acme Corp 2024",
      "similarity_score": 0.89,
      "snippet": "...indemnification provisions in Section 7..."
    },
    {
      "type": "annotation",
      "document_slug": "service-agreement-beta-2024",
      "id": "45678",
      "raw_text": "indemnification by service provider",
      "similarity_score": 0.85,
      "page": 5
    }
  ]
}
```

**Implementation**:
```python
def search_corpus(
    corpus_slug: str,
    query: str,
    limit: int = 10
) -> dict:
    """Semantic search within a corpus using vector embeddings."""
    from django.contrib.auth.models import AnonymousUser
    from django.db.models import Q
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    anonymous = AnonymousUser()
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    # Generate query embedding using corpus's preferred embedder
    # embed_text() returns (embedder_path, query_vector) tuple
    embedder_path, query_vector = corpus.embed_text(query)

    if not query_vector:
        # Fallback to text search if embeddings unavailable
        return text_search_fallback(corpus, query, limit, anonymous)

    # Search documents using vector similarity
    # search_by_embedding adds 'similarity_score' annotation
    doc_results = list(Document.objects
                       .visible_to_user(anonymous)
                       .filter(corpuses=corpus)
                       .search_by_embedding(query_vector, embedder_path, top_k=limit))

    # Combine and rank results
    results = []
    for doc in doc_results:
        results.append({
            "type": "document",
            "slug": doc.slug,
            "title": doc.title,
            "similarity_score": float(doc.similarity_score),
        })

    return {
        "query": query,
        "results": results[:limit]
    }


def text_search_fallback(corpus, query: str, limit: int, user) -> dict:
    """Fallback to text search when embeddings are unavailable."""
    from django.db.models import Q
    from opencontractserver.documents.models import Document

    # Simple text search on title and description
    documents = list(Document.objects
                     .visible_to_user(user)
                     .filter(corpuses=corpus)
                     .filter(Q(title__icontains=query) | Q(description__icontains=query))
                     [:limit])

    results = []
    for doc in documents:
        results.append({
            "type": "document",
            "slug": doc.slug,
            "title": doc.title,
            "similarity_score": None,  # No similarity score for text search
        })

    return {
        "query": query,
        "results": results
    }
```

### 6. list_threads

**Purpose**: List discussion threads in a corpus or document

**Parameters**:
- `corpus_slug` (required): Corpus identifier
- `document_slug` (optional): Filter to document-specific threads
- `limit` (optional, default=20): Number of results
- `offset` (optional, default=0): Pagination offset

**Returns**: List of thread summaries

```json
{
  "total_count": 89,
  "threads": [
    {
      "id": "9876",
      "title": "Question about indemnification clause",
      "message_count": 12,
      "is_pinned": true,
      "is_locked": false,
      "created_at": "2024-11-15T14:30:00Z",
      "last_activity": "2024-12-15T09:20:00Z"
    }
  ]
}
```

**Implementation**:
```python
def list_threads(
    corpus_slug: str,
    document_slug: str | None = None,
    limit: int = 20,
    offset: int = 0
) -> dict:
    """List discussion threads in a corpus or document."""
    from django.contrib.auth.models import AnonymousUser
    from django.db.models import Count
    from opencontractserver.conversations.models import Conversation, ConversationTypeChoices
    from opencontractserver.corpuses.models import Corpus
    from opencontractserver.documents.models import Document

    anonymous = AnonymousUser()
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    qs = (Conversation.objects
          .visible_to_user(anonymous)
          .filter(
              conversation_type=ConversationTypeChoices.THREAD,
              chat_with_corpus=corpus
          )
          .annotate(message_count=Count('messages')))  # Efficient count

    if document_slug:
        document = Document.objects.visible_to_user(anonymous).get(
            corpuses=corpus, slug=document_slug
        )
        qs = qs.filter(chat_with_document=document)

    # Order by pinned first, then recent activity
    qs = qs.order_by('-is_pinned', '-updated_at')

    total_count = qs.count()
    threads = list(qs[offset:offset+limit])

    return {
        "total_count": total_count,
        "threads": [format_thread_summary(t) for t in threads]
    }


def format_thread_summary(thread) -> dict:
    """Format a thread for list display."""
    return {
        "id": str(thread.id),
        "title": thread.title or "",
        "description": thread.description or "",
        "message_count": getattr(thread, 'message_count', 0),
        "is_pinned": thread.is_pinned,
        "is_locked": thread.is_locked,
        "created_at": thread.created.isoformat() if thread.created else None,
        "last_activity": thread.updated.isoformat() if thread.updated else None,
    }
```

### 7. get_thread_messages

**Purpose**: Retrieve all messages in a thread with hierarchical structure

**Parameters**:
- `corpus_slug` (required): Corpus identifier
- `thread_id` (required): Thread identifier
- `flatten` (optional, default=False): Return flat list instead of tree

**Returns**: Thread messages in hierarchical or flat format

```json
{
  "thread_id": "9876",
  "title": "Question about indemnification clause",
  "messages": [
    {
      "id": "msg-1",
      "content": "Can someone explain...",
      "msg_type": "HUMAN",
      "created_at": "2024-11-15T14:30:00Z",
      "upvote_count": 5,
      "replies": [
        {
          "id": "msg-2",
          "content": "This clause provides...",
          "created_at": "2024-11-15T15:10:00Z",
          "upvote_count": 8
        }
      ]
    }
  ]
}
```

**Implementation**:
```python
def get_thread_messages(
    corpus_slug: str,
    thread_id: int,
    flatten: bool = False
) -> dict:
    """Retrieve all messages in a thread with hierarchical structure."""
    from django.contrib.auth.models import AnonymousUser
    from opencontractserver.conversations.models import (
        ChatMessage,
        Conversation,
        ConversationTypeChoices,
    )
    from opencontractserver.corpuses.models import Corpus

    anonymous = AnonymousUser()
    corpus = Corpus.objects.visible_to_user(anonymous).get(slug=corpus_slug)

    # Get the thread
    thread = (Conversation.objects
              .visible_to_user(anonymous)
              .filter(
                  conversation_type=ConversationTypeChoices.THREAD,
                  chat_with_corpus=corpus,
                  id=thread_id
              )
              .first())

    if not thread:
        from django.core.exceptions import ObjectDoesNotExist
        raise ObjectDoesNotExist(f"Thread {thread_id} not found")

    if flatten:
        # Return all messages in flat list, ordered by created_at
        messages = list(ChatMessage.objects
                        .visible_to_user(anonymous)
                        .filter(conversation=thread)
                        .order_by('created_at'))
        return {
            "thread_id": str(thread.id),
            "title": thread.title or "",
            "messages": [format_message(m) for m in messages]
        }

    # Build hierarchical structure with prefetch to avoid N+1 queries
    # Prefetch 2 levels of replies (adjust depth as needed)
    root_messages = list(ChatMessage.objects
                         .visible_to_user(anonymous)
                         .filter(conversation=thread, parent_message__isnull=True)
                         .prefetch_related('replies__replies')
                         .order_by('created_at'))

    return {
        "thread_id": str(thread.id),
        "title": thread.title or "",
        "messages": [format_message_with_replies(m, anonymous) for m in root_messages]
    }


def format_message(message) -> dict:
    """Format a single message without replies."""
    return {
        "id": str(message.id),
        "content": message.content,
        "msg_type": message.msg_type,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "upvote_count": message.upvote_count,
        "downvote_count": message.downvote_count,
    }


def format_message_with_replies(message, user, max_depth: int = 3, current_depth: int = 0) -> dict:
    """
    Format a message with its replies recursively.

    Uses prefetched replies to avoid N+1 queries.
    Limits recursion depth to prevent deeply nested structures.
    """
    formatted = format_message(message)

    if current_depth >= max_depth:
        # Stop recursion at max depth
        formatted["replies"] = []
        formatted["has_more_replies"] = message.replies.exists() if hasattr(message, 'replies') else False
        return formatted

    # Access prefetched replies (no additional queries)
    replies = list(message.replies.all()) if hasattr(message, 'replies') else []

    formatted["replies"] = [
        format_message_with_replies(reply, user, max_depth, current_depth + 1)
        for reply in replies
    ]

    return formatted
```

## Implementation Structure

### Directory Layout

```
opencontractserver/
  mcp/
    __init__.py
    server.py           # MCP server entry point
    resources.py        # Resource handlers
    tools.py            # Tool implementations
    permissions.py      # Permission utilities
    formatters.py       # Response formatting
    config.py           # Configuration
```

### MCP Server Entry Point

```python
# opencontractserver/mcp/server.py
import asyncio
import json
import re
from typing import Optional

from asgiref.sync import sync_to_async
from mcp import Server, Resource, Tool
from mcp.types import TextContent, EmbeddedResource

from .resources import (
    get_corpus_resource,
    get_document_resource,
    get_annotation_resource,
    get_thread_resource
)

from .tools import (
    list_public_corpuses,
    list_documents,
    get_document_text,
    list_annotations,
    search_corpus,
    list_threads,
    get_thread_messages
)

# Initialize MCP server
mcp_server = Server("opencontracts")


# URI parsing utilities with regex for safety
class URIParser:
    """Parse MCP resource URIs safely using regex patterns."""

    # Slug pattern: alphanumeric and hyphens only (matches OpenContracts slug format)
    SLUG_PATTERN = r'[A-Za-z0-9\-]+'

    PATTERNS = {
        'corpus': re.compile(rf'^corpus://({SLUG_PATTERN})$'),
        'document': re.compile(rf'^document://({SLUG_PATTERN})/({SLUG_PATTERN})$'),
        'annotation': re.compile(rf'^annotation://({SLUG_PATTERN})/({SLUG_PATTERN})/(\d+)$'),
        'thread': re.compile(rf'^thread://({SLUG_PATTERN})/threads/(\d+)$'),
    }

    @classmethod
    def parse_corpus(cls, uri: str) -> Optional[str]:
        """Parse corpus URI, returns corpus_slug or None."""
        match = cls.PATTERNS['corpus'].match(uri)
        return match.group(1) if match else None

    @classmethod
    def parse_document(cls, uri: str) -> Optional[tuple[str, str]]:
        """Parse document URI, returns (corpus_slug, document_slug) or None."""
        match = cls.PATTERNS['document'].match(uri)
        return (match.group(1), match.group(2)) if match else None

    @classmethod
    def parse_annotation(cls, uri: str) -> Optional[tuple[str, str, int]]:
        """Parse annotation URI, returns (corpus_slug, document_slug, annotation_id) or None."""
        match = cls.PATTERNS['annotation'].match(uri)
        return (match.group(1), match.group(2), int(match.group(3))) if match else None

    @classmethod
    def parse_thread(cls, uri: str) -> Optional[tuple[str, int]]:
        """Parse thread URI, returns (corpus_slug, thread_id) or None."""
        match = cls.PATTERNS['thread'].match(uri)
        return (match.group(1), int(match.group(2))) if match else None


# Register resources
@mcp_server.list_resources()
async def list_resources() -> list[Resource]:
    """List available resource patterns"""
    return [
        Resource(
            uri="corpus://{corpus_slug}",
            name="Public Corpus",
            description="Access public corpus metadata and contents",
            mimeType="application/json"
        ),
        Resource(
            uri="document://{corpus_slug}/{document_slug}",
            name="Public Document",
            description="Access public document with extracted text",
            mimeType="application/json"
        ),
        Resource(
            uri="annotation://{corpus_slug}/{document_slug}/{annotation_id}",
            name="Document Annotation",
            description="Access specific annotation on a document",
            mimeType="application/json"
        ),
        Resource(
            uri="thread://{corpus_slug}/threads/{thread_id}",
            name="Discussion Thread",
            description="Access public discussion thread with messages",
            mimeType="application/json"
        )
    ]


@mcp_server.read_resource()
async def read_resource(uri: str) -> str:
    """Resolve resource URI and return content."""
    # Try corpus URI
    corpus_slug = URIParser.parse_corpus(uri)
    if corpus_slug:
        return await sync_to_async(get_corpus_resource)(corpus_slug)

    # Try document URI
    doc_parts = URIParser.parse_document(uri)
    if doc_parts:
        corpus_slug, document_slug = doc_parts
        return await sync_to_async(get_document_resource)(corpus_slug, document_slug)

    # Try annotation URI
    ann_parts = URIParser.parse_annotation(uri)
    if ann_parts:
        corpus_slug, document_slug, annotation_id = ann_parts
        return await sync_to_async(get_annotation_resource)(corpus_slug, document_slug, annotation_id)

    # Try thread URI
    thread_parts = URIParser.parse_thread(uri)
    if thread_parts:
        corpus_slug, thread_id = thread_parts
        return await sync_to_async(get_thread_resource)(corpus_slug, thread_id)

    raise ValueError(f"Invalid or unrecognized resource URI: {uri}")


# Register tools
@mcp_server.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools"""
    return [
        Tool(
            name="list_public_corpuses",
            description="List all publicly accessible corpuses",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "default": 20},
                    "offset": {"type": "integer", "default": 0},
                    "search": {"type": "string", "default": ""}
                }
            }
        ),
        Tool(
            name="list_documents",
            description="List documents in a corpus",
            inputSchema={
                "type": "object",
                "properties": {
                    "corpus_slug": {"type": "string", "description": "Corpus identifier"},
                    "limit": {"type": "integer", "default": 50},
                    "offset": {"type": "integer", "default": 0},
                    "search": {"type": "string", "default": ""}
                },
                "required": ["corpus_slug"]
            }
        ),
        # ... (register all other tools - list_annotations, search_corpus, list_threads, get_thread_messages)
    ]


# Map tool names to their implementations
TOOL_HANDLERS = {
    "list_public_corpuses": list_public_corpuses,
    "list_documents": list_documents,
    "get_document_text": get_document_text,
    "list_annotations": list_annotations,
    "search_corpus": search_corpus,
    "list_threads": list_threads,
    "get_thread_messages": get_thread_messages,
}


@mcp_server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Execute tool and return results."""
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        raise ValueError(f"Unknown tool: {name}")

    # Run synchronous Django ORM handlers in thread pool
    result = await sync_to_async(handler)(**arguments)

    return [TextContent(type="text", text=json.dumps(result, indent=2))]


# Entry point
async def main():
    """Run MCP server"""
    from mcp.server.stdio import stdio_server

    async with stdio_server() as streams:
        await mcp_server.run(
            streams[0],  # read_stream
            streams[1],  # write_stream
            mcp_server.create_initialization_options()
        )

if __name__ == "__main__":
    asyncio.run(main())
```

## Performance Optimizations

### 1. Query Optimizer Usage

```python
# ALWAYS use query optimizers for annotations
from opencontractserver.annotations.query_optimizer import AnnotationQueryOptimizer

# Good: Eliminates N+1 queries
annotations = AnnotationQueryOptimizer.get_document_annotations(
    document_id=doc.id,
    user=anonymous,
    corpus_id=corpus.id
)

# Bad: N+1 permission queries
annotations = Annotation.objects.filter(document=doc)  # Don't do this!
```

### 2. Select Related / Prefetch

```python
# Eager load related objects to avoid additional queries
documents = (Document.objects
             .visible_to_user(anonymous)
             .select_related('creator')
             .prefetch_related('doc_annotations__annotation_label'))
```

### 3. Pagination

```python
# Always use limit/offset for large result sets
def list_with_pagination(queryset, limit, offset):
    total_count = queryset.count()
    results = queryset[offset:offset+limit]

    return {
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "has_more": offset + limit < total_count,
        "results": [format_item(r) for r in results]
    }
```

### 4. Caching Strategy

```python
from django.core.cache import cache
from django.utils.encoding import force_str

def cached_corpus_summary(corpus_slug: str) -> dict:
    """Cache corpus summaries for 5 minutes"""
    cache_key = f"mcp:corpus_summary:{corpus_slug}"

    cached = cache.get(cache_key)
    if cached:
        return cached

    result = generate_corpus_summary(corpus_slug)
    cache.set(cache_key, result, 300)  # 5 minutes

    return result
```

## Security Considerations

### 1. Public-Only Filter

```python
# ALWAYS apply anonymous user filter
from django.contrib.auth.models import AnonymousUser

anonymous = AnonymousUser()

# This automatically filters to is_public=True resources
public_resources = Model.objects.visible_to_user(anonymous)
```

### 2. Input Validation

```python
import re

def validate_slug(slug: str) -> bool:
    """Validate slug format matches OpenContracts pattern"""
    # From CLAUDE.md: Case-sensitive, A-Z, a-z, 0-9, hyphen (-)
    return bool(re.match(r'^[A-Za-z0-9\-]+$', slug))

def sanitize_inputs(corpus_slug: str, document_slug: str | None = None):
    """Validate and sanitize all slug inputs"""
    if not validate_slug(corpus_slug):
        raise ValueError(f"Invalid corpus slug: {corpus_slug}")

    if document_slug and not validate_slug(document_slug):
        raise ValueError(f"Invalid document slug: {document_slug}")
```

### 3. Rate Limiting

```python
from django.core.cache import cache
from datetime import datetime, timedelta

class RateLimiter:
    """Simple rate limiter for MCP requests"""

    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    def check_rate_limit(self, client_id: str) -> bool:
        """Returns True if request is allowed, False if rate limited"""
        key = f"mcp:ratelimit:{client_id}"

        current = cache.get(key, 0)
        if current >= self.max_requests:
            return False

        cache.set(key, current + 1, self.window_seconds)
        return True
```

## Configuration

### Environment Variables

```bash
# .env
MCP_SERVER_ENABLED=true
MCP_MAX_RESULTS_PER_PAGE=100
MCP_RATE_LIMIT_REQUESTS=100
MCP_RATE_LIMIT_WINDOW=60
MCP_CACHE_TTL=300
```

### Django Settings

```python
# config/settings/base.py

# MCP Server Configuration
MCP_SERVER = {
    'enabled': env.bool('MCP_SERVER_ENABLED', default=False),
    'max_results_per_page': env.int('MCP_MAX_RESULTS_PER_PAGE', default=100),
    'rate_limit': {
        'requests': env.int('MCP_RATE_LIMIT_REQUESTS', default=100),
        'window': env.int('MCP_RATE_LIMIT_WINDOW', default=60),
    },
    'cache_ttl': env.int('MCP_CACHE_TTL', default=300),
}
```

## Testing Strategy

### Unit Tests

```python
# opencontractserver/mcp/tests/test_resources.py
from django.test import TestCase
from django.contrib.auth.models import AnonymousUser
from opencontractserver.corpuses.models import Corpus
from opencontractserver.mcp.resources import get_corpus_resource

class CorpusResourceTest(TestCase):
    def setUp(self):
        self.public_corpus = Corpus.objects.create(
            title="Public Corpus",
            description="Test corpus",
            slug="public-corpus",
            is_public=True,
            creator=self.create_user("owner")
        )

        self.private_corpus = Corpus.objects.create(
            title="Private Corpus",
            description="Private test corpus",
            slug="private-corpus",
            is_public=False,
            creator=self.create_user("owner")
        )

    def test_get_public_corpus_resource(self):
        """Anonymous users can access public corpus resources"""
        result = get_corpus_resource("public-corpus")
        data = json.loads(result)

        self.assertEqual(data["slug"], "public-corpus")
        self.assertEqual(data["title"], "Public Corpus")

    def test_get_private_corpus_resource_denied(self):
        """Anonymous users cannot access private corpus resources"""
        with self.assertRaises(Corpus.DoesNotExist):
            get_corpus_resource("private-corpus")
```

### Integration Tests

```python
# opencontractserver/mcp/tests/test_integration.py
import pytest
from mcp.client import ClientSession

@pytest.mark.asyncio
async def test_full_corpus_exploration():
    """Test complete workflow: discover corpus → list documents → get annotations"""
    async with ClientSession("opencontracts-mcp") as session:
        # 1. List public corpuses
        corpuses_result = await session.call_tool("list_public_corpuses", {})
        corpuses = json.loads(corpuses_result[0].text)

        assert len(corpuses["corpuses"]) > 0
        corpus_slug = corpuses["corpuses"][0]["slug"]

        # 2. List documents in corpus
        docs_result = await session.call_tool("list_documents", {
            "corpus_slug": corpus_slug,
            "limit": 10
        })
        docs = json.loads(docs_result[0].text)

        assert len(docs["documents"]) > 0
        document_slug = docs["documents"][0]["slug"]

        # 3. Get document text
        text_result = await session.call_tool("get_document_text", {
            "corpus_slug": corpus_slug,
            "document_slug": document_slug
        })
        text_data = json.loads(text_result[0].text)

        assert len(text_data["text"]) > 0

        # 4. List annotations
        ann_result = await session.call_tool("list_annotations", {
            "corpus_slug": corpus_slug,
            "document_slug": document_slug,
            "limit": 50
        })
        annotations = json.loads(ann_result[0].text)

        assert "annotations" in annotations
```

## Deployment

### Standalone MCP Server

```bash
# Run as standalone process
python -m opencontractserver.mcp.server

# Or via Docker
docker run -p 3000:3000 opencontracts-mcp
```

### Integration with Claude Desktop

```json
{
  "mcpServers": {
    "opencontracts": {
      "command": "python",
      "args": ["-m", "opencontractserver.mcp.server"],
      "env": {
        "DJANGO_SETTINGS_MODULE": "config.settings.production"
      }
    }
  }
}
```

## Future Enhancements

### Phase 2: Advanced Search

- **Full-text search** with highlighting
- **Faceted search** by label type, date range, creator
- **Cross-corpus search** (search across multiple public corpuses)

### Phase 3: Relationship Exploration

- **Annotation relationships** - explore connected annotations
- **Document relationships** - find related documents
- **Citation graphs** - visualize document citation networks

### Phase 4: Analytics

- **Usage statistics** per corpus
- **Popular annotations** (most referenced/discussed)
- **Trending threads** in discussions

## Summary

This MCP interface proposal provides:

✅ **Read-only access** to public OpenContracts resources
✅ **One-corpus-at-a-time** scoping for focused exploration
✅ **Performance optimized** using existing query optimizers
✅ **Elegant API** with intuitive resource URIs and tools
✅ **Security first** with anonymous user model and permission checks
✅ **Comprehensive coverage** of corpuses, documents, annotations, and threads

The implementation follows OpenContracts' established patterns and leverages the existing permissioning infrastructure for a robust, maintainable solution.
