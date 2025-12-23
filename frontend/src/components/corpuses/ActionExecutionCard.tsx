import React from "react";
import { Icon, Label, SemanticICONS } from "semantic-ui-react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import {
  CorpusActionExecutionNode,
  AffectedObjectEntry,
} from "../../graphql/queries";
import { getDocumentUrl, getExtractUrl } from "../../utils/navigationUtils";

/**
 * Status configuration for execution status badges
 */
const STATUS_CONFIG: Record<
  "queued" | "running" | "completed" | "failed" | "skipped",
  { color: string; icon: SemanticICONS; label: string }
> = {
  queued: { color: "yellow", icon: "clock", label: "Queued" },
  running: { color: "blue", icon: "spinner", label: "Running" },
  completed: { color: "green", icon: "check circle", label: "Completed" },
  failed: { color: "red", icon: "times circle", label: "Failed" },
  skipped: { color: "grey", icon: "forward", label: "Skipped" },
};

/**
 * Action type configuration for action type badges
 */
const ACTION_TYPE_CONFIG: Record<
  "fieldset" | "analyzer" | "agent",
  { icon: SemanticICONS; label: string }
> = {
  fieldset: { icon: "table", label: "Fieldset Extract" },
  analyzer: { icon: "cogs", label: "Analyzer" },
  agent: { icon: "microchip", label: "Agent" },
};

/**
 * Formats duration from seconds to human-readable string
 * @param seconds - Duration in seconds (can be null)
 * @returns Formatted duration string (e.g., "30s", "2m 15s", "1h 30m")
 */
function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";

  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Formats ISO datetime string to human-readable format
 * @param isoString - ISO datetime string
 * @returns Formatted datetime string (e.g., "Jan 15, 10:30 AM")
 */
function formatDateTime(isoString: string | null): string {
  if (!isoString) return "—";

  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Gets semantic-ui icon name based on object type
 * @param type - Object type (e.g., "annotation", "extract", "analysis")
 * @returns Semantic-ui icon name
 */
function getObjectTypeIcon(type: string | undefined | null): SemanticICONS {
  if (!type) return "question circle";

  const iconMap: Record<string, SemanticICONS> = {
    annotation: "tag",
    extract: "database",
    analysis: "chart bar",
    document: "file",
    relationship: "arrows alternate horizontal",
    column: "table",
    datacell: "grid layout",
  };

  return iconMap[type.toLowerCase()] || "question circle";
}

/**
 * Styled components
 */
const Card = styled.div`
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 16px;
  padding: 1.75rem;
  margin: 1.25rem 0;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  border: 1px solid #e5e7eb;
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08), 0 4px 10px rgba(0, 0, 0, 0.05);
    border-color: #ddd6fe;
  }

  &::before {
    content: "";
    position: absolute;
    left: -2rem;
    top: 50%;
    width: 1.5rem;
    height: 2px;
    background: linear-gradient(90deg, #a78bfa, #818cf8);
  }

  &::after {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, #8b5cf6 0%, #6366f1 100%);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  &:hover::after {
    opacity: 1;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    padding: 1.25rem;
    margin: 1rem 0;

    &::before {
      display: none; /* Hide connector line on mobile */
    }

    /* Disable hover transform on touch devices */
    @media (hover: none) {
      &:hover {
        transform: none;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.08);
      }
    }
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  gap: 1rem;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
  }
`;

const TitleSection = styled.div`
  flex: 1;
  min-width: 0;
`;

const ActionName = styled.h3`
  margin: 0 0 0.5rem 0;
  color: #111827;
  font-size: 1.125rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const DocumentLink = styled.button`
  background: none;
  border: none;
  color: #6366f1;
  font-size: 0.9375rem;
  cursor: pointer;
  padding: 0;
  text-decoration: none;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;

  &:hover {
    color: #4f46e5;
    text-decoration: underline;
  }

  &:focus {
    outline: 2px solid #6366f1;
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

const BadgeGroup = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const MetadataGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1.5rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const MetadataItem = styled.div`
  .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #94a3b8;
    margin-bottom: 0.375rem;
    font-weight: 600;
  }

  .value {
    font-size: 0.9375rem;
    color: #0f172a;
    font-weight: 600;
    line-height: 1.4;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
`;

const AffectedObjectsSection = styled.div`
  margin-top: 1.25rem;
  padding: 1rem;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 8px;
  border: 1px solid #e2e8f0;
`;

const SectionTitle = styled.h4`
  font-size: 0.875rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin: 0 0 0.75rem 0;
  font-weight: 600;
`;

const ObjectList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const ObjectChip = styled.button`
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;

  &:hover {
    background: #f1f5f9;
    border-color: #94a3b8;
    color: #1e293b;
  }

  &:focus {
    outline: 2px solid #6366f1;
    outline-offset: 2px;
    border-radius: 6px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ErrorSection = styled.div`
  margin-top: 1.25rem;
  padding: 1rem;
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
  border-radius: 8px;
  border: 1px solid #fca5a5;
  border-left: 4px solid #dc2626;
`;

const ErrorText = styled.pre`
  margin: 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 0.8125rem;
  color: #991b1b;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
`;

/**
 * Component props
 */
interface ActionExecutionCardProps {
  execution: CorpusActionExecutionNode;
}

/**
 * ActionExecutionCard component for displaying individual corpus action executions
 *
 * Displays execution info including:
 * - Action name, document link, status badge, timing, affected objects
 * - Status badges with icons and colors (queued/running/completed/failed/skipped)
 * - Clickable document links using navigation utilities
 * - Affected objects section with clickable links
 * - Error section for failed executions
 * - Responsive layout that stacks on mobile
 * - Full keyboard accessibility
 */
export const ActionExecutionCard: React.FC<ActionExecutionCardProps> = ({
  execution,
}) => {
  const navigate = useNavigate();

  const statusConfig = STATUS_CONFIG[execution.status] || STATUS_CONFIG.queued;
  const actionTypeConfig = ACTION_TYPE_CONFIG[execution.actionType] ||
    ACTION_TYPE_CONFIG.fieldset || { icon: "cog" as const, label: "Action" };

  /**
   * Handles navigation to the document
   */
  const handleDocumentClick = () => {
    const url = getDocumentUrl(execution.document, execution.corpus, undefined);
    if (url !== "#") {
      navigate(url);
    }
  };

  /**
   * Handles navigation to an affected object
   */
  const handleObjectClick = (obj: AffectedObjectEntry) => {
    // For extracts, navigate to extract view
    if (obj.type === "extract" && execution.extract) {
      const url = getExtractUrl(execution.extract, undefined);
      if (url !== "#") {
        navigate(url);
      }
    }
    // For annotations, navigate to document with annotation selected
    else if (obj.type === "annotation") {
      const url = getDocumentUrl(execution.document, execution.corpus, {
        annotationIds: [obj.id.toString()],
      });
      if (url !== "#") {
        navigate(url);
      }
    }
    // For other types, just navigate to the document
    else {
      handleDocumentClick();
    }
  };

  /**
   * Renders a human-readable label for an affected object
   */
  const renderObjectLabel = (obj: AffectedObjectEntry): string => {
    if (obj.label) return obj.label;
    const objType = obj.type || "object";
    if (obj.field) return `${objType}: ${obj.field}`;
    if (obj.column_name) return `${objType}: ${obj.column_name}`;
    return `${objType} #${obj.id}`;
  };

  return (
    <Card
      role="article"
      aria-label={`Execution of ${execution.corpusAction.name}`}
    >
      <Header>
        <TitleSection>
          <ActionName>
            <Icon name={actionTypeConfig.icon} />
            {execution.corpusAction.name}
            <Label
              color={statusConfig.color as any}
              size="small"
              style={{ fontWeight: 600 }}
            >
              <Icon name={statusConfig.icon} />
              {statusConfig.label}
            </Label>
          </ActionName>
          <DocumentLink
            onClick={handleDocumentClick}
            aria-label={`Navigate to document: ${execution.document.title}`}
          >
            <Icon name="file" />
            {execution.document.title}
          </DocumentLink>
        </TitleSection>

        <BadgeGroup>
          <Label
            style={{
              background: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)",
              color: "#4338ca",
              fontWeight: 600,
            }}
          >
            <Icon name={actionTypeConfig.icon} />
            {actionTypeConfig.label}
          </Label>
        </BadgeGroup>
      </Header>

      <MetadataGrid>
        <MetadataItem>
          <div className="label">Queued At</div>
          <div className="value">
            <Icon name="clock outline" size="small" />
            {formatDateTime(execution.queuedAt)}
          </div>
        </MetadataItem>

        {execution.startedAt && (
          <MetadataItem>
            <div className="label">Started At</div>
            <div className="value">
              <Icon name="play" size="small" />
              {formatDateTime(execution.startedAt)}
            </div>
          </MetadataItem>
        )}

        {execution.completedAt && (
          <MetadataItem>
            <div className="label">Completed At</div>
            <div className="value">
              <Icon name="check" size="small" />
              {formatDateTime(execution.completedAt)}
            </div>
          </MetadataItem>
        )}

        {execution.waitTimeSeconds !== null && (
          <MetadataItem>
            <div className="label">Wait Time</div>
            <div className="value">
              <Icon name="hourglass half" size="small" />
              {formatDuration(execution.waitTimeSeconds)}
            </div>
          </MetadataItem>
        )}

        {execution.durationSeconds !== null && (
          <MetadataItem>
            <div className="label">Duration</div>
            <div className="value">
              <Icon name="clock" size="small" />
              {formatDuration(execution.durationSeconds)}
            </div>
          </MetadataItem>
        )}

        <MetadataItem>
          <div className="label">Trigger</div>
          <div className="value">
            <Icon name="bolt" size="small" />
            {execution.trigger}
          </div>
        </MetadataItem>

        <MetadataItem>
          <div className="label">Created By</div>
          <div className="value">
            <Icon name="user" size="small" />
            {execution.creator.username}
          </div>
        </MetadataItem>
      </MetadataGrid>

      {execution.affectedObjects && execution.affectedObjects.length > 0 && (
        <AffectedObjectsSection>
          <SectionTitle>
            <Icon name="sitemap" size="small" />
            Affected Objects ({execution.affectedObjects.length})
          </SectionTitle>
          <ObjectList role="list">
            {execution.affectedObjects.map((obj, index) => (
              <ObjectChip
                key={`${obj.type || "unknown"}-${obj.id}-${index}`}
                onClick={() => handleObjectClick(obj)}
                disabled={
                  !obj.type || !["extract", "annotation"].includes(obj.type)
                }
                aria-label={`Navigate to ${renderObjectLabel(obj)}`}
                role="listitem"
              >
                <Icon name={getObjectTypeIcon(obj.type)} size="small" />
                {renderObjectLabel(obj)}
              </ObjectChip>
            ))}
          </ObjectList>
        </AffectedObjectsSection>
      )}

      {execution.status === "failed" && execution.errorMessage && (
        <ErrorSection role="alert" aria-label="Execution error">
          <SectionTitle style={{ color: "#991b1b" }}>
            <Icon name="exclamation triangle" size="small" />
            Error Message
          </SectionTitle>
          <ErrorText>{execution.errorMessage}</ErrorText>
        </ErrorSection>
      )}
    </Card>
  );
};
