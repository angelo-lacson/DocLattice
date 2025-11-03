/**
 * Thread components for discussion/forum functionality
 * Part of Issue #573: Thread List and Detail Views
 */

// Main container components
export { ThreadList } from "./ThreadList";
export { ThreadDetail } from "./ThreadDetail";

// List components
export { ThreadListItem } from "./ThreadListItem";

// Message components
export { MessageItem } from "./MessageItem";
export { MessageTree } from "./MessageTree";

// Utility components
export { ThreadBadge } from "./ThreadBadge";
export { RelativeTime } from "./RelativeTime";

// Utilities and types
export {
  buildMessageTree,
  flattenMessageTree,
  findMessageInTree,
} from "./utils";
export type { MessageNode } from "./utils";

// Hooks
export { useThreadPreferences } from "./hooks/useThreadPreferences";
export type { ThreadPreferences } from "./hooks/useThreadPreferences";
