import React, { useState } from "react";
import { useQuery } from "@apollo/client";
import { Table, Dropdown, Button, Statistic } from "semantic-ui-react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import {
  Trophy,
  Medal,
  TrendingUp,
  Users,
  MessageSquare,
  Target,
  Star,
  User,
} from "lucide-react";
import { Spinner } from "@os-legal/ui";
import {
  GET_LEADERBOARD,
  GET_COMMUNITY_STATS,
} from "../../graphql/queries/leaderboard/queries";
import {
  LeaderboardMetric,
  LeaderboardScope,
  Leaderboard as LeaderboardType,
  CommunityStats as CommunityStatsType,
  LeaderboardEntry,
} from "../../types/leaderboard";
import { Badge } from "../badges/Badge";

const Container = styled.div`
  padding: 2em;
  max-width: 1400px;
  margin: 0 auto;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;

  @media (max-width: 768px) {
    padding: 1em;
  }
`;

const StyledSegment = styled.div`
  padding: 1rem;
  border-radius: 16px;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const LeaderboardCard = styled.div`
  border-radius: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  padding: 1.5em;
  margin-bottom: 1em;
`;

const StatsCard = styled.div`
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  padding: 1.5em;
  color: white;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const RankBadge = styled.div<{ $rank: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-weight: bold;
  font-size: 18px;
  background: ${(props) => {
    if (props.$rank === 1)
      return "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)";
    if (props.$rank === 2)
      return "linear-gradient(135deg, #C0C0C0 0%, #A8A8A8 100%)";
    if (props.$rank === 3)
      return "linear-gradient(135deg, #CD7F32 0%, #B8860B 100%)";
    return "linear-gradient(135deg, #667eea 0%, #764ba2 100%)";
  }};
  color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
`;

const UserRow = styled(Table.Row)<{ $isCurrentUser?: boolean }>`
  ${(props) =>
    props.$isCurrentUser &&
    `
    background-color: rgba(102, 126, 234, 0.1) !important;
    font-weight: 600;
  `}
`;

const FilterBar = styled.div`
  display: flex;
  gap: 1em;
  margin-bottom: 1.5em;
  flex-wrap: wrap;
  align-items: center;
`;

const TableWrapper = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: 0 -0.5em;
  padding: 0 0.5em;

  @media (max-width: 768px) {
    margin: 0 -1em;
    padding: 0 1em;
  }
`;

interface LeaderboardProps {
  corpusId?: string;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ corpusId }) => {
  const navigate = useNavigate();
  const [metric, setMetric] = useState<LeaderboardMetric>(
    LeaderboardMetric.BADGES
  );
  const [scope, setScope] = useState<LeaderboardScope>(
    LeaderboardScope.ALL_TIME
  );
  const [limit, setLimit] = useState(25);

  const {
    loading: leaderboardLoading,
    error: leaderboardError,
    data: leaderboardData,
  } = useQuery<{ leaderboard: LeaderboardType }>(GET_LEADERBOARD, {
    variables: {
      metric,
      scope,
      corpusId,
      limit,
    },
    pollInterval: 60000, // Refresh every minute
  });

  const { loading: statsLoading, data: statsData } = useQuery<{
    communityStats: CommunityStatsType;
  }>(GET_COMMUNITY_STATS, {
    variables: { corpusId },
    pollInterval: 120000, // Refresh every 2 minutes
  });

  const metricOptions = [
    {
      key: LeaderboardMetric.BADGES,
      text: "Top Badge Earners",
      value: LeaderboardMetric.BADGES,
      icon: "trophy",
    },
    {
      key: LeaderboardMetric.MESSAGES,
      text: "Most Active Contributors",
      value: LeaderboardMetric.MESSAGES,
      icon: "comment",
    },
    {
      key: LeaderboardMetric.THREADS,
      text: "Top Thread Creators",
      value: LeaderboardMetric.THREADS,
      icon: "conversation",
    },
    {
      key: LeaderboardMetric.ANNOTATIONS,
      text: "Top Annotators",
      value: LeaderboardMetric.ANNOTATIONS,
      icon: "marker",
    },
    {
      key: LeaderboardMetric.REPUTATION,
      text: "Highest Reputation",
      value: LeaderboardMetric.REPUTATION,
      icon: "star",
    },
  ];

  const scopeOptions = [
    {
      key: LeaderboardScope.ALL_TIME,
      text: "All Time",
      value: LeaderboardScope.ALL_TIME,
    },
    {
      key: LeaderboardScope.MONTHLY,
      text: "This Month",
      value: LeaderboardScope.MONTHLY,
    },
    {
      key: LeaderboardScope.WEEKLY,
      text: "This Week",
      value: LeaderboardScope.WEEKLY,
    },
  ];

  const limitOptions = [
    { key: 10, text: "Top 10", value: 10 },
    { key: 25, text: "Top 25", value: 25 },
    { key: 50, text: "Top 50", value: 50 },
    { key: 100, text: "Top 100", value: 100 },
  ];

  const getMetricIcon = (metric: LeaderboardMetric) => {
    switch (metric) {
      case LeaderboardMetric.BADGES:
        return <Trophy size={20} />;
      case LeaderboardMetric.MESSAGES:
        return <MessageSquare size={20} />;
      case LeaderboardMetric.THREADS:
        return <Users size={20} />;
      case LeaderboardMetric.ANNOTATIONS:
        return <Target size={20} />;
      case LeaderboardMetric.REPUTATION:
        return <Star size={20} />;
    }
  };

  const getScoreLabel = (metric: LeaderboardMetric, score: number) => {
    switch (metric) {
      case LeaderboardMetric.BADGES:
        return `${score} ${score === 1 ? "badge" : "badges"}`;
      case LeaderboardMetric.MESSAGES:
        return `${score} ${score === 1 ? "message" : "messages"}`;
      case LeaderboardMetric.THREADS:
        return `${score} ${score === 1 ? "thread" : "threads"}`;
      case LeaderboardMetric.ANNOTATIONS:
        return `${score} ${score === 1 ? "annotation" : "annotations"}`;
      case LeaderboardMetric.REPUTATION:
        return `${score} reputation`;
    }
  };

  const handleUserClick = (userSlug: string) => {
    navigate(`/users/${userSlug}`);
  };

  if (leaderboardError) {
    return (
      <Container>
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "6px",
            color: "#991b1b",
          }}
        >
          <strong style={{ display: "block", marginBottom: "0.25rem" }}>
            Error Loading Leaderboard
          </strong>
          <p style={{ margin: 0 }}>{leaderboardError.message}</p>
        </div>
      </Container>
    );
  }

  const leaderboard = leaderboardData?.leaderboard;
  const stats = statsData?.communityStats;

  return (
    <Container>
      <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <TrendingUp size={28} />
        Community Leaderboard
      </h1>

      {/* Community Stats Overview */}
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "1rem",
            marginBottom: "2em",
          }}
        >
          <StatsCard>
            <Statistic inverted size="small">
              <Statistic.Value>
                {stats.totalUsers.toLocaleString()}
              </Statistic.Value>
              <Statistic.Label>Active Users</Statistic.Label>
            </Statistic>
          </StatsCard>
          <StatsCard>
            <Statistic inverted size="small">
              <Statistic.Value>
                {stats.totalMessages.toLocaleString()}
              </Statistic.Value>
              <Statistic.Label>Messages</Statistic.Label>
            </Statistic>
          </StatsCard>
          <StatsCard>
            <Statistic inverted size="small">
              <Statistic.Value>
                {stats.totalBadgesAwarded.toLocaleString()}
              </Statistic.Value>
              <Statistic.Label>Badges Awarded</Statistic.Label>
            </Statistic>
          </StatsCard>
          <StatsCard>
            <Statistic inverted size="small">
              <Statistic.Value>
                {stats.activeUsersThisWeek.toLocaleString()}
              </Statistic.Value>
              <Statistic.Label>Active This Week</Statistic.Label>
            </Statistic>
          </StatsCard>
        </div>
      )}

      {/* Leaderboard Controls */}
      <LeaderboardCard>
        <FilterBar>
          <Dropdown
            selection
            options={metricOptions}
            value={metric}
            onChange={(_, data) => setMetric(data.value as LeaderboardMetric)}
            placeholder="Select Metric"
            style={{ minWidth: "250px" }}
          />
          <Dropdown
            selection
            options={scopeOptions}
            value={scope}
            onChange={(_, data) => setScope(data.value as LeaderboardScope)}
            placeholder="Select Time Period"
          />
          <Dropdown
            selection
            options={limitOptions}
            value={limit}
            onChange={(_, data) => setLimit(data.value as number)}
            placeholder="Number of Users"
          />
        </FilterBar>

        {leaderboardLoading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "3rem",
            }}
          >
            <Spinner size="md" />
            <span style={{ marginTop: "0.75rem", color: "#64748b" }}>
              Loading leaderboard...
            </span>
          </div>
        ) : leaderboard && leaderboard.entries.length > 0 ? (
          <>
            {leaderboard.currentUserRank && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  borderRadius: "6px",
                  color: "#0369a1",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                <User size={16} />
                Your rank: <strong>#{leaderboard.currentUserRank}</strong> out
                of {leaderboard.totalUsers} users
              </div>
            )}

            <TableWrapper>
              <Table basic="very" celled selectable>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell width={1}>Rank</Table.HeaderCell>
                    <Table.HeaderCell>User</Table.HeaderCell>
                    <Table.HeaderCell width={3}>Score</Table.HeaderCell>
                    <Table.HeaderCell width={2}>Details</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {leaderboard.entries.map((entry: LeaderboardEntry) => (
                    <UserRow
                      key={entry.user.id}
                      $isCurrentUser={
                        leaderboard.currentUserRank !== null &&
                        entry.rank === leaderboard.currentUserRank
                      }
                      onClick={() => handleUserClick(entry.user.slug)}
                      style={{ cursor: "pointer" }}
                    >
                      <Table.Cell>
                        <RankBadge $rank={entry.rank}>
                          {entry.rank <= 3 ? (
                            <Medal size={20} />
                          ) : (
                            <span>{entry.rank}</span>
                          )}
                        </RankBadge>
                      </Table.Cell>
                      <Table.Cell>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5em",
                          }}
                        >
                          <strong>{entry.user.username}</strong>
                          {entry.isRisingStar && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "0.15em 0.5em",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                background: "#fff7ed",
                                border: "1px solid #fed7aa",
                                borderRadius: "4px",
                                color: "#c2410c",
                              }}
                            >
                              <TrendingUp size={12} />
                              Rising Star
                            </span>
                          )}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5em",
                          }}
                        >
                          {getMetricIcon(metric)}
                          <strong>{getScoreLabel(metric, entry.score)}</strong>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div style={{ fontSize: "0.9em", color: "#64748b" }}>
                          {entry.badgeCount !== undefined &&
                            `${entry.badgeCount} badges `}
                          {entry.messageCount !== undefined &&
                            `${entry.messageCount} messages `}
                          {entry.reputation !== undefined &&
                            `${entry.reputation} rep`}
                        </div>
                      </Table.Cell>
                    </UserRow>
                  ))}
                </Table.Body>
              </Table>
            </TableWrapper>
          </>
        ) : (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              borderRadius: "6px",
              color: "#0369a1",
            }}
          >
            <strong style={{ display: "block", marginBottom: "0.25rem" }}>
              No Data Available
            </strong>
            <p style={{ margin: 0 }}>
              There are no users in this leaderboard yet. Be the first to
              contribute!
            </p>
          </div>
        )}
      </LeaderboardCard>

      {/* Badge Distribution */}
      {stats &&
        stats.badgeDistribution &&
        stats.badgeDistribution.length > 0 && (
          <StyledSegment>
            <h3
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Trophy size={20} />
              Badge Distribution
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                gap: "1rem",
              }}
            >
              {stats.badgeDistribution.map((dist) => (
                <div
                  key={dist.badge.id}
                  style={{
                    padding: "1rem",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    background: "white",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1em",
                    }}
                  >
                    <Badge badge={dist.badge} size="medium" />
                    <div style={{ flex: 1 }}>
                      <div>
                        <strong>{dist.badge.name}</strong>
                      </div>
                      <div style={{ fontSize: "0.9em", color: "#64748b" }}>
                        Awarded {dist.awardCount} times to{" "}
                        {dist.uniqueRecipients} users
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </StyledSegment>
        )}
    </Container>
  );
};
