# Corpus Forking Edit Plan: Folders & Relationships

This document details the precise edits required to preserve folders and relationships during corpus forking.

## Overview

**Problem**: Current fork implementation doesn't copy:
1. `CorpusFolder` objects (folder hierarchy)
2. `Relationship` objects (annotation connections)
3. `DocumentPath.folder` assignments

**Solution**: Extend fork task to clone these objects with proper ID mapping.

---

## Edit 1: Fix Corpus Title Bug

**File**: `config/graphql/mutations.py`
**Line**: 1184

**Current**:
```python
corpus.title = f"{corpus.title}"
```

**Change to**:
```python
corpus.title = f"[FORK] {corpus.title}"
```

---

## Edit 2: Update Mutation to Collect Additional IDs

**File**: `config/graphql/mutations.py`
**Location**: After line 1177 (after doc_ids collection)

**Add**:
```python
# Collect folder IDs for cloning (in tree order for proper parent mapping)
folder_ids = list(
    CorpusFolder.objects.filter(corpus_id=corpus_pk)
    .order_by("tree_depth", "pk")
    .values_list("id", flat=True)
)

# Collect relationship IDs (user relationships only, not analysis-generated)
relationship_ids = list(
    Relationship.objects.filter(
        corpus_id=corpus_pk,
        analysis__isnull=True,
    ).values_list("id", flat=True)
)
```

**Update task call** (line 1203-1205):
```python
fork_corpus.si(
    corpus.id,
    doc_ids,
    label_set_id,
    annotation_ids,
    folder_ids,        # NEW
    relationship_ids,  # NEW
    info.context.user.id
).apply_async()
```

**Required import** (add to imports section):
```python
from opencontractserver.corpuses.models import CorpusFolder
from opencontractserver.annotations.models import Relationship
```

---

## Edit 3: Update Fork Task Signature

**File**: `opencontractserver/tasks/fork_tasks.py`
**Line**: 24-31

**Current**:
```python
@celery_app.task()
def fork_corpus(
    new_corpus_id: str,
    doc_ids: list[str],
    label_set_id: str,
    annotation_ids: list[str],
    user_id: str,
) -> Optional[str]:
```

**Change to**:
```python
@celery_app.task()
def fork_corpus(
    new_corpus_id: str,
    doc_ids: list[str],
    label_set_id: str,
    annotation_ids: list[str],
    folder_ids: list[str],        # NEW
    relationship_ids: list[str],  # NEW
    user_id: str,
) -> Optional[str]:
```

**Update imports** (add):
```python
from opencontractserver.annotations.models import Annotation, AnnotationLabel, LabelSet, Relationship
from opencontractserver.corpuses.models import Corpus, CorpusFolder
from opencontractserver.documents.models import Document, DocumentPath
```

---

## Edit 4: Add Folder Cloning (Before Document Cloning)

**File**: `opencontractserver/tasks/fork_tasks.py`
**Location**: After label cloning section (around line 117), before document cloning

**Add**:
```python
# ============================================================
# Clone folder structure (must be before documents)
# ============================================================
folder_map = {}  # old_folder_id -> new_folder_id

logger.info(f"Cloning {len(folder_ids)} folders")
for old_folder in CorpusFolder.objects.filter(pk__in=folder_ids).order_by(
    "tree_depth", "pk"
):
    try:
        new_folder = CorpusFolder(
            name=old_folder.name,
            corpus_id=new_corpus_id,
            description=old_folder.description,
            color=old_folder.color,
            icon=old_folder.icon,
            tags=old_folder.tags.copy() if old_folder.tags else [],
            is_public=old_folder.is_public,
            creator_id=user_id,
            # Map parent to new folder ID (None if root)
            parent_id=folder_map.get(old_folder.parent_id),
        )
        new_folder.save()
        folder_map[old_folder.pk] = new_folder.pk

        set_permissions_for_obj_to_user(
            user_id, new_folder, [PermissionTypes.CRUD]
        )
        logger.info(f"Cloned folder {old_folder.name} -> {new_folder.pk}")

    except Exception as e:
        logger.error(f"ERROR cloning folder {old_folder.pk}: {e}")
        raise e
```

---

## Edit 5: Modify Document Cloning to Preserve Folder Assignment

**File**: `opencontractserver/tasks/fork_tasks.py`
**Location**: Inside document cloning loop (around line 166)

The current code calls `corpus.add_document(document=document, user=user_id)` which creates a new DocumentPath. We need to preserve the original folder assignment.

**Current** (line 166):
```python
corpus.add_document(document=document, user=user_id)
```

**Change to**:
```python
# Get original DocumentPath to preserve folder and path
original_corpus_id = corpus.parent_id
original_path = DocumentPath.objects.filter(
    corpus_id=original_corpus_id,
    document_id=old_id,
    is_current=True,
    is_deleted=False,
).first()

# Map folder to new folder ID
target_folder_id = None
original_path_str = None
if original_path:
    original_path_str = original_path.path
    if original_path.folder_id:
        target_folder_id = folder_map.get(original_path.folder_id)

# Add document with preserved folder and path
corpus.add_document(
    document=document,
    user=user_id,
    folder=CorpusFolder.objects.get(pk=target_folder_id) if target_folder_id else None,
    path=original_path_str,
)
```

---

## Edit 6: Track Annotation IDs During Cloning

**File**: `opencontractserver/tasks/fork_tasks.py`
**Location**: Annotation cloning section (around line 182)

We need to build `annotation_map` to use for relationship cloning.

**Add before annotation loop** (around line 181):
```python
annotation_map = {}  # old_annotation_id -> new_annotation_id
```

**Modify annotation cloning** to track the mapping:

**Current** (lines 182-204):
```python
for annotation in Annotation.objects.filter(pk__in=annotation_ids):

    try:
        logger.info(f"Clone annotation: {annotation}")

        # Copy the annotation...
        annotation.pk = None
        annotation.creator_id = user_id
        annotation.corpus_id = new_corpus_id
        annotation.document_id = doc_map[annotation.document.id]
        annotation.annotation_label_id = label_map[
            annotation.annotation_label.id
        ]
        annotation.save()

        set_permissions_for_obj_to_user(
            user_id, annotation, [PermissionTypes.CRUD]
        )

    except Exception as e:
        logger.error(f"ERROR - could not fork annotation {annotation}: {e}")
        raise e
```

**Change to**:
```python
for annotation in Annotation.objects.filter(pk__in=annotation_ids):

    try:
        old_annotation_id = annotation.pk  # Save before clearing
        logger.info(f"Clone annotation: {annotation}")

        # Copy the annotation...
        annotation.pk = None
        annotation.creator_id = user_id
        annotation.corpus_id = new_corpus_id
        annotation.document_id = doc_map[annotation.document.id]
        annotation.annotation_label_id = label_map[
            annotation.annotation_label.id
        ]
        annotation.save()

        # Track mapping for relationship cloning
        annotation_map[old_annotation_id] = annotation.pk

        set_permissions_for_obj_to_user(
            user_id, annotation, [PermissionTypes.CRUD]
        )

    except Exception as e:
        logger.error(f"ERROR - could not fork annotation {annotation}: {e}")
        raise e
```

---

## Edit 7: Add Relationship Cloning (After Annotation Cloning)

**File**: `opencontractserver/tasks/fork_tasks.py`
**Location**: After annotation cloning section (around line 206), before unlocking corpus

**Add**:
```python
# ============================================================
# Clone relationships
# ============================================================
logger.info(f"Cloning {len(relationship_ids)} relationships")

for old_relationship in Relationship.objects.filter(pk__in=relationship_ids):
    try:
        # Get source and target annotation IDs
        old_source_ids = list(
            old_relationship.source_annotations.values_list("id", flat=True)
        )
        old_target_ids = list(
            old_relationship.target_annotations.values_list("id", flat=True)
        )

        # Map to new annotation IDs (skip if any mapping is missing)
        new_source_ids = [
            annotation_map[old_id]
            for old_id in old_source_ids
            if old_id in annotation_map
        ]
        new_target_ids = [
            annotation_map[old_id]
            for old_id in old_target_ids
            if old_id in annotation_map
        ]

        # Only create relationship if we have valid mappings
        if not new_source_ids and not new_target_ids:
            logger.warning(
                f"Skipping relationship {old_relationship.pk}: no mapped annotations"
            )
            continue

        # Map document and label
        new_doc_id = None
        if old_relationship.document_id:
            new_doc_id = doc_map.get(old_relationship.document_id)

        new_label_id = None
        if old_relationship.relationship_label_id:
            new_label_id = label_map.get(old_relationship.relationship_label_id)

        # Create new relationship
        new_relationship = Relationship(
            creator_id=user_id,
            corpus_id=new_corpus_id,
            document_id=new_doc_id,
            relationship_label_id=new_label_id,
        )
        new_relationship.save()

        # Set M2M relationships
        if new_source_ids:
            new_relationship.source_annotations.set(new_source_ids)
        if new_target_ids:
            new_relationship.target_annotations.set(new_target_ids)

        set_permissions_for_obj_to_user(
            user_id, new_relationship, [PermissionTypes.CRUD]
        )

        logger.info(
            f"Cloned relationship {old_relationship.pk} -> {new_relationship.pk}"
        )

    except Exception as e:
        logger.error(f"ERROR cloning relationship {old_relationship.pk}: {e}")
        raise e

logger.info("Relationships completed...")
```

---

## Edit 8: Update Utility Function (Optional but Recommended)

**File**: `opencontractserver/utils/corpus_forking.py`

Update `build_fork_corpus_task()` to match the new task signature:

```python
def build_fork_corpus_task(corpus_pk_to_fork: str, user: User):

    # Get corpus obj
    corpus_copy = Corpus.objects.get(pk=corpus_pk_to_fork)

    # Collect IDs
    annotation_ids = list(
        Annotation.objects.filter(
            corpus_id=corpus_pk_to_fork,
            analysis__isnull=True,  # Only user annotations
        ).values_list("id", flat=True)
    )
    doc_ids = list(corpus_copy.get_documents().values_list("id", flat=True))
    label_set_id = corpus_copy.label_set.pk if corpus_copy.label_set else None

    # NEW: Collect folder IDs (in tree order)
    folder_ids = list(
        CorpusFolder.objects.filter(corpus_id=corpus_pk_to_fork)
        .order_by("tree_depth", "pk")
        .values_list("id", flat=True)
    )

    # NEW: Collect relationship IDs
    relationship_ids = list(
        Relationship.objects.filter(
            corpus_id=corpus_pk_to_fork,
            analysis__isnull=True,
        ).values_list("id", flat=True)
    )

    # Clone the corpus
    corpus_copy.pk = None
    corpus_copy.title = f"[FORK] {corpus_copy.title}"  # FIX: Add prefix
    corpus_copy.backend_lock = True
    corpus_copy.creator = user
    corpus_copy.parent_id = corpus_pk_to_fork
    corpus_copy.save()

    set_permissions_for_obj_to_user(user, corpus_copy, [PermissionTypes.ALL])

    corpus_copy.documents.clear()
    corpus_copy.label_set = None

    return fork_corpus.si(
        corpus_copy.id,
        doc_ids,
        label_set_id,
        annotation_ids,
        folder_ids,        # NEW
        relationship_ids,  # NEW
        user.id
    )
```

---

## Summary of Files Modified

| File | Changes |
|------|---------|
| `config/graphql/mutations.py` | Fix title, collect folder/relationship IDs, update task call |
| `opencontractserver/tasks/fork_tasks.py` | New signature, folder cloning, folder-aware doc paths, annotation mapping, relationship cloning |
| `opencontractserver/utils/corpus_forking.py` | Match new task signature, fix title bug |

## Test Verification

After implementing these changes, the following tests should pass:
- `test_relationships_not_copied_limitation` → Should now FAIL (feature implemented)
- `test_folders_not_copied_limitation` → Should now FAIL (feature implemented)
- New tests for folder/relationship preservation should PASS

## Rollback Plan

If issues arise, the changes are isolated to:
1. Task signature (backward incompatible - ensure no queued tasks)
2. Mutation logic (safe to rollback)
3. Task logic (atomic within transaction)
