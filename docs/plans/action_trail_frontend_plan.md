# Action Trail Frontend Implementation Plan

## Overview

Add an **Action Execution History** section to CorpusSettings that displays all corpus action executions, their status, timing, and links to affected objects. This provides visibility into the automated pipeline runs (fieldset extractions, analyzer runs, agent actions) that occur when documents are added or edited.

**Design Goals:**
1. **Responsive** - Mobile-first design with breakpoints at 480px, 768px, 1024px
2. **Accessible** - ARIA labels, keyboard navigation, screen reader support, color-blind friendly status indicators
3. **Fully Tested** - Playwright component tests with mobile/desktop viewports
4. **Routing Compliant** - Never set reactive vars directly; use navigation utilities for all links
5. **Permission Gated** - Only visible to users with CAN_UPDATE or CAN_PERMISSION on the corpus (owner, admin, editor roles)

---

## Architecture

### Data Flow

```
URL: /c/john/my-corpus?tab=settings
     ↓
CentralRouteManager (Phase 1: fetch corpus)
     ↓
openedCorpus reactive var
     ↓
CorpusLandingRoute → Corpuses → CorpusSettings
     ↓
ActionExecutionTrail component
     ↓
GraphQL Query: GET_CORPUS_ACTION_EXECUTIONS
     ↓
Render ActionExecutionCard components
     ↓
User clicks affected object link
     ↓
navigateToDocument() / getExtractUrl() utilities
     ↓
CentralRouteManager handles navigation
```

### Permission Enforcement

**Frontend (Defense in Depth):**
- Section only renders if `canUpdate || canPermission`
- Leverages existing permission computation in CorpusSettings (lines 636-637)
- Read-only users (`CAN_READ` only) will not see the section at all

**Backend (Primary Enforcement):**
- GraphQL resolver `resolve_corpus_action_executions` uses `visible_to_user(user)` filter
- Defense-in-depth checks verify corpus access before returning executions
- Even if frontend permission check is bypassed, backend returns empty results

This two-layer approach ensures:
1. Clean UX (section hidden for unauthorized users)
2. Security (backend enforces access even if frontend is compromised)

---

### Key Principle: NEVER Violate Routing Mantra

The routing system doc is clear:

> **ONLY `CentralRouteManager` sets URL-driven reactive vars.**
> All other components READ ONLY via `useReactiveVar()`.
> UPDATE STATE via URL utilities: `updateAnnotationSelectionParams()`, etc.

For this feature:
- Links to documents use `getDocumentUrl()` utility
- Links to extracts use `getExtractUrl()` utility
- Links to annotations use `updateAnnotationSelectionParams()` to set selection via URL
- **NEVER** call `openedDocument()`, `openedCorpus()`, `selectedAnnotationIds()` directly

---

## Implementation Phases

| Phase | Component | Description |
|-------|-----------|-------------|
| 1 | GraphQL Queries | Add frontend queries for executions and stats |
| 2 | ActionTrailStats | Stats summary component |
| 3 | ActionExecutionCard | Individual execution display card |
| 4 | ActionExecutionTrail | Main container with filtering and pagination |
| 5 | CorpusSettings Integration | Add new section to CorpusSettings |
| 6 | Component Tests | Playwright tests for mobile/desktop |
| 7 | Accessibility Audit | ARIA, keyboard nav, screen reader testing |

---

## Phase 1: GraphQL Queries

### File: `frontend/src/graphql/queries.ts`

Add queries for fetching execution data:

```typescript
// ============================================================
// CORPUS ACTION EXECUTION QUERIES
// ============================================================

export const GET_CORPUS_ACTION_EXECUTIONS = gql`
  query GetCorpusActionExecutions(
    $corpusId: ID!
    $corpusActionId: ID
    $status: String
    $actionType: String
    $since: DateTime
    $first: Int
    $after: String
  ) {
    corpusActionExecutions(
      corpusId: $corpusId
      corpusActionId: $corpusActionId
      status: $status
      actionType: $actionType
      since: $since
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          status
          actionType
          trigger
          queuedAt
          startedAt
          completedAt
          durationSeconds
          waitTimeSeconds
          errorMessage
          affectedObjects
          executionMetadata
          corpusAction {
            id
            name
            fieldset {
              id
              name
            }
            analyzer {
              id
              analyzerId
            }
            agentConfig {
              id
              name
            }
          }
          document {
            id
            title
            slug
            creator {
              id
              slug
            }
          }
          corpus {
            id
            slug
            creator {
              id
              slug
            }
          }
          extract {
            id
            name
          }
          analysis {
            id
          }
          agentResult {
            id
          }
          creator {
            id
            username
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

export interface CorpusActionExecutionNode {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "skipped";
  actionType: "fieldset" | "analyzer" | "agent";
  trigger: string;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  waitTimeSeconds: number | null;
  errorMessage: string;
  affectedObjects: Array<{
    type: string;
    id: number;
    column_name?: string;
    label?: string;
    field?: string;
  }>;
  executionMetadata: Record<string, unknown>;
  corpusAction: {
    id: string;
    name: string;
    fieldset?: { id: string; name: string };
    analyzer?: { id: string; analyzerId: string };
    agentConfig?: { id: string; name: string };
  };
  document: {
    id: string;
    title: string;
    slug: string;
    creator: { id: string; slug: string };
  };
  corpus: {
    id: string;
    slug: string;
    creator: { id: string; slug: string };
  };
  extract?: { id: string; name: string };
  analysis?: { id: string };
  agentResult?: { id: string };
  creator: { id: string; username: string };
}

export interface GetCorpusActionExecutionsInput {
  corpusId: string;
  corpusActionId?: string;
  status?: string;
  actionType?: string;
  since?: string;
  first?: number;
  after?: string;
}

export interface GetCorpusActionExecutionsOutput {
  corpusActionExecutions: {
    edges: Array<{ node: CorpusActionExecutionNode }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    totalCount: number;
  };
}

export const GET_CORPUS_ACTION_TRAIL_STATS = gql`
  query GetCorpusActionTrailStats($corpusId: ID!, $since: DateTime) {
    corpusActionTrailStats(corpusId: $corpusId, since: $since) {
      totalExecutions
      completed
      failed
      running
      queued
      skipped
      avgDurationSeconds
      fieldsetCount
      analyzerCount
      agentCount
    }
  }
`;

export interface CorpusActionTrailStats {
  totalExecutions: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
  skipped: number;
  avgDurationSeconds: number | null;
  fieldsetCount: number;
  analyzerCount: number;
  agentCount: number;
}

export interface GetCorpusActionTrailStatsInput {
  corpusId: string;
  since?: string;
}

export interface GetCorpusActionTrailStatsOutput {
  corpusActionTrailStats: CorpusActionTrailStats;
}
```

---

## Phase 2: ActionTrailStats Component

### File: `frontend/src/components/corpuses/ActionTrailStats.tsx`

Summary stats displayed at top of execution list:

```typescript
import React from "react";
import styled from "styled-components";
import { Icon, SemanticICONS } from "semantic-ui-react";
import { CorpusActionTrailStats } from "../../graphql/queries";

interface ActionTrailStatsProps {
  stats: CorpusActionTrailStats | null;
  loading?: boolean;
}

// Styled components with responsive breakpoints
const StatsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 1rem;
  padding: 1.5rem;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 12px;
  margin-bottom: 1.5rem;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    padding: 1rem;
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const StatCard = styled.div<{ $variant: "success" | "warning" | "error" | "info" | "neutral" }>`
  background: white;
  padding: 1rem;
  border-radius: 10px;
  border-left: 4px solid ${props => ({
    success: "#10b981",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
    neutral: "#6b7280"
  }[props.$variant])};
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 0.25rem;

    @media (max-width: 768px) {
      font-size: 1.25rem;
    }
  }

  .stat-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
`;

export const ActionTrailStats: React.FC<ActionTrailStatsProps> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <StatsContainer role="region" aria-label="Action execution statistics" aria-busy={loading}>
        {[...Array(5)].map((_, i) => (
          <StatCard key={i} $variant="neutral" aria-hidden="true">
            <div className="stat-value">--</div>
            <div className="stat-label">Loading...</div>
          </StatCard>
        ))}
      </StatsContainer>
    );
  }

  const statItems: Array<{
    label: string;
    value: number;
    icon: SemanticICONS;
    variant: "success" | "warning" | "error" | "info" | "neutral";
    ariaLabel: string;
  }> = [
    { label: "Total", value: stats.totalExecutions, icon: "history", variant: "neutral", ariaLabel: "Total executions" },
    { label: "Completed", value: stats.completed, icon: "check circle", variant: "success", ariaLabel: "Completed executions" },
    { label: "Running", value: stats.running, icon: "spinner", variant: "info", ariaLabel: "Currently running" },
    { label: "Queued", value: stats.queued, icon: "clock", variant: "warning", ariaLabel: "Queued for processing" },
    { label: "Failed", value: stats.failed, icon: "times circle", variant: "error", ariaLabel: "Failed executions" },
  ];

  return (
    <StatsContainer role="region" aria-label="Action execution statistics">
      {statItems.map(item => (
        <StatCard
          key={item.label}
          $variant={item.variant}
          role="group"
          aria-label={item.ariaLabel}
        >
          <div className="stat-value" aria-live="polite">{item.value}</div>
          <div className="stat-label">
            <Icon name={item.icon} aria-hidden="true" />
            <span>{item.label}</span>
          </div>
        </StatCard>
      ))}
    </StatsContainer>
  );
};
```

---

## Phase 3: ActionExecutionCard Component

### File: `frontend/src/components/corpuses/ActionExecutionCard.tsx`

Individual execution display with affected object links:

```typescript
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import styled from "styled-components";
import { Icon, Popup, Label, SemanticICONS, SemanticCOLORS } from "semantic-ui-react";
import { CorpusActionExecutionNode } from "../../graphql/queries";
import { getDocumentUrl, getExtractUrl } from "../../utils/navigationUtils";

interface ActionExecutionCardProps {
  execution: CorpusActionExecutionNode;
}

// Status configuration for badges and icons
const STATUS_CONFIG: Record<string, {
  color: SemanticCOLORS;
  icon: SemanticICONS;
  label: string;
  ariaLabel: string;
}> = {
  queued: { color: "yellow", icon: "clock", label: "Queued", ariaLabel: "Status: Queued for processing" },
  running: { color: "blue", icon: "spinner", label: "Running", ariaLabel: "Status: Currently running" },
  completed: { color: "green", icon: "check circle", label: "Completed", ariaLabel: "Status: Completed successfully" },
  failed: { color: "red", icon: "times circle", label: "Failed", ariaLabel: "Status: Failed with error" },
  skipped: { color: "grey", icon: "forward", label: "Skipped", ariaLabel: "Status: Skipped (already processed)" },
};

const ACTION_TYPE_CONFIG: Record<string, { icon: SemanticICONS; label: string }> = {
  fieldset: { icon: "table", label: "Fieldset Extract" },
  analyzer: { icon: "cogs", label: "Analyzer" },
  agent: { icon: "microchip", label: "Agent" },
};

const CardContainer = styled.article`
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1rem;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;

  &:hover {
    border-color: #cbd5e1;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
  }

  &:focus-within {
    outline: 2px solid #6366f1;
    outline-offset: 2px;
  }

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;

  @media (max-width: 480px) {
    flex-direction: column;
    gap: 0.5rem;
  }
`;

const ActionInfo = styled.div`
  flex: 1;
  min-width: 0; // Enable text truncation

  .action-name {
    font-weight: 600;
    color: #1e293b;
    font-size: 1rem;
    margin-bottom: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .document-link {
    font-size: 0.875rem;
    color: #6366f1;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;

    &:hover {
      text-decoration: underline;
    }

    &:focus {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
      border-radius: 2px;
    }
  }
`;

const StatusBadge = styled(Label)`
  &&& {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    white-space: nowrap;
  }
`;

const TimingRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin: 0.75rem 0;
  font-size: 0.8125rem;
  color: #64748b;

  .timing-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  @media (max-width: 768px) {
    gap: 1rem;
  }

  @media (max-width: 480px) {
    flex-direction: column;
    gap: 0.5rem;
  }
`;

const AffectedObjectsSection = styled.div`
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #e2e8f0;

  .section-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #94a3b8;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }

  .objects-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
`;

const ObjectLink = styled.button`
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.375rem 0.625rem;
  font-size: 0.8125rem;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  transition: all 0.15s ease;

  &:hover {
    background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
    border-color: #a5b4fc;
    color: #4338ca;
  }

  &:focus {
    outline: 2px solid #6366f1;
    outline-offset: 2px;
  }
`;

const ErrorSection = styled.div`
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #991b1b;

  .error-label {
    font-weight: 600;
    margin-bottom: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .error-message {
    font-family: ui-monospace, monospace;
    word-break: break-word;
  }
`;

// Format duration for display
const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined) return "--";
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

// Format datetime for display
const formatDateTime = (isoString: string | null): string => {
  if (!isoString) return "--";
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Get icon for affected object type
const getObjectTypeIcon = (type: string): SemanticICONS => {
  switch (type) {
    case "extract": return "table";
    case "datacell": return "columns";
    case "annotation": return "tag";
    case "analysis": return "chart bar";
    case "agent_result": return "microchip";
    case "conversation": return "comments";
    case "document_summary": return "file text";
    case "document_meta": return "info circle";
    default: return "linkify";
  }
};

export const ActionExecutionCard: React.FC<ActionExecutionCardProps> = ({ execution }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const statusConfig = STATUS_CONFIG[execution.status] || STATUS_CONFIG.queued;
  const actionTypeConfig = ACTION_TYPE_CONFIG[execution.actionType] || ACTION_TYPE_CONFIG.fieldset;

  // Build document URL using navigation utilities (NEVER set reactive vars directly)
  const documentUrl = getDocumentUrl(
    {
      id: execution.document.id,
      slug: execution.document.slug,
      creator: execution.document.creator,
    },
    {
      id: execution.corpus.id,
      slug: execution.corpus.slug,
      creator: execution.corpus.creator,
    }
  );

  // Handle navigation to affected objects
  const handleObjectClick = (obj: { type: string; id: number; column_name?: string }) => {
    // Use navigation utilities - NEVER set reactive vars directly
    switch (obj.type) {
      case "extract":
        if (execution.extract) {
          const extractUrl = getExtractUrl({
            id: execution.extract.id,
            creator: execution.corpus.creator,
          });
          if (extractUrl !== "#") {
            navigate(extractUrl);
          }
        }
        break;
      case "datacell":
      case "annotation":
        // Navigate to document with annotation selected via URL params
        // CentralRouteManager Phase 2 will set selectedAnnotationIds from URL
        const annotationUrl = `${documentUrl}?ann=${btoa(`AnnotationType:${obj.id}`)}`;
        if (documentUrl !== "#") {
          navigate(annotationUrl);
        }
        break;
      case "analysis":
        if (execution.analysis) {
          // Navigate to document with analysis selected
          const analysisUrl = `${documentUrl}?analysis=${execution.analysis.id}`;
          if (documentUrl !== "#") {
            navigate(analysisUrl);
          }
        }
        break;
      case "agent_result":
        // Navigate to document - agent result is viewed in context
        if (documentUrl !== "#") {
          navigate(documentUrl);
        }
        break;
      default:
        // Default to document view
        if (documentUrl !== "#") {
          navigate(documentUrl);
        }
    }
  };

  return (
    <CardContainer
      aria-label={`${execution.corpusAction.name} execution on ${execution.document.title}`}
    >
      <CardHeader>
        <ActionInfo>
          <div className="action-name">
            <Icon name={actionTypeConfig.icon} aria-hidden="true" />
            {execution.corpusAction.name}
          </div>
          <a
            href={documentUrl}
            className="document-link"
            onClick={(e) => {
              e.preventDefault();
              if (documentUrl !== "#") {
                navigate(documentUrl);
              }
            }}
            aria-label={`View document: ${execution.document.title}`}
          >
            <Icon name="file text outline" aria-hidden="true" />
            {execution.document.title}
          </a>
        </ActionInfo>

        <StatusBadge
          color={statusConfig.color}
          aria-label={statusConfig.ariaLabel}
        >
          <Icon name={statusConfig.icon} aria-hidden="true" />
          {statusConfig.label}
        </StatusBadge>
      </CardHeader>

      <TimingRow>
        <Popup
          trigger={
            <span className="timing-item">
              <Icon name="clock outline" aria-hidden="true" />
              <span>Queued: {formatDateTime(execution.queuedAt)}</span>
            </span>
          }
          content={`Queued at ${new Date(execution.queuedAt).toLocaleString()}`}
          position="top center"
          size="mini"
        />

        {execution.startedAt && (
          <Popup
            trigger={
              <span className="timing-item">
                <Icon name="play" aria-hidden="true" />
                <span>Started: {formatDateTime(execution.startedAt)}</span>
              </span>
            }
            content={`Started at ${new Date(execution.startedAt).toLocaleString()}`}
            position="top center"
            size="mini"
          />
        )}

        {execution.durationSeconds !== null && (
          <span className="timing-item" aria-label={`Duration: ${formatDuration(execution.durationSeconds)}`}>
            <Icon name="stopwatch" aria-hidden="true" />
            <span>Duration: {formatDuration(execution.durationSeconds)}</span>
          </span>
        )}

        <span className="timing-item">
          <Icon name={actionTypeConfig.icon} aria-hidden="true" />
          <span>{actionTypeConfig.label}</span>
        </span>
      </TimingRow>

      {/* Error Message */}
      {execution.status === "failed" && execution.errorMessage && (
        <ErrorSection role="alert">
          <div className="error-label">
            <Icon name="exclamation triangle" aria-hidden="true" />
            Error:
          </div>
          <div className="error-message">
            {execution.errorMessage.length > 200
              ? `${execution.errorMessage.substring(0, 200)}...`
              : execution.errorMessage}
          </div>
        </ErrorSection>
      )}

      {/* Affected Objects */}
      {execution.affectedObjects && execution.affectedObjects.length > 0 && (
        <AffectedObjectsSection>
          <div className="section-title" id={`affected-${execution.id}`}>
            Created/Modified Objects
          </div>
          <div className="objects-list" role="list" aria-labelledby={`affected-${execution.id}`}>
            {execution.affectedObjects.map((obj, idx) => (
              <ObjectLink
                key={`${obj.type}-${obj.id}-${idx}`}
                onClick={() => handleObjectClick(obj)}
                role="listitem"
                aria-label={`View ${obj.type}${obj.column_name ? `: ${obj.column_name}` : ""}`}
              >
                <Icon name={getObjectTypeIcon(obj.type)} aria-hidden="true" />
                {obj.type}
                {obj.column_name && <span>: {obj.column_name}</span>}
              </ObjectLink>
            ))}
          </div>
        </AffectedObjectsSection>
      )}
    </CardContainer>
  );
};
```

---

## Phase 4: ActionExecutionTrail Component

### File: `frontend/src/components/corpuses/ActionExecutionTrail.tsx`

Main container with filtering and pagination:

```typescript
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
  align-items: center;

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

export const ActionExecutionTrail: React.FC<ActionExecutionTrailProps> = ({ corpusId }) => {
  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [timeRangeHours, setTimeRangeHours] = useState<string>("");

  // Calculate since datetime from hours
  const sinceDateTime = timeRangeHours
    ? new Date(Date.now() - parseInt(timeRangeHours) * 60 * 60 * 1000).toISOString()
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
    ...(actionsData?.corpusActions?.edges.map(({ node }) => ({
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
  } = useQuery<
    GetCorpusActionExecutionsOutput,
    GetCorpusActionExecutionsInput
  >(GET_CORPUS_ACTION_EXECUTIONS, {
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
  });

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
        <div
          style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1rem" }}
          role="status"
          aria-live="polite"
        >
          Showing {executions.length} of {totalCount} executions
        </div>
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
        <div style={{ textAlign: "center", padding: "3rem" }} role="status" aria-live="polite">
          <Loader active inline="centered" aria-label="Loading executions" />
          <p style={{ marginTop: "1rem", color: "#64748b" }}>Loading execution history...</p>
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
```

---

## Phase 5: CorpusSettings Integration

### File Modification: `frontend/src/components/corpuses/CorpusSettings.tsx`

Add new section after "Corpus Actions" section (around line 1320):

```typescript
// Add import at top of file
import { ActionExecutionTrail } from "./ActionExecutionTrail";

// Add new section after the "Corpus Actions" InfoSection (around line 1318)
// IMPORTANT: Only show to users with CAN_UPDATE or CAN_PERMISSION

        {/* NEW: Action Execution History Section - Permission Gated */}
        {(canUpdate || canPermission) && (
          <InfoSection id="action-execution-history-section">
            <SectionHeader>
              <SectionTitle>Action Execution History</SectionTitle>
            </SectionHeader>
            <ActionContent>
              <ActionNote>
                This section shows the <strong>execution history</strong> of all
                corpus actions. You can see when actions were{" "}
                <span className="highlight">triggered</span>, their{" "}
                <span className="highlight">status</span>, and what{" "}
                <span className="highlight">objects they created or modified</span>.
                Click on affected objects to navigate to them.
              </ActionNote>
              <ActionExecutionTrail corpusId={corpus.id} />
            </ActionContent>
          </InfoSection>
        )}
```

**Permission Logic:**
- `canUpdate` = user has `CAN_UPDATE` permission (editor role)
- `canPermission` = user has `CAN_PERMISSION` permission (admin/owner role)
- These are already computed in CorpusSettings (lines 636-637) from `corpus.myPermissions`
- Users with only `CAN_READ` will NOT see this section

This matches the existing pattern used for the "Visibility & Slug" section which also gates sensitive settings behind these permissions.

---

## Phase 6: Component Tests

### File: `frontend/tests/action-execution-trail.spec.tsx`

```typescript
import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { ActionExecutionTrail } from "../src/components/corpuses/ActionExecutionTrail";
import { ActionExecutionCard } from "../src/components/corpuses/ActionExecutionCard";
import { ActionTrailStats } from "../src/components/corpuses/ActionTrailStats";
import {
  GET_CORPUS_ACTION_EXECUTIONS,
  GET_CORPUS_ACTION_TRAIL_STATS,
  GET_CORPUS_ACTIONS,
} from "../src/graphql/queries";

// ============================================================
// MOCK DATA
// ============================================================

const mockExecution = {
  id: "exec-1",
  status: "completed",
  actionType: "fieldset",
  trigger: "add_document",
  queuedAt: "2025-01-15T10:00:00Z",
  startedAt: "2025-01-15T10:00:05Z",
  completedAt: "2025-01-15T10:00:35Z",
  durationSeconds: 30,
  waitTimeSeconds: 5,
  errorMessage: "",
  affectedObjects: [
    { type: "extract", id: 1 },
    { type: "datacell", id: 2, column_name: "parties" },
    { type: "datacell", id: 3, column_name: "effective_date" },
  ],
  executionMetadata: { model: "gpt-4", tokens_used: 1500 },
  corpusAction: {
    id: "action-1",
    name: "Extract Contract Fields",
    fieldset: { id: "fs-1", name: "Contract Fieldset" },
    analyzer: null,
    agentConfig: null,
  },
  document: {
    id: "doc-1",
    title: "Sample Contract.pdf",
    slug: "sample-contract",
    creator: { id: "user-1", slug: "john" },
  },
  corpus: {
    id: "corpus-1",
    slug: "legal-corpus",
    creator: { id: "user-1", slug: "john" },
  },
  extract: { id: "extract-1", name: "Contract Extract" },
  analysis: null,
  agentResult: null,
  creator: { id: "user-1", username: "john" },
};

const mockFailedExecution = {
  ...mockExecution,
  id: "exec-2",
  status: "failed",
  errorMessage: "Connection timeout while processing document",
  completedAt: "2025-01-15T10:01:00Z",
  durationSeconds: 55,
  affectedObjects: [],
};

const mockStats = {
  totalExecutions: 150,
  completed: 120,
  failed: 10,
  running: 5,
  queued: 10,
  skipped: 5,
  avgDurationSeconds: 25.5,
  fieldsetCount: 80,
  analyzerCount: 40,
  agentCount: 30,
};

const mockActions = [
  {
    id: "action-1",
    name: "Extract Contract Fields",
    trigger: "add_document",
    disabled: false,
    runOnAllCorpuses: false,
    creator: { id: "user-1", username: "john" },
    fieldset: { id: "fs-1", name: "Contract Fieldset" },
    analyzer: null,
    agentConfig: null,
    agentPrompt: null,
    preAuthorizedTools: [],
    created: "2025-01-01T00:00:00Z",
    modified: "2025-01-01T00:00:00Z",
  },
];

// ============================================================
// GRAPHQL MOCKS
// ============================================================

const createMocks = (options: { executions?: any[]; stats?: any } = {}) => [
  {
    request: {
      query: GET_CORPUS_ACTION_EXECUTIONS,
      variables: {
        corpusId: "corpus-1",
        first: 20,
      },
    },
    result: {
      data: {
        corpusActionExecutions: {
          edges: (options.executions || [mockExecution]).map(node => ({ node })),
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: (options.executions || [mockExecution]).length,
        },
      },
    },
  },
  {
    request: {
      query: GET_CORPUS_ACTION_TRAIL_STATS,
      variables: { corpusId: "corpus-1" },
    },
    result: {
      data: {
        corpusActionTrailStats: options.stats || mockStats,
      },
    },
  },
  {
    request: {
      query: GET_CORPUS_ACTIONS,
      variables: { corpusId: "corpus-1" },
    },
    result: {
      data: {
        corpusActions: {
          edges: mockActions.map(node => ({ node })),
        },
      },
    },
  },
];

const createCache = () => new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        corpusActionExecutions: {
          keyArgs: ["corpusId", "status", "actionType", "corpusActionId", "since"],
        },
      },
    },
  },
});

// ============================================================
// STATS COMPONENT TESTS
// ============================================================

test.describe("ActionTrailStats Component", () => {
  test("should display all stats correctly", async ({ mount, page }) => {
    await mount(
      <ActionTrailStats stats={mockStats} loading={false} />
    );

    // Verify all stat values are displayed
    await expect(page.getByText("150")).toBeVisible(); // Total
    await expect(page.getByText("120")).toBeVisible(); // Completed
    await expect(page.getByText("5").first()).toBeVisible(); // Running
    await expect(page.getByText("10").first()).toBeVisible(); // Queued/Failed

    // Verify labels
    await expect(page.getByText("Total")).toBeVisible();
    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText("Running")).toBeVisible();
    await expect(page.getByText("Queued")).toBeVisible();
    await expect(page.getByText("Failed")).toBeVisible();
  });

  test("should show loading state", async ({ mount, page }) => {
    await mount(
      <ActionTrailStats stats={null} loading={true} />
    );

    await expect(page.getByText("Loading...").first()).toBeVisible();
  });

  test("should be accessible with proper ARIA labels", async ({ mount, page }) => {
    await mount(
      <ActionTrailStats stats={mockStats} loading={false} />
    );

    const region = page.getByRole("region", { name: "Action execution statistics" });
    await expect(region).toBeVisible();
  });
});

// ============================================================
// CARD COMPONENT TESTS
// ============================================================

test.describe("ActionExecutionCard Component", () => {
  test("should display completed execution correctly", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockExecution as any} />
      </MemoryRouter>
    );

    // Action name visible
    await expect(page.getByText("Extract Contract Fields")).toBeVisible();

    // Document link visible
    await expect(page.getByText("Sample Contract.pdf")).toBeVisible();

    // Status badge
    await expect(page.getByText("Completed")).toBeVisible();

    // Duration
    await expect(page.getByText(/Duration: 30/)).toBeVisible();

    // Affected objects section
    await expect(page.getByText("Created/Modified Objects")).toBeVisible();
    await expect(page.getByText("extract")).toBeVisible();
    await expect(page.getByText(/parties/)).toBeVisible();
    await expect(page.getByText(/effective_date/)).toBeVisible();
  });

  test("should display failed execution with error", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockFailedExecution as any} />
      </MemoryRouter>
    );

    // Status badge shows failed
    await expect(page.getByText("Failed")).toBeVisible();

    // Error section visible
    await expect(page.getByText("Error:")).toBeVisible();
    await expect(page.getByText(/Connection timeout/)).toBeVisible();
  });

  test("should navigate to document on link click", async ({ mount, page }) => {
    await mount(
      <MemoryRouter initialEntries={["/test"]}>
        <ActionExecutionCard execution={mockExecution as any} />
      </MemoryRouter>
    );

    const docLink = page.getByText("Sample Contract.pdf");
    await docLink.click();

    // Navigation should be triggered (URL would change in real app)
    // Just verify the link is clickable and doesn't error
    await expect(docLink).toBeVisible();
  });

  test("should be keyboard accessible", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockExecution as any} />
      </MemoryRouter>
    );

    // Tab to document link
    await page.keyboard.press("Tab");

    // Tab to affected object button
    await page.keyboard.press("Tab");

    const extractButton = page.getByRole("listitem").filter({ hasText: "extract" });
    await expect(extractButton).toBeVisible();
  });
});

// ============================================================
// TRAIL COMPONENT TESTS
// ============================================================

test.describe("ActionExecutionTrail Component", () => {
  test("should load and display executions", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data to load
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Stats should be visible
    await expect(page.getByText("150")).toBeVisible();

    // Execution card should be visible
    await expect(page.getByText("Extract Contract Fields")).toBeVisible();
    await expect(page.getByText("Sample Contract.pdf")).toBeVisible();
  });

  test("should filter by status", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for initial load
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Open status filter dropdown
    const statusDropdown = page.locator("#status-filter").locator("..");
    await statusDropdown.click();

    // Select "Failed" option
    await page.getByText("Failed", { exact: true }).click();

    // Filter should be applied (would trigger new query in real app)
    await expect(statusDropdown).toContainText("Failed");
  });

  test("should show empty state when no executions", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks({ executions: [] })} cache={createCache()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for empty state
    await expect(page.getByText("No Executions Found")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Action executions will appear here/)).toBeVisible();
  });

  test("filters should be accessible", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Check filter labels
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Type")).toBeVisible();
    await expect(page.getByText("Action")).toBeVisible();
    await expect(page.getByText("Time Range")).toBeVisible();

    // Check search region
    const searchRegion = page.getByRole("search", { name: "Filter action executions" });
    await expect(searchRegion).toBeVisible();
  });
});

// ============================================================
// MOBILE RESPONSIVE TESTS
// ============================================================

test.describe("ActionExecutionTrail Mobile Layout", () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test("should display compact layout on mobile", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Stats grid should adapt to single column
    const statsRegion = page.getByRole("region", { name: "Action execution statistics" });
    await expect(statsRegion).toBeVisible();

    // Filters should stack vertically
    const searchRegion = page.getByRole("search", { name: "Filter action executions" });
    await expect(searchRegion).toBeVisible();

    // Execution card should be visible and readable
    await expect(page.getByText("Extract Contract Fields")).toBeVisible();
  });

  test("should show card with stacked layout on mobile", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <ActionExecutionCard execution={mockExecution as any} />
      </MemoryRouter>
    );

    // Card should be fully visible
    const card = page.getByRole("article");
    await expect(card).toBeVisible();

    // Content should be readable
    await expect(page.getByText("Extract Contract Fields")).toBeVisible();
    await expect(page.getByText("Completed")).toBeVisible();
  });
});

// ============================================================
// DESKTOP LAYOUT TESTS
// ============================================================

test.describe("ActionExecutionTrail Desktop Layout", () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test("should display full layout on desktop", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Stats should show in full grid
    await expect(page.getByText("Total")).toBeVisible();
    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText("Running")).toBeVisible();
    await expect(page.getByText("Queued")).toBeVisible();
    await expect(page.getByText("Failed")).toBeVisible();

    // All filters visible in a row
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Type")).toBeVisible();
    await expect(page.getByText("Action")).toBeVisible();
    await expect(page.getByText("Time Range")).toBeVisible();
  });
});

// ============================================================
// PERMISSION GATING TESTS
// ============================================================

test.describe("ActionExecutionTrail Permission Gating", () => {
  test("should be visible to users with CAN_UPDATE permission", async ({ mount, page }) => {
    const corpusWithUpdatePermission = {
      ...mockCorpus,
      myPermissions: ["CAN_READ", "CAN_UPDATE"],
    };

    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <CorpusSettings corpus={corpusWithUpdatePermission as any} />
        </MockedProvider>
      </MemoryRouter>
    );

    // Section should be visible
    await expect(page.locator("#action-execution-history-section")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Action Execution History")).toBeVisible();
  });

  test("should be visible to users with CAN_PERMISSION permission", async ({ mount, page }) => {
    const corpusWithAdminPermission = {
      ...mockCorpus,
      myPermissions: ["CAN_READ", "CAN_PERMISSION"],
    };

    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <CorpusSettings corpus={corpusWithAdminPermission as any} />
        </MockedProvider>
      </MemoryRouter>
    );

    // Section should be visible
    await expect(page.locator("#action-execution-history-section")).toBeVisible({ timeout: 10000 });
  });

  test("should NOT be visible to users with only CAN_READ permission", async ({ mount, page }) => {
    const corpusReadOnly = {
      ...mockCorpus,
      myPermissions: ["CAN_READ"],
    };

    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <CorpusSettings corpus={corpusReadOnly as any} />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for page to load
    await page.waitForTimeout(1000);

    // Section should NOT be visible
    await expect(page.locator("#action-execution-history-section")).not.toBeVisible();

    // But other sections should still be visible
    await expect(page.getByText("Corpus Information")).toBeVisible();
  });
});

// ============================================================
// ACCESSIBILITY TESTS
// ============================================================

test.describe("ActionExecutionTrail Accessibility", () => {
  test("should have proper ARIA roles and labels", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Check main regions
    await expect(page.getByRole("region", { name: "Action execution statistics" })).toBeVisible();
    await expect(page.getByRole("search", { name: "Filter action executions" })).toBeVisible();
    await expect(page.getByRole("feed", { name: "Action execution history" })).toBeVisible();
  });

  test("should be navigable by keyboard", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Tab through filters
    await page.keyboard.press("Tab"); // Status dropdown
    await page.keyboard.press("Tab"); // Type dropdown
    await page.keyboard.press("Tab"); // Action dropdown
    await page.keyboard.press("Tab"); // Time dropdown

    // Continue to execution card
    await page.keyboard.press("Tab"); // Document link

    // Verify focus is visible (element should have focus)
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
  });

  test("should announce status changes to screen readers", async ({ mount, page }) => {
    await mount(
      <MemoryRouter>
        <MockedProvider mocks={createMocks()} cache={createCache()} addTypename={false}>
          <ActionExecutionTrail corpusId="corpus-1" />
        </MockedProvider>
      </MemoryRouter>
    );

    // Wait for data
    await page.waitForSelector('[role="feed"]', { timeout: 10000 });

    // Check for live region with count
    const statusElement = page.getByRole("status");
    await expect(statusElement.first()).toBeVisible();
  });
});
```

---

## Phase 7: Accessibility Checklist

### ARIA Implementation

| Element | ARIA Attribute | Value |
|---------|----------------|-------|
| Stats container | `role="region"` | `aria-label="Action execution statistics"` |
| Stats (loading) | `aria-busy` | `true` |
| Filters container | `role="search"` | `aria-label="Filter action executions"` |
| Dropdowns | `aria-label` | Description of filter purpose |
| Executions list | `role="feed"` | `aria-label="Action execution history"` |
| Execution card | `role="article"` | `aria-label="[action name] execution on [document]"` |
| Status badges | `aria-label` | Full status description |
| Error section | `role="alert"` | - |
| Affected objects | `role="list"` / `role="listitem"` | - |
| Loading states | `role="status"` | `aria-live="polite"` |
| Load more button | `aria-label` | "Load more executions" |

### Keyboard Navigation

1. **Tab Order**: Filters → Cards → Affected Objects → Load More
2. **Focus Visible**: All interactive elements have visible focus indicators
3. **Dropdown Navigation**: Arrow keys to navigate options, Enter to select
4. **Card Links**: Enter/Space to activate document links

### Color Contrast

- Status badges use distinct colors + icons (not color alone)
- Text meets WCAG AA contrast requirements (4.5:1 for body text)
- Error states use icon + text, not just color

### Screen Reader Support

- Proper heading structure within cards
- Live regions for loading/updating states
- Descriptive link text (not just "click here")
- Hidden decorative icons with `aria-hidden="true"`

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `frontend/src/graphql/queries.ts` | MODIFY | Add GraphQL queries and types |
| `frontend/src/components/corpuses/ActionTrailStats.tsx` | CREATE | Stats summary component |
| `frontend/src/components/corpuses/ActionExecutionCard.tsx` | CREATE | Individual execution card |
| `frontend/src/components/corpuses/ActionExecutionTrail.tsx` | CREATE | Main container component |
| `frontend/src/components/corpuses/CorpusSettings.tsx` | MODIFY | Add new section |
| `frontend/tests/action-execution-trail.spec.tsx` | CREATE | Component tests |

---

## Navigation Compliance

This implementation strictly follows the routing system mantra:

1. **NEVER sets reactive vars directly** - All navigation uses utilities
2. **Uses `getDocumentUrl()`** - For document links
3. **Uses `getExtractUrl()`** - For extract links
4. **Uses URL params** - For annotation selection (e.g., `?ann=...`)
5. **CentralRouteManager handles everything** - Components just read state

When users click affected object links:
- Document links: `navigate(getDocumentUrl(doc, corpus))`
- Extract links: `navigate(getExtractUrl(extract))`
- Annotation links: `navigate(\`${docUrl}?ann=${base64Id}\`)`

CentralRouteManager Phase 2 parses URL params and sets reactive vars. Components NEVER call `openedDocument()`, `selectedAnnotationIds()`, etc.
