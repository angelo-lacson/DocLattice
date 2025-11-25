import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { Users, MessageSquare, TrendingUp, Tag } from "lucide-react";
import { color } from "../../theme/colors";

interface CommunityStats {
  totalUsers: number;
  totalThreads: number;
  totalMessages: number;
  totalAnnotations: number;
  activeUsersThisWeek: number;
  activeUsersThisMonth: number;
}

interface StatsBarProps {
  stats: CommunityStats | null;
  loading?: boolean;
}

const StatsContainer = styled.section`
  background: linear-gradient(180deg, ${color.N1} 0%, ${color.N2} 100%);
  border-top: 1px solid ${color.N3};
  border-bottom: 1px solid ${color.N3};
  padding: 2rem 0;
  overflow: hidden;
`;

const StatsWrapper = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 2rem;
`;

const StatsGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1.5rem;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem;
  }

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }
`;

const StatCard = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: white;
  border-radius: 16px;
  border: 1px solid ${color.N3};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
    border-color: ${color.N4};
  }

  @media (max-width: 640px) {
    padding: 0.875rem;
  }
`;

const IconWrapper = styled.div<{ $gradient: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: ${(props) => props.$gradient};
  color: white;
  flex-shrink: 0;

  @media (max-width: 640px) {
    width: 40px;
    height: 40px;
    border-radius: 10px;

    svg {
      width: 18px;
      height: 18px;
    }
  }
`;

const StatContent = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const StatValue = styled.span`
  font-size: 1.5rem;
  font-weight: 700;
  color: ${color.N10};
  line-height: 1.2;
  letter-spacing: -0.02em;

  @media (max-width: 640px) {
    font-size: 1.25rem;
  }
`;

const StatLabel = styled.span`
  font-size: 0.75rem;
  font-weight: 500;
  color: ${color.N6};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SkeletonValue = styled.div`
  width: 60px;
  height: 28px;
  background: linear-gradient(
    90deg,
    ${color.N3} 25%,
    ${color.N4} 50%,
    ${color.N3} 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 6px;

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toLocaleString();
}

const statConfigs = [
  {
    key: "totalUsers",
    label: "Users",
    icon: Users,
    gradient: `linear-gradient(135deg, ${color.B5} 0%, ${color.B7} 100%)`,
  },
  {
    key: "totalThreads",
    label: "Discussions",
    icon: MessageSquare,
    gradient: `linear-gradient(135deg, ${color.G5} 0%, ${color.G7} 100%)`,
  },
  {
    key: "totalMessages",
    label: "Messages",
    icon: MessageSquare,
    gradient: `linear-gradient(135deg, ${color.P5} 0%, ${color.P7} 100%)`,
  },
  {
    key: "totalAnnotations",
    label: "Annotations",
    icon: Tag,
    gradient: `linear-gradient(135deg, ${color.O5} 0%, ${color.O7} 100%)`,
  },
  {
    key: "activeUsersThisWeek",
    label: "Active This Week",
    icon: TrendingUp,
    gradient: `linear-gradient(135deg, ${color.T5} 0%, ${color.T7} 100%)`,
  },
  {
    key: "activeUsersThisMonth",
    label: "Active This Month",
    icon: TrendingUp,
    gradient: `linear-gradient(135deg, ${color.M5} 0%, ${color.M7} 100%)`,
  },
];

export const StatsBar: React.FC<StatsBarProps> = ({ stats, loading }) => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
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

  return (
    <StatsContainer>
      <StatsWrapper>
        <StatsGrid
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {statConfigs.map((config) => (
            <StatCard key={config.key} variants={itemVariants}>
              <IconWrapper $gradient={config.gradient}>
                <config.icon size={22} />
              </IconWrapper>
              <StatContent>
                {loading ? (
                  <SkeletonValue />
                ) : (
                  <StatValue>
                    {stats
                      ? formatNumber(
                          stats[config.key as keyof CommunityStats] as number
                        )
                      : "—"}
                  </StatValue>
                )}
                <StatLabel>{config.label}</StatLabel>
              </StatContent>
            </StatCard>
          ))}
        </StatsGrid>
      </StatsWrapper>
    </StatsContainer>
  );
};
