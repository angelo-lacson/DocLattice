import React, { useState, useCallback } from "react";
import styled from "styled-components";
import { useQuery, useReactiveVar } from "@apollo/client";
import { RefreshCw, X, AlertCircle } from "lucide-react";
import { authToken } from "../graphql/cache";
import { color } from "../theme/colors";
import {
  HeroSection,
  StatsBar,
  TrendingCorpuses,
  RecentDiscussions,
  TopContributors,
  CallToAction,
} from "../components/landing";
import {
  GET_DISCOVERY_DATA,
  GetDiscoveryDataOutput,
} from "../graphql/landing-queries";
const PageContainer = styled.div`
  height: 100%;
  background: ${color.N1};
  overflow-y: auto;
  overflow-x: hidden;
`;

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 1rem 2rem;
  background: linear-gradient(135deg, ${color.R2} 0%, ${color.R1} 100%);
  border-bottom: 1px solid ${color.R3};
  font-size: 0.9375rem;

  @media (max-width: 640px) {
    flex-wrap: wrap;
    padding: 1rem;
    gap: 0.75rem;
  }
`;

const ErrorContent = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: ${color.R8};

  svg {
    flex-shrink: 0;
  }
`;

const ErrorActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ErrorButton = styled.button<{ $variant?: "primary" | "secondary" }>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;

  ${(props) =>
    props.$variant === "primary"
      ? `
    background: ${color.R6};
    color: white;
    border: none;

    &:hover {
      background: ${color.R7};
    }

    &:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
  `
      : `
    background: transparent;
    color: ${color.R7};
    border: 1px solid ${color.R4};

    &:hover {
      background: ${color.R2};
    }
  `}

  svg {
    width: 16px;
    height: 16px;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  &.loading svg {
    animation: spin 1s linear infinite;
  }
`;

interface DiscoveryLandingProps {
  /** Override auth state for testing */
  isAuthenticatedOverride?: boolean;
}

export const DiscoveryLanding: React.FC<DiscoveryLandingProps> = ({
  isAuthenticatedOverride,
}) => {
  const auth_token = useReactiveVar(authToken);
  const isAuthenticated =
    isAuthenticatedOverride !== undefined
      ? isAuthenticatedOverride
      : Boolean(auth_token);

  // State for error banner dismiss
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Fetch all discovery data in a single query
  const { data, loading, error, refetch } = useQuery<GetDiscoveryDataOutput>(
    GET_DISCOVERY_DATA,
    {
      variables: {
        corpusLimit: 6,
        discussionLimit: 5,
        leaderboardLimit: 6,
        conversationType: "THREAD" as const,
      },
      // Refresh data periodically for fresh content
      pollInterval: 5 * 60 * 1000, // 5 minutes
      // Use cache first for faster initial load
      fetchPolicy: "cache-and-network",
    }
  );

  // Handle retry with loading state
  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    setErrorDismissed(false);
    try {
      await refetch();
    } finally {
      setIsRetrying(false);
    }
  }, [refetch]);

  // Reset dismissed state when error changes (new error appears)
  const showError = error && !errorDismissed;

  return (
    <PageContainer>
      {/* Hero Section - Always visible */}
      <HeroSection isAuthenticated={isAuthenticated} />

      {/* Error Banner - Only show if there's an error and not dismissed */}
      {showError && (
        <ErrorBanner>
          <ErrorContent>
            <AlertCircle size={20} />
            <span>Unable to load some content. Please try again.</span>
          </ErrorContent>
          <ErrorActions>
            <ErrorButton
              $variant="primary"
              onClick={handleRetry}
              disabled={isRetrying}
              className={isRetrying ? "loading" : ""}
            >
              <RefreshCw size={16} />
              {isRetrying ? "Retrying..." : "Retry"}
            </ErrorButton>
            <ErrorButton
              $variant="secondary"
              onClick={() => setErrorDismissed(true)}
            >
              <X size={16} />
              Dismiss
            </ErrorButton>
          </ErrorActions>
        </ErrorBanner>
      )}

      {/* Stats Bar - Community metrics */}
      <StatsBar stats={data?.communityStats || null} loading={loading} />

      {/* Trending Collections */}
      <TrendingCorpuses
        corpuses={data?.corpuses?.edges || null}
        loading={loading}
      />

      {/* Recent Discussions */}
      <RecentDiscussions
        discussions={data?.conversations?.edges || null}
        loading={loading}
        totalCount={data?.conversations?.totalCount}
      />

      {/* Top Contributors */}
      <TopContributors
        contributors={data?.globalLeaderboard || null}
        loading={loading}
      />

      {/* Call to Action - Only for anonymous users */}
      <CallToAction isAuthenticated={isAuthenticated} />
    </PageContainer>
  );
};

export default DiscoveryLanding;
