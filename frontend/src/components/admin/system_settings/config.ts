import React from "react";
import { FileText, Cpu, Image } from "lucide-react";
import { StageType, PipelineMappingKey } from "./types";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

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
    color: OS_LEGAL_COLORS.primaryBlue,
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
    color: OS_LEGAL_COLORS.greenMedium,
    icon: Cpu,
    title: "Embedder",
    subtitle: "Create vector embeddings",
    settingsKey: "preferredEmbedders",
  },
};
