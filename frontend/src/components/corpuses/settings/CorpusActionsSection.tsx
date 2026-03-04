/**
 * CorpusActionsSection - Corpus actions list with add/edit/delete functionality
 */
import React from "react";
import { Button, IconButton } from "@os-legal/ui";
import {
  Plus,
  Play,
  Pause,
  Edit,
  Trash2,
  Cpu,
  Table,
  Settings,
  User,
  Calendar,
  CheckCircle,
} from "lucide-react";
import { CorpusActionData } from "../CreateCorpusActionModal";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardTitle,
  SettingsCardContent,
  ActionFlow,
  ActionCard,
  TriggerBadge,
  ActionStatusBadge,
  AgentPromptBox,
  InfoNote,
} from "../styles/corpusSettingsStyles";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

interface CorpusAction {
  id: string;
  name: string;
  trigger: string;
  disabled: boolean;
  runOnAllCorpuses?: boolean;
  analyzer?: { id: string; name: string } | null;
  fieldset?: { id: string; name: string } | null;
  agentConfig?: { id: string; name: string; description?: string } | null;
  taskInstructions?: string | null;
  preAuthorizedTools?: string[] | null;
  creator: { username: string };
  created: string;
}

interface CorpusActionsSectionProps {
  actions: CorpusAction[];
  onAddAction: () => void;
  onEditAction: (action: CorpusActionData) => void;
  onDeleteAction: (id: string) => void;
  onRunAction?: (action: CorpusAction) => void;
  isSuperuser?: boolean;
}

export const CorpusActionsSection: React.FC<CorpusActionsSectionProps> = ({
  actions,
  onAddAction,
  onEditAction,
  onDeleteAction,
  onRunAction,
  isSuperuser,
}) => {
  const getTriggerType = (trigger: string): "add" | "edit" => {
    return trigger.toLowerCase().includes("add") ? "add" : "edit";
  };

  const getActionTypeInfo = (action: CorpusAction) => {
    if (action.agentConfig) {
      return {
        icon: <Cpu size={16} />,
        label: `Agent: ${action.agentConfig.name}`,
      };
    }
    if (action.fieldset) {
      return {
        icon: <Table size={16} />,
        label: `Fieldset: ${action.fieldset.name}`,
      };
    }
    return {
      icon: <Settings size={16} />,
      label: `Analyzer: ${action.analyzer?.name || "Unknown"}`,
    };
  };

  return (
    <SettingsCard>
      <SettingsCardHeader>
        <SettingsCardTitle>Corpus Actions</SettingsCardTitle>
        <Button
          variant="primary"
          size="sm"
          onClick={onAddAction}
          leftIcon={<Plus size={14} />}
        >
          Add Action
        </Button>
      </SettingsCardHeader>

      <SettingsCardContent>
        <InfoNote>
          This system allows you to <strong>automate actions</strong> when
          documents are <span className="highlight">added</span> or{" "}
          <span className="highlight">edited</span> in a corpus. You can run
          extractions via <strong>fieldsets</strong>, analyses via{" "}
          <strong>analyzers</strong>, or AI-powered tasks via{" "}
          <strong>agents</strong>.
        </InfoNote>

        <ActionFlow>
          {actions.map((action) => {
            const actionType = getActionTypeInfo(action);
            const triggerType = getTriggerType(action.trigger);

            return (
              <ActionCard key={action.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        alignItems: "center",
                        marginBottom: "0.75rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          color: OS_LEGAL_COLORS.textPrimary,
                          fontSize: "1.125rem",
                          fontWeight: 600,
                        }}
                      >
                        {action.name}
                      </h3>
                      <TriggerBadge type={triggerType}>
                        {triggerType === "add" ? "On Add" : "On Edit"}
                      </TriggerBadge>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "1.5rem",
                        color: OS_LEGAL_COLORS.textSecondary,
                        fontSize: "0.9rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.375rem",
                        }}
                      >
                        {actionType.icon}
                        {actionType.label}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.375rem",
                        }}
                      >
                        <User size={16} />
                        {action.creator.username}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.375rem",
                        }}
                      >
                        <Calendar size={16} />
                        {new Date(action.created).toLocaleDateString()}
                      </div>
                    </div>

                    {action.taskInstructions && (
                      <AgentPromptBox>
                        <div className="prompt-label">Task Instructions:</div>
                        <div className="prompt-text">
                          "
                          {action.taskInstructions.length > 100
                            ? `${action.taskInstructions.substring(0, 100)}...`
                            : action.taskInstructions}
                          "
                        </div>
                        {action.preAuthorizedTools &&
                          action.preAuthorizedTools.length > 0 && (
                            <div className="pre-auth-tools">
                              <CheckCircle
                                size={14}
                                style={{
                                  marginRight: "0.25rem",
                                  color: "#16a34a",
                                }}
                              />
                              Pre-authorized tools:{" "}
                              {action.preAuthorizedTools.join(", ")}
                            </div>
                          )}
                      </AgentPromptBox>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <ActionStatusBadge active={!action.disabled}>
                      {action.disabled ? (
                        <Pause size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                      {action.disabled ? "Disabled" : "Active"}
                    </ActionStatusBadge>

                    {isSuperuser && (
                      <IconButton
                        size="sm"
                        disabled={!!action.fieldset || !!action.analyzer}
                        aria-label={
                          action.fieldset || action.analyzer
                            ? "Only agent actions can be manually triggered"
                            : "Run this action on a document"
                        }
                        title={
                          action.fieldset || action.analyzer
                            ? "Only agent actions can be manually triggered"
                            : "Run this action on a document"
                        }
                        onClick={() => onRunAction?.(action)}
                      >
                        <Play size={14} />
                      </IconButton>
                    )}

                    <IconButton
                      size="sm"
                      onClick={() =>
                        onEditAction(action as unknown as CorpusActionData)
                      }
                      aria-label="Edit action"
                      title="Edit action"
                    >
                      <Edit size={14} />
                    </IconButton>

                    <IconButton
                      size="sm"
                      onClick={() => onDeleteAction(action.id)}
                      aria-label="Delete action"
                      title="Delete action"
                      style={{ color: "#dc2626" }}
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              </ActionCard>
            );
          })}
        </ActionFlow>
      </SettingsCardContent>
    </SettingsCard>
  );
};
