import React from "react";
import styled from "styled-components";
import * as LucideIcons from "lucide-react";
import { useState, useRef } from "react";
import {
  ChatMessageType,
  UserBadgeType,
  AgentConfigurationType,
} from "../../types/graphql-api";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";

const BadgeContainer = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  flex-wrap: wrap;
`;

const MiniStyledBadge = styled.div<{ $badgeColor: string }>`
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  padding: 0.25em 0.5em;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.7em;
  background: ${(props) => props.$badgeColor};
  color: #ffffff;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
  cursor: default;
  white-space: nowrap;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }
`;

const BadgeContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5em;
  max-width: 200px;
`;

const BadgeTitle = styled.div`
  font-weight: 700;
  font-size: 1em;
  color: ${OS_LEGAL_COLORS.textPrimary};
`;

const BadgeDescription = styled.div`
  font-size: 0.85em;
  color: ${OS_LEGAL_COLORS.textSecondary};
  line-height: 1.4;
`;

const BadgeMetadata = styled.div`
  font-size: 0.75em;
  color: ${OS_LEGAL_COLORS.textMuted};
  margin-top: 0.3em;
  border-top: 1px solid ${OS_LEGAL_COLORS.border};
  padding-top: 0.5em;
`;

const TooltipWrapper = styled.div`
  position: relative;
  display: inline-flex;
`;

const TooltipPopup = styled.div`
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 0.75em;
  border-radius: 10px;
  background: white;
  box-shadow: 0 3px 15px rgba(0, 0, 0, 0.15);
  min-width: 180px;
  max-width: 220px;
  pointer-events: auto;

  &::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: white;
  }
`;

interface BadgeDisplayData {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  badgeType?: string;
  isAutoAwarded?: boolean;
  awardedAt?: string;
  awardedBy?: { username: string };
  corpus?: { title: string };
}

interface AgentBadgeDisplayData {
  id: string;
  name: string;
  description?: string;
  icon: string;
  color: string;
  label: string;
}

/**
 * Badge display component for both user badges and agent badges
 * Displays small pill-style badges next to usernames in chat/thread messages
 */
export interface MessageBadgesProps {
  message: ChatMessageType;
  userBadges?: UserBadgeType[];
  maxBadges?: number;
  size?: "mini" | "tiny" | "small";
  showTooltip?: boolean;
}

/**
 * Extracts badge display data from agent configuration
 */
function getAgentBadgeData(
  agentConfig: AgentConfigurationType
): AgentBadgeDisplayData | null {
  if (!agentConfig.badgeConfig) return null;

  const badgeConfig = agentConfig.badgeConfig as any;

  return {
    id: agentConfig.id,
    name: agentConfig.name,
    description: agentConfig.description || undefined,
    icon: badgeConfig.icon || "Bot",
    color: badgeConfig.color || OS_LEGAL_COLORS.primaryBlue,
    label: badgeConfig.label || agentConfig.name,
  };
}

/**
 * Renders a single badge with optional tooltip
 */
function BadgeItem({
  badge,
  showTooltip,
}: {
  badge: BadgeDisplayData | AgentBadgeDisplayData;
  showTooltip: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  // Dynamically get the icon component from lucide-react
  const IconComponent = (LucideIcons[badge.icon as keyof typeof LucideIcons] ||
    LucideIcons.Award) as React.ComponentType<{ size: number }>;

  const badgeElement = (
    <MiniStyledBadge $badgeColor={badge.color || "#05313d"}>
      <IconComponent size={10} />
      {"label" in badge ? badge.label : badge.name}
    </MiniStyledBadge>
  );

  if (!showTooltip) {
    return badgeElement;
  }

  return (
    <TooltipWrapper
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {badgeElement}
      {isHovered && (
        <TooltipPopup>
          <BadgeContent>
            <BadgeTitle>{badge.name}</BadgeTitle>
            <BadgeDescription>{badge.description}</BadgeDescription>
            {"badgeType" in badge && (
              <BadgeMetadata>
                {badge.badgeType === "CORPUS" && badge.corpus && (
                  <div>Corpus: {badge.corpus.title}</div>
                )}
                {badge.badgeType === "GLOBAL" && <div>Global Badge</div>}
                {badge.isAutoAwarded && <div>Auto-awarded</div>}
                {badge.awardedAt && (
                  <div>
                    Awarded: {new Date(badge.awardedAt).toLocaleDateString()}
                  </div>
                )}
                {badge.awardedBy && <div>By: {badge.awardedBy.username}</div>}
              </BadgeMetadata>
            )}
          </BadgeContent>
        </TooltipPopup>
      )}
    </TooltipWrapper>
  );
}

/**
 * Main component that displays badges for both users and bots
 */
export const MessageBadges: React.FC<MessageBadgesProps> = ({
  message,
  userBadges = [],
  maxBadges = 3,
  showTooltip = true,
}) => {
  // Check if this is a bot/agent message
  const agentBadge = message.agentConfiguration
    ? getAgentBadgeData(message.agentConfiguration)
    : null;

  // Convert UserBadgeType to BadgeDisplayData
  const badgeDisplayData: BadgeDisplayData[] = userBadges
    .slice(0, maxBadges)
    .map((userBadge) => ({
      id: userBadge.id,
      name: userBadge.badge.name,
      description: userBadge.badge.description,
      icon: userBadge.badge.icon,
      color: userBadge.badge.color,
      badgeType: userBadge.badge.badgeType,
      isAutoAwarded: userBadge.badge.isAutoAwarded,
      awardedAt: userBadge.awardedAt,
      awardedBy: userBadge.awardedBy
        ? { username: userBadge.awardedBy.username || "" }
        : undefined,
      corpus: userBadge.corpus
        ? { title: userBadge.corpus.title || "" }
        : undefined,
    }));

  // If no badges to display, return null
  if (!agentBadge && badgeDisplayData.length === 0) {
    return null;
  }

  return (
    <BadgeContainer>
      {/* Agent badge (if present) */}
      {agentBadge && <BadgeItem badge={agentBadge} showTooltip={showTooltip} />}

      {/* User badges */}
      {badgeDisplayData.map((badge) => (
        <BadgeItem key={badge.id} badge={badge} showTooltip={showTooltip} />
      ))}

      {/* Show "+X more" if there are more badges */}
      {userBadges.length > maxBadges && (
        <MiniStyledBadge
          $badgeColor={OS_LEGAL_COLORS.textSecondary}
          title="More badges available"
        >
          +{userBadges.length - maxBadges} more
        </MiniStyledBadge>
      )}
    </BadgeContainer>
  );
};
