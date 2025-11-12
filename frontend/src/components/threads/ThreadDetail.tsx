import { useEffect, useMemo } from "react";
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

interface ThreadDetailProps {
  conversationId: string;
  corpusId?: string;
  documentId?: string;
  /** Compact mode for sidebar (narrower padding) */
  compact?: boolean;
}

const ThreadDetailContainer = styled.div<{ $compact?: boolean }>`
  max-width: ${(props) => (props.$compact ? "100%" : "1000px")};
  margin: 0 auto;
  padding: ${(props) => (props.$compact ? spacing.md : spacing.lg)};
  width: 100%;

  @media (max-width: 640px) {
    padding: ${spacing.sm};
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
  border-bottom: 1px solid ${color.N4};
  padding-bottom: ${spacing.lg};
  margin-bottom: ${spacing.lg};
`;

const BadgeRow = styled.div`
  display: flex;
  gap: ${spacing.xs};
  margin-bottom: ${spacing.sm};
  flex-wrap: wrap;
`;

const ThreadTitleLarge = styled.h1`
  font-size: 28px;
  font-weight: 700;
  color: ${color.N10};
  margin: 0 0 ${spacing.sm} 0;
  line-height: 1.3;

  @media (max-width: 640px) {
    font-size: 24px;
  }
`;

const ThreadDescription = styled.p`
  font-size: 16px;
  color: ${color.N7};
  line-height: 1.6;
  margin: 0 0 ${spacing.md} 0;
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
      {/* Back button */}
      <BackButton onClick={handleBack} aria-label="Back to discussions">
        <ArrowLeft size={16} />
        <span>Back to Discussions</span>
      </BackButton>

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
            <strong>{thread.creator?.username || thread.creator?.email}</strong>
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

      {/* TODO: Add message composer at bottom in #574 */}
      {/* {!thread.isLocked && <MessageComposer conversationId={conversationId} />} */}
    </ThreadDetailContainer>
  );
}
