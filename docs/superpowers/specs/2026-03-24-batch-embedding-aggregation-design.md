# Batch Embedding Aggregation Design

## Problem

PR 1148 added `embed_texts_batch()` to the multimodal embedder but never wired it into the task layer. The `calculate_embeddings_for_annotation_batch()` Celery task still processes annotations one at a time via `_create_embedding_for_annotation()` → `embed_text()`, making one HTTP request per annotation. The PR description's claimed `_batch_embed_text_annotations()` helper and `EMBEDDING_API_BATCH_SIZE` constant were never implemented.

## Goal

Complete the batch embedding pipeline: aggregate text-only annotations and submit them to the embedder's batch API endpoint in sub-batches, reducing HTTP requests from N to ceil(N/50).

## Approach

Approach B: New helper function, task delegates. The task partitions and delegates; the helper handles batch API calls. No changes to Celery task callers.

## Design

### 1. Constants

**File**: `opencontractserver/constants/document_processing.py`

Add `EMBEDDING_API_BATCH_SIZE = 50` — the number of texts sent per HTTP request to `/embeddings/batch`. Separate from `EMBEDDING_BATCH_SIZE` (100, Celery task grouping).

Two-level batching:
- Level 1: `EMBEDDING_BATCH_SIZE` (100) — annotation IDs per Celery task (existing, in `corpus_tasks.py`)
- Level 2: `EMBEDDING_API_BATCH_SIZE` (50) — texts per embedder HTTP call (new, in helper)

The 100-text truncation guard in embedder overrides is a safety net in case the embedder is called outside the helper. The operative batch-size control is `EMBEDDING_API_BATCH_SIZE` in the helper.

### 2. BaseEmbedder default

**File**: `opencontractserver/pipeline/base/embedder.py`

Add `embed_texts_batch(texts: list[str], **direct_kwargs) -> Optional[list[Optional[list[float]]]]`:
- Default: sequential fallback — loops `embed_text()` (which handles its own settings merging), catches per-text exceptions, returns `None` for that text's slot
- Returns the full list (never returns `None` at the outer level) — callers can distinguish per-text failure from total batch failure
- Ensures every embedder works with the batch path without a native override

**Return type note**: The base default returns `Optional[list[Optional[list[float]]]]` with per-element `None` for individual failures. Real HTTP overrides (MicroserviceEmbedder, multimodal) return `Optional[list[list[float]]]` — all-or-nothing (the entire return is `None` on error, or a full list of vectors). The helper handles both: if the outer return is `None`, fail the entire chunk; if it's a list, check per-element.

**Settings merging**: The base default delegates to `embed_text()`, which already merges `get_component_settings()`. Overrides must call `self.get_component_settings()` themselves (same pattern as `embed_text` → `_embed_text_impl`). No `_impl` pattern needed — this is a convenience batch method, not part of the core abstract contract.

### 3. MicroserviceEmbedder override

**File**: `opencontractserver/pipeline/embedders/sent_transformer_microservice.py`

Add `embed_texts_batch()` override:
- Inlines URL/headers construction from `_embed_text_impl` (MicroserviceEmbedder does not have `_get_service_config` — that's only on `BaseMultimodalMicroserviceEmbedder`)
- POSTs to `{service_url}/embeddings/batch` with `{"texts": [...]}`
- Timeout: 60s
- Max 100 texts per call (truncates with warning — safety net)
- Handles: NaN detection, 3D→2D squeeze, 4xx/5xx distinction
- Returns `None` on error (entire batch fails)
- Same API contract as `BaseMultimodalMicroserviceEmbedder.embed_texts_batch()`

No changes to `BaseMultimodalMicroserviceEmbedder` — it already has `embed_texts_batch()`.

### 4. Helper function

**File**: `opencontractserver/tasks/embeddings_task.py`

New function `_batch_embed_text_annotations()`:

```
def _batch_embed_text_annotations(
    annotations: list[Annotation],
    embedder: BaseEmbedder,
    embedder_path: str,
    api_batch_size: int,
    result: dict,
) -> None:
```

Algorithm:
1. Filter: skip annotations with empty/whitespace-only `raw_text` (increment `result["skipped"]`)
2. Collect: build `list[tuple[Annotation, str]]` for non-empty items
3. Sub-batch: chunk into groups of `api_batch_size`
4. Per chunk: call `embedder.embed_texts_batch(texts)`
   - Call raises or returns `None` → mark all annotations in that chunk as failed, log error, continue to next chunk
   - Returns a list → iterate paired with annotations:
     - Individual vector is `None` → mark that annotation failed, continue
     - Valid vector → `annotation.add_embedding(embedder_path, vector)`, increment succeeded
     - `add_embedding` raises → mark that annotation failed, log, continue

Properties: mutates `result` in-place, never raises, one failed chunk doesn't stop the rest.

**Retry asymmetry (by design)**: The batch path (with `embedder_path`) reports failures in the return dict but does not raise — Celery considers the task successful. The dual-embedding path (without `embedder_path`) raises `EmbeddingGenerationError` on default-embedding failure, triggering Celery retries. This is intentional: the batch path is used by `ensure_embeddings_for_corpus` and `reembed_corpus`, which are idempotent — re-running them picks up any annotations that failed. Retrying the entire batch for one failed annotation would be wasteful.

### 5. Task refactoring

**File**: `opencontractserver/tasks/embeddings_task.py`

Modify `calculate_embeddings_for_annotation_batch()`:

**When `embedder_path` is provided** (batch-eligible):
1. Partition annotations into two lists:
   - `text_only`: annotations where `content_modalities` is `None`, empty, or contains only TEXT; OR the embedder is not multimodal (`not embedder.is_multimodal or not embedder.supports_images`). For text-only embedders like `MicroserviceEmbedder`, ALL annotations go here.
   - `multimodal`: annotations with `ContentModality.IMAGE` in `content_modalities` AND `embedder.is_multimodal and embedder.supports_images`
2. Pass `text_only` → `_batch_embed_text_annotations(annotations, embedder, embedder_path, EMBEDDING_API_BATCH_SIZE, result)`
3. Loop `multimodal` individually → `_create_embedding_for_annotation()` (unchanged — these need image extraction and weighted combination)

**When no `embedder_path`** (dual embedding): unchanged individual loop with `_apply_dual_embedding_strategy`.

**No changes to callers** — `ensure_embeddings_for_corpus` and `reembed_corpus` already pass `embedder_path`.

### 6. TestEmbedder changes

**File**: `opencontractserver/pipeline/embedders/test_embedder.py`

Both `TestEmbedder` and `TestMultimodalEmbedder` get `embed_texts_batch()` overrides: simple loop over `_embed_text_impl()` collecting results into a list. Deterministic and fast — no HTTP calls.

### 7. Integration tests

**File**: `opencontractserver/tests/test_batch_embedding.py`

| # | Test | Type | What it verifies |
|---|------|------|-----------------|
| 1 | `test_batch_embed_text_annotations_happy_path` | Integration | N annotations with text all get Embedding records |
| 2 | `test_batch_embed_skips_empty_text` | Integration | Empty-text annotations skipped, non-empty embedded |
| 3 | `test_batch_embed_sub_batching` | Integration | `api_batch_size=2` with 5 annotations all succeed |
| 4 | `test_batch_task_uses_batch_path` | Integration | Full task with `embedder_path` creates embeddings |
| 5 | `test_batch_task_without_embedder_path_uses_dual_strategy` | Integration | Dual embedding regression guard |
| 6 | `test_batch_embed_partial_failure` | Mock | `[valid, None, valid]` → 2 succeeded, 1 failed |
| 7 | `test_batch_embed_entire_chunk_failure` | Mock | `None` return → all marked failed |
| 8 | `test_base_embedder_sequential_fallback` | Integration | BaseEmbedder subclass without `embed_texts_batch` override works through batch path, including per-text exception handling |

Tests 1-5, 8 use real DB + `TestEmbedder` (or a minimal BaseEmbedder subclass for test 8). Tests 6-7 use targeted mocks for error paths only.

**Note on test 6**: The partial-failure return (`[valid, None, valid]`) is produced by the `BaseEmbedder` sequential fallback when individual `embed_text()` calls fail. Real HTTP overrides are all-or-nothing. Test 6 exercises the fallback path.

## Files changed

| File | Change |
|------|--------|
| `opencontractserver/constants/document_processing.py` | Add `EMBEDDING_API_BATCH_SIZE` |
| `opencontractserver/pipeline/base/embedder.py` | Add `embed_texts_batch()` default |
| `opencontractserver/pipeline/embedders/sent_transformer_microservice.py` | Add `embed_texts_batch()` override |
| `opencontractserver/pipeline/embedders/test_embedder.py` | Add `embed_texts_batch()` to both test embedders |
| `opencontractserver/tasks/embeddings_task.py` | Add `_batch_embed_text_annotations()`, refactor task |
| `opencontractserver/tests/test_batch_embedding.py` | New test file |

## What does NOT change

- `opencontractserver/tasks/corpus_tasks.py` — callers already pass `embedder_path`
- `opencontractserver/pipeline/embedders/multimodal_microservice.py` — already has `embed_texts_batch()`
- The dual-embedding (no `embedder_path`) code path — unchanged
- The multimodal per-annotation embedding path — unchanged
