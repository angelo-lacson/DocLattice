import { ComponentSettingSchemaType } from "../../../types/graphql-api";

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
