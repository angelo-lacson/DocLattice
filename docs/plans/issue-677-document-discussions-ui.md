# Issue 677: Document Discussions UI Enhancement Plan

## Summary

Improve the UX for document-linked discussions in the `DocumentKnowledgeBase` sidebar by:
1. Showing new discussions immediately after creation (reactive cache updates)
2. Clearly indicating document linkage in thread cards and detail views
3. Enabling navigation to linked documents from thread views

## Current State Analysis

### Backend
- `CreateThreadMutation` (`config/graphql/conversation_mutations.py:41-138`)
  - Only accepts `corpus_id` - **NO `document_id` parameter**
  - Sets `chat_with_corpus=corpus` only
  - Never sets `chat_with_document`

- `Conversation` model (`opencontractserver/conversations/models.py:312-435`)
  - Has `chat_with_document` foreign key field (line 394-400)
  - **Constraint**: Only ONE of `chat_with_corpus` OR `chat_with_document` can be set (not both)
  - Field exists but is never populated by mutation

### Frontend
- `DocumentDiscussionsContent.tsx` (lines 88-141)
  - Receives `documentId` and `corpusId` props
  - Passes only `corpusId` to `CreateThreadButton` (line 120)
  - Shows `ThreadList` filtered by `documentId`

- `CreateThreadButton.tsx` / `CreateThreadForm.tsx`
  - Only accepts `corpusId`
  - No `documentId` support

- `CREATE_THREAD` mutation (`frontend/src/graphql/mutations.ts:2457-2478`)
  - Variables: `corpusId`, `title`, `description`, `initialMessage`
  - **Missing `documentId`**

- `ThreadListItem.tsx` / `ThreadDetail.tsx`
  - No visual indicator for document linkage
  - `chatWithDocument` data exists but not displayed

### GraphQL Queries
- `GET_CONVERSATIONS` (`frontend/src/graphql/queries.ts:2181-2275`)
  - Supports `documentId` filter parameter
  - Returns `chatWithDocument { id, title }`
  - Data is available but not used in UI

## Implementation Plan

### Phase 0: Database Constraint Update (PREREQUISITE)

**File: `opencontractserver/conversations/models.py`**

The current `one_chat_field_null_constraint` enforces mutual exclusivity between `chat_with_corpus` and `chat_with_document`. This is appropriate for CHAT conversations (streaming AI) but too restrictive for THREAD conversations (discussions).

**Change**: Modify constraint to only apply to CHAT type, allowing THREAD type to have both fields set.

```python
# OLD Constraint (lines 408-413):
constraints = [
    django.db.models.CheckConstraint(
        check=django.db.models.Q(chat_with_corpus__isnull=True)
        | django.db.models.Q(chat_with_document__isnull=True),
        name="one_chat_field_null_constraint",
    ),
]

# NEW Constraint:
constraints = [
    django.db.models.CheckConstraint(
        check=(
            # For CHAT type: at least one must be NULL (original behavior)
            django.db.models.Q(conversation_type="CHAT")
            & (
                django.db.models.Q(chat_with_corpus__isnull=True)
                | django.db.models.Q(chat_with_document__isnull=True)
            )
        )
        | (
            # For THREAD type: both can be set (doc-in-corpus discussions)
            django.db.models.Q(conversation_type="THREAD")
        ),
        name="one_chat_field_null_constraint_chat_only",
    ),
]
```

**Also update**: `clean()` method validation to match new constraint logic.

**Migration**: Create migration to update constraint.

**Permission Logic Updates Required**:
1. `can_moderate()` method - check BOTH corpus.creator AND document.creator
2. WebSocket access control (`thread_updates.py`) - use AND logic instead of if/elif
3. Vector search - ensure both contexts are considered

### Phase 1: Backend Enhancement

**File: `config/graphql/conversation_mutations.py`**

Add optional `document_id` parameter to `CreateThreadMutation`:

```python
class CreateThreadMutation(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.String(
            required=False,  # Make optional since document_id can provide context
            description="ID of the corpus for this thread"
        )
        document_id = graphene.String(
            required=False,
            description="ID of the document for this thread (document-specific discussions)"
        )
        title = graphene.String(required=True)
        description = graphene.String(required=False)
        initial_message = graphene.String(required=True)
```

Mutation logic:
1. If both `document_id` AND `corpus_id` provided: Set BOTH fields (doc-in-corpus thread)
2. If only `document_id` provided: Set `chat_with_document`, infer corpus from document if possible
3. If only `corpus_id` provided: Set `chat_with_corpus` (current behavior)
4. If neither: Return error

**Testing**: Add unit test for document-linked thread creation.

### Phase 2: Frontend Mutation Updates

**File: `frontend/src/graphql/mutations.ts`**

```typescript
export const CREATE_THREAD = gql`
  mutation CreateThread(
    $corpusId: String
    $documentId: String
    $title: String!
    $description: String
    $initialMessage: String!
  ) {
    createThread(
      corpusId: $corpusId
      documentId: $documentId
      title: $title
      description: $description
      initialMessage: $initialMessage
    ) {
      ok
      message
      obj {
        id
        title
        description
        chatWithDocument {
          id
          title
          slug
          creator { slug }
        }
        chatWithCorpus {
          id
          title
          slug
          creator { slug }
        }
      }
    }
  }
`;

export interface CreateThreadInput {
  corpusId?: string;
  documentId?: string;
  title: string;
  description?: string;
  initialMessage: string;
}
```

### Phase 3: CreateThreadForm & Button Updates

**File: `frontend/src/components/threads/CreateThreadForm.tsx`**

1. Add `documentId` prop:
```typescript
export interface CreateThreadFormProps {
  corpusId?: string;  // Make optional
  documentId?: string;  // New prop
  onSuccess: (conversationId: string) => void;
  onClose: () => void;
  initialMessage?: string;
}
```

2. Update mutation call to include `documentId`
3. Update `refetchQueries` to include document-filtered query:
```typescript
refetchQueries: [
  documentId && {
    query: GET_CONVERSATIONS,
    variables: { documentId, conversationType: "THREAD" },
  },
  corpusId && {
    query: GET_CONVERSATIONS,
    variables: { corpusId, conversationType: "THREAD" },
  },
].filter(Boolean),
```

**File: `frontend/src/components/threads/CreateThreadButton.tsx`**

1. Add `documentId` prop
2. Pass to `CreateThreadForm`

### Phase 4: DocumentDiscussionsContent Integration

**File: `frontend/src/components/discussions/DocumentDiscussionsContent.tsx`**

```typescript
// Line 119-121: Update CreateThreadButton usage
{!threadId && (
  <CreateThreadButton
    documentId={documentId}  // Primary: document-level thread
    corpusId={corpusId}      // Fallback context
    variant="secondary"
  />
)}
```

Add callback to auto-select newly created thread:
```typescript
const handleThreadCreated = (conversationId: string) => {
  // Update URL to show the new thread
  const searchParams = new URLSearchParams(location.search);
  searchParams.set("thread", conversationId);
  navigate({ search: searchParams.toString() }, { replace: true });
};
```

### Phase 5: Document Linkage Indicator Component

**New File: `frontend/src/components/threads/DocumentLinkBadge.tsx`**

```typescript
interface DocumentLinkBadgeProps {
  document: {
    id: string;
    title: string;
    slug?: string;
    creator?: { slug: string };
  };
  corpus?: {
    slug: string;
    creator: { slug: string };
  };
  compact?: boolean;
}

export function DocumentLinkBadge({ document, corpus, compact }: DocumentLinkBadgeProps) {
  const navigate = useNavigate();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Use routing system for navigation
    if (corpus?.creator?.slug && corpus?.slug && document.slug) {
      navigate(`/d/${corpus.creator.slug}/${corpus.slug}/${document.slug}`);
    } else if (document.creator?.slug && document.slug) {
      navigate(`/d/${document.creator.slug}/${document.slug}`);
    }
  };

  return (
    <Badge onClick={handleClick} title={`View: ${document.title}`}>
      <FileText size={12} />
      {!compact && <span>{document.title}</span>}
    </Badge>
  );
}
```

### Phase 6: ThreadListItem Enhancement

**File: `frontend/src/components/threads/ThreadListItem.tsx`**

Add document linkage indicator:

```typescript
// After line 169 (badges section)
{thread.chatWithDocument && (
  <DocumentLinkBadge
    document={thread.chatWithDocument}
    corpus={thread.chatWithCorpus}
    compact={compact}
  />
)}
```

### Phase 7: ThreadDetail Enhancement

**File: `frontend/src/components/threads/ThreadDetail.tsx`**

Add document context section in header (after line 348):

```typescript
{/* Document context (if linked to document) */}
{thread.chatWithDocument && (
  <DocumentContextSection>
    <DocumentIcon size={16} />
    <span>Linked to document:</span>
    <DocumentLink
      document={thread.chatWithDocument}
      corpus={thread.chatWithCorpus}
    />
  </DocumentContextSection>
)}
```

### Phase 8: Cache Configuration

**File: `frontend/src/graphql/cache.ts`**

Add keyArgs for conversations query to properly cache by documentId:

```typescript
Query: {
  fields: {
    // Existing fields...
    conversations: relayStylePagination([
      "corpusId",
      "documentId",
      "conversationType",
    ]),
  },
},
```

## File Changes Summary

| File | Changes |
|------|---------|
| `config/graphql/conversation_mutations.py` | Add `document_id` parameter to CreateThreadMutation |
| `frontend/src/graphql/mutations.ts` | Add `documentId` to CREATE_THREAD mutation |
| `frontend/src/components/threads/CreateThreadForm.tsx` | Accept & use `documentId`, update refetchQueries |
| `frontend/src/components/threads/CreateThreadButton.tsx` | Accept & pass `documentId` |
| `frontend/src/components/discussions/DocumentDiscussionsContent.tsx` | Pass `documentId` to CreateThreadButton, auto-select new thread |
| `frontend/src/components/threads/DocumentLinkBadge.tsx` | **NEW** - Document link indicator component |
| `frontend/src/components/threads/ThreadListItem.tsx` | Add DocumentLinkBadge |
| `frontend/src/components/threads/ThreadDetail.tsx` | Add document context section |
| `frontend/src/graphql/cache.ts` | Add conversations keyArgs |

## Testing Checklist

- [ ] Backend: Create thread with `document_id` - verify `chat_with_document` is set
- [ ] Backend: Create thread with `corpus_id` only - verify existing behavior works
- [ ] Backend: Create thread with both IDs - verify `document_id` takes precedence
- [ ] Frontend: Create thread from document sidebar - appears immediately in list
- [ ] Frontend: Document badge shows on thread cards
- [ ] Frontend: Document link section shows in thread detail
- [ ] Frontend: Clicking document link navigates correctly
- [ ] Frontend: New thread auto-opens in sidebar after creation

## Acceptance Criteria (from Issue)

- [x] ~~New discussions appear in the sidebar immediately after creation~~ → Phase 3 (refetchQueries) + Phase 4 (auto-select)
- [x] ~~Discussion display shows document linkage clearly~~ → Phase 5-7 (DocumentLinkBadge)
- [x] ~~No page refresh required to see newly created discussions~~ → Phase 3 (Apollo cache updates)
- [x] ~~Visual design is consistent with existing UI patterns~~ → Using existing badge/button patterns

## Dependencies

- Routing system (`docs/frontend/routing_system.md`) for document navigation
- Existing thread components (`frontend/src/components/threads/`)
- Apollo cache configuration (`frontend/src/graphql/cache.ts`)
