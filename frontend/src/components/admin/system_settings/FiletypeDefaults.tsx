import React, { memo, useMemo, useCallback } from "react";
import { Button } from "@os-legal/ui";
import { AlertTriangle, FileText, Cpu, Settings } from "lucide-react";
import {
  PipelineComponentType,
  SupportedMimeTypeType,
} from "../../../types/graphql-api";
import { getComponentDisplayName } from "../PipelineIcons";
import { StageType } from "./types";
import { isComponentAvailable } from "./utils";
import {
  Section,
  SectionHeader,
  SectionTitle,
  DefaultEmbedderDisplay,
  DefaultEmbedderInfo,
  DefaultEmbedderPath,
  ComponentName,
  EmptyValue,
  DefaultsContainer,
  DefaultsHeaderRow,
  FiletypeRow,
  FiletypeLabel,
  StageDropdownLabel,
  StyledSelect,
} from "./styles";

// ============================================================================
// Types
// ============================================================================

interface FiletypeDefaultsProps {
  components: {
    parsers: (PipelineComponentType & { className: string })[];
    embedders: (PipelineComponentType & { className: string })[];
    thumbnailers: (PipelineComponentType & { className: string })[];
  };
  supportedMimeTypes: SupportedMimeTypeType[];
  enabledComponents: string[];
  preferredParsers: Record<string, string>;
  preferredEmbedders: Record<string, string>;
  preferredThumbnailers: Record<string, string>;
  defaultEmbedder: string;
  updating: boolean;
  onAssign: (
    stage: "parsers" | "embedders" | "thumbnailers",
    mimeType: string,
    className: string
  ) => void;
  onEditDefaultEmbedder: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

const STAGES: { key: StageType; label: string }[] = [
  { key: "parsers", label: "Parser" },
  { key: "embedders", label: "Embedder" },
  { key: "thumbnailers", label: "Thumbnailer" },
];

// ============================================================================
// Component
// ============================================================================

export const FiletypeDefaults = memo<FiletypeDefaultsProps>(
  ({
    components,
    supportedMimeTypes,
    enabledComponents,
    preferredParsers,
    preferredEmbedders,
    preferredThumbnailers,
    defaultEmbedder,
    updating,
    onAssign,
    onEditDefaultEmbedder,
  }) => {
    // Build a lookup from stage key to its preferred mapping
    const preferredByStage = useMemo(
      () => ({
        parsers: preferredParsers,
        embedders: preferredEmbedders,
        thumbnailers: preferredThumbnailers,
      }),
      [preferredParsers, preferredEmbedders, preferredThumbnailers]
    );

    // Build a lookup from MIME type to short label from dynamic data
    const mimeToShortLabel = useMemo(
      () =>
        Object.fromEntries(
          supportedMimeTypes.map((m) => [m.mimetype, m.fileType.toUpperCase()])
        ),
      [supportedMimeTypes]
    );

    // Pre-compute available components per stage per MIME type
    const availableComponents = useMemo(() => {
      const result: Record<
        StageType,
        Record<string, (PipelineComponentType & { className: string })[]>
      > = {
        parsers: {},
        embedders: {},
        thumbnailers: {},
      };

      for (const mime of supportedMimeTypes) {
        const shortLabel = mimeToShortLabel[mime.mimetype] || mime.mimetype;
        for (const stage of STAGES) {
          result[stage.key][mime.mimetype] = components[stage.key].filter(
            (comp) => isComponentAvailable(comp, shortLabel, enabledComponents)
          );
        }
      }

      return result;
    }, [components, supportedMimeTypes, mimeToShortLabel, enabledComponents]);

    const handleChange = useCallback(
      (stage: StageType, mimeType: string, value: string) => {
        onAssign(stage, mimeType, value);
      },
      [onAssign]
    );

    return (
      <Section data-testid="filetype-defaults">
        <SectionHeader>
          <SectionTitle>
            <Settings />
            Filetype Defaults
          </SectionTitle>
        </SectionHeader>

        <DefaultsContainer>
          {/* Header row - hidden on mobile */}
          <DefaultsHeaderRow>
            <span>File Type</span>
            <span>Parser</span>
            <span>Embedder</span>
            <span>Thumbnailer</span>
          </DefaultsHeaderRow>

          {/* One row per MIME type */}
          {supportedMimeTypes.map((mime) => {
            return (
              <FiletypeRow key={mime.mimetype}>
                <FiletypeLabel>
                  {mime.fullySupported ? (
                    <FileText />
                  ) : (
                    <span title="Partially supported: missing pipeline components for some stages">
                      <AlertTriangle style={{ color: "#D69E2E" }} />
                    </span>
                  )}
                  {mime.label}
                </FiletypeLabel>

                {STAGES.map((stage) => {
                  const currentValue =
                    preferredByStage[stage.key]?.[mime.mimetype] || "";
                  const available =
                    availableComponents[stage.key][mime.mimetype];
                  const hasNoOptions = available.length === 0;
                  const isUnassigned = !currentValue;

                  return (
                    <div key={stage.key}>
                      <StageDropdownLabel>{stage.label}</StageDropdownLabel>
                      <StyledSelect
                        value={currentValue}
                        $warning={isUnassigned && !hasNoOptions}
                        disabled={updating || hasNoOptions}
                        onChange={(e) =>
                          handleChange(stage.key, mime.mimetype, e.target.value)
                        }
                        aria-label={`${stage.label} for ${mime.label} files`}
                      >
                        {hasNoOptions ? (
                          <option value="">None available</option>
                        ) : (
                          <>
                            <option value="">-- Unassigned --</option>
                            {available.map((comp) => (
                              <option
                                key={comp.className}
                                value={comp.className}
                              >
                                {getComponentDisplayName(
                                  comp.className,
                                  comp.title || undefined
                                )}
                              </option>
                            ))}
                          </>
                        )}
                      </StyledSelect>
                    </div>
                  );
                })}
              </FiletypeRow>
            );
          })}

          {/* Default Embedder row */}
          <FiletypeRow>
            <FiletypeLabel>
              <Cpu />
              Default Embedder
            </FiletypeLabel>
            <div style={{ gridColumn: "2 / -1" }}>
              <DefaultEmbedderDisplay>
                {defaultEmbedder ? (
                  <DefaultEmbedderInfo>
                    <ComponentName>
                      {getComponentDisplayName(defaultEmbedder)}
                    </ComponentName>
                    <DefaultEmbedderPath>{defaultEmbedder}</DefaultEmbedderPath>
                  </DefaultEmbedderInfo>
                ) : (
                  <EmptyValue>Using system default</EmptyValue>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onEditDefaultEmbedder}
                >
                  Edit
                </Button>
              </DefaultEmbedderDisplay>
            </div>
          </FiletypeRow>
        </DefaultsContainer>
      </Section>
    );
  }
);

FiletypeDefaults.displayName = "FiletypeDefaults";
