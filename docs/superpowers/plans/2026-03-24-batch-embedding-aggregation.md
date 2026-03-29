# Batch Embedding Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the existing `embed_texts_batch()` embedder methods into the Celery task layer so annotations are batch-embedded via `/embeddings/batch` instead of one HTTP request per annotation.

**Architecture:** New `_batch_embed_text_annotations()` helper aggregates text-only annotations into sub-batches of 50, calls `embedder.embed_texts_batch()`, and stores results. The existing `calculate_embeddings_for_annotation_batch` task partitions annotations (text-only vs multimodal) and delegates text-only to the helper. No changes to Celery task callers.

**Tech Stack:** Django, Celery, PostgreSQL + pgvector, numpy, requests

**Spec:** `docs/superpowers/specs/2026-03-24-batch-embedding-aggregation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `opencontractserver/constants/document_processing.py` | Modify (line 25) | Add `EMBEDDING_API_BATCH_SIZE` constant |
| `opencontractserver/pipeline/base/embedder.py` | Modify (after line 234) | Add `embed_texts_batch()` default on `BaseEmbedder` |
| `opencontractserver/pipeline/embedders/sent_transformer_microservice.py` | Modify (after line 155) | Add `embed_texts_batch()` override on `MicroserviceEmbedder` |
| `opencontractserver/pipeline/embedders/test_embedder.py` | Modify (after line 84, after line 137) | Add `embed_texts_batch()` to both test embedders |
| `opencontractserver/tasks/embeddings_task.py` | Modify (lines 484-521) | Add `_batch_embed_text_annotations()` helper, refactor task |
| `opencontractserver/tests/test_batch_embedding.py` | Create | Integration + mock tests for batch embedding |

---

### Task 1: Add `EMBEDDING_API_BATCH_SIZE` constant

**Files:**
- Modify: `opencontractserver/constants/document_processing.py:25`

- [ ] **Step 1: Add constant after `MAX_REEMBED_TASKS_PER_RUN`**

In `opencontractserver/constants/document_processing.py`, after line 25 (`MAX_REEMBED_TASKS_PER_RUN = 500`), add:

```python
# Number of texts to send per HTTP request to the embedder's /embeddings/batch endpoint.
# This is the API-level batch size, separate from EMBEDDING_BATCH_SIZE (task-level).
# The embedder's 100-text truncation guard is a safety net; this is the operative control.
EMBEDDING_API_BATCH_SIZE = 50
```

- [ ] **Step 2: Verify import works**

Run: `python -c "from opencontractserver.constants.document_processing import EMBEDDING_API_BATCH_SIZE; print(EMBEDDING_API_BATCH_SIZE)"`
Expected: `50`

- [ ] **Step 3: Commit**

```bash
git add opencontractserver/constants/document_processing.py
git commit -m "Add EMBEDDING_API_BATCH_SIZE constant for batch embedding sub-batching"
```

---

### Task 2: Add `embed_texts_batch()` default to `BaseEmbedder`

**Files:**
- Modify: `opencontractserver/pipeline/base/embedder.py` (after line 234)

- [ ] **Step 1: Add method to `BaseEmbedder`**

After the `embed_text_and_image` method (ends at line 234), add:

```python
    def embed_texts_batch(
        self, texts: list[str], **direct_kwargs
    ) -> Optional[list[Optional[list[float]]]]:
        """
        Generate embeddings for multiple texts. Sequential fallback implementation.

        Subclasses should override this for true batch API calls (e.g., POST to
        /embeddings/batch). This default loops embed_text() and catches per-text
        exceptions so the batch path works for any embedder.

        Args:
            texts: List of text strings to embed.
            **direct_kwargs: Keyword arguments passed to embed_text().

        Returns:
            List of embedding vectors (one per text). Individual entries may be
            None if that text failed. The outer list is always returned (never
            None) so callers can distinguish per-text failure from total batch
            failure.
        """
        results: list[Optional[list[float]]] = []
        for text in texts:
            try:
                results.append(self.embed_text(text, **direct_kwargs))
            except Exception as e:
                logger.warning(
                    f"{self.__class__.__name__}.embed_texts_batch: "
                    f"embed_text() raised for one text: {e}"
                )
                results.append(None)
        return results
```

- [ ] **Step 2: Verify no import errors**

Run: `docker compose -f local.yml run --rm django python -c "from opencontractserver.pipeline.base.embedder import BaseEmbedder; print(hasattr(BaseEmbedder, 'embed_texts_batch'))"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add opencontractserver/pipeline/base/embedder.py
git commit -m "Add embed_texts_batch() sequential fallback to BaseEmbedder"
```

---

### Task 3: Add `embed_texts_batch()` override to `MicroserviceEmbedder`

**Files:**
- Modify: `opencontractserver/pipeline/embedders/sent_transformer_microservice.py` (after line 155)

- [ ] **Step 1: Add method to `MicroserviceEmbedder`**

After `_embed_text_impl` (ends at line 155), add:

```python
    def embed_texts_batch(
        self, texts: list[str], **direct_kwargs
    ) -> Optional[list[list[float]]]:
        """
        Generate embeddings for multiple texts in one request via /embeddings/batch.

        Args:
            texts: List of text strings to embed (max 100).
            **direct_kwargs: Additional kwargs that can override settings.

        Returns:
            List of embedding vectors, or None on error (entire batch fails).
        """
        if len(texts) > 100:
            logger.warning(
                f"Batch size {len(texts)} exceeds max 100. Truncating."
            )
            texts = texts[:100]

        try:
            s = self.settings if self.settings is not None else self.Settings()

            merged_kwargs = {**self.get_component_settings(), **direct_kwargs}
            service_url = merged_kwargs.get(
                "embeddings_microservice_url", s.embeddings_microservice_url
            )
            api_key = merged_kwargs.get(
                "vector_embedder_api_key", s.vector_embedder_api_key
            )
            use_cloud_run_iam_auth = bool(
                merged_kwargs.get(
                    "use_cloud_run_iam_auth", s.use_cloud_run_iam_auth
                )
            )

            headers: dict[str, str] = {"Content-Type": "application/json"}
            if api_key:
                headers["X-API-Key"] = api_key

            headers = maybe_add_cloud_run_auth(
                service_url, headers, force=use_cloud_run_iam_auth
            )

            response = requests.post(
                f"{service_url}/embeddings/batch",
                json={"texts": texts},
                headers=headers,
                timeout=60,
            )

            if response.status_code == 200:
                embeddings_array = np.array(response.json()["embeddings"])
                if embeddings_array.ndim == 3:
                    embeddings_array = embeddings_array.squeeze(axis=1)
                if np.isnan(embeddings_array).any():
                    nan_indices = np.where(
                        np.isnan(embeddings_array).any(axis=1)
                    )[0]
                    logger.error(
                        f"Batch embeddings contain NaN at indices: "
                        f"{nan_indices.tolist()}. Batch size: {len(texts)}"
                    )
                    return None
                return embeddings_array.tolist()
            elif 400 <= response.status_code < 500:
                logger.error(
                    f"Batch embedding service returned client error "
                    f"{response.status_code}. Batch size: {len(texts)}"
                )
                return None
            else:
                logger.error(
                    f"Batch embedding service returned status "
                    f"{response.status_code}. May be transient."
                )
                return None
        except Exception as e:
            logger.error(
                f"MicroserviceEmbedder batch embedding failed: {e}"
            )
            return None
```

- [ ] **Step 2: Verify no import errors**

Run: `docker compose -f local.yml run --rm django python -c "from opencontractserver.pipeline.embedders.sent_transformer_microservice import MicroserviceEmbedder; print(hasattr(MicroserviceEmbedder, 'embed_texts_batch'))"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add opencontractserver/pipeline/embedders/sent_transformer_microservice.py
git commit -m "Add embed_texts_batch() to MicroserviceEmbedder for batch API calls"
```

---

### Task 4: Add `embed_texts_batch()` to test embedders

**Files:**
- Modify: `opencontractserver/pipeline/embedders/test_embedder.py` (after line 84, after line 137)

- [ ] **Step 1: Add to `TestEmbedder` after `_embed_text_impl` (line 84)**

```python
    def embed_texts_batch(
        self, texts: list[str], **direct_kwargs
    ) -> list[Optional[list[float]]]:
        """Batch embed using deterministic _embed_text_impl for each text."""
        return [self._embed_text_impl(text) for text in texts]
```

- [ ] **Step 2: Add to `TestMultimodalEmbedder` after `_embed_image_impl` (line 137)**

```python
    def embed_texts_batch(
        self, texts: list[str], **direct_kwargs
    ) -> list[Optional[list[float]]]:
        """Batch embed using deterministic _embed_text_impl for each text."""
        return [self._embed_text_impl(text) for text in texts]
```

- [ ] **Step 3: Verify**

Run: `docker compose -f local.yml run --rm django python -c "from opencontractserver.pipeline.embedders.test_embedder import TestEmbedder, TestMultimodalEmbedder; e = TestEmbedder(); r = e.embed_texts_batch(['hello', 'world']); print(len(r), len(r[0]))"`
Expected: `2 384`

- [ ] **Step 4: Commit**

```bash
git add opencontractserver/pipeline/embedders/test_embedder.py
git commit -m "Add embed_texts_batch() to test embedders for batch path testing"
```

---

### Task 5: Add `_batch_embed_text_annotations()` helper

**Files:**
- Modify: `opencontractserver/tasks/embeddings_task.py` (insert before `calculate_embeddings_for_annotation_batch` at line 423)

- [ ] **Step 1: Write the helper function**

Insert before line 423 (the `@shared_task` decorator for `calculate_embeddings_for_annotation_batch`):

```python
def _batch_embed_text_annotations(
    annotations: list[Annotation],
    embedder: BaseEmbedder,
    embedder_path: str,
    api_batch_size: int,
    result: dict,
) -> None:
    """
    Batch-embed text-only annotations via embedder.embed_texts_batch().

    Partitions annotations into sub-batches of api_batch_size, calls the
    embedder's batch method, and stores each resulting vector. Mutates
    result dict in-place. Never raises — all errors are caught and recorded.

    Args:
        annotations: List of Annotation objects to embed (text-only).
        embedder: The embedder instance (must have embed_texts_batch).
        embedder_path: Path identifier for storing embeddings.
        api_batch_size: Max texts per embed_texts_batch() call.
        result: Mutable dict with succeeded/failed/skipped/errors counts.
    """
    # 1. Filter: collect (annotation, text) pairs, skip empty
    items: list[tuple[Annotation, str]] = []
    for annot in annotations:
        text = annot.raw_text or ""
        if not text.strip():
            result["skipped"] += 1
            continue
        items.append((annot, text))

    if not items:
        return

    # 2. Sub-batch and call embedder
    for chunk_start in range(0, len(items), api_batch_size):
        chunk = items[chunk_start : chunk_start + api_batch_size]
        texts = [text for _, text in chunk]

        try:
            vectors = embedder.embed_texts_batch(texts)
        except Exception as e:
            logger.error(
                f"embed_texts_batch raised for chunk of {len(chunk)}: {e}"
            )
            for annot, _ in chunk:
                result["failed"] += 1
                result["errors"].append(
                    f"Annotation {annot.id}: batch call failed: {e}"
                )
            continue

        if vectors is None:
            logger.error(
                f"embed_texts_batch returned None for chunk of {len(chunk)}"
            )
            for annot, _ in chunk:
                result["failed"] += 1
                result["errors"].append(
                    f"Annotation {annot.id}: batch returned None"
                )
            continue

        # 3. Store each vector
        for (annot, _), vector in zip(chunk, vectors):
            if vector is None:
                result["failed"] += 1
                result["errors"].append(
                    f"Annotation {annot.id}: individual vector was None"
                )
                continue
            try:
                embedding = annot.add_embedding(embedder_path, vector)
                if embedding:
                    result["succeeded"] += 1
                else:
                    result["failed"] += 1
                    result["errors"].append(
                        f"Annotation {annot.id}: add_embedding returned None"
                    )
            except Exception as e:
                logger.error(
                    f"add_embedding failed for annotation {annot.id}: {e}"
                )
                result["failed"] += 1
                result["errors"].append(
                    f"Annotation {annot.id}: add_embedding error: {e}"
                )
```

- [ ] **Step 2: Add import for the new constant at the top of the file**

At the top of `embeddings_task.py`, the imports don't need changing yet — the constant is used in the task refactoring (Task 6). The helper receives `api_batch_size` as a parameter.

- [ ] **Step 3: Verify syntax**

Run: `docker compose -f local.yml run --rm django python -c "from opencontractserver.tasks.embeddings_task import _batch_embed_text_annotations; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add opencontractserver/tasks/embeddings_task.py
git commit -m "Add _batch_embed_text_annotations() helper for batch embedding"
```

---

### Task 6: Refactor `calculate_embeddings_for_annotation_batch` to use batch path

**Files:**
- Modify: `opencontractserver/tasks/embeddings_task.py:484-521` (the `embedder_path` branch of the for loop)

- [ ] **Step 1: Replace the one-by-one loop (lines 484-521) with partition + batch logic**

Replace lines 484-521 (from `for annotation_id in annotation_ids:` through the end of the for loop) with:

```python
    # Count annotations not found in DB
    found_annotations = []
    for annotation_id in annotation_ids:
        annotation = annotation_map.get(annotation_id)
        if not annotation:
            logger.warning(f"Annotation {annotation_id} not found, skipping")
            result["skipped"] += 1
        else:
            found_annotations.append(annotation)

    if embedder_path and embedder:
        # Batch path: partition into text-only vs multimodal
        can_embed_images = embedder.is_multimodal and embedder.supports_images
        text_only: list[Annotation] = []
        multimodal: list[Annotation] = []

        for annotation in found_annotations:
            modalities = annotation.content_modalities or [
                ContentModality.TEXT.value
            ]
            has_images = ContentModality.IMAGE.value in modalities
            if can_embed_images and has_images:
                multimodal.append(annotation)
            else:
                text_only.append(annotation)

        # Batch-embed text-only annotations
        if text_only:
            from opencontractserver.constants.document_processing import (
                EMBEDDING_API_BATCH_SIZE,
            )

            _batch_embed_text_annotations(
                text_only, embedder, embedder_path, EMBEDDING_API_BATCH_SIZE, result
            )

        # Process multimodal annotations individually
        for annotation in multimodal:
            try:
                succeeded = _create_embedding_for_annotation(
                    annotation, embedder, embedder_path
                )
                if succeeded:
                    result["succeeded"] += 1
                else:
                    result["failed"] += 1
                    result["errors"].append(
                        f"Annotation {annotation.id}: embedding generation returned False"
                    )
            except Exception as e:
                logger.error(f"Failed to embed annotation {annotation.id}: {e}")
                result["failed"] += 1
                result["errors"].append(
                    f"Annotation {annotation.id}: {str(e)}"
                )
    else:
        # Dual embedding path: process individually (unchanged)
        for annotation in found_annotations:
            try:
                effective_corpus_id = corpus_id or annotation.corpus_id
                _apply_dual_embedding_strategy(
                    obj=annotation,
                    text=annotation.raw_text or "",
                    corpus_id=int(effective_corpus_id) if effective_corpus_id else None,
                    obj_type="annotation",
                    obj_id=annotation.id,
                    embed_func=_create_embedding_for_annotation,
                )
                result["succeeded"] += 1
            except Exception as e:
                logger.error(f"Failed to embed annotation {annotation.id}: {e}")
                result["failed"] += 1
                result["errors"].append(
                    f"Annotation {annotation.id}: {str(e)}"
                )
```

- [ ] **Step 2: Verify syntax**

Run: `docker compose -f local.yml run --rm django python -c "from opencontractserver.tasks.embeddings_task import calculate_embeddings_for_annotation_batch; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_personal_corpus.py::TestCalculateEmbeddingsForAnnotationBatch -v --keepdb`
Expected: All 5 existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add opencontractserver/tasks/embeddings_task.py
git commit -m "Refactor batch task to partition and use batch embedding for text-only annotations"
```

---

### Task 7: Write integration tests

**Files:**
- Create: `opencontractserver/tests/test_batch_embedding.py`

- [ ] **Step 1: Create test file with all 8 tests**

```python
"""
Integration tests for batch embedding aggregation.

Tests that _batch_embed_text_annotations() and the refactored
calculate_embeddings_for_annotation_batch task correctly aggregate
annotations and call embed_texts_batch() in sub-batches.
"""
import uuid
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from opencontractserver.annotations.models import Annotation, Embedding
from opencontractserver.documents.models import Document
from opencontractserver.pipeline.embedders.test_embedder import TestEmbedder
from opencontractserver.tasks.embeddings_task import (
    _batch_embed_text_annotations,
    calculate_embeddings_for_annotation_batch,
)
from opencontractserver.types.enums import ContentModality

User = get_user_model()

TEST_EMBEDDER_PATH = (
    "opencontractserver.pipeline.embedders.test_embedder.TestEmbedder"
)


class TestBatchEmbedTextAnnotationsHelper(TestCase):
    """Tests for the _batch_embed_text_annotations helper function."""

    def setUp(self):
        self.user = User.objects.create_user(
            username=f"batchtest_{uuid.uuid4().hex[:8]}",
            email=f"batch_{uuid.uuid4().hex[:8]}@example.com",
            password="testpass123",
        )
        self.document = Document.objects.create(
            title="Batch Test Document",
            creator=self.user,
            backend_lock=False,
        )
        self.embedder = TestEmbedder()

    def _make_annotation(self, text="Some test text"):
        return Annotation.objects.create(
            raw_text=text,
            document=self.document,
            creator=self.user,
        )

    def _make_result(self):
        return {
            "total": 0,
            "succeeded": 0,
            "failed": 0,
            "skipped": 0,
            "errors": [],
        }

    def test_batch_embed_text_annotations_happy_path(self):
        """All annotations with text get Embedding records."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(5)]
        result = self._make_result()

        _batch_embed_text_annotations(
            annotations, self.embedder, TEST_EMBEDDER_PATH, 50, result
        )

        self.assertEqual(result["succeeded"], 5)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(result["skipped"], 0)

        for ann in annotations:
            self.assertTrue(
                Embedding.objects.filter(
                    annotation=ann, embedder_path=TEST_EMBEDDER_PATH
                ).exists(),
                f"Annotation {ann.id} should have an embedding",
            )

    def test_batch_embed_skips_empty_text(self):
        """Empty-text annotations are skipped, non-empty ones are embedded."""
        ann_with_text = self._make_annotation("Has text")
        ann_empty = self._make_annotation("")
        ann_whitespace = self._make_annotation("   ")
        result = self._make_result()

        _batch_embed_text_annotations(
            [ann_with_text, ann_empty, ann_whitespace],
            self.embedder,
            TEST_EMBEDDER_PATH,
            50,
            result,
        )

        self.assertEqual(result["succeeded"], 1)
        self.assertEqual(result["skipped"], 2)
        self.assertTrue(
            Embedding.objects.filter(
                annotation=ann_with_text, embedder_path=TEST_EMBEDDER_PATH
            ).exists()
        )
        self.assertFalse(
            Embedding.objects.filter(
                annotation=ann_empty, embedder_path=TEST_EMBEDDER_PATH
            ).exists()
        )

    def test_batch_embed_sub_batching(self):
        """Small api_batch_size forces multiple sub-batches; all still succeed."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(5)]
        result = self._make_result()

        # api_batch_size=2 means 3 sub-batches: [2, 2, 1]
        _batch_embed_text_annotations(
            annotations, self.embedder, TEST_EMBEDDER_PATH, 2, result
        )

        self.assertEqual(result["succeeded"], 5)
        self.assertEqual(result["failed"], 0)
        for ann in annotations:
            self.assertTrue(
                Embedding.objects.filter(
                    annotation=ann, embedder_path=TEST_EMBEDDER_PATH
                ).exists()
            )

    def test_batch_embed_partial_failure(self):
        """When embed_texts_batch returns [valid, None, valid], 2 succeed, 1 fails."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(3)]
        result = self._make_result()

        valid_vector = [0.1] * 384
        mock_embedder = MagicMock()
        mock_embedder.embed_texts_batch.return_value = [
            valid_vector,
            None,
            valid_vector,
        ]

        _batch_embed_text_annotations(
            annotations, mock_embedder, TEST_EMBEDDER_PATH, 50, result
        )

        self.assertEqual(result["succeeded"], 2)
        self.assertEqual(result["failed"], 1)
        self.assertTrue(
            any("individual vector was None" in e for e in result["errors"])
        )

    def test_batch_embed_entire_chunk_failure(self):
        """When embed_texts_batch returns None, all annotations in chunk fail."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(3)]
        result = self._make_result()

        mock_embedder = MagicMock()
        mock_embedder.embed_texts_batch.return_value = None

        _batch_embed_text_annotations(
            annotations, mock_embedder, TEST_EMBEDDER_PATH, 50, result
        )

        self.assertEqual(result["succeeded"], 0)
        self.assertEqual(result["failed"], 3)
        self.assertTrue(
            all("batch returned None" in e for e in result["errors"])
        )

    def test_batch_embed_exception_in_batch_call(self):
        """When embed_texts_batch raises, all annotations in chunk fail."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(3)]
        result = self._make_result()

        mock_embedder = MagicMock()
        mock_embedder.embed_texts_batch.side_effect = ConnectionError(
            "Service unavailable"
        )

        _batch_embed_text_annotations(
            annotations, mock_embedder, TEST_EMBEDDER_PATH, 50, result
        )

        self.assertEqual(result["succeeded"], 0)
        self.assertEqual(result["failed"], 3)
        self.assertTrue(
            all("batch call failed" in e for e in result["errors"])
        )


class TestBatchTaskIntegration(TestCase):
    """Integration tests for calculate_embeddings_for_annotation_batch with batch path."""

    def setUp(self):
        self.user = User.objects.create_user(
            username=f"tasktest_{uuid.uuid4().hex[:8]}",
            email=f"task_{uuid.uuid4().hex[:8]}@example.com",
            password="testpass123",
        )
        self.document = Document.objects.create(
            title="Task Test Document",
            creator=self.user,
            backend_lock=False,
        )

    def _make_annotation(self, text="Some test text", modalities=None):
        return Annotation.objects.create(
            raw_text=text,
            document=self.document,
            creator=self.user,
            content_modalities=modalities,
        )

    def test_batch_task_uses_batch_path(self):
        """Task with embedder_path creates embeddings via batch path."""
        annotations = [self._make_annotation(f"Text {i}") for i in range(4)]
        annotation_ids = [a.pk for a in annotations]

        result = calculate_embeddings_for_annotation_batch(
            annotation_ids=annotation_ids,
            embedder_path=TEST_EMBEDDER_PATH,
        )

        self.assertEqual(result["succeeded"], 4)
        self.assertEqual(result["failed"], 0)
        for ann in annotations:
            self.assertTrue(
                Embedding.objects.filter(
                    annotation=ann, embedder_path=TEST_EMBEDDER_PATH
                ).exists()
            )

    @patch(
        "opencontractserver.tasks.embeddings_task._apply_dual_embedding_strategy"
    )
    def test_batch_task_without_embedder_path_uses_dual_strategy(
        self, mock_dual
    ):
        """Task without embedder_path uses dual embedding (regression guard)."""
        ann = self._make_annotation("Test text")

        result = calculate_embeddings_for_annotation_batch(
            annotation_ids=[ann.pk],
            corpus_id=123,
        )

        self.assertEqual(result["succeeded"], 1)
        mock_dual.assert_called_once()

    def test_batch_task_partitions_multimodal(self):
        """Task sends IMAGE annotations to individual path when embedder is multimodal."""
        text_ann = self._make_annotation("Text only")
        image_ann = self._make_annotation(
            "Has image",
            modalities=[ContentModality.TEXT.value, ContentModality.IMAGE.value],
        )

        multimodal_path = "opencontractserver.pipeline.embedders.test_embedder.TestMultimodalEmbedder"

        with patch(
            "opencontractserver.tasks.embeddings_task._create_embedding_for_annotation"
        ) as mock_individual:
            mock_individual.return_value = True

            with patch(
                "opencontractserver.tasks.embeddings_task._batch_embed_text_annotations"
            ) as mock_batch:
                result = calculate_embeddings_for_annotation_batch(
                    annotation_ids=[text_ann.pk, image_ann.pk],
                    embedder_path=multimodal_path,
                )

                # text_ann should go to batch helper
                mock_batch.assert_called_once()
                batch_annotations = mock_batch.call_args[0][0]
                self.assertEqual(len(batch_annotations), 1)
                self.assertEqual(batch_annotations[0].pk, text_ann.pk)

                # image_ann should go to individual path
                mock_individual.assert_called_once()
                individual_ann = mock_individual.call_args[0][0]
                self.assertEqual(individual_ann.pk, image_ann.pk)


class TestBaseEmbedderSequentialFallback(TestCase):
    """Test that BaseEmbedder.embed_texts_batch() sequential fallback works."""

    def test_base_embedder_sequential_fallback(self):
        """BaseEmbedder subclass without embed_texts_batch override works through batch path."""
        user = User.objects.create_user(
            username=f"fallback_{uuid.uuid4().hex[:8]}",
            email=f"fallback_{uuid.uuid4().hex[:8]}@example.com",
            password="testpass123",
        )
        document = Document.objects.create(
            title="Fallback Test",
            creator=user,
            backend_lock=False,
        )

        annotations = [
            Annotation.objects.create(
                raw_text=f"Text {i}",
                document=document,
                creator=user,
            )
            for i in range(3)
        ]

        # TestEmbedder overrides embed_texts_batch, so we need a minimal
        # subclass that does NOT override it, using the BaseEmbedder default.
        from opencontractserver.pipeline.base.embedder import BaseEmbedder

        class FallbackEmbedder(BaseEmbedder):
            vector_size = 384
            supported_modalities = {ContentModality.TEXT}

            def _embed_text_impl(self, text, **kwargs):
                # Simple deterministic vector
                return [0.5] * self.vector_size

        embedder = FallbackEmbedder()
        result = {
            "total": 3,
            "succeeded": 0,
            "failed": 0,
            "skipped": 0,
            "errors": [],
        }

        _batch_embed_text_annotations(
            annotations,
            embedder,
            "test.fallback.embedder",
            2,  # small batch to test chunking
            result,
        )

        self.assertEqual(result["succeeded"], 3)
        self.assertEqual(result["failed"], 0)
        for ann in annotations:
            self.assertTrue(
                Embedding.objects.filter(
                    annotation=ann, embedder_path="test.fallback.embedder"
                ).exists()
            )

    def test_base_embedder_fallback_handles_per_text_exception(self):
        """Sequential fallback catches per-text exceptions, returns None for that slot."""
        from opencontractserver.pipeline.base.embedder import BaseEmbedder

        call_count = 0

        class FlakeyEmbedder(BaseEmbedder):
            vector_size = 384
            supported_modalities = {ContentModality.TEXT}

            def _embed_text_impl(self, text, **kwargs):
                nonlocal call_count
                call_count += 1
                if call_count == 2:
                    raise ValueError("Simulated failure on second text")
                return [0.5] * self.vector_size

        embedder = FlakeyEmbedder()
        results = embedder.embed_texts_batch(["a", "b", "c"])

        self.assertIsNotNone(results)
        self.assertEqual(len(results), 3)
        self.assertIsNotNone(results[0])
        self.assertIsNone(results[1])  # The one that raised
        self.assertIsNotNone(results[2])
```

- [ ] **Step 2: Run the tests**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_batch_embedding.py -v --keepdb`
Expected: All 11 tests pass.

- [ ] **Step 3: Run the existing batch task tests to verify no regressions**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_personal_corpus.py::TestCalculateEmbeddingsForAnnotationBatch -v --keepdb`
Expected: All 5 existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add opencontractserver/tests/test_batch_embedding.py
git commit -m "Add integration tests for batch embedding aggregation"
```

---

### Task 8: Run pre-commit and final verification

**Files:** All modified files

- [ ] **Step 1: Run pre-commit hooks**

Run: `pre-commit run --all-files`
Expected: All hooks pass. If formatting changes are needed, stage and commit them.

- [ ] **Step 2: Run full affected test suite**

Run: `docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_batch_embedding.py opencontractserver/tests/test_personal_corpus.py opencontractserver/tests/test_multimodal_embedder_unit.py -v --keepdb`
Expected: All tests pass — new batch tests, existing batch task tests, existing multimodal embedder tests.

- [ ] **Step 3: Update CHANGELOG.md**

Add an entry under `[Unreleased]` in `CHANGELOG.md`:

```markdown
### Added
- Batch embedding aggregation: `_batch_embed_text_annotations()` helper aggregates text-only annotations into sub-batches and calls `embed_texts_batch()`, reducing HTTP requests from N to ceil(N/50)
- `EMBEDDING_API_BATCH_SIZE` constant (50) for controlling API-level sub-batch size
- `BaseEmbedder.embed_texts_batch()` default sequential fallback
- `MicroserviceEmbedder.embed_texts_batch()` override for `/embeddings/batch` endpoint
- Integration tests for batch embedding path

### Changed
- `calculate_embeddings_for_annotation_batch` task now partitions annotations into text-only (batch path) and multimodal (individual path) when `embedder_path` is provided
```

- [ ] **Step 4: Fix any issues and commit**

If pre-commit or tests fail, fix and commit separately:
```bash
git add -u
git commit -m "Fix lint/formatting for batch embedding changes"
```
