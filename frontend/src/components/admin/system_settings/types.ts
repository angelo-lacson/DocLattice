import {
  PipelineComponentType,
  ComponentSettingSchemaType,
} from "../../../types/graphql-api";
import type { STAGE_CONFIG } from "./config";

// ============================================================================
// Types
// ============================================================================

export type StageType = "parsers" | "embedders" | "thumbnailers";

/** Type for pipeline settings keys that hold MIME-type mappings */
export type PipelineMappingKey =
  | "preferredParsers"
  | "preferredEmbedders"
  | "preferredThumbnailers";

export type SettingsSchemaEntry = ComponentSettingSchemaType;

// ============================================================================
// Props Interfaces
// ============================================================================

export interface PipelineComponentCardProps {
  component: PipelineComponentType & { className: string };
  isSelected: boolean;
  color: string;
  stageTitle: string;
  disabled: boolean;
  onSelect: () => void;
}

export interface AdvancedSettingsPanelProps {
  currentSelection: string;
  configSettings: ComponentSettingSchemaType[];
  secretSettings: ComponentSettingSchemaType[];
  isExpanded: boolean;
  settingsKey: string;
  saving: boolean;
  onToggle: () => void;
  onAddSecrets: (componentPath: string) => void;
  onDeleteSecrets: (componentPath: string) => void;
  onSaveConfig: (componentPath: string, values: Record<string, string>) => void;
}

export interface PipelineStageSectionProps {
  stage: StageType;
  stageIndex: number;
  config: (typeof STAGE_CONFIG)[StageType];
  mimeType: string;
  components: (PipelineComponentType & { className: string })[];
  currentSelection: string | null;
  configSettings: ComponentSettingSchemaType[];
  secretSettings: ComponentSettingSchemaType[];
  isExpanded: boolean;
  settingsKey: string;
  updating: boolean;
  onMimeTypeChange: (stage: StageType, mimeType: string) => void;
  onSelectComponent: (
    stage: StageType,
    mimeType: string,
    className: string
  ) => void;
  onToggleSettings: (key: string) => void;
  onAddSecrets: (componentPath: string) => void;
  onDeleteSecrets: (componentPath: string) => void;
  onSaveConfig: (componentPath: string, values: Record<string, string>) => void;
}
