/**
 * CorpusActionsSection - Corpus actions list with add/edit/delete functionality
 * and integrated template library picker.
 */
import React, { useState, useRef, useEffect } from "react";
import { Button } from "semantic-ui-react";
import { useQuery, useMutation } from "@apollo/client";
import styled from "styled-components";
import { toast } from "react-toastify";
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
  Library,
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
import {
  ADD_TEMPLATE_TO_CORPUS,
  AddTemplateToCorpusInput,
  AddTemplateToCorpusOutput,
} from "../../../graphql/mutations";
import {
  GET_CORPUS_ACTION_TEMPLATES,
  GetCorpusActionTemplatesInput,
  GetCorpusActionTemplatesOutput,
} from "../../../graphql/queries";
import {
  OS_LEGAL_COLORS,
  OS_LEGAL_TYPOGRAPHY,
} from "../../../assets/configurations/osLegalStyles";

// ============================================================================
// Types
// ============================================================================

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
  sourceTemplate?: { id: string; name: string } | null;
}

interface CorpusActionsSectionProps {
  corpusId: string;
  actions: CorpusAction[];
  onAddAction: () => void;
  onEditAction: (action: CorpusActionData) => void;
  onDeleteAction: (id: string) => void;
  onRunAction?: (action: CorpusAction) => void;
  onUpdate?: () => void;
  isSuperuser?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const TRIGGER_LABELS: Record<string, string> = {
  ADD_DOCUMENT: "On Add",
  EDIT_DOCUMENT: "On Edit",
  NEW_THREAD: "On Thread",
  NEW_MESSAGE: "On Message",
};

// ============================================================================
// Styled components for template picker dropdown
// ============================================================================

const PickerContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const PickerDropdown = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  width: 380px;
  max-height: 320px;
  overflow-y: auto;
  background: ${OS_LEGAL_COLORS.surface};
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  z-index: 100;
  padding: 0.5rem;
`;

const PickerItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }
`;

const PickerItemInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const PickerItemName = styled.div`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.875rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
`;

const PickerItemDesc = styled.div`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.75rem;
  color: ${OS_LEGAL_COLORS.textMuted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const PickerEmpty = styled.div`
  padding: 1rem;
  text-align: center;
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.875rem;
  color: ${OS_LEGAL_COLORS.textMuted};
`;

const TemplateBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 100px;
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.6875rem;
  font-weight: 500;
  background: ${OS_LEGAL_COLORS.accentLight};
  color: ${OS_LEGAL_COLORS.accent};
  margin-left: 0.5rem;
`;

// ============================================================================
// Component
// ============================================================================

export const CorpusActionsSection: React.FC<CorpusActionsSectionProps> = ({
  corpusId,
  actions,
  onAddAction,
  onEditAction,
  onDeleteAction,
  onRunAction,
  onUpdate,
  isSuperuser,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!pickerOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        pickerContainerRef.current &&
        !pickerContainerRef.current.contains(target)
      ) {
        setPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  // Fetch available templates
  const { data: templatesData } = useQuery<
    GetCorpusActionTemplatesOutput,
    GetCorpusActionTemplatesInput
  >(GET_CORPUS_ACTION_TEMPLATES, {
    variables: { isActive: true },
  });

  const [addTemplate, { loading: addingTemplate }] = useMutation<
    AddTemplateToCorpusOutput,
    AddTemplateToCorpusInput
  >(ADD_TEMPLATE_TO_CORPUS);

  const templates =
    templatesData?.corpusActionTemplates?.edges.map((e) => e.node) || [];

  // Filter out templates already added to the corpus
  const addedTemplateIds = new Set(
    actions.filter((a) => a.sourceTemplate?.id).map((a) => a.sourceTemplate!.id)
  );
  const availableTemplates = templates.filter(
    (t) => !addedTemplateIds.has(t.id)
  );

  const handleAddTemplate = async (templateId: string) => {
    try {
      const { data } = await addTemplate({
        variables: { templateId, corpusId },
      });
      if (data?.addTemplateToCorpus?.ok) {
        toast.success("Action added to corpus");
        onUpdate?.();
      } else {
        toast.error(
          data?.addTemplateToCorpus?.message || "Failed to add template"
        );
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to add template");
    }
    setPickerOpen(false);
  };

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
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <PickerContainer ref={pickerContainerRef}>
            <Button size="small" onClick={() => setPickerOpen(!pickerOpen)}>
              <Library size={14} /> Add from Library
            </Button>
            {pickerOpen && (
              <PickerDropdown>
                {availableTemplates.length === 0 ? (
                  <PickerEmpty>All templates have been added</PickerEmpty>
                ) : (
                  availableTemplates.map((template) => (
                    <PickerItem
                      key={template.id}
                      onClick={() =>
                        !addingTemplate && handleAddTemplate(template.id)
                      }
                    >
                      <Cpu
                        size={16}
                        style={{
                          color: OS_LEGAL_COLORS.accent,
                          flexShrink: 0,
                        }}
                      />
                      <PickerItemInfo>
                        <PickerItemName>{template.name}</PickerItemName>
                        {template.description && (
                          <PickerItemDesc>
                            {template.description}
                          </PickerItemDesc>
                        )}
                      </PickerItemInfo>
                      <TriggerBadge type={getTriggerType(template.trigger)}>
                        {TRIGGER_LABELS[template.trigger] || template.trigger}
                      </TriggerBadge>
                    </PickerItem>
                  ))
                )}
              </PickerDropdown>
            )}
          </PickerContainer>
          <Button primary size="small" onClick={onAddAction}>
            <Plus size={14} /> Add Action
          </Button>
        </div>
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
                      {action.sourceTemplate && (
                        <TemplateBadge>
                          <Library size={10} />
                          Template
                        </TemplateBadge>
                      )}
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
                      <Button
                        icon
                        size="tiny"
                        disabled={!!action.fieldset || !!action.analyzer}
                        title={
                          action.fieldset || action.analyzer
                            ? "Only agent actions can be manually triggered"
                            : "Run this action on a document"
                        }
                        onClick={() => onRunAction?.(action)}
                      >
                        <Play size={14} />
                      </Button>
                    )}

                    <Button
                      icon
                      size="tiny"
                      onClick={() =>
                        onEditAction(action as unknown as CorpusActionData)
                      }
                      title="Edit action"
                    >
                      <Edit size={14} />
                    </Button>

                    <Button
                      icon
                      negative
                      size="tiny"
                      onClick={() => onDeleteAction(action.id)}
                      title="Delete action"
                    >
                      <Trash2 size={14} />
                    </Button>
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
