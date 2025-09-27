# OpenContracts Permission System - Complete Guide

> **🔴 CRITICAL CHANGE**: Annotations no longer have individual permissions. All annotations in a document share the same permissions computed from document + corpus. This eliminates N+1 queries and simplifies the security model.

## Key Changes in Current Implementation

| Component | Old Model | New Model | Impact |
|-----------|-----------|-----------|---------|
| **Annotation Permissions** | Individual per-annotation | Inherited from document+corpus | No N+1 queries |
| **Permission Priority** | Corpus > Document | Document > Corpus (most restrictive) | Better security |
| **Database Queries** | 1 per annotation | 2 total (doc + corpus) | Massive performance gain |
| **Permission Storage** | `annotationuserobjectpermission` table | None - computed at runtime | Simpler database |
| **Permission Uniformity** | Each annotation different | All annotations same in document | Predictable behavior |

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Permission Types](#permission-types)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Annotation Permission Inheritance](#annotation-permission-inheritance)
7. [Performance Optimizations](#performance-optimizations)
8. [Component Integration](#component-integration)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

## Overview

OpenContracts implements a sophisticated hierarchical permission system with different rules for different object types:

### Permission Models

1. **Standard Objects (Corpus, Document, etc.)**
   - Direct permission model - permissions are checked on the object itself
   - Corpus-level permissions can provide additional context when viewing documents

2. **Annotations and Relationships - NO INDIVIDUAL PERMISSIONS**
   - **IMPORTANT: Annotations no longer have individual permissions**
   - All annotations inherit permissions from their parent document and corpus
   - **Document permissions are PRIMARY** (most restrictive)
   - **Corpus permissions are SECONDARY** (additional restrictions)
   - Formula: `Effective Permission = MIN(document_permission, corpus_permission)`
   - This ensures annotations are never more permissive than their parent document
   - **Performance benefit**: Eliminates N+1 permission queries

### Key Principles

1. **Document Security First**: For annotations, document permissions are the primary security boundary
2. **Most Restrictive Wins**: When multiple permission sources exist, the most restrictive applies
3. **Progressive Enhancement**: Features are enabled based on available permissions
4. **Fail Secure**: Default to most restrictive permissions when uncertain
5. **Server-Side Enforcement**: Client-side checks are for UX only; all security is enforced server-side
6. **Performance Optimized**: Query optimizer eliminates N+1 permission queries

## Architecture

```
Standard Permission Flow:
Route → Slug Resolution → Permission Loading → Component Evaluation → UI Rendering

Annotation Permission Flow (Optimized):
Document Request → Query Optimizer → Permission Computation (Once) → Apply to All Annotations → UI Rendering

Permission Sources:
1. Document Permissions (myPermissions on Document type)
2. Corpus Permissions (myPermissions on Corpus type)
3. Analysis Visibility (for analysis-created annotations)

Evaluation Priority for Annotations:
1. Document permissions (MUST have at least READ)
2. Corpus permissions (further restricts if present)
3. Structural annotation override (always READ-ONLY if doc is readable)
4. Analysis visibility filter (additional restriction)
```

## Permission Types

### Backend Enum (opencontractserver/types/enums.py)

```python
class PermissionTypes(str, enum.Enum):
    CREATE = "CREATE"
    READ = "READ"
    EDIT = "EDIT"         # Alias for UPDATE
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    PERMISSION = "PERMISSION"
    PUBLISH = "PUBLISH"
    CRUD = "CRUD"         # Shorthand for CREATE+READ+UPDATE+DELETE
    ALL = "ALL"           # All permissions including PUBLISH+PERMISSION
```

### Frontend Enum (frontend/src/components/types.ts)

```typescript
export enum PermissionTypes {
  CAN_PERMISSION = "CAN_PERMISSION",
  CAN_PUBLISH = "CAN_PUBLISH",
  CAN_COMMENT = "CAN_COMMENT",
  CAN_CREATE = "CAN_CREATE",
  CAN_READ = "CAN_READ",
  CAN_UPDATE = "CAN_UPDATE",
  CAN_REMOVE = "CAN_REMOVE",
}
```

### Permission Translation

The GraphQL layer translates between backend Django Guardian format and frontend enum format:

```python
# Backend Django Guardian format:
["create_document", "read_document", "update_document", "remove_document"]

# Frontend receives:
["CAN_CREATE", "CAN_READ", "CAN_UPDATE", "CAN_REMOVE"]
```

### Permission Capabilities

| Permission | Corpus Context | Document Context | Capabilities |
|------------|----------------|------------------|--------------|
| **CAN_READ** | View corpus, documents | View document | Basic viewing access |
| **CAN_CREATE** | Add documents, annotations | Create annotations | Content creation |
| **CAN_UPDATE** | Edit corpus, annotations | Edit document/annotations | Content modification |
| **CAN_REMOVE** | Delete corpus content | Delete document | Content deletion |
| **CAN_PUBLISH** | Make corpus public | Make document public | Public visibility |
| **CAN_PERMISSION** | Manage corpus access | Manage document access | Permission management |
| **CAN_COMMENT** | Add comments | Add comments | Comment functionality |

## Backend Implementation

### Core Utilities (opencontractserver/utils/permissioning.py)

```python
def set_permissions_for_obj_to_user(
    user_val: int | str | type[User],
    instance: type[django.db.models.Model],
    permissions: list[PermissionTypes],
) -> None:
    """
    REPLACE current permissions with specified permissions.

    IMPORTANT: This function now correctly removes ALL existing
    permissions before adding new ones (fixed in recent update).
    """
    # 1. Remove all existing permissions for the user on this object
    # 2. Add requested permissions
    # This ensures true permission replacement, not accumulation

def get_users_permissions_for_obj(
    user: type[User],
    instance: type[django.db.models.Model],
    include_group_permissions: bool = False,
) -> set[str]:
    """Get all permissions a user has for a specific object."""

def user_has_permission_for_obj(
    user_val: int | str | type[User],
    instance: type[django.db.models.Model],
    permission: PermissionTypes,
    include_group_permissions: bool = False,
) -> bool:
    """Check if user has specific permission for object."""
```

### GraphQL Integration

#### Permission Annotation Mixin

```python
class AnnotatePermissionsForReadMixin:
    my_permissions = GenericScalar()

    def resolve_my_permissions(self, info) -> list[PermissionTypes]:
        # Check for pre-computed permissions (annotations/relationships only)
        model_name = self._meta.model_name
        if model_name in ['annotation', 'relationship'] and hasattr(self, '_can_read'):
            # Use optimized pre-computed permissions
            permissions = set()
            if getattr(self, '_can_read', False):
                permissions.add(f"read_{model_name}")
            if getattr(self, '_can_update', False):
                permissions.add(f"update_{model_name}")
            # ... etc
            return list(permissions)

        # Standard permission resolution for other models
        # Uses cached permission metadata from middleware
```

#### Middleware

```python
class PermissionAnnotatingMiddleware:
    def resolve(self, next, root, info, **kwargs):
        # Detects Django model type from GraphQL resolver
        # Caches permission metadata in info.context.permission_annotations
        # Avoids repeated database queries for same model types
```

## Annotation Permission Inheritance

### Critical Change: No More Annotation-Level Permissions

**⚠️ ARCHITECTURAL CHANGE**: Individual annotation-level permissions have been completely eliminated. This means:

1. **No per-annotation permission storage** - Annotations don't have their own permission records in the database
2. **No per-annotation permission checks** - We never check permissions on individual annotation objects
3. **Uniform permissions for all annotations** - All annotations in a document have the same permissions
4. **Computed once, applied to all** - Permissions are computed at query time based on document+corpus

### Why This Change?

1. **Performance**: Eliminated N+1 query problem (checking permissions for each annotation)
2. **Security**: Simpler, more predictable permission model
3. **Consistency**: All annotations in a document have uniform access control
4. **Maintainability**: Less complex permission logic to maintain

### The New Model (Implemented)

Annotations and relationships use a special permission inheritance model that prioritizes document security:

```python
# From opencontractserver/annotations/query_optimizer.py

class AnnotationQueryOptimizer:
    @classmethod
    def _compute_effective_permissions(
        cls,
        user,
        document_id: int,
        corpus_id: Optional[int] = None
    ) -> tuple[bool, bool, bool, bool]:
        """
        Compute effective permissions based on document and corpus.
        Document permissions are PRIMARY (most restrictive).

        Returns: (can_read, can_create, can_update, can_delete)
        """
        # Superusers have all permissions
        if user.is_superuser:
            return True, True, True, True

        # Check document permissions (PRIMARY - must have these)
        doc = Document.objects.get(id=document_id)
        doc_read = user_has_permission(user, doc, READ)
        doc_create = user_has_permission(user, doc, CREATE)
        doc_update = user_has_permission(user, doc, UPDATE)
        doc_delete = user_has_permission(user, doc, DELETE)

        # No document read permission = no access at all
        if not doc_read:
            return False, False, False, False

        # If no corpus, use document permissions only
        if not corpus_id:
            return doc_read, doc_create, doc_update, doc_delete

        # Check corpus permissions and apply most restrictive
        corpus = Corpus.objects.get(id=corpus_id)
        corpus_read = user_has_permission(user, corpus, READ)
        corpus_create = user_has_permission(user, corpus, CREATE)
        corpus_update = user_has_permission(user, corpus, UPDATE)
        corpus_delete = user_has_permission(user, corpus, DELETE)

        # Return minimum permissions (most restrictive)
        return (
            doc_read and corpus_read,
            doc_create and corpus_create,
            doc_update and corpus_update,
            doc_delete and corpus_delete
        )
```

### Special Cases

1. **Structural Annotations**
   - Always READ-ONLY if document is readable
   - Cannot be edited regardless of other permissions
   - Filtered automatically when no corpus context

2. **Analysis Annotations**
   - Additional visibility check (is_public or creator match)
   - Still respects document+corpus permission hierarchy

3. **Superuser Access**
   - Superusers bypass all permission checks
   - Get full permissions automatically

## Performance Optimizations

### Query Optimizer

The system uses a query optimizer to eliminate N+1 permission queries that plagued the old individual annotation permission model:

```python
# OLD MODEL (ELIMINATED):
# Each annotation had its own permission records in the database
for annotation in annotations:
    # This would query annotationuserobjectpermission table for EACH annotation!
    check_permission(user, annotation)  # N database queries!

# NEW MODEL:
# No annotation permissions in database - compute from document+corpus
permissions = compute_permissions(user, document, corpus)  # Just 2 queries total
# Apply same permissions to ALL annotations
queryset.annotate(
    _can_read=Value(permissions.can_read),
    _can_update=Value(permissions.can_update),
    # ...
)
```

### Database Impact

The elimination of annotation-level permissions means:
- No `annotationuserobjectpermission` table queries
- No `annotationgroupobjectpermission` table queries
- Just 2 permission checks total (document + corpus) regardless of annotation count

### Benefits

1. **Eliminated N+1 Queries**: From O(n) to O(1) permission checks
2. **Reduced Database Load**: 2 permission queries total instead of 1 per annotation
3. **Consistent Performance**: Scales with any number of annotations
4. **Backwards Compatible**: GraphQL API unchanged

### Implementation Details

The optimization is transparent to the GraphQL layer:

```python
# In resolve_annotations (config/graphql/queries.py)
if document_id:
    # Use optimized path
    queryset = AnnotationQueryOptimizer.get_document_annotations(
        document_id=doc_id,
        user=info.context.user,
        corpus_id=corpus_id
    )
    # Queryset already has permissions annotated
```

## Frontend Implementation

### State Management (Jotai Atoms)

```typescript
// Document permissions
const documentPermissionsAtom = atom<string[]>([]);

// Corpus state (includes permissions)
const corpusStateAtom = atom({
  canUpdateCorpus: false,
  myPermissions: []
});
```

### Permission Hooks

```typescript
// Document permissions
export const useDocumentPermissions = () => {
  const [permissions, setPermissions] = useAtom(documentPermissionsAtom);
  return { permissions, setPermissions };
};

// Corpus state
export const useCorpusState = () => {
  const corpusState = useAtomValue(corpusStateAtom);
  return {
    canUpdateCorpus: corpusState.canUpdateCorpus,
    myPermissions: corpusState.myPermissions
  };
};
```

### Permission Evaluation Logic

For standard document viewing (corpus context optional):
```typescript
// From DocumentKnowledgeBase.tsx
const canEdit = React.useMemo(() => {
  // Explicit readOnly prop overrides all
  if (readOnly) return false;

  // No corpus = limited editing capabilities
  if (!corpusId) return false;

  // Corpus permissions can enable editing
  if (canUpdateCorpus) return true;

  // Fallback to document permissions
  return permissions.includes(PermissionTypes.CAN_UPDATE);
}, [readOnly, corpusId, permissions, canUpdateCorpus]);
```

Note: For annotations specifically, the backend handles the document+corpus permission logic.

## Component Integration

### Core Components

#### DocumentKnowledgeBase
- Evaluates permissions from both document and corpus sources
- Passes `read_only` prop to child components
- Annotations receive permissions from backend query optimizer

#### PDF Component
```typescript
<PDF
  read_only={!canEdit}
  createAnnotationHandler={canEdit ? handleCreate : undefined}
/>
```

#### TxtAnnotator
```typescript
<TxtAnnotatorWrapper
  readOnly={!canEdit}
  allowInput={canEdit}
/>
```

### Component Patterns

#### Pattern 1: Conditional Rendering
```typescript
{canEdit && (
  <Button onClick={handleEdit}>Edit</Button>
)}
```

#### Pattern 2: Prop Passing
```typescript
<ChildComponent
  readOnly={!canEdit}
  onEdit={canEdit ? handleEdit : undefined}
/>
```

#### Pattern 3: Feature Gating
```typescript
const { isFeatureAvailable } = useFeatureAvailability(corpusId);

if (!isFeatureAvailable('ANNOTATIONS')) {
  return <EmptyState>Add to corpus to enable annotations</EmptyState>;
}
```

### Read-Only Mode Support

Components that properly support read-only mode:

- ✅ **PDF Component**: Prevents annotation creation
- ✅ **TxtAnnotatorWrapper**: Disables input
- ✅ **SelectionLayer**: Shows read-only messages
- ✅ **AnnotationMenu**: Shows only copy option
- ✅ **FloatingControls**: Hides edit actions
- ✅ **Content Feed**: Passes readOnly to children

## Testing

### Backend Tests

#### Permission Setting Tests
```python
def test_permission_replacement():
    # Give user all permissions
    set_permissions_for_obj_to_user(
        user_val=user,
        instance=document,
        permissions=[PermissionTypes.ALL]
    )

    # Replace with just READ
    set_permissions_for_obj_to_user(
        user_val=user,
        instance=document,
        permissions=[PermissionTypes.READ]
    )

    # Should ONLY have READ (not ALL permissions)
    perms = get_users_permissions_for_obj(user, document)
    assert perms == {'read_document'}
```

#### Annotation Permission Inheritance Tests
```python
def test_document_primary_permissions():
    # Document: READ only
    # Corpus: UPDATE allowed
    # Result: Annotation should be READ-ONLY (most restrictive)

    set_permissions_for_obj_to_user(user, document, [PermissionTypes.READ])
    set_permissions_for_obj_to_user(user, corpus, [PermissionTypes.UPDATE])

    annotations = AnnotationQueryOptimizer.get_document_annotations(
        document_id=document.id,
        user=user,
        corpus_id=corpus.id
    )

    # Annotations should be read-only despite corpus having update
    for ann in annotations:
        assert ann._can_read == True
        assert ann._can_update == False  # Document restriction applies
```

### Frontend Tests

```typescript
describe('Permission Flow', () => {
  it('should handle annotation permissions from backend', async () => {
    const mocks = [
      createAnnotationQueryMock({
        annotations: [{
          id: '1',
          myPermissions: ['read_annotation']  // Backend computed
        }]
      })
    ];

    render(
      <MockedProvider mocks={mocks}>
        <DocumentKnowledgeBase documentId="123" corpusId="456" />
      </MockedProvider>
    );

    // Annotations should be read-only as determined by backend
    await waitFor(() => {
      expect(screen.getByTestId('annotation-1')).toHaveAttribute('data-readonly', 'true');
    });
  });
});
```

## Troubleshooting

### Common Issues

#### Annotations appear editable when document is read-only
- **Check**: Backend query optimizer is being used for annotation queries
- **Check**: Document permissions are being checked first in `_compute_effective_permissions`
- **Check**: Frontend is respecting the `myPermissions` from annotations

#### Permission changes not taking effect
- **Issue**: Old permissions weren't being removed
- **Fix**: `set_permissions_for_obj_to_user` now removes all permissions before adding new ones
- **Verify**: Check database directly to ensure old permissions are removed

#### N+1 Query Performance Issues
- **Check**: Annotation queries use `AnnotationQueryOptimizer`
- **Check**: `_can_*` attributes are present on annotation querysets
- **Check**: `AnnotationType.get_queryset()` detects and preserves pre-computed permissions

### Debug Steps

1. **Check Query Optimizer**: Verify annotation queries go through optimizer
2. **Inspect Permissions**: Check `_can_*` attributes on annotation objects
3. **Review Database**: Directly query permission tables to verify state
4. **GraphQL Responses**: Check `myPermissions` in network tab
5. **Add Logging**: Use logger in `_compute_effective_permissions` for debugging

### Performance Monitoring

- **Query Count**: Monitor Django Debug Toolbar for permission query count
- **Optimizer Usage**: Log when query optimizer is used vs. fallback
- **Cache Hit Rate**: Track permission metadata cache effectiveness
- **Response Time**: Measure annotation query response times

## Security Considerations

1. **Document-First Security**: Annotations never exceed document permissions
2. **Server-Side Enforcement**: All mutations validate permissions on backend
3. **No Client Trust**: Frontend permissions are UX hints only
4. **Fail-Safe Defaults**: Default to most restrictive permissions on errors
5. **Audit Trail**: Permission changes are logged for security auditing

## Migration Guide

### For Existing Systems

#### From Individual Annotation Permissions

If migrating from a system with individual annotation permissions:

1. **Database Cleanup**: Remove any `annotationuserobjectpermission` and `annotationgroupobjectpermission` records
2. **Code Updates**: Remove any code that sets permissions on individual annotations
3. **Permission Strategy**: Ensure document and corpus permissions are properly set
4. **User Education**: Inform users that all annotations in a document now share the same permissions

#### From Corpus-Override Model

If migrating from the old permission model where corpus overrode documents:

1. **Review Permission Logic**: Document permissions are now primary for annotations
2. **Update Tests**: Tests assuming corpus override need updating
3. **User Communication**: Inform users that annotation permissions now follow document security
4. **Data Audit**: Review existing permission sets for consistency

### Breaking Changes

- ❌ **Cannot set permissions on individual annotations** - Use document/corpus permissions instead
- ❌ **Cannot have different permissions for different annotations in same document** - All share same permissions
- ❌ **Corpus permissions no longer override document permissions** - Most restrictive wins

## Current Implementation Status

✅ **Backend**: Full implementation with query optimizer
✅ **Frontend**: Complete integration with backend-computed permissions
✅ **Performance**: N+1 queries eliminated for annotations
✅ **Security**: Document-first permission model enforced
✅ **Testing**: Comprehensive test coverage including inheritance scenarios
✅ **Bug Fixes**: Permission replacement now works correctly
✅ **Documentation**: This guide reflects current implementation

The permission system is production-ready with significant performance improvements and correct security boundaries.