import React, { useState } from "react";
import styled from "styled-components";
import { User, MoreVertical, Pin, ChevronDown, ChevronUp } from "lucide-react";
import { useSetAtom } from "jotai";
import { color } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MessageNode } from "./utils";
import { RelativeTime } from "./RelativeTime";
import { MessageBadges } from "../badges/MessageBadges";
import { MarkdownMessageRenderer } from "./MarkdownMessageRenderer";
import { formatUsername } from "./userUtils";
import { UserBadgeType } from "../../types/graphql-api";
import {
  mapWebSocketSourcesToChatMessageSources,
  ChatMessageSource,
  chatSourcesAtom,
} from "../annotator/context/ChatSourceAtom";
import { WebSocketSources } from "../knowledge_base/document/right_tray/ChatTray";

interface MessageItemProps {
  message: MessageNode;
  isHighlighted?: boolean;
  onReply?: (messageId: string) => void;
  userBadges?: UserBadgeType[];
}

const MessageContainer = styled.div<{
  $depth: number;
  $isHighlighted?: boolean;
  $isDeleted?: boolean;
}>`
  margin-left: ${(props) => Math.min(props.$depth * 32, 240)}px;
  padding: ${spacing.xl};
  background: ${(props) => {
    if (props.$isDeleted) return color.N2;
    if (props.$isHighlighted)
      return `linear-gradient(135deg, ${color.B1} 0%, #f0f9ff 100%)`;
    return "white";
  }};
  border: 1px solid
    ${(props) => {
      if (props.$isHighlighted) return color.B4;
      return "rgba(0, 0, 0, 0.06)";
    }};
  border-radius: 16px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: ${spacing.lg};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06);
  position: relative;

  ${(props) =>
    props.$isHighlighted &&
    `
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: linear-gradient(180deg, ${color.B6} 0%, ${color.B5} 100%);
      border-radius: 16px 0 0 16px;
    }
  `}

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
    transform: translateY(-2px);
    border-color: ${(props) =>
      props.$isHighlighted ? color.B5 : "rgba(0, 0, 0, 0.1)"};
  }

  ${(props) =>
    props.$isDeleted &&
    `
    opacity: 0.5;
    background: ${color.N2};
  `}

  @media (max-width: 640px) {
    margin-left: ${(props) => Math.min(props.$depth * 16, 64)}px;
    padding: ${spacing.lg};
  }
`;

const MessageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${spacing.sm};
  margin-bottom: ${spacing.sm};
  padding-bottom: ${spacing.sm};
  border-bottom: 1px solid ${color.N4};
`;

const MessageHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  flex: 1;
  min-width: 0;
`;

const UserAvatar = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.25);
  transition: all 0.2s ease;

  &:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.35);
  }
`;

const UserInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

const UsernameRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  flex-wrap: wrap;
`;

const Username = styled.span`
  font-weight: 700;
  color: ${color.N10};
  font-size: 16px;
  letter-spacing: -0.02em;
`;

const MessageTimestamp = styled.span`
  font-size: 13px;
  color: ${color.N6};
  font-weight: 500;
`;

const MessageActions = styled.button`
  background: none;
  border: none;
  color: ${color.N6};
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;

  &:hover {
    background: ${color.N3};
    color: ${color.N9};
  }
`;

const MessageContent = styled.div<{ $isDeleted?: boolean }>`
  color: ${color.N9};
  line-height: 1.6;
  margin-bottom: ${spacing.md};
  font-size: 14px;
  word-wrap: break-word;

  ${(props) =>
    props.$isDeleted &&
    `
    font-style: italic;
    color: ${color.N6};
  `}

  p {
    margin: 0 0 ${spacing.sm} 0;
  }

  code {
    background: ${color.N3};
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: monospace;
  }

  pre {
    background: ${color.N3};
    padding: ${spacing.sm};
    border-radius: 4px;
    overflow-x: auto;
  }

  blockquote {
    border-left: 3px solid ${color.B5};
    padding-left: ${spacing.md};
    margin: ${spacing.sm} 0;
    color: ${color.N7};
  }
`;

const MessageFooter = styled.div`
  display: flex;
  align-items: center;
  gap: ${spacing.md};

  @media (max-width: 640px) {
    flex-wrap: wrap;
    gap: ${spacing.xs};
  }
`;

const FooterButton = styled.button`
  background: linear-gradient(135deg, ${color.B1} 0%, #f0f9ff 100%);
  border: 1px solid ${color.B3};
  color: ${color.B7};
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  &:hover {
    background: linear-gradient(135deg, ${color.B6} 0%, ${color.B5} 100%);
    border-color: ${color.B6};
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(74, 144, 226, 0.3);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
`;

const ReplyCount = styled.span`
  font-size: 12px;
  color: ${color.N6};
  margin-left: auto;
`;

const SourcesContainer = styled.div`
  margin-top: ${spacing.sm};
  border-top: 1px solid ${color.N4};
  padding-top: ${spacing.sm};
`;

const SourcesHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: ${spacing.xs} 0;
  user-select: none;

  &:hover {
    opacity: 0.7;
  }
`;

const SourcesTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: ${color.N7};
`;

const SourcesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${spacing.xs};
  margin-top: ${spacing.xs};
`;

const SourceItem = styled.div`
  padding: ${spacing.xs} ${spacing.sm};
  background: ${color.N2};
  border: 1px solid ${color.N4};
  border-radius: 4px;
  font-size: 13px;
  color: ${color.N8};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: ${color.N3};
    border-color: ${color.B5};
  }
`;

/**
 * Individual message component with support for nested replies
 */
export function MessageItem({
  message,
  isHighlighted = false,
  onReply,
  userBadges = [],
}: MessageItemProps) {
  const isDeleted = !!message.deletedAt;
  const username = formatUsername(
    message.creator?.username,
    message.creator?.email
  );

  // State for sources expansion and selection
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<
    number | undefined
  >(undefined);
  const setChatState = useSetAtom(chatSourcesAtom);

  // Extract and map sources from message.data
  const sources: ChatMessageSource[] = React.useMemo(() => {
    if (!message.data?.sources) return [];
    const mappedSources = mapWebSocketSourcesToChatMessageSources(
      message.data.sources as WebSocketSources[],
      message.id
    );
    // Update chat sources atom when sources change
    if (mappedSources.length > 0) {
      setChatState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages.filter((m) => m.messageId !== message.id),
          {
            messageId: message.id,
            content: message.content || "",
            timestamp: message.created || "",
            sources: mappedSources,
          },
        ],
      }));
    }
    return mappedSources;
  }, [
    message.data?.sources,
    message.id,
    message.content,
    message.created,
    setChatState,
  ]);

  const hasSources = sources.length > 0;

  const handleReply = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReply) {
      onReply(message.id);
    }
  };

  const toggleSources = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSourcesExpanded(!sourcesExpanded);
  };

  const handleSourceClick = (index: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSourceIndex(index === selectedSourceIndex ? undefined : index);
    setChatState((prev) => ({
      ...prev,
      selectedMessageId: message.id,
      selectedSourceIndex: index === prev.selectedSourceIndex ? null : index,
    }));
  };

  return (
    <MessageContainer
      id={`message-${message.id}`}
      $depth={message.depth}
      $isHighlighted={isHighlighted}
      $isDeleted={isDeleted}
      role="article"
      aria-label={`Message from ${username}`}
    >
      {/* Header */}
      <MessageHeader>
        <MessageHeaderLeft>
          <UserAvatar title={username}>
            <User size={16} />
          </UserAvatar>
          <UserInfo>
            <UsernameRow>
              <Username>{username}</Username>
              <MessageBadges
                message={message}
                userBadges={userBadges}
                maxBadges={3}
                showTooltip={true}
              />
            </UsernameRow>
            <MessageTimestamp>
              <RelativeTime date={message.created} />
            </MessageTimestamp>
          </UserInfo>
        </MessageHeaderLeft>

        <MessageActions
          aria-label="Message actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical size={16} />
        </MessageActions>
      </MessageHeader>

      {/* Content */}
      <MessageContent $isDeleted={isDeleted}>
        {isDeleted ? (
          <p>[This message has been deleted]</p>
        ) : (
          // Render markdown content with styled mentions (Issue #623)
          <MarkdownMessageRenderer content={message.content || ""} />
        )}
      </MessageContent>

      {/* PDF Annotation Sources */}
      {!isDeleted && hasSources && (
        <SourcesContainer className="source-preview-container">
          <SourcesHeader onClick={toggleSources}>
            <SourcesTitle>
              <Pin size={14} />
              {sources.length} {sources.length === 1 ? "Source" : "Sources"}
            </SourcesTitle>
            {sourcesExpanded ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </SourcesHeader>
          {sourcesExpanded && (
            <SourcesList>
              {sources.map((source, index) => (
                <SourceItem
                  key={source.id}
                  className="source-chip"
                  onClick={handleSourceClick(index)}
                >
                  {source.rawText || `Source ${index + 1}`}
                </SourceItem>
              ))}
            </SourcesList>
          )}
        </SourcesContainer>
      )}

      {/* Footer */}
      {!isDeleted && (
        <MessageFooter>
          {/* Vote buttons placeholder - will be added in #575 */}
          {/* <VoteButtons message={message} /> */}

          {/* Reply button */}
          <FooterButton
            onClick={handleReply}
            aria-label="Reply to this message"
          >
            Reply
          </FooterButton>

          {/* Reply count */}
          {message.children && message.children.length > 0 && (
            <ReplyCount>
              {message.children.length}{" "}
              {message.children.length === 1 ? "reply" : "replies"}
            </ReplyCount>
          )}
        </MessageFooter>
      )}
    </MessageContainer>
  );
}
