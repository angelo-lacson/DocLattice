import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import {
  Database,
  FileText,
  Users,
  MessageSquare,
  ArrowRight,
  Globe,
  Lock,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { color } from "../../theme/colors";
import { GetTrendingCorpusesOutput } from "../../graphql/landing-queries";

interface TrendingCorpusesProps {
  corpuses: GetTrendingCorpusesOutput["corpuses"]["edges"] | null;
  loading?: boolean;
}

const Section = styled.section`
  padding: 4rem 2rem;
  background: ${color.N1};

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
  background: linear-gradient(135deg, ${color.P2} 0%, ${color.P3} 100%);
  border-radius: 14px;
  color: ${color.P7};
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
  color: ${color.B6};
  border: 1px solid ${color.B4};
  border-radius: 10px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${color.B1};
    border-color: ${color.B5};
    transform: translateX(2px);
  }

  svg {
    transition: transform 0.2s ease;
  }

  &:hover svg {
    transform: translateX(4px);
  }
`;

const CorpusGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const CorpusCard = styled(motion.article)`
  position: relative;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 20px;
  border: 1px solid ${color.N3};
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-4px);
    border-color: ${color.B4};
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08),
      0 4px 12px rgba(35, 118, 229, 0.06);
  }
`;

const CardHeader = styled.div<{ $hasImage?: boolean }>`
  position: relative;
  height: 140px;
  background: ${(props) =>
    props.$hasImage
      ? color.N3
      : `linear-gradient(135deg, ${color.P2} 0%, ${color.B2} 50%, ${color.T2} 100%)`};
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

const CardHeaderPattern = styled.div`
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
`;

const CorpusIcon = styled.div<{ $isImage?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${(props) => (props.$isImage ? "100%" : "64px")};
  height: ${(props) => (props.$isImage ? "100%" : "64px")};
  background: ${(props) => (props.$isImage ? "transparent" : "white")};
  border-radius: ${(props) => (props.$isImage ? "0" : "16px")};
  box-shadow: ${(props) =>
    props.$isImage ? "none" : "0 4px 20px rgba(0, 0, 0, 0.1)"};
  color: ${color.P6};
  font-size: 1.5rem;
  overflow: hidden;
`;

const VisibilityBadge = styled.div<{ $isPublic: boolean }>`
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: ${(props) => (props.$isPublic ? color.G2 : color.N3)};
  color: ${(props) => (props.$isPublic ? color.G8 : color.N7)};
  border-radius: 100px;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const CardBody = styled.div`
  flex: 1;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
`;

const CorpusTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${color.N10};
  margin: 0 0 0.5rem 0;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const CreatorInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: ${color.N6};
  margin-bottom: 0.75rem;
`;

const CorpusDescription = styled.p`
  font-size: 0.9375rem;
  line-height: 1.6;
  color: ${color.N7};
  margin: 0 0 1rem 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
`;

const CardStats = styled.div`
  display: flex;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid ${color.N3};
`;

const StatItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: ${color.N6};

  svg {
    color: ${color.N5};
  }
`;

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 1rem 1.5rem;
  background: ${color.N2};
  border-top: 1px solid ${color.N3};
`;

const ViewButton = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${color.B6};
  transition: all 0.2s ease;

  ${CorpusCard}:hover & {
    transform: translateX(4px);
  }
`;

const SkeletonCard = styled.div`
  background: white;
  border-radius: 20px;
  border: 1px solid ${color.N3};
  overflow: hidden;
`;

const SkeletonHeader = styled.div`
  height: 120px;
  background: linear-gradient(
    90deg,
    ${color.N3} 25%,
    ${color.N4} 50%,
    ${color.N3} 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const SkeletonBody = styled.div`
  padding: 1.5rem;
`;

const SkeletonLine = styled.div<{ $width?: string; $height?: string }>`
  width: ${(props) => props.$width || "100%"};
  height: ${(props) => props.$height || "16px"};
  background: linear-gradient(
    90deg,
    ${color.N3} 25%,
    ${color.N4} 50%,
    ${color.N3} 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  margin-bottom: 0.75rem;
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
    ${color.P1} 0%,
    ${color.B1} 50%,
    ${color.T1} 100%
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
  color: ${color.P6};
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
  background: linear-gradient(135deg, ${color.P5} 0%, ${color.P6} 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(136, 122, 222, 0.4);
  }
`;

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

export const TrendingCorpuses: React.FC<TrendingCorpusesProps> = ({
  corpuses,
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
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut",
      },
    },
  };

  const handleCorpusClick = (
    corpus: GetTrendingCorpusesOutput["corpuses"]["edges"][0]["node"]
  ) => {
    if (corpus.creator?.slug && corpus.slug) {
      navigate(`/c/${corpus.creator.slug}/${corpus.slug}`);
    }
  };

  if (loading) {
    return (
      <Section>
        <Container>
          <SectionHeader>
            <HeaderLeft>
              <IconBadge>
                <Database size={24} />
              </IconBadge>
              <TitleGroup>
                <SectionTitle>Trending Collections</SectionTitle>
                <SectionSubtitle>
                  Popular document collections from the community
                </SectionSubtitle>
              </TitleGroup>
            </HeaderLeft>
          </SectionHeader>
          <CorpusGrid>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonCard key={i}>
                <SkeletonHeader />
                <SkeletonBody>
                  <SkeletonLine $width="70%" $height="20px" />
                  <SkeletonLine $width="40%" $height="14px" />
                  <SkeletonLine $width="100%" />
                  <SkeletonLine $width="85%" />
                </SkeletonBody>
              </SkeletonCard>
            ))}
          </CorpusGrid>
        </Container>
      </Section>
    );
  }

  // Filter out any null nodes
  const validCorpuses = corpuses?.filter((edge) => edge?.node) || [];

  if (validCorpuses.length === 0) {
    return (
      <Section>
        <Container>
          <SectionHeader>
            <HeaderLeft>
              <IconBadge>
                <Database size={24} />
              </IconBadge>
              <TitleGroup>
                <SectionTitle>Trending Collections</SectionTitle>
                <SectionSubtitle>
                  Popular document collections from the community
                </SectionSubtitle>
              </TitleGroup>
            </HeaderLeft>
          </SectionHeader>
          <EmptyStateContainer
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <EmptyStateIcon>
              <Database size={36} />
            </EmptyStateIcon>
            <EmptyStateTitle>No collections yet</EmptyStateTitle>
            <EmptyStateDescription>
              Be the first to create a document collection! Upload PDFs, add
              annotations, and share your insights with the community.
            </EmptyStateDescription>
            <EmptyStateCTA onClick={() => navigate("/corpuses")}>
              <Plus size={20} />
              Create Collection
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
              <Database size={24} />
            </IconBadge>
            <TitleGroup>
              <SectionTitle>Trending Collections</SectionTitle>
              <SectionSubtitle>
                Popular document collections from the community
              </SectionSubtitle>
            </TitleGroup>
          </HeaderLeft>
          <ViewAllButton onClick={() => navigate("/corpuses")}>
            View All
            <ArrowRight size={18} />
          </ViewAllButton>
        </SectionHeader>

        <CorpusGrid
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          {validCorpuses.slice(0, 6).map(({ node: corpus }, index) => (
            <CorpusCard
              key={corpus.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              onClick={() => handleCorpusClick(corpus)}
            >
              <CardHeader
                $hasImage={Boolean(
                  corpus.icon &&
                    (corpus.icon.startsWith("http") ||
                      corpus.icon.startsWith("/media"))
                )}
              >
                {!(
                  corpus.icon &&
                  (corpus.icon.startsWith("http") ||
                    corpus.icon.startsWith("/media"))
                ) && <CardHeaderPattern />}
                <CorpusIcon
                  $isImage={Boolean(
                    corpus.icon &&
                      (corpus.icon.startsWith("http") ||
                        corpus.icon.startsWith("/media"))
                  )}
                >
                  {corpus.icon ? (
                    corpus.icon.startsWith("http") ||
                    corpus.icon.startsWith("/media") ? (
                      <img
                        src={corpus.icon}
                        alt={corpus.title}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <span>{corpus.icon}</span>
                    )
                  ) : (
                    <Database size={28} />
                  )}
                </CorpusIcon>
                <VisibilityBadge $isPublic={Boolean(corpus.isPublic)}>
                  {corpus.isPublic ? (
                    <>
                      <Globe size={10} /> Public
                    </>
                  ) : (
                    <>
                      <Lock size={10} /> Private
                    </>
                  )}
                </VisibilityBadge>
              </CardHeader>

              <CardBody>
                <CorpusTitle>{corpus.title}</CorpusTitle>
                <CreatorInfo>
                  by {formatUsername(corpus.creator?.username)}
                </CreatorInfo>
                <CorpusDescription>
                  {corpus.description || "No description provided."}
                </CorpusDescription>
                <CardStats>
                  <StatItem>
                    <FileText size={14} />
                    {corpus.documents?.totalCount || 0} docs
                  </StatItem>
                  <StatItem>
                    <MessageSquare size={14} />
                    {corpus.engagementMetrics?.totalThreads || 0} threads
                  </StatItem>
                  <StatItem>
                    <Users size={14} />
                    {corpus.engagementMetrics?.uniqueContributors || 0}{" "}
                    contributors
                  </StatItem>
                </CardStats>
              </CardBody>

              <CardFooter>
                <ViewButton>
                  Explore Collection
                  <ChevronRight size={16} />
                </ViewButton>
              </CardFooter>
            </CorpusCard>
          ))}
        </CorpusGrid>
      </Container>
    </Section>
  );
};
