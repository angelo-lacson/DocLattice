# Metadata Forking Implementation Plan

## Overview

This document outlines the implementation plan for including metadata fields in corpus forking. Currently, when a corpus is forked, the metadata schema (Fieldset, Columns) and values (Datacells) are NOT copied, leaving the forked corpus without any metadata structure.

## Current State

### Metadata System Architecture

```
Corpus ──OneToOne──> Fieldset (metadata_schema)
                         │
                         └──> Column[] (fieldset.columns)
                                   │
                                   └──> Datacell[] (document + column + data)
```

**Key Models:**
- `Fieldset`: Container for metadata schema, linked to corpus via `corpus.metadata_schema`
- `Column`: Individual field definitions with `data_type`, `validation_config`, `is_manual_entry=True`
- `Datacell`: Actual values stored per document-column pair, with `extract=NULL` for manual metadata

**Key Constraints:**
- `UniqueConstraint("document", "column")` where `extract IS NULL` - ensures one metadata value per document-column

### Current Fork Process (fork_tasks.py)

```
1. Clone LabelSet and AnnotationLabels → label_map
2. Clone Folders → folder_map
3. Clone Documents → doc_map
4. Clone Annotations → annotation_map (uses label_map, doc_map)
5. Clone Relationships (uses annotation_map, label_map, doc_map)
```

**Gap:** No metadata cloning step exists.

## Implementation Plan

### Phase 1: Mutation Changes (StartCorpusFork)

**File:** `config/graphql/mutations.py`

**Changes:**
1. Check if source corpus has `metadata_schema`
2. Collect column IDs from the metadata schema
3. Collect datacell IDs for documents being forked (manual metadata only)
4. Pass these IDs to fork_corpus task

**New Data Collection:**
```python
# After existing ID collection...

# Collect metadata column IDs if metadata schema exists
metadata_column_ids = []
if hasattr(corpus, 'metadata_schema') and corpus.metadata_schema:
    metadata_column_ids = list(
        corpus.metadata_schema.columns.filter(
            is_manual_entry=True
        ).values_list("id", flat=True)
    )

# Collect metadata datacell IDs for documents being forked
# Only manual metadata (extract IS NULL)
metadata_datacell_ids = []
if metadata_column_ids and doc_ids:
    metadata_datacell_ids = list(
        Datacell.objects.filter(
            document_id__in=doc_ids,
            column_id__in=metadata_column_ids,
            extract__isnull=True,  # Manual metadata only
        ).values_list("id", flat=True)
    )
```

**Updated Task Call:**
```python
fork_corpus.si(
    corpus.id,
    doc_ids,
    label_set_id,
    annotation_ids,
    folder_ids,
    relationship_ids,
    metadata_column_ids,      # NEW
    metadata_datacell_ids,    # NEW
    info.context.user.id,
).apply_async()
```

### Phase 2: Task Signature Update (fork_tasks.py)

**Updated Function Signature:**
```python
@celery_app.task()
def fork_corpus(
    new_corpus_id: str,
    doc_ids: list[str],
    label_set_id: str,
    annotation_ids: list[str],
    folder_ids: list[str],
    relationship_ids: list[str],
    metadata_column_ids: list[str],      # NEW
    metadata_datacell_ids: list[str],    # NEW
    user_id: str,
) -> Optional[str]:
```

### Phase 3: Metadata Cloning Logic (fork_tasks.py)

**New Section - Clone Metadata Schema (after label_set, before folders):**

```python
# ============================================================
# Clone metadata schema (Fieldset + Columns)
# ============================================================
column_map = {}  # old_column_id -> new_column_id

if metadata_column_ids:
    logger.info(f"Cloning metadata schema with {len(metadata_column_ids)} columns")

    try:
        # Get the source fieldset from any column (they all share the same fieldset)
        first_column = Column.objects.get(pk=metadata_column_ids[0])
        old_fieldset = first_column.fieldset

        # Create new fieldset for the forked corpus
        new_fieldset = Fieldset(
            name=f"[FORK] {old_fieldset.name}",
            description=old_fieldset.description,
            corpus_id=new_corpus_id,  # Link to new corpus
            creator_id=user_id,
        )
        new_fieldset.save()

        set_permissions_for_obj_to_user(
            user_id, new_fieldset, [PermissionTypes.CRUD]
        )
        logger.info(f"Created metadata fieldset: {new_fieldset.pk}")

        # Clone columns (preserve order)
        for old_column in Column.objects.filter(
            pk__in=metadata_column_ids
        ).order_by("display_order"):
            new_column = Column(
                name=old_column.name,
                fieldset_id=new_fieldset.pk,
                output_type=old_column.output_type,
                data_type=old_column.data_type,
                validation_config=old_column.validation_config.copy() if old_column.validation_config else None,
                is_manual_entry=True,
                default_value=old_column.default_value,
                help_text=old_column.help_text,
                display_order=old_column.display_order,
                creator_id=user_id,
                # Extraction fields not needed for metadata columns
                query=None,
                match_text=None,
            )
            new_column.save()
            column_map[old_column.pk] = new_column.pk

            set_permissions_for_obj_to_user(
                user_id, new_column, [PermissionTypes.CRUD]
            )
            logger.info(f"Cloned column {old_column.name} -> {new_column.pk}")

    except Exception as e:
        logger.error(f"ERROR cloning metadata schema: {e}")
        raise e
else:
    logger.info("No metadata schema to clone")
```

**New Section - Clone Datacells (after annotations, before relationships):**

```python
# ============================================================
# Clone metadata datacells
# ============================================================
if metadata_datacell_ids and column_map:
    logger.info(f"Cloning {len(metadata_datacell_ids)} metadata datacells")

    for old_datacell in Datacell.objects.filter(pk__in=metadata_datacell_ids):
        try:
            # Map to new document and column
            new_doc_id = doc_map.get(old_datacell.document_id)
            new_column_id = column_map.get(old_datacell.column_id)

            if not new_doc_id or not new_column_id:
                logger.warning(
                    f"Skipping datacell {old_datacell.pk}: "
                    f"missing doc ({new_doc_id}) or column ({new_column_id}) mapping"
                )
                continue

            new_datacell = Datacell(
                column_id=new_column_id,
                document_id=new_doc_id,
                data=old_datacell.data.copy() if old_datacell.data else None,
                data_definition=old_datacell.data_definition,
                extract=None,  # Manual metadata has no extract
                creator_id=user_id,
                # Don't copy approval status - forked data starts fresh
                approved_by=None,
                rejected_by=None,
                corrected_data=None,
            )
            new_datacell.save()

            set_permissions_for_obj_to_user(
                user_id, new_datacell, [PermissionTypes.CRUD]
            )
            logger.info(f"Cloned datacell {old_datacell.pk} -> {new_datacell.pk}")

        except Exception as e:
            logger.error(f"ERROR cloning datacell {old_datacell.pk}: {e}")
            raise e

    logger.info("Metadata datacells completed...")
else:
    logger.info("No metadata datacells to clone")
```

### Phase 4: Required Imports

**Add to fork_tasks.py:**
```python
from opencontractserver.extracts.models import Column, Datacell, Fieldset
```

### Final Order of Operations

```
1. Clone LabelSet and AnnotationLabels → label_map
2. Clone Metadata Fieldset + Columns → column_map  ← NEW
3. Clone Folders → folder_map
4. Clone Documents → doc_map
5. Clone Annotations → annotation_map
6. Clone Metadata Datacells (uses doc_map, column_map)  ← NEW
7. Clone Relationships
```

## Test Plan

### New Test Cases for test_corpus_fork_round_trip.py

1. **test_metadata_schema_copied**
   - Create corpus with metadata schema (Fieldset + Columns)
   - Fork corpus
   - Verify forked corpus has metadata_schema
   - Verify column count matches
   - Verify column properties (name, data_type, validation_config) preserved

2. **test_metadata_values_copied**
   - Create corpus with metadata schema
   - Add document with metadata values
   - Fork corpus
   - Verify datacell count matches
   - Verify datacell values preserved

3. **test_metadata_column_types_preserved**
   - Create columns of each data type (STRING, INTEGER, CHOICE, etc.)
   - Fork corpus
   - Verify all data types correctly preserved

4. **test_multi_generation_metadata_preservation**
   - Create corpus with metadata
   - Fork through 3 generations
   - Verify no metadata degradation

5. **test_empty_metadata_schema_fork**
   - Create corpus with metadata schema but no columns
   - Fork corpus
   - Verify fieldset created but empty

6. **test_corpus_without_metadata_fork**
   - Create corpus without metadata schema
   - Fork corpus
   - Verify fork succeeds (backward compatibility)
   - Verify forked corpus has no metadata_schema

7. **test_metadata_datacell_skip_on_missing_mapping**
   - Create datacell for document NOT in fork list
   - Verify datacell is skipped gracefully

8. **test_forked_metadata_fresh_approval_status**
   - Create datacell with approved_by set
   - Fork corpus
   - Verify forked datacell has approved_by=None

## Edge Cases & Considerations

### 1. Partial Document Fork
If only some documents are being forked, only datacells for those documents should be copied.
- **Handling:** Filter datacell_ids by doc_ids in mutation

### 2. Extraction Columns
Extraction columns (`is_manual_entry=False`) should NOT be copied as metadata.
- **Handling:** Filter by `is_manual_entry=True` in mutation

### 3. Approval Status
Forked datacells should NOT inherit approval status (approved_by, rejected_by).
- **Handling:** Set to None in datacell creation

### 4. M2M Sources Field
Datacells have a `sources` M2M to Annotations. For manual metadata, this is typically empty.
- **Handling:** Don't copy sources - manual metadata doesn't use annotation sources

### 5. Backward Compatibility
Old fork tasks may be queued without metadata parameters.
- **Handling:** Use default empty lists in task signature:
  ```python
  metadata_column_ids: list[str] = None,
  metadata_datacell_ids: list[str] = None,
  ```
  Then check for None in the task body.

### 6. Large Metadata Sets
Corpuses with many documents and columns could have many datacells.
- **Handling:** Use bulk_create for performance optimization (future enhancement)

## Files to Modify

1. `config/graphql/mutations.py` - StartCorpusFork mutation
2. `opencontractserver/tasks/fork_tasks.py` - fork_corpus task
3. `opencontractserver/utils/corpus_forking.py` - build_fork_corpus_task utility (CONFIRMED: needs update)
4. `opencontractserver/tests/test_corpus_fork_round_trip.py` - Add metadata tests

### corpus_forking.py Updates

The utility function `build_fork_corpus_task()` duplicates the ID collection logic from the mutation.
It needs the same metadata collection additions:

```python
# Add imports
from opencontractserver.extracts.models import Column, Datacell

# In build_fork_corpus_task(), after relationship_ids collection:

# Collect metadata column IDs if metadata schema exists
metadata_column_ids = []
if hasattr(corpus_copy, 'metadata_schema') and corpus_copy.metadata_schema:
    metadata_column_ids = list(
        corpus_copy.metadata_schema.columns.filter(
            is_manual_entry=True
        ).values_list("id", flat=True)
    )

# Collect metadata datacell IDs for documents being forked
metadata_datacell_ids = []
if metadata_column_ids and doc_ids:
    metadata_datacell_ids = list(
        Datacell.objects.filter(
            document_id__in=doc_ids,
            column_id__in=metadata_column_ids,
            extract__isnull=True,
        ).values_list("id", flat=True)
    )

# Update the task call to include new parameters
return fork_corpus.si(
    corpus_copy.id,
    doc_ids,
    label_set_id,
    annotation_ids,
    folder_ids,
    relationship_ids,
    metadata_column_ids,      # NEW
    metadata_datacell_ids,    # NEW
    user.id,
)
```

## Migration Notes

No database migrations required - this is purely application logic.

## Rollback Plan

If issues arise:
1. Revert mutations.py changes (stop collecting metadata IDs)
2. Keep fork_tasks.py changes (will just receive empty lists)
3. No data corruption risk since fork creates new records
