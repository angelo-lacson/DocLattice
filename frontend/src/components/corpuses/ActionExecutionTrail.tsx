import React, { useState, useCallback } from "react";
import { useQuery } from "@apollo/client";
import styled from "styled-components";
import { Dropdown, Icon, Button, Loader, Message } from "semantic-ui-react";
import { ActionTrailStats } from "./ActionTrailStats";
import { ActionExecutionCard } from "./ActionExecutionCard";
import {
  GET_CORPUS_ACTION_EXECUTIONS,
  GET_CORPUS_ACTION_TRAIL_STATS,
  GET_CORPUS_ACTIONS,
  GetCorpusActionExecutionsInput,
  GetCorpusActionExecutionsOutput,
  GetCorpusActionTrailStatsInput,
  GetCorpusActionTrailStatsOutput,
  GetCorpusActionsInput,
  GetCorpusActionsOutput,
} from "../../graphql/queries";

interface ActionExecutionTrailProps {
  corpusId: string;
}

const TrailContainer = styled.div`
  width: 100%;
`;

const FiltersRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
  align-items: flex-end;

  @media (max-width: 768px) {
    gap: 0.75rem;
  }

  @media (max-width: 480px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

const FilterLabel = styled.label`
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #64748b;
  font-weight: 600;
  margin-bottom: 0.25rem;
  display: block;
`;

const FilterGroup = styled.div`
  min-width: 150px;

  @media (max-width: 480px) {
    min-width: 100%;
  }
`;

const ExecutionsList = styled.div`
  margin-top: 1rem;
`;

const LoadMoreContainer = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 2rem;
  color: #64748b;

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #475569;
    margin-bottom: 0.5rem;
  }

  .empty-description {
    font-size: 0.9375rem;
  }
`;

const ResultsCount = styled.div`
  color: #64748b;
  font-size: 0.875rem;
  margin-bottom: 1rem;
`;

const STATUS_OPTIONS = [
  { key: "all", value: "", text: "All Statuses" },
  { key: "queued", value: "queued", text: "Queued" },
  { key: "running", value: "running", text: "Running" },
  { key: "completed", value: "completed", text: "Completed" },
  { key: "failed", value: "failed", text: "Failed" },
  { key: "skipped", value: "skipped", text: "Skipped" },
];

const TYPE_OPTIONS = [
  { key: "all", value: "", text: "All Types" },
  { key: "fieldset", value: "fieldset", text: "Fieldset" },
  { key: "analyzer", value: "analyzer", text: "Analyzer" },
  { key: "agent", value: "agent", text: "Agent" },
];

const TIME_RANGE_OPTIONS = [
  { key: "all", value: "", text: "All Time" },
  { key: "1h", value: "1", text: "Last Hour" },
  { key: "24h", value: "24", text: "Last 24 Hours" },
  { key: "7d", value: "168", text: "Last 7 Days" },
  { key: "30d", value: "720", text: "Last 30 Days" },
];

const PAGE_SIZE = 20;

/**
 * ActionExecutionTrail component displays the execution history of corpus actions.
 *
 * Features:
 * - Stats summary showing execution counts by status
 * - Filtering by status, action type, specific action, and time range
 * - Paginated list of execution cards with load more
 * - Responsive layout with mobile breakpoints
 * - Full keyboard and screen reader accessibility
 *
 * Routing Compliance:
 * - NEVER sets reactive vars directly
 * - All navigation handled via getDocumentUrl/getExtractUrl utilities in ActionExecutionCard
 * - CentralRouteManager handles URL → state mapping
 *
 * @param corpusId - The ID of the corpus to show execution history for
 */
export const ActionExecutionTrail: React.FC<ActionExecutionTrailProps> = ({
  corpusId,
}) => {
  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [timeRangeHours, setTimeRangeHours] = useState<string>("");

  // Calculate since datetime from hours
  const sinceDateTime = timeRangeHours
    ? new Date(
        Date.now() - parseInt(timeRangeHours) * 60 * 60 * 1000
      ).toISOString()
    : undefined;

  // Fetch stats
  const { data: statsData, loading: statsLoading } = useQuery<
    GetCorpusActionTrailStatsOutput,
    GetCorpusActionTrailStatsInput
  >(GET_CORPUS_ACTION_TRAIL_STATS, {
    variables: { corpusId, since: sinceDateTime },
    fetchPolicy: "cache-and-network",
  });

  // Fetch actions for filter dropdown
  const { data: actionsData } = useQuery<
    GetCorpusActionsOutput,
    GetCorpusActionsInput
  >(GET_CORPUS_ACTIONS, {
    variables: { corpusId },
    fetchPolicy: "cache-first",
  });

  // Build action options for filter
  const actionOptions = [
    { key: "all", value: "", text: "All Actions" },
    ...(actionsData?.corpusActions?.edges?.map(({ node }) => ({
      key: node.id,
      value: node.id,
      text: node.name,
    })) || []),
  ];

  // Fetch executions with pagination
  const {
    data: executionsData,
    loading: executionsLoading,
    error: executionsError,
    fetchMore,
  } = useQuery<GetCorpusActionExecutionsOutput, GetCorpusActionExecutionsInput>(
    GET_CORPUS_ACTION_EXECUTIONS,
    {
      variables: {
        corpusId,
        corpusActionId: actionFilter || undefined,
        status: statusFilter || undefined,
        actionType: typeFilter || undefined,
        since: sinceDateTime,
        first: PAGE_SIZE,
      },
      fetchPolicy: "cache-and-network",
      notifyOnNetworkStatusChange: true,
    }
  );

  const handleLoadMore = useCallback(() => {
    if (!executionsData?.corpusActionExecutions?.pageInfo?.hasNextPage) return;

    fetchMore({
      variables: {
        after: executionsData.corpusActionExecutions.pageInfo.endCursor,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          corpusActionExecutions: {
            ...fetchMoreResult.corpusActionExecutions,
            edges: [
              ...prev.corpusActionExecutions.edges,
              ...fetchMoreResult.corpusActionExecutions.edges,
            ],
          },
        };
      },
    });
  }, [executionsData, fetchMore]);

  const executions = executionsData?.corpusActionExecutions?.edges || [];
  const hasMore = executionsData?.corpusActionExecutions?.pageInfo?.hasNextPage;
  const totalCount = executionsData?.corpusActionExecutions?.totalCount || 0;

  return (
    <TrailContainer>
      {/* Stats Summary */}
      <ActionTrailStats
        stats={statsData?.corpusActionTrailStats || null}
        loading={statsLoading}
      />

      {/* Filters */}
      <FiltersRow role="search" aria-label="Filter action executions">
        <FilterGroup>
          <FilterLabel htmlFor="status-filter">Status</FilterLabel>
          <Dropdown
            id="status-filter"
            selection
            fluid
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(_, { value }) => setStatusFilter(value as string)}
            aria-label="Filter by status"
          />
        </FilterGroup>

        <FilterGroup>
          <FilterLabel htmlFor="type-filter">Type</FilterLabel>
          <Dropdown
            id="type-filter"
            selection
            fluid
            options={TYPE_OPTIONS}
            value={typeFilter}
            onChange={(_, { value }) => setTypeFilter(value as string)}
            aria-label="Filter by action type"
          />
        </FilterGroup>

        <FilterGroup>
          <FilterLabel htmlFor="action-filter">Action</FilterLabel>
          <Dropdown
            id="action-filter"
            selection
            fluid
            options={actionOptions}
            value={actionFilter}
            onChange={(_, { value }) => setActionFilter(value as string)}
            aria-label="Filter by specific action"
          />
        </FilterGroup>

        <FilterGroup>
          <FilterLabel htmlFor="time-filter">Time Range</FilterLabel>
          <Dropdown
            id="time-filter"
            selection
            fluid
            options={TIME_RANGE_OPTIONS}
            value={timeRangeHours}
            onChange={(_, { value }) => setTimeRangeHours(value as string)}
            aria-label="Filter by time range"
          />
        </FilterGroup>
      </FiltersRow>

      {/* Results Count */}
      {totalCount > 0 && (
        <ResultsCount role="status" aria-live="polite">
          Showing {executions.length} of {totalCount} executions
        </ResultsCount>
      )}

      {/* Error State */}
      {executionsError && (
        <Message negative role="alert">
          <Message.Header>Error Loading Executions</Message.Header>
          <p>{executionsError.message}</p>
        </Message>
      )}

      {/* Loading State */}
      {executionsLoading && executions.length === 0 && (
        <div
          style={{ textAlign: "center", padding: "3rem" }}
          role="status"
          aria-live="polite"
        >
          <Loader active inline="centered" aria-label="Loading executions" />
          <p style={{ marginTop: "1rem", color: "#64748b" }}>
            Loading execution history...
          </p>
        </div>
      )}

      {/* Empty State */}
      {!executionsLoading && executions.length === 0 && !executionsError && (
        <EmptyState role="status">
          <Icon name="history" className="empty-icon" aria-hidden="true" />
          <div className="empty-title">No Executions Found</div>
          <div className="empty-description">
            {statusFilter || typeFilter || actionFilter || timeRangeHours
              ? "Try adjusting your filters to see more results."
              : "Action executions will appear here when documents are added or edited."}
          </div>
        </EmptyState>
      )}

      {/* Executions List */}
      <ExecutionsList role="feed" aria-label="Action execution history">
        {executions.map(({ node }) => (
          <ActionExecutionCard key={node.id} execution={node} />
        ))}
      </ExecutionsList>

      {/* Load More */}
      {hasMore && (
        <LoadMoreContainer>
          <Button
            onClick={handleLoadMore}
            loading={executionsLoading}
            disabled={executionsLoading}
            aria-label="Load more executions"
          >
            <Icon name="arrow down" aria-hidden="true" />
            Load More
          </Button>
        </LoadMoreContainer>
      )}
    </TrailContainer>
  );
};
