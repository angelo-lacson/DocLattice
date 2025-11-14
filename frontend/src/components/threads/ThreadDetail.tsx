import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useQuery, useReactiveVar } from "@apollo/client";
import { useAtom } from "jotai";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, MessageCircle } from "lucide-react";
import {
  GET_THREAD_DETAIL,
  GetThreadDetailInput,
  GetThreadDetailOutput,
} from "../../graphql/queries";
import { color } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import {
  selectedMessageIdAtom,
  replyingToMessageIdAtom,
} from "../../atoms/threadAtoms";
import { buildMessageTree } from "./utils";
import { MessageTree } from "./MessageTree";
import { ThreadBadge } from "./ThreadBadge";
import { RelativeTime } from "./RelativeTime";
import { ModernLoadingDisplay } from "../widgets/ModernLoadingDisplay";
import { ModernErrorDisplay } from "../widgets/ModernErrorDisplay";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { useMessageBadges } from "../../hooks/useMessageBadges";
import { openedCorpus } from "../../graphql/cache";
import { ReplyForm } from "./ReplyForm";
import { formatUsername } from "./userUtils";

interface ThreadDetailProps {
  conversationId: string;
  corpusId?: string;
  documentId?: string;
  /** Compact mode for sidebar (narrower padding) */
  compact?: boolean;
}

const ThreadDetailContainer = styled.div<{ $compact?: boolean }>`
  max-width: ${(props) => (props.$compact ? "100%" : "1600px")};
  margin: 0 auto;
  padding: ${(props) => (props.$compact ? spacing.md : "2rem")};
  width: 100%;
  background: ${color.N1};

  @media (max-width: 1920px) {
    max-width: ${(props) => (props.$compact ? "100%" : "1400px")};
  }

  @media (max-width: 1440px) {
    max-width: ${(props) => (props.$compact ? "100%" : "1200px")};
  }

  @media (max-width: 1024px) {
    max-width: 100%;
    padding: ${(props) => (props.$compact ? spacing.md : "1.5rem")};
  }

  @media (max-width: 768px) {
    padding: ${spacing.md};
  }
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${spacing.xs};
  background: none;
  border: none;
  color: ${color.N7};
  cursor: pointer;
  font-size: 14px;
  padding: ${spacing.xs} ${spacing.sm};
  border-radius: 4px;
  margin-bottom: ${spacing.md};
  transition: all 0.2s;

  &:hover {
    background: ${color.N3};
    color: ${color.N9};
  }
`;

const ThreadHeader = styled.div`
  border-bottom: 2px solid rgba(0, 0, 0, 0.06);
  padding-bottom: ${spacing.xl};
  margin-bottom: ${spacing.xl};
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(248, 250, 252, 0.5) 100%
  );
  padding: ${spacing.xl} 0;
  border-radius: 12px;
`;

const BadgeRow = styled.div`
  display: flex;
  gap: ${spacing.xs};
  margin-bottom: ${spacing.sm};
  flex-wrap: wrap;
`;

const ThreadTitleLarge = styled.h1`
  font-size: 36px;
  font-weight: 800;
  color: ${color.N10};
  margin: 0 0 ${spacing.md} 0;
  line-height: 1.2;
  letter-spacing: -0.03em;

  @media (max-width: 640px) {
    font-size: 28px;
  }
`;

const ThreadDescription = styled.p`
  font-size: 17px;
  color: ${color.N7};
  line-height: 1.7;
  margin: 0 0 ${spacing.lg} 0;
  font-weight: 400;
`;

const ThreadMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.md};
  font-size: 13px;
  color: ${color.N6};
  flex-wrap: wrap;
`;

const MetaItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const Separator = styled.span`
  color: ${color.N5};
`;

const MessageListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing.md};
`;

const EmptyMessageState = styled.div`
  text-align: center;
  padding: ${spacing.xl};
  color: ${color.N6};
`;

/**
 * Thread detail view - shows full thread with all messages
 * Supports deep linking to specific messages via ?message=id query param
 */
export function ThreadDetail({
  conversationId,
  corpusId,
  documentId: _documentId, // Reserved for future document-specific filtering
  compact = false,
}: ThreadDetailProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedMessageId, setSelectedMessageId] = useAtom(
    selectedMessageIdAtom
  );
  const [replyingToMessageId, setReplyingToMessageId] = useAtom(
    replyingToMessageIdAtom
  );

  // Fetch thread detail
  const { data, loading, error, refetch } = useQuery<
    GetThreadDetailOutput,
    GetThreadDetailInput
  >(GET_THREAD_DETAIL, {
    variables: { conversationId },
    fetchPolicy: "cache-and-network",
  });

  const thread = data?.conversation;

  // Extract unique user IDs from messages
  const userIds = useMemo(() => {
    if (!thread?.allMessages) return [];
    const uniqueIds = new Set(
      thread.allMessages
        .filter((msg) => msg.msgType !== "AGENT") // Only fetch badges for human users
        .map((msg) => msg.creator.id)
    );
    return Array.from(uniqueIds);
  }, [thread?.allMessages]);

  // Fetch badges for all message creators
  const { badgesByUser } = useMessageBadges(userIds, corpusId);

  // Build message tree
  const messageTree = useMemo(() => {
    if (!thread?.allMessages) return [];
    return buildMessageTree(thread.allMessages);
  }, [thread?.allMessages]);

  // Handle deep linking to specific message
  useEffect(() => {
    const messageId = searchParams.get("message");

    if (messageId && thread?.allMessages) {
      // Wait for messages to render
      setTimeout(() => {
        const messageEl = document.getElementById(`message-${messageId}`);
        if (messageEl) {
          messageEl.scrollIntoView({ behavior: "smooth", block: "center" });
          setSelectedMessageId(messageId);

          // Remove highlight after 3 seconds
          setTimeout(() => setSelectedMessageId(null), 3000);
        }
      }, 100);
    }
  }, [searchParams, thread, setSelectedMessageId]);

  // Handle reply action
  const handleReply = (messageId: string) => {
    console.log("Reply to message:", messageId);
    setReplyingToMessageId(messageId);
  };

  // Handle back navigation
  const corpus = useReactiveVar(openedCorpus);
  const handleBack = () => {
    if (corpus?.creator?.slug && corpus?.slug) {
      // Navigate back to corpus discussions tab using proper slug-based URL
      navigate(`/c/${corpus.creator.slug}/${corpus.slug}?tab=discussions`);
    } else {
      // Fallback to browser history
      navigate(-1);
    }
  };

  // Loading state
  if (loading && !data) {
    return (
      <ThreadDetailContainer $compact={compact}>
        <ModernLoadingDisplay
          type="default"
          message="Loading discussion..."
          size="medium"
        />
      </ThreadDetailContainer>
    );
  }

  // Error state
  if (error || !thread) {
    return (
      <ThreadDetailContainer $compact={compact}>
        <ModernErrorDisplay
          type="generic"
          error={error?.message || "Thread not found"}
          onRetry={() => refetch()}
        />
      </ThreadDetailContainer>
    );
  }

  const isDeleted = !!thread.deletedAt;
  const messageCount = thread.allMessages?.length || 0;

  return (
    <ThreadDetailContainer $compact={compact}>
      {/* Back button - only show in compact mode (sidebar), route provides its own back button in full-page mode */}
      {compact && (
        <BackButton onClick={handleBack} aria-label="Back to discussions">
          <ArrowLeft size={16} />
          <span>Back to Discussions</span>
        </BackButton>
      )}

      {/* Thread header */}
      <ThreadHeader>
        {/* Badges */}
        {(thread.isPinned || thread.isLocked || isDeleted) && (
          <BadgeRow>
            {thread.isPinned && <ThreadBadge type="pinned" />}
            {thread.isLocked && <ThreadBadge type="locked" />}
            {isDeleted && <ThreadBadge type="deleted" />}
          </BadgeRow>
        )}

        {/* Title */}
        <ThreadTitleLarge>
          {thread.title || "Untitled Discussion"}
        </ThreadTitleLarge>

        {/* Description */}
        {thread.description && (
          <ThreadDescription>{thread.description}</ThreadDescription>
        )}

        {/* Metadata */}
        <ThreadMeta>
          <MetaItem>
            Started by{" "}
            <strong>
              {formatUsername(thread.creator?.username, thread.creator?.email)}
            </strong>
          </MetaItem>

          <Separator>•</Separator>

          <MetaItem>
            <RelativeTime date={thread.createdAt} />
          </MetaItem>

          <Separator>•</Separator>

          <MetaItem>
            <MessageCircle size={14} />
            <span>
              {messageCount} {messageCount === 1 ? "message" : "messages"}
            </span>
          </MetaItem>
        </ThreadMeta>

        {/* TODO: Add moderation controls in #576 */}
        {/* {canModerate && <ModerationControls thread={thread} />} */}
      </ThreadHeader>

      {/* Messages */}
      {messageTree.length === 0 ? (
        <EmptyMessageState>
          <PlaceholderCard
            title="No messages yet"
            description="Be the first to post a message in this discussion."
            compact
          />
        </EmptyMessageState>
      ) : (
        <MessageListContainer role="list" aria-label="Discussion messages">
          <MessageTree
            messages={messageTree}
            highlightedMessageId={selectedMessageId}
            onReply={handleReply}
            badgesByUser={badgesByUser}
            conversationId={conversationId}
            replyingToMessageId={replyingToMessageId}
            onCancelReply={() => setReplyingToMessageId(null)}
          />
        </MessageListContainer>
      )}

      {/* Bottom-level message composer */}
      {!thread.isLocked && (
        <div
          style={{
            marginTop: spacing.lg,
            paddingTop: spacing.lg,
            borderTop: `1px solid ${color.N4}`,
          }}
        >
          <ReplyForm
            conversationId={conversationId}
            onSuccess={() => {
              refetch();
            }}
            onCancel={() => {
              // No-op for bottom composer - it's always visible
            }}
            autoFocus={false}
          />
        </div>
      )}
    </ThreadDetailContainer>
  );
}
