/**
 * Thread components for discussion/forum functionality
 * Part of Issue #573: Thread List and Detail Views
 * Extended in Issue #574: Message Composer and Reply UI
 */

// Main container components
export { ThreadList } from "./ThreadList";
export { ThreadDetail } from "./ThreadDetail";

// List components
export { ThreadListItem } from "./ThreadListItem";

// Message components
export { MessageItem } from "./MessageItem";
export { MessageTree } from "./MessageTree";

// Composition and reply (Issue #574)
export { MessageComposer } from "./MessageComposer";
export { CreateThreadForm } from "./CreateThreadForm";
export { ReplyForm } from "./ReplyForm";

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

// Component prop types (Issue #574)
export type { MessageComposerProps } from "./MessageComposer";
export type { CreateThreadFormProps } from "./CreateThreadForm";
export type { ReplyFormProps } from "./ReplyForm";
