import React, { memo, useCallback } from "react";
import styled, { css } from "styled-components";
import { Dropdown } from "semantic-ui-react";
import { User, Square, Layers, Eye, Tags } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAnnotationDisplay } from "../context/UISettingsAtom";
import { updateAnnotationDisplayParams } from "../../../utils/navigationUtils";
import { ViewLabelSelector } from "../labels/view_labels_selector/ViewLabelSelector";
import { LabelDisplayBehavior } from "../../../types/graphql-api";

interface AnnotationControlsProps {
  /** Display variant - affects styling and layout */
  variant?: "floating" | "sidebar";
  /** Compact mode for space-constrained views */
  compact?: boolean;
  /** Whether to show label filters */
  showLabelFilters?: boolean;
}

/* Styled Components with variant support */
const ControlsContainer = styled.div<{ $variant: "floating" | "sidebar" }>`
  ${(props) =>
    props.$variant === "floating"
      ? css`
          padding: 0;
        `
      : css`
          padding: 1rem;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        `}
`;

const ControlItem = styled.div<{ $compact?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${(props) => (props.$compact ? "0.5rem" : "0.75rem")};
  border-radius: 8px;
  transition: background 0.2s ease;

  &:hover {
    background: ${(props) => (props.$compact ? "#f8fafc" : "#f1f5f9")};
  }

  &:not(:last-child) {
    margin-bottom: ${(props) => (props.$compact ? "0.25rem" : "0.5rem")};
  }
`;

const ControlLabel = styled.div<{ $compact?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${(props) => (props.$compact ? "0.5rem" : "0.75rem")};
  font-size: ${(props) => (props.$compact ? "0.8125rem" : "0.875rem")};
  font-weight: 500;
  color: #1e293b;

  svg {
    width: ${(props) => (props.$compact ? "16px" : "18px")};
    height: ${(props) => (props.$compact ? "16px" : "18px")};
    color: #64748b;
  }
`;

const ToggleSwitch = styled.label`
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  transform: scale(1.1);

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #e2e8f0;
    border-radius: 20px;
    transition: 0.2s;

    &:before {
      position: absolute;
      content: "";
      height: 14px;
      width: 14px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      border-radius: 50%;
      transition: 0.2s;
    }
  }

  input:checked + span {
    background-color: #3b82f6;
  }

  input:checked + span:before {
    transform: translateX(16px);
  }
`;

const SectionHeader = styled.div<{ $compact?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: ${(props) => (props.$compact ? "0.5rem" : "0.75rem")};
  padding: ${(props) => (props.$compact ? "0.5rem" : "0.75rem")};
  font-size: ${(props) => (props.$compact ? "0.875rem" : "0.9375rem")};
  font-weight: 600;
  color: #1e293b;
  border-bottom: ${(props) => (props.$compact ? "none" : "1px solid #f1f5f9")};

  svg {
    width: ${(props) => (props.$compact ? "18px" : "20px")};
    height: ${(props) => (props.$compact ? "18px" : "20px")};
    color: #3b82f6;
  }
`;

const LabelDisplayDropdown = styled(Dropdown)`
  &&& {
    font-size: 0.875rem;
    min-width: 100%;

    &.ui.dropdown {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.625rem 0.875rem;
      background: white;
      font-weight: 500;
      color: #1e293b;

      &:hover {
        border-color: #cbd5e1;
      }
    }

    .menu {
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .item {
      font-size: 0.875rem;
      padding: 0.625rem 0.875rem !important;
    }
  }
`;

const FilterHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const LabelSelectorWrapper = styled.div`
  margin-top: 0.75rem;

  /* Override ViewLabelSelector styles for better integration */
  .ui.multiple.dropdown {
    font-size: 0.875rem !important;
    min-height: 40px !important;

    > .label {
      font-size: 0.75rem !important;
      padding: 0.375rem 0.5rem !important;
    }
  }
`;

/**
 * Shared annotation controls component that can be used in both
 * floating controls and sidebar. Memoized to prevent unnecessary rerenders.
 *
 * Key optimizations:
 * - Component is memoized to prevent rerenders when parent updates
 * - All callbacks are memoized with useCallback
 * - State is managed through atoms that only trigger updates when values change
 */
export const AnnotationControls: React.FC<AnnotationControlsProps> = memo(
  ({ variant = "sidebar", compact = false, showLabelFilters = false }) => {
    const location = useLocation();
    const navigate = useNavigate();

    // Read current display settings from reactive vars (set by CentralRouteManager)
    const { showStructural, showSelectedOnly, showBoundingBoxes, showLabels } =
      useAnnotationDisplay();

    // Memoize callbacks to prevent child rerenders
    // Use navigation utility to update URL - CentralRouteManager Phase 2 will set reactive vars
    const handleShowSelectedChange = useCallback(
      (checked: boolean) => {
        updateAnnotationDisplayParams(location, navigate, {
          showSelectedOnly: checked,
        });
      },
      [location, navigate]
    );

    const handleShowStructuralChange = useCallback(
      (checked: boolean) => {
        updateAnnotationDisplayParams(location, navigate, {
          showStructural: checked,
        });
      },
      [location, navigate]
    );

    const handleShowBoundingBoxesChange = useCallback(
      (checked: boolean) => {
        updateAnnotationDisplayParams(location, navigate, {
          showBoundingBoxes: checked,
        });
      },
      [location, navigate]
    );

    const handleLabelBehaviorChange = useCallback(
      (value: LabelDisplayBehavior) => {
        updateAnnotationDisplayParams(location, navigate, {
          labelDisplay: value,
        });
      },
      [location, navigate]
    );

    const labelDisplayOptions = [
      {
        key: LabelDisplayBehavior.ALWAYS,
        text: "Always Show",
        value: LabelDisplayBehavior.ALWAYS,
        icon: "eye",
      },
      {
        key: LabelDisplayBehavior.ON_HOVER,
        text: "On Hover",
        value: LabelDisplayBehavior.ON_HOVER,
        icon: "mouse pointer",
      },
      {
        key: LabelDisplayBehavior.HIDE,
        text: "Hide",
        value: LabelDisplayBehavior.HIDE,
        icon: "eye slash",
      },
    ];

    return (
      <ControlsContainer $variant={variant}>
        {variant === "sidebar" && !compact && (
          <SectionHeader $compact={compact}>
            <Eye />
            Visualization Settings
          </SectionHeader>
        )}

        <ControlItem $compact={compact}>
          <ControlLabel $compact={compact}>
            <User />
            Show Only Selected
          </ControlLabel>
          <ToggleSwitch>
            <input
              type="checkbox"
              checked={showSelectedOnly}
              onChange={(e) => handleShowSelectedChange(e.target.checked)}
            />
            <span />
          </ToggleSwitch>
        </ControlItem>

        <ControlItem $compact={compact}>
          <ControlLabel $compact={compact}>
            <Square />
            Show Bounding Boxes
          </ControlLabel>
          <ToggleSwitch>
            <input
              type="checkbox"
              checked={showBoundingBoxes}
              onChange={(e) => handleShowBoundingBoxesChange(e.target.checked)}
            />
            <span />
          </ToggleSwitch>
        </ControlItem>

        <ControlItem $compact={compact}>
          <ControlLabel $compact={compact}>
            <Layers />
            Show Structural
          </ControlLabel>
          <ToggleSwitch>
            <input
              type="checkbox"
              checked={showStructural}
              onChange={(e) => handleShowStructuralChange(e.target.checked)}
            />
            <span />
          </ToggleSwitch>
        </ControlItem>

        {/* Label Display Behavior */}
        <ControlItem $compact={compact}>
          <ControlLabel $compact={compact}>
            <Eye />
            Label Display
          </ControlLabel>
          <LabelDisplayDropdown
            selection
            compact
            options={labelDisplayOptions}
            value={showLabels}
            onChange={(_: any, data: any) =>
              handleLabelBehaviorChange(data.value as LabelDisplayBehavior)
            }
          />
        </ControlItem>

        {/* Label Filter - only show when requested */}
        {showLabelFilters && (
          <LabelSelectorWrapper>
            <FilterHeader>
              <Tags />
              Filter by Labels
            </FilterHeader>
            <ViewLabelSelector />
          </LabelSelectorWrapper>
        )}
      </ControlsContainer>
    );
  }
);

AnnotationControls.displayName = "AnnotationControls";
