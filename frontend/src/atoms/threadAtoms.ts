import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { ConversationType, ChatMessageType } from "../types/graphql-api";

// ============================================================================
// THREAD LIST STATE
// ============================================================================

export type ThreadSortOption = "newest" | "active" | "upvoted" | "pinned";
export type ThreadFilterOptions = {
  showLocked: boolean;
  showDeleted: boolean; // Only relevant for moderators
};

/**
 * Currently selected corpus for thread view
 */
export const selectedCorpusIdAtom = atom<string | null>(null);

/**
 * Thread list sort order
 * Default: "pinned" to show pinned threads first
 */
export const threadSortAtom = atom<ThreadSortOption>("pinned");

/**
 * Thread list filters
 */
export const threadFiltersAtom = atom<ThreadFilterOptions>({
  showLocked: true,
  showDeleted: false,
});

// ============================================================================
// THREAD DETAIL STATE
// ============================================================================

/**
 * Currently viewing thread ID
 */
export const currentThreadIdAtom = atom<string | null>(null);

/**
 * Currently selected message (for deep linking and highlighting)
 */
export const selectedMessageIdAtom = atom<string | null>(null);

/**
 * Message tree expansion state (for collapsible threads in future)
 */
export const expandedMessageIdsAtom = atom<Set<string>>(new Set<string>());

// ============================================================================
// UI STATE
// ============================================================================

/**
 * Show/hide thread creation modal
 */
export const showCreateThreadModalAtom = atom<boolean>(false);

/**
 * Show/hide reply form for specific message
 * Stores the message ID that user is replying to
 */
export const replyingToMessageIdAtom = atom<string | null>(null);

/**
 * Editing message (for edit functionality in future)
 */
export const editingMessageIdAtom = atom<string | null>(null);

// ============================================================================
// INLINE THREAD VIEW STATE
// ============================================================================

// Note: Inline thread selection in CorpusDiscussionsView is now URL-driven
// via the ?thread= query param, synced through CentralRouteManager to the
// selectedThreadId reactive var in graphql/cache.ts.

/**
 * Corpus context sidebar expanded state (persisted to localStorage)
 * Controls whether the sidebar is expanded or collapsed when viewing thread details
 */
export const threadContextSidebarExpandedAtom = atomWithStorage(
  "threadContextSidebarExpanded",
  true
);
