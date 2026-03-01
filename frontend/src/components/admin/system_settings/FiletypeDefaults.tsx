import React, { memo, useMemo, useCallback } from "react";
import { Button } from "@os-legal/ui";
import { FileText, Cpu, Settings } from "lucide-react";
import { PipelineComponentType } from "../../../types/graphql-api";
import {
  SUPPORTED_MIME_TYPES,
  MIME_TO_SHORT_LABEL,
} from "../../../assets/configurations/constants";
import { getComponentDisplayName } from "../PipelineIcons";
import { StageType } from "./types";
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

/**
 * Determine whether a component is available for a given MIME type.
 * A component is available if:
 * 1. It is enabled (present in enabledComponents, or enabledComponents is empty meaning all enabled)
 * 2. Its supportedFileTypes includes the short label (e.g., "pdf") or it has no supportedFileTypes (universal)
 */
const isComponentAvailable = (
  component: PipelineComponentType & { className: string },
  mimeShortLabel: string,
  enabledComponents: string[]
): boolean => {
  // Check enabled status
  const isEnabled =
    enabledComponents.length === 0 ||
    enabledComponents.includes(component.className);
  if (!isEnabled) return false;

  // Check file type support
  const fileTypes = (component.supportedFileTypes || [])
    .filter((ft): ft is NonNullable<typeof ft> => Boolean(ft))
    .map((ft) => String(ft).toLowerCase());

  if (fileTypes.length === 0) return true; // Universal component
  return fileTypes.includes(mimeShortLabel.toLowerCase());
};

// ============================================================================
// Component
// ============================================================================

export const FiletypeDefaults = memo<FiletypeDefaultsProps>(
  ({
    components,
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

    // Pre-compute available components per stage per MIME type
    const availableComponents = useMemo(() => {
      const result: Record<
        StageType,
        Record<
          string,
          (PipelineComponentType & { className: string })[]
        >
      > = {
        parsers: {},
        embedders: {},
        thumbnailers: {},
      };

      for (const mime of SUPPORTED_MIME_TYPES) {
        const shortLabel = MIME_TO_SHORT_LABEL[mime.value] || "";
        for (const stage of STAGES) {
          result[stage.key][mime.value] = components[stage.key].filter(
            (comp) => isComponentAvailable(comp, shortLabel, enabledComponents)
          );
        }
      }

      return result;
    }, [components, enabledComponents]);

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
          {SUPPORTED_MIME_TYPES.map((mime) => {
            return (
              <FiletypeRow key={mime.value}>
                <FiletypeLabel>
                  <FileText />
                  {mime.shortLabel}
                </FiletypeLabel>

                {STAGES.map((stage) => {
                  const currentValue =
                    preferredByStage[stage.key]?.[mime.value] || "";
                  const available = availableComponents[stage.key][mime.value];
                  const hasNoOptions = available.length === 0;
                  const isUnassigned = !currentValue;

                  return (
                    <div key={stage.key}>
                      <StageDropdownLabel>
                        {stage.label}
                      </StageDropdownLabel>
                      <StyledSelect
                        value={currentValue}
                        $warning={isUnassigned && !hasNoOptions}
                        disabled={updating || hasNoOptions}
                        onChange={(e) =>
                          handleChange(stage.key, mime.value, e.target.value)
                        }
                        aria-label={`${stage.label} for ${mime.label}`}
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
                    <DefaultEmbedderPath>
                      {defaultEmbedder}
                    </DefaultEmbedderPath>
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
