# Corpus Forking Remediation Plan

## Overview

This document outlines a phased remediation plan to address issues identified in the corpus forking functionality analysis. The plan prioritizes fixes by impact and complexity, with round-trip tests to validate each phase.

---

## Phase 1: Critical Bug Fixes (Immediate)

### 1.1 Fix Corpus Title Not Getting `[FORK]` Prefix

**File:** `config/graphql/mutations.py`
**Line:** ~1184

**Current (broken):**
```python
corpus.title = f"{corpus.title}"
```

**Fix:**
```python
corpus.title = f"[FORK] {corpus.title}"
```

**Test:** `test_forked_corpus_has_fork_prefix_in_title`

---

### 1.2 Fix Test Assertion Bug

**File:** `opencontractserver/tests/test_corpus_forking.py`
**Line:** 99

**Current (broken):**
```python
assert forked_labelset_labels.count() == original_labelset_labels.all()
```

**Fix:**
```python
assert forked_labelset_labels.count() == original_labelset_labels.count()
```

---

### 1.3 Unify `build_fork_corpus_task()` with Mutation

**File:** `opencontractserver/utils/corpus_forking.py`

**Issues:**
1. Uses `corpus.documents.all()` instead of `corpus.get_documents()`
2. Doesn't filter out analysis-generated annotations
3. Grants `PermissionTypes.ALL` vs `PermissionTypes.CRUD`

**Fix:** Refactor to share logic with mutation or deprecate utility function.

**Recommended approach:** Create a shared helper:

```python
# opencontractserver/utils/corpus_forking.py

def collect_fork_data(corpus: Corpus) -> dict:
    """
    Collect data for forking a corpus.
    Single source of truth for what gets copied during a fork.

    Returns:
        dict with keys: doc_ids, annotation_ids, label_set_id
    """
    # Use get_documents() to respect DocumentPath soft-deletes
    doc_ids = list(corpus.get_documents().values_list("id", flat=True))

    # Only copy user annotations (not analysis-generated)
    annotation_ids = list(
        Annotation.objects.filter(
            corpus_id=corpus.pk,
            analysis__isnull=True,
        ).values_list("id", flat=True)
    )

    label_set_id = corpus.label_set_id

    return {
        "doc_ids": doc_ids,
        "annotation_ids": annotation_ids,
        "label_set_id": label_set_id,
    }
```

---

## Phase 2: Relationship Copying (High Priority)

### 2.1 Add Relationship Cloning to Fork Task

**File:** `opencontractserver/tasks/fork_tasks.py`

**Implementation:**

```python
# After annotation copying section (around line 206)

# 4. Clone relationships
annotation_map = {}  # Built during annotation cloning: old_id -> new_id

relationship_ids = list(
    Relationship.objects.filter(
        Q(source_annotations__corpus_id=original_corpus_pk) |
        Q(target_annotations__corpus_id=original_corpus_pk),
        analysis__isnull=True,  # Only user relationships
    ).distinct().values_list("id", flat=True)
)

for old_rel_id in relationship_ids:
    old_rel = Relationship.objects.get(pk=old_rel_id)

    # Map source annotations
    new_source_ids = [
        annotation_map[src_id]
        for src_id in old_rel.source_annotations.values_list("id", flat=True)
        if src_id in annotation_map
    ]

    # Map target annotations
    new_target_ids = [
        annotation_map[tgt_id]
        for tgt_id in old_rel.target_annotations.values_list("id", flat=True)
        if tgt_id in annotation_map
    ]

    # Only create if we have valid mappings
    if new_source_ids and new_target_ids:
        new_rel = Relationship.objects.create(
            creator_id=user_id,
            corpus_id=new_corpus_id,
            document_id=doc_map.get(old_rel.document_id),
            relationship_label_id=label_map.get(old_rel.relationship_label_id),
            notes=old_rel.notes,
        )
        new_rel.source_annotations.set(new_source_ids)
        new_rel.target_annotations.set(new_target_ids)

        set_permissions_for_obj_to_user(user, new_rel, [PermissionTypes.CRUD])
```

**Test:** `test_relationships_preserved_after_fork`

---

## Phase 3: Folder Structure Copying (High Priority)

### 3.1 Clone Folder Hierarchy Before Documents

**File:** `opencontractserver/tasks/fork_tasks.py`

**Implementation:**

```python
# Before document cloning section

# Clone folder structure
folder_map = {}  # old_folder_id -> new_folder_id

# Get folders in tree order (parents before children)
original_folders = CorpusFolder.objects.filter(
    corpus_id=original_corpus_pk
).order_by("tree_depth", "pk")

for old_folder in original_folders:
    new_folder = CorpusFolder(
        name=old_folder.name,
        corpus_id=new_corpus_id,
        description=old_folder.description,
        color=old_folder.color,
        icon=old_folder.icon,
        tags=old_folder.tags.copy() if old_folder.tags else [],
        is_public=old_folder.is_public,
        creator_id=user_id,
        parent_id=folder_map.get(old_folder.parent_id),  # Map parent
    )
    new_folder.save()
    folder_map[old_folder.pk] = new_folder.pk

    set_permissions_for_obj_to_user(user, new_folder, [PermissionTypes.CRUD])
```

### 3.2 Update Document Addition to Preserve Folder

**Modification to document cloning loop:**

```python
# Get the DocumentPath for this document to find its folder
original_path = DocumentPath.objects.filter(
    corpus_id=original_corpus_pk,
    document=document,
    is_current=True,
    is_deleted=False,
).first()

target_folder_id = None
if original_path and original_path.folder_id:
    target_folder_id = folder_map.get(original_path.folder_id)

# Pass folder to add_document
corpus.add_document(
    document=cloned_doc,
    user=user,
    folder_id=target_folder_id,
    path=original_path.path if original_path else None,
)
```

**Test:** `test_folder_structure_preserved_after_fork`

---

## Phase 4: Corpus Metadata Copying (Medium Priority)

### 4.1 Copy Corpus-Level Fields

**File:** `opencontractserver/tasks/fork_tasks.py`

Add after corpus creation in mutation:

```python
# Copy corpus metadata fields that aren't automatically preserved
def copy_corpus_metadata(source_corpus: Corpus, target_corpus: Corpus, user_id: int):
    """Copy corpus-level metadata fields to forked corpus."""

    # Copy file fields
    if source_corpus.md_description:
        content = source_corpus.md_description.read()
        target_corpus.md_description.save(
            f"fork_{target_corpus.pk}.md",
            ContentFile(content),
            save=False
        )

    if source_corpus.icon:
        content = source_corpus.icon.read()
        target_corpus.icon.save(
            f"fork_{target_corpus.pk}_icon",
            ContentFile(content),
            save=False
        )

    # Copy JSON/text fields
    target_corpus.preferred_embedder = source_corpus.preferred_embedder
    target_corpus.post_processors = source_corpus.post_processors.copy()
    target_corpus.corpus_agent_instructions = source_corpus.corpus_agent_instructions
    target_corpus.document_agent_instructions = source_corpus.document_agent_instructions
    target_corpus.allow_comments = source_corpus.allow_comments

    target_corpus.save()

    # Copy category associations
    target_corpus.categories.set(source_corpus.categories.all())
```

**Test:** `test_corpus_metadata_preserved_after_fork`

---

## Phase 5: Notes Copying (Medium Priority)

### 5.1 Clone Document Notes

**File:** `opencontractserver/tasks/fork_tasks.py`

```python
# After document cloning, before annotations
from opencontractserver.annotations.models import Note

for old_doc_id, new_doc_id in doc_map.items():
    for note in Note.objects.filter(document_id=old_doc_id):
        new_note = Note(
            document_id=new_doc_id,
            corpus_id=new_corpus_id,
            title=note.title,
            content=note.content,
            page=note.page,
            json=note.json.copy() if note.json else None,
            creator_id=user_id,
        )
        new_note.save()
        set_permissions_for_obj_to_user(user, new_note, [PermissionTypes.CRUD])
```

**Test:** `test_notes_preserved_after_fork`

---

## Phase 6: Error Recovery & Cleanup (Lower Priority)

### 6.1 Implement Cleanup on Fork Failure

```python
@shared_task
def fork_corpus(new_corpus_id, doc_ids, label_set_id, annotation_ids, user_id):
    corpus = Corpus.objects.get(id=new_corpus_id)

    try:
        with transaction.atomic():
            # ... existing fork logic ...
            pass

    except Exception as e:
        logger.error(f"Fork failed for corpus {new_corpus_id}: {e}")

        # Cleanup partially created objects
        cleanup_failed_fork(new_corpus_id)

        corpus.backend_lock = False
        corpus.error = True
        corpus.save()
        return None


def cleanup_failed_fork(corpus_id: int):
    """Remove all objects created during a failed fork attempt."""
    from opencontractserver.annotations.models import Annotation, Note
    from opencontractserver.documents.models import Document, DocumentPath

    # Delete in dependency order
    Annotation.objects.filter(corpus_id=corpus_id).delete()
    Note.objects.filter(corpus_id=corpus_id).delete()
    Relationship.objects.filter(corpus_id=corpus_id).delete()

    # Get documents before deleting paths
    doc_ids = DocumentPath.objects.filter(corpus_id=corpus_id).values_list(
        "document_id", flat=True
    )

    DocumentPath.objects.filter(corpus_id=corpus_id).delete()
    CorpusFolder.objects.filter(corpus_id=corpus_id).delete()
    Document.objects.filter(id__in=doc_ids).delete()

    # Don't delete corpus - it has error=True for user visibility
    logger.info(f"Cleaned up failed fork corpus {corpus_id}")
```

---

## Round-Trip Test Strategy

### Test Philosophy

Round-trip tests validate that forking is **lossless** (or intentionally lossy with documented exclusions) by:

1. Creating a corpus with known data
2. Forking it
3. Comparing fork to original
4. Forking the fork (generation 2)
5. Comparing generation 2 to generation 1
6. Repeating for N generations

### Data Integrity Assertions

For each generation, assert:

| Data Type | Assertion |
|-----------|-----------|
| Documents | Same count, same titles (minus `[FORK]` prefix) |
| Annotations | Same count, same text/positions |
| Relationships | Same count, same source→target structure |
| Labels | Same count, same text/colors |
| Folders | Same hierarchy, same names |
| Notes | Same count, same content |

### Degradation Detection

Track and alert on:
- Count decreases between generations
- Data corruption (changed text/positions)
- Lost relationships (orphaned annotations)
- Broken folder hierarchies

---

## Implementation Timeline

| Phase | Description | Complexity | Dependencies |
|-------|-------------|------------|--------------|
| 1 | Critical Bug Fixes | Low | None |
| 2 | Relationship Copying | Medium | Phase 1 |
| 3 | Folder Structure | Medium | Phase 1 |
| 4 | Corpus Metadata | Low | Phase 1 |
| 5 | Notes Copying | Low | Phase 1 |
| 6 | Error Recovery | Medium | Phases 2-5 |

---

## Success Criteria

1. All round-trip tests pass for 5+ generations
2. No data loss between generations (except documented exclusions)
3. Fork time remains O(n) with corpus size
4. Memory usage bounded during large corpus forks
5. Existing fork tests continue to pass
