# DocumentFolderService Migration Inventory

This document provides a complete inventory of all code locations that need to be updated to use the centralized `DocumentFolderService`.

## Summary Statistics

| Category | Count |
|----------|-------|
| GraphQL Mutations to Update | 12 |
| GraphQL Queries/Filters to Update | 8 |
| Celery Tasks to Update | 3 |
| Model Methods to Update | 2 |
| Import Utilities to Update | 2 |
| **Total Refactoring Items** | **27** |

---

## PART 1: GraphQL Mutations

### 1.1 Folder Mutations (corpus_folder_mutations.py)

| # | Mutation | File | Lines | Current Behavior | Replace With |
|---|----------|------|-------|------------------|--------------|
| 1 | `CreateCorpusFolderMutation` | config/graphql/corpus_folder_mutations.py | 34-161 | Direct `CorpusFolder()` + `.save()` | `DocumentFolderService.create_folder()` |
| 2 | `UpdateCorpusFolderMutation` | config/graphql/corpus_folder_mutations.py | 164-266 | Direct field updates + `folder.save()` | `DocumentFolderService.update_folder()` |
| 3 | `MoveCorpusFolderMutation` | config/graphql/corpus_folder_mutations.py | 269-372 | Direct `folder.parent = x` + `.save()` | `DocumentFolderService.move_folder()` |
| 4 | `DeleteCorpusFolderMutation` | config/graphql/corpus_folder_mutations.py | 375-439 | Direct `child.save()`, `folder.delete()`, `CorpusDocumentFolder.objects.filter().delete()` | `DocumentFolderService.delete_folder()` |
| 5 | `MoveDocumentToFolderMutation` | config/graphql/corpus_folder_mutations.py | 442-561 | Direct `DocumentPath.objects.filter().update()`, `CorpusDocumentFolder.objects.create()` | `DocumentFolderService.move_document_to_folder()` |
| 6 | `MoveDocumentsToFolderMutation` | config/graphql/corpus_folder_mutations.py | 564-686 | Direct `DocumentPath.objects.filter().update()`, `CorpusDocumentFolder.objects.bulk_create()` | `DocumentFolderService.move_documents_to_folder()` |

### 1.2 Document Mutations (mutations.py)

| # | Mutation | File | Lines | Current Behavior | Replace With |
|---|----------|------|-------|------------------|--------------|
| 7 | `UploadDocument` | config/graphql/mutations.py | 1437-1679 | Direct `CorpusDocumentFolder.objects.update_or_create()` for folder assignment (line 1607) | `DocumentFolderService.upload_document_to_corpus()` or `._update_document_folder_assignment()` |
| 8 | `AddDocumentsToCorpus` | config/graphql/mutations.py | 769-809 | Loop calling `corpus.add_document()` | `DocumentFolderService.add_documents_to_corpus()` |
| 9 | `RemoveDocumentsFromCorpus` | config/graphql/mutations.py | 812-853 | Loop calling `corpus.remove_document()` | `DocumentFolderService.remove_documents_from_corpus()` |
| 10 | `RestoreDeletedDocument` | config/graphql/mutations.py | 3865-3961 | Direct `DocumentPath.objects.filter()` query | Consider `DocumentFolderService.restore_document()` |
| 11 | `RestoreDocumentToVersion` | config/graphql/mutations.py | 3964-4137 | Direct `DocumentPath.objects.create()` (line 4092) | Extract to service method or use versioning module |

### 1.3 Upload Mutations (mutations.py)

| # | Mutation | File | Lines | Current Behavior | Replace With |
|---|----------|------|-------|------------------|--------------|
| 12 | `UploadDocumentsZip` | config/graphql/mutations.py | 1682-1822 | Launches `process_documents_zip` task | Task should use service (see Tasks section) |

---

## PART 2: GraphQL Queries and Filters

### 2.1 Queries (queries.py)

| # | Query | File | Lines | Current Behavior | Replace With |
|---|-------|------|-------|------------------|--------------|
| 1 | `corpus_folders` | config/graphql/queries.py | 817-832 | Direct `CorpusFolder.objects.filter().visible_to_user()` | `DocumentFolderService.get_visible_folders()` |
| 2 | `corpus_folder` | config/graphql/queries.py | 834-849 | Direct `CorpusFolder.objects.visible_to_user().get()` | `DocumentFolderService.get_folder_by_id()` |
| 3 | `deleted_documents_in_corpus` | config/graphql/queries.py | 851-880 | Direct `DocumentPath.objects.filter(is_deleted=True)` | `DocumentFolderService.get_deleted_documents()` |
| 4 | `searchable_documents` | config/graphql/queries.py | 1024-1041 | Direct `DocumentPath.objects.filter()` queries | `DocumentFolderService.get_corpus_documents()` |

### 2.2 Filters (filters.py)

| # | Filter | File | Lines | Current Behavior | Replace With |
|---|--------|------|-------|------------------|--------------|
| 5 | `DocumentFilter.in_corpus` | config/graphql/filters.py | 364-390 | Direct `DocumentPath.objects.filter()` | `DocumentFolderService.get_folder_document_ids()` |
| 6 | `DocumentFilter.in_folder` | config/graphql/filters.py | 392-455 | Direct `DocumentPath` + `CorpusDocumentFolder` queries | `DocumentFolderService.get_folder_document_ids()` |

### 2.3 Type Resolvers (graphene_types.py)

| # | Resolver | File | Lines | Current Behavior | Replace With |
|---|----------|------|-------|------------------|--------------|
| 7 | `DocumentType.resolve_folder_in_corpus` | config/graphql/graphene_types.py | 1531-1548 | Direct `CorpusDocumentFolder.objects.get()` | `DocumentFolderService.get_document_folder()` |
| 8 | `DocumentType.resolve_version_number` | config/graphql/graphene_types.py | 1105-1114 | Direct `DocumentPath.objects.filter()` | Keep or add service method |

---

## PART 3: Celery Tasks

### 3.1 Import Tasks (HIGH PRIORITY)

| # | Task | File | Lines | Current Behavior | Replace With |
|---|------|------|-------|------------------|--------------|
| 1 | `import_corpus()` | opencontractserver/tasks/import_tasks.py | 40-227 | Uses legacy `corpus.documents.add()` pattern, direct `Document.objects.create()` | Use `DocumentFolderService.add_document_to_corpus()` |
| 2 | `import_document_to_corpus()` | opencontractserver/tasks/import_tasks.py | 230-343 | Uses legacy `corpus.documents.add()`, direct `Document.objects.create()` | Use `DocumentFolderService.add_document_to_corpus()` |
| 3 | `process_documents_zip()` | opencontractserver/tasks/import_tasks.py | 346-570 | Direct `Document()` constructor + `.save()` (lines 495-518) | Use `DocumentFolderService.create_document()` then `add_document_to_corpus()` |

### 3.2 Import Tasks V2 (MEDIUM PRIORITY)

| # | Task | File | Lines | Current Behavior | Replace With |
|---|------|------|-------|------------------|--------------|
| 4 | `_import_corpus_v1()` | opencontractserver/tasks/import_tasks_v2.py | 107-236 | Direct `Document.objects.create()` (line 187) | Consider using service for consistency |
| 5 | `_import_corpus_v2()` | opencontractserver/tasks/import_tasks_v2.py | 239-460 | Direct `Document.objects.create()` (line 338) | Consider using service for consistency |

### 3.3 Fork Tasks (LOW PRIORITY - Already Good)

| # | Task | File | Lines | Current Behavior | Status |
|---|------|------|-------|------------------|--------|
| 6 | `fork_corpus()` | opencontractserver/tasks/fork_tasks.py | 24-219 | Uses `corpus.add_document()` correctly | OK - No changes needed |

---

## PART 4: Model Methods

### 4.1 Corpus Model (corpuses/models.py)

| # | Method | File | Lines | Current Behavior | Action |
|---|--------|------|-------|------------------|--------|
| 1 | `Corpus.add_document()` | opencontractserver/corpuses/models.py | 345-506 | Direct `DocumentPath.objects.create()` (line 490) | Keep as internal - called by service |
| 2 | `Corpus.remove_document()` | opencontractserver/corpuses/models.py | 562-652 | Direct `DocumentPath.objects.create()` (lines 604, 635) | Keep as internal - called by service |

**Note:** These model methods are appropriately placed and are called by `DocumentFolderService` internally. No changes needed, but ensure all external code uses the service instead of calling these directly.

---

## PART 5: Import/Export Utilities

### 5.1 Import V2 Utilities (utils/import_v2.py)

| # | Function | File | Lines | Current Behavior | Replace With |
|---|----------|------|-------|------------------|--------------|
| 1 | `import_corpus_folders()` | opencontractserver/utils/import_v2.py | 224-234 | Direct `CorpusFolder.objects.create()` | `DocumentFolderService.create_folder()` (needs `is_public` param added) |
| 2 | `import_document_paths()` | opencontractserver/utils/import_v2.py | 307-317 | Direct `DocumentPath.objects.create()` | Keep for import - specialized operation |

---

## PART 6: Versioning Module (DO NOT MODIFY)

The following are in the core versioning module and should **NOT** be changed:

| File | Lines | Operations |
|------|-------|------------|
| opencontractserver/documents/versioning.py | 176, 232, 267, 291, 339, 373, 407 | `DocumentPath.objects.create()` for versioning |

These implement the core dual-tree versioning logic and are appropriately placed.

---

## Detailed Refactoring Checklist

### Phase 1: GraphQL Folder Mutations (HIGH PRIORITY)

- [ ] **1.1** `CreateCorpusFolderMutation` (corpus_folder_mutations.py:34-161)
  - Replace lines 103-115 with `DocumentFolderService.create_folder()`
  - Remove manual permission checks (service handles this)

- [ ] **1.2** `UpdateCorpusFolderMutation` (corpus_folder_mutations.py:164-266)
  - Replace lines 195-227 with `DocumentFolderService.update_folder()`

- [ ] **1.3** `MoveCorpusFolderMutation` (corpus_folder_mutations.py:269-372)
  - Replace lines 290-333 with `DocumentFolderService.move_folder()`

- [ ] **1.4** `DeleteCorpusFolderMutation` (corpus_folder_mutations.py:375-439)
  - Replace lines 408-422 with `DocumentFolderService.delete_folder()`

- [ ] **1.5** `MoveDocumentToFolderMutation` (corpus_folder_mutations.py:442-561)
  - Replace lines 509-529 with `DocumentFolderService.move_document_to_folder()`

- [ ] **1.6** `MoveDocumentsToFolderMutation` (corpus_folder_mutations.py:564-686)
  - Replace lines 634-660 with `DocumentFolderService.move_documents_to_folder()`

### Phase 2: GraphQL Document Mutations (HIGH PRIORITY)

- [ ] **2.1** `UploadDocument` (mutations.py:1437-1679)
  - Replace lines 1605-1615 folder assignment with service call
  - Consider full refactor to use `DocumentFolderService.upload_document_to_corpus()`

- [ ] **2.2** `AddDocumentsToCorpus` (mutations.py:769-809)
  - Replace lines 800-802 loop with `DocumentFolderService.add_documents_to_corpus()`

- [ ] **2.3** `RemoveDocumentsFromCorpus` (mutations.py:812-853)
  - Replace lines 844-846 loop with `DocumentFolderService.remove_documents_from_corpus()`

### Phase 3: GraphQL Queries and Filters (MEDIUM PRIORITY)

- [ ] **3.1** `resolve_corpus_folders` (queries.py:817-832)
  - Replace with `DocumentFolderService.get_visible_folders()`

- [ ] **3.2** `resolve_corpus_folder` (queries.py:834-849)
  - Replace with `DocumentFolderService.get_folder_by_id()`

- [ ] **3.3** `resolve_deleted_documents_in_corpus` (queries.py:851-880)
  - Replace with `DocumentFolderService.get_deleted_documents()`

- [ ] **3.4** `DocumentFilter.in_corpus` (filters.py:364-390)
  - Use `DocumentFolderService.get_folder_document_ids()`

- [ ] **3.5** `DocumentFilter.in_folder` (filters.py:392-455)
  - Use `DocumentFolderService.get_folder_document_ids()`

- [ ] **3.6** `DocumentType.resolve_folder_in_corpus` (graphene_types.py:1531-1548)
  - Replace with `DocumentFolderService.get_document_folder()`

### Phase 4: Celery Tasks (MEDIUM PRIORITY)

- [ ] **4.1** `import_corpus()` (import_tasks.py:40-227)
  - Replace `corpus.documents.add()` with `corpus.add_document()` or service
  - Replace `Document.objects.create()` with service method

- [ ] **4.2** `import_document_to_corpus()` (import_tasks.py:230-343)
  - Same as above

- [ ] **4.3** `process_documents_zip()` (import_tasks.py:346-570)
  - Replace `Document()` constructor + `.save()` with `DocumentFolderService.create_document()`

### Phase 5: Import Utilities (LOW PRIORITY)

- [ ] **5.1** `import_corpus_folders()` (import_v2.py:224-234)
  - Replace `CorpusFolder.objects.create()` with `DocumentFolderService.create_folder()`
  - Note: Service needs `is_public` parameter added

---

## Service Methods Available

For reference, here are all available `DocumentFolderService` methods:

### Permission Checking
- `check_corpus_read_permission(user, corpus)` → bool
- `check_corpus_write_permission(user, corpus)` → bool
- `check_corpus_delete_permission(user, corpus)` → bool

### Document Creation
- `check_user_upload_quota(user)` → (bool, error)
- `validate_file_type(file_bytes)` → (mime_type, error)
- `create_document(user, file_bytes, filename, title, ...)` → (Document, error)

### Document-to-Corpus Operations
- `upload_document_to_corpus(user, corpus, file_bytes, filename, title, folder, ...)` → (Document, status, error)
- `add_document_to_corpus(user, document, corpus, folder)` → (Document, status, error)
- `add_documents_to_corpus(user, document_ids, corpus, folder)` → (count, ids, error)
- `remove_document_from_corpus(user, document, corpus)` → (bool, error)
- `remove_documents_from_corpus(user, document_ids, corpus)` → (count, error)

### Document Retrieval
- `get_document_by_id(user, document_id)` → Document|None
- `get_corpus_documents(user, corpus, include_deleted)` → QuerySet

### Folder CRUD
- `create_folder(user, corpus, name, parent, description, color, icon, tags)` → (CorpusFolder, error)
- `update_folder(user, folder, name, description, color, icon, tags)` → (bool, error)
- `move_folder(user, folder, new_parent)` → (bool, error)
- `delete_folder(user, folder)` → (bool, error)

### Folder Queries
- `get_visible_folders(user, corpus_id)` → QuerySet
- `get_folder_by_id(user, folder_id)` → CorpusFolder|None
- `get_folder_tree(user, corpus_id)` → list[dict]
- `search_folders(user, corpus_id, query)` → QuerySet

### Document-in-Folder Operations
- `move_document_to_folder(user, document, corpus, folder)` → (bool, error)
- `move_documents_to_folder(user, document_ids, corpus, folder)` → (count, error)
- `get_folder_documents(user, corpus_id, folder_id)` → QuerySet
- `get_folder_document_ids(user, corpus_id, folder_id)` → list[int]
- `soft_delete_document(user, document, corpus)` → (bool, error)
- `restore_document(user, document_path)` → (bool, error)
- `get_deleted_documents(user, corpus_id)` → QuerySet

### Utility Methods
- `get_document_folder(user, document, corpus)` → CorpusFolder|None
- `get_folder_path(user, folder)` → str|None
- `set_document_permissions(user, document, target_user, permissions)` → (bool, error)
- `_update_document_folder_assignment(document, corpus, folder)` → None (internal)
