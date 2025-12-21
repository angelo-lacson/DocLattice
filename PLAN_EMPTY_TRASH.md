# Plan: Implement "Empty Trash" (Permanent Deletion) Feature

## Overview

Implement the ability to permanently delete soft-deleted documents from a corpus's trash. This follows the dual-tree versioning architecture where soft-delete creates `DocumentPath(is_deleted=True)` records.

## Architecture Context

From `docs/architecture/doc_versioning_implementation.md`:

- **Soft delete**: Creates `DocumentPath(is_deleted=True, is_current=True)` - preserves history
- **Rule Q1**: Content is "truly deleted" when no active paths point to it
- **Corpus isolation**: Each corpus has independent version trees
- **DocumentPath.document** has `on_delete=PROTECT` - cannot delete Document while paths exist

## What "Permanent Delete" Means

1. **Delete all DocumentPath records** for the document in this corpus (entire history)
2. **Delete corpus-scoped user data**:
   - User annotations (non-structural) for this document
   - Relationships involving those annotations
   - DocumentSummaryRevision records for this document+corpus
3. **Optionally delete Document** if no other corpus references it (Rule Q1)
4. **Preserve shared data**: StructuralAnnotationSet, file blobs (may be shared)

## Implementation Plan

### Phase 1: Backend - Core Deletion Logic

**File: `opencontractserver/documents/versioning.py`**

Add new function:
```python
def permanently_delete_document(corpus: Corpus, document: Document, user: User) -> tuple[bool, str]:
    """
    Permanently delete a soft-deleted document from corpus.

    This is IRREVERSIBLE and:
    1. Deletes all DocumentPath history for this document in corpus
    2. Deletes corpus-scoped user annotations and relationships
    3. Deletes DocumentSummaryRevision records
    4. If no other corpus references the document, deletes Document itself

    Returns: (success, error_message)
    """
```

Key implementation details:
- Must verify document is currently soft-deleted (`is_deleted=True, is_current=True`)
- Delete in correct order to respect FK constraints
- Use `transaction.atomic()` for safety
- Check Rule Q1 before attempting Document deletion

### Phase 2: Backend - Service Layer

**File: `opencontractserver/corpuses/folder_service.py`**

Add to `DocumentFolderService`:
```python
@classmethod
def permanently_delete_document(
    cls,
    user: User,
    document: Document,
    corpus: Corpus,
) -> tuple[bool, str]:
    """Permanently delete a soft-deleted document."""
    # Permission: Require DELETE permission (same as soft delete)
    if not cls.check_corpus_delete_permission(user, corpus):
        return False, "Permission denied"

    # Delegate to versioning module
    ...
```

Also add bulk operation:
```python
@classmethod
def empty_trash(
    cls,
    user: User,
    corpus: Corpus,
) -> tuple[int, str]:
    """Permanently delete ALL soft-deleted documents in corpus."""
```

### Phase 3: Backend - GraphQL Mutation

**File: `config/graphql/mutations.py`**

Add mutations:
```python
class PermanentlyDeleteDocument(graphene.Mutation):
    """Permanently delete a single soft-deleted document."""
    class Arguments:
        document_id = graphene.String(required=True)
        corpus_id = graphene.String(required=True)

    ok = graphene.Boolean()
    message = graphene.String()

class EmptyTrash(graphene.Mutation):
    """Permanently delete ALL soft-deleted documents in corpus."""
    class Arguments:
        corpus_id = graphene.String(required=True)

    ok = graphene.Boolean()
    message = graphene.String()
    deleted_count = graphene.Int()
```

Register in schema.

### Phase 4: Frontend - GraphQL Mutations

**File: `frontend/src/graphql/mutations.ts`**

Add:
```typescript
export const PERMANENTLY_DELETE_DOCUMENT = gql`
  mutation PermanentlyDeleteDocument($documentId: ID!, $corpusId: ID!) {
    permanentlyDeleteDocument(documentId: $documentId, corpusId: $corpusId) {
      ok
      message
    }
  }
`;

export const EMPTY_TRASH = gql`
  mutation EmptyTrash($corpusId: ID!) {
    emptyTrash(corpusId: $corpusId) {
      ok
      message
      deletedCount
    }
  }
`;
```

### Phase 5: Frontend - TrashFolderView Updates

**File: `frontend/src/components/corpuses/folders/TrashFolderView.tsx`**

1. Enable the "Empty Trash" button (remove `disabled={true}`)
2. Add confirmation modal with strong warning
3. Wire up the `EMPTY_TRASH` mutation
4. Optionally add individual "Delete Permanently" button per item

### Phase 6: Extensive Test Coverage

**File: `opencontractserver/tests/test_permanent_deletion.py`** (NEW dedicated test file)

#### Core Deletion Tests
- `test_permanently_delete_removes_all_document_paths_in_corpus`
- `test_permanently_delete_removes_path_history_not_just_current`
- `test_permanently_delete_only_affects_target_corpus`
- `test_permanently_delete_requires_document_to_be_soft_deleted`
- `test_permanently_delete_non_deleted_document_fails`

#### Cascade Cleanup Tests
- `test_permanently_delete_removes_user_annotations`
- `test_permanently_delete_removes_relationships_with_annotations`
- `test_permanently_delete_removes_document_summary_revisions`
- `test_permanently_delete_preserves_structural_annotations`
- `test_permanently_delete_preserves_structural_annotation_set`

#### Rule Q1 (Document Cleanup) Tests
- `test_document_deleted_when_no_other_corpus_references`
- `test_document_preserved_when_other_corpus_has_reference`
- `test_document_preserved_when_standalone_path_exists`

#### Empty Trash (Bulk) Tests
- `test_empty_trash_deletes_all_soft_deleted_documents`
- `test_empty_trash_preserves_non_deleted_documents`
- `test_empty_trash_returns_correct_count`
- `test_empty_trash_on_empty_trash_returns_zero`

#### Permission Tests
- `test_permanent_delete_requires_delete_permission`
- `test_permanent_delete_denied_without_permission`
- `test_permanent_delete_allowed_for_corpus_creator`
- `test_permanent_delete_allowed_for_superuser`
- `test_empty_trash_requires_delete_permission`

#### GraphQL Mutation Tests
- `test_permanently_delete_document_mutation_success`
- `test_permanently_delete_document_mutation_not_found`
- `test_permanently_delete_document_mutation_not_deleted`
- `test_permanently_delete_document_mutation_permission_denied`
- `test_empty_trash_mutation_success`
- `test_empty_trash_mutation_permission_denied`

#### Edge Cases
- `test_permanently_delete_document_with_multiple_versions`
- `test_permanently_delete_document_that_was_moved_multiple_times`
- `test_permanently_delete_document_with_extracts`
- `test_concurrent_permanent_delete_handling`

#### Integration Tests
- `test_full_lifecycle_create_delete_restore_permanent_delete`
- `test_empty_trash_after_mixed_operations`

## Data Cleanup Checklist

When permanently deleting, must clean up:

| Model | Condition | Action |
|-------|-----------|--------|
| `DocumentPath` | All paths for doc in corpus | DELETE |
| `Annotation` | User annotations (not structural) on doc | DELETE |
| `Relationship` | References deleted annotations | DELETE |
| `DocumentSummaryRevision` | For doc+corpus | DELETE |
| `Extract` | If doc was only source | Consider |
| `Analysis` | If doc was only analyzed | Consider |
| `Document` | If Rule Q1 (no other paths globally) | DELETE |

## Permission Model

- **Required permission**: `DELETE` on corpus (same as soft delete)
- **Rationale**: Permanent deletion is a stronger form of delete, same permission level is appropriate
- **Alternative considered**: Require `PERMISSION` level - but this seems overly restrictive

## Safety Considerations

1. **Confirmation UI**: Require explicit confirmation ("type CONFIRM to proceed")
2. **Audit logging**: Log all permanent deletions
3. **Rate limiting**: Apply standard write rate limits
4. **No undo**: Clear messaging that this is irreversible

## Order of Implementation

1. Backend versioning function (`permanently_delete_document`)
2. Backend service layer method
3. Backend GraphQL mutations
4. Backend tests
5. Frontend mutations
6. Frontend UI updates
7. Frontend tests (optional)

## Estimated Scope

- Backend: ~200-300 lines of code
- Frontend: ~50-100 lines of code
- Tests: ~150-200 lines

## Questions for Approval

1. Should individual document permanent deletion be exposed, or only "Empty Trash"?
   - **Recommendation**: Both - "Empty Trash" for bulk, individual delete for selective cleanup

2. Should we require a stronger permission (e.g., `PERMISSION`) for permanent deletion?
   - **Recommendation**: No, `DELETE` is sufficient since soft-delete also requires `DELETE`

3. Should we add a "days in trash" auto-delete feature (like Gmail's 30-day auto-purge)?
   - **Recommendation**: Out of scope for this PR, can be added later as enhancement
