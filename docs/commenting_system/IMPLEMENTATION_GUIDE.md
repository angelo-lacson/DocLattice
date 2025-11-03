# Frontend Implementation Guide: Commenting & Discussion System

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [State Management Strategy](#state-management-strategy)
3. [Component Specifications](#component-specifications)
4. [Data Flow Patterns](#data-flow-patterns)
5. [Testing Strategy](#testing-strategy)
6. [Implementation Checklist](#implementation-checklist)
7. [Code Examples & Patterns](#code-examples--patterns)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   Corpus   │  │   Document   │  │  Global Forum     │  │
│  │   Detail   │  │   Viewer     │  │  View (/forum)    │  │
│  └──────┬─────┘  └──────┬───────┘  └─────────┬─────────┘  │
│         │                │                     │             │
│         └────────────────┴─────────────────────┘             │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│              Thread Components Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  ThreadList  │  │ ThreadDetail │  │  ThreadSearch    │  │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬────────┘  │
│         │                  │                     │            │
│         │                  │                     │            │
│  ┌──────▼──────────────────▼─────────────────────▼────────┐ │
│  │          Shared Thread Components                       │ │
│  │  • MessageItem    • VoteButtons   • ModerationControls │ │
│  │  • MessageTree    • ReplyForm     • NotificationBell   │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                   State Management Layer                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Jotai Atoms │  │ Apollo Cache │  │  Local Storage   │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                      Data Layer                               │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │  GraphQL API    │  │  Backend Django + GraphQL        │  │
│  │  (mutations &   │  │  (conversation models, signals)  │  │
│  │   queries)      │  │                                  │  │
│  └─────────────────┘  └──────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **State Management**: Jotai (atomic state)
- **GraphQL Client**: Apollo Client
- **Styling**: styled-components + existing theme system
- **Routing**: React Router
- **Testing**: Playwright Component Tests
- **Rich Text**: TipTap (for message composer)
- **Icons**: Lucide React (consistent with badge system)
- **Date Formatting**: date-fns
- **Markdown**: SafeMarkdown component (existing)

### Core Design Principles

1. **Component Reusability**: Build atomic components that work across corpus/document/global contexts
2. **Progressive Enhancement**: Basic functionality works, then add real-time updates later
3. **Permission-Aware**: All UI respects backend permissions (myPermissions field)
4. **Optimistic Updates**: Immediate UI feedback, rollback on error
5. **Responsive First**: Mobile-friendly from the start
6. **Accessibility**: Keyboard navigation, ARIA labels, screen reader support

---

## State Management Strategy

### Jotai Atoms Architecture

**File**: `frontend/src/atoms/threadAtoms.ts`

```typescript
import { atom } from "jotai";
import { ConversationType, ChatMessageType } from "../types/graphql-api";

// ============================================================================
// THREAD LIST STATE
// ============================================================================

export type ThreadSortOption = "newest" | "active" | "upvoted" | "pinned";
export type ThreadFilterOptions = {
  showLocked: boolean;
  showDeleted: boolean;  // Only relevant for moderators
};

// Currently selected corpus for thread view
export const selectedCorpusIdAtom = atom<string | null>(null);

// Thread list sort order
export const threadSortAtom = atom<ThreadSortOption>("pinned");

// Thread list filters
export const threadFiltersAtom = atom<ThreadFilterOptions>({
  showLocked: true,
  showDeleted: false,
});

// ============================================================================
// THREAD DETAIL STATE
// ============================================================================

// Currently viewing thread
export const currentThreadIdAtom = atom<string | null>(null);

// Currently selected message (for deep linking)
export const selectedMessageIdAtom = atom<string | null>(null);

// Message tree expansion state (for collapsible threads)
export const expandedMessageIdsAtom = atom<Set<string>>(new Set());

// ============================================================================
// UI STATE
// ============================================================================

// Show/hide thread creation modal
export const showCreateThreadModalAtom = atom<boolean>(false);

// Show/hide reply form for specific message
export const replyingToMessageIdAtom = atom<string | null>(null);

// Editing message (for edit functionality in future)
export const editingMessageIdAtom = atom<string | null>(null);

// ============================================================================
// DERIVED ATOMS
// ============================================================================

/**
 * Computes whether current user can create threads in selected corpus
 * This is a derived atom that reads from corpus permissions
 */
export const canCreateThreadAtom = atom<boolean>((get) => {
  // Implementation will check permissions from Apollo cache
  // For now, placeholder
  return true;
});
```

### Apollo Cache Strategy

**Cache Policies**:
```typescript
// frontend/src/graphql/cache-config.ts

export const typePolicies = {
  ConversationType: {
    fields: {
      allMessages: {
        // Messages are in-memory only, not paginated
        merge: false,
      },
    },
  },

  ChatMessageType: {
    fields: {
      upvoteCount: {
        // Use optimistic updates for vote counts
        merge: (existing, incoming) => incoming,
      },
      downvoteCount: {
        merge: (existing, incoming) => incoming,
      },
    },
  },

  Query: {
    fields: {
      conversations: {
        keyArgs: ["corpusId", "documentId", "conversationType"],
        merge: (existing, incoming, { args }) => {
          if (!existing || !args?.after) {
            return incoming;
          }

          // Merge paginated results
          return {
            ...incoming,
            edges: [...existing.edges, ...incoming.edges],
          };
        },
      },
    },
  },
};
```

### Local Storage for User Preferences

```typescript
// frontend/src/hooks/useThreadPreferences.ts

const THREAD_PREFS_KEY = "opencontracts_thread_preferences";

interface ThreadPreferences {
  defaultSort: ThreadSortOption;
  compactView: boolean;
  showAvatars: boolean;
}

export function useThreadPreferences() {
  const [prefs, setPrefs] = useState<ThreadPreferences>(() => {
    const stored = localStorage.getItem(THREAD_PREFS_KEY);
    return stored
      ? JSON.parse(stored)
      : {
          defaultSort: "pinned",
          compactView: false,
          showAvatars: true,
        };
  });

  const updatePrefs = (updates: Partial<ThreadPreferences>) => {
    const newPrefs = { ...prefs, ...updates };
    setPrefs(newPrefs);
    localStorage.setItem(THREAD_PREFS_KEY, JSON.stringify(newPrefs));
  };

  return { prefs, updatePrefs };
}
```

---

## Component Specifications

### Component Tree Structure

```
Thread List Components:
├── ThreadList.tsx (container)
│   ├── ThreadListHeader.tsx
│   │   ├── ThreadSortDropdown.tsx
│   │   ├── ThreadFilterToggles.tsx
│   │   └── CreateThreadButton.tsx
│   ├── ThreadListItem.tsx (repeated)
│   │   ├── ThreadTitle.tsx
│   │   ├── ThreadMetadata.tsx
│   │   ├── ThreadStats.tsx
│   │   └── ThreadBadges.tsx (locked/pinned indicators)
│   ├── ThreadListEmpty.tsx
│   └── FetchMoreOnVisible.tsx (existing)

Thread Detail Components:
├── ThreadDetail.tsx (container)
│   ├── ThreadDetailHeader.tsx
│   │   ├── ThreadTitle.tsx (editable for creator/mods)
│   │   ├── ThreadMetadata.tsx
│   │   ├── ModerationControls.tsx (#576)
│   │   └── ThreadBreadcrumbs.tsx
│   ├── MessageTree.tsx
│   │   └── MessageItem.tsx (recursive)
│   │       ├── MessageHeader.tsx
│   │       │   ├── UserAvatar.tsx
│   │       │   ├── Username.tsx
│   │       │   └── MessageTimestamp.tsx
│   │       ├── MessageContent.tsx
│   │       │   └── SafeMarkdown.tsx (existing)
│   │       ├── MessageFooter.tsx
│   │       │   ├── VoteButtons.tsx (#575)
│   │       │   ├── ReplyButton.tsx (#574)
│   │       │   └── MessageActions.tsx (edit, delete)
│   │       └── MessageTree.tsx (nested replies)
│   └── ThreadDetailEmpty.tsx

Shared Components:
├── ThreadBadge.tsx (locked/pinned/deleted indicators)
├── UserBadge.tsx (moderator/creator badges)
└── RelativeTime.tsx (time formatting)
```

### Detailed Component Specs

#### 1. ThreadList.tsx

**Purpose**: Container component that fetches and displays list of threads

**Props**:
```typescript
interface ThreadListProps {
  corpusId?: string;
  documentId?: string;
  conversationType?: ConversationTypeEnum;
  embedded?: boolean;  // When embedded in corpus/document page
}
```

**State**:
- Jotai: `threadSortAtom`, `threadFiltersAtom`
- Apollo: `useQuery(GET_CONVERSATIONS)`

**Behavior**:
- Fetches threads on mount
- Applies sort and filter client-side
- Infinite scroll for pagination
- Refetches on interval (30s) for new threads

**GraphQL**:
```graphql
query GetThreads($corpusId: String, $conversationType: String) {
  conversations(corpusId: $corpusId, conversationType: $conversationType) {
    edges {
      node {
        id
        title
        description
        createdAt
        creator { username }
        chatMessages { totalCount }
        isPinned
        isLocked
        deletedAt
      }
    }
  }
}
```

**Styled Components**:
```typescript
const ThreadListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing.md};
  padding: ${spacing.lg};
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: 640px) {
    padding: ${spacing.sm};
    gap: ${spacing.sm};
  }
`;

const ThreadGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing.sm};
`;
```

**Testing**:
- ✅ Renders thread list with mocked data
- ✅ Applies sort correctly (newest, active, upvoted, pinned)
- ✅ Applies filters correctly (showLocked, showDeleted)
- ✅ Handles empty state
- ✅ Handles loading state
- ✅ Handles error state
- ✅ Infinite scroll triggers fetchMore
- ✅ Create thread button shows for users with permission

---

#### 2. ThreadListItem.tsx

**Purpose**: Individual thread card in list view

**Props**:
```typescript
interface ThreadListItemProps {
  thread: ConversationType;
  onClick: () => void;
  compact?: boolean;
}
```

**Visual Design**:
```
┌─────────────────────────────────────────────────────────────┐
│ 📌 [PINNED] 🔒 [LOCKED]                                     │
│                                                              │
│ Thread Title (bold, 18px)                                   │
│ Description excerpt... (truncated to 2 lines)               │
│                                                              │
│ 👤 username  •  🕒 2 hours ago  •  💬 23 replies  •  ⬆️ 45  │
└─────────────────────────────────────────────────────────────┘
```

**Styled Components**:
```typescript
const ThreadCard = styled.div<{ $isPinned?: boolean }>`
  background: ${color.N2};
  border: 1px solid ${color.N4};
  border-radius: 8px;
  padding: ${spacing.md};
  cursor: pointer;
  transition: all 0.2s;

  ${props => props.$isPinned && `
    border-left: 4px solid ${color.B5};
    background: ${color.B1};
  `}

  &:hover {
    border-color: ${color.B5};
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    transform: translateY(-1px);
  }
`;

const ThreadTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: ${color.N10};
  margin: 0 0 ${spacing.xs} 0;
`;

const ThreadDescription = styled.p`
  font-size: 14px;
  color: ${color.N7};
  margin: 0 0 ${spacing.md} 0;

  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ThreadMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
  font-size: 13px;
  color: ${color.N6};

  @media (max-width: 640px) {
    flex-wrap: wrap;
    gap: ${spacing.xs};
  }
`;

const BadgeRow = styled.div`
  display: flex;
  gap: ${spacing.xs};
  margin-bottom: ${spacing.sm};
`;
```

**Testing**:
- ✅ Renders thread data correctly
- ✅ Shows pinned badge when isPinned
- ✅ Shows locked badge when isLocked
- ✅ Truncates long descriptions
- ✅ Formats timestamps correctly
- ✅ onClick navigates to thread detail
- ✅ Hover effects work

---

#### 3. ThreadDetail.tsx

**Purpose**: Full thread view with all messages

**Props**:
```typescript
interface ThreadDetailProps {
  conversationId: string;
}
```

**State**:
- Apollo: `useQuery(GET_THREAD_DETAIL)`
- Jotai: `selectedMessageIdAtom`, `expandedMessageIdsAtom`

**Behavior**:
- Fetches full thread with all messages
- Builds message tree from flat message list
- Scrolls to selected message if `?message=id` in URL
- Highlights selected message briefly (3s)
- Handles deep linking

**Message Tree Algorithm**:
```typescript
interface MessageNode extends ChatMessageType {
  children: MessageNode[];
  depth: number;
}

function buildMessageTree(
  messages: ChatMessageType[],
  maxDepth: number = 10
): MessageNode[] {
  // Create map of message ID to message with children array
  const messageMap = new Map<string, MessageNode>();

  messages.forEach(msg => {
    messageMap.set(msg.id, {
      ...msg,
      children: [],
      depth: 0,
    });
  });

  // Build tree by linking children to parents
  const rootMessages: MessageNode[] = [];

  messages
    .sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime())
    .forEach(msg => {
      const node = messageMap.get(msg.id)!;

      if (msg.parentMessage?.id) {
        const parent = messageMap.get(msg.parentMessage.id);
        if (parent) {
          node.depth = Math.min(parent.depth + 1, maxDepth);
          parent.children.push(node);
        } else {
          // Parent not found, treat as root
          rootMessages.push(node);
        }
      } else {
        rootMessages.push(node);
      }
    });

  return rootMessages;
}
```

**Deep Linking**:
```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const messageId = params.get("message");

  if (messageId && threadData?.conversation?.allMessages) {
    // Wait for messages to render
    setTimeout(() => {
      const messageEl = document.getElementById(`message-${messageId}`);
      if (messageEl) {
        messageEl.scrollIntoView({ behavior: "smooth", block: "center" });
        setSelectedMessageId(messageId);

        // Remove highlight after 3s
        setTimeout(() => setSelectedMessageId(null), 3000);
      }
    }, 100);
  }
}, [threadData, setSelectedMessageId]);
```

**Styled Components**:
```typescript
const ThreadDetailContainer = styled.div`
  max-width: 1000px;
  margin: 0 auto;
  padding: ${spacing.lg};

  @media (max-width: 640px) {
    padding: ${spacing.sm};
  }
`;

const ThreadHeader = styled.div`
  border-bottom: 1px solid ${color.N4};
  padding-bottom: ${spacing.lg};
  margin-bottom: ${spacing.lg};
`;

const ThreadTitleLarge = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: ${color.N10};
  margin: 0 0 ${spacing.sm} 0;
`;

const ThreadDescription = styled.p`
  font-size: 16px;
  color: ${color.N7};
  line-height: 1.6;
`;

const MessageListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing.sm};
`;
```

**Testing**:
- ✅ Fetches and displays thread detail
- ✅ Builds message tree correctly
- ✅ Handles nested replies (up to 10 levels)
- ✅ Deep linking to specific message works
- ✅ Highlights linked message
- ✅ Empty state when no messages
- ✅ Loading state
- ✅ Error state
- ✅ Breadcrumbs navigation works

---

#### 4. MessageItem.tsx

**Purpose**: Individual message with threading support

**Props**:
```typescript
interface MessageItemProps {
  message: MessageNode;
  depth: number;
  isHighlighted?: boolean;
  showReplyForm?: boolean;
  onReply?: (messageId: string) => void;
}
```

**Visual Design**:
```
┌─────────────────────────────────────────────────────────────┐
│ [depth * 24px margin-left]                                  │
│                                                              │
│ 👤 username [MODERATOR] [CREATOR] • 2 hours ago            │
│ ─────────────────────────────────────────────────────────   │
│ Message content goes here. Can be multiple paragraphs.     │
│ Supports **markdown** formatting.                           │
│                                                              │
│ ⬆️ 23  ⬇️ 2  |  💬 Reply  |  ⋯ More                        │
└─────────────────────────────────────────────────────────────┘
   │
   └─> Nested replies render recursively with increased margin
```

**Styled Components**:
```typescript
const MessageContainer = styled.div<{
  $depth: number;
  $isHighlighted?: boolean;
  $isDeleted?: boolean;
}>`
  margin-left: ${props => Math.min(props.$depth * 24, 240)}px;
  padding: ${spacing.md};
  background: ${props => props.$isHighlighted ? color.B1 : color.N2};
  border: 1px solid ${color.N4};
  border-radius: 8px;
  transition: all 0.3s;

  ${props => props.$isDeleted && `
    opacity: 0.6;
    background: ${color.N3};
  `}

  @media (max-width: 640px) {
    margin-left: ${props => Math.min(props.$depth * 12, 48)}px;
    padding: ${spacing.sm};
  }
`;

const MessageHeader = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  margin-bottom: ${spacing.sm};
  padding-bottom: ${spacing.sm};
  border-bottom: 1px solid ${color.N4};
`;

const Username = styled.span`
  font-weight: 600;
  color: ${color.N10};
`;

const MessageTimestamp = styled.span`
  font-size: 13px;
  color: ${color.N6};
`;

const MessageContent = styled.div`
  color: ${color.N9};
  line-height: 1.6;
  margin-bottom: ${spacing.md};

  p {
    margin: 0 0 ${spacing.sm} 0;
  }

  code {
    background: ${color.N3};
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
  }
`;

const MessageFooter = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.md};

  @media (max-width: 640px) {
    flex-wrap: wrap;
  }
`;
```

**Testing**:
- ✅ Renders message content correctly
- ✅ Applies correct indentation based on depth
- ✅ Shows user badges (moderator, creator)
- ✅ Formats timestamp as relative time
- ✅ Renders markdown content safely
- ✅ Voting buttons appear and work (#575)
- ✅ Reply button appears and works (#574)
- ✅ Nested replies render recursively
- ✅ Deleted messages show as [deleted]
- ✅ Highlighted state applies correctly

---

#### 5. MessageTree.tsx

**Purpose**: Recursive component for rendering message hierarchy

**Props**:
```typescript
interface MessageTreeProps {
  messages: MessageNode[];
  highlightedMessageId?: string | null;
}
```

**Implementation**:
```typescript
export function MessageTree({ messages, highlightedMessageId }: MessageTreeProps) {
  return (
    <>
      {messages.map(message => (
        <React.Fragment key={message.id}>
          <MessageItem
            message={message}
            depth={message.depth}
            isHighlighted={message.id === highlightedMessageId}
          />

          {message.children.length > 0 && (
            <MessageTree
              messages={message.children}
              highlightedMessageId={highlightedMessageId}
            />
          )}
        </React.Fragment>
      ))}
    </>
  );
}
```

**Testing**:
- ✅ Renders flat list of messages
- ✅ Renders nested messages correctly
- ✅ Maintains proper depth through recursion
- ✅ Passes highlighted state through tree
- ✅ Performance is acceptable with 100+ messages

---

### Supporting Components

#### ThreadBadge.tsx

**Purpose**: Visual indicator for thread state

```typescript
interface ThreadBadgeProps {
  type: "pinned" | "locked" | "deleted";
  compact?: boolean;
}

const BadgeContainer = styled.span<{ $type: string }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;

  ${props => {
    switch (props.$type) {
      case "pinned":
        return `
          background: ${color.B2};
          color: ${color.B8};
        `;
      case "locked":
        return `
          background: ${color.R2};
          color: ${color.R8};
        `;
      case "deleted":
        return `
          background: ${color.N4};
          color: ${color.N7};
        `;
    }
  }}
`;

export function ThreadBadge({ type, compact }: ThreadBadgeProps) {
  const icons = {
    pinned: <Pin size={14} />,
    locked: <Lock size={14} />,
    deleted: <Trash2 size={14} />,
  };

  const labels = {
    pinned: "Pinned",
    locked: "Locked",
    deleted: "Deleted",
  };

  return (
    <BadgeContainer $type={type}>
      {icons[type]}
      {!compact && <span>{labels[type]}</span>}
    </BadgeContainer>
  );
}
```

---

#### RelativeTime.tsx

**Purpose**: Format timestamps as relative time

```typescript
import { formatDistanceToNow } from "date-fns";

interface RelativeTimeProps {
  date: string | Date;
  suffix?: boolean;
}

export function RelativeTime({ date, suffix = true }: RelativeTimeProps) {
  const [time, setTime] = useState(() =>
    formatDistanceToNow(new Date(date), { addSuffix: suffix })
  );

  // Update every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(formatDistanceToNow(new Date(date), { addSuffix: suffix }));
    }, 60000);

    return () => clearInterval(interval);
  }, [date, suffix]);

  return <span title={new Date(date).toLocaleString()}>{time}</span>;
}
```

---

## Data Flow Patterns

### 1. Fetch and Display Threads

```
User navigates to corpus → ThreadList mounts
  ↓
ThreadList useQuery(GET_CONVERSATIONS, { corpusId })
  ↓
Apollo sends GraphQL request to backend
  ↓
Backend returns conversations with message counts
  ↓
Apollo stores in cache
  ↓
ThreadList receives data → applies sort/filter → renders
  ↓
User sees list of threads
```

### 2. Sort and Filter (Client-Side)

```typescript
// In ThreadList.tsx

const [sortBy] = useAtom(threadSortAtom);
const [filters] = useAtom(threadFiltersAtom);

const sortedAndFilteredThreads = useMemo(() => {
  let threads = data?.conversations?.edges?.map(e => e.node) || [];

  // Apply filters
  if (!filters.showLocked) {
    threads = threads.filter(t => !t.isLocked);
  }
  if (!filters.showDeleted) {
    threads = threads.filter(t => !t.deletedAt);
  }

  // Apply sort
  threads = threads.sort((a, b) => {
    // Pinned always first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "active":
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      case "upvoted":
        // TODO: Calculate total upvotes from messages
        return 0;
      default:
        return 0;
    }
  });

  return threads;
}, [data, sortBy, filters]);
```

### 3. Open Thread Detail

```
User clicks thread → navigate to /discussions/:corpusId/thread/:threadId
  ↓
ThreadDetail mounts with conversationId prop
  ↓
ThreadDetail useQuery(GET_THREAD_DETAIL, { conversationId })
  ↓
Apollo sends GraphQL request
  ↓
Backend returns conversation with allMessages array
  ↓
Apollo stores in cache
  ↓
ThreadDetail receives data → builds message tree → renders
  ↓
User sees full thread with nested messages
```

### 4. Infinite Scroll Pagination

```typescript
// In ThreadList.tsx

const { data, loading, fetchMore } = useQuery(GET_CONVERSATIONS, {
  variables: {
    corpusId,
    limit: 20,
  },
});

const handleLoadMore = () => {
  if (data?.conversations?.pageInfo?.hasNextPage) {
    fetchMore({
      variables: {
        cursor: data.conversations.pageInfo.endCursor,
      },
    });
  }
};

// In JSX
<FetchMoreOnVisible fetchNextPage={handleLoadMore} />
```

### 5. Refetch on Interval

```typescript
// Refetch thread list every 30 seconds for new threads
const { data, refetch } = useQuery(GET_CONVERSATIONS, {
  variables: { corpusId },
  pollInterval: 30000,  // 30 seconds
});
```

---

## Testing Strategy

### Test File Structure

```
frontend/tests/threads/
├── ThreadList.test.tsx
├── ThreadListItem.test.tsx
├── ThreadDetail.test.tsx
├── MessageItem.test.tsx
├── MessageTree.test.tsx
├── utils/
│   ├── mockThreadData.ts
│   └── ThreadTestWrapper.tsx
└── __snapshots__/
```

### Test Wrapper Pattern

```typescript
// frontend/tests/threads/utils/ThreadTestWrapper.tsx

import { MockedProvider } from "@apollo/client/testing";
import { Provider as JotaiProvider } from "jotai";
import { MemoryRouter } from "react-router-dom";

export function ThreadTestWrapper({
  children,
  mocks = [],
  initialRoute = "/"
}: {
  children: React.ReactNode;
  mocks?: any[];
  initialRoute?: string;
}) {
  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <MockedProvider mocks={mocks} addTypename={false}>
        <JotaiProvider>
          {children}
        </JotaiProvider>
      </MockedProvider>
    </MemoryRouter>
  );
}
```

### Mock Data Factory

```typescript
// frontend/tests/threads/utils/mockThreadData.ts

export function createMockThread(overrides?: Partial<ConversationType>): ConversationType {
  return {
    id: "thread-1",
    conversationType: "THREAD",
    title: "Test Thread",
    description: "Test description",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    creator: {
      id: "user-1",
      username: "testuser",
      email: "test@example.com",
    },
    chatWithCorpus: {
      id: "corpus-1",
      title: "Test Corpus",
    },
    chatMessages: {
      totalCount: 5,
    },
    isPinned: false,
    isLocked: false,
    deletedAt: null,
    myPermissions: ["READ", "WRITE"],
    ...overrides,
  };
}

export function createMockMessage(overrides?: Partial<ChatMessageType>): ChatMessageType {
  return {
    id: "message-1",
    msgType: "HUMAN",
    content: "Test message content",
    createdAt: new Date().toISOString(),
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    creator: {
      id: "user-1",
      username: "testuser",
      email: "test@example.com",
    },
    upvoteCount: 5,
    downvoteCount: 1,
    userVote: null,
    parentMessage: null,
    deletedAt: null,
    ...overrides,
  };
}
```

### Example Test: ThreadList

```typescript
// frontend/tests/threads/ThreadList.test.tsx

import { test, expect } from "@playwright/experimental-ct-react";
import { ThreadList } from "../../src/components/threads/ThreadList";
import { ThreadTestWrapper } from "./utils/ThreadTestWrapper";
import { createMockThread } from "./utils/mockThreadData";
import { GET_CONVERSATIONS } from "../../src/graphql/queries";

test("renders thread list with mocked data", async ({ mount }) => {
  const mockThreads = [
    createMockThread({ id: "1", title: "First Thread", isPinned: true }),
    createMockThread({ id: "2", title: "Second Thread" }),
  ];

  const mocks = [
    {
      request: {
        query: GET_CONVERSATIONS,
        variables: { corpusId: "corpus-1", conversationType: "THREAD" },
      },
      result: {
        data: {
          conversations: {
            edges: mockThreads.map(thread => ({ node: thread })),
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: "",
              endCursor: "",
            },
            totalCount: 2,
          },
        },
      },
    },
  ];

  const component = await mount(
    <ThreadTestWrapper mocks={mocks}>
      <ThreadList corpusId="corpus-1" />
    </ThreadTestWrapper>
  );

  // Wait for data to load
  await component.waitFor({ timeout: 2000 });

  // Check that threads are rendered
  await expect(component.getByText("First Thread")).toBeVisible();
  await expect(component.getByText("Second Thread")).toBeVisible();

  // Check that pinned badge shows
  await expect(component.getByText("Pinned")).toBeVisible();
});

test("applies sort correctly", async ({ mount, page }) => {
  const mockThreads = [
    createMockThread({
      id: "1",
      title: "Old Thread",
      createdAt: "2024-01-01T00:00:00Z",
    }),
    createMockThread({
      id: "2",
      title: "New Thread",
      createdAt: "2024-12-01T00:00:00Z",
    }),
  ];

  const mocks = [
    {
      request: {
        query: GET_CONVERSATIONS,
        variables: { corpusId: "corpus-1" },
      },
      result: {
        data: {
          conversations: {
            edges: mockThreads.map(thread => ({ node: thread })),
            pageInfo: {},
            totalCount: 2,
          },
        },
      },
    },
  ];

  const component = await mount(
    <ThreadTestWrapper mocks={mocks}>
      <ThreadList corpusId="corpus-1" />
    </ThreadTestWrapper>
  );

  await component.waitFor({ timeout: 2000 });

  // Get initial order
  const threadTitles = await component.locator("h3").allTextContents();
  expect(threadTitles).toEqual(["New Thread", "Old Thread"]);

  // Click sort dropdown and select "oldest first" (if implemented)
  // await component.getByRole("button", { name: /sort/i }).click();
  // await page.getByText("Oldest First").click();

  // Check new order
  // const newThreadTitles = await component.locator("h3").allTextContents();
  // expect(newThreadTitles).toEqual(["Old Thread", "New Thread"]);
});

test("shows empty state when no threads", async ({ mount }) => {
  const mocks = [
    {
      request: {
        query: GET_CONVERSATIONS,
        variables: { corpusId: "corpus-1" },
      },
      result: {
        data: {
          conversations: {
            edges: [],
            pageInfo: {},
            totalCount: 0,
          },
        },
      },
    },
  ];

  const component = await mount(
    <ThreadTestWrapper mocks={mocks}>
      <ThreadList corpusId="corpus-1" />
    </ThreadTestWrapper>
  );

  await component.waitFor({ timeout: 2000 });

  await expect(component.getByText(/no discussions yet/i)).toBeVisible();
});
```

### Running Tests

```bash
# Run all thread tests
yarn run test:ct --reporter=list -g "Thread"

# Run specific test file
yarn run test:ct --reporter=list frontend/tests/threads/ThreadList.test.tsx

# Run with UI for debugging
yarn run test:ct --ui frontend/tests/threads/ThreadList.test.tsx
```

---

## Implementation Checklist

### Issue #573: Thread List and Detail Views

#### Setup
- [x] Create branch `feature/thread-list-detail-573`
- [x] Create directory structure
- [x] Update TypeScript types
- [x] Add GraphQL queries
- [ ] Create Jotai atoms

#### Components
- [ ] Create `ThreadList.tsx`
- [ ] Create `ThreadListHeader.tsx`
- [ ] Create `ThreadListItem.tsx`
- [ ] Create `ThreadSortDropdown.tsx`
- [ ] Create `ThreadFilterToggles.tsx`
- [ ] Create `ThreadBadge.tsx`
- [ ] Create `ThreadDetail.tsx`
- [ ] Create `ThreadDetailHeader.tsx`
- [ ] Create `MessageItem.tsx`
- [ ] Create `MessageTree.tsx`
- [ ] Create `RelativeTime.tsx`
- [ ] Create `ThreadListEmpty.tsx`
- [ ] Create `ThreadDetailEmpty.tsx`

#### Utilities
- [ ] Implement `buildMessageTree()` algorithm
- [ ] Implement `useThreadPreferences()` hook
- [ ] Implement deep linking logic
- [ ] Implement sorting logic
- [ ] Implement filtering logic

#### Testing
- [ ] Write ThreadList tests
- [ ] Write ThreadListItem tests
- [ ] Write ThreadDetail tests
- [ ] Write MessageItem tests
- [ ] Write MessageTree tests
- [ ] Create mock data factories
- [ ] Create test wrapper
- [ ] All tests passing

#### Quality
- [ ] Run `pre-commit run --all-files`
- [ ] Fix any linting errors
- [ ] Fix any formatting issues
- [ ] Ensure no TypeScript errors

#### Documentation
- [ ] Add JSDoc comments to components
- [ ] Update CLAUDE.md if needed
- [ ] Add usage examples

#### Git & PR
- [ ] Commit changes with clear message
- [ ] Push to remote
- [ ] Open PR against `v3.0.0.b3`
- [ ] Link PR to issue #573
- [ ] Wait for CI checks
- [ ] Request review

---

## Code Examples & Patterns

### Pattern 1: Fetch with Loading/Error States

```typescript
export function ThreadList({ corpusId }: ThreadListProps) {
  const { data, loading, error, refetch } = useQuery(GET_CONVERSATIONS, {
    variables: { corpusId, conversationType: "THREAD" },
    pollInterval: 30000,
  });

  if (loading) {
    return <ModernLoadingDisplay type="default" message="Loading discussions..." />;
  }

  if (error) {
    return (
      <ModernErrorDisplay
        type="generic"
        error={error.message}
        onRetry={() => refetch()}
      />
    );
  }

  const threads = data?.conversations?.edges?.map(e => e.node) || [];

  if (threads.length === 0) {
    return <ThreadListEmpty corpusId={corpusId} />;
  }

  return (
    <ThreadListContainer>
      <ThreadListHeader corpusId={corpusId} />
      <ThreadGrid>
        {threads.map(thread => (
          <ThreadListItem key={thread.id} thread={thread} />
        ))}
      </ThreadGrid>
    </ThreadListContainer>
  );
}
```

### Pattern 2: Optimistic Updates (for Voting - #575)

```typescript
const [voteMessage] = useMutation(VOTE_MESSAGE, {
  optimisticResponse: ({ messageId, voteType }) => ({
    voteMessage: {
      ok: true,
      obj: {
        id: messageId,
        upvoteCount: voteType === "UPVOTE" ? message.upvoteCount + 1 : message.upvoteCount,
        downvoteCount: voteType === "DOWNVOTE" ? message.downvoteCount + 1 : message.downvoteCount,
        userVote: voteType,
      },
    },
  }),
});
```

### Pattern 3: Permission-Based Rendering

```typescript
function ThreadDetailHeader({ thread }: { thread: ConversationType }) {
  const canModerate = thread.myPermissions?.includes("MODERATE");
  const isCreator = thread.creator.id === currentUser.id;

  return (
    <ThreadHeader>
      <ThreadTitleLarge>{thread.title}</ThreadTitleLarge>
      {thread.description && <ThreadDescription>{thread.description}</ThreadDescription>}

      {(canModerate || isCreator) && (
        <ModerationControls thread={thread} />
      )}
    </ThreadHeader>
  );
}
```

### Pattern 4: Error Boundary Usage

```typescript
<ErrorBoundary
  fallback={(error, reset) => (
    <ModernErrorDisplay
      type="generic"
      error={error.message}
      onRetry={reset}
    />
  )}
>
  <ThreadList corpusId={corpusId} />
</ErrorBoundary>
```

### Pattern 5: Responsive Design

```typescript
const ThreadCard = styled.div`
  padding: ${spacing.md};

  @media (max-width: 640px) {
    padding: ${spacing.sm};
  }

  @media (min-width: 641px) and (max-width: 900px) {
    padding: ${spacing.md};
  }

  @media (min-width: 901px) {
    padding: ${spacing.lg};
  }
`;
```

---

## Next Steps After #573

Once #573 is complete and merged, the following issues can be implemented:

1. **#574: Message Composer** - Depends on ThreadDetail for integration
2. **#575: Voting UI** - Can be added to MessageItem
3. **#576: Moderation UI** - Can be added to ThreadDetailHeader
4. **#621: Corpus Forum View** - Reuses ThreadList
5. **#622: Document Discussions** - Reuses ThreadList/ThreadDetail
6. **#623: Global Forum View** - Reuses ThreadList

The foundation laid in #573 enables rapid development of remaining features!

---

## Performance Considerations

### Optimization Strategies

1. **Message Tree Memoization**:
```typescript
const messageTree = useMemo(
  () => buildMessageTree(thread.allMessages || []),
  [thread.allMessages]
);
```

2. **Virtual Scrolling** (if >100 threads):
```typescript
import { useVirtualizer } from "@tanstack/react-virtual";

const virtualizer = useVirtualizer({
  count: threads.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 120, // Estimated thread card height
});
```

3. **Lazy Loading Images**:
```typescript
<img
  src={user.avatar}
  loading="lazy"
  alt={user.username}
/>
```

4. **Debounced Search**:
```typescript
const debouncedSearch = useMemo(
  () => debounce((value: string) => {
    setSearchTerm(value);
  }, 300),
  []
);
```

---

## Accessibility Requirements

### WCAG 2.1 AA Compliance

1. **Keyboard Navigation**:
   - Tab through thread list items
   - Enter to open thread
   - Arrow keys for navigation
   - Escape to close modals

2. **ARIA Labels**:
```typescript
<button
  aria-label={`Reply to ${message.creator.username}'s message`}
  onClick={handleReply}
>
  Reply
</button>
```

3. **Focus Management**:
```typescript
const focusTrap = useFocusTrap(modalRef, isOpen);
```

4. **Screen Reader Announcements**:
```typescript
<div role="status" aria-live="polite" aria-atomic="true">
  {loading && "Loading discussions..."}
  {error && `Error: ${error.message}`}
</div>
```

---

## Conclusion

This implementation guide provides a comprehensive roadmap for building the commenting and discussion system frontend. Follow this guide systematically, and each component will integrate seamlessly with the existing backend APIs.

**Key Takeaways**:
- Build reusable components from the start
- Test thoroughly with Playwright
- Follow existing patterns in the codebase
- Keep accessibility in mind
- Optimize for performance with large datasets

Ready to implement! 🚀
