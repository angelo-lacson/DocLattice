# Bulk Import Architecture

This document describes the architecture for bulk importing documents into OpenContracts via ZIP files, including folder structure preservation and document relationship creation.

## Overview

The bulk import feature allows users to:
1. Upload a ZIP file containing multiple documents
2. Preserve the folder structure from the ZIP
3. Automatically create document relationships via a `relationships.csv` file
4. Handle document versioning for duplicate paths

## ZIP File Conventions

### Supported File Structure

```
my-import.zip
├── contracts/
│   ├── legal/
│   │   └── agreement.pdf
│   └── financial/
│       └── report.pdf
├── docs/
│   └── amendment.pdf
├── readme.txt
├── meta.csv             (optional - document metadata)
└── relationships.csv    (optional - document relationships)
```

### Supported Document Types

The following file types are processed as documents:
- **PDF**: `.pdf`
- **Word**: `.docx`
- **PowerPoint**: `.pptx`
- **Excel**: `.xlsx`
- **Text**: `.txt`
- **Markdown**: `.md`

### Skipped Files

The following files are automatically skipped:
- Hidden files (starting with `.`)
- macOS metadata (`__MACOSX/`, `.DS_Store`)
- Files exceeding size limits
- Unsupported file types

### Security Constraints

| Constraint | Default Value | Description |
|------------|---------------|-------------|
| `ZIP_MAX_FILE_COUNT` | 10,000 | Maximum files allowed in ZIP |
| `ZIP_MAX_TOTAL_SIZE_BYTES` | 5 GB | Maximum total uncompressed size |
| `ZIP_MAX_SINGLE_FILE_SIZE_BYTES` | 500 MB | Maximum single file size |
| `ZIP_MAX_COMPRESSION_RATIO` | 100:1 | Maximum compression ratio (zip bomb protection) |
| `ZIP_MAX_NESTING_DEPTH` | 20 | Maximum folder nesting depth |

Path traversal attempts (e.g., `../../../etc/passwd`) are blocked.

## Relationships File Format

### File Name

The relationships file must be named exactly `relationships.csv` (or `RELATIONSHIPS.csv`) and placed at the **root** of the ZIP archive.

### CSV Schema

```csv
source_path,relationship_label,target_path,notes
contracts/agreement.pdf,AMENDS,docs/amendment.pdf,Amendment to contract
docs/amendment.pdf,AMENDED_BY,contracts/agreement.pdf,
```

| Column | Required | Description |
|--------|----------|-------------|
| `source_path` | Yes | Path to source document (relative to ZIP root) |
| `relationship_label` | Yes | Relationship label text (e.g., "AMENDS", "REFERENCES") |
| `target_path` | Yes | Path to target document (relative to ZIP root) |
| `notes` | No | Optional notes text; if present, relationship type is NOTES |

### Path Normalization

Paths in the CSV are normalized to a canonical form:
- Backslashes are converted to forward slashes (`\` -> `/`)
- Leading `./` references are removed
- Leading slashes are normalized to a single `/`
- Duplicate slashes are collapsed (`//` -> `/`)
- Paths must not contain `..` (path traversal protection)

All of these reference the same document (`/contracts/agreement.pdf`):
```
contracts/agreement.pdf
/contracts/agreement.pdf
./contracts/agreement.pdf
contracts\agreement.pdf
/./contracts/agreement.pdf
```

### Relationship Types

| Type | Description |
|------|-------------|
| `RELATIONSHIP` | Standard document relationship (default) |
| `NOTES` | Relationship with notes/annotations attached |

## Metadata File Format

### File Name

The metadata file must be named exactly `meta.csv` (or `metadata.csv`, `META.csv`, `METADATA.csv`) and placed at the **root** of the ZIP archive.

### CSV Schema

```csv
source_path,title,description
contracts/agreement.pdf,Master Services Agreement,The main services contract
docs/report.pdf,Q4 Financial Report,
```

| Column | Required | Description |
|--------|----------|-------------|
| `source_path` | Yes | Path to document (relative to ZIP root) |
| `title` | No | Custom document title (overrides filename-based title) |
| `description` | No | Custom document description |

### Path Normalization

Paths in the CSV use the same normalization as relationships.csv:
- Backslashes are converted to forward slashes
- Leading `./` references are removed
- Leading slashes are normalized to a single `/`
- Path traversal (`..`) is rejected

### Behavior Notes

- **Optional columns**: Either `title` or `description` (or both) can be omitted
- **Empty values**: Empty cells are ignored (don't override defaults)
- **Partial coverage**: Not all documents need metadata entries
- **Title prefix**: If a `title_prefix` is specified at import time, it's prepended to the metadata title (e.g., "2024 - Master Services Agreement")
- **Multiple metadata files**: If multiple metadata files exist, priority order is: `meta.csv` > `META.csv` > `metadata.csv` > `METADATA.csv`

### Example with Folder Structure

```csv
source_path,title,description
contracts/legal/agreement.pdf,Legal Agreement,Main legal agreement document
contracts/financial/report.pdf,Financial Report,Q4 financial summary
docs/readme.txt,Project README,
```

## Import Process Architecture

### Phase 1: Validation

The ZIP file is validated for security constraints before any processing:

```python
from opencontractserver.utils.zip_security import validate_zip_for_import

manifest = validate_zip_for_import(zip_file_path)
if manifest.validation_errors:
    raise ValidationError(manifest.validation_errors)
```

The validation produces a `ZipManifest` containing:
- List of valid files to process
- List of skipped files (with reasons)
- Folder paths to create
- Relationship file path (if present)
- Validation errors

### Phase 2: Folder Creation

Folder structure is created in a single transaction:

```python
from opencontractserver.corpuses.folder_service import DocumentFolderService

folder_map, created, reused, error = DocumentFolderService.create_folder_structure_from_paths(
    user=user,
    corpus=corpus,
    folder_paths=manifest.folder_paths,
    target_folder=target_folder,  # optional
)
```

Existing folders are reused, not duplicated.

### Phase 3: Document Import

Documents are imported with the following logic:
1. Check if path already exists in corpus
2. If exists: create new version (upversion)
3. If new: create document and DocumentPath

A `document_path_map` is built during this phase for relationship processing:

```python
document_path_map: dict[str, Document] = {}
# Key: normalized zip path (e.g., "contracts/agreement.pdf")
# Value: Document object
```

### Phase 4: Relationship Creation

If a `relationships.csv` file is present:

```python
from opencontractserver.utils.relationship_file_parser import parse_relationship_file

with zipfile.ZipFile(zip_path) as zf:
    csv_content = zf.read(manifest.relationship_file)

parsed = parse_relationship_file(csv_content, manifest.relationship_file)
if parsed.is_valid:
    stats = create_relationships_from_parsed(
        corpus=corpus,
        user=user,
        document_path_map=document_path_map,
        parsed_relationships=parsed.relationships,
    )
```

Relationships are created using `corpus.ensure_label_and_labelset()` for atomic label/labelset creation with `LabelType.RELATIONSHIP_LABEL`.

## API

### GraphQL Mutation

```graphql
mutation ImportZipToCorpus(
  $base64FileString: String!
  $corpusId: ID!
  $targetFolderId: ID
  $titlePrefix: String
  $description: String
  $customMeta: GenericScalar
  $makePublic: Boolean!
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

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `ok` | Boolean | Whether the import was queued successfully |
| `message` | String | Success/error message |
| `jobId` | String | Celery task ID for tracking progress |

### Task Result Schema

The Celery task returns a detailed result dict:

```python
{
    "job_id": "task-uuid",
    "completed": True,
    "success": True,
    "validation_passed": True,
    "validation_errors": [],
    "total_files_in_zip": 17,
    "files_processed": 15,
    "files_skipped_hidden": 2,
    "files_skipped_type": 1,
    "files_skipped_size": 0,
    "files_skipped_path": 0,
    "files_errored": 0,
    "files_upversioned": 3,
    "folders_created": 5,
    "folders_reused": 2,
    "metadata_file_found": True,
    "metadata_applied": 12,
    "relationships_file_found": True,
    "relationships_created": 8,
    "relationships_skipped": 1,
    "relationship_errors": ["Source document not found: missing.pdf"],
    "document_ids": ["uuid1", "uuid2", ...],
    "errors": [],
    "skipped_oversized": [],
    "upversioned_paths": ["/docs/existing.pdf"],
}
```

## Frontend Components

### BulkImportModal

Located at `frontend/src/components/widgets/modals/BulkImportModal.tsx`

The modal provides:
1. **Confirmation step**: Warning about bulk import being irreversible
2. **Upload step**: Drag-and-drop file selection
3. **Progress step**: Upload progress indicator

### FolderToolbar Integration

The Upload button has a dropdown with two options:
- **Upload Documents**: Standard multi-file upload
- **Bulk Import (ZIP)**: Opens BulkImportModal

## File Locations

| Component | Path |
|-----------|------|
| ZIP Security | `opencontractserver/utils/zip_security.py` |
| Relationship Parser | `opencontractserver/utils/relationship_file_parser.py` |
| Metadata Parser | `opencontractserver/utils/metadata_file_parser.py` |
| Import Task | `opencontractserver/tasks/import_tasks.py` |
| GraphQL Mutation | `config/graphql/mutations.py` (ImportZipToCorpus) |
| Frontend Modal | `frontend/src/components/widgets/modals/BulkImportModal.tsx` |
| Frontend Mutation | `frontend/src/graphql/mutations.ts` |

## Error Handling

### Validation Errors (Import Blocked)

- Too many files in ZIP
- ZIP exceeds total size limit
- Suspected zip bomb (high compression ratio)
- Path traversal detected
- Invalid ZIP format

### Processing Errors (Partial Success)

- Individual file too large (skipped)
- Unsupported file type (skipped)
- File extraction error (skipped)
- Relationship source/target not found (skipped)

### Graceful Degradation

- Malformed `relationships.csv` does not fail the import
- Missing documents in relationships are logged and skipped
- The import succeeds with available documents

## Testing

### Unit Tests

```bash
# Relationship parser tests
docker compose -f test.yml run django pytest opencontractserver/tests/test_relationship_file_parser.py -v

# Metadata parser tests
docker compose -f test.yml run django pytest opencontractserver/tests/test_metadata_file_parser.py -v

# ZIP security tests
docker compose -f test.yml run django pytest opencontractserver/tests/test_zip_security.py -v
```

### Integration Tests

```bash
# Full import integration tests (includes relationship and metadata tests)
docker compose -f test.yml run django pytest opencontractserver/tests/test_zip_import_integration.py -v

# Run only relationship tests
docker compose -f test.yml run django pytest opencontractserver/tests/test_zip_import_integration.py::TestRelationshipFileImport -v

# Run only metadata tests
docker compose -f test.yml run django pytest opencontractserver/tests/test_zip_import_integration.py::TestMetadataFileImport -v
```

## Example: Creating a ZIP for Import

```bash
# Create folder structure
mkdir -p import/contracts/legal import/contracts/financial import/docs

# Add documents
cp agreement.pdf import/contracts/legal/
cp report.pdf import/contracts/financial/
cp amendment.pdf import/docs/

# Create metadata file (optional)
cat > import/meta.csv << 'EOF'
source_path,title,description
contracts/legal/agreement.pdf,Master Services Agreement,The main services contract
contracts/financial/report.pdf,Q4 Financial Report,Quarterly financial summary
docs/amendment.pdf,Amendment #1,First amendment to MSA
EOF

# Create relationships file (optional)
cat > import/relationships.csv << 'EOF'
source_path,relationship_label,target_path,notes
contracts/legal/agreement.pdf,AMENDS,docs/amendment.pdf,Amendment to main contract
docs/amendment.pdf,AMENDED_BY,contracts/legal/agreement.pdf,
contracts/legal/agreement.pdf,REFERENCES,contracts/financial/report.pdf,
EOF

# Create ZIP
cd import && zip -r ../my-import.zip . && cd ..
```
