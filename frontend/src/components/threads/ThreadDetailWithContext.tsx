/**
 * ThreadDetailWithContext - Wrapper that combines ThreadDetail with CorpusContextSidebar
 *
 * Used when viewing thread details inline within the Discussions tab.
 * Provides a two-column layout on larger screens:
 * - Left: Thread detail with compact mode and back navigation
 * - Right: Corpus context sidebar (collapsible on medium screens, hidden on small)
 */

import React from "react";

import { ThreadDetail } from "./ThreadDetail";
import { CorpusContextSidebar } from "./CorpusContextSidebar";
import {
  ThreadWithContextContainer,
  ThreadDetailPane,
  VerticalDivider,
} from "./styles/contextSidebarStyles";

interface ThreadDetailWithContextProps {
  /** The conversation/thread ID to display */
  conversationId: string;
  /** The corpus ID for context sidebar */
  corpusId: string;
  /** Callback when back button is clicked - returns to thread list */
  onBack: () => void;
}

/**
 * ThreadDetailWithContext - Thread detail view with corpus context sidebar
 *
 * Layout:
 * - Screen >= 1200px: Thread detail + expanded sidebar (320px)
 * - Screen 1024-1199px: Thread detail + collapsible sidebar (48px collapsed)
 * - Screen < 1024px: Thread detail only (sidebar hidden)
 */
export const ThreadDetailWithContext: React.FC<
  ThreadDetailWithContextProps
> = ({ conversationId, corpusId, onBack }) => {
  return (
    <ThreadWithContextContainer>
      <ThreadDetailPane>
        <ThreadDetail
          conversationId={conversationId}
          corpusId={corpusId}
          compact
          onBack={onBack}
        />
      </ThreadDetailPane>

      <VerticalDivider />

      <CorpusContextSidebar corpusId={corpusId} />
    </ThreadWithContextContainer>
  );
};

export default ThreadDetailWithContext;
