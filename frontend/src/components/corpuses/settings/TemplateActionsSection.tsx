/**
 * TemplateActionsSection - Compact toggle-row UI for template-sourced corpus actions.
 * Allows users to quickly enable/disable actions that were created from templates.
 */
import React from "react";
import { useMutation } from "@apollo/client";
import { Checkbox } from "semantic-ui-react";
import { toast } from "react-toastify";
import { Cpu, Zap } from "lucide-react";
import styled from "styled-components";

import {
  UPDATE_CORPUS_ACTION,
  UpdateCorpusActionInput,
  UpdateCorpusActionOutput,
} from "../../../graphql/mutations";
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

interface TemplateActionsSectionProps {
  actions: TemplateAction[];
  onToggle?: () => void;
}

// ============================================================================
// Trigger label mapping
// ============================================================================

const TRIGGER_LABELS: Record<string, string> = {
  add_document: "On Add",
  edit_document: "On Edit",
  new_thread: "On Thread",
  new_message: "On Message",
};

const TRIGGER_TYPE_MAP: Record<string, "add" | "edit"> = {
  add_document: "add",
  edit_document: "edit",
  new_thread: "add",
  new_message: "edit",
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

// ============================================================================
// Constants
// ============================================================================

const MAX_DESCRIPTION_LENGTH = 80;

// ============================================================================
// Component
// ============================================================================

export const TemplateActionsSection: React.FC<TemplateActionsSectionProps> = ({
  actions,
  onToggle,
}) => {
  const [updateAction] = useMutation<
    UpdateCorpusActionOutput,
    UpdateCorpusActionInput
  >(UPDATE_CORPUS_ACTION);

  if (actions.length === 0) {
    return null;
  }

  const handleToggle = async (action: TemplateAction) => {
    const newDisabled = !action.disabled;
    try {
      const { data } = await updateAction({
        variables: { id: action.id, disabled: newDisabled },
      });
      if (data?.updateCorpusAction?.ok) {
        toast.success(`${action.name} ${newDisabled ? "disabled" : "enabled"}`);
        onToggle?.();
      } else {
        toast.error(
          data?.updateCorpusAction?.message || "Failed to update action"
        );
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update action");
    }
  };

  const truncateDescription = (text: string | null | undefined): string => {
    if (!text) return "";
    return text.length > MAX_DESCRIPTION_LENGTH
      ? text.slice(0, MAX_DESCRIPTION_LENGTH) + "..."
      : text;
  };

  return (
    <SettingsCard>
      <SettingsCardHeader>
        <SettingsCardTitle>
          <Zap size={18} />
          Quick Actions
        </SettingsCardTitle>
      </SettingsCardHeader>
      <SettingsCardContent>
        <InfoNote>
          These actions were provisioned from a <strong>corpus template</strong>
          . Toggle them on or off to control automated behavior.
        </InfoNote>
        {actions.map((action) => {
          const triggerLabel = TRIGGER_LABELS[action.trigger] || action.trigger;
          const triggerType = TRIGGER_TYPE_MAP[action.trigger] || "add";
          const description = truncateDescription(
            action.taskInstructions || action.agentConfig?.description || null
          );

          return (
            <TemplateRow
              key={action.id}
              data-testid={`template-row-${action.id}`}
            >
              <TemplateInfo>
                <TemplateIcon>
                  <Cpu size={16} />
                </TemplateIcon>
                <TemplateText>
                  <TemplateName>{action.name}</TemplateName>
                  {description && (
                    <TemplateDescription>{description}</TemplateDescription>
                  )}
                </TemplateText>
              </TemplateInfo>
              <TriggerBadge type={triggerType}>{triggerLabel}</TriggerBadge>
              <ToggleArea>
                <Checkbox
                  toggle
                  checked={!action.disabled}
                  onChange={() => handleToggle(action)}
                />
              </ToggleArea>
            </TemplateRow>
          );
        })}
      </SettingsCardContent>
    </SettingsCard>
  );
};
