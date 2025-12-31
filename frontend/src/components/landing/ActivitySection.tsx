/**
 * ActivitySection Component
 *
 * Displays recent discussions in a compact activity feed format for the landing/discover page.
 * Uses the ActivityFeed component from @opencontracts/ui to show user activity.
 *
 * Features:
 * - Transforms recent discussions into activity items
 * - Shows user avatars with initials and consistent colors
 * - Displays relative timestamps (e.g., "2h ago")
 * - Clickable discussion titles that navigate to the appropriate view
 * - Loading skeleton state
 * - Empty state with CTA to start a discussion
 * - "View all discussions" link
 *
 * @example
 * <ActivitySection
 *   discussions={data?.conversations?.edges || null}
 *   loading={loading}
 *   totalCount={data?.conversations?.totalCount}
 * />
 */
import React from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { ActivityFeed } from "@opencontracts/ui/src";
import type { ActivityItemData } from "@opencontracts/ui/src";
import { MessageSquare, Plus } from "lucide-react";
import { color } from "../../theme/colors";
import { GetRecentDiscussionsOutput } from "../../graphql/landing-queries";
import { getCorpusThreadUrl } from "../../utils/navigationUtils";

interface ActivitySectionProps {
  discussions: GetRecentDiscussionsOutput["conversations"]["edges"] | null;
  loading?: boolean;
  totalCount?: number;
}

const Section = styled.section`
  padding: 4rem 2rem;
  background: linear-gradient(180deg, ${color.N1} 0%, ${color.N2} 100%);

  @media (max-width: 768px) {
    padding: 3rem 1.5rem;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const IconBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, ${color.G2} 0%, ${color.G3} 100%);
  border-radius: 14px;
  color: ${color.G7};
`;

const TitleGroup = styled.div`
  display: flex;
  flex-direction: column;
`;

const SectionTitle = styled.h2`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${color.N10};
  margin: 0;
  letter-spacing: -0.02em;
`;

const SectionSubtitle = styled.p`
  font-size: 0.9375rem;
  color: ${color.N6};
  margin: 0.25rem 0 0 0;
`;

const FeedWrapper = styled.div`
  background: white;
  border-radius: 16px;
  border: 1px solid ${color.N3};
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
`;

const SkeletonFeed = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const SkeletonItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid ${color.N3};

  &:last-child {
    border-bottom: none;
  }
`;

const SkeletonAvatar = styled.div`
  width: 40px;
  height: 40px;
  background: linear-gradient(
    90deg,
    ${color.N3} 25%,
    ${color.N4} 50%,
    ${color.N3} 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 50%;
  flex-shrink: 0;

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const SkeletonContent = styled.div`
  flex: 1;
`;

const SkeletonLine = styled.div<{ $width?: string; $height?: string }>`
  width: ${(props) => props.$width || "100%"};
  height: ${(props) => props.$height || "12px"};
  background: linear-gradient(
    90deg,
    ${color.N3} 25%,
    ${color.N4} 50%,
    ${color.N3} 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin-bottom: 0.5rem;
`;

const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
  background: linear-gradient(
    135deg,
    ${color.G1} 0%,
    ${color.T1} 50%,
    ${color.B1} 100%
  );
  border-radius: 20px;
  border: 2px dashed ${color.N4};
`;

const EmptyStateIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: white;
  border-radius: 20px;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  color: ${color.G6};
`;

const EmptyStateTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${color.N10};
  margin: 0 0 0.5rem 0;
`;

const EmptyStateDescription = styled.p`
  font-size: 1rem;
  color: ${color.N7};
  margin: 0 0 1.5rem 0;
  max-width: 400px;
  line-height: 1.6;
`;

const EmptyStateCTA = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: linear-gradient(135deg, ${color.G5} 0%, ${color.G6} 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(30, 194, 142, 0.4);
  }
`;

/**
 * Formats a relative time string from an ISO date string
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 30) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } else if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMins > 0) {
    return `${diffMins}m ago`;
  } else {
    return "Just now";
  }
}

/**
 * Formats username, handling OAuth identifiers and long names
 */
function formatUsername(username: string | undefined): string {
  if (!username) return "Anonymous";
  // Handle OAuth IDs like "google-oauth2|114688257717759010643"
  if (username.includes("|")) {
    const provider = username.split("|")[0];
    if (provider.includes("google")) return "Google User";
    if (provider.includes("github")) return "GitHub User";
    if (provider.includes("auth0")) return "User";
    return "User";
  }
  // Truncate very long usernames
  if (username.length > 20) {
    return username.substring(0, 17) + "...";
  }
  return username;
}

/**
 * Gets initials from username for avatar display
 */
function getInitials(username?: string): string {
  if (!username) return "?";
  // Handle OAuth usernames
  if (username.includes("|")) {
    const provider = username.split("|")[0];
    if (provider.includes("google")) return "G";
    if (provider.includes("github")) return "GH";
    return "U";
  }
  return username.substring(0, 2).toUpperCase();
}

/**
 * Gets consistent avatar color for a user based on their ID
 */
function getAvatarColor(userId?: string): string {
  const colors = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
  ];
  if (!userId) return colors[0];
  const hash = userId.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

export const ActivitySection: React.FC<ActivitySectionProps> = ({
  discussions,
  loading,
  totalCount,
}) => {
  const navigate = useNavigate();

  const handleViewAll = () => {
    navigate("/discussions");
  };

  // Transform discussions to activity items
  const activityItems: ActivityItemData[] =
    discussions?.map(({ node: discussion }) => {
      // Generate target URL for the discussion
      let targetUrl = "#";
      const corpus = discussion.chatWithCorpus;
      if (corpus) {
        // Corpus-scoped thread → link to full corpus thread view
        targetUrl = getCorpusThreadUrl(corpus, discussion.id);
      } else {
        // General discussion (no corpus) → link to global discussions page
        targetUrl = "/discussions";
      }

      return {
        id: discussion.id,
        name: formatUsername(discussion.creator?.username),
        initials: getInitials(discussion.creator?.username),
        action: "started discussion",
        target: discussion.title || "Untitled Discussion",
        targetUrl: targetUrl !== "#" ? targetUrl : undefined,
        time: formatRelativeTime(discussion.updatedAt),
        avatarColor: getAvatarColor(discussion.creator?.id),
      };
    }) || [];

  if (loading) {
    return (
      <Section>
        <Container>
          <SectionHeader>
            <HeaderLeft>
              <IconBadge>
                <MessageSquare size={24} />
              </IconBadge>
              <TitleGroup>
                <SectionTitle>Recent Activity</SectionTitle>
                <SectionSubtitle>
                  What's happening in the community
                </SectionSubtitle>
              </TitleGroup>
            </HeaderLeft>
          </SectionHeader>
          <FeedWrapper>
            <SkeletonFeed>
              {[1, 2, 3, 4, 5].map((i) => (
                <SkeletonItem key={i}>
                  <SkeletonAvatar />
                  <SkeletonContent>
                    <SkeletonLine $width="70%" $height="14px" />
                    <SkeletonLine $width="40%" $height="10px" />
                  </SkeletonContent>
                </SkeletonItem>
              ))}
            </SkeletonFeed>
          </FeedWrapper>
        </Container>
      </Section>
    );
  }

  // Filter out any null nodes
  const validDiscussions = discussions?.filter((edge) => edge?.node) || [];

  if (validDiscussions.length === 0) {
    return (
      <Section>
        <Container>
          <SectionHeader>
            <HeaderLeft>
              <IconBadge>
                <MessageSquare size={24} />
              </IconBadge>
              <TitleGroup>
                <SectionTitle>Recent Activity</SectionTitle>
                <SectionSubtitle>
                  What's happening in the community
                </SectionSubtitle>
              </TitleGroup>
            </HeaderLeft>
          </SectionHeader>
          <FeedWrapper>
            <EmptyStateContainer>
              <EmptyStateIcon>
                <MessageSquare size={36} />
              </EmptyStateIcon>
              <EmptyStateTitle>No recent activity</EmptyStateTitle>
              <EmptyStateDescription>
                Be the first to start a discussion! Share your thoughts, ask
                questions, and collaborate with the community.
              </EmptyStateDescription>
              <EmptyStateCTA onClick={() => navigate("/discussions")}>
                <Plus size={20} />
                Start Discussion
              </EmptyStateCTA>
            </EmptyStateContainer>
          </FeedWrapper>
        </Container>
      </Section>
    );
  }

  return (
    <Section>
      <Container>
        <SectionHeader>
          <HeaderLeft>
            <IconBadge>
              <MessageSquare size={24} />
            </IconBadge>
            <TitleGroup>
              <SectionTitle>Recent Activity</SectionTitle>
              <SectionSubtitle>
                {totalCount
                  ? `${totalCount.toLocaleString()} discussions happening now`
                  : "What's happening in the community"}
              </SectionSubtitle>
            </TitleGroup>
          </HeaderLeft>
        </SectionHeader>
        <FeedWrapper>
          <ActivityFeed
            items={activityItems}
            dividers={true}
            viewAllText="View all discussions"
            onViewAll={handleViewAll}
          />
        </FeedWrapper>
      </Container>
    </Section>
  );
};
