# Corpus Forking: Technical Documentation

This document describes the corpus forking implementation, including what data is preserved, technical details, and remaining work.

## Overview

Corpus forking creates a complete copy of a corpus for a different user, preserving:
- Documents (with folder assignments)
- Annotations (user-created, not analysis-generated)
- Relationships between annotations
- Labels and LabelSets
- Folder hierarchy

## Architecture

### Components

| Component | File | Responsibility |
|-----------|------|----------------|
| GraphQL Mutation | `config/graphql/mutations.py` | Entry point, collects IDs, creates corpus shell |
| Fork Task | `opencontractserver/tasks/fork_tasks.py` | Async Celery task that clones all data |
| Utility Function | `opencontractserver/utils/corpus_forking.py` | Programmatic fork (used by tests) |

### Data Flow

```
1. Mutation receives corpus_id
2. Collect IDs: doc_ids, annotation_ids, folder_ids, relationship_ids
3. Create new corpus shell with [FORK] prefix, set parent_id
4. Launch async fork_corpus task
5. Task clones in order:
   a. LabelSet + Labels (builds label_map)
   b. Folders (builds folder_map, uses tree_depth ordering)
   c. Documents (builds doc_map, preserves folder assignment)
   d. Annotations (builds annotation_map)
   e. Relationships (uses annotation_map for M2M mapping)
6. Unlock corpus
```

### ID Mapping Strategy

The fork task maintains several maps to correctly reference new IDs:

```python
label_map = {}       # old_label_id -> new_label_id
folder_map = {}      # old_folder_id -> new_folder_id
doc_map = {}         # old_doc_id -> new_doc_id
annotation_map = {}  # old_annotation_id -> new_annotation_id
```

These maps ensure that:
- New annotations reference new labels and documents
- New relationships reference new annotations
- New folders maintain parent-child hierarchy
- Documents are assigned to the correct new folders

### Tree Depth Ordering

Folders use TreeNode from `tree_queries` for hierarchical storage. The `tree_depth` field is CTE-computed and requires `.with_tree_fields()`:

```python
# Correct: includes CTE for tree_depth field
CorpusFolder.objects.filter(corpus_id=pk).with_tree_fields().order_by("tree_depth", "pk")

# Incorrect: tree_depth not available
CorpusFolder.objects.filter(corpus_id=pk).order_by("tree_depth", "pk")  # FieldError
```

## What Gets Copied

### Copied Data

| Data Type | Scope | Notes |
|-----------|-------|-------|
| Documents | All in corpus | Title gets [FORK] prefix |
| Document files | txt_extract, pawls_parse | Copied to new storage paths |
| Annotations | User-created only | `analysis__isnull=True` filter |
| Relationships | User-created only | M2M source/target remapped |
| Labels | All from LabelSet | New LabelSet created |
| Folders | All in corpus | Hierarchy preserved |

### Not Copied (By Design)

| Data Type | Reason |
|-----------|--------|
| Analysis-generated annotations | Belong to analysis, not corpus |
| Analysis-generated relationships | Belong to analysis, not corpus |
| Notes | Future enhancement (Phase 5) |
| Corpus metadata (icon, md_description) | Future enhancement (Phase 4) |
| Category associations | Future enhancement (Phase 4) |

## Permissions

Forked objects receive `PermissionTypes.CRUD` permissions for the forking user:
- Corpus
- Documents
- Folders
- Annotations
- Relationships

## Error Handling

The fork task runs within a transaction (`transaction.atomic()`). On failure:
1. Transaction rolls back all changes
2. Corpus `backend_lock` is released
3. Corpus `error` flag is set to True
4. Task returns None instead of corpus ID

## Testing

### Round-Trip Tests

Location: `opencontractserver/tests/test_corpus_fork_round_trip.py`

Tests validate data integrity by:
1. Creating corpus with known data
2. Forking it
3. Comparing snapshot of fork to original
4. Supporting multi-generation forking

### Test Commands

```bash
# Run fork tests
docker compose -f test.yml run django pytest opencontractserver/tests/test_corpus_fork_round_trip.py -v

# Run legacy fork test
docker compose -f test.yml run django pytest opencontractserver/tests/test_corpus_forking.py -v
```

## Future Enhancements

### Phase 4: Corpus Metadata Copying

Copy corpus-level fields that aren't currently preserved:
- `md_description` (file field)
- `icon` (file field)
- `preferred_embedder`
- `post_processors`
- `corpus_agent_instructions`
- `document_agent_instructions`
- `allow_comments`
- `categories` (M2M)

### Phase 5: Notes Copying

Clone document notes:
```python
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
```

### Phase 6: Error Recovery & Cleanup

Implement cleanup for partial fork failures to remove orphaned objects.

## Performance Considerations

1. **Prefetch M2M relationships**: Relationship cloning uses `prefetch_related()` to avoid N+1 queries
2. **Batch operations**: Consider bulk_create for large datasets
3. **Async execution**: Fork runs as Celery task to avoid request timeouts
4. **Transaction isolation**: Prevents partial data visibility

## Changelog

- **2025-01**: Added folder and relationship preservation during forking
  - Added `folder_ids` and `relationship_ids` parameters to fork task
  - Implemented folder cloning with tree_depth ordering
  - Implemented relationship cloning with annotation mapping
  - Fixed [FORK] title prefix bug
  - Fixed tree_depth ordering (requires `.with_tree_fields()`)
  - Standardized permissions to CRUD
  - Added prefetch_related optimization for relationships
