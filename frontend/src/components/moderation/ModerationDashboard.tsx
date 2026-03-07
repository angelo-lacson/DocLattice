import React, { useState, useCallback } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Table, Dropdown } from "semantic-ui-react";
import {
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  StatBlock,
  Textarea,
} from "@os-legal/ui";
import {
  Shield,
  BarChart3,
  Filter,
  List,
  Undo2,
  Plus,
  AlertTriangle,
  Settings,
  User,
  MessageSquare,
  MessagesSquare,
} from "lucide-react";
import { Spinner } from "@os-legal/ui";
import {
  ErrorMessage,
  InfoMessage,
  WarningMessage,
  LoadingState,
} from "../widgets/feedback";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";
import { toast } from "react-toastify";
import { formatDistanceToNow, format } from "date-fns";

import {
  GET_MODERATION_ACTIONS,
  GET_MODERATION_METRICS,
  GetModerationActionsInput,
  GetModerationActionsOutput,
  GetModerationMetricsInput,
  GetModerationMetricsOutput,
  ModerationActionNode,
} from "../../graphql/queries";
import {
  ROLLBACK_MODERATION_ACTION,
  RollbackModerationActionInput,
  RollbackModerationActionOutput,
} from "../../graphql/mutations";

/** Page size for moderation actions list */
const MODERATION_PAGE_SIZE = 10;

/** Moderation action type enum for type safety */
export enum ModerationActionTypeEnum {
  LOCK_THREAD = "lock_thread",
  UNLOCK_THREAD = "unlock_thread",
  PIN_THREAD = "pin_thread",
  UNPIN_THREAD = "unpin_thread",
  DELETE_MESSAGE = "delete_message",
  RESTORE_MESSAGE = "restore_message",
  DELETE_THREAD = "delete_thread",
  RESTORE_THREAD = "restore_thread",
}

interface ModerationDashboardProps {
  corpusId: string;
  corpusTitle?: string;
}

const ACTION_TYPE_OPTIONS = [
  { key: "all", value: "", text: "All Actions" },
  {
    key: ModerationActionTypeEnum.LOCK_THREAD,
    value: ModerationActionTypeEnum.LOCK_THREAD,
    text: "Lock Thread",
  },
  {
    key: ModerationActionTypeEnum.UNLOCK_THREAD,
    value: ModerationActionTypeEnum.UNLOCK_THREAD,
    text: "Unlock Thread",
  },
  {
    key: ModerationActionTypeEnum.PIN_THREAD,
    value: ModerationActionTypeEnum.PIN_THREAD,
    text: "Pin Thread",
  },
  {
    key: ModerationActionTypeEnum.UNPIN_THREAD,
    value: ModerationActionTypeEnum.UNPIN_THREAD,
    text: "Unpin Thread",
  },
  {
    key: ModerationActionTypeEnum.DELETE_MESSAGE,
    value: ModerationActionTypeEnum.DELETE_MESSAGE,
    text: "Delete Message",
  },
  {
    key: ModerationActionTypeEnum.RESTORE_MESSAGE,
    value: ModerationActionTypeEnum.RESTORE_MESSAGE,
    text: "Restore Message",
  },
  {
    key: ModerationActionTypeEnum.DELETE_THREAD,
    value: ModerationActionTypeEnum.DELETE_THREAD,
    text: "Delete Thread",
  },
  {
    key: ModerationActionTypeEnum.RESTORE_THREAD,
    value: ModerationActionTypeEnum.RESTORE_THREAD,
    text: "Restore Thread",
  },
];

const TIME_RANGE_OPTIONS = [
  { key: "1h", value: 1, text: "Last hour" },
  { key: "24h", value: 24, text: "Last 24 hours" },
  { key: "7d", value: 168, text: "Last 7 days" },
  { key: "30d", value: 720, text: "Last 30 days" },
];

const formatActionType = (actionType: string): string => {
  return actionType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const ACTION_COLOR_MAP: Record<string, { bg: string; color: string }> = {
  delete: {
    bg: OS_LEGAL_COLORS.dangerSurface,
    color: OS_LEGAL_COLORS.dangerText,
  },
  restore: {
    bg: OS_LEGAL_COLORS.successSurface,
    color: OS_LEGAL_COLORS.successText,
  },
  lock: {
    bg: OS_LEGAL_COLORS.warningSurface,
    color: OS_LEGAL_COLORS.warningText,
  },
  pin: { bg: OS_LEGAL_COLORS.infoSurface, color: OS_LEGAL_COLORS.infoText },
};
const DEFAULT_ACTION_COLORS = {
  bg: OS_LEGAL_COLORS.surfaceHover,
  color: OS_LEGAL_COLORS.textSecondary,
};

const getActionColors = (actionType: string): { bg: string; color: string } => {
  for (const [key, value] of Object.entries(ACTION_COLOR_MAP)) {
    if (actionType.includes(key)) return value;
  }
  return DEFAULT_ACTION_COLORS;
};

export const ModerationDashboard: React.FC<ModerationDashboardProps> = ({
  corpusId,
  corpusTitle,
}) => {
  const [selectedActionType, setSelectedActionType] = useState<string>("");
  const [automatedOnly, setAutomatedOnly] = useState<boolean>(false);
  const [timeRangeHours, setTimeRangeHours] = useState<number>(24);
  const [rollbackModalOpen, setRollbackModalOpen] = useState<boolean>(false);
  const [selectedAction, setSelectedAction] =
    useState<ModerationActionNode | null>(null);
  const [rollbackReason, setRollbackReason] = useState<string>("");
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

  // Query moderation actions
  const {
    data: actionsData,
    loading: actionsLoading,
    error: actionsError,
    refetch: refetchActions,
    fetchMore,
  } = useQuery<GetModerationActionsOutput, GetModerationActionsInput>(
    GET_MODERATION_ACTIONS,
    {
      variables: {
        corpusId,
        actionTypes: selectedActionType ? [selectedActionType] : undefined,
        automatedOnly: automatedOnly || undefined,
        first: MODERATION_PAGE_SIZE,
      },
      fetchPolicy: "cache-and-network",
    }
  );

  // Handle loading more actions with cursor-based pagination
  const handleLoadMore = useCallback(async () => {
    const endCursor = actionsData?.moderationActions?.pageInfo?.endCursor;
    if (!endCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      await fetchMore({
        variables: {
          after: endCursor,
          first: MODERATION_PAGE_SIZE,
        },
        updateQuery: (prev, { fetchMoreResult }) => {
          if (!fetchMoreResult) return prev;

          return {
            ...fetchMoreResult,
            moderationActions: {
              ...fetchMoreResult.moderationActions,
              edges: [
                ...(prev.moderationActions?.edges || []),
                ...(fetchMoreResult.moderationActions?.edges || []),
              ],
            },
          };
        },
      });
    } catch (error) {
      toast.error("Failed to load more actions");
    } finally {
      setIsLoadingMore(false);
    }
  }, [actionsData, fetchMore, isLoadingMore]);

  // Query moderation metrics
  const {
    data: metricsData,
    loading: metricsLoading,
    error: metricsError,
  } = useQuery<GetModerationMetricsOutput, GetModerationMetricsInput>(
    GET_MODERATION_METRICS,
    {
      variables: {
        corpusId,
        timeRangeHours,
      },
      fetchPolicy: "cache-and-network",
    }
  );

  // Rollback mutation
  const [rollbackAction, { loading: rollbackLoading }] = useMutation<
    RollbackModerationActionOutput,
    RollbackModerationActionInput
  >(ROLLBACK_MODERATION_ACTION, {
    onCompleted: (data) => {
      if (data.rollbackModerationAction.ok) {
        toast.success(data.rollbackModerationAction.message);
        setRollbackModalOpen(false);
        setSelectedAction(null);
        setRollbackReason("");
        refetchActions();
      } else {
        toast.error(data.rollbackModerationAction.message);
      }
    },
    onError: (error) => {
      toast.error(`Failed to rollback: ${error.message}`);
    },
  });

  const handleRollback = () => {
    if (!selectedAction) return;
    rollbackAction({
      variables: {
        actionId: selectedAction.id,
        reason: rollbackReason || undefined,
      },
    });
  };

  const openRollbackModal = (action: ModerationActionNode) => {
    setSelectedAction(action);
    setRollbackModalOpen(true);
  };

  const metrics = metricsData?.moderationMetrics;
  const actions = actionsData?.moderationActions?.edges || [];

  return (
    <div style={{ padding: "1rem" }}>
      <div
        style={{
          borderBottom: `1px solid ${OS_LEGAL_COLORS.border}`,
          paddingBottom: "1rem",
          marginBottom: "1rem",
        }}
      >
        <h2
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            margin: 0,
          }}
        >
          <Shield size={24} />
          Moderation Dashboard
        </h2>
        {corpusTitle && (
          <div
            style={{
              color: OS_LEGAL_COLORS.textSecondary,
              fontSize: "0.9rem",
              marginTop: "0.25rem",
            }}
          >
            {corpusTitle}
          </div>
        )}
      </div>

      {/* Metrics Section */}
      <div
        style={{
          padding: "1rem",
          border: `1px solid ${OS_LEGAL_COLORS.border}`,
          borderRadius: "8px",
          background: "white",
          marginBottom: "1rem",
        }}
      >
        <h4
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            margin: "0 0 0.5rem 0",
          }}
        >
          <BarChart3 size={16} />
          Moderation Metrics
          <Dropdown
            inline
            options={TIME_RANGE_OPTIONS}
            value={timeRangeHours}
            onChange={(_, { value }) => setTimeRangeHours(value as number)}
            style={{ marginLeft: "1rem" }}
          />
        </h4>
        {metricsLoading ? (
          <div style={{ textAlign: "center", padding: "1rem" }}>
            <Spinner size="sm" />
          </div>
        ) : metricsError ? (
          <ErrorMessage title="Error loading metrics">
            {metricsError.message}
          </ErrorMessage>
        ) : metrics ? (
          <>
            {metrics.isAboveThreshold && (
              <WarningMessage
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                <AlertTriangle size={16} />
                High moderation activity detected! Threshold exceeded for:{" "}
                {metrics.thresholdExceededTypes.join(", ")}
              </WarningMessage>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "1rem",
              }}
            >
              <StatBlock
                value={String(metrics.totalActions)}
                label="Total Actions"
              />
              <StatBlock
                value={String(metrics.automatedActions)}
                label="Automated"
              />
              <StatBlock value={String(metrics.manualActions)} label="Manual" />
              <StatBlock
                value={metrics.hourlyActionRate.toFixed(1)}
                label="Actions/Hour"
              />
            </div>
          </>
        ) : (
          <InfoMessage>No metrics available</InfoMessage>
        )}
      </div>

      {/* Filters */}
      <div
        style={{
          padding: "1rem",
          border: `1px solid ${OS_LEGAL_COLORS.border}`,
          borderRadius: "8px",
          background: "white",
          marginBottom: "1rem",
        }}
      >
        <h4
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            margin: "0 0 0.5rem 0",
          }}
        >
          <Filter size={16} />
          Filters
        </h4>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <label>Action Type</label>
            <Dropdown
              selection
              options={ACTION_TYPE_OPTIONS}
              value={selectedActionType}
              onChange={(_, { value }) =>
                setSelectedActionType(value as string)
              }
            />
          </div>
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={automatedOnly}
                onChange={(e) => setAutomatedOnly(e.target.checked)}
              />
              Automated actions only
            </label>
          </div>
        </div>
      </div>

      {/* Actions Table */}
      <div
        style={{
          padding: "1rem",
          border: `1px solid ${OS_LEGAL_COLORS.border}`,
          borderRadius: "8px",
          background: "white",
          marginBottom: "1rem",
        }}
      >
        <h4
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            margin: "0 0 0.5rem 0",
          }}
        >
          <List size={16} />
          Moderation Actions
        </h4>
        {actionsLoading ? (
          <LoadingState message="Loading actions..." />
        ) : actionsError ? (
          <ErrorMessage title="Error loading actions">
            {actionsError.message}
          </ErrorMessage>
        ) : actions.length === 0 ? (
          <InfoMessage>No moderation actions found</InfoMessage>
        ) : (
          <>
            <Table celled striped>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Action</Table.HeaderCell>
                  <Table.HeaderCell>Target</Table.HeaderCell>
                  <Table.HeaderCell>Moderator</Table.HeaderCell>
                  <Table.HeaderCell>Reason</Table.HeaderCell>
                  <Table.HeaderCell>Time</Table.HeaderCell>
                  <Table.HeaderCell>Actions</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {actions.map(({ node }) => {
                  const { bg: actionBg, color: actionColor } = getActionColors(
                    node.actionType
                  );
                  return (
                    <Table.Row key={node.id}>
                      <Table.Cell>
                        <span
                          data-testid="action-badge"
                          style={{
                            display: "inline-block",
                            padding: "0.2em 0.5em",
                            fontSize: "0.8rem",
                            fontWeight: 500,
                            borderRadius: "4px",
                            background: actionBg,
                            color: actionColor,
                            border: "1px solid currentColor",
                          }}
                        >
                          {formatActionType(node.actionType)}
                        </span>
                        {node.isAutomated && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              marginLeft: "0.5rem",
                              padding: "0.15em 0.4em",
                              fontSize: "0.7rem",
                              fontWeight: 500,
                              background: "#f3e8ff",
                              color: "#7e22ce",
                              borderRadius: "4px",
                            }}
                          >
                            <Settings size={10} />
                            Auto
                          </span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {node.conversation && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                            }}
                          >
                            <MessagesSquare size={14} />
                            {node.conversation.title}
                          </div>
                        )}
                        {node.message && (
                          <div
                            style={{
                              fontSize: "0.9em",
                              color: OS_LEGAL_COLORS.textSecondary,
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                            }}
                          >
                            <MessageSquare size={12} />
                            {node.message.content.substring(0, 50)}...
                          </div>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {node.moderator ? (
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                            }}
                          >
                            <User size={14} />
                            {node.moderator.username}
                          </span>
                        ) : (
                          <span
                            style={{
                              color: "#888",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                            }}
                          >
                            <Settings size={14} />
                            System
                          </span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {node.reason || (
                          <span style={{ color: "#888" }}>
                            No reason provided
                          </span>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <span title={format(new Date(node.created), "PPpp")}>
                          {formatDistanceToNow(new Date(node.created), {
                            addSuffix: true,
                          })}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        {node.canRollback && (
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Undo2 size={14} />}
                            onClick={() => openRollbackModal(node)}
                          >
                            Rollback
                          </Button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table>
            {actionsData?.moderationActions?.pageInfo?.hasNextPage && (
              <div style={{ textAlign: "center", marginTop: "1rem" }}>
                <Button
                  variant="secondary"
                  leftIcon={<Plus size={14} />}
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? "Loading..." : "Load More"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Rollback Confirmation Modal */}
      <Modal
        open={rollbackModalOpen}
        onClose={() => setRollbackModalOpen(false)}
        size="sm"
      >
        <ModalHeader
          title={
            <span>
              <Undo2
                size={16}
                style={{ marginRight: "0.5rem", verticalAlign: "middle" }}
              />
              Confirm Rollback
            </span>
          }
          onClose={() => setRollbackModalOpen(false)}
        />
        <ModalBody>
          {selectedAction && (
            <>
              <p>
                Are you sure you want to rollback this{" "}
                <strong>{formatActionType(selectedAction.actionType)}</strong>{" "}
                action?
              </p>
              {selectedAction.conversation && (
                <p>
                  Thread: <strong>{selectedAction.conversation.title}</strong>
                </p>
              )}
              <div style={{ marginTop: "1rem" }}>
                <label>Reason for rollback (optional)</label>
                <Textarea
                  placeholder="Enter a reason for this rollback..."
                  value={rollbackReason}
                  onChange={(e) => setRollbackReason(e.target.value)}
                />
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => setRollbackModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            leftIcon={<Undo2 size={14} />}
            onClick={handleRollback}
            disabled={rollbackLoading}
          >
            {rollbackLoading ? "Rolling back..." : "Rollback"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default ModerationDashboard;
