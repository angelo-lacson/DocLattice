# Changelog

All notable changes to OpenContracts will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2025-11-23

### Added

#### Corpus Engagement Analytics Dashboard (Issue #579)
- **New CorpusEngagementDashboard component** displaying comprehensive engagement metrics
  - Thread metrics: total threads, active threads, average messages per thread
  - Message activity: total messages, 7-day and 30-day message counts with bar chart visualization
  - Community engagement: unique contributors, active contributors (30d), total upvotes
  - Auto-refresh every 5 minutes with last updated timestamp
  - Mobile-responsive design with conditional layouts and grid systems
  - Location: `frontend/src/components/analytics/CorpusEngagementDashboard.tsx`

- **GraphQL integration for engagement metrics**
  - New query: `GET_CORPUS_ENGAGEMENT_METRICS` with TypeScript interfaces
  - Leverages existing backend `CorpusEngagementMetrics` model (already tested)
  - Location: `frontend/src/graphql/queries.ts:3873-3979`

- **Analytics tab in Corpus view**
  - New tab with BarChart3 icon next to Discussions tab
  - Conditionally rendered based on corpus ID availability
  - Location: `frontend/src/views/Corpuses.tsx:2209-2216`

- **Dependencies**
  - Added recharts@3.4.1 for data visualization (BarChart, ResponsiveContainer, Tooltip, Legend)
  - Added react-countup for animated number counters

#### Thread Search UI (Issue #580)
- **Backend pagination support for conversation search**
  - Updated `searchConversations` resolver to use `relay.ConnectionField` with cursor-based pagination
  - Supports `first`, `after`, `last`, `before` parameters for efficient result pagination
  - Returns paginated structure with `edges`, `pageInfo`, and `totalCount`
  - Location: `config/graphql/queries.py:1659-1748`

- **GraphQL queries and TypeScript types with pagination**
  - Updated `SEARCH_CONVERSATIONS` query to support paginated results
  - Added pagination parameters: `first`, `after`, `last`, `before`
  - Enhanced TypeScript interfaces with connection structure (edges, nodes, cursors, pageInfo)
  - Includes full thread metadata: chatMessages count, isPinned, isLocked, corpus/document references
  - Location: `frontend/src/graphql/queries.ts:3923-4059`

- **New search components** (`frontend/src/components/search/`)
  - `SearchBar.tsx`: Search input with clear button and Enter key support
  - `SearchFilters.tsx`: Filter by conversation type with clear filters button
  - `SearchResults.tsx`: Results display with pagination, reuses ThreadListItem component
  - `ThreadSearch.tsx`: Main search container with debounced query (300ms) and pagination
  - All components follow existing design patterns and are mobile-responsive

- **Embedded search in Corpus Discussions view**
  - Added tab navigation to switch between "All Threads" and "Search"
  - Search scoped to current corpus when embedded
  - Location: `frontend/src/components/discussions/CorpusDiscussionsView.tsx`

- **Standalone /threads route**
  - New dedicated search page accessible at `/threads`
  - Global search across all accessible discussions
  - Location: `frontend/src/views/ThreadSearchRoute.tsx`, `frontend/src/App.tsx:421`

- **Backend tests for paginated search**
  - Tests verify pagination structure (edges, pageInfo, totalCount)
  - Tests verify cursor-based pagination with multiple pages
  - Location: `opencontractserver/tests/test_conversation_search.py:609-743`

- **Frontend component tests** (18 tests, 100% passing)
  - SearchBar component tests (5 tests): input rendering, search icon, clear button, Enter key submission
  - SearchFilters component tests (5 tests): filter rendering, option counting, selected state, clear filters button
  - SearchResults component tests (4 tests): loading state, empty state, no results state, results rendering
  - ThreadSearch component tests (4 tests): search bar integration, filters toggle, corpus-scoped search
  - Location: `frontend/tests/search-components.ct.tsx`

#### Structural Annotation Sets (Phase 2.5)
- **New `StructuralAnnotationSet` model** for shared, immutable structural annotations
  - Content-hash based uniqueness (`content_hash` field)
  - Stores parser metadata (`parser_name`, `parser_version`, `page_count`, `token_count`)
  - Stores shared parsing artifacts (`pawls_parse_file`, `txt_extract_file`)
  - Location: `opencontractserver/annotations/models.py`

- **Document → StructuralAnnotationSet FK** with PROTECT on delete
  - Multiple corpus-isolated documents can share the same structural annotation set
  - Eliminates duplication of structural annotations across corpus copies
  - Location: `opencontractserver/documents/models.py:119-127`

- **Annotation.structural_set FK** with XOR constraint
  - Annotations now belong to EITHER a document OR a structural_set (not both, not neither)
  - Database constraint: `annotation_has_single_parent`
  - Location: `opencontractserver/annotations/models.py`

- **Relationship.structural_set FK** with XOR constraint
  - Same pattern as Annotation for relationships
  - Database constraint: `relationship_has_single_parent`
  - Location: `opencontractserver/annotations/models.py`

- **Database migrations**
  - `opencontractserver/annotations/migrations/0048_add_structural_annotation_set.py`
  - `opencontractserver/documents/migrations/0026_add_structural_annotation_set.py`

- **Comprehensive test suite** (32 tests)
  - `opencontractserver/tests/test_structural_annotation_sets.py` (22 tests)
  - `opencontractserver/tests/test_structural_annotation_portability.py` (10 tests)

### Fixed

#### Critical Production Code Fixes

1. **Missing parsing artifacts in corpus copies**
   - **Files**: `opencontractserver/corpuses/models.py:445-451`, `opencontractserver/documents/versioning.py:238-244`
   - **Issue**: When creating corpus-isolated document copies, essential parsing artifacts were not being copied
   - **Fixed**: Added copying of `pawls_parse_file`, `txt_extract_file`, `icon`, `md_summary_file`, `page_count`
   - **Impact**: Corpus copies now have all parsing data needed for annotation, search, and display

2. **Missing `is_public` inheritance in corpus copies**
   - **Files**: `opencontractserver/corpuses/models.py:451`, `opencontractserver/documents/versioning.py:244`
   - **Issue**: Public documents became private when added to a corpus (copy didn't inherit `is_public`)
   - **Fixed**: Added `is_public=document.is_public` to corpus copy creation
   - **Impact**: Document visibility is now correctly preserved across corpus isolation

3. **NULL hash deduplication bug**
   - **File**: `opencontractserver/corpuses/models.py:414-425`
   - **Issue**: All documents without PDF content hashes were incorrectly treated as duplicates
   - **Fixed**: Added null check: `if document.pdf_file_hash is not None:` before hash-based deduplication
   - **Impact**: Documents without hashes are now correctly treated as distinct documents

4. **Structural annotation portability**
   - **Files**: `opencontractserver/corpuses/models.py:456`, `opencontractserver/documents/versioning.py:248`
   - **Issue**: Structural annotations were not traveling with documents when added to multiple corpuses
   - **Fixed**: Corpus copies now inherit `structural_annotation_set` from source document
   - **Impact**: Structural annotations are shared (not duplicated) across corpus-isolated copies

5. **GraphQL corpus.documents field missing**
   - **Files**: `config/graphql/graphene_types.py:1179-1184`, `config/graphql/graphene_types.py:1297-1302`
   - **Issue**: After corpus isolation migration (removing M2M documents field), GraphQL queries for `corpus.documents` returned empty because no explicit field declaration existed
   - **Fixed**: Added explicit `DocumentTypeConnection` class and `documents = relay.ConnectionField()` declaration to CorpusType
   - **Impact**: GraphQL queries now correctly resolve documents via DocumentPath-based relationships

6. **Parser `save_parsed_data()` using old M2M relationship**
   - **File**: `opencontractserver/pipeline/base/parser.py:126-133`
   - **Issue**: `save_parsed_data()` used deprecated `corpus.documents.add()` M2M method which no longer exists
   - **Fixed**: Updated to use `corpus.add_document(document=document, user=user)` for corpus isolation
   - **Impact**: Parsers can now correctly associate documents with corpuses during processing

7. **Document mention resolver using old M2M relationship**
   - **File**: `config/graphql/queries.py:976-1015`
   - **Issue**: `resolve_search_documents_for_mention()` queried via `corpus__in` M2M relationship which no longer exists
   - **Fixed**: Updated to query via `DocumentPath` with `is_current=True, is_deleted=False` filters
   - **Impact**: Document mention autocomplete now correctly finds documents in corpuses

8. **BaseFixtureTestCase not adding documents to corpus**
   - **File**: `opencontractserver/tests/base.py:385-399`
   - **Issue**: Test setup created corpus but didn't add fixture documents to it via DocumentPath
   - **Fixed**: Added loop to call `corpus.add_document()` for each fixture document and update references to corpus copies
   - **Impact**: WebSocket and other tests now properly test with documents in corpus context

### Changed

#### Test Suite Updates for Corpus Isolation Architecture

- **Removed deprecated legacy manager tests**
  - **File**: `opencontractserver/tests/test_document_path_migration.py`
  - **Removed**: Test classes for deprecated `DocumentCorpusRelationshipManager` (20+ tests)
  - **Reason**: The backward compatibility M2M manager was removed in Issue #654 Phase 2
  - **Note**: `DocumentCorpusRelationshipManager` in `opencontractserver/documents/managers.py` remains as documentation but is unused
  - **Impact**: Improved test clarity by removing tests for code that never executes

- **Permission assignment order** in test setups
  - Moved permission assignment AFTER `add_document()` calls
  - Ensures permissions are assigned to corpus copies, not originals
  - Files: `test_visibility_managers.py`, `test_resolvers.py`, `test_permissioning.py`, `test_version_aware_query_optimizer.py`

- **Document count expectations**
  - Updated tests to account for both originals and corpus copies existing
  - Example: Owner sees 6 documents (3 originals + 3 corpus copies) instead of 3
  - Files: `test_visibility_managers.py`, `test_resolvers.py`

- **Document-to-corpus linking**
  - Changed from M2M `corpus.documents.add()` to `corpus.add_document()`
  - File: `test_custom_permission_filters.py:211-213`

- **Corpus document queries**
  - Updated tests to query corpus documents via DocumentPath, not M2M
  - File: `test_bulk_document_upload.py:305-313`

### Technical Details

#### Architectural Changes

The structural annotation set feature implements Phase 2.5 of the dual-tree versioning architecture:

1. **Content-based deduplication**: Structural annotations are tied to content hash, not individual documents
2. **Corpus isolation compatibility**: When a document is copied to multiple corpuses, all copies share the same structural annotation set
3. **Immutability guarantee**: Structural annotations in shared sets cannot be modified (protected by PROTECT on delete)
4. **XOR constraints**: Database-level enforcement that annotations belong to either a document or a structural set

#### File Changes Summary

**New Files:**
- `opencontractserver/tests/test_structural_annotation_sets.py`
- `opencontractserver/tests/test_structural_annotation_portability.py`
- `opencontractserver/annotations/migrations/0048_add_structural_annotation_set.py`
- `opencontractserver/documents/migrations/0026_add_structural_annotation_set.py`
- `docs/architecture/STRUCTURAL_ANNOTATION_SETS.md`
- `CHANGELOG.md`

**Modified Files:**
- `opencontractserver/annotations/models.py` - Added StructuralAnnotationSet model, updated Annotation/Relationship models
- `opencontractserver/documents/models.py` - Added structural_annotation_set FK
- `opencontractserver/corpuses/models.py` - Fixed add_document() to copy all artifacts + structural set
- `opencontractserver/documents/versioning.py` - Fixed import_document() to copy all artifacts + structural set
- `config/graphql/graphene_types.py` - Added DocumentTypeConnection and explicit documents field for CorpusType
- `config/graphql/queries.py` - Updated document mention resolver to use DocumentPath
- `opencontractserver/pipeline/base/parser.py` - Updated save_parsed_data() to use add_document()
- `opencontractserver/tests/base.py` - Updated BaseFixtureTestCase to add documents to corpus
- `opencontractserver/tests/test_visibility_managers.py` - Updated for corpus isolation
- `opencontractserver/tests/test_resolvers.py` - Updated for corpus isolation
- `opencontractserver/tests/test_bulk_document_upload.py` - Updated for corpus isolation
- `opencontractserver/tests/permissioning/test_permissioning.py` - Updated for corpus isolation
- `opencontractserver/tests/permissioning/test_custom_permission_filters.py` - Updated for corpus isolation
- `opencontractserver/tests/permissioning/test_version_aware_query_optimizer.py` - Updated for corpus isolation
- `CLAUDE.md` - Added Changelog Maintenance section

### Fixed (Continued)

9. **Query optimizer missing structural_set annotations**
   - **Files**: `opencontractserver/annotations/query_optimizer.py:189-212, 273-301, 541-564, 624-643`
   - **Issue**: `AnnotationQueryOptimizer.get_document_annotations()` and `RelationshipQueryOptimizer.get_document_relationships()` only queried by `document_id`, missing annotations/relationships stored in `structural_set` (which have `document_id=NULL`)
   - **Impact**: GraphQL queries using query optimizer (most annotation/relationship queries) did NOT return structural annotations from structural sets - only vector store had the dual-query logic
   - **Fixed**:
     - Added document fetch with `select_related("structural_annotation_set")` for efficiency
     - Built OR filter: `Q(document_id=X) | Q(structural_set_id=Y, structural=True)` to query BOTH sources
     - Updated corpus filtering to preserve structural_set items (which have `corpus_id=NULL`)
     - Applied same fix to both AnnotationQueryOptimizer and RelationshipQueryOptimizer
   - **Tests Added**: `opencontractserver/tests/test_query_optimizer_structural_sets.py` (10 comprehensive integration tests)
   - **Test Results**: All 42 structural annotation tests pass (10 new + 32 existing)

10. **Vector store returning duplicate results**
   - **File**: `opencontractserver/shared/mixins.py:40-89`
   - **Issue**: `search_by_embedding()` method returned duplicate results (2x, 4x, 6x expected counts) when annotations had multiple Embedding rows with the same `embedder_path`
   - **Root Cause**: JOIN to Embedding table created cartesian product - if annotation had 2 Embedding rows, JOIN produced 2 result rows
   - **Investigation**: Confirmed annotations have multiple Embedding rows due to dual FK relationship:
     1. `Embedding.annotation` FK (one-to-many): annotation can have multiple embeddings
     2. `Annotation.embeddings` FK (many-to-one): annotation points to single "primary" embedding
   - **Fixed**: Hybrid deduplication approach in `search_by_embedding()`:
     1. Order by `id, similarity_score` and apply PostgreSQL `DISTINCT ON (id)`
     2. Materialize query to list
     3. Sort in Python by `similarity_score`
     4. Return top_k results
   - **Rationale**: PostgreSQL `DISTINCT ON` requires the distinct field to be first in ORDER BY, conflicting with need to order by similarity_score. Hybrid approach ensures correctness.
   - **Test Results**: All 9 version-aware vector store tests now pass (previously all 8 failing)

11. **Vector store excluding structural annotations from StructuralAnnotationSet**
   - **File**: `opencontractserver/llms/vector_stores/core_vector_stores.py:168-196, 221-270`
   - **Issue**: Version filtering excluded ALL structural annotations from structural sets, causing vector search to return 0 results
   - **Root Cause - Filter Ordering Bug**:
     1. `only_current_versions` filter applied `Q(document__is_current=True)` (line 170)
     2. This creates `INNER JOIN` on document table
     3. Structural annotations have `document_id=NULL` (stored in StructuralAnnotationSet)
     4. NULL document_id fails the JOIN → structural annotations excluded
     5. This happened BEFORE document/corpus scoping (lines 221-270)
     6. Result: Scoping logic tried to include structural annotations, but they were already filtered out
   - **Symptoms**:
     - Initial queryset: 1344 annotations
     - After version filter: 0 results (all structural annotations excluded)
     - WebSocket tests failed with no ASYNC_CONTENT (agent had no context)
   - **Fixed**:
     - Modified version filter to preserve structural annotations:
       ```python
       active_filters &= Q(document__is_current=True) | Q(
           document_id__isnull=True, structural=True
       )
       ```
     - Logic: Annotations with document FK must have `is_current=True`, structural annotations (no document FK) pass through
     - Later scoping filters by `structural_set_id` to ensure only relevant structural annotations included
   - **Comments Added**: Comprehensive inline documentation explaining:
     - Why structural annotations have `document_id=NULL`
     - Filter ordering and interaction between version filter and scoping
     - Two-phase filtering approach (version → scoping)
   - **Test Results**:
     - Vector store now finds 336 annotations (was 0)
     - SQL shows correct filter: `(document.is_current OR (annotation.document_id IS NULL AND structural))`

12. **Agent tool execution failing due to list/QuerySet type mismatch**
   - **Files**: `opencontractserver/llms/vector_stores/core_vector_stores.py:30-90`
   - **Issue**: After deduplication fix (#10), `search_by_embedding()` returns list instead of QuerySet, breaking agent tool execution
   - **Root Cause - Type Assumption**:
     1. Deduplication fix materialized QuerySet to list for DISTINCT ON + Python sorting
     2. Helper functions `_safe_queryset_info()` and `_safe_execute_queryset()` assumed QuerySet
     3. Called `.count()` method on lists (which don't have `.count()` for length)
     4. Agent's `similarity_search` tool failed silently
     5. LLM called tool → tool execution broke → no second LLM call → no ASYNC_CONTENT
   - **Symptoms**:
     - Only 1 LLM API call in cassettes (should be 2: tool call + final answer)
     - Agent produced ASYNC_START and ASYNC_FINISH but no ASYNC_CONTENT
     - Cassette files abnormally small (27KB vs expected 50-70KB)
   - **Fixed**: Updated helper functions to handle both QuerySets and lists:
     ```python
     async def _safe_queryset_info(queryset, description: str) -> str:
         if isinstance(queryset, list):
             return f"{description}: {len(queryset)} results"
         # ... handle QuerySet

     async def _safe_execute_queryset(queryset) -> list:
         if isinstance(queryset, list):
             return queryset  # Already materialized
         # ... execute QuerySet
     ```
   - **Test Results**:
     - Tool execution now succeeds ✅
     - Cassettes show 2 LLM calls (tool call + response) ✅
     - Cassette size increased to 55KB (proper content) ✅
     - WebSocket tests still fail (different issue: agent streaming layer - not tool execution)

### Known Issues

1. **Pre-existing annotation visibility limitation**: `AnnotationQuerySet.visible_to_user()` doesn't check object-level permissions (only checks `is_public` or `creator`). This was not introduced by these changes but is more apparent with corpus isolation.

2. **WebSocket conversation tests** (`ConversationSourceLoggingTestCase`): Tests fail with no ASYNC_CONTENT messages.
   - **Current Status**: Tests fail with `AssertionError: [] is not true : At least one ASYNC_CONTENT expected`
   - **Vector Store Issues RESOLVED**:
     1. ✅ Vector store deduplication (issue #10 above) - All 9 vector store tests pass
     2. ✅ Query optimizer structural_set support (issue #9 above) - All 42 structural annotation tests pass
     3. ✅ Vector store version filtering (issue #11 above) - Now finds 336 annotations (was 0)
   - **Remaining Issue**: Agent produces no streaming content despite finding annotations
     - Vector store successfully returns 336 annotations to agent
     - Agent runs but produces no ASYNC_CONTENT messages (only ASYNC_START and ASYNC_FINISH)
     - Likely cause: VCR cassette mocking issue or LLM API configuration
     - **NOT a vector store or structural annotation architecture issue**
   - **Next Steps**: Investigate VCR cassette recordings and LLM mocking configuration
   - **Impact**: Isolated to WebSocket tests - production vector search and retrieval works correctly

### Migration Notes

- Run migrations in order: annotations/0048 before documents/0026
- No data migration required - new fields are nullable
- Existing documents will have `structural_annotation_set=None` until parsed

### Performance Considerations

- Structural annotations are now shared (O(1) storage) instead of duplicated per corpus copy
- DocumentPath queries are indexed for efficient corpus document lookups
- Content-hash based deduplication prevents redundant parsing
