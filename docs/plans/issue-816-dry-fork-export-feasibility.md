# Issue #816: DRY Up Forking and Export Logic — Feasibility Analysis

## Summary

Issue #816 proposes unifying the forking and export code paths, which both
"package up data from an existing corpus and copy it somewhere." This document
analyzes the current implementations, identifies genuine overlaps and critical
differences, and provides a concrete feasibility assessment with a recommended
architecture.

**Verdict: Feasible, with significant caveats.** The two systems share
conceptual overlap but differ in execution mechanics. A partial unification via
a shared *object-collection pipeline* is practical and valuable, but forcing
full unification of the *output stage* would add complexity rather than remove
it.

---

## 1. Current Architecture Comparison

### 1.1 Entry Points

| Aspect | Fork | Export V1 | Export V2 |
|--------|------|-----------|-----------|
| **GraphQL Mutation** | `StartCorpusFork` (corpus_mutations.py:426) | `StartCorpusExport` (document_mutations.py:975) | Same mutation, format-dependent |
| **Celery Task** | `fork_corpus` (fork_tasks.py:31) | `package_annotated_docs` (export_tasks.py:150) | `package_corpus_export_v2` (export_tasks_v2.py:55) |
| **Output** | New DB objects | ZIP file with data.json + PDFs | ZIP file with data.json + PDFs |

### 1.2 Object Collection (Phase 1 — "What to include")

Both systems collect essentially the same object graph:

| Object Type | Fork | Export V2 | Overlap |
|-------------|------|-----------|---------|
| Documents | `corpus.get_documents()` | `DocumentPath.filter(corpus, is_current, !is_deleted)` | **~identical** |
| Annotations | `Annotation.filter(corpus, analysis__isnull=True)` | `build_document_export()` per doc, with filter modes | **partial** — export supports analysis-based filtering |
| Labels | Via `corpus.label_set.annotation_labels` | `build_label_lookups()` with filter modes | **partial** — export has richer filtering |
| Relationships | `Relationship.filter(corpus, analysis__isnull=True)` | `package_relationships()` — `Q(document__in) \| Q(corpus=)` | **similar** |
| Folders | `CorpusFolder.filter(corpus).with_tree_fields()` | `package_corpus_folders()` | **~identical** |
| Metadata (Fieldset/Columns/Datacells) | Manual-entry only columns + datacells | Not exported (V2 doesn't include metadata yet) | **fork-only** |
| Structural Annotation Sets | Implicitly via `add_document()` | `package_structural_annotation_set()` | **different mechanism** |
| Conversations | Not forked | `package_conversations()` (optional) | **export-only** |
| Agent Config | Not forked | `package_agent_config()` | **export-only** |
| MD Description & Revisions | Not forked | `package_md_description_revisions()` | **export-only** |
| Action Trail | Not forked | `package_action_trail()` (optional) | **export-only** |

### 1.3 Permission Filtering (Phase 2 — "What can the user access")

| Aspect | Fork | Export |
|--------|------|--------|
| Corpus access | `visible_to_user()` + READ perm check | `visible_to_user()` + READ perm check |
| Document scope | All active docs in corpus | All active docs via DocumentPath |
| Annotation scope | User-created only (`analysis__isnull=True`) | Configurable via `AnnotationFilterMode` (corpus-only, analysis-only, combined) |
| Conversation scope | N/A | Permission-filtered via `visible_to_user()` |

### 1.4 Output Stage (Phase 3 — "Where to put it")

This is where the systems diverge fundamentally:

| Aspect | Fork | Export |
|--------|------|--------|
| **Destination** | Database (new Django model instances) | ZIP file (JSON + binary files) |
| **Documents** | `corpus.add_document()` → corpus-isolated copy, shares file blobs | Base64-encode PDF, write to ZIP |
| **Annotations** | Clone model instance (pk=None, save) with ID mapping | Serialize to JSON dict in `annotated_docs` |
| **Labels** | Clone model instances into new LabelSet | Serialize to JSON dict |
| **Relationships** | Clone with M2M re-mapping via `annotation_map` | Serialize with string annotation IDs |
| **Folders** | Clone with parent re-mapping via `folder_map` | Serialize with path strings |
| **Permissions** | `set_permissions_for_obj_to_user(CRUD)` on every new object | N/A (export is a file download) |
| **ID Mapping** | Maintains `label_map`, `doc_map`, `annotation_map`, `column_map`, `folder_map` | No mapping needed (IDs embedded in JSON) |
| **Transaction** | `transaction.atomic()` — all-or-nothing | No transaction (ZIP built incrementally) |
| **Error handling** | Sets `corpus.error=True`, `backend_lock=False` | Sets `export.error=True`, `backend_lock=False` |

---

## 2. Overlap Analysis

### Genuine Overlaps (High Value for Unification)

1. **Corpus access validation** — Both check `visible_to_user()` + READ permission. Already largely shared.

2. **Document collection** — Both resolve active documents through `DocumentPath`. Nearly identical queries.

3. **Annotation collection with label filtering** — Fork uses a simplified version (user-created only). Export has richer `AnnotationFilterMode`. Fork could adopt the same enum with a default mode.

4. **Folder collection** — Both query `CorpusFolder.filter(corpus).with_tree_fields()`. Identical.

5. **Relationship collection** — Nearly identical, both filter user-created relationships.

6. **Label set + label resolution** — Both need the corpus label set and its labels. Export's `build_label_lookups()` is more general.

### Surface-Level Similarities (Low Value for Unification)

7. **Corpus metadata packaging** — `package_corpus_for_export()` serializes to dict; fork clones the model instance. Unifying these would require an intermediate representation that serves both JSON serialization and DB cloning — added complexity for no practical benefit.

8. **Error handling pattern** — Both use `backend_lock` + `error` flags but on different models (`Corpus` vs `UserExport`). This is a pattern, not duplicated code.

### Fork-Only Features (No Export Equivalent)

9. **Metadata (Fieldset/Column/Datacell) cloning** — Export V2 doesn't export metadata yet.
10. **Structural annotation set deduplication** — Fork tracks `structural_set_map` for shared sets; export serializes them independently.
11. **ID mapping dictionaries** — Essential for fork's reference integrity; irrelevant for export.
12. **Permission assignment** — Fork assigns CRUD permissions to every new object.

### Export-Only Features (No Fork Equivalent)

13. **Analysis-based annotation filtering** — Fork only copies user-created annotations.
14. **PDF burn-in** — Export annotates PDFs with highlights; fork doesn't touch PDFs.
15. **Conversations, Agent Config, Action Trail, MD Description** — V2 export features not relevant to forking.
16. **Multiple output formats** — OPEN_CONTRACTS, OPEN_CONTRACTS_V2, FUNSD.

---

## 3. Recommended Architecture

### 3.1 Shared Object Collection Layer

Create a `CorpusObjectCollector` class that both fork and export use to gather
objects. This addresses overlaps #2-6 above.

```python
# opencontractserver/utils/corpus_collector.py

@dataclass
class CorpusObjectCollection:
    """Result of collecting objects from a corpus."""
    corpus: Corpus
    documents: QuerySet[Document]
    document_ids: list[int]
    annotations: QuerySet[Annotation]
    annotation_ids: list[int]
    labels: QuerySet[AnnotationLabel]
    label_lookups: LabelLookupPythonType
    relationships: QuerySet[Relationship]
    relationship_ids: list[int]
    folders: QuerySet[CorpusFolder]
    folder_ids: list[int]
    label_set: LabelSet | None
    label_set_id: int | None
    # Fork-specific (optional)
    metadata_column_ids: list[int]
    metadata_datacell_ids: list[int]


class CorpusObjectCollector:
    """
    Collects objects from a corpus for fork or export operations.

    Shared Phase 1 + Phase 2 logic: determines what objects exist
    and which the user can access.
    """

    def __init__(
        self,
        corpus: Corpus,
        user: User,
        annotation_filter_mode: AnnotationFilterMode = AnnotationFilterMode.CORPUS_LABELSET_ONLY,
        analysis_ids: list[int] | None = None,
        include_metadata: bool = False,
    ):
        ...

    def collect(self) -> CorpusObjectCollection:
        """Run all collection queries and return unified result."""
        ...
```

### 3.2 Keep Output Stages Separate

The fork output stage (DB cloning with ID mapping + permissions) and the export
output stage (ZIP serialization) are fundamentally different. Forcing them into
a shared abstraction would require:

- An intermediate representation that's neither a Django model nor a JSON dict
- Abstract "writer" classes with DB and ZIP implementations
- Complex generics to handle ID mapping (fork-only) vs serialization (export-only)

This would add ~300-400 lines of abstraction code while the current fork task
is ~500 lines and the export task is ~250 lines. The abstraction cost would
exceed the duplication cost.

### 3.3 Incremental Unification Path

**Phase 1 (Low Risk, High Value):**
- Extract `CorpusObjectCollector` from the shared collection logic
- Refactor `StartCorpusFork.mutate()` and `StartCorpusExport.mutate()` to use it
- Move the ~50 lines of duplicated collection queries into the shared class
- Estimated effort: 1-2 days
- Lines saved: ~80-100 across fork mutation + export mutation

**Phase 2 (Medium Risk, Medium Value):**
- Unify annotation filter mode support: fork currently hardcodes
  `analysis__isnull=True`; switch to using `AnnotationFilterMode.CORPUS_LABELSET_ONLY`
  via the collector
- This makes fork's annotation selection consistent with export's
- Estimated effort: 0.5 day

**Phase 3 (Higher Risk, Lower Value — Consider Carefully):**
- Add metadata export to V2 format using the same collection as fork
- Add conversation/agent-config forking using the same serialization as export
  (but writing to DB instead of JSON)
- These are *feature additions*, not DRY refactoring

---

## 4. What NOT to Unify

1. **The Celery task functions themselves** — `fork_corpus()` and
   `package_corpus_export_v2()` should remain separate. They do
   fundamentally different things (clone to DB vs serialize to ZIP).

2. **ID mapping logic** — This is fork-specific and deeply intertwined with
   the cloning sequence. No export equivalent exists.

3. **PDF burn-in** — Export-specific, no fork equivalent.

4. **Permission assignment** — Fork-specific, export produces a file.

5. **Import logic** — The issue mentions potentially incorporating import.
   Import (`import_corpus_v2`) already shares helpers with export
   (`unpack_label_set_from_export`, `create_document_from_export_data`,
   `import_doc_annotations`). Further unification with fork would be
   counterproductive since import reads from ZIP while fork reads from DB.

---

## 5. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking fork behavior during refactor | Medium | High | Comprehensive round-trip tests exist (`test_corpus_fork_round_trip.py`) |
| Breaking export during refactor | Medium | High | Export tests exist (`test_corpus_export_import_v2.py`) |
| Over-abstraction making code harder to understand | High (if Phase 3 attempted) | Medium | Stop at Phase 2 |
| Regression in annotation filtering | Low | Medium | `AnnotationFilterMode` enum is well-tested |
| Transaction boundary issues | Low | High | Fork's `transaction.atomic()` is independent of collection |

---

## 6. Estimated Impact

### Lines of Code

| Metric | Current | After Phase 1+2 |
|--------|---------|-----------------|
| Fork mutation (collection logic) | ~100 lines | ~20 lines (delegates to collector) |
| Export mutation (collection logic) | ~50 lines | ~15 lines (delegates to collector) |
| New `CorpusObjectCollector` | 0 | ~120 lines |
| Fork task (`fork_tasks.py`) | ~510 lines | ~510 lines (unchanged) |
| Export task V2 (`export_tasks_v2.py`) | ~250 lines | ~250 lines (unchanged) |
| **Net change** | **~660 total** | **~665 total** (~5 lines added but better organized) |

The primary benefit is **organizational**, not line-count reduction:
- Single source of truth for "what objects are in a corpus"
- Consistent filtering behavior between fork and export
- Easier to add new object types (just add to collector)
- Reduced risk of fork/export diverging on how they select objects

---

## 7. Conclusion

**Issue #816 is feasible but should be scoped carefully.**

The issue author correctly identifies that both operations "package up data
from existing corpus," but the critical insight is that only the *object
collection* phase is genuinely duplicated. The *output* phase (DB cloning vs
ZIP serialization) is inherently different and should remain separate.

**Recommended approach:** Implement Phases 1-2 only, creating a shared
`CorpusObjectCollector` for the collection logic. This delivers the DRY benefit
without the over-engineering risk. Phase 3 (feature additions like metadata
export or conversation forking) should be separate issues.

The existing test suites (`test_corpus_fork_round_trip.py`,
`test_corpus_export_import_v2.py`) provide strong safety nets for the refactor.
