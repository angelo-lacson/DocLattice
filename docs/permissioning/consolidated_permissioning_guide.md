# OpenContracts Permission System - Complete Guide

> **🔴 CRITICAL CHANGE**: Annotations no longer have individual permissions. All annotations in a document share the same permissions computed from document + corpus. This eliminates N+1 queries and simplifies the security model.

> **🔵 NEW FEATURE**: Annotations can now be marked as "created by" an analysis or extract using `created_by_analysis` and `created_by_extract` fields. These annotations are private to the source object and only visible to users with permission to that analysis/extract.

## Key Changes in Current Implementation

| Component | Old Model | New Model | Impact |
|-----------|-----------|-----------|---------|
| **Annotation Permissions** | Individual per-annotation | Inherited from document+corpus | No N+1 queries |
| **Permission Priority** | Corpus > Document | Document > Corpus (most restrictive) | Better security |
| **Database Queries** | 1 per annotation | 2 total (doc + corpus) | Massive performance gain |
| **Permission Storage** | `annotationuserobjectpermission` table | None - computed at runtime | Simpler database |
| **Permission Uniformity** | Each annotation different | All annotations same in document | Predictable behavior |
| **Analysis Privacy** | All annotations visible with doc+corpus perms | Annotations created by analysis are private | Enhanced privacy control |
| **Extract Privacy** | All annotations visible with doc+corpus perms | Annotations created by extract are private | Enhanced privacy control |

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

3. **Analyses and Extracts - HYBRID MODEL**
   - Have their own individual permissions (can be shared independently)
   - **Visibility requires THREE conditions**:
     1. Permission on the analysis/extract object itself
     2. READ permission on the corpus containing the analysis/extract
     3. READ permission on relevant documents for seeing content
   - **Access Formula**:
     - `Can See Analysis/Extract = HAS_OBJECT_PERMISSION AND CAN_READ_CORPUS`
     - `Can See Annotations Within = CAN_SEE_ANALYSIS AND CAN_READ_DOCUMENT`
   - **Key behaviors**:
     - Users WITHOUT analysis/extract permission see nothing (even if they have corpus+doc access)
     - Users WITH analysis/extract permission but missing corpus permission see nothing
     - Users WITH analysis/extract+corpus permission see the analysis/extract
     - Annotations/datacells within are filtered to only show those on documents user can read
   - This allows controlled sharing of analyses while maintaining document security boundaries

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

Analysis/Extract Permission Flow:
Request → Check Object Permission → Check Corpus Permission → Filter Document Content → UI Rendering

Permission Sources:
1. Document Permissions (myPermissions on Document type)
2. Corpus Permissions (myPermissions on Corpus type)
3. Analysis/Extract Permissions (individual object permissions)

Evaluation Priority for Annotations:
1. Document permissions (MUST have at least READ)
2. Corpus permissions (further restricts if present)
3. Structural annotation override (always READ-ONLY if doc is readable)
4. Analysis visibility filter (additional restriction)

Evaluation Priority for Analyses/Extracts:
1. Analysis/Extract object permission (MUST have at least READ)
2. Corpus permission (MUST have at least READ)
3. Document permissions (filters visible content within)
```

## Example Scenario: Multi-User Permission Hierarchy

### Setup:
- **Corpus X**: Contains Doc Alpha, Doc Beta
- **Corpus Y**: Contains Doc Beta
- **User A**: Permissions on Doc Alpha, Doc Beta, Corpus X
- **User B**: Permissions on Doc Beta, Corpus X, Corpus Y
- **User C**: Permissions on Doc Alpha, Corpus Y

### Results:

| User | Corpus View | Documents Visible | Analyses/Extracts |
|------|------------|-------------------|-------------------|
| **User A** | Sees Corpus X | Alpha & Beta in X | Sees analyses/extracts on X if given permission |
| **User B** | Sees X & Y | Beta in X, Beta in Y | Sees analyses/extracts on X or Y if given permission |
| **User C** | Sees Corpus Y | Empty (Alpha not in Y) | Cannot see any analyses in Y (no docs visible) |

### Analysis Permission Example:

If an Analysis is created on Corpus X analyzing both Alpha and Beta:
- **User A with analysis permission**: Sees analysis, sees annotations on both Alpha & Beta
- **User B with analysis permission**: Sees analysis, sees annotations on Beta only
- **User C with analysis permission**: Cannot see analysis (no corpus X permission)
- **User A WITHOUT analysis permission**: Cannot see analysis (even with corpus+doc permissions)

### Annotation Privacy Example (NEW):

If the Analysis creates annotations with `created_by_analysis` field set:
- **User A with doc+corpus but NO analysis permission**: Cannot see these private annotations
- **User A with analysis permission**: Sees all analysis-created annotations on Alpha & Beta
- **User B with analysis permission**: Sees analysis-created annotations on Beta only (no Alpha access)
- **Structural annotations**: Always visible regardless of `created_by_analysis` field

## Key Behaviors Summary

### Standard Annotations (no `created_by_*` fields)
1. Visibility determined by document + corpus permissions
2. All annotations in a document share the same permissions
3. Most restrictive permission wins (document vs corpus)

### Private Annotations (`created_by_analysis` or `created_by_extract` set)
1. **Invisible by default**: Not shown even with document+corpus permissions
2. **Require source permission**: Must have permission to the analysis/extract that created them
3. **Still respect document boundaries**: Even with analysis permission, only see annotations on documents you can access
4. **Structural exception**: Structural annotations are ALWAYS visible if document is readable

### Permission Hierarchy
```
For Standard Annotations:
Document Permission (PRIMARY) ∩ Corpus Permission (SECONDARY) = Effective Permission

For Private Annotations:
Source Permission (REQUIRED) ∩ Document Permission ∩ Corpus Permission = Effective Permission

For Structural Annotations:
Document READ Permission = Always Visible (READ-ONLY)
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
# Backend Django Guardian format (what's stored in database):
["create_document", "read_document", "update_document", "remove_document"]

# GraphQL myPermissions field returns (backend format):
["create_annotation", "read_annotation", "update_annotation", "remove_annotation"]

# Frontend transforms to (for UI logic):
["CAN_CREATE", "CAN_READ", "CAN_UPDATE", "CAN_REMOVE"]
```

**Note**: The GraphQL `myPermissions` field returns backend format (e.g., `read_annotation`) not frontend format (`CAN_READ`). Frontend components handle the transformation.

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
    """
    Check if user has specific permission for object.

    Note: include_group_permissions=True is important for checking
    permissions that come from group membership (e.g., public access).
    Tests typically use include_group_permissions=True to get accurate results.
    """
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
            # Use optimized pre-computed permissions from AnnotationQueryOptimizer
            # These are annotated as _can_read, _can_create, _can_update, _can_delete
            permissions = set()
            if getattr(self, '_can_read', False):
                permissions.add(f"read_{model_name}")
            if getattr(self, '_can_update', False):
                permissions.add(f"update_{model_name}")
            # ... etc
            return list(permissions)

        # Standard permission resolution for other models
        # Uses cached permission metadata from middleware or direct DB query
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
   - Structural annotations are ALWAYS visible regardless of `created_by_*` fields

2. **Analysis-Created Annotations** (NEW)
   - Annotations with `created_by_analysis` field set are private to that analysis
   - Only visible to users who have permission to the analysis object
   - Even if user has document+corpus permissions, they cannot see these annotations without analysis permission
   - Structural annotations are exempt from this privacy rule

3. **Extract-Created Annotations** (NEW)
   - Annotations with `created_by_extract` field set are private to that extract
   - Only visible to users who have permission to the extract object
   - Even if user has document+corpus permissions, they cannot see these annotations without extract permission
   - Structural annotations are exempt from this privacy rule

4. **Superuser Access**
   - Superusers bypass all permission checks
   - Get full permissions automatically
   - Can see all annotations including private analysis/extract annotations

## Annotation Privacy Model (NEW)

### Overview

The annotation privacy model allows annotations to be marked as "created by" a specific analysis or extract, making them private to that source object. This provides fine-grained privacy control for programmatically generated annotations.

### Database Schema

```python
class Annotation(BaseOCModel):
    # Standard fields...

    # Privacy fields (NEW)
    created_by_analysis = ForeignKey(
        'analyzer.Analysis',
        null=True, blank=True,
        on_delete=SET_NULL,
        related_name='created_annotations',
        help_text='If set, this annotation is private to the analysis that created it'
    )

    created_by_extract = ForeignKey(
        'extracts.Extract',
        null=True, blank=True,
        on_delete=SET_NULL,
        related_name='created_annotations',
        help_text='If set, this annotation is private to the extract that created it'
    )

    class Meta:
        constraints = [
            CheckConstraint(
                check=Q(created_by_analysis__isnull=True) | Q(created_by_extract__isnull=True),
                name='annotation_created_by_only_one_source',
                violation_error_message='An annotation cannot be created by both an analysis and an extract'
            )
        ]
```

### Privacy Filtering in Query Optimizer

```python
# In AnnotationQueryOptimizer.get_document_annotations()

# Get analyses/extracts user can access
visible_analyses = Analysis.objects.filter(
    Q(is_public=True) | Q(creator=user) |
    Q(id__in=AnalysisUserObjectPermission.objects.filter(user=user).values_list('content_object_id'))
)

visible_extracts = Extract.objects.filter(
    Q(creator=user) |
    Q(id__in=ExtractUserObjectPermission.objects.filter(user=user).values_list('content_object_id'))
)

# Filter annotations: exclude private ones unless user has access
# BUT always include structural annotations (they're always visible)
qs = qs.exclude(
    # Exclude non-structural analysis-created annotations user can't see
    Q(created_by_analysis__isnull=False) &
    Q(structural=False) &  # Only apply privacy to non-structural
    ~Q(created_by_analysis__in=visible_analyses)
).exclude(
    # Exclude non-structural extract-created annotations user can't see
    Q(created_by_extract__isnull=False) &
    Q(structural=False) &  # Only apply privacy to non-structural
    ~Q(created_by_extract__in=visible_extracts)
)
```

### Import Process Updates

When importing annotations from an analysis, the system now automatically sets the `created_by_analysis` field:

```python
# In import_annotations_from_analysis()
annotation = Annotation.objects.create(
    annotation_label_id=label_id,
    document_id=doc_id,
    analysis_id=analysis_id,
    created_by_analysis_id=analysis_id,  # Mark as created by this analysis
    creator_id=creator_id,
    corpus=analysis.analyzed_corpus
)
```

### Migration Strategy

For existing systems, a data migration is provided that:
1. Identifies existing annotations linked to analyses
2. Sets `created_by_analysis` for non-structural analysis annotations
3. Preserves backward compatibility with the `analysis` field

```python
def migrate_existing_analysis_annotations(apps, schema_editor):
    Annotation = apps.get_model('annotations', 'Annotation')

    # Update annotations that are linked to an analysis and are not structural
    updated = Annotation.objects.filter(
        analysis__isnull=False,
        structural=False
    ).update(
        created_by_analysis_id=models.F('analysis_id')
    )
```

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
    perms = get_users_permissions_for_obj(user, document, include_group_permissions=True)
    assert perms == {'read_document'}
```

**Important Testing Note**: The test suite uses GraphQL clients with mock contexts to test permission inheritance through the full stack, ensuring that the optimization layer and GraphQL resolvers work correctly together.

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

#### Annotation Privacy Tests (NEW)
```python
def test_analysis_created_annotation_privacy():
    # Create annotation marked as created by analysis
    private_annotation = Annotation.objects.create(
        annotation_label=label,
        document=doc,
        corpus=corpus,
        analysis=analysis,
        created_by_analysis=analysis,  # Mark as private to analysis
        creator=owner
    )

    # User with doc+corpus but NO analysis permission
    set_permissions_for_obj_to_user(viewer, doc, [PermissionTypes.READ])
    set_permissions_for_obj_to_user(viewer, corpus, [PermissionTypes.READ])

    # Should NOT see the private annotation
    visible = AnnotationQueryOptimizer.get_document_annotations(
        document_id=doc.id,
        user=viewer,
        corpus_id=corpus.id
    )
    assert private_annotation not in visible

    # Grant analysis permission
    set_permissions_for_obj_to_user(viewer, analysis, [PermissionTypes.READ])

    # Now should see the annotation
    visible = AnnotationQueryOptimizer.get_document_annotations(
        document_id=doc.id,
        user=viewer,
        corpus_id=corpus.id
    )
    assert private_annotation in visible

def test_structural_annotations_always_visible():
    # Structural annotations bypass privacy rules
    structural = Annotation.objects.create(
        annotation_label=label,
        document=doc,
        corpus=corpus,
        analysis=analysis,
        created_by_analysis=analysis,  # Private to analysis
        structural=True,  # BUT structural overrides privacy
        creator=owner
    )

    # User WITHOUT analysis permission
    visible = AnnotationQueryOptimizer.get_document_annotations(
        document_id=doc.id,
        user=viewer,
        corpus_id=corpus.id,
        structural=True
    )
    assert structural in visible  # Still visible because structural
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

#### Private annotations appearing when they shouldn't (NEW)
- **Check**: `created_by_analysis` or `created_by_extract` fields are properly set
- **Check**: User does NOT have permission to the analysis/extract object
- **Check**: Query optimizer is filtering based on visible_analyses/visible_extracts
- **Note**: Structural annotations bypass privacy and are always visible

#### Permission changes not taking effect
- **Issue**: Old permissions weren't being removed
- **Fix**: `set_permissions_for_obj_to_user` now removes all permissions before adding new ones
- **Verify**: Check database directly to ensure old permissions are removed

#### N+1 Query Performance Issues
- **Check**: Annotation queries use `AnnotationQueryOptimizer`
- **Check**: `_can_*` attributes are present on annotation querysets
- **Check**: `AnnotationType.get_queryset()` detects and preserves pre-computed permissions

#### Mutual exclusivity constraint violations (NEW)
- **Error**: "An annotation cannot be created by both an analysis and an extract"
- **Check**: Never set both `created_by_analysis` AND `created_by_extract`
- **Fix**: Choose one source of creation per annotation
- **Database**: Enforced by CheckConstraint at database level

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

## Implementation Notes for Analyses/Extracts

### Query Pattern for Analyses/Extracts

```python
def get_visible_analyses(user, corpus_id=None):
    """
    Get analyses visible to user based on:
    1. User has READ permission on analysis
    2. User has READ permission on corpus
    3. Filter annotations to only those on readable documents
    """
    # Step 1: Get analyses user has permission to read
    analyses = Analysis.objects.filter(
        # User has explicit permission OR analysis is public
        Q(analysisuserobjectpermission__user=user) | Q(is_public=True)
    )

    # Step 2: Filter by corpus permission
    if corpus_id:
        analyses = analyses.filter(
            analyzed_corpus_id=corpus_id,
            analyzed_corpus__in=Corpus.objects.visible_to_user(user)
        )

    # Step 3: When fetching annotations, filter by document permissions
    # This happens in the annotation resolver using existing optimizer

    return analyses
```

### GraphQL Resolver Pattern

```python
def resolve_analysis_annotations(analysis, info):
    """
    Resolve annotations within an analysis, filtered by document permissions.
    """
    # Use existing AnnotationQueryOptimizer
    user = info.context.user

    # Get all annotation IDs from this analysis
    annotation_ids = analysis.annotations.values_list('id', flat=True)

    # Filter to only those on documents user can read
    visible_annotations = []
    for doc_id in analysis.analyzed_documents.values_list('id', flat=True):
        if user_has_permission_for_obj(user, doc, PermissionTypes.READ):
            visible_annotations.extend(
                annotation_ids.filter(document_id=doc_id)
            )

    return Annotation.objects.filter(id__in=visible_annotations)
```

## Current Implementation Status

✅ **Backend**: Full implementation with query optimizer for annotations
✅ **Frontend**: Complete integration with backend-computed permissions
✅ **Performance**: N+1 queries eliminated for annotations
✅ **Security**: Document-first permission model enforced for annotations
✅ **Testing**: Comprehensive test coverage including inheritance scenarios
✅ **Bug Fixes**: Permission replacement now works correctly
✅ **Annotation Privacy**: `created_by_analysis` and `created_by_extract` fields implemented
✅ **Privacy Filtering**: Query optimizer filters private annotations based on source permissions
✅ **Database Constraints**: Mutual exclusivity enforced at database level
✅ **Migration**: Data migration for existing analysis annotations
✅ **Import Process**: Analysis imports automatically set privacy fields
✅ **Documentation**: This guide reflects current implementation including privacy model

⚠️ **Extract Integration**: While the privacy model supports `created_by_extract`, the extract system may need updates to:
- Set `created_by_extract` when creating annotations from extracts
- Ensure proper permission checks for extract-created annotations

The annotation permission system is production-ready with significant performance improvements and privacy controls. The annotation privacy model provides fine-grained control over programmatically generated annotations while maintaining backward compatibility.