# Embedding Unique Constraint Remediation Plan

## Summary

Migration 0059 adds unique constraints to prevent duplicate embeddings per (embedder_path, parent_object). While the constraints are correct, there are several edge cases that could cause failures in production or tests.

---

## ✅ Implementation Status (2026-01-17)

**Issues 1, 2, and 3 have been implemented:**

### Issue 1 & 3: Fixed in `opencontractserver/shared/Managers.py`
- Replaced `visible_to_user()` with `filter()` for existence checks
- Added try/except `IntegrityError` pattern to handle race conditions
- If a concurrent worker creates the embedding first, we fetch and update instead of failing

### Issue 2: Fixed in `opencontractserver/annotations/migrations/0059_add_embedding_unique_constraints.py`
- Added `RunPython(cleanup_duplicate_embeddings)` as the first migration operation
- Cleanup finds duplicate groups for each parent type (document, annotation, note, conversation, message)
- Keeps the "best" embedding using this priority: (1) most vector fields populated, (2) most recent `modified` timestamp, (3) highest ID
- Logs all deletions for audit trail
- Runs BEFORE adding unique constraints

---

## Issue 1: Race Condition in `store_embedding` (HIGH PRIORITY)

**Problem:** The current "find-then-create" pattern in `EmbeddingManager.store_embedding()` is not atomic. Two parallel Celery workers can both find nothing, then both try to create, causing `IntegrityError`.

**Remediation:** Replace with atomic `update_or_create` or wrap in `try/except IntegrityError` with retry.

**File:** `opencontractserver/shared/Managers.py:368-423`

**Proposed Change:**
```python
def store_embedding(self, *, creator, dimension, vector, embedder_path, ...):
    field_name = self._get_vector_field_name(dimension)

    # Build lookup kwargs for the parent object
    lookup = {"embedder_path": embedder_path}
    if document_id:
        lookup["document_id"] = document_id
    elif annotation_id:
        lookup["annotation_id"] = annotation_id
    # ... etc for other FKs

    # Atomic update_or_create to handle race conditions
    embedding, created = self.update_or_create(
        defaults={field_name: vector, "creator": creator},
        **lookup,
    )

    # If updating existing, also update the vector field
    if not created:
        setattr(embedding, field_name, vector)
        embedding.save(update_fields=[field_name])

    return embedding
```

**Alternative:** Wrap in try/except and retry on IntegrityError:
```python
from django.db import IntegrityError

try:
    return self.create(...)
except IntegrityError:
    # Race condition - another worker created it first, fetch and update
    embedding = self.get(embedder_path=embedder_path, annotation_id=annotation_id, ...)
    setattr(embedding, field_name, vector)
    embedding.save()
    return embedding
```

---

## Issue 2: Migration Failure on Existing Duplicates (CRITICAL)

**Problem:** If production DB has duplicate embeddings from before constraints, `AddConstraint` fails.

**Remediation:** Add a data migration step BEFORE 0059 that identifies and resolves duplicates.

**New Migration:** `0059a_cleanup_duplicate_embeddings.py` (run before constraint migration)

**Proposed Approach:**
```python
def cleanup_duplicates(apps, schema_editor):
    Embedding = apps.get_model("annotations", "Embedding")

    # For each parent type, find duplicates and keep only the newest
    for parent_field in ["document", "annotation", "note", "conversation", "message"]:
        # Find duplicates: same embedder_path + same parent
        duplicates = (
            Embedding.objects
            .filter(**{f"{parent_field}__isnull": False})
            .values("embedder_path", f"{parent_field}_id")
            .annotate(count=Count("id"), max_id=Max("id"))
            .filter(count__gt=1)
        )

        for dup in duplicates:
            # Delete all but the newest (max_id)
            Embedding.objects.filter(
                embedder_path=dup["embedder_path"],
                **{f"{parent_field}_id": dup[f"{parent_field}_id"]},
            ).exclude(id=dup["max_id"]).delete()
```

**Migration Ordering:**
- `0058_add_vector_1024_and_4096_fields`
- `0059a_cleanup_duplicate_embeddings` (NEW - data migration)
- `0059_add_embedding_unique_constraints` (renamed to `0059b_...`)

---

## Issue 3: Visibility Filtering False Negatives (MEDIUM)

**Problem:** `store_embedding` uses `.visible_to_user(creator)` which might not see embeddings created by other users, leading to constraint violations.

**Remediation:** For existence checks, bypass permission filtering. The constraint doesn't care about permissions.

**Proposed Change:** In `store_embedding`, use `self.filter()` instead of `self.visible_to_user()`:
```python
# Before (problematic):
embedding = self.visible_to_user(user=creator).filter(...).first()

# After (correct):
embedding = self.filter(
    embedder_path=embedder_path,
    document_id=document_id,
    annotation_id=annotation_id,
    ...
).first()
```

This is safe because we're just checking existence, not returning the embedding to an unauthorized user.

---

## Issue 4: NULL embedder_path Edge Case (LOW)

**Problem:** `embedder_path` is nullable. PostgreSQL's NULL != NULL means multiple embeddings with NULL embedder_path for same parent don't violate the constraint.

**Assessment:** This is likely acceptable. Embeddings without an embedder_path are either:
- Legacy data before embedder tracking was added
- Error states that should be cleaned up separately

**Recommendation:** No code change needed, but document this behavior. Optionally add a NOT NULL constraint to `embedder_path` in a future migration if all production data has values.

---

## Issue 5: Test Files Using Direct `create()` (MEDIUM)

**Problem:** Tests bypassing `store_embedding` can create constraint-violating data.

**Files to Audit:**
1. `test_document_admin.py` - lines 53, 70, 76, 235, 241, 247
2. `test_version_aware_vector_store.py` - 15+ instances
3. `test_conversation_search.py` - 25+ instances
4. `test_pydantic_ai_conversation_adapters.py` - 4 instances
5. `test_backfill_default_embeddings.py` - 1 instance

**Remediation Strategy:**
- For each test file, verify each `Embedding.objects.create()` uses a unique (embedder_path, parent) combination
- Use unique embedder_path values like `f"test-embedder-{test_name}-{index}"`
- Or use `store_embedding()` which handles duplicates

---

## Issue 6: Multi-FK Edge Case (LOW)

**Problem:** An Embedding could theoretically have both `document_id` and `annotation_id` set, violating the "exactly one parent" design.

**Remediation (optional):** Add a check constraint ensuring exactly one FK is non-null:
```python
models.CheckConstraint(
    check=(
        Q(document__isnull=False, annotation__isnull=True, note__isnull=True, ...) |
        Q(document__isnull=True, annotation__isnull=False, note__isnull=True, ...) |
        # ... other valid combinations
    ),
    name="embedding_exactly_one_parent",
)
```

**Recommendation:** Defer this - it's a theoretical edge case and the current code doesn't create such records.

---

## Implementation Order

1. **Phase 1 - Critical (before merge):**
   - Fix `store_embedding` race condition (Issue 1)
   - Add duplicate cleanup migration (Issue 2)
   - Fix visibility filtering (Issue 3)

2. **Phase 2 - Test hardening (can be follow-up PR):**
   - Audit and fix test files (Issue 5)

3. **Phase 3 - Optional improvements (future):**
   - Document NULL embedder_path behavior (Issue 4)
   - Consider single-parent check constraint (Issue 6)

---

## Questions for Review

1. **Duplicate resolution strategy:** When cleaning up duplicates, should we keep the newest (most recent modified) or oldest (original) embedding?

2. **Visibility filtering removal:** Is it acceptable to bypass permission filtering in `store_embedding` for the existence check? The alternative is more complex transaction handling.

3. **Test file scope:** Should we fix all test files now, or just the ones that are currently failing?
