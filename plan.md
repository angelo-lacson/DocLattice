# Implementation Plan: Bulk Import UI & Relationships File Support

## Overview

This plan covers two features for PR 765 (feature/zip-import-with-folder-structure):

1. **Frontend**: Add a "Bulk Import" action button in the corpus documents view with confirmation modal
2. **Backend**: Handle a special `relationships.[extension]` file in zip imports that describes document relationships

---

## Feature 1: Frontend Bulk Import Button

### Goal
Add an action button in the corpus documents view for users with corpus EDIT permission to trigger bulk zip import via the `ImportZipToCorpus` mutation.

### Permission Model
- **Required Permission**: `CAN_UPDATE` on the corpus (maps to EDIT/UPDATE permission)
- **Permission Check Location**: Already available via `canCreateFolders` atom (derives from corpus permissions)
- **Additional Check**: Can reuse existing permission infrastructure from `FolderToolbar.tsx`

### UI Flow
1. User clicks "Bulk Import" button in `FolderToolbar`
2. **Confirmation Modal** appears explaining:
   - This will import all documents from a zip file
   - Folder structure will be preserved
   - There is no easy way to undo this operation
   - Lists the limits (max 1000 files, 500MB total, 100MB per file)
3. If user confirms, proceed to **Upload Modal**
4. Upload modal allows:
   - File selection (.zip files only)
   - Optional title prefix
   - Optional description
   - Make public checkbox
5. On submit, call `ImportZipToCorpus` mutation
6. Show success toast with job ID

### Files to Create/Modify

#### New Files
1. **`frontend/src/components/widgets/modals/BulkImportModal.tsx`**
   - Combines confirmation step + file upload
   - Uses `ImportZipToCorpus` mutation (not `UploadDocumentsZip`)
   - Passes `corpusId` (required) and `targetFolderId` (from current folder)

2. **`frontend/src/graphql/mutations/importZipToCorpus.ts`**
   - GraphQL mutation definition for `ImportZipToCorpus`

#### Modified Files
1. **`frontend/src/components/corpuses/folders/FolderToolbar.tsx`**
   - Add "Bulk Import" button next to "Upload" button
   - Only show when user has corpus UPDATE permission
   - Add `onBulkImport` callback prop

2. **`frontend/src/components/corpuses/folders/FolderDocumentBrowser.tsx`**
   - Add state for bulk import modal visibility
   - Pass `onBulkImport` handler to `FolderToolbar`
   - Mount `BulkImportModal` component

3. **`frontend/src/graphql/cache.ts`**
   - Add `showBulkImportModal` reactive var

4. **`frontend/src/atoms/folderAtoms.ts`**
   - Add `canBulkImportAtom` derived from corpus permissions (UPDATE required)

### Component Structure

```tsx
// BulkImportModal.tsx
<BulkImportModal
  corpusId={corpusId}
  targetFolderId={selectedFolderId}  // Optional, current folder
  onClose={() => setShowModal(false)}
/>

// Two-step modal:
// Step 1: Confirmation
<ConfirmationStep>
  <WarningMessage>
    This will import all documents from a ZIP file into this corpus.
    Folder structure will be preserved. This action cannot be easily undone.
  </WarningMessage>
  <LimitsList>
    - Maximum 1000 files per zip
    - Maximum 500MB total size
    - Files larger than 100MB will be skipped
  </LimitsList>
  <Buttons>
    <CancelButton />
    <ContinueButton />
  </Buttons>
</ConfirmationStep>

// Step 2: Upload (similar to existing BulkUploadModal)
<UploadStep>
  <DropZone />
  <TitlePrefixField />
  <DescriptionField />
  <MakePublicCheckbox />
  <UploadProgress />
  <SubmitButton />
</UploadStep>
```

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

### Button Placement in FolderToolbar

```tsx
// In FolderToolbar.tsx, after the Upload button:
{canBulkImport && (
  <ActionButton
    onClick={onBulkImport}
    title="Bulk import documents from ZIP"
  >
    <Archive />  {/* or FileArchive from lucide-react */}
    <span>Bulk Import</span>
  </ActionButton>
)}
```

---

## Feature 2: Backend Relationships File Support

### Goal
Handle a special file in the zip (e.g., `relationships.txt`, `relationships.csv`, or `relationships.json`) that describes relationships between documents using a graph-like syntax.

### Critical Two-Pass Architecture

**The relationship processing MUST happen in a second pass after all documents are imported.**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ZIP IMPORT PROCESSING FLOW                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PASS 1: Document Import                                             │
│  ────────────────────────                                            │
│  For each file in zip:                                               │
│    1. Extract and create Document                                    │
│    2. Add to corpus with folder assignment                           │
│    3. Store mapping: zip_path → Document.id                          │
│                                                                      │
│  Output: document_path_map = {                                       │
│    "/contracts/master.pdf": Document(id=123),                        │
│    "/contracts/amendments/amendment1.pdf": Document(id=124),         │
│    "/exhibits/exhibit_a.pdf": Document(id=125),                      │
│    ...                                                               │
│  }                                                                   │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PASS 2: Relationship Creation                                       │
│  ─────────────────────────────                                       │
│  1. Detect relationships file in zip                                 │
│  2. Parse relationships file → list of ParsedRelationship            │
│  3. For each relationship:                                           │
│     a. Lookup source_doc from document_path_map[source_path]         │
│     b. Lookup target_doc from document_path_map[target_path]         │
│     c. Use corpus.ensure_label_and_labelset() to get/create label    │
│     d. Create DocumentRelationship(source, target, corpus, label)    │
│                                                                      │
│  Output: relationships_created, relationships_failed, errors         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Discovery: Label and LabelSet Creation

**Critical**: The `Corpus` model has an `ensure_label_and_labelset()` method (lines 752-804 in `corpuses/models.py`) that:

1. **Creates a LabelSet** for the corpus if it doesn't have one
2. **Creates an AnnotationLabel** if it doesn't exist in that labelset
3. **Adds the label** to the corpus's labelset

This is the correct way to create labels for document relationships:

```python
# From opencontractserver/corpuses/models.py:752-804
def ensure_label_and_labelset(
    self,
    *,
    label_text: str,
    creator_id: int,
    label_type: str | None = None,
    color: str = "#05313d",
    description: str = "",
    icon: str = "tags",
):
    """Return an AnnotationLabel for *label_text*, creating prerequisites."""
    with transaction.atomic():
        # Create label-set lazily.
        if self.label_set is None:
            self.label_set = LabelSet.objects.create(
                title=f"Corpus {self.pk} Set",
                description="Auto-created label set",
                creator_id=creator_id,
            )
            self.save(update_fields=["label_set", "modified"])

        # Fetch/create label inside that set.
        label = self.label_set.annotation_labels.filter(
            text=label_text, label_type=label_type
        ).first()
        if label is None:
            label = AnnotationLabel.objects.create(
                text=label_text,
                label_type=label_type,
                color=color,
                description=description,
                icon=icon,
                creator_id=creator_id,
            )
            self.label_set.annotation_labels.add(label)

    return label
```

### File Format Options

#### Option A: Text Format (Recommended for human readability)
File: `relationships.txt` or `RELATIONSHIPS.txt`

```
# Document Relationships File
# Syntax: source_path -- [Label] --> target_path

/contracts/master.pdf -- [Parent] --> /contracts/amendments/amendment1.pdf
/contracts/master.pdf -- [Parent] --> /contracts/amendments/amendment2.pdf
/contracts/master.pdf -- [References] --> /exhibits/exhibit_a.pdf
/legal/opinion.pdf -- [Supersedes] --> /legal/old_opinion.pdf

# Notes format (optional content after label in braces)
/docs/agreement.pdf -- [Notes] {Review needed by legal} --> /docs/draft.pdf
```

#### Option B: CSV Format
File: `relationships.csv`

```csv
source_path,relationship_label,target_path,notes
/contracts/master.pdf,Parent,/contracts/amendments/amendment1.pdf,
/contracts/master.pdf,References,/exhibits/exhibit_a.pdf,See section 3
```

#### Option C: JSON Format
File: `relationships.json`

```json
{
  "relationships": [
    {
      "source": "/contracts/master.pdf",
      "target": "/contracts/amendments/amendment1.pdf",
      "label": "Parent"
    },
    {
      "source": "/contracts/master.pdf",
      "target": "/exhibits/exhibit_a.pdf",
      "label": "References",
      "notes": "See section 3"
    }
  ]
}
```

### Recommended Approach: Support All Three Formats

Priority order for detection:
1. `relationships.json` (most structured)
2. `relationships.csv`
3. `relationships.txt` (most human-readable)

### Backend Implementation

#### New Files

1. **`opencontractserver/utils/relationship_file_parser.py`**
   ```python
   from dataclasses import dataclass, field
   from typing import Optional
   import re
   import csv
   import json
   from zipfile import ZipFile

   RELATIONSHIP_FILE_NAMES = [
       'relationships.json', 'relationships.csv', 'relationships.txt',
       'RELATIONSHIPS.json', 'RELATIONSHIPS.csv', 'RELATIONSHIPS.txt',
   ]

   @dataclass
   class ParsedRelationship:
       """A single relationship parsed from the relationships file."""
       source_path: str      # Path within the zip (e.g., "/contracts/master.pdf")
       target_path: str      # Path within the zip
       label: str            # Relationship label (e.g., "Parent", "References")
       notes: Optional[str] = None
       relationship_type: str = "RELATIONSHIP"  # or "NOTES" if notes provided

   @dataclass
   class RelationshipFileParseResult:
       """Result of parsing a relationships file."""
       is_valid: bool
       relationships: list[ParsedRelationship] = field(default_factory=list)
       errors: list[str] = field(default_factory=list)
       warnings: list[str] = field(default_factory=list)
       file_format: Optional[str] = None  # "json", "csv", or "txt"

   def detect_relationship_file(zip_file: ZipFile) -> Optional[str]:
       """
       Detect if zip contains a relationships file.
       Returns filename if found, None otherwise.
       Checks in priority order: json > csv > txt
       """
       for name in RELATIONSHIP_FILE_NAMES:
           if name in zip_file.namelist():
               return name
       return None

   def parse_relationship_file(
       zip_file: ZipFile,
       filename: str
   ) -> RelationshipFileParseResult:
       """Parse the relationships file and return parsed relationships."""
       ...

   def parse_txt_relationships(content: str) -> RelationshipFileParseResult:
       """
       Parse text format relationships.
       Format: source_path -- [Label] --> target_path
       Optional notes: source_path -- [Label] {notes text} --> target_path
       """
       ...

   def parse_csv_relationships(content: str) -> RelationshipFileParseResult:
       """Parse CSV format relationships."""
       ...

   def parse_json_relationships(content: str) -> RelationshipFileParseResult:
       """Parse JSON format relationships."""
       ...

   def normalize_path(path: str) -> str:
       """Normalize a path from the relationships file."""
       ...
   ```

2. **`opencontractserver/tests/test_relationship_file_parser.py`**
   - Test all three formats
   - Test error handling (malformed files, invalid paths)
   - Test edge cases (empty files, comments, whitespace)

#### Modified Files

1. **`opencontractserver/tasks/import_tasks.py`**

   **Key Changes**:
   - Build `document_path_map` during Phase 3 (document import)
   - Add Phase 4 for relationship processing using the map
   - Use `corpus.ensure_label_and_labelset()` for labels

   ```python
   def import_zip_with_folder_structure(...) -> dict:
       results = {...}  # existing results dict

       # Add new result fields for relationships
       results["relationships_file_found"] = False
       results["relationships_file_format"] = None
       results["relationships_parsed"] = 0
       results["relationships_created"] = 0
       results["relationships_failed"] = 0
       results["relationships_skipped_duplicate"] = 0
       results["relationship_errors"] = []
       results["relationship_warnings"] = []

       # ... existing phases 1-2 (validation, folder creation) ...

       # Phase 3: Process documents in batches
       # BUILD document_path_map AS WE CREATE DOCUMENTS
       document_path_map: dict[str, Document] = {}

       batch_count = 0
       for entry in manifest.valid_files:
           try:
               # ... existing document creation logic ...

               if document:
                   # ... existing permission and corpus.add_document logic ...

                   # BUILD THE PATH MAP as documents are created
                   # Use normalized path (leading /) as key
                   document_path_map[f"/{entry.sanitized_path}"] = document

                   # Also store without leading slash for flexibility
                   document_path_map[entry.sanitized_path] = document

                   results["files_processed"] += 1
                   results["document_ids"].append(str(document.id))

           except Exception as e:
               # ... existing error handling ...

       # Phase 4: Process relationships file (AFTER all documents imported)
       relationship_filename = detect_relationship_file(import_zip)

       if relationship_filename:
           results["relationships_file_found"] = True
           logger.info(
               f"import_zip_with_folder_structure() - Found relationships file: "
               f"{relationship_filename}"
           )

           # Parse the relationships file
           parse_result = parse_relationship_file(import_zip, relationship_filename)
           results["relationships_file_format"] = parse_result.file_format
           results["relationships_parsed"] = len(parse_result.relationships)
           results["relationship_warnings"].extend(parse_result.warnings)

           if not parse_result.is_valid:
               results["relationship_errors"].extend(parse_result.errors)
           else:
               # Create relationships using document_path_map
               created, failed, skipped_dup, errors = create_relationships_from_parsed(
                   user=user_obj,
                   corpus=corpus_obj,
                   parsed_relationships=parse_result.relationships,
                   document_path_map=document_path_map,
               )
               results["relationships_created"] = created
               results["relationships_failed"] = failed
               results["relationships_skipped_duplicate"] = skipped_dup
               results["relationship_errors"].extend(errors)

       # ... existing cleanup and return ...
   ```

2. **Relationship Creation Service** (inline in `import_tasks.py` or separate file):

   ```python
   from django.db import IntegrityError
   from opencontractserver.annotations.models import (
       AnnotationLabel,
       DOC_TYPE_LABEL,
   )
   from opencontractserver.documents.models import Document, DocumentRelationship

   def create_relationships_from_parsed(
       user: User,
       corpus: Corpus,
       parsed_relationships: list[ParsedRelationship],
       document_path_map: dict[str, Document],
   ) -> tuple[int, int, int, list[str]]:
       """
       Create DocumentRelationship objects from parsed relationship definitions.

       IMPORTANT: Uses corpus.ensure_label_and_labelset() to properly create
       labels within the corpus's labelset (creating the labelset if needed).

       Permission Model (from consolidated_permissioning_guide.md):
       - DocumentRelationship inherits permissions from source_doc + target_doc + corpus
       - User created all documents, so they have CRUD on all
       - User has EDIT permission on corpus (checked at mutation level)

       Args:
           user: The user performing the import
           corpus: The target corpus
           parsed_relationships: List of parsed relationships from the file
           document_path_map: Mapping of zip paths to Document objects
                              Built during Phase 3 document import

       Returns:
           (created_count, failed_count, skipped_duplicate_count, errors)
       """
       created = 0
       failed = 0
       skipped_duplicate = 0
       errors = []

       # Cache for labels to avoid repeated lookups
       # Key: label text, Value: AnnotationLabel
       label_cache: dict[str, AnnotationLabel] = {}

       for rel in parsed_relationships:
           try:
               # Look up documents from the path map
               # Try both with and without leading slash
               source_doc = (
                   document_path_map.get(rel.source_path) or
                   document_path_map.get(rel.source_path.lstrip('/')) or
                   document_path_map.get('/' + rel.source_path.lstrip('/'))
               )
               target_doc = (
                   document_path_map.get(rel.target_path) or
                   document_path_map.get(rel.target_path.lstrip('/')) or
                   document_path_map.get('/' + rel.target_path.lstrip('/'))
               )

               if not source_doc:
                   errors.append(
                       f"Source document not found for path: {rel.source_path}"
                   )
                   failed += 1
                   continue

               if not target_doc:
                   errors.append(
                       f"Target document not found for path: {rel.target_path}"
                   )
                   failed += 1
                   continue

               # Get or create the relationship label using corpus method
               # This ensures the label is in the corpus's labelset
               label = label_cache.get(rel.label)
               if not label:
                   label = corpus.ensure_label_and_labelset(
                       label_text=rel.label,
                       creator_id=user.id,
                       label_type=DOC_TYPE_LABEL,  # Document-level relationship label
                       description=f"Document relationship label: {rel.label}",
                   )
                   label_cache[rel.label] = label

               # Determine relationship type and data
               if rel.notes:
                   relationship_type = "NOTES"
                   data = {'notes': rel.notes}
               else:
                   relationship_type = "RELATIONSHIP"
                   data = None

               # Create the DocumentRelationship
               DocumentRelationship.objects.create(
                   source_document=source_doc,
                   target_document=target_doc,
                   corpus=corpus,
                   annotation_label=label,
                   relationship_type=relationship_type,
                   data=data,
                   creator=user,
               )
               created += 1

           except IntegrityError:
               # Duplicate relationship (unique constraint violation)
               skipped_duplicate += 1
           except Exception as e:
               errors.append(
                   f"Error creating relationship {rel.source_path} -> {rel.target_path}: "
                   f"{str(e)}"
               )
               failed += 1

       return created, failed, skipped_duplicate, errors
   ```

3. **`opencontractserver/utils/zip_security.py`**

   Add relationships file to allowlist:
   ```python
   RELATIONSHIP_FILE_NAMES = frozenset([
       'relationships.json', 'relationships.csv', 'relationships.txt',
       'RELATIONSHIPS.json', 'RELATIONSHIPS.csv', 'RELATIONSHIPS.txt',
   ])

   def is_relationship_file(path: str) -> bool:
       """Check if path is a relationships definition file."""
       import os
       return os.path.basename(path) in RELATIONSHIP_FILE_NAMES
   ```

   Update `validate_zip_for_import()` to skip relationships files from document processing:
   ```python
   # In validate_zip_for_import(), when building valid_files list:
   if is_relationship_file(entry.original_path):
       # Don't add to valid_files (will be processed separately in Phase 4)
       continue
   ```

4. **`opencontractserver/constants/zip_import.py`**

   Add relationship-related constants:
   ```python
   # Relationship file processing
   MAX_RELATIONSHIPS_PER_IMPORT = 500
   RELATIONSHIP_LABEL_MAX_LENGTH = 100
   ```

### Document Path Map Construction

**Critical Detail**: The `document_path_map` must be built correctly to match paths in the relationships file:

```python
# During document processing in Phase 3:
document_path_map: dict[str, Document] = {}

for entry in manifest.valid_files:
    # ... create document ...

    if document:
        # The sanitized_path is the path within the zip
        # e.g., "contracts/master.pdf"

        # Store with normalized path (leading /)
        zip_path = f"/{entry.sanitized_path}"
        document_path_map[zip_path] = document

        # Also store without leading slash for flexible matching
        document_path_map[entry.sanitized_path] = document
```

### Path Matching Example

| Zip Content | document_path_map Keys | Relationships File Reference |
|-------------|------------------------|------------------------------|
| `contracts/master.pdf` | `/contracts/master.pdf`, `contracts/master.pdf` | `/contracts/master.pdf` or `contracts/master.pdf` |
| `contracts/amendments/a1.pdf` | `/contracts/amendments/a1.pdf`, `contracts/amendments/a1.pdf` | Either form works |

### Permission Considerations

From `docs/permissioning/consolidated_permissioning_guide.md`:

1. **DocumentRelationship** uses inherited permissions:
   ```
   Effective Permission = MIN(source_doc_perm, target_doc_perm, corpus_perm)
   ```

2. **Why this works for import**:
   - User importing the zip has EDIT permission on corpus (required by mutation)
   - User is the creator of all imported documents → has CRUD on all
   - Therefore, user has CREATE permission on both docs + corpus
   - All permission requirements satisfied

3. **LabelSet and Label Creation**:
   - `corpus.ensure_label_and_labelset()` handles all label creation atomically
   - Creates labelset if corpus doesn't have one
   - Creates label if it doesn't exist in labelset
   - Adds label to labelset's many-to-many

### Validation Rules

1. **Path Validation**:
   - Paths must reference documents within the same zip
   - Paths are normalized (leading `/` optional)
   - Both forms (`/path` and `path`) are checked for matches

2. **Label Validation**:
   - Max length: 100 characters
   - Labels created via `corpus.ensure_label_and_labelset()`
   - Empty labels not allowed

3. **Limits**:
   - Max 500 relationships per import
   - Warnings (not errors) for unparseable lines in txt format

4. **Error Handling**:
   - Missing source/target documents: Skip with error, continue processing
   - Duplicate relationships: Skip silently (unique constraint handles)

### Results Structure Update

```python
results = {
    # ... existing fields ...

    # New fields for relationships
    "relationships_file_found": False,
    "relationships_file_format": None,  # "json", "csv", or "txt"
    "relationships_parsed": 0,          # Total parsed from file
    "relationships_created": 0,         # Successfully created
    "relationships_failed": 0,          # Failed (missing docs, etc.)
    "relationships_skipped_duplicate": 0,  # Skipped due to unique constraint
    "relationship_errors": [],          # Detailed error messages
    "relationship_warnings": [],        # Warnings (unparseable lines, etc.)
}
```

---

## Testing Strategy

### Frontend Tests

1. **Unit Tests** (`frontend/tests/BulkImportModal.test.tsx`):
   - Modal renders with confirmation step
   - Confirmation step shows warning and limits
   - File selection validates .zip extension
   - Form submission calls mutation with correct variables
   - Success/error handling

2. **Component Tests** (Playwright):
   - Full flow: button click → confirmation → upload → success
   - Permission gating (button hidden without UPDATE permission)

### Backend Tests

1. **Parser Tests** (`test_relationship_file_parser.py`):
   - Text format parsing with various edge cases
   - CSV format parsing
   - JSON format parsing
   - Error handling for malformed files
   - Path normalization
   - Comment handling (txt format)

2. **Integration Tests** (`test_zip_import_integration.py`):
   - Add tests for zips with relationships files
   - Test all three formats
   - Test path resolution with and without leading slashes
   - Test error cases (missing documents, invalid labels)
   - Test duplicate relationship handling
   - Verify labelset and labels created correctly

3. **Permission Tests**:
   - Verify created relationships have correct inherited permissions
   - Test visibility filtering via DocumentRelationshipQueryOptimizer

---

## Implementation Order

### Phase 1: Backend Relationship File Parser (Day 1)
1. Create `relationship_file_parser.py` with all three format parsers
2. Create unit tests for parser
3. Add constants to `zip_import.py`
4. Update `zip_security.py` to recognize relationship files

### Phase 2: Backend Integration (Day 1-2)
1. Modify `import_tasks.py`:
   - Build `document_path_map` during Phase 3
   - Add Phase 4 for relationship processing
   - Use `corpus.ensure_label_and_labelset()` for labels
2. Implement `create_relationships_from_parsed()`
3. Update results structure
4. Add integration tests

### Phase 3: Frontend GraphQL Setup (Day 2)
1. Create `importZipToCorpus.ts` mutation file
2. Add reactive var for modal visibility

### Phase 4: Frontend UI Components (Day 2-3)
1. Create `BulkImportModal.tsx` with two-step flow
2. Modify `FolderToolbar.tsx` to add button
3. Modify `FolderDocumentBrowser.tsx` to handle modal state
4. Add permission-based visibility

### Phase 5: Testing & Polish (Day 3)
1. Frontend unit/component tests
2. Full integration testing
3. Update CHANGELOG.md

---

## Security Considerations

1. **Path Traversal in Relationships File**:
   - Paths in relationships file must reference documents within the zip
   - Paths not found in `document_path_map` are rejected
   - All paths are normalized

2. **Label Injection**:
   - Label text length enforced (max 100 chars)
   - Labels created via `corpus.ensure_label_and_labelset()` are user-owned

3. **Permission Enforcement**:
   - User must have corpus EDIT permission (checked at mutation level)
   - User has CRUD on all imported documents (set during import)
   - Relationship permissions are computed from doc+corpus permissions

4. **Resource Limits**:
   - Max 500 relationships per import (configurable)
   - Prevents DoS via massive relationship files

---

## Open Questions for User

1. **Relationship File Format Priority**: Do you have a preference for which format to prioritize, or should we support all three (JSON, CSV, TXT)?

2. **Label Type**: Should relationship labels use:
   - a) `DOC_TYPE_LABEL` (document-level type label) - recommended
   - b) `RELATIONSHIP_LABEL` (relationship label)
   - c) Another type?

3. **Relationship Type**: The current DocumentRelationship model supports:
   - `RELATIONSHIP` (requires label, structured)
   - `NOTES` (optional label, can include freeform data)

   Should the relationships file support both via the `{notes}` syntax, or just `RELATIONSHIP`?

4. **Button Placement**: Should the "Bulk Import" button be:
   - a) Next to the existing "Upload" button in the toolbar?
   - b) Inside the existing Upload button as a dropdown option?
   - c) In the corpus actions menu (kebab menu)?
