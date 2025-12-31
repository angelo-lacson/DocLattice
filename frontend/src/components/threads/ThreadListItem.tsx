import React, { useMemo } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useReactiveVar } from "@apollo/client";
import { Eye, MessageCircle } from "lucide-react";
import { ConversationType } from "../../types/graphql-api";
import { color } from "../../theme/colors";
import { ThreadBadge } from "./ThreadBadge";
import {
  DiscussionTypeBadge,
  inferDiscussionCategory,
} from "./DiscussionTypeBadge";
import { RelativeTime } from "./RelativeTime";
import { getCorpusThreadUrl } from "../../utils/navigationUtils";
import { formatUsername } from "./userUtils";
import { ConversationVoteButtons } from "./ConversationVoteButtons";
import { backendUserObj } from "../../graphql/cache";

interface ThreadListItemProps {
  thread: ConversationType;
  corpusId?: string;
  compact?: boolean;
  /** Optional callback when thread is clicked (overrides default navigation) */
  onThreadClick?: (threadId: string) => void;
  /** Whether this thread is currently selected/active */
  isSelected?: boolean;
}

const ThreadCard = styled.div<{
  $isPinned?: boolean;
  $isDeleted?: boolean;
  $isSelected?: boolean;
}>`
  background: ${color.N1};
  border: 1px solid ${color.N4};
  border-radius: 8px;
  padding: 1rem 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  gap: 1rem;
  position: relative;

  ${(props) =>
    props.$isSelected &&
    `
    border-left: 4px solid ${color.G6};
    background: ${color.G1};
  `}

  ${(props) =>
    props.$isPinned &&
    !props.$isSelected &&
    `
    border-left: 4px solid ${color.B5};
    background: ${color.B1};
  `}

  ${(props) =>
    props.$isDeleted &&
    `
    opacity: 0.6;
    background: ${color.N3};
  `}

  &:hover {
    border-color: ${color.G6};
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
  }

  @media (max-width: 640px) {
    padding: 0.875rem;
    gap: 0.75rem;
  }
`;

const VoteSection = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 40px;
  padding-top: 4px;

  @media (max-width: 640px) {
    min-width: 32px;
  }
`;

const ContentSection = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const BadgeGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const TagChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  background: ${color.N3};
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  color: ${color.N7};
`;

const Timestamp = styled.span`
  font-size: 12px;
  color: ${color.N6};
  white-space: nowrap;
  flex-shrink: 0;
`;

const ThreadTitle = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: ${color.N10};
  margin: 0;
  line-height: 1.4;

  @media (max-width: 640px) {
    font-size: 15px;
  }
`;

const ThreadDescription = styled.p`
  font-size: 14px;
  color: ${color.N7};
  margin: 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  @media (max-width: 640px) {
    font-size: 13px;
    -webkit-line-clamp: 1;
  }
`;

const FooterRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.25rem;
  flex-wrap: wrap;

  @media (max-width: 640px) {
    gap: 0.5rem;
  }
`;

const AuthorSection = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const AuthorAvatar = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${color.G5} 0%, ${color.G7} 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 11px;
  flex-shrink: 0;

  @media (max-width: 640px) {
    width: 24px;
    height: 24px;
    font-size: 10px;
  }
`;

const AuthorInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
`;

const AuthorName = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: ${color.N9};

  @media (max-width: 640px) {
    font-size: 12px;
  }
`;

const AuthorTime = styled.span`
  font-size: 12px;
  color: ${color.N6};

  @media (max-width: 640px) {
    font-size: 11px;
  }
`;

const StatsSection = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;

  @media (max-width: 640px) {
    gap: 0.75rem;
  }
`;

const StatItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: ${color.N6};

  svg {
    width: 14px;
    height: 14px;
  }

  @media (max-width: 640px) {
    font-size: 12px;

    svg {
      width: 12px;
      height: 12px;
    }
  }
`;

const ParticipantAvatars = styled.div`
  display: flex;
  align-items: center;
`;

const ParticipantAvatar = styled.div<{ $index: number }>`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: ${color.N5};
  border: 2px solid ${color.N1};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  color: ${color.N8};
  margin-left: ${(props) => (props.$index > 0 ? "-8px" : "0")};
  position: relative;
  z-index: ${(props) => 10 - props.$index};

  @media (max-width: 640px) {
    width: 20px;
    height: 20px;
    font-size: 8px;
    margin-left: ${(props) => (props.$index > 0 ? "-6px" : "0")};
  }
`;

const MoreParticipants = styled.span`
  font-size: 11px;
  color: ${color.N6};
  margin-left: 4px;
`;

/**
 * Get initials from username or email
 */
function getInitials(username?: string | null, email?: string | null): string {
  const name = username || email || "?";
  if (name.includes("@")) {
    return name.charAt(0).toUpperCase();
  }
  const parts = name.split(/[\s_-]+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Extract unique participants from thread messages
 */
function getParticipants(
  thread: ConversationType
): Array<{ id: string; initials: string }> {
  const participants = new Map<string, string>();

  // Add creator
  if (thread.creator) {
    participants.set(
      thread.creator.id,
      getInitials(thread.creator.username, thread.creator.email)
    );
  }

  return Array.from(participants.entries()).map(([id, initials]) => ({
    id,
    initials,
  }));
}

/**
 * Individual thread card in list view.
 * Redesigned to match GitHub Discussions-style layout with:
 * - Upvote button on left
 * - Type badges and tags
 * - Author info with avatar
 * - Stats (views, comments, participants)
 */
export const ThreadListItem = React.memo(function ThreadListItem({
  thread,
  corpusId,
  compact = false,
  onThreadClick,
  isSelected = false,
}: ThreadListItemProps) {
  const navigate = useNavigate();
  const currentUser = useReactiveVar(backendUserObj);
  const currentUserId = currentUser?.id;

  const handleClick = (e: React.MouseEvent) => {
    // Prevent navigation if clicking the vote button
    if ((e.target as HTMLElement).closest("[data-vote-button]")) {
      return;
    }

    if (onThreadClick) {
      onThreadClick(thread.id);
    } else {
      const corpus = thread.chatWithCorpus;
      if (corpus) {
        const url = getCorpusThreadUrl(corpus, thread.id);
        if (url !== "#") {
          navigate(url);
        } else {
          console.warn(
            "[ThreadListItem] Cannot navigate - corpus missing slug data",
            corpus
          );
        }
      } else {
        console.warn(
          "[ThreadListItem] Cannot navigate - thread has no corpus",
          thread
        );
      }
    }
  };

  const messageCount = thread.chatMessages?.totalCount || 0;
  const isDeleted = !!thread.deletedAt;

  // Infer discussion category from title/description
  const category = useMemo(
    () => inferDiscussionCategory(thread.title || "", thread.description),
    [thread.title, thread.description]
  );

  // Get participants for avatars
  const participants = useMemo(() => getParticipants(thread), [thread]);

  // Placeholder view count (not tracked yet in backend)
  const viewCount = 0;

  const authorName = formatUsername(
    thread.creator?.username,
    thread.creator?.email
  );
  const authorInitials = getInitials(
    thread.creator?.username,
    thread.creator?.email
  );

  return (
    <ThreadCard
      $isPinned={thread.isPinned}
      $isDeleted={isDeleted}
      $isSelected={isSelected}
      onClick={handleClick}
      role="article"
      aria-label={`Thread: ${thread.title}`}
    >
      {/* Vote Section */}
      <VoteSection>
        <ConversationVoteButtons
          conversationId={thread.id}
          upvoteCount={thread.upvoteCount || 0}
          downvoteCount={thread.downvoteCount || 0}
          userVote={thread.userVote}
          creatorId={thread.creator?.id}
          currentUserId={currentUserId}
          disabled={isDeleted || thread.isLocked}
          upvoteOnly
        />
      </VoteSection>

      {/* Content Section */}
      <ContentSection>
        {/* Header Row - Badges and Timestamp */}
        <HeaderRow>
          <BadgeGroup>
            <DiscussionTypeBadge category={category} />
            {thread.isPinned && <ThreadBadge type="pinned" compact />}
            {thread.isLocked && <ThreadBadge type="locked" compact />}
            {isDeleted && <ThreadBadge type="deleted" compact />}
          </BadgeGroup>
          <Timestamp>
            <RelativeTime date={thread.createdAt || thread.created} />
          </Timestamp>
        </HeaderRow>

        {/* Title */}
        <ThreadTitle>{thread.title || "Untitled Discussion"}</ThreadTitle>

        {/* Description */}
        {thread.description && !compact && (
          <ThreadDescription>{thread.description}</ThreadDescription>
        )}

        {/* Footer Row - Author and Stats */}
        <FooterRow>
          <AuthorSection>
            <AuthorAvatar title={authorName}>{authorInitials}</AuthorAvatar>
            <AuthorInfo>
              <AuthorName>{authorName}</AuthorName>
              <AuthorTime>
                <RelativeTime date={thread.createdAt || thread.created} />
              </AuthorTime>
            </AuthorInfo>
          </AuthorSection>

          <StatsSection>
            {viewCount > 0 && (
              <StatItem title={`${viewCount} views`}>
                <Eye />
                <span>{viewCount}</span>
              </StatItem>
            )}
            <StatItem
              title={`${messageCount} ${
                messageCount === 1 ? "reply" : "replies"
              }`}
            >
              <MessageCircle />
              <span>{messageCount}</span>
            </StatItem>
            {participants.length > 0 && (
              <ParticipantAvatars title={`${participants.length} participants`}>
                {participants.slice(0, 3).map((p, i) => (
                  <ParticipantAvatar key={p.id} $index={i}>
                    {p.initials}
                  </ParticipantAvatar>
                ))}
                {participants.length > 3 && (
                  <MoreParticipants>
                    +{participants.length - 3}
                  </MoreParticipants>
                )}
              </ParticipantAvatars>
            )}
          </StatsSection>
        </FooterRow>
      </ContentSection>
    </ThreadCard>
  );
});
