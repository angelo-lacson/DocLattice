import React from "react";
import { useQuery, useMutation } from "@apollo/client";
import { Checkbox } from "semantic-ui-react";
import { toast } from "react-toastify";
import { Cpu, Plus, Trash2, Zap } from "lucide-react";
import styled from "styled-components";

import {
  ADD_TEMPLATE_TO_CORPUS,
  AddTemplateToCorpusInput,
  AddTemplateToCorpusOutput,
  UPDATE_CORPUS_ACTION,
  UpdateCorpusActionInput,
  UpdateCorpusActionOutput,
  DELETE_CORPUS_ACTION,
  DeleteCorpusActionInput,
  DeleteCorpusActionOutput,
} from "../../../graphql/mutations";
import {
  GET_CORPUS_ACTION_TEMPLATES,
  GetCorpusActionTemplatesInput,
  GetCorpusActionTemplatesOutput,
  CorpusActionTemplateNode,
} from "../../../graphql/queries";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardTitle,
  SettingsCardContent,
  TriggerBadge,
  InfoNote,
} from "../styles/corpusSettingsStyles";
import {
  OS_LEGAL_COLORS,
  OS_LEGAL_TYPOGRAPHY,
} from "../../../assets/configurations/osLegalStyles";

// ============================================================================
// Types
// ============================================================================

interface TemplateAction {
  id: string;
  name: string;
  trigger: string;
  disabled: boolean;
  sourceTemplate?: { id: string; name: string } | null;
  taskInstructions?: string | null;
  agentConfig?: { id: string; name: string; description?: string } | null;
}

interface ActionLibrarySectionProps {
  corpusId: string;
  actions: TemplateAction[];
  onUpdate?: () => void;
}

// ============================================================================
// Trigger label mapping
// ============================================================================

const TRIGGER_LABELS: Record<string, string> = {
  ADD_DOCUMENT: "On Add",
  EDIT_DOCUMENT: "On Edit",
  NEW_THREAD: "On Thread",
  NEW_MESSAGE: "On Message",
};

const TRIGGER_TYPE_MAP: Record<string, "add" | "edit"> = {
  ADD_DOCUMENT: "add",
  EDIT_DOCUMENT: "edit",
  NEW_THREAD: "add",
  NEW_MESSAGE: "edit",
};

// ============================================================================
// Local styled-components
// ============================================================================

const TemplateRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 8px;
  margin-bottom: 0.5rem;
  background: ${OS_LEGAL_COLORS.surface};
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    border-color: ${OS_LEGAL_COLORS.borderHover};
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

const TemplateInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
`;

const TemplateIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: ${OS_LEGAL_COLORS.accentLight};
  color: ${OS_LEGAL_COLORS.accent};
  flex-shrink: 0;
`;

const TemplateText = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const TemplateName = styled.span`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TemplateDescription = styled.span`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.8125rem;
  color: ${OS_LEGAL_COLORS.textMuted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ToggleArea = styled.div`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: auto;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  border: 1px solid ${OS_LEGAL_COLORS.accent};
  background: ${OS_LEGAL_COLORS.accentLight};
  color: ${OS_LEGAL_COLORS.accent};
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    background: ${OS_LEGAL_COLORS.accent};
    color: white;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const RemoveButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  background: transparent;
  color: ${OS_LEGAL_COLORS.textMuted};
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover {
    border-color: #ef4444;
    color: #ef4444;
    background: #fef2f2;
  }
`;

const SectionLabel = styled.div`
  font-family: ${OS_LEGAL_TYPOGRAPHY.fontFamilySans};
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${OS_LEGAL_COLORS.textMuted};
  margin-bottom: 0.5rem;
  margin-top: 0.75rem;

  &:first-of-type {
    margin-top: 0;
  }
`;

// ============================================================================
// Constants
// ============================================================================

const MAX_DESCRIPTION_LENGTH = 80;

// ============================================================================
// Component
// ============================================================================

export const TemplateActionsSection: React.FC<ActionLibrarySectionProps> = ({
  corpusId,
  actions,
  onUpdate,
}) => {
  const { data: templatesData } = useQuery<
    GetCorpusActionTemplatesOutput,
    GetCorpusActionTemplatesInput
  >(GET_CORPUS_ACTION_TEMPLATES, {
    variables: { isActive: true },
  });

  const [addTemplate, { loading: adding }] = useMutation<
    AddTemplateToCorpusOutput,
    AddTemplateToCorpusInput
  >(ADD_TEMPLATE_TO_CORPUS);

  const [updateAction] = useMutation<
    UpdateCorpusActionOutput,
    UpdateCorpusActionInput
  >(UPDATE_CORPUS_ACTION);

  const [deleteAction] = useMutation<
    DeleteCorpusActionOutput,
    DeleteCorpusActionInput
  >(DELETE_CORPUS_ACTION);

  const templates =
    templatesData?.corpusActionTemplates?.edges.map((e) => e.node) || [];

  if (templates.length === 0) return null;

  const addedTemplateMap = new Map<string, TemplateAction>();
  for (const action of actions) {
    if (action.sourceTemplate?.id) {
      addedTemplateMap.set(action.sourceTemplate.id, action);
    }
  }

  const availableTemplates = templates.filter(
    (t) => !addedTemplateMap.has(t.id)
  );
  const addedTemplates = templates.filter((t) => addedTemplateMap.has(t.id));

  const truncateDescription = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.length > MAX_DESCRIPTION_LENGTH
      ? text.slice(0, MAX_DESCRIPTION_LENGTH) + "..."
      : text;
  };

  const handleAdd = async (templateId: string) => {
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
  };

  const handleToggle = async (action: TemplateAction) => {
    const newDisabled = !action.disabled;
    try {
      const { data } = await updateAction({
        variables: { id: action.id, disabled: newDisabled },
      });
      if (data?.updateCorpusAction?.ok) {
        toast.success(`${action.name} ${newDisabled ? "disabled" : "enabled"}`);
        onUpdate?.();
      } else {
        toast.error(
          data?.updateCorpusAction?.message || "Failed to update action"
        );
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update action");
    }
  };

  const handleRemove = async (actionId: string) => {
    try {
      const { data } = await deleteAction({
        variables: { id: actionId },
      });
      if (data?.deleteCorpusAction?.ok) {
        toast.success("Action removed");
        onUpdate?.();
      } else {
        toast.error(
          data?.deleteCorpusAction?.message || "Failed to remove action"
        );
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to remove action");
    }
  };

  const renderTemplateRow = (
    template: CorpusActionTemplateNode,
    controls: React.ReactNode
  ) => {
    const triggerLabel = TRIGGER_LABELS[template.trigger] || template.trigger;
    const triggerType = TRIGGER_TYPE_MAP[template.trigger] || "add";

    return (
      <TemplateRow key={template.id}>
        <TemplateInfo>
          <TemplateIcon>
            <Cpu size={16} />
          </TemplateIcon>
          <TemplateText>
            <TemplateName>{template.name}</TemplateName>
            {template.description && (
              <TemplateDescription>
                {truncateDescription(template.description)}
              </TemplateDescription>
            )}
          </TemplateText>
        </TemplateInfo>
        <TriggerBadge type={triggerType}>{triggerLabel}</TriggerBadge>
        {controls}
      </TemplateRow>
    );
  };

  return (
    <SettingsCard>
      <SettingsCardHeader>
        <SettingsCardTitle>
          <Zap size={18} />
          Action Library
        </SettingsCardTitle>
      </SettingsCardHeader>
      <SettingsCardContent>
        <InfoNote>
          Browse available AI automations and add them to this corpus. Once
          added, they run automatically and can be customized like any other
          action.
        </InfoNote>

        {availableTemplates.length > 0 && (
          <>
            <SectionLabel>Available</SectionLabel>
            {availableTemplates.map((template) =>
              renderTemplateRow(
                template,
                <ActionButton
                  onClick={() => handleAdd(template.id)}
                  disabled={adding}
                >
                  <Plus size={14} /> Add
                </ActionButton>
              )
            )}
          </>
        )}

        {addedTemplates.length > 0 && (
          <>
            <SectionLabel>Added to this corpus</SectionLabel>
            {addedTemplates.map((template) => {
              const action = addedTemplateMap.get(template.id)!;
              return renderTemplateRow(
                template,
                <>
                  <ToggleArea>
                    <Checkbox
                      toggle
                      checked={!action.disabled}
                      onChange={() => handleToggle(action)}
                    />
                  </ToggleArea>
                  <RemoveButton
                    onClick={() => handleRemove(action.id)}
                    title="Remove from corpus"
                  >
                    <Trash2 size={14} />
                  </RemoveButton>
                </>
              );
            })}
          </>
        )}
      </SettingsCardContent>
    </SettingsCard>
  );
};
