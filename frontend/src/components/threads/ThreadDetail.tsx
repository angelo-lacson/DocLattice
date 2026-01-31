import { useCallback, useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useQuery, useReactiveVar } from "@apollo/client";
import { useAtom } from "jotai";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  MessageCircle,
  FileText,
  Pin,
  Lock,
  Trash2,
  Users,
} from "lucide-react";
import {
  GET_THREAD_DETAIL,
  GetThreadDetailInput,
  GetThreadDetailOutput,
} from "../../graphql/queries";
import {
  CORPUS_COLORS,
  CORPUS_FONTS,
  CORPUS_RADII,
  CORPUS_SHADOWS,
  CORPUS_TRANSITIONS,
  mediaQuery,
} from "./styles/discussionStyles";
import {
  selectedMessageIdAtom,
  replyingToMessageIdAtom,
} from "../../atoms/threadAtoms";
import { buildMessageTree } from "./utils";
import { MessageTree } from "./MessageTree";
import { RelativeTime } from "./RelativeTime";
import {
  DiscussionTypeBadge,
  inferDiscussionCategory,
} from "./DiscussionTypeBadge";
import { ModernLoadingDisplay } from "../widgets/ModernLoadingDisplay";
import { ModernErrorDisplay } from "../widgets/ModernErrorDisplay";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { useMessageBadges } from "../../hooks/useMessageBadges";
import { openedCorpus, backendUserObj } from "../../graphql/cache";
import { ReplyForm } from "./ReplyForm";
import { formatUsername } from "./userUtils";
import { getCorpusUrl } from "../../utils/navigationUtils";

interface ThreadDetailProps {
  conversationId: string;
  corpusId?: string;
  /** Compact mode for sidebar (narrower padding) */
  compact?: boolean;
  /**
   * Custom back handler. If provided, overrides default navigation behavior.
   * Used by sidebar to stay inline instead of navigating away.
   */
  onBack?: () => void;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fafafa;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1rem 2rem;
  background: ${CORPUS_COLORS.white};
  border-bottom: 1px solid ${CORPUS_COLORS.slate[200]};
  gap: 1rem;

  @media (max-width: 768px) {
    padding: 1rem;
    flex-direction: column;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  flex: 1;
  min-width: 0;
`;

const HeaderTop = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.md};
  background: ${CORPUS_COLORS.white};
  font-family: ${CORPUS_FONTS.sans};
  color: ${CORPUS_COLORS.slate[600]};
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all ${CORPUS_TRANSITIONS.fast};

  &:hover {
    border-color: ${CORPUS_COLORS.teal[300]};
    background: ${CORPUS_COLORS.teal[50]};
    color: ${CORPUS_COLORS.teal[700]};
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`;

const ContextLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: ${CORPUS_COLORS.slate[50]};
  border: 1px solid ${CORPUS_COLORS.slate[200]};
  border-radius: ${CORPUS_RADII.sm};
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.75rem;
  font-weight: 500;
  color: ${CORPUS_COLORS.slate[600]};
  text-decoration: none;
  transition: all ${CORPUS_TRANSITIONS.fast};

  &:hover {
    border-color: ${CORPUS_COLORS.teal[300]};
    background: ${CORPUS_COLORS.teal[50]};
    color: ${CORPUS_COLORS.teal[700]};
  }

  svg {
    width: 0.75rem;
    height: 0.75rem;
  }
`;

const StatusBadge = styled.span<{ $variant: "pinned" | "locked" | "deleted" }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: ${CORPUS_RADII.full};
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;

  ${(props) =>
    props.$variant === "pinned" &&
    `
    background: ${CORPUS_COLORS.teal[50]};
    color: ${CORPUS_COLORS.teal[700]};
    border: 1px solid ${CORPUS_COLORS.teal[200]};
  `}

  ${(props) =>
    props.$variant === "locked" &&
    `
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #fcd34d;
  `}

  ${(props) =>
    props.$variant === "deleted" &&
    `
    background: ${CORPUS_COLORS.slate[100]};
    color: ${CORPUS_COLORS.slate[500]};
    border: 1px solid ${CORPUS_COLORS.slate[300]};
  `}

  svg {
    width: 0.75rem;
    height: 0.75rem;
  }
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const Title = styled.h1`
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 28px;
  font-weight: 400;
  color: #1e293b;
  margin: 0;
`;

const Description = styled.p`
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px;
  color: #475569;
  margin: 0;
  line-height: 1.6;
`;

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
  color: ${CORPUS_COLORS.slate[500]};
  flex-wrap: wrap;
`;

const MetaItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;

  strong {
    color: ${CORPUS_COLORS.slate[700]};
    font-weight: 600;
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
    color: ${CORPUS_COLORS.teal[600]};
  }
`;

const MetaDot = styled.span`
  color: ${CORPUS_COLORS.slate[300]};
`;

const ContentArea = styled.div`
  flex: 1;
  overflow: auto;
  padding: 32px 24px;

  @media (max-width: 768px) {
    padding: 24px 16px;
  }
`;

const MessageListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 900px;
  margin: 0 auto;
  width: 100%;
`;

const EmptyMessageState = styled.div`
  text-align: center;
  padding: 3rem;
  color: ${CORPUS_COLORS.slate[500]};
`;

const ReplyComposerArea = styled.div`
  padding: 1rem 2rem;
  background: ${CORPUS_COLORS.white};
  border-top: 1px solid ${CORPUS_COLORS.slate[200]};

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const ReplyComposerInner = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

/**
 * Thread detail view - shows full thread with all messages
 * Supports deep linking to specific messages via ?message=id query param
 */
export function ThreadDetail({
  conversationId,
  corpusId,
  compact = false,
  onBack: customOnBack,
}: ThreadDetailProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedMessageId, setSelectedMessageId] = useAtom(
    selectedMessageIdAtom
  );
  const [replyingToMessageId, setReplyingToMessageId] = useAtom(
    replyingToMessageIdAtom
  );

  // Get current user for permission checking
  const currentUser = useReactiveVar(backendUserObj);

  // Fetch thread detail
  const { data, loading, error, refetch } = useQuery<
    GetThreadDetailOutput,
    GetThreadDetailInput
  >(GET_THREAD_DETAIL, {
    variables: { conversationId },
    fetchPolicy: "cache-and-network",
  });

  const thread = data?.conversation;

  /**
   * Determine if current user can moderate this thread.
   * Moderators can edit/delete any message in the thread.
   *
   * A user can moderate if they are:
   * 1. The thread creator
   * 2. The corpus owner (if thread is linked to a corpus)
   * 3. The document owner (if thread is linked to a document)
   */
  const canModerate = useMemo(() => {
    if (!currentUser || !thread) return false;

    // Thread creator can moderate
    if (thread.creator?.id === currentUser.id) return true;

    // Corpus owner can moderate
    if (thread.chatWithCorpus?.creator?.id === currentUser.id) return true;

    // Document owner can moderate
    if (thread.chatWithDocument?.creator?.id === currentUser.id) return true;

    return false;
  }, [currentUser, thread]);

  // Callback for message updates/deletes - refetch thread data
  const handleMessageChange = useCallback(() => {
    refetch();
  }, [refetch]);

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
    // If custom handler provided (e.g., sidebar), use that instead of navigation
    if (customOnBack) {
      customOnBack();
      return;
    }

    // Default: Navigate back to corpus discussions tab using utility
    if (corpus) {
      const url = getCorpusUrl(corpus, { tab: "discussions" });
      if (url !== "#") {
        navigate(url);
        return;
      }
    }
    // Fallback to browser history
    navigate(-1);
  };

  // Infer discussion category from title/description
  const discussionCategory = useMemo(() => {
    if (!thread) return "question";
    return inferDiscussionCategory(thread.title || "", thread.description);
  }, [thread]);

  // Loading state
  if (loading && !data) {
    return (
      <Container>
        <ModernLoadingDisplay
          type="default"
          message="Loading discussion..."
          size="medium"
        />
      </Container>
    );
  }

  // Error state
  if (error || !thread) {
    return (
      <Container>
        <ModernErrorDisplay
          type="generic"
          error={error?.message || "Thread not found"}
          onRetry={() => refetch()}
        />
      </Container>
    );
  }

  const isDeleted = !!thread.deletedAt;
  const messageCount = thread.allMessages?.length || 0;

  return (
    <Container>
      {/* Compact Header */}
      <Header>
        <HeaderLeft>
          {/* Top row: Back button (only in compact/sidebar mode) + document link + status badges */}
          <HeaderTop>
            {compact && (
              <BackButton onClick={handleBack} aria-label="Back to discussions">
                <ArrowLeft />
                Back
              </BackButton>
            )}

            {/* Corpus link removed - shown in route NavBar */}

            {thread.chatWithDocument && (
              <ContextLink
                href="#"
                title={`Linked to document: ${thread.chatWithDocument.title}`}
              >
                <FileText />
                {thread.chatWithDocument.title}
              </ContextLink>
            )}

            {thread.isPinned && (
              <StatusBadge $variant="pinned">
                <Pin />
                Pinned
              </StatusBadge>
            )}
            {thread.isLocked && (
              <StatusBadge $variant="locked">
                <Lock />
                Locked
              </StatusBadge>
            )}
            {isDeleted && (
              <StatusBadge $variant="deleted">
                <Trash2 />
                Deleted
              </StatusBadge>
            )}
          </HeaderTop>

          {/* Title row: Category badge + title */}
          <TitleRow>
            <DiscussionTypeBadge category={discussionCategory} />
            <Title>{thread.title || "Untitled Discussion"}</Title>
          </TitleRow>

          {/* Description (if present) */}
          {thread.description && (
            <Description>{thread.description}</Description>
          )}

          {/* Meta row: Author + time + message count */}
          <MetaRow>
            <MetaItem>
              <Users />
              <strong>
                {formatUsername(
                  thread.creator?.username,
                  thread.creator?.email
                )}
              </strong>
            </MetaItem>
            <MetaDot>•</MetaDot>
            <MetaItem>
              <RelativeTime date={thread.createdAt} />
            </MetaItem>
            <MetaDot>•</MetaDot>
            <MetaItem>
              <MessageCircle />
              {messageCount} {messageCount === 1 ? "message" : "messages"}
            </MetaItem>
          </MetaRow>
        </HeaderLeft>
      </Header>

      {/* Messages area */}
      <ContentArea>
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
              currentUserId={currentUser?.id}
              canModerate={canModerate}
              corpusId={corpusId}
              onMessageUpdated={handleMessageChange}
              onMessageDeleted={handleMessageChange}
            />
          </MessageListContainer>
        )}
      </ContentArea>

      {/* Bottom-level message composer */}
      {!thread.isLocked && (
        <ReplyComposerArea>
          <ReplyComposerInner>
            <ReplyForm
              conversationId={conversationId}
              onSuccess={() => {
                // Apollo's refetchQueries in ReplyForm handles refetching
              }}
              onCancel={() => {
                // No-op for bottom composer - it's always visible
              }}
              autoFocus={false}
            />
          </ReplyComposerInner>
        </ReplyComposerArea>
      )}
    </Container>
  );
}
