import React, { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { MessageSquare, ArrowRight, User, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import styled from "styled-components";

import {
  GET_CONVERSATIONS,
  GetConversationsInputs,
  GetConversationsOutputs,
} from "../../../graphql/queries";
import {
  CORPUS_COLORS,
  CORPUS_FONTS,
  CORPUS_RADII,
  CORPUS_TRANSITIONS,
  mediaQuery,
} from "../../corpuses/styles/corpusDesignTokens";
import { ConversationType } from "../../../types/graphql-api";
import { RECENT_THREAD_LIMIT } from "../../../assets/configurations/constants";

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const FeedContainer = styled.div`
  width: 100%;
  max-width: 600px;
  margin-top: 3.5rem;

  ${mediaQuery.tablet} {
    margin-top: 2.5rem;
  }
`;

const FeedHeader = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0;
  margin-bottom: 0.75rem;
  background: none;
  border: none;
  cursor: pointer;
  transition: color ${CORPUS_TRANSITIONS.fast};

  &:hover {
    .view-all {
      color: ${CORPUS_COLORS.teal[600]};
    }

    .view-all svg {
      transform: translateX(3px);
    }
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: 4px;
    border-radius: ${CORPUS_RADII.sm};
  }
`;

const FeedLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: ${CORPUS_COLORS.slate[400]};

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ViewAll = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
  font-weight: 500;
  color: ${CORPUS_COLORS.teal[700]};
  transition: color ${CORPUS_TRANSITIONS.fast};

  svg {
    width: 14px;
    height: 14px;
    transition: transform ${CORPUS_TRANSITIONS.fast};
  }
`;

const ThreadList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.md};
  overflow: hidden;
  background: ${CORPUS_COLORS.slate[200]};
`;

const ThreadItem = styled.button`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.875rem 1rem;
  background: ${CORPUS_COLORS.white};
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background ${CORPUS_TRANSITIONS.fast};

  &:hover {
    background: ${CORPUS_COLORS.slate[50]};
  }

  &:focus-visible {
    outline: 2px solid ${CORPUS_COLORS.teal[500]};
    outline-offset: -2px;
  }
`;

const ThreadTitle = styled.span`
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.9375rem;
  font-weight: 500;
  color: ${CORPUS_COLORS.slate[800]};
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ThreadMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.75rem;
  color: ${CORPUS_COLORS.slate[400]};

  svg {
    width: 12px;
    height: 12px;
  }
`;

const MetaItem = styled.span`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 1rem;
  border: 1px dashed ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.md};
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.875rem;
  color: ${CORPUS_COLORS.slate[400]};
`;

// ============================================================================
// COMPONENT
// ============================================================================

export interface RecentDiscussionsProps {
  /** Corpus ID to fetch discussions for */
  corpusId: string;
  /** Callback when a thread is clicked */
  onThreadClick?: (threadId: string) => void;
  /** Callback when "View All" / header is clicked */
  onViewAll?: () => void;
  /** Test ID prefix */
  testId?: string;
}

/**
 * RecentDiscussions - Minimalist feed showing 2-3 latest discussion threads.
 * Designed to sit below the main landing content to give a sense of community activity.
 */
export const RecentDiscussions: React.FC<RecentDiscussionsProps> = ({
  corpusId,
  onThreadClick,
  onViewAll,
  testId = "recent-discussions",
}) => {
  const variables = useMemo(
    () => ({
      corpusId,
      conversationType: "THREAD" as const,
      limit: RECENT_THREAD_LIMIT,
    }),
    [corpusId]
  );

  const { data, loading } = useQuery<
    GetConversationsOutputs,
    GetConversationsInputs
  >(GET_CONVERSATIONS, {
    variables,
    fetchPolicy: "cache-and-network",
  });

  const threads = useMemo(() => {
    if (!data?.conversations?.edges) return [];
    return data.conversations.edges
      .map((e) => e?.node)
      .filter((n): n is ConversationType => n != null && !n.deletedAt)
      .slice(0, RECENT_THREAD_LIMIT);
  }, [data]);

  // Show a placeholder during initial load to prevent layout shift
  if (loading && threads.length === 0) {
    return (
      <FeedContainer data-testid={testId} style={{ minHeight: "120px" }} />
    );
  }

  return (
    <FeedContainer data-testid={testId}>
      <FeedHeader
        onClick={() => onViewAll?.()}
        data-testid={`${testId}-header`}
        aria-label="View all discussions"
      >
        <FeedLabel>
          <MessageSquare />
          Discussions
        </FeedLabel>
        <ViewAll className="view-all">
          View all
          <ArrowRight />
        </ViewAll>
      </FeedHeader>

      {threads.length > 0 ? (
        <ThreadList>
          {threads.map((thread) => (
            <ThreadItem
              key={thread.id}
              onClick={() => onThreadClick?.(thread.id)}
              data-testid={`${testId}-thread-${thread.id}`}
            >
              <ThreadTitle>{thread.title || "Untitled Discussion"}</ThreadTitle>
              <ThreadMeta>
                <MetaItem>
                  <User />
                  {thread.creator?.username ||
                    thread.creator?.email?.split("@")[0] ||
                    "Unknown"}
                </MetaItem>
                <MetaItem>
                  <Clock />
                  {thread.createdAt
                    ? formatDistanceToNow(new Date(thread.createdAt), {
                        addSuffix: true,
                      })
                    : "recently"}
                </MetaItem>
                <MetaItem>
                  <MessageSquare />
                  {thread.chatMessages?.totalCount ?? 0}
                </MetaItem>
              </ThreadMeta>
            </ThreadItem>
          ))}
        </ThreadList>
      ) : (
        <EmptyState data-testid={`${testId}-empty`}>
          No discussions yet
        </EmptyState>
      )}
    </FeedContainer>
  );
};
