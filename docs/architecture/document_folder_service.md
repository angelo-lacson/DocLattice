# DocumentFolderService

**Location:** `opencontractserver/corpuses/folder_service.py`

## Overview

`DocumentFolderService` is the centralized service for all document lifecycle and folder operations in OpenContracts. It serves as the **single source of truth** for:

- Document creation (standalone and corpus imports)
- Document-to-corpus operations (add, remove)
- Folder CRUD operations
- Document-in-folder operations (move, delete, restore)
- Permission management for documents

## Design Principles

1. **DRY Permissions**: Single permission check methods used by all operations
2. **Dual-System Awareness**: All mutations update both `DocumentPath` (new system) and `CorpusDocumentFolder` (legacy system)
3. **Transaction Safety**: All mutations wrapped in database transactions
4. **Query Optimization**: Proper use of `select_related`, `prefetch_related`
5. **IDOR Protection**: Consistent error messages for not-found vs permission-denied
6. **Consistent Versioning**: Documents uploaded to corpus go through the same versioning path as documents added later

## Architecture Pattern

The service follows the **QueryOptimizer pattern** with:
- Static classmethod-based API (no instance state)
- Centralized permission checks
- Transaction-safe mutations
- Consistent return types: `(result, error_message)` or `(result, status, error_message)`

## Permission Model

From `docs/permissioning/consolidated_permissioning_guide.md`:

- **CorpusFolder** objects inherit ALL permissions from parent Corpus
- **Write operations** require: User is Corpus creator OR User has UPDATE permission
- **CRITICAL**: `corpus.is_public=True` grants READ-ONLY access, NOT write access

## API Reference

### Permission Checking

```python
# Check if user can read corpus content
can_read = DocumentFolderService.check_corpus_read_permission(user, corpus)

# Check if user can write to corpus (create folders, add documents, etc.)
can_write = DocumentFolderService.check_corpus_write_permission(user, corpus)

# Check if user can delete corpus content
can_delete = DocumentFolderService.check_corpus_delete_permission(user, corpus)
```

### Document Creation

```python
# Create standalone document (not in any corpus)
document, error = DocumentFolderService.create_document(
    user=user,
    file_bytes=file_bytes,
    filename="document.pdf",
    title="My Document",
    description="Description",
    custom_meta={"key": "value"},
    is_public=False,
    slug="my-document",
)

# Check if user can create more documents (usage caps)
can_upload, error = DocumentFolderService.check_user_upload_quota(user)

# Validate file type before upload
mime_type, error = DocumentFolderService.validate_file_type(file_bytes)
```

### Document-to-Corpus Operations

```python
# Upload document directly to corpus
# (Creates standalone first, then adds to corpus for consistent versioning)
corpus_doc, status, error = DocumentFolderService.upload_document_to_corpus(
    user=user,
    corpus=corpus,
    file_bytes=file_bytes,
    filename="document.pdf",
    title="My Document",
    folder=folder,  # Optional
)

# Add existing document to corpus (creates isolated copy)
corpus_doc, status, error = DocumentFolderService.add_document_to_corpus(
    user=user,
    document=source_document,
    corpus=corpus,
    folder=folder,  # Optional
)

# Bulk add documents to corpus
added_count, added_ids, error = DocumentFolderService.add_documents_to_corpus(
    user=user,
    document_ids=[doc1.id, doc2.id, doc3.id],
    corpus=corpus,
    folder=folder,  # Optional
)

# Remove document from corpus (soft delete)
success, error = DocumentFolderService.remove_document_from_corpus(
    user=user,
    document=document,
    corpus=corpus,
)

# Bulk remove documents from corpus
removed_count, error = DocumentFolderService.remove_documents_from_corpus(
    user=user,
    document_ids=[doc1.id, doc2.id],
    corpus=corpus,
)
```

### Document Retrieval

```python
# Get document by ID (with IDOR protection)
document = DocumentFolderService.get_document_by_id(user, document_id)

# Get all documents in corpus
documents = DocumentFolderService.get_corpus_documents(
    user=user,
    corpus=corpus,
    include_deleted=False,
)
```

### Folder Operations

```python
# Create folder
folder, error = DocumentFolderService.create_folder(
    user=user,
    corpus=corpus,
    name="My Folder",
    parent=parent_folder,  # Optional, None for root
    description="Description",
    color="#FF0000",
    icon="folder",
)

# Update folder
success, error = DocumentFolderService.update_folder(
    user=user,
    folder=folder,
    name="New Name",
    description="New description",
)

# Move folder to new parent
success, error = DocumentFolderService.move_folder(
    user=user,
    folder=folder,
    new_parent=new_parent_folder,  # None for root
)

# Delete folder (reparents children to parent)
success, error = DocumentFolderService.delete_folder(user, folder)

# Get visible folders in corpus
folders = DocumentFolderService.get_visible_folders(user, corpus_id)

# Get folder by ID
folder = DocumentFolderService.get_folder_by_id(user, folder_id)

# Get folder tree structure
tree = DocumentFolderService.get_folder_tree(user, corpus_id)

# Search folders by name
folders = DocumentFolderService.search_folders(user, corpus_id, "query")
```

### Document-in-Folder Operations

```python
# Move document to folder
success, error = DocumentFolderService.move_document_to_folder(
    user=user,
    document=document,
    corpus=corpus,
    folder=folder,  # None to move to root
)

# Bulk move documents
moved_count, error = DocumentFolderService.move_documents_to_folder(
    user=user,
    document_ids=[doc1.id, doc2.id],
    corpus=corpus,
    folder=folder,
)

# Get documents in folder
documents = DocumentFolderService.get_folder_documents(
    user=user,
    corpus_id=corpus.id,
    folder_id=folder.id,  # None for root
)

# Get document IDs in folder (lightweight)
doc_ids = DocumentFolderService.get_folder_document_ids(
    user=user,
    corpus_id=corpus.id,
    folder_id=folder.id,
)

# Soft delete document (within corpus context)
success, error = DocumentFolderService.soft_delete_document(
    user=user,
    document=document,
    corpus=corpus,
)

# Restore soft-deleted document
success, error = DocumentFolderService.restore_document(
    user=user,
    document_path=deleted_document_path,
)

# Get deleted documents
deleted_docs = DocumentFolderService.get_deleted_documents(user, corpus_id)
```

### Permission Management

```python
# Set permissions on document
success, error = DocumentFolderService.set_document_permissions(
    user=user,  # Must be owner or have PERMISSION permission
    document=document,
    target_user=other_user,
    permissions=[PermissionTypes.READ, PermissionTypes.UPDATE],
)
```

### Utility Methods

```python
# Get current folder for document in corpus
folder = DocumentFolderService.get_document_folder(user, document, corpus)

# Get folder path string
path = DocumentFolderService.get_folder_path(user, folder)
# Returns: "/Legal/Contracts/2024"
```

## Dual-System Architecture

The service maintains consistency between two systems:

### DocumentPath (Primary - New System)
- Stores document-corpus-folder relationships
- Supports versioning with `is_current`, `is_deleted`, `parent` fields
- Used for soft-delete/restore operations
- Source of truth for document presence in corpus

### CorpusDocumentFolder (Legacy System)
- Simple document-corpus-folder assignments
- Maintained for backward compatibility
- Updated alongside DocumentPath in all operations

All write operations update both systems atomically within transactions.

## Document Upload Flow

When uploading a document to a corpus, the service ensures consistent versioning:

```
upload_document_to_corpus()
    │
    ├── 1. Check corpus write permission
    │
    ├── 2. create_document()
    │       └── Creates standalone document in system
    │           └── Sets permissions for creator
    │
    └── 3. add_document_to_corpus()
            ├── Creates corpus-isolated copy
            │   └── New version_tree_id
            │   └── source_document → original
            ├── Creates DocumentPath record
            └── Updates CorpusDocumentFolder (legacy)
```

This ensures documents have identical versioning behavior regardless of whether they were uploaded directly to a corpus or added later from the user's document library.

## Error Handling

All methods return consistent error information:

- **Single result methods**: `(result, error_message)` where result is `None`/`False` on error
- **Status methods**: `(result, status, error_message)` where status indicates operation outcome
- **Bulk methods**: `(count, error_message)` or `(count, ids, error_message)`

Error messages are designed to be user-friendly and can be displayed directly in the UI.

## Testing

Comprehensive tests are in `opencontractserver/tests/test_document_folder_service.py`:

- Permission checking tests
- Folder CRUD tests
- Document operations tests
- Dual-system consistency tests
- Document lifecycle tests

Run tests:
```bash
docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_document_folder_service.py -v
```

## Migration Guide

### Replacing Direct Model Access

**Before (direct model access):**
```python
# Don't do this
folder = CorpusFolder.objects.create(corpus=corpus, name="Folder")
DocumentPath.objects.filter(document=doc).update(folder=folder)
CorpusDocumentFolder.objects.create(document=doc, corpus=corpus, folder=folder)
```

**After (using service):**
```python
# Do this instead
folder, error = DocumentFolderService.create_folder(user, corpus, "Folder")
success, error = DocumentFolderService.move_document_to_folder(user, doc, corpus, folder)
```

### Replacing GraphQL Mutation Logic

GraphQL mutations should delegate to the service:

```python
class MoveDocumentToFolderMutation(graphene.Mutation):
    def mutate(root, info, document_id, corpus_id, folder_id):
        user = info.context.user

        # Use service instead of direct model manipulation
        success, error = DocumentFolderService.move_document_to_folder(
            user=user,
            document=document,
            corpus=corpus,
            folder=folder,
        )

        if not success:
            return MoveDocumentToFolderMutation(ok=False, message=error)

        return MoveDocumentToFolderMutation(ok=True, message="Success")
```

## Related Documentation

- [Permissioning Guide](../permissioning/consolidated_permissioning_guide.md)
- [Document Folder Service Plan](./document_folder_service_plan.md)
