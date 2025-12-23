import React from "react";
import styled from "styled-components";
import { CorpusActionTrailStats } from "../../graphql/queries";

interface ActionTrailStatsProps {
  stats: CorpusActionTrailStats | null;
  loading?: boolean;
}

/**
 * Color variants for stat cards
 */
type StatVariant = "success" | "warning" | "error" | "info" | "neutral";

const VARIANT_COLORS: Record<StatVariant, string> = {
  success: "#10b981",
  info: "#3b82f6",
  warning: "#f59e0b",
  error: "#ef4444",
  neutral: "#6b7280",
};

/**
 * Grid container for stats cards
 * Responsive breakpoints: 5 cols -> 3 cols -> 2 cols -> 1 col
 */
const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1.5rem;
  margin-bottom: 2rem;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

/**
 * Individual stat card with colored left border
 */
const StatCard = styled.div<{ variant: StatVariant; loading?: boolean }>`
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-left: 4px solid ${(props) => VARIANT_COLORS[props.variant]};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  opacity: ${(props) => (props.loading ? 0.6 : 1)};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
    border-color: ${(props) => VARIANT_COLORS[props.variant]};
  }

  @media (max-width: 768px) {
    padding: 1.25rem;
    border-left-width: 3px;
  }

  @media (max-width: 480px) {
    padding: 1rem;
  }
`;

/**
 * Stat label (small text above the value)
 */
const StatLabel = styled.div`
  font-size: 0.8125rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 0.5rem;
  font-weight: 600;

  @media (max-width: 768px) {
    font-size: 0.75rem;
  }
`;

/**
 * Stat value (large number)
 */
const StatValue = styled.div<{ variant: StatVariant }>`
  font-size: 2rem;
  font-weight: 700;
  color: ${(props) => VARIANT_COLORS[props.variant]};
  line-height: 1.2;

  @media (max-width: 768px) {
    font-size: 1.75rem;
  }

  @media (max-width: 480px) {
    font-size: 1.5rem;
  }
`;

/**
 * Placeholder shimmer for loading state
 */
const Shimmer = styled.div`
  background: linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  height: 1.5rem;

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
`;

/**
 * Container with ARIA region for accessibility
 */
const StatsContainer = styled.div`
  width: 100%;
`;

/**
 * Individual stat card component
 */
interface StatItemProps {
  label: string;
  value: number | string;
  variant: StatVariant;
  loading?: boolean;
}

const StatItem: React.FC<StatItemProps> = ({
  label,
  value,
  variant,
  loading,
}) => {
  return (
    <StatCard variant={variant} loading={loading}>
      <StatLabel>{label}</StatLabel>
      {loading ? (
        <Shimmer />
      ) : (
        <StatValue variant={variant} aria-live="polite">
          {value.toLocaleString()}
        </StatValue>
      )}
    </StatCard>
  );
};

/**
 * ActionTrailStats displays a summary of corpus action execution statistics.
 * Shows total, completed, running, queued, and failed execution counts in a responsive grid.
 *
 * Component follows the existing CorpusSettings styling patterns:
 * - Gradient backgrounds
 * - 12px border-radius
 * - Colored left borders for variants
 * - Box shadows
 * - Responsive grid layout
 *
 * @param stats - CorpusActionTrailStats object from GET_CORPUS_ACTION_TRAIL_STATS query
 * @param loading - Optional loading state to show placeholders
 */
export const ActionTrailStats: React.FC<ActionTrailStatsProps> = ({
  stats,
  loading = false,
}) => {
  return (
    <StatsContainer
      role="region"
      aria-label="Action execution statistics"
      aria-busy={loading}
    >
      <StatsGrid>
        <StatItem
          label="Total"
          value={stats?.totalExecutions ?? 0}
          variant="neutral"
          loading={loading}
        />
        <StatItem
          label="Completed"
          value={stats?.completed ?? 0}
          variant="success"
          loading={loading}
        />
        <StatItem
          label="Running"
          value={stats?.running ?? 0}
          variant="info"
          loading={loading}
        />
        <StatItem
          label="Queued"
          value={stats?.queued ?? 0}
          variant="warning"
          loading={loading}
        />
        <StatItem
          label="Failed"
          value={stats?.failed ?? 0}
          variant="error"
          loading={loading}
        />
      </StatsGrid>
    </StatsContainer>
  );
};
