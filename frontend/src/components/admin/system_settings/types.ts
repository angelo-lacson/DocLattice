import React from "react";
import { FileText, Cpu, Image } from "lucide-react";
import {
  PipelineComponentType,
  ComponentSettingSchemaType,
} from "../../../types/graphql-api";

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

// ============================================================================
// Constants
// ============================================================================

/** Stage configuration with properly typed settings keys */
export const STAGE_CONFIG: Record<
  StageType,
  {
    color: string;
    icon: React.FC;
    title: string;
    subtitle: string;
    settingsKey: PipelineMappingKey;
  }
> = {
  parsers: {
    color: "#3B82F6",
    icon: FileText,
    title: "Parser",
    subtitle: "Extract text and structure",
    settingsKey: "preferredParsers",
  },
  thumbnailers: {
    color: "#EC4899",
    icon: Image,
    title: "Thumbnailer",
    subtitle: "Generate document previews",
    settingsKey: "preferredThumbnailers",
  },
  embedders: {
    color: "#10B981",
    icon: Cpu,
    title: "Embedder",
    subtitle: "Create vector embeddings",
    settingsKey: "preferredEmbedders",
  },
};
