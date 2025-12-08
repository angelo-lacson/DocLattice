# Document Folder Service Implementation Plan

## Executive Summary

This plan describes a centralized `DocumentFolderService` that consolidates all folder and document-in-folder operations into a single, DRY, permission-aware service following the QueryOptimizer pattern established in the codebase.

## Problem Statement

Current folder operations are scattered across:
- `config/graphql/corpus_folder_mutations.py` (687 lines of mutation logic)
- `config/graphql/queries.py` (folder query resolvers)
- `config/graphql/filters.py` (`in_folder` filter)
- `opencontractserver/corpuses/models.py` (`get_document_count` methods)

This leads to:
1. **Duplicated permission checks** across mutations
2. **Inconsistent dual-system handling** (DocumentPath vs CorpusDocumentFolder)
3. **No central place for folder business logic**
4. **Difficult testing and maintenance**

## Solution Architecture

### Location
```
opencontractserver/corpuses/folder_service.py
```

### Design Principles

1. **QueryOptimizer Pattern**: Static class with `@classmethod` methods
2. **DRY Permissions**: Single `_check_folder_write_permission()` method
3. **Dual-System Awareness**: All operations update both DocumentPath and CorpusDocumentFolder
4. **Transaction Safety**: All mutations wrapped in `@transaction.atomic()`
5. **Query Optimization**: Proper use of `select_related()`, `prefetch_related()`, `with_tree_fields()`
6. **IDOR Protection**: Consistent error messages for not-found vs permission-denied

---

## Permission Model (from consolidated_permissioning_guide.md)

### Folder Permissions
CorpusFolder objects inherit ALL permissions from parent Corpus:

```python
# READ access:
can_read = (
    user.is_superuser
    OR corpus.creator == user
    OR corpus.is_public == True
    OR user_has_permission_for_obj(user, corpus, READ, include_group_permissions=True)
)

# WRITE access (create, update, move, delete folders):
can_write = (
    user.is_superuser
    OR corpus.creator == user
    OR user_has_permission_for_obj(user, corpus, UPDATE, include_group_permissions=True)
)

# CRITICAL: corpus.is_public=True grants READ-ONLY, NOT write access
```

### Document-in-Folder Permissions
Moving documents between folders requires:
```python
can_move_document = (
    can_write_to_corpus  # User can modify corpus structure
    AND document_in_corpus  # Document belongs to the corpus
)
```

---

## API Design

### Class Structure

```python
class DocumentFolderService:
    """
    Centralized service for all folder and document-in-folder operations.

    Follows the QueryOptimizer pattern with:
    - Static classmethod-based API
    - Centralized permission checks
    - Dual-system support (DocumentPath + CorpusDocumentFolder)
    - Transaction-safe mutations
    - Query optimization for reads

    Permission Model:
    - Folders inherit permissions from parent Corpus
    - Write operations require corpus UPDATE permission
    - corpus.is_public grants READ-ONLY access
    """
```

### Core Methods

#### Permission Checking

```python
@classmethod
def check_corpus_read_permission(cls, user: User, corpus: Corpus) -> bool:
    """
    Check if user can READ the corpus (and its folders).

    Returns True if:
    - User is superuser
    - User is corpus creator
    - Corpus is public
    - User has explicit READ permission
    """

@classmethod
def check_corpus_write_permission(cls, user: User, corpus: Corpus) -> bool:
    """
    Check if user can WRITE to corpus (create/update/delete folders).

    Returns True if:
    - User is superuser
    - User is corpus creator
    - User has explicit UPDATE permission

    CRITICAL: is_public does NOT grant write access.
    """

@classmethod
def check_document_in_corpus(cls, document: Document, corpus: Corpus) -> bool:
    """
    Verify document belongs to corpus.

    Checks both:
    - DocumentPath records (primary)
    - CorpusDocumentFolder records (legacy)
    - corpus.documents M2M (fallback)
    """
```

#### Folder Read Operations

```python
@classmethod
def get_visible_folders(
    cls,
    user: User,
    corpus_id: int,
    parent_id: Optional[int] = None,
) -> QuerySet[CorpusFolder]:
    """
    Get folders visible to user in a corpus.

    Args:
        user: Requesting user
        corpus_id: Corpus to query
        parent_id: Optional parent folder (None = root level)

    Returns:
        Optimized QuerySet with tree_fields, permissions annotated

    Permissions:
        - Requires corpus READ permission
        - Returns empty QuerySet if no access
    """

@classmethod
def get_folder_by_id(
    cls,
    user: User,
    folder_id: int,
) -> Optional[CorpusFolder]:
    """
    Get single folder by ID with permission check.

    Returns:
        CorpusFolder if found and accessible, None otherwise

    IDOR Protection:
        Same None response for not-found and permission-denied
    """

@classmethod
def get_folder_tree(
    cls,
    user: User,
    corpus_id: int,
) -> list[dict]:
    """
    Get full folder tree for corpus as nested dict structure.

    Returns:
        [
            {
                "id": "folder-1",
                "name": "Contracts",
                "children": [...],
                "documentCount": 5,
                "path": "/Contracts"
            }
        ]

    Optimized with single query + Python tree building.
    """
```

#### Document-in-Folder Read Operations

```python
@classmethod
def get_folder_documents(
    cls,
    user: User,
    corpus_id: int,
    folder_id: Optional[int] = None,  # None = root level
    include_deleted: bool = False,
) -> QuerySet[Document]:
    """
    Get documents in a specific folder.

    Args:
        user: Requesting user
        corpus_id: Corpus context
        folder_id: Folder ID (None = corpus root, "trash" = deleted)
        include_deleted: Include soft-deleted documents

    Returns:
        Optimized QuerySet of Documents with permissions annotated

    Implementation:
        Uses DocumentPath (primary) with CorpusDocumentFolder (fallback)
        Filters: is_current=True, is_deleted=False (unless include_deleted)
    """

@classmethod
def get_folder_document_count(
    cls,
    user: User,
    folder: CorpusFolder,
    include_descendants: bool = False,
) -> int:
    """
    Get count of documents in folder.

    Uses optimized query from CorpusFolder.get_document_count()
    which properly filters DocumentPath for is_current and is_deleted.
    """

@classmethod
def get_deleted_documents(
    cls,
    user: User,
    corpus_id: int,
) -> QuerySet[DocumentPath]:
    """
    Get soft-deleted documents for "trash" view.

    Filters DocumentPath: is_current=True, is_deleted=True
    """
```

#### Folder Write Operations

```python
@classmethod
def create_folder(
    cls,
    user: User,
    corpus: Corpus,
    name: str,
    parent: Optional[CorpusFolder] = None,
    description: str = "",
    color: Optional[str] = None,
    icon: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> tuple[Optional[CorpusFolder], str]:
    """
    Create a new folder in corpus.

    Args:
        user: Creating user
        corpus: Parent corpus
        name: Folder name
        parent: Parent folder (None = root level)
        description: Optional description
        color: Hex color for UI
        icon: Icon identifier
        tags: List of tags

    Returns:
        (folder, error_message) - folder is None on error

    Validations:
        - User has corpus UPDATE permission
        - Name is unique within parent
        - Parent (if provided) is in same corpus

    Permissions:
        Requires corpus UPDATE permission
    """

@classmethod
def update_folder(
    cls,
    user: User,
    folder: CorpusFolder,
    name: Optional[str] = None,
    description: Optional[str] = None,
    color: Optional[str] = None,
    icon: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> tuple[bool, str]:
    """
    Update folder properties.

    Returns:
        (success, error_message)

    Validations:
        - Name uniqueness within parent (if changed)

    Permissions:
        Requires corpus UPDATE permission
    """

@classmethod
def move_folder(
    cls,
    user: User,
    folder: CorpusFolder,
    new_parent: Optional[CorpusFolder] = None,  # None = move to root
) -> tuple[bool, str]:
    """
    Move folder to new parent.

    Returns:
        (success, error_message)

    Validations:
        - Cannot move folder into itself
        - Cannot move folder into its descendants
        - New parent must be in same corpus

    Permissions:
        Requires corpus UPDATE permission
    """

@classmethod
def delete_folder(
    cls,
    user: User,
    folder: CorpusFolder,
    move_children_to_parent: bool = True,
) -> tuple[bool, str]:
    """
    Delete folder.

    Args:
        folder: Folder to delete
        move_children_to_parent: If True, reparent children to folder's parent
                                 If False, cascade delete children

    Returns:
        (success, error_message)

    Side Effects:
        - Documents in folder have their folder set to NULL (moved to root)
        - Updates both DocumentPath and CorpusDocumentFolder

    Permissions:
        Requires corpus DELETE permission
    """
```

#### Document-in-Folder Write Operations

```python
@classmethod
def move_document_to_folder(
    cls,
    user: User,
    document: Document,
    corpus: Corpus,
    folder: Optional[CorpusFolder] = None,  # None = move to root
) -> tuple[bool, str]:
    """
    Move single document to folder.

    Returns:
        (success, error_message)

    Implementation:
        Updates BOTH systems in a transaction:
        1. DocumentPath: Updates folder FK where is_current=True, is_deleted=False
        2. CorpusDocumentFolder: Deletes old, creates new assignment

    Validations:
        - Document belongs to corpus
        - Folder (if provided) belongs to corpus

    Permissions:
        Requires corpus UPDATE permission
    """

@classmethod
def move_documents_to_folder(
    cls,
    user: User,
    document_ids: list[int],
    corpus: Corpus,
    folder: Optional[CorpusFolder] = None,
) -> tuple[int, str]:
    """
    Bulk move documents to folder.

    Returns:
        (moved_count, error_message)

    Implementation:
        - Validates all documents belong to corpus first
        - Uses bulk_update for DocumentPath
        - Uses delete + bulk_create for CorpusDocumentFolder

    Permissions:
        Requires corpus UPDATE permission
    """

@classmethod
def soft_delete_document(
    cls,
    user: User,
    document: Document,
    corpus: Corpus,
) -> tuple[bool, str]:
    """
    Soft-delete document (move to trash).

    Implementation:
        Creates new DocumentPath with is_deleted=True, is_current=True
        (follows Rule P1: every lifecycle event creates new node)

    Permissions:
        Requires corpus DELETE permission
    """

@classmethod
def restore_document(
    cls,
    user: User,
    document_path: DocumentPath,
) -> tuple[bool, str]:
    """
    Restore soft-deleted document.

    Implementation:
        Creates new DocumentPath with is_deleted=False, is_current=True
        (follows Rule P1)

    Permissions:
        Requires corpus UPDATE permission
    """
```

---

## Implementation Details

### Dual-System Update Pattern

Every operation that modifies document folder assignments MUST update both systems:

```python
@classmethod
def _update_document_folder_assignment(
    cls,
    document: Document,
    corpus: Corpus,
    folder: Optional[CorpusFolder],
) -> None:
    """
    Internal method to update both DocumentPath and CorpusDocumentFolder.

    MUST be called within a transaction.
    """
    from opencontractserver.documents.models import DocumentPath
    from opencontractserver.corpuses.models import CorpusDocumentFolder

    # Update DocumentPath (primary system)
    DocumentPath.objects.filter(
        document=document,
        corpus=corpus,
        is_current=True,
        is_deleted=False,
    ).update(folder=folder)

    # Update CorpusDocumentFolder (legacy system)
    CorpusDocumentFolder.objects.filter(
        document=document,
        corpus=corpus,
    ).delete()

    if folder is not None:
        CorpusDocumentFolder.objects.create(
            document=document,
            corpus=corpus,
            folder=folder,
        )
```

### Query Optimization Pattern

```python
@classmethod
def get_visible_folders(cls, user: User, corpus_id: int) -> QuerySet:
    """Optimized folder query with proper prefetching."""
    from opencontractserver.corpuses.models import CorpusFolder

    # Permission check first
    corpus = Corpus.objects.get(id=corpus_id)
    if not cls.check_corpus_read_permission(user, corpus):
        return CorpusFolder.objects.none()

    return (
        CorpusFolder.objects
        .filter(corpus_id=corpus_id)
        .with_tree_fields()
        .select_related("corpus", "creator", "parent")
        .prefetch_related("document_paths", "document_assignments")
        .order_by("tree_path")
    )
```

### Transaction Pattern

```python
@classmethod
def create_folder(cls, user, corpus, name, parent=None, **kwargs):
    """Transactional folder creation."""
    from django.db import transaction

    # Permission check BEFORE transaction
    if not cls.check_corpus_write_permission(user, corpus):
        return None, "Permission denied"

    # Validation BEFORE transaction
    if parent and parent.corpus_id != corpus.id:
        return None, "Parent folder must be in the same corpus"

    existing = CorpusFolder.objects.filter(
        corpus=corpus,
        parent=parent,
        name=name,
    ).exists()
    if existing:
        return None, f"A folder named '{name}' already exists in this location"

    # Mutation INSIDE transaction
    with transaction.atomic():
        folder = CorpusFolder.objects.create(
            corpus=corpus,
            parent=parent,
            name=name,
            creator=user,
            **kwargs,
        )
        return folder, ""
```

---

## Migration Strategy

### Phase 1: Create Service (Non-Breaking)

1. Create `opencontractserver/corpuses/folder_service.py`
2. Implement all methods with comprehensive tests
3. Service calls existing model methods where appropriate

### Phase 2: Refactor Mutations (Gradual)

Update mutations to use service:

```python
# BEFORE (in corpus_folder_mutations.py)
class CreateCorpusFolderMutation(graphene.Mutation):
    def mutate(self, info, corpus_id, name, parent_id=None, ...):
        # 50+ lines of validation, permission checking, creation
        ...

# AFTER
class CreateCorpusFolderMutation(graphene.Mutation):
    def mutate(self, info, corpus_id, name, parent_id=None, ...):
        corpus = get_object_or_404(Corpus, id=from_global_id(corpus_id)[1])
        parent = get_object_or_404(CorpusFolder, id=from_global_id(parent_id)[1]) if parent_id else None

        folder, error = DocumentFolderService.create_folder(
            user=info.context.user,
            corpus=corpus,
            name=name,
            parent=parent,
            description=description,
            color=color,
            icon=icon,
            tags=tags,
        )

        if error:
            return CreateCorpusFolderMutation(ok=False, message=error)
        return CreateCorpusFolderMutation(ok=True, corpus_folder=folder)
```

### Phase 3: Refactor Queries

Update query resolvers to use service:

```python
# BEFORE
def resolve_corpus_folders(self, info, corpus_id):
    return CorpusFolder.objects.filter(corpus_id=...).visible_to_user(...)

# AFTER
def resolve_corpus_folders(self, info, corpus_id):
    return DocumentFolderService.get_visible_folders(
        user=info.context.user,
        corpus_id=from_global_id(corpus_id)[1],
    )
```

### Phase 4: Refactor Filters

Update `DocumentFilter.in_folder()` to use service:

```python
# BEFORE (in filters.py)
def in_folder(self, queryset, name, value):
    # 60+ lines of dual-system filtering
    ...

# AFTER
def in_folder(self, queryset, name, value):
    user = self.request.user
    corpus_id = self.data.get("in_corpus_with_id")

    if value == "__root__":
        folder_id = None
    else:
        folder_id = from_global_id(value)[1]

    doc_ids = DocumentFolderService.get_folder_document_ids(
        user=user,
        corpus_id=corpus_id,
        folder_id=folder_id,
    )
    return queryset.filter(id__in=doc_ids)
```

---

## Testing Strategy

### Unit Tests

```python
# opencontractserver/tests/test_document_folder_service.py

class TestDocumentFolderServicePermissions(TestCase):
    """Test permission checking methods."""

    def test_creator_has_read_permission(self):
        corpus = CorpusFactory(creator=self.user)
        assert DocumentFolderService.check_corpus_read_permission(self.user, corpus)

    def test_public_corpus_grants_read_only(self):
        corpus = CorpusFactory(is_public=True, creator=self.other_user)
        assert DocumentFolderService.check_corpus_read_permission(self.user, corpus)
        assert not DocumentFolderService.check_corpus_write_permission(self.user, corpus)

    def test_explicit_update_permission_grants_write(self):
        corpus = CorpusFactory(creator=self.other_user)
        set_permissions_for_obj_to_user(self.user, corpus, [PermissionTypes.UPDATE])
        assert DocumentFolderService.check_corpus_write_permission(self.user, corpus)


class TestDocumentFolderServiceFolderOps(TransactionTestCase):
    """Test folder CRUD operations."""

    def test_create_folder_success(self):
        folder, error = DocumentFolderService.create_folder(
            user=self.user,
            corpus=self.corpus,
            name="Test Folder",
        )
        assert folder is not None
        assert error == ""
        assert folder.name == "Test Folder"

    def test_create_folder_duplicate_name_fails(self):
        DocumentFolderService.create_folder(self.user, self.corpus, "Folder")
        folder, error = DocumentFolderService.create_folder(self.user, self.corpus, "Folder")
        assert folder is None
        assert "already exists" in error

    def test_move_folder_prevents_circular_reference(self):
        parent = DocumentFolderService.create_folder(self.user, self.corpus, "Parent")[0]
        child = DocumentFolderService.create_folder(self.user, self.corpus, "Child", parent=parent)[0]

        success, error = DocumentFolderService.move_folder(self.user, parent, new_parent=child)
        assert not success
        assert "cannot move" in error.lower()


class TestDocumentFolderServiceDocumentOps(TransactionTestCase):
    """Test document-in-folder operations."""

    def test_move_document_updates_both_systems(self):
        DocumentFolderService.move_document_to_folder(
            user=self.user,
            document=self.document,
            corpus=self.corpus,
            folder=self.folder,
        )

        # Check DocumentPath
        path = DocumentPath.objects.get(
            document=self.document,
            corpus=self.corpus,
            is_current=True,
            is_deleted=False,
        )
        assert path.folder == self.folder

        # Check CorpusDocumentFolder
        assignment = CorpusDocumentFolder.objects.get(
            document=self.document,
            corpus=self.corpus,
        )
        assert assignment.folder == self.folder

    def test_get_folder_documents_count_matches_list(self):
        # Move 3 documents to folder
        for doc in self.documents[:3]:
            DocumentFolderService.move_document_to_folder(
                self.user, doc, self.corpus, self.folder
            )

        count = DocumentFolderService.get_folder_document_count(
            self.user, self.folder
        )
        docs = DocumentFolderService.get_folder_documents(
            self.user, self.corpus.id, self.folder.id
        )

        assert count == 3
        assert docs.count() == 3
```

### Integration Tests

```python
class TestDocumentFolderServiceGraphQL(TransactionTestCase):
    """Test service integration with GraphQL layer."""

    def test_mutation_uses_service(self):
        # Verify mutations delegate to service correctly
        ...

    def test_query_uses_service(self):
        # Verify queries delegate to service correctly
        ...
```

---

## File Structure

```
opencontractserver/
  corpuses/
    folder_service.py          # NEW: Main service file
    models.py                  # Existing: CorpusFolder, CorpusDocumentFolder
  tests/
    test_document_folder_service.py  # NEW: Service tests
    test_corpus_folders.py     # Existing: Model tests
    test_corpus_folder_mutations.py  # Existing: Mutation tests
config/
  graphql/
    corpus_folder_mutations.py  # MODIFIED: Use service
    queries.py                  # MODIFIED: Use service
    filters.py                  # MODIFIED: Use service
docs/
  architecture/
    document_folder_service_plan.md  # This document
```

---

## Success Metrics

1. **DRY Code**: Permission checks reduced from 6 places to 1
2. **Test Coverage**: 90%+ coverage on service methods
3. **Query Performance**: No N+1 queries in folder operations
4. **Consistency**: Dual-system (DocumentPath + CorpusDocumentFolder) always in sync
5. **Maintainability**: New folder features only need service changes

---

## Timeline

| Phase | Description | Estimated Effort |
|-------|-------------|------------------|
| 1 | Create service with core methods | 4-6 hours |
| 2 | Write comprehensive tests | 2-3 hours |
| 3 | Refactor mutations to use service | 2-3 hours |
| 4 | Refactor queries and filters | 1-2 hours |
| 5 | Update documentation | 1 hour |

**Total**: ~12-15 hours

---

## Open Questions

1. **Caching**: Should we cache folder trees per corpus? (Likely: No, query is fast enough)
2. **Soft Delete Cascade**: When deleting folder, should documents also be soft-deleted? (Currently: No, moved to root)
3. **Audit Logging**: Should folder operations create audit log entries? (Recommended: Yes, for compliance)
