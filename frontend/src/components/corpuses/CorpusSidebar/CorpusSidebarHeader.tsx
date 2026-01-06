import React from "react";
import { Globe, Shield, ChevronLeft, ChevronRight } from "lucide-react";
import {
  HeaderSection,
  AvatarWrapper,
  HeaderInfo,
  CorpusTitle,
  AccessChip,
  ToggleButton,
} from "./styles";

export interface CorpusSidebarHeaderProps {
  /** Corpus title */
  title?: string;
  /** Whether the corpus is public */
  isPublic?: boolean;
  /** Whether the sidebar is expanded */
  isExpanded: boolean;
  /** Callback to toggle sidebar expansion */
  onToggleExpand: () => void;
  /** Test ID for the component */
  testId?: string;
}

/**
 * Get initials from a corpus title
 */
const getInitials = (title?: string): string => {
  if (!title) return "C";
  const words = title.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
};

/**
 * CorpusSidebarHeader - Header section of the corpus sidebar
 *
 * Features:
 * - Corpus avatar with initials
 * - Corpus title (when expanded)
 * - Public/Private access chip
 * - Expand/collapse toggle button
 */
export const CorpusSidebarHeader: React.FC<CorpusSidebarHeaderProps> = ({
  title,
  isPublic = false,
  isExpanded,
  onToggleExpand,
  testId = "corpus-sidebar-header",
}) => {
  return (
    <HeaderSection $isExpanded={isExpanded} data-testid={testId}>
      <AvatarWrapper
        $size={isExpanded ? "md" : "sm"}
        data-testid={`${testId}-avatar`}
      >
        {getInitials(title)}
      </AvatarWrapper>

      {isExpanded && (
        <HeaderInfo>
          <CorpusTitle title={title}>{title || "Untitled Corpus"}</CorpusTitle>
          <AccessChip $isPublic={isPublic}>
            {isPublic ? (
              <>
                <Globe aria-hidden="true" />
                Public
              </>
            ) : (
              <>
                <Shield aria-hidden="true" />
                Private
              </>
            )}
          </AccessChip>
        </HeaderInfo>
      )}

      <ToggleButton
        onClick={onToggleExpand}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
        data-testid={`${testId}-toggle`}
        style={{ marginLeft: isExpanded ? "auto" : 0 }}
      >
        {isExpanded ? <ChevronLeft /> : <ChevronRight />}
      </ToggleButton>
    </HeaderSection>
  );
};
