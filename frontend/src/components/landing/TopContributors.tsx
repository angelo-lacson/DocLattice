import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import {
  Trophy,
  ArrowRight,
  MessageSquare,
  Tag,
  Users,
  Award,
  Crown,
  Medal,
  Star,
  UserPlus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { color } from "../../theme/colors";
import { LeaderboardEntry } from "../../graphql/landing-queries";

interface TopContributorsProps {
  contributors: LeaderboardEntry[] | null;
  loading?: boolean;
}

const Section = styled.section`
  padding: 4rem 2rem;
  background: linear-gradient(
    135deg,
    ${color.N1} 0%,
    ${color.O1} 50%,
    ${color.N1} 100%
  );

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
  background: linear-gradient(135deg, ${color.O2} 0%, ${color.O3} 100%);
  border-radius: 14px;
  color: ${color.O7};
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
  color: ${color.O7};
  border: 1px solid ${color.O4};
  border-radius: 10px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${color.O1};
    border-color: ${color.O5};
    transform: translateX(2px);
  }

  svg {
    transition: transform 0.2s ease;
  }

  &:hover svg {
    transform: translateX(4px);
  }
`;

const ContributorsGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const ContributorCard = styled(motion.article)<{ $rank: number }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: white;
  border-radius: 16px;
  border: 1px solid ${color.N3};
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;

  ${(props) =>
    props.$rank === 1 &&
    `
    background: linear-gradient(135deg, ${color.O1} 0%, white 50%, ${color.O1} 100%);
    border-color: ${color.O3};
  `}

  ${(props) =>
    props.$rank === 2 &&
    `
    background: linear-gradient(135deg, ${color.N2} 0%, white 50%, ${color.N2} 100%);
    border-color: ${color.N4};
  `}

  ${(props) =>
    props.$rank === 3 &&
    `
    background: linear-gradient(135deg, ${color.O1} 0%, white 50%, ${color.O1} 100%);
    border-color: ${color.O2};
  `}

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }
`;

const RankBadge = styled.div<{ $rank: number }>`
  position: absolute;
  top: -8px;
  left: -8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 0.875rem;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);

  ${(props) =>
    props.$rank === 1
      ? `
    background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
    color: #8B4513;
  `
      : props.$rank === 2
      ? `
    background: linear-gradient(135deg, #C0C0C0 0%, #A0A0A0 100%);
    color: #4A4A4A;
  `
      : props.$rank === 3
      ? `
    background: linear-gradient(135deg, #CD7F32 0%, #8B4513 100%);
    color: white;
  `
      : `
    background: ${color.N3};
    color: ${color.N7};
  `}
`;

const RankIcon = styled.div<{ $rank: number }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  flex-shrink: 0;

  ${(props) =>
    props.$rank === 1
      ? `
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 165, 0, 0.2) 100%);
    color: #B8860B;
  `
      : props.$rank === 2
      ? `
    background: linear-gradient(135deg, rgba(192, 192, 192, 0.3) 0%, rgba(160, 160, 160, 0.3) 100%);
    color: #696969;
  `
      : props.$rank === 3
      ? `
    background: linear-gradient(135deg, rgba(205, 127, 50, 0.2) 0%, rgba(139, 69, 19, 0.2) 100%);
    color: #8B4513;
  `
      : `
    background: ${color.B1};
    color: ${color.B6};
  `}
`;

const ContributorInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ContributorName = styled.h3`
  font-size: 1.0625rem;
  font-weight: 700;
  color: ${color.N10};
  margin: 0 0 0.25rem 0;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const ContributorStats = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
  color: ${color.N6};
  flex-wrap: wrap;
`;

const StatItem = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;

  svg {
    color: ${color.N5};
  }
`;

const BadgesList = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 0.5rem;
  flex-wrap: wrap;
`;

const UserBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 0.75rem;
  background: ${(props) => props.$color}20;
`;

const ReputationBadge = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: linear-gradient(135deg, ${color.O2} 0%, ${color.O1} 100%);
  border-radius: 12px;
  min-width: 60px;
`;

const ReputationValue = styled.span`
  font-size: 1.25rem;
  font-weight: 800;
  color: ${color.O8};
  line-height: 1;
`;

const ReputationLabel = styled.span`
  font-size: 0.625rem;
  font-weight: 600;
  color: ${color.O6};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const SkeletonCard = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  background: white;
  border-radius: 16px;
  border: 1px solid ${color.N3};
`;

const SkeletonAvatar = styled.div`
  width: 56px;
  height: 56px;
  background: linear-gradient(
    90deg,
    ${color.N3} 25%,
    ${color.N4} 50%,
    ${color.N3} 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 16px;
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
  background: white;
  border-radius: 20px;
  border: 2px dashed ${color.O3};
`;

const EmptyStateIcon = styled.div`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${color.O2} 0%, ${color.O3} 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  color: ${color.O7};
`;

const EmptyStateTitle = styled.h3`
  font-size: 1.375rem;
  font-weight: 700;
  color: ${color.N10};
  margin: 0 0 0.75rem 0;
`;

const EmptyStateDescription = styled.p`
  font-size: 1rem;
  color: ${color.N6};
  margin: 0 0 1.5rem 0;
  max-width: 400px;
  line-height: 1.6;
`;

const EmptyStateCTA = styled.button`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: linear-gradient(135deg, ${color.O6} 0%, ${color.O7} 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(230, 126, 34, 0.3);
  }
`;

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown size={28} />;
    case 2:
      return <Medal size={26} />;
    case 3:
      return <Award size={26} />;
    default:
      return <Star size={24} />;
  }
}

export const TopContributors: React.FC<TopContributorsProps> = ({
  contributors,
  loading,
}) => {
  const navigate = useNavigate();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
  };

  const handleContributorClick = (contributor: LeaderboardEntry) => {
    if (contributor.slug) {
      navigate(`/users/${contributor.slug}`);
    } else {
      // Fallback to leaderboard if user has no slug
      navigate("/leaderboard");
    }
  };

  if (loading) {
    return (
      <Section>
        <Container>
          <SectionHeader>
            <HeaderLeft>
              <IconBadge>
                <Trophy size={24} />
              </IconBadge>
              <TitleGroup>
                <SectionTitle>Top Contributors</SectionTitle>
                <SectionSubtitle>Community leaders and experts</SectionSubtitle>
              </TitleGroup>
            </HeaderLeft>
          </SectionHeader>
          <ContributorsGrid>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i}>
                <SkeletonAvatar />
                <SkeletonContent>
                  <SkeletonLine $width="60%" $height="18px" />
                  <SkeletonLine $width="80%" />
                </SkeletonContent>
              </SkeletonCard>
            ))}
          </ContributorsGrid>
        </Container>
      </Section>
    );
  }

  if (!contributors || contributors.length === 0) {
    return (
      <Section>
        <Container>
          <SectionHeader>
            <HeaderLeft>
              <IconBadge>
                <Trophy size={24} />
              </IconBadge>
              <TitleGroup>
                <SectionTitle>Top Contributors</SectionTitle>
                <SectionSubtitle>Community leaders and experts</SectionSubtitle>
              </TitleGroup>
            </HeaderLeft>
          </SectionHeader>
          <EmptyStateContainer
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <EmptyStateIcon>
              <Trophy size={36} />
            </EmptyStateIcon>
            <EmptyStateTitle>Be the first contributor</EmptyStateTitle>
            <EmptyStateDescription>
              Join our community and start contributing! Annotate documents,
              participate in discussions, and earn reputation to climb the
              leaderboard.
            </EmptyStateDescription>
            <EmptyStateCTA onClick={() => navigate("/corpuses")}>
              <UserPlus size={20} />
              Start Contributing
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
              <Trophy size={24} />
            </IconBadge>
            <TitleGroup>
              <SectionTitle>Top Contributors</SectionTitle>
              <SectionSubtitle>Community leaders and experts</SectionSubtitle>
            </TitleGroup>
          </HeaderLeft>
          <ViewAllButton onClick={() => navigate("/leaderboard")}>
            Full Leaderboard
            <ArrowRight size={18} />
          </ViewAllButton>
        </SectionHeader>

        <ContributorsGrid
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {contributors.slice(0, 6).map((contributor, index) => {
            const rank = index + 1;
            return (
              <ContributorCard
                key={contributor.id}
                $rank={rank}
                variants={cardVariants}
                onClick={() => handleContributorClick(contributor)}
              >
                {rank <= 3 && <RankBadge $rank={rank}>{rank}</RankBadge>}

                <RankIcon $rank={rank}>{getRankIcon(rank)}</RankIcon>

                <ContributorInfo>
                  <ContributorName>
                    {contributor.username || "Anonymous"}
                  </ContributorName>
                  <ContributorStats>
                    <StatItem>
                      <MessageSquare size={14} />
                      {contributor.totalMessages || 0}
                    </StatItem>
                    <StatItem>
                      <Tag size={14} />
                      {contributor.totalAnnotationsCreated || 0}
                    </StatItem>
                    <StatItem>
                      <Users size={14} />
                      {contributor.totalThreadsCreated || 0} threads
                    </StatItem>
                  </ContributorStats>
                  {contributor.badges?.edges &&
                    contributor.badges.edges.length > 0 && (
                      <BadgesList>
                        {contributor.badges.edges
                          .slice(0, 3)
                          .map(({ node: { badge } }) => (
                            <UserBadge
                              key={badge.id}
                              $color={badge.color || color.B5}
                              title={badge.name}
                            >
                              {badge.icon || "🏆"}
                            </UserBadge>
                          ))}
                      </BadgesList>
                    )}
                </ContributorInfo>

                <ReputationBadge>
                  <ReputationValue>
                    {contributor.reputationGlobal || 0}
                  </ReputationValue>
                  <ReputationLabel>Rep</ReputationLabel>
                </ReputationBadge>
              </ContributorCard>
            );
          })}
        </ContributorsGrid>
      </Container>
    </Section>
  );
};
