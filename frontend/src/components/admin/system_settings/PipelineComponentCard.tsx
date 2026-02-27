import React, { memo } from "react";
import { Check } from "lucide-react";
import { PipelineComponentType } from "../../../types/graphql-api";
import { getComponentIcon, getComponentDisplayName } from "../PipelineIcons";
import { PIPELINE_UI } from "../../../assets/configurations/constants";
import { PipelineComponentCardProps } from "./types";
import {
  ComponentCard,
  SelectedBadge,
  ComponentIconWrapper,
  ComponentName,
  VectorBadge,
} from "./styles";

/**
 * Memoized component card to prevent unnecessary re-renders.
 * Only re-renders when its specific props change.
 */
export const PipelineComponentCard = memo<PipelineComponentCardProps>(
  ({ component, isSelected, color, stageTitle, disabled, onSelect }) => {
    const IconComponent = getComponentIcon(component.className);
    const displayName = getComponentDisplayName(
      component.className,
      component.title || undefined
    );
    const vectorSize = (
      component as PipelineComponentType & { vectorSize?: number }
    ).vectorSize;

    return (
      <ComponentCard
        $selected={isSelected}
        $color={color}
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={isSelected}
        aria-label={`Select ${displayName} as ${stageTitle.toLowerCase()}`}
      >
        {isSelected && (
          <SelectedBadge $color={color}>
            <Check />
          </SelectedBadge>
        )}
        <ComponentIconWrapper>
          <IconComponent size={PIPELINE_UI.ICON_SIZE} />
        </ComponentIconWrapper>
        <ComponentName>{displayName}</ComponentName>
        {vectorSize && <VectorBadge>{vectorSize}d vectors</VectorBadge>}
      </ComponentCard>
    );
  },
  (prevProps, nextProps) =>
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.color === nextProps.color &&
    prevProps.stageTitle === nextProps.stageTitle &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.onSelect === nextProps.onSelect &&
    prevProps.component.className === nextProps.component.className &&
    prevProps.component.title === nextProps.component.title
);

PipelineComponentCard.displayName = "PipelineComponentCard";
