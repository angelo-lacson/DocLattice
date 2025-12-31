import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import styled from "styled-components";
import {
  User,
  Bot,
  MoreVertical,
  Pin,
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
  CornerDownRight,
} from "lucide-react";
import { useSetAtom } from "jotai";
import { useMutation } from "@apollo/client";
import { color } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { MessageNode } from "./utils";
import { RelativeTime } from "./RelativeTime";
import { MessageBadges } from "../badges/MessageBadges";
import { MarkdownMessageRenderer } from "./MarkdownMessageRenderer";
import { formatUsername } from "./userUtils";
import { VoteButtons } from "./VoteButtons";
import { UserBadgeType, AgentConfigurationType } from "../../types/graphql-api";
import {
  mapWebSocketSourcesToChatMessageSources,
  ChatMessageSource,
  chatSourcesAtom,
} from "../annotator/context/ChatSourceAtom";
import { WebSocketSources } from "../knowledge_base/document/right_tray/ChatTray";
import { EditMessageModal } from "./EditMessageModal";
import {
  DELETE_MESSAGE,
  DeleteMessageInput,
  DeleteMessageOutput,
} from "../../graphql/mutations";

/**
 * Default color for agent messages when no badge color is configured
 */
const DEFAULT_AGENT_COLOR = "#4A90E2";

/**
 * Validates that a value is a string
 */
function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Validates that a string is a valid hex color (3 or 6 digit format)
 */
function isValidHexColor(value: string): boolean {
  return /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(value);
}

/**
 * Helper to extract agent display data from configuration.
 * Performs runtime validation of badgeConfig fields to ensure type safety
 * since badgeConfig is a GenericScalar (essentially 'any') from GraphQL.
 */
interface AgentDisplayData {
  name: string;
  color: string;
}

export function getAgentDisplayData(
  agentConfig: AgentConfigurationType | null | undefined
): AgentDisplayData | null {
  if (!agentConfig) return null;

  // Runtime validation: badgeConfig could be any shape from the database
  const badgeConfig = agentConfig.badgeConfig;
  let color = DEFAULT_AGENT_COLOR;

  // Validate badgeConfig is an object and color is a valid hex string
  if (
    badgeConfig &&
    typeof badgeConfig === "object" &&
    !Array.isArray(badgeConfig)
  ) {
    const configColor = (badgeConfig as Record<string, unknown>).color;
    if (isString(configColor) && isValidHexColor(configColor)) {
      color = configColor;
    }
  }

  return {
    name: agentConfig.name,
    color,
  };
}

interface MessageItemProps {
  message: MessageNode;
  isHighlighted?: boolean;
  onReply?: (messageId: string) => void;
  userBadges?: UserBadgeType[];
  /** Whether the current user can edit this message */
  canEdit?: boolean;
  /** Whether the current user can delete this message */
  canDelete?: boolean;
  /** Corpus ID for mention context in edit modal */
  corpusId?: string;
  /** Conversation ID for cache update after edit/delete */
  conversationId?: string;
  /** Callback after successful message update */
  onMessageUpdated?: () => void;
  /** Callback after successful message deletion */
  onMessageDeleted?: () => void;
  /** Current user ID for voting */
  currentUserId?: string;
  /** Parent message author for "Replying to" display */
  parentAuthor?: string;
}

/**
 * Normalizes a 3-digit hex color to 6-digit format.
 * e.g., "#abc" -> "#aabbcc"
 */
function normalizeHexColor(hex: string): string {
  const shortHexMatch = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (shortHexMatch) {
    return `#${shortHexMatch[1]}${shortHexMatch[1]}${shortHexMatch[2]}${shortHexMatch[2]}${shortHexMatch[3]}${shortHexMatch[3]}`;
  }
  return hex;
}

/**
 * Helper to create an rgba color from a hex color with alpha.
 * Supports both 3-digit (#abc) and 6-digit (#aabbcc) hex formats.
 */
export function hexToRgba(hex: string, alpha: number): string {
  // Normalize 3-digit hex to 6-digit
  const normalizedHex = normalizeHexColor(hex);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    normalizedHex
  );
  if (!result) return `rgba(74, 144, 226, ${alpha})`; // Fallback to default blue
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(
    result[2],
    16
  )}, ${parseInt(result[3], 16)}, ${alpha})`;
}

/**
 * Pre-computed agent color values to avoid recalculation in styled-components
 */
interface AgentColorProps {
  $agentColor?: string;
  $agentBgStart?: string;
  $agentBgEnd?: string;
  $agentShadow?: string;
  $agentShadowHover?: string;
}

const MessageContainer = styled.div<
  {
    $depth: number;
    $isHighlighted?: boolean;
    $isDeleted?: boolean;
    $isAgent?: boolean;
  } & AgentColorProps
>`
  display: flex;
  gap: 0.75rem;
  padding: 1rem;
  background: ${(props) => {
    if (props.$isDeleted) return color.N2;
    if (props.$isHighlighted) return color.B1;
    if (props.$isAgent && props.$agentBgStart && props.$agentBgEnd) {
      return `linear-gradient(135deg, ${props.$agentBgStart} 0%, ${props.$agentBgEnd} 100%)`;
    }
    return color.N1;
  }};
  border: 1px solid
    ${(props) => {
      if (props.$isHighlighted) return color.B5;
      if (props.$isAgent) return props.$agentColor || "#4A90E2";
      return color.N4;
    }};
  border-radius: 8px;
  transition: all 0.15s;
  position: relative;

  /* Subtle left border for nested replies */
  ${(props) =>
    props.$depth > 0 &&
    `
    border-left: 3px solid ${color.N4};
  `}

  /* Accent strip for highlighted messages */
  ${(props) =>
    props.$isHighlighted &&
    `
    border-left: 3px solid ${color.B6};
  `}

  /* Accent strip for agent messages */
  ${(props) =>
    props.$isAgent &&
    !props.$isHighlighted &&
    `
    border-left: 3px solid ${props.$agentColor || "#4A90E2"};
  `}

  &:hover {
    border-color: ${(props) => {
      if (props.$isHighlighted) return color.B6;
      if (props.$isAgent) return props.$agentColor || "#4A90E2";
      return color.N5;
    }};
  }

  ${(props) =>
    props.$isDeleted &&
    `
    opacity: 0.7;
  `}

  @media (max-width: 480px) {
    padding: 0.75rem;
    gap: 0.5rem;
  }
`;

const VoteColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
`;

const ContentColumn = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const MessageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const MessageHeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
`;

const UserAvatar = styled.div<{ $isAgent?: boolean } & AgentColorProps>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${(props) =>
    props.$isAgent
      ? `linear-gradient(135deg, ${props.$agentColor || "#4A90E2"} 0%, ${
          props.$agentColor || "#4A90E2"
        }dd 100%)`
      : `linear-gradient(135deg, ${color.G6} 0%, ${color.G7} 100%)`};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;

  svg {
    width: 14px;
    height: 14px;
  }

  @media (max-width: 480px) {
    width: 24px;
    height: 24px;

    svg {
      width: 12px;
      height: 12px;
    }
  }
`;

const ReplyIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 11px;
  color: ${color.N6};
  padding: 0.25rem 0.5rem;
  background: ${color.N2};
  border-radius: 4px;
  margin-bottom: 0.25rem;

  svg {
    width: 12px;
    height: 12px;
  }

  strong {
    color: ${color.N8};
    font-weight: 600;
  }
`;

const UserInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  flex-wrap: wrap;
`;

const Username = styled.span`
  font-weight: 600;
  color: ${color.N9};
  font-size: 13px;
`;

const MessageTimestamp = styled.span`
  font-size: 12px;
  color: ${color.N6};
`;

const MessageActionsContainer = styled.div`
  position: relative;
`;

const MessageActionsButton = styled.button`
  background: none;
  border: none;
  color: ${color.N6};
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: all 0.15s;

  /* Larger touch target on mobile */
  @media (max-width: 600px) {
    width: 40px;
    height: 40px;
    justify-content: center;
  }

  &:hover {
    background: ${color.N3};
    color: ${color.N9};
  }

  &:active {
    background: ${color.N4};
  }
`;

const ActionsDropdown = styled.div<{ $isOpen: boolean }>`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 160px;
  background: ${color.N1};
  border: 1px solid ${color.N4};
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 100;
  opacity: ${(props) => (props.$isOpen ? 1 : 0)};
  visibility: ${(props) => (props.$isOpen ? "visible" : "hidden")};
  transform: ${(props) =>
    props.$isOpen ? "translateY(0)" : "translateY(-8px)"};
  transition: all 0.15s ease;

  /* Mobile: Bottom sheet style */
  @media (max-width: 600px) {
    position: fixed;
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    border-radius: 16px 16px 0 0;
    min-width: unset;
    transform: ${(props) =>
      props.$isOpen ? "translateY(0)" : "translateY(100%)"};
    /* Safe area for bottom */
    padding-bottom: env(safe-area-inset-bottom);
  }
`;

const DropdownBackdrop = styled.div<{ $isOpen: boolean }>`
  display: none;

  /* Mobile: Show backdrop for bottom sheet */
  @media (max-width: 600px) {
    display: ${(props) => (props.$isOpen ? "block" : "none")};
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 99;
  }
`;

const DropdownItem = styled.button<{ $variant?: "danger" }>`
  display: flex;
  align-items: center;
  gap: ${spacing.sm};
  width: 100%;
  padding: ${spacing.sm} ${spacing.md};
  border: none;
  background: transparent;
  color: ${(props) => (props.$variant === "danger" ? color.R7 : color.N9)};
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;

  /* Larger touch targets on mobile */
  @media (max-width: 600px) {
    padding: ${spacing.md};
    min-height: 52px;
    font-size: 16px;
  }

  &:first-child {
    border-radius: 8px 8px 0 0;
  }

  &:last-child {
    border-radius: 0 0 8px 8px;
  }

  &:only-child {
    border-radius: 8px;
  }

  &:hover {
    background: ${(props) =>
      props.$variant === "danger" ? color.R1 : color.N2};
  }

  &:active {
    background: ${(props) =>
      props.$variant === "danger" ? color.R2 : color.N3};
  }

  svg {
    flex-shrink: 0;
  }
`;

const DropdownDivider = styled.div`
  height: 1px;
  background: ${color.N4};
  margin: ${spacing.xs} 0;
`;

const MobileDropdownHeader = styled.div`
  display: none;

  @media (max-width: 600px) {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: ${spacing.md};
    border-bottom: 1px solid ${color.N4};

    &::before {
      content: "";
      width: 40px;
      height: 4px;
      background: ${color.N4};
      border-radius: 2px;
    }
  }
`;

const DeleteConfirmation = styled.div`
  padding: ${spacing.md};
  text-align: center;
`;

const DeleteConfirmText = styled.p`
  margin: 0 0 ${spacing.md} 0;
  color: ${color.N8};
  font-size: 14px;
`;

const DeleteConfirmButtons = styled.div`
  display: flex;
  gap: ${spacing.sm};
  justify-content: center;

  @media (max-width: 600px) {
    flex-direction: column-reverse;
  }
`;

const ConfirmButton = styled.button<{ $variant: "cancel" | "delete" }>`
  padding: ${spacing.sm} ${spacing.md};
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  @media (max-width: 600px) {
    padding: ${spacing.md};
    width: 100%;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  ${(props) =>
    props.$variant === "cancel" &&
    `
    background: ${color.N2};
    border: 1px solid ${color.N4};
    color: ${color.N8};

    &:hover:not(:disabled) {
      background: ${color.N3};
    }
  `}

  ${(props) =>
    props.$variant === "delete" &&
    `
    background: ${color.R6};
    border: none;
    color: white;

    &:hover:not(:disabled) {
      background: ${color.R7};
    }
  `}
`;

const MessageContent = styled.div<{ $isDeleted?: boolean }>`
  color: ${color.N9};
  line-height: 1.5;
  font-size: 13px;
  word-wrap: break-word;

  ${(props) =>
    props.$isDeleted &&
    `
    font-style: italic;
    color: ${color.N6};
  `}

  p {
    margin: 0 0 0.5rem 0;
    line-height: inherit;

    &:last-child {
      margin-bottom: 0;
    }
  }

  code {
    background: ${color.N2};
    border: 1px solid ${color.N4};
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.9em;
    font-family: monospace;
    color: ${color.R7};
  }

  pre {
    background: ${color.N2};
    border: 1px solid ${color.N4};
    padding: 0.5rem;
    border-radius: 4px;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  blockquote {
    border-left: 3px solid ${color.G5};
    padding-left: 0.75rem;
    margin: 0.5rem 0;
    color: ${color.N7};
  }
`;

const MessageFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const FooterButton = styled.button`
  background: transparent;
  border: 1px solid ${color.N4};
  color: ${color.N7};
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  transition: all 0.15s;

  &:hover {
    background: ${color.G1};
    border-color: ${color.G5};
    color: ${color.G7};
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const ReplyCount = styled.span`
  font-size: 11px;
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
 * Individual message component with support for nested replies.
 * Memoized to prevent unnecessary re-renders when parent thread updates.
 *
 * Part of Issue #686 - Mobile UI improvements for message actions and edit modal.
 */
export const MessageItem = React.memo(function MessageItem({
  message,
  isHighlighted = false,
  onReply,
  userBadges = [],
  canEdit = false,
  canDelete = false,
  corpusId,
  conversationId,
  onMessageUpdated,
  onMessageDeleted,
  currentUserId,
  parentAuthor,
}: MessageItemProps) {
  const isDeleted = !!message.deletedAt;
  const username = formatUsername(
    message.creator?.username,
    message.creator?.email
  );

  // Detect if message is from an agent (Issue #688)
  const agentData = useMemo(
    () => getAgentDisplayData(message.agentConfiguration),
    [message.agentConfiguration]
  );
  const isAgent = agentData !== null;

  // Memoize RGBA color values to avoid recalculation in styled-components
  const agentColors = useMemo(() => {
    if (!agentData) return undefined;
    return {
      color: agentData.color,
      bgStart: hexToRgba(agentData.color, 0.08),
      bgEnd: hexToRgba(agentData.color, 0.03),
      shadow: hexToRgba(agentData.color, 0.4),
      shadowHover: hexToRgba(agentData.color, 0.5),
    };
  }, [agentData]);

  // State for sources expansion and selection
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<
    number | undefined
  >(undefined);
  const setChatState = useSetAtom(chatSourcesAtom);

  // State for message actions dropdown
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Delete mutation
  const [deleteMessage, { loading: isDeleting }] = useMutation<
    DeleteMessageOutput,
    DeleteMessageInput
  >(DELETE_MESSAGE);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
        setShowDeleteConfirm(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  // Handle escape key to close dropdown
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
        setShowDeleteConfirm(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isDropdownOpen]);

  const toggleDropdown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDropdownOpen((prev) => !prev);
    setShowDeleteConfirm(false);
  }, []);

  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDropdownOpen(false);
    setIsEditModalOpen(true);
  }, []);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  }, []);

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  }, []);

  const handleConfirmDelete = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        const result = await deleteMessage({
          variables: { messageId: message.id },
        });
        if (result.data?.deleteMessage.ok) {
          setIsDropdownOpen(false);
          setShowDeleteConfirm(false);
          onMessageDeleted?.();
        }
      } catch (err) {
        console.error("Error deleting message:", err);
      }
    },
    [deleteMessage, message.id, onMessageDeleted]
  );

  const closeBackdrop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDropdownOpen(false);
    setShowDeleteConfirm(false);
  }, []);

  const hasActions = canEdit || canDelete;

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
      $isAgent={isAgent}
      $agentColor={agentColors?.color}
      $agentBgStart={agentColors?.bgStart}
      $agentBgEnd={agentColors?.bgEnd}
      role="article"
      aria-label={`Message from ${
        isAgent ? `${agentData.name} (AI Agent)` : username
      }`}
    >
      {/* Vote Column */}
      <VoteColumn>
        <VoteButtons
          messageId={message.id}
          upvoteCount={message.upvoteCount ?? 0}
          downvoteCount={message.downvoteCount ?? 0}
          userVote={message.userVote}
          senderId={message.creator?.id || ""}
          currentUserId={currentUserId}
          disabled={isDeleted}
        />
      </VoteColumn>

      {/* Content Column */}
      <ContentColumn>
        {/* Header */}
        <MessageHeader>
          <MessageHeaderLeft>
            <UserAvatar
              title={isAgent ? `${agentData.name} (AI Agent)` : username}
              $isAgent={isAgent}
              $agentColor={agentColors?.color}
              $agentShadow={agentColors?.shadow}
              $agentShadowHover={agentColors?.shadowHover}
            >
              {isAgent ? <Bot /> : <User />}
            </UserAvatar>
            <UserInfo>
              <Username>{username}</Username>
              <MessageBadges
                message={message}
                userBadges={userBadges}
                maxBadges={2}
                showTooltip={true}
              />
              <MessageTimestamp>
                <RelativeTime date={message.created} />
              </MessageTimestamp>
            </UserInfo>
          </MessageHeaderLeft>

          {/* Message Actions Dropdown */}
          {hasActions && !isDeleted && (
            <>
              <DropdownBackdrop
                $isOpen={isDropdownOpen}
                onClick={closeBackdrop}
              />
              <MessageActionsContainer ref={dropdownRef}>
                <MessageActionsButton
                  aria-label="Message actions"
                  aria-expanded={isDropdownOpen}
                  aria-haspopup="menu"
                  onClick={toggleDropdown}
                >
                  <MoreVertical size={16} />
                </MessageActionsButton>

                <ActionsDropdown $isOpen={isDropdownOpen} role="menu">
                  <MobileDropdownHeader />
                  {showDeleteConfirm ? (
                    <DeleteConfirmation>
                      <DeleteConfirmText>
                        Are you sure you want to delete this message?
                      </DeleteConfirmText>
                      <DeleteConfirmButtons>
                        <ConfirmButton
                          $variant="cancel"
                          onClick={handleCancelDelete}
                          disabled={isDeleting}
                        >
                          Cancel
                        </ConfirmButton>
                        <ConfirmButton
                          $variant="delete"
                          onClick={handleConfirmDelete}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Deleting..." : "Delete"}
                        </ConfirmButton>
                      </DeleteConfirmButtons>
                    </DeleteConfirmation>
                  ) : (
                    <>
                      {canEdit && (
                        <DropdownItem onClick={handleEdit} role="menuitem">
                          <Edit2 size={16} />
                          Edit message
                        </DropdownItem>
                      )}
                      {canEdit && canDelete && <DropdownDivider />}
                      {canDelete && (
                        <DropdownItem
                          onClick={handleDeleteClick}
                          $variant="danger"
                          role="menuitem"
                        >
                          <Trash2 size={16} />
                          Delete message
                        </DropdownItem>
                      )}
                    </>
                  )}
                </ActionsDropdown>
              </MessageActionsContainer>
            </>
          )}
        </MessageHeader>

        {/* Edit Message Modal */}
        <EditMessageModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          messageId={message.id}
          initialContent={message.content || ""}
          corpusId={corpusId}
          conversationId={conversationId}
          onSuccess={onMessageUpdated}
        />

        {/* Reply indicator */}
        {message.depth > 0 && parentAuthor && (
          <ReplyIndicator>
            <CornerDownRight />
            Replying to <strong>@{parentAuthor}</strong>
          </ReplyIndicator>
        )}

        {/* Content */}
        <MessageContent $isDeleted={isDeleted}>
          {isDeleted ? (
            <p>[This message has been deleted]</p>
          ) : (
            <MarkdownMessageRenderer
              content={message.content || ""}
              mentionedResources={message.mentionedResources ?? undefined}
            />
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
            <FooterButton
              onClick={handleReply}
              aria-label="Reply to this message"
            >
              <CornerDownRight />
              Reply
            </FooterButton>

            {message.children && message.children.length > 0 && (
              <ReplyCount>
                {message.children.length}{" "}
                {message.children.length === 1 ? "reply" : "replies"}
              </ReplyCount>
            )}
          </MessageFooter>
        )}
      </ContentColumn>
    </MessageContainer>
  );
});
