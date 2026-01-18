# Asynchronous Processing in OpenContracts

OpenContracts uses Celery for distributed task processing and Django signals for event-driven architecture. This document covers both systems and how they interact.

## Celery Task Queue

OpenContracts makes extensive use of Celery, a powerful Python framework for distributed and asynchronous processing. The docker compose stack includes dedicated celeryworkers to handle computationally-intensive and long-running tasks.

### Common Task Types

| Task Category | Examples |
|---------------|----------|
| Document Processing | Parsing PDFs, extracting text, generating thumbnails |
| Embeddings | Creating vector embeddings for semantic search |
| Analysis | Running analyzers on documents |
| Extraction | Executing fieldset-based data extraction |
| Agent Actions | Running AI agents on documents |
| Export/Import | Creating and importing corpus exports |

### Queue Management

If your Celery queue gets clogged due to unexpected issues or high volume, you can purge it:

```bash
docker compose -f local.yml run django celery -A config.celery_app purge
```

**Warning**: Purging the queue can cause issues:
- Documents may lack PAWLs token layers (not annotatable)
- Corpus actions may not trigger
- In such cases, delete and re-upload affected documents

## Django Signals

OpenContracts uses Django signals for event-driven processing. Key signals include:

### Document Processing Signals

**Location**: `opencontractserver/documents/signals.py`

#### `post_save` on Document (Creation)

When a document is created, triggers the processing pipeline:

```python
@receiver(post_save, sender=Document)
def process_doc_on_create_atomic(sender, instance, created, **kwargs):
    if created:
        # Chain: thumbnail → parse → unlock
        transaction.on_commit(lambda: chain(
            extract_thumbnail.si(doc_id=instance.id),
            ingest_doc.si(user_id=instance.creator_id, doc_id=instance.id),
            set_doc_lock_state.si(locked=False, doc_id=instance.id),
        ).apply_async())
```

#### `document_processing_complete` (Custom Signal)

Fired when document processing finishes (from `set_doc_lock_state`):

```python
# Definition
document_processing_complete = Signal()  # provides: document, user_id

# Fired in set_doc_lock_state task
if not locked:
    document_processing_complete.send(
        sender=Document,
        document=document,
        user_id=document.creator_id,
    )
```

### Corpus Action Signals

**Location**: `opencontractserver/corpuses/signals.py`

#### `m2m_changed` on Corpus.documents

Triggers when documents are added to a corpus:

```python
@receiver(m2m_changed, sender=Corpus.documents.through)
def handle_document_added_to_corpus(sender, instance, action, pk_set, **kwargs):
    if action == "post_add":
        # Filter to only ready documents (backend_lock=False)
        ready_doc_ids = Document.objects.filter(
            id__in=pk_set,
            backend_lock=False,
        ).values_list("id", flat=True)

        if ready_doc_ids:
            process_corpus_action.si(...).apply_async()
```

#### `document_processing_complete` Handler

Triggers deferred corpus actions when document processing completes:

```python
@receiver(document_processing_complete)
def handle_document_processing_complete(sender, document, user_id, **kwargs):
    corpuses = Corpus.objects.filter(documents=document)
    for corpus in corpuses:
        process_corpus_action.si(...).apply_async()
```

## Document Processing Pipeline

When a document is uploaded, it goes through a processing pipeline:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOCUMENT PROCESSING PIPELINE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Document Created                                             │
│     └─► backend_lock = True                                      │
│                                                                  │
│  2. post_save Signal Fires                                       │
│     └─► Chains processing tasks                                  │
│                                                                  │
│  3. extract_thumbnail Task                                       │
│     └─► Generates preview image                                  │
│                                                                  │
│  4. ingest_doc Task                                              │
│     └─► Parses document (Docling/LlamaParse)                    │
│     └─► Extracts text layers                                     │
│     └─► Creates PAWLs tokens                                     │
│                                                                  │
│  5. set_doc_lock_state Task                                      │
│     └─► backend_lock = False                                     │
│     └─► processing_finished = now()                              │
│     └─► Fires document_processing_complete signal                │
│                                                                  │
│  6. Corpus Actions Triggered (if doc in corpus)                  │
│     └─► Fieldset extractions                                     │
│     └─► Analyzer analyses                                        │
│     └─► Agent actions                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Deferred Action Architecture

Corpus actions wait for document processing to complete before executing. This is critical for agent-based actions that need access to parsed document content.

### Why Deferred?

- Agent tools like `load_document_text` require parsed content
- Embedding-based search requires vector embeddings
- Thumbnail previews should be available

### How It Works

| Document State | M2M Signal Behavior | Processing Complete Behavior |
|----------------|---------------------|------------------------------|
| `backend_lock=True` | Skipped | Triggers actions |
| `backend_lock=False` | Triggers immediately | N/A |

### Timing

1. **New upload to corpus**:
   - M2M signal fires → document locked → skipped
   - Processing completes → signal fires → actions trigger

2. **Existing doc added to corpus**:
   - M2M signal fires → document unlocked → triggers immediately

## Signal Registration

Signals must be imported in the app's `ready()` method:

```python
# opencontractserver/corpuses/apps.py
class CorpusesConfig(AppConfig):
    def ready(self):
        from opencontractserver.corpuses import signals  # noqa: F401

# opencontractserver/documents/apps.py
class DocumentsConfig(AppConfig):
    def ready(self):
        from opencontractserver.documents import signals  # noqa: F401
```

## Monitoring

### Flower Dashboard

Access Celery monitoring at `http://localhost:5555` (when running locally).

### Logging

Key log patterns for debugging:

| Pattern | Component |
|---------|-----------|
| `[set_doc_lock_state]` | Document processing completion |
| `[CorpusSignal]` | Corpus action triggering |
| `[AgentCorpusAction]` | Agent action execution |
| `process_corpus_action()` | Action task processing |

## Related Documentation

- [Pipeline Overview](../pipelines/pipeline_overview.md)
- [CorpusAction System](./opencontract-corpus-actions.md)
- [Agent-Based Corpus Actions](./agent_corpus_actions_design.md)
