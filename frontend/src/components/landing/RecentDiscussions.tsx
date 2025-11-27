import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import {
  MessageSquare,
  ArrowRight,
  Clock,
  User,
  MessageCircle,
  Pin,
  Lock,
  ChevronRight,
  Folder,
  Plus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { color } from "../../theme/colors";
import { GetRecentDiscussionsOutput } from "../../graphql/landing-queries";
import { getCorpusThreadUrl } from "../../utils/navigationUtils";

interface RecentDiscussionsProps {
  discussions: GetRecentDiscussionsOutput["conversations"]["edges"] | null;
  loading?: boolean;
  totalCount?: number;
}

const Section = styled.section`
  padding: 4rem 2rem;
  background: linear-gradient(180deg, ${color.N2} 0%, ${color.N1} 100%);

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

const ViewAllButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: transparent;
  color: ${color.G7};
  border: 1px solid ${color.G4};
  border-radius: 10px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${color.G1};
    border-color: ${color.G5};
    transform: translateX(2px);
  }

  svg {
    transition: transform 0.2s ease;
  }

  &:hover svg {
    transform: translateX(4px);
  }
`;

const DiscussionList = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const DiscussionCard = styled(motion.article)`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: white;
  border-radius: 16px;
  border: 1px solid ${color.N3};
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateX(4px);
    border-color: ${color.G4};
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05), 0 0 0 1px ${color.G3};
  }

  @media (max-width: 640px) {
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
  }
`;

const DiscussionIcon = styled.div<{ $isPinned?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: ${(props) =>
    props.$isPinned
      ? `linear-gradient(135deg, ${color.O2} 0%, ${color.O3} 100%)`
      : `linear-gradient(135deg, ${color.G1} 0%, ${color.G2} 100%)`};
  border-radius: 12px;
  color: ${(props) => (props.$isPinned ? color.O7 : color.G6)};
  flex-shrink: 0;

  @media (max-width: 640px) {
    width: 40px;
    height: 40px;
    border-radius: 10px;
  }
`;

const DiscussionContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const DiscussionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
  flex-wrap: wrap;
`;

const DiscussionTitle = styled.h3`
  font-size: 1.0625rem;
  font-weight: 600;
  color: ${color.N10};
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Badge = styled.span<{ $type: "pinned" | "locked" }>`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: 100px;
  ${(props) =>
    props.$type === "pinned"
      ? `background: ${color.O2}; color: ${color.O8};`
      : `background: ${color.N3}; color: ${color.N7};`}
`;

const DiscussionMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
  color: ${color.N6};
  flex-wrap: wrap;

  @media (max-width: 640px) {
    gap: 0.5rem;
    font-size: 0.75rem;
  }
`;

const MetaItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;

  svg {
    flex-shrink: 0;
  }
`;

const CorpusLink = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: ${color.P1};
  color: ${color.P7};
  border-radius: 100px;
  font-weight: 500;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Description = styled.p`
  font-size: 0.875rem;
  line-height: 1.5;
  color: ${color.N7};
  margin: 0.5rem 0 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;

  @media (max-width: 640px) {
    -webkit-line-clamp: 1;
  }
`;

const DiscussionAction = styled.div`
  display: flex;
  align-items: center;
  color: ${color.G6};
  opacity: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
  align-self: center;

  ${DiscussionCard}:hover & {
    opacity: 1;
    transform: translateX(4px);
  }

  @media (max-width: 640px) {
    display: none;
  }
`;

const SkeletonCard = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: white;
  border-radius: 16px;
  border: 1px solid ${color.N3};
`;

const SkeletonIcon = styled.div`
  width: 48px;
  height: 48px;
  background: linear-gradient(
    90deg,
    ${color.N3} 25%,
    ${color.N4} 50%,
    ${color.N3} 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 12px;
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
  height: ${(props) => props.$height || "14px"};
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

const EmptyStateContainer = styled(motion.div)`
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
  border-radius: 24px;
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

export const RecentDiscussions: React.FC<RecentDiscussionsProps> = ({
  discussions,
  loading,
  totalCount,
}) => {
  const navigate = useNavigate();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
  };

  const handleDiscussionClick = (
    discussion: GetRecentDiscussionsOutput["conversations"]["edges"][0]["node"]
  ) => {
    const corpus = discussion.chatWithCorpus;
    if (corpus) {
      // Corpus-scoped thread → navigate to full corpus thread view
      const url = getCorpusThreadUrl(corpus, discussion.id);
      if (url !== "#") {
        navigate(url);
      }
    } else {
      // General discussion (no corpus) → navigate to global discussions page
      // The user can find and interact with the thread there
      navigate("/discussions");
    }
  };

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
                <SectionTitle>Recent Discussions</SectionTitle>
                <SectionSubtitle>Join the conversation</SectionSubtitle>
              </TitleGroup>
            </HeaderLeft>
          </SectionHeader>
          <DiscussionList>
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i}>
                <SkeletonIcon />
                <SkeletonContent>
                  <SkeletonLine $width="60%" $height="18px" />
                  <SkeletonLine $width="80%" />
                  <SkeletonLine $width="40%" />
                </SkeletonContent>
              </SkeletonCard>
            ))}
          </DiscussionList>
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
                <SectionTitle>Recent Discussions</SectionTitle>
                <SectionSubtitle>Join the conversation</SectionSubtitle>
              </TitleGroup>
            </HeaderLeft>
          </SectionHeader>
          <EmptyStateContainer
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <EmptyStateIcon>
              <MessageCircle size={36} />
            </EmptyStateIcon>
            <EmptyStateTitle>No discussions yet</EmptyStateTitle>
            <EmptyStateDescription>
              Start the conversation! Share your thoughts, ask questions, and
              collaborate with the community on document analysis.
            </EmptyStateDescription>
            <EmptyStateCTA onClick={() => navigate("/discussions")}>
              <Plus size={20} />
              Start Discussion
            </EmptyStateCTA>
          </EmptyStateContainer>
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
              <SectionTitle>Recent Discussions</SectionTitle>
              <SectionSubtitle>
                {totalCount
                  ? `${totalCount.toLocaleString()} conversations happening now`
                  : "Join the conversation"}
              </SectionSubtitle>
            </TitleGroup>
          </HeaderLeft>
          <ViewAllButton onClick={() => navigate("/discussions")}>
            View All
            <ArrowRight size={18} />
          </ViewAllButton>
        </SectionHeader>

        <DiscussionList
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {validDiscussions.slice(0, 5).map(({ node: discussion }, index) => (
            <DiscussionCard
              key={discussion.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: index * 0.06 }}
              onClick={() => handleDiscussionClick(discussion)}
            >
              <DiscussionIcon $isPinned={discussion.isPinned}>
                {discussion.isPinned ? (
                  <Pin size={22} />
                ) : (
                  <MessageCircle size={22} />
                )}
              </DiscussionIcon>

              <DiscussionContent>
                <DiscussionHeader>
                  <DiscussionTitle>
                    {discussion.title || "Untitled Discussion"}
                  </DiscussionTitle>
                  {discussion.isPinned && (
                    <Badge $type="pinned">
                      <Pin size={10} /> Pinned
                    </Badge>
                  )}
                  {discussion.isLocked && (
                    <Badge $type="locked">
                      <Lock size={10} /> Locked
                    </Badge>
                  )}
                </DiscussionHeader>

                <DiscussionMeta>
                  <MetaItem>
                    <User size={14} />
                    {formatUsername(discussion.creator?.username)}
                  </MetaItem>
                  <MetaItem>
                    <Clock size={14} />
                    {formatRelativeTime(discussion.updatedAt)}
                  </MetaItem>
                  <MetaItem>
                    <MessageCircle size={14} />
                    {discussion.chatMessages?.totalCount || 0} replies
                  </MetaItem>
                  {discussion.chatWithCorpus && (
                    <CorpusLink>
                      <Folder size={12} />
                      {discussion.chatWithCorpus.title}
                    </CorpusLink>
                  )}
                </DiscussionMeta>

                {discussion.description && (
                  <Description>{discussion.description}</Description>
                )}
              </DiscussionContent>

              <DiscussionAction>
                <ChevronRight size={20} />
              </DiscussionAction>
            </DiscussionCard>
          ))}
        </DiscussionList>
      </Container>
    </Section>
  );
};
