import React from "react";
import styled from "styled-components";
import { StatBlock, StatGrid, Skeleton } from "@opencontracts/ui/src";
import { Users, MessageSquare, Tag, TrendingUp, FileText } from "lucide-react";

interface CommunityStats {
  totalUsers: number;
  totalThreads: number;
  totalMessages: number;
  totalAnnotations: number;
  activeUsersThisWeek: number;
  activeUsersThisMonth: number;
}

interface StatsSectionProps {
  stats: CommunityStats | null;
  loading?: boolean;
}

const StatsContainer = styled.section`
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
  border-bottom: 1px solid #e5e7eb;
  padding: 3rem 2rem;

  @media (max-width: 768px) {
    padding: 2rem 1rem;
  }
`;

const StatsWrapper = styled.div`
  max-width: 1400px;
  margin: 0 auto;
`;

const IconWrapper = styled.span`
  color: #e85a4f;
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

export const StatsSection: React.FC<StatsSectionProps> = ({
  stats,
  loading,
}) => {
  const statConfigs = [
    {
      key: "totalUsers" as keyof CommunityStats,
      label: "Contributors",
      icon: <Users size={24} />,
    },
    {
      key: "totalThreads" as keyof CommunityStats,
      label: "Threads",
      icon: <MessageSquare size={24} />,
    },
    {
      key: "totalAnnotations" as keyof CommunityStats,
      label: "Annotations",
      icon: <Tag size={24} />,
    },
    {
      key: "activeUsersThisWeek" as keyof CommunityStats,
      label: "Active This Week",
      icon: <TrendingUp size={24} />,
    },
    // Note: We don't have totalDocuments in CommunityStats, so we'll use a placeholder
    // or skip this for now. Adding it with null check:
    {
      key: null,
      label: "Documents",
      icon: <FileText size={24} />,
      placeholder: "—",
    },
  ];

  return (
    <StatsContainer>
      <StatsWrapper>
        <StatGrid columns={3} gap="lg">
          {statConfigs.map((config, index) => {
            const key = config.key
              ? `stat-${config.key}`
              : `stat-placeholder-${index}`;

            if (loading) {
              return (
                <StatBlock
                  key={key}
                  value="—"
                  label={config.label}
                  icon={<IconWrapper>{config.icon}</IconWrapper>}
                  variant="accent"
                  size="md"
                  align="left"
                />
              );
            }

            const value =
              config.key && stats
                ? formatNumber(stats[config.key] as number)
                : config.placeholder || "—";

            return (
              <StatBlock
                key={key}
                value={value}
                label={config.label}
                icon={<IconWrapper>{config.icon}</IconWrapper>}
                variant="accent"
                size="md"
                align="left"
              />
            );
          })}
        </StatGrid>
      </StatsWrapper>
    </StatsContainer>
  );
};
