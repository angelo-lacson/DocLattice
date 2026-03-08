import React, { useState, useRef, useEffect, useMemo } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import { Filter, X } from "lucide-react";
import { OS_LEGAL_COLORS } from "../../../../assets/configurations/osLegalStyles";
import { AnnotationControls } from "../../../annotator/controls/AnnotationControls";
import {
  useAnnotationDisplay,
  useAnnotationControls,
} from "../../../annotator/context/UISettingsAtom";

interface CollapsibleAnnotationControlsProps {
  /** Whether to show label filters in the controls */
  showLabelFilters?: boolean;
  /** Trigger mode - click or hover */
  triggerMode?: "click" | "hover";
}

const ControlsToggleButton = styled(motion.button)<{
  $hasActiveFilters?: boolean;
}>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.875rem;
  background: ${(props) =>
    props.$hasActiveFilters ? OS_LEGAL_COLORS.blueSurface : "white"};
  border: 1px solid
    ${(props) =>
      props.$hasActiveFilters
        ? OS_LEGAL_COLORS.primaryBlue
        : OS_LEGAL_COLORS.border};
  border-radius: 8px;
  color: ${(props) =>
    props.$hasActiveFilters
      ? OS_LEGAL_COLORS.primaryBlue
      : OS_LEGAL_COLORS.textSecondary};
  font-size: 0.875rem;
  font-weight: ${(props) => (props.$hasActiveFilters ? "600" : "500")};
  cursor: pointer;
  transition: all 0.2s ease;

  svg {
    width: 18px;
    height: 18px;
    color: ${(props) =>
      props.$hasActiveFilters ? OS_LEGAL_COLORS.primaryBlue : "inherit"};
  }

  &:hover {
    background: ${(props) =>
      props.$hasActiveFilters
        ? OS_LEGAL_COLORS.blueBorder
        : OS_LEGAL_COLORS.surfaceHover};
    border-color: ${(props) =>
      props.$hasActiveFilters
        ? OS_LEGAL_COLORS.primaryBlueHover
        : OS_LEGAL_COLORS.borderHover};
    color: ${(props) =>
      props.$hasActiveFilters
        ? OS_LEGAL_COLORS.primaryBlueHover
        : OS_LEGAL_COLORS.primaryBlue};

    svg {
      color: ${(props) =>
        props.$hasActiveFilters
          ? OS_LEGAL_COLORS.primaryBlueHover
          : OS_LEGAL_COLORS.primaryBlue};
    }
  }

  &:active {
    transform: scale(0.98);
  }
`;

const PopupContainer = styled(motion.div)`
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 10px rgba(0, 0, 0, 0.05);
  border: 1px solid ${OS_LEGAL_COLORS.border};
  z-index: 100;
  overflow: hidden;
`;

const PopupHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
`;

const PopupTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};

  svg {
    width: 20px;
    height: 20px;
    color: ${OS_LEGAL_COLORS.primaryBlue};
  }
`;

const CloseButton = styled(motion.button)`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: ${OS_LEGAL_COLORS.textSecondary};
  cursor: pointer;
  transition: all 0.2s ease;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: ${OS_LEGAL_COLORS.border};
    color: ${OS_LEGAL_COLORS.textTertiary};
  }
`;

const PopupContent = styled.div`
  padding: 1rem;
  max-height: 400px;
  overflow-y: auto;

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: ${OS_LEGAL_COLORS.surfaceLight};
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${OS_LEGAL_COLORS.borderHover};
    border-radius: 3px;

    &:hover {
      background: ${OS_LEGAL_COLORS.textMuted};
    }
  }
`;

const Wrapper = styled.div`
  position: relative;
`;

const FilterBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: ${OS_LEGAL_COLORS.primaryBlue};
  color: white;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 0.5rem;
`;

const ActiveIndicator = styled.div`
  position: absolute;
  top: -4px;
  right: -4px;
  width: 8px;
  height: 8px;
  background: ${OS_LEGAL_COLORS.danger};
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
`;

export const CollapsibleAnnotationControls: React.FC<
  CollapsibleAnnotationControlsProps
> = ({ showLabelFilters = false, triggerMode = "click" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout>();

  // Get current filter states
  const { showStructural, showSelectedOnly, showBoundingBoxes } =
    useAnnotationDisplay();
  const { spanLabelsToView } = useAnnotationControls();

  // Calculate active filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;

    // Count active display filters
    if (showStructural) count++;
    if (showSelectedOnly) count++;
    if (!showBoundingBoxes) count++; // Count as active when turned OFF (not default)

    // Count label filters
    if (spanLabelsToView && spanLabelsToView.length > 0) {
      count += spanLabelsToView.length;
    }

    return count;
  }, [showStructural, showSelectedOnly, showBoundingBoxes, spanLabelsToView]);

  const hasActiveFilters = activeFilterCount > 0;

  // Handle hover mode
  const handleMouseEnter = () => {
    if (triggerMode === "hover") {
      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      // Small delay to prevent accidental triggers
      hoverTimeoutRef.current = setTimeout(() => {
        setIsOpen(true);
      }, 200);
    }
  };

  const handleMouseLeave = () => {
    if (triggerMode === "hover") {
      // Clear any pending open
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      // Delay closing to allow moving to popup
      hoverTimeoutRef.current = setTimeout(() => {
        setIsOpen(false);
      }, 300);
    }
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Close popup when clicking outside (only in click mode)
  useEffect(() => {
    if (triggerMode !== "click") return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen, triggerMode]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  return (
    <Wrapper
      ref={wrapperRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <ControlsToggleButton
        $hasActiveFilters={hasActiveFilters}
        onClick={() => {
          if (triggerMode === "click") {
            setIsOpen(!isOpen);
          }
        }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: triggerMode === "click" ? 0.98 : 1 }}
        data-testid="annotation-controls-toggle"
        style={{
          cursor: triggerMode === "click" ? "pointer" : "default",
          position: "relative",
        }}
      >
        <Filter />
        Annotation Filters
        {hasActiveFilters && <FilterBadge>{activeFilterCount}</FilterBadge>}
        {hasActiveFilters && <ActiveIndicator />}
      </ControlsToggleButton>

      <AnimatePresence>
        {isOpen && (
          <PopupContainer
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onMouseEnter={() => {
              if (triggerMode === "hover" && hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
              }
            }}
            onMouseLeave={() => {
              if (triggerMode === "hover") {
                handleMouseLeave();
              }
            }}
          >
            <PopupHeader>
              <PopupTitle>
                <Filter />
                Annotation Filters
                {hasActiveFilters && (
                  <FilterBadge>{activeFilterCount}</FilterBadge>
                )}
              </PopupTitle>
              {triggerMode === "click" && (
                <CloseButton
                  onClick={() => setIsOpen(false)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X />
                </CloseButton>
              )}
            </PopupHeader>
            <PopupContent>
              <AnnotationControls
                variant="sidebar"
                showLabelFilters={showLabelFilters}
              />
            </PopupContent>
          </PopupContainer>
        )}
      </AnimatePresence>
    </Wrapper>
  );
};
