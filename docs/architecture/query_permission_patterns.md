# Query Permission Patterns

Reference for how OpenContracts filters querysets by user permissions.

## Architecture Overview

Permission filtering uses two layers:

1. **Managers & QuerySets** — `visible_to_user()` methods that filter querysets to objects a user can see
2. **Query Optimizers** — GraphQL resolver helpers that add prefetches, select_related, and bulk permission checks to avoid N+1 queries

Both layers work together: the manager/queryset produces the base filtered set, and the optimizer adds performance tuning for the GraphQL context.

## Layer 1: visible_to_user() Implementations

| Model | Implementation | File | Pattern |
|-------|---------------|------|---------|
| Corpus | `PermissionedTreeQuerySet.visible_to_user` | `opencontractserver/shared/QuerySets.py:30-86` | Guardian via `get_objects_for_user` |
| Document | `DocumentQuerySet.visible_to_user` | `opencontractserver/shared/QuerySets.py:193-229` | Guardian permission table lookup |
| Document (manager) | `BaseVisibilityManager.visible_to_user` | `opencontractserver/shared/Managers.py:40-203` | Guardian + model-specific prefetches |
| Annotation | `AnnotationQuerySet.visible_to_user` | `opencontractserver/shared/QuerySets.py:245-379` | Guardian on doc/corpus + analysis/extract privacy |
| Note | `NoteQuerySet.visible_to_user` | `opencontractserver/shared/QuerySets.py:368-399` | Document + corpus inheritance |
| UserFeedback | `UserFeedbackQuerySet.visible_to_user` | `opencontractserver/shared/QuerySets.py:112-133` | Creator + public + annotation visibility |
| Fallback | `PermissionQuerySet.visible_to_user` | `opencontractserver/shared/QuerySets.py:137-184` | Creator + public only (no guardian) |

**Important:** When code calls `Model.objects.filter(...).visible_to_user(user)`, the `.filter()` returns a QuerySet (not a Manager), so the QuerySet's `visible_to_user` is invoked. Models that need guardian checks must override `visible_to_user` on their QuerySet class, not just the Manager.

## Layer 2: Query Optimizers

| Optimizer | File | Scope |
|-----------|------|-------|
| `AnnotationQueryOptimizer` | `opencontractserver/annotations/query_optimizer.py:16-667` | Annotation + Relationship bulk permissions |
| `AnalysisQueryOptimizer` | `opencontractserver/annotations/query_optimizer.py:946-1148` | Analysis visibility with corpus checks |
| `ExtractQueryOptimizer` | `opencontractserver/annotations/query_optimizer.py:1150-1349` | Extract visibility with corpus checks |
| `ConversationQueryOptimizer` | `opencontractserver/conversations/query_optimizer.py:18-204` | Request-level caching for corpus/doc visibility |
| `DocumentActionsQueryOptimizer` | `opencontractserver/documents/query_optimizer.py:16-312` | Document action permissions |
| `DocumentRelationshipQueryOptimizer` | `opencontractserver/documents/query_optimizer.py:314-668` | Document relationship permissions |
| `MetadataQueryOptimizer` | `opencontractserver/extracts/query_optimizer.py:19-572` | Extract metadata permissions |
| `BadgeQueryOptimizer` | `opencontractserver/badges/query_optimizer.py:16-158` | Badge visibility |
| `UserQueryOptimizer` | `opencontractserver/users/query_optimizer.py:15-237` | User profile permissions |

## Permission Models by Object Type

| Object | Own Permissions | Inherited From | Pattern |
|--------|----------------|----------------|---------|
| Corpus | Guardian (direct) | — | `read_corpus` via `corpususerobjectpermission` |
| Document | Guardian (direct) | — | `read_document` via `documentuserobjectpermission` |
| Annotation | None (inherited) | Document + Corpus | `MIN(document_permission, corpus_permission)` |
| Relationship | None (inherited) | Document + Corpus | Same as Annotation |
| Note | None (inherited) | Document + Corpus | Same as Annotation |
| Analysis | Hybrid | Own + Corpus | Own guardian permissions + corpus visibility |
| Extract | Hybrid | Own + Corpus | Own guardian permissions + corpus visibility |
| Conversation | Simple | Corpus + Document | Corpus and document visibility checks |

## Key Patterns

### MIN(document, corpus) Permission Inheritance
Annotations, relationships, and notes have no individual guardian permissions. Visibility is determined by the intersection of document and corpus visibility.
- Implementation: `opencontractserver/shared/QuerySets.py` (AnnotationQuerySet, NoteQuerySet)

### Guardian Permission Table Lookup
For models with direct guardian permissions, query the `{model}userobjectpermission` table directly instead of using `get_objects_for_user` for better performance.
- Implementation: `opencontractserver/shared/Managers.py:103-118`
- Also: `opencontractserver/shared/QuerySets.py:210-225` (DocumentQuerySet)

### Request-Level Caching
`ConversationQueryOptimizer` caches corpus and document visibility subqueries per request to avoid repeated permission checks.
- Implementation: `opencontractserver/conversations/query_optimizer.py`

### Analysis/Extract Privacy Filtering
Annotations created by analyses or extracts inherit visibility from those parent objects. If a user cannot see the analysis/extract, they cannot see its annotations.
- Implementation: `opencontractserver/shared/QuerySets.py:251-291` (AnnotationQuerySet)

### IDOR Protection
Mutations use `visible_to_user()` filtering with unified error messages to prevent object ID enumeration.
- Utility: `opencontractserver/utils/permissioning.py:286-559` (`user_has_permission_for_obj`)
- Permission assignment: `opencontractserver/utils/permissioning.py:20-163` (`set_permissions_for_obj_to_user`)

### Structural Annotation Handling
Structural annotations (headers, sections) are always visible if the parent document is visible, regardless of creator. They are read-only for non-superusers.
- Implementation: `opencontractserver/shared/QuerySets.py:276-278` (AnnotationQuerySet visibility_filter)

## See Also

- `docs/permissioning/consolidated_permissioning_guide.md` — full permissioning architecture
- `docs/architecture/sharing.md` — object sharing patterns
