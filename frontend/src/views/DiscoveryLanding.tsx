import React from "react";
import styled from "styled-components";
import { useQuery, useReactiveVar } from "@apollo/client";
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
  padding: 1rem 2rem;
  background: ${color.R2};
  color: ${color.R8};
  text-align: center;
  font-size: 0.9375rem;
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

  // Fetch all discovery data in a single query
  const { data, loading, error } = useQuery<GetDiscoveryDataOutput>(
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

  return (
    <PageContainer>
      {/* Hero Section - Always visible */}
      <HeroSection isAuthenticated={isAuthenticated} />

      {/* Error Banner - Only show if there's an error */}
      {error && (
        <ErrorBanner>
          Unable to load some content. Please try refreshing the page.
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
