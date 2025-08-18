# OpenContracts Permission System - Complete Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Permission Types](#permission-types)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Component Integration](#component-integration)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

## Overview

OpenContracts implements a hierarchical permission system where **corpus-level permissions override document-level permissions** when a document is viewed within a corpus context. This design enables fine-grained access control while supporting both collaborative corpus work and standalone document viewing.

### Key Principles

1. **Corpus Priority**: Corpus permissions take precedence over document permissions
2. **Progressive Enhancement**: Features are enabled based on available permissions
3. **Fail Secure**: Default to most restrictive permissions when uncertain
4. **Server-Side Enforcement**: Client-side checks are for UX only; all security is enforced server-side

## Architecture

```
Permission Flow:
Route → Slug Resolution → Permission Loading → Component Evaluation → UI Rendering

Permission Sources:
1. Document Permissions (myPermissions on Document type)
2. Corpus Permissions (myPermissions on Corpus type)

Evaluation Priority:
1. Explicit readOnly prop (highest)
2. Corpus context requirement
3. Corpus permissions (if available)
4. Document permissions (fallback)
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
    """REPLACE current permissions with specified permissions."""

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
        # Returns user's permissions for this specific object instance
        # Handles anonymous users, superusers, and regular users
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

### Security Features

1. **Atomic Permission Replacement**: `set_permissions_for_obj_to_user` replaces all permissions atomically
2. **Public Object Handling**: Objects with `is_public=True` automatically grant read access
3. **Superuser Support**: Superusers automatically get all permissions
4. **Group Inheritance**: Users inherit permissions from groups when enabled

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

```typescript
// From DocumentKnowledgeBase.tsx
const canEdit = React.useMemo(() => {
  // Explicit readOnly prop overrides all
  if (readOnly) return false;

  // No corpus = limited editing capabilities
  if (!corpusId) return false;

  // Corpus permissions take priority
  if (canUpdateCorpus) return true;

  // Fallback to document permissions
  return permissions.includes(PermissionTypes.CAN_UPDATE);
}, [readOnly, corpusId, permissions, canUpdateCorpus]);
```

### Route Implementation

The `DocumentLandingRoute` no longer hardcodes `readOnly={true}` and lets `DocumentKnowledgeBase` determine permissions:

```typescript
// DocumentLandingRoute.tsx
return (
  <DocumentKnowledgeBase
    documentId={document.id}
    corpusId={corpus?.id}
    // No readOnly prop - let component determine based on permissions
  />
);
```

## Component Integration

### Core Components

#### DocumentKnowledgeBase
- Evaluates permissions from both document and corpus sources
- Prioritizes corpus permissions over document permissions
- Passes `read_only` prop to child components

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

## Feature Availability

### Always Available (No Corpus Required)
- Document viewing (PDF/TXT rendering)
- Basic search within document
- Personal notes
- Document metadata viewing
- Export/download
- Navigation (pages, zoom)

### Corpus-Required Features
- **Annotations**: Require corpus label sets
- **Analyses**: Corpus-scoped processing
- **Extracts**: Corpus-based data extraction
- **Collaborative summaries**: Multi-user summaries
- **Shared comments**: Team collaboration

### Progressive Enhancement
- **Chat**: Basic without corpus, history with corpus
- **Permissions**: Document permissions alone, or corpus override
- **Sharing**: Limited without corpus, full sharing within corpus

## Testing

### Backend Tests (opencontractserver/tests/test_permissioning.py)

```python
def test_permission_setting():
    set_permissions_for_obj_to_user(
        user_val=user,
        instance=document,
        permissions=[PermissionTypes.ALL]
    )

    assert user_has_permission_for_obj(
        user_val=user,
        instance=document,
        permission=PermissionTypes.UPDATE
    )
```

### Frontend Tests

```typescript
describe('Permission Flow', () => {
  it('should prioritize corpus permissions', async () => {
    const mocks = [
      createDocumentMock(['CAN_READ']),  // Document: read-only
      createCorpusMock(['CAN_UPDATE'])   // Corpus: can edit
    ];

    render(
      <MockedProvider mocks={mocks}>
        <DocumentKnowledgeBase documentId="123" corpusId="456" />
      </MockedProvider>
    );

    // Should be editable due to corpus permission
    await waitFor(() => {
      expect(screen.queryByText('read-only')).not.toBeInTheDocument();
    });
  });
});
```

### Test Utilities

```typescript
export const PERMISSION_SCENARIOS = {
  FULL_ACCESS: {
    document: ["CAN_READ", "CAN_UPDATE", "CAN_REMOVE"],
    corpus: ["CAN_READ", "CAN_UPDATE", "CAN_REMOVE"]
  },
  READ_ONLY: {
    document: ["CAN_READ"],
    corpus: ["CAN_READ"]
  },
  CORPUS_UPDATE_ONLY: {
    document: ["CAN_READ"],
    corpus: ["CAN_READ", "CAN_UPDATE"]
  }
};
```

## Troubleshooting

### Common Issues

#### Document appears read-only despite having permissions
- **Check**: Verify DocumentLandingRoute doesn't hardcode `readOnly={true}`
- **Check**: Ensure GraphQL queries include `myPermissions` fields
- **Check**: Verify corpus permissions if viewing in corpus context

#### Corpus permissions not applying
- **Check**: Verify `corpusId` is passed to DocumentKnowledgeBase
- **Check**: Ensure corpus permissions are loaded in state atoms

#### Permissions not updating after changes
- **Check**: Refresh GraphQL cache after permission mutations
- **Check**: Verify permission state atoms are updated correctly

### Debug Steps

1. **Check Route Props**: Verify no hardcoded `readOnly` props
2. **Inspect GraphQL**: Check `myPermissions` in network tab responses
3. **Review State**: Use React DevTools to inspect permission atoms
4. **Verify Component Props**: Check `read_only`/`readOnly` prop values
5. **Add Debug Logs**: Temporary console.log at permission decision points

### Performance Monitoring

- **Middleware Caching**: Verify permission metadata is cached per request
- **GraphQL Efficiency**: Ensure no N+1 permission queries
- **Frontend State**: Monitor permission atom updates
- **Database Queries**: Profile Django Guardian relationship queries

## Security Considerations

1. **Server-Side Enforcement**: All mutations validate permissions on backend
2. **Client-Side UX Only**: Frontend checks improve user experience but don't enforce security
3. **Fail-Safe Defaults**: Default to most restrictive permissions on errors
4. **Anonymous Handling**: Anonymous users get empty permissions list
5. **Public Objects**: Public objects only grant READ permission automatically

## Current Implementation Status

✅ **Backend**: Fully implemented with Django Guardian + custom utilities
✅ **Frontend**: Complete permission flow with corpus > document priority
✅ **Integration**: GraphQL permission annotations working correctly
✅ **Testing**: Comprehensive test coverage for all scenarios
✅ **Documentation**: This consolidated guide

The permission system is production-ready and handles all documented scenarios correctly.
