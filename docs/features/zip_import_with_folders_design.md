# Zip Import with Folder Structure - Design Document

## Overview

This document describes the design for a safe and performant zip file import feature that:
1. Accepts zip files containing documents
2. Extracts only allowed file types
3. Preserves the folder structure from the zip file in the target corpus
4. Requires corpus EDIT permission for access

## Security Considerations

### 1. Zip Bomb Protection

**Threat**: Malicious zip files that compress to tiny sizes but expand to gigabytes/terabytes.

**Mitigations**:
- **Maximum file count**: Limit to 1000 files per zip
- **Maximum total uncompressed size**: Limit to 500MB total
- **Maximum single file size**: Limit to 100MB per file (files exceeding this are skipped)
- **Compression ratio check**: Flag files with ratio > 100:1 for streaming validation

### 2. Path Traversal Protection

**Threat**: Files with malicious paths like `../../../etc/passwd` or `..\..\windows\system32\`.

**Mitigations**:
- Reject any path containing `..` (parent directory reference)
- Reject absolute paths (starting with `/` or `C:\`)
- Normalize all path separators to `/`
- Reject paths containing null bytes
- Limit maximum path length to 1024 characters
- Validate each path component is non-empty and valid

### 3. Symlink Prevention

**Threat**: Zip can contain symbolic links that point outside the extraction directory.

**Mitigations**:
- Check `ZipInfo.external_attr` for symlink indicator and skip symlinks entirely
- Never extract to actual filesystem - process in memory only

### 4. Resource Exhaustion Protection

**Threat**: Too many files, too many nested folders, infinite recursion.

**Mitigations**:
- Maximum folder depth: 20 levels
- Maximum folder count: 500 folders per zip
- Maximum path component length: 255 characters per folder name

### 5. File Type Validation

**Existing mitigation**: We already validate MIME types from file content using `filetype.guess()`, not file extensions. This prevents file type masquerading attacks.

### 6. Individual File Size Handling

**Approach**: Skip files exceeding size limit with clear error reporting.

During validation phase:
1. Check each file's uncompressed size from `ZipInfo.file_size`
2. Mark files exceeding `ZIP_MAX_SINGLE_FILE_SIZE_BYTES` for skipping
3. During processing, skip marked files and report in results
4. Continue processing remaining valid files

**User feedback**: Results include count and names of skipped oversized files.

---

## Constants Definition

**File**: `opencontractserver/constants/zip_import.py`

```python
"""
Constants for zip file import security limits.

These limits protect against:
- Zip bombs (decompression bombs)
- Path traversal attacks
- Resource exhaustion
- Denial of service

All limits are configurable per deployment via Django settings overrides.
"""

# Maximum number of files allowed in a single zip
ZIP_MAX_FILE_COUNT = 1000

# Maximum total uncompressed size in bytes (500MB)
ZIP_MAX_TOTAL_SIZE_BYTES = 500 * 1024 * 1024

# Maximum size of a single file in bytes (100MB)
# Files exceeding this limit are skipped with an error message
ZIP_MAX_SINGLE_FILE_SIZE_BYTES = 100 * 1024 * 1024

# Maximum compression ratio (uncompressed/compressed) before flagging
# Files exceeding this ratio are processed with streaming validation
ZIP_MAX_COMPRESSION_RATIO = 100

# Maximum folder depth (number of nested folders)
ZIP_MAX_FOLDER_DEPTH = 20

# Maximum number of folders that can be created from a single zip
ZIP_MAX_FOLDER_COUNT = 500

# Maximum length of a single path component (folder or file name)
ZIP_MAX_PATH_COMPONENT_LENGTH = 255

# Maximum total path length in characters
ZIP_MAX_PATH_LENGTH = 1024

# Batch size for document processing (commit after N documents)
ZIP_DOCUMENT_BATCH_SIZE = 50
```

---

## GraphQL Mutation Design

### Mutation: `ImportZipToCorpus`

**File**: `config/graphql/mutations.py`

```graphql
mutation ImportZipToCorpus(
  $base64FileString: String!
  $corpusId: ID!
  $targetFolderId: ID              # Optional: folder to place zip contents under
  $titlePrefix: String             # Optional: prefix for all document titles
  $description: String             # Optional: description for all documents
  $customMeta: GenericScalar       # Optional: metadata for all documents
  $makePublic: Boolean!            # Required: public visibility
) {
  importZipToCorpus(
    base64FileString: $base64FileString
    corpusId: $corpusId
    targetFolderId: $targetFolderId
    titlePrefix: $titlePrefix
    description: $description
    customMeta: $customMeta
    makePublic: $makePublic
  ) {
    ok
    message
    jobId
  }
}
```

**Permissions Required**:
- User must have EDIT permission on the target corpus
- Rate limited with `RateLimits.IMPORT`
- Usage-capped users blocked (same as existing `UploadDocumentsZip`)

---

## Async Task Design

### Task: `import_zip_with_folder_structure`

**File**: `opencontractserver/tasks/import_tasks.py`

### Processing Flow

```
1. VALIDATION PHASE (synchronous, before any extraction)
   ├── Open zip file in read mode
   ├── Count total files (reject if > ZIP_MAX_FILE_COUNT)
   ├── Calculate total uncompressed size (reject if > ZIP_MAX_TOTAL_SIZE_BYTES)
   ├── For each entry:
   │   ├── Sanitize path (reject traversal attacks)
   │   ├── Check if symlink (skip)
   │   ├── Check individual file size (mark for skipping if too large)
   │   └── Collect folder path if file is allowed
   ├── Validate folder count and depth limits
   └── Return validation result with file manifest

2. FOLDER CREATION PHASE (single atomic transaction)
   ├── Parse all unique folder paths from validated manifest
   ├── Sort paths by depth (parents first)
   ├── For each path:
   │   ├── Check if folder already exists → reuse
   │   └── Create new folder with correct parent
   └── Build folder lookup map: path → CorpusFolder

3. DOCUMENT PROCESSING PHASE (batched transactions of 50)
   ├── For each allowed file in manifest:
   │   ├── Skip if marked oversized
   │   ├── Extract file bytes to memory
   │   ├── Validate MIME type (skip if not allowed)
   │   ├── Create Document with proper file field
   │   ├── Add to corpus via corpus.add_document() with folder
   │   ├── Set creator permissions
   │   └── Add to batch
   ├── Commit batch every ZIP_DOCUMENT_BATCH_SIZE documents
   └── Track success/failure counts

4. CLEANUP PHASE
   ├── Delete TemporaryFileHandle
   └── Return comprehensive results
```

---

## Utility Functions

### Path Sanitization

**File**: `opencontractserver/utils/zip_security.py`

```python
def sanitize_zip_path(path: str) -> tuple[str | None, str]:
    """
    Sanitize a path from a zip file for security.

    Args:
        path: Raw path from zip file

    Returns:
        (sanitized_path, error_message) - sanitized_path is None if invalid

    Security checks:
        - Rejects paths with '..' (parent directory traversal)
        - Rejects absolute paths (starting with / or drive letter)
        - Rejects paths with null bytes
        - Normalizes path separators to '/'
        - Strips leading/trailing slashes
        - Validates path length limits
        - Validates component length limits
    """
```

### Zip Validation

```python
def validate_zip_for_import(
    zip_file: zipfile.ZipFile,
) -> tuple[bool, str, ZipManifest]:
    """
    Validate entire zip file for security issues before extraction.

    Args:
        zip_file: Open ZipFile object in read mode

    Returns:
        (is_valid, error_message, manifest)

    The manifest contains:
        - valid_files: List of files to process with sanitized paths
        - skipped_files: List of files skipped (oversized, symlink, bad path)
        - folder_paths: Set of folder paths to create
        - total_size: Total uncompressed size of valid files

    Validation checks:
        - Total file count within limits
        - Total uncompressed size within limits
        - Individual file sizes (marks oversized for skipping)
        - Compression ratio for each file
        - Symlink detection
        - Path sanitization for all entries
        - Folder depth validation
    """
```

### Folder Structure Creation

```python
def create_folder_structure_from_paths(
    corpus: Corpus,
    user: User,
    folder_paths: set[str],
    target_folder: CorpusFolder | None = None,
) -> dict[str, CorpusFolder]:
    """
    Create all folders needed for zip import in a single transaction.

    Args:
        corpus: Target corpus
        user: Creating user
        folder_paths: Set of folder paths to create (e.g., {"legal", "legal/contracts"})
        target_folder: Optional parent folder for all imports (zip root goes here)

    Returns:
        Mapping of path → CorpusFolder for document assignment

    Algorithm:
        1. Sort paths by depth (parents before children)
        2. For each path, check if folder exists → reuse or create
        3. Track created vs reused counts for reporting

    Raises:
        ValueError: If folder creation fails (triggers transaction rollback)
    """
```

---

## Results Structure

```python
@dataclass
class ZipImportResult:
    job_id: str
    success: bool
    completed: bool

    # Validation results
    validation_passed: bool
    validation_errors: list[str]

    # File statistics
    total_files_in_zip: int
    files_processed: int
    files_skipped_type: int          # Wrong MIME type
    files_skipped_size: int          # Exceeded size limit
    files_skipped_hidden: int        # Hidden files, __MACOSX, etc.
    files_skipped_path: int          # Path validation failed
    files_errored: int               # Processing errors

    # Folder statistics
    folders_created: int
    folders_reused: int

    # Output
    document_ids: list[str]
    errors: list[str]                # Detailed error messages
    skipped_oversized: list[str]     # Names of files skipped for size
```

---

## Error Handling Strategy

### Validation Errors (Immediate Rejection - No Processing)

| Error | Message | Recovery |
|-------|---------|----------|
| Too many files | "Zip contains {n} files, maximum allowed is 1000" | User must split zip |
| Total size exceeded | "Zip uncompressed size is {n}MB, maximum is 500MB" | User must split zip |
| Path traversal | "Security error: Path traversal detected in '{path}'" | User must fix zip |
| Folder depth exceeded | "Folder structure too deep (max 20 levels)" | User must flatten |
| Invalid corpus | "Corpus not found" | Check corpus ID |
| Permission denied | "You don't have permission to add documents to this corpus" | Request access |

### Processing Errors (Per-File, Logged and Continued)

| Error | Handling | Reported As |
|-------|----------|-------------|
| File too large | Skip file | `files_skipped_size`, listed in `skipped_oversized` |
| MIME type not allowed | Skip file | `files_skipped_type` |
| Document creation failed | Skip file, log error | `files_errored`, detailed in `errors` |
| Folder creation failed | Abort entire job | Validation error |

### Transaction Strategy

- **Folder creation**: Single atomic transaction - if any folder fails, abort entire job
- **Document creation**: Batches of 50 with individual error handling
- **Partial success**: Job can succeed with some files skipped/errored

---

## Performance Considerations

### Memory Efficiency

1. **Streaming zip access**: Use `zipfile.ZipFile` - doesn't load entire zip
2. **Per-file extraction**: Extract one file at a time to memory
3. **Batch commits**: Commit every 50 documents to avoid long transactions
4. **ContentFile usage**: Django manages blob storage efficiently

### Query Optimization

1. **Folder lookup**: Build in-memory map after single query for existing folders
2. **Bulk permission check**: Check corpus permission once at start
3. **Quota tracking**: Track document count in memory during processing

---

## Comparison with Existing `UploadDocumentsZip`

| Feature | `UploadDocumentsZip` | `ImportZipToCorpus` |
|---------|---------------------|---------------------|
| Folder structure | Discarded (flat import) | Preserved |
| Corpus required | Optional | Required |
| Target folder | N/A | Supported |
| Zip bomb protection | None | Full |
| Path traversal protection | None | Full |
| Symlink handling | Would extract | Rejected |
| Max file count | Unlimited | 1000 |
| Max total size | Unlimited | 500MB |
| Max file size | Unlimited | 100MB (skipped) |
| Batch processing | No | Yes (50 per batch) |

---

## Files to Create/Modify

### New Files

1. `opencontractserver/constants/zip_import.py` - Security constants
2. `opencontractserver/utils/zip_security.py` - Path sanitization and validation
3. `opencontractserver/tests/test_zip_security.py` - Security utility tests
4. `opencontractserver/tests/test_zip_import_integration.py` - Integration tests

### Modified Files

1. `opencontractserver/constants/__init__.py` - Import new constants
2. `opencontractserver/tasks/import_tasks.py` - Add new task
3. `config/graphql/mutations.py` - Add new mutation
4. `config/graphql/schema.py` - Register mutation

### Documentation Updates

1. `docs/features/zip_import_with_folders_design.md` - This document
2. `docs/api/graphql_mutations.md` - API documentation (if exists)
3. `CHANGELOG.md` - Feature addition

---

## Implementation Order

### Phase 1: Security Infrastructure
- [ ] Create `constants/zip_import.py`
- [ ] Create `utils/zip_security.py` with `sanitize_zip_path()`
- [ ] Add `validate_zip_for_import()` function
- [ ] Write comprehensive tests for security utilities

### Phase 2: Folder Creation
- [ ] Add `create_folder_structure_from_paths()` utility
- [ ] Handle existing folder detection and reuse
- [ ] Add tests for folder tree creation

### Phase 3: Async Task
- [ ] Create `import_zip_with_folder_structure` Celery task
- [ ] Implement validation phase
- [ ] Implement folder creation phase
- [ ] Implement document processing phase with batching
- [ ] Add comprehensive logging

### Phase 4: GraphQL Integration
- [ ] Create `ImportZipToCorpus` mutation class
- [ ] Add permission checks and rate limiting
- [ ] Wire up async task invocation
- [ ] Register in schema

### Phase 5: Testing & Documentation
- [ ] Integration tests with real zip files
- [ ] Security penetration tests
- [ ] Update CHANGELOG.md
- [ ] Update any API documentation

---

## API Usage Example

### GraphQL Mutation

```graphql
mutation ImportContractsZip($file: String!, $corpusId: ID!) {
  importZipToCorpus(
    base64FileString: $file
    corpusId: $corpusId
    titlePrefix: "2024 Contracts"
    makePublic: false
  ) {
    ok
    message
    jobId
  }
}
```

### Response

```json
{
  "data": {
    "importZipToCorpus": {
      "ok": true,
      "message": "Import started. Job ID: abc123-def456",
      "jobId": "abc123-def456"
    }
  }
}
```

### Job Result (via Celery result backend)

```json
{
  "job_id": "abc123-def456",
  "success": true,
  "completed": true,
  "validation_passed": true,
  "total_files_in_zip": 150,
  "files_processed": 142,
  "files_skipped_type": 5,
  "files_skipped_size": 2,
  "files_skipped_hidden": 1,
  "files_errored": 0,
  "folders_created": 12,
  "folders_reused": 3,
  "document_ids": ["doc1", "doc2", "..."],
  "skipped_oversized": ["large_contract.pdf", "massive_scan.pdf"],
  "errors": []
}
```

---

**Last Updated**: 2025-01-XX
**Status**: Design Complete - Ready for Implementation
**Author**: Claude Code
