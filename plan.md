# CorpusHome Query Performance Optimization Plan

## Executive Summary

After tracing all 3 GraphQL queries from the CorpusHome frontend through to their backend resolvers, I identified **6 concrete performance bottlenecks** — 3 critical, 2 moderate, and 1 low severity. All proposed fixes are backend-only, respect the consolidated permission system, and require no frontend query changes.

---

## Queries Analyzed

| # | Query | Component | Backend Entry Point |
|---|-------|-----------|---------------------|
| 1 | `GET_CORPUS_WITH_HISTORY` | CorpusLandingView, CorpusDetailsView | `OpenContractsNode.get_node_from_global_id()` → `Corpus.objects.visible_to_user(user).get(id=pk)` |
| 2 | `GET_DOCUMENT_RELATIONSHIPS` | DocumentTableOfContents | `resolve_document_relationships()` → `DocumentRelationshipQueryOptimizer` |
| 3 | `GET_CORPUS_DOCUMENTS_FOR_TOC` | DocumentTableOfContents | `resolve_documents()` → `Document.objects.visible_to_user(user)` + `DocumentFilter.in_corpus()` |

---

## Bottleneck Analysis

### CRITICAL 1: `CountableConnection.resolve_total_count()` materializes entire queryset

**File**: `config/graphql/base.py:65-76`
**Affects**: Queries 2 and 3 (both use `CountableConnection`)

**Current code**:
```python
def resolve_total_count(root, info, **kwargs):
    if isinstance(root.iterable, django.db.models.QuerySet):
        return root.iterable.model.objects.filter(
            pk__in=[obj.pk for obj in root.iterable]
        ).count()
    else:
        return len(root.iterable)
```

**Problem**: `[obj.pk for obj in root.iterable]` iterates and materializes every object in the unpaginated queryset into Python, extracts PKs into a list, then sends `WHERE id IN (pk1, pk2, ..., pk10000)` to the database. For a corpus with 1,000 documents, this instantiates 1,000 Document model objects plus their select_related data just to count them.

**Fix**: Replace with `root.iterable.count()` which generates a single `SELECT COUNT(*)` SQL query without materializing any objects.

**Estimated improvement**: For a 1,000-document corpus, eliminates ~1,000 object instantiations + 1 redundant COUNT query. Cost drops from O(N) Python + O(N) SQL to O(1) SQL.

---

### CRITICAL 2: `DocumentRelationshipQueryOptimizer` materializes ALL visible doc/corpus IDs into Python sets

**File**: `opencontractserver/documents/query_optimizer.py:340-406`
**Affects**: Query 2

**Current code**:
```python
visible_ids = set(
    Document.objects.visible_to_user(user).values_list("id", flat=True)
)
# ... used as:
queryset = DocumentRelationship.objects.filter(
    source_document_id__in=visible_doc_ids,
    target_document_id__in=visible_doc_ids,
)
```

**Problems**:
1. Materializes ALL visible document IDs into a Python `set()`. For a user with 10,000 visible documents, creates a set of 10,000 integers and generates `WHERE source_document_id IN (1, 2, ..., 10000) AND target_document_id IN (1, 2, ..., 10000)`.
2. Same issue for `_get_visible_corpus_ids()`.
3. `Document.objects.visible_to_user(user)` adds unnecessary `select_related("creator", "user_lock")` JOINs even though we only need IDs.
4. The resolver at `queries.py:2631` does NOT pass `context=info.context` to the optimizer, so the request-level caching mechanism is never used.

**Fix**:
- Change `_get_visible_document_ids()` / `_get_visible_corpus_ids()` to return lazy QuerySet values for use as SQL subqueries instead of materialized Python sets.
- Pass `context=info.context` from the resolver.

**Estimated improvement**: Eliminates materializing N document IDs into Python. Replaces 2 separate queries + 2 IN-clause queries with a single query containing efficient SQL subqueries. ~4x fewer DB round-trips, O(1) Python memory.

---

### CRITICAL 3: N+1 on nested FKs in DocumentRelationship `select_related`

**File**: `opencontractserver/documents/query_optimizer.py:481-487`
**Affects**: Query 2

**Current code**:
```python
return queryset.select_related(
    "source_document",
    "target_document",
    "annotation_label",
    "corpus",
    "creator",
)
```

**Problem**: The frontend query requests `sourceDocument.creator.slug`, `targetDocument.creator.slug`, and `corpus.creator.slug`. These nested FK accesses are NOT covered by the current `select_related`. Each access triggers a separate DB query. For 20 relationships, that's up to **60 extra queries** (3 per relationship).

**Fix**: Add nested select_related paths:
```python
return queryset.select_related(
    "source_document__creator",
    "target_document__creator",
    "annotation_label",
    "corpus__creator",
    "creator",
)
```

Note: `source_document__creator` automatically includes `source_document` in the JOIN, so explicit listing of the parent is not needed.

**Estimated improvement**: Eliminates up to 3N queries. For 20 results, saves ~60 DB round-trips.

---

### MODERATE 1: `myPermissions` on DocumentRelationshipType silently errors for every result

**File**: `config/graphql/permissioning/permission_annotator/mixins.py:266-278`
**Affects**: Query 2

**Problem**: `DocumentRelationshipType` inherits `AnnotatePermissionsForReadMixin`, but `DocumentRelationship` has NO guardian permission tables. The mixin tries to access `self.documentrelationshipuserobjectpermission_set` which raises `AttributeError`, caught by the outer `try/except` — silently returning an empty permission list. For each result this means wasted attribute lookup + exception handling + a guardian group permission query that also fails.

**Fix**: Add `"documentrelationship"` to the pre-computed permissions check in the mixin (alongside `"annotation"` and `"relationship"`). In the `resolve_document_relationships` resolver, annotate permission flags (`_can_read`, `_can_create`, etc.) on the queryset based on the user's document/corpus permissions. This follows the exact pattern already established by `AnnotationQueryOptimizer`.

---

### MODERATE 2: Unnecessary heavy `prefetch_related` on Document `visible_to_user()` for TOC query

**File**: `opencontractserver/shared/Managers.py:133-175`
**Affects**: Query 3

**Problem**: `Document.objects.visible_to_user(user)` always applies 7+ prefetch_related lookups (doc_annotations with nested select_related, rows, source_relationships, target_relationships, notes, plus guardian permission prefetches). The TOC query only needs `id, title, slug, icon, fileType, creator.slug` — none of these prefetches are used. When Django evaluates the queryset to return paginated edges, ALL prefetch queries fire. That's ~7 extra DB queries returning data that's never accessed.

**Fix**: Add a `lightweight=False` parameter to `visible_to_user()`. When `True`, skip the heavy prefetches (doc_annotations, rows, relationships, notes) but keep `select_related("creator", "user_lock")` and the guardian permission prefetch. Update the `resolve_documents` resolver to accept an `inCorpusWithId` hint and use lightweight mode when it detects a TOC-pattern query.

**Note**: This is the most invasive change. An alternative minimal approach: clear prefetches in a new TOC-specific resolver rather than modifying the shared `visible_to_user()`.

---

### LOW: `descriptionRevisions` N+1 on author FK

**File**: `config/graphql/graphene_types.py:2037-2039`
**Affects**: Query 1

**Current code**:
```python
def resolve_description_revisions(self, info):
    return self.revisions.all() if hasattr(self, "revisions") else []
```

**Problem**: Each revision's `author { id, email }` field triggers a separate FK query. For 10 revisions, that's 10 extra queries.

**Fix**: Add `select_related("author")`:
```python
def resolve_description_revisions(self, info):
    return self.revisions.select_related("author").all() if hasattr(self, "revisions") else []
```

---

## Implementation Plan

### Phase 1: Zero-Risk, High-Impact Fixes (4 changes, 4 files)

These are purely additive backend optimizations that don't change query semantics or permission behavior.

| # | Fix | File | Risk | Impact |
|---|-----|------|------|--------|
| 1 | `CountableConnection.resolve_total_count()` — use `.count()` on queryset directly | `config/graphql/base.py` | Very Low | Critical — affects ALL paginated queries |
| 2 | DocumentRelationship nested `select_related` for creator FKs | `opencontractserver/documents/query_optimizer.py` | Very Low | High — eliminates 3N queries |
| 3 | `descriptionRevisions` `select_related("author")` | `config/graphql/graphene_types.py` | Very Low | Low — eliminates N revision author queries |
| 4 | Pass `context=info.context` to DocumentRelationshipQueryOptimizer | `config/graphql/queries.py` | Very Low | Medium — enables existing request-level caching |

### Phase 2: Medium-Risk, High-Impact Fixes (2 changes)

| # | Fix | Files | Risk | Impact |
|---|-----|-------|------|--------|
| 5 | DocumentRelationship optimizer uses subqueries instead of materialized Python sets | `opencontractserver/documents/query_optimizer.py` | Low | High — O(N) → O(1) memory, fewer DB round-trips |
| 6 | Pre-compute DocumentRelationship permissions to avoid silent errors | `opencontractserver/documents/query_optimizer.py` + `config/graphql/permissioning/permission_annotator/mixins.py` | Low | Medium — eliminates N exceptions per response |

### Phase 3: Higher-Risk Optimization (1 change)

| # | Fix | Files | Risk | Impact |
|---|-----|-------|------|--------|
| 7 | Slim down Document `visible_to_user()` prefetch for lightweight queries | `opencontractserver/shared/Managers.py` | Medium | High — saves ~7 queries on every TOC request |

---

## Security Considerations

- **No permission bypasses**: All fixes keep the existing permission filtering intact. Subqueries contain the exact same WHERE clauses as the materialized sets.
- **No new guardian-table access**: The DocumentRelationship permission pre-computation follows the established pattern from AnnotationQueryOptimizer.
- **No frontend changes needed**: All fixes are backend-only query optimizations.
- **Consolidated permission formula preserved**: `Effective Permission = MIN(document_permission, corpus_permission)` is unchanged.
- **IDOR prevention maintained**: All queries still go through `visible_to_user()` or equivalent optimizer methods.

## What I'm NOT Changing

- Frontend GraphQL queries (no changes needed)
- The permission model or guardian table structure
- The `visible_to_user()` filtering logic (only optimizing HOW it's executed, not WHAT it filters)
- Any existing test expectations
- The `AnnotatePermissionsForReadMixin` behavior for models that DO have guardian tables
