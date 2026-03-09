import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import { OS_LEGAL_COLORS } from "../../../../assets/configurations/osLegalStyles";
import {
  MessageSquare,
  FileText,
  Filter,
  Check,
  ChevronDown,
  Search,
  Layers,
  ChartNetwork,
  Notebook,
  Eye,
  ArrowUpDown,
} from "lucide-react";
import { Dropdown } from "@os-legal/ui";
import {
  ContentFilters,
  SortOption,
  ContentItemType,
  SidebarViewMode,
} from "./types";
import { CollapsibleAnnotationControls } from "./CollapsibleAnnotationControls";

interface SidebarControlBarProps {
  /** Current view mode */
  viewMode: SidebarViewMode["mode"];
  /** Callback to change view mode */
  onViewModeChange: (mode: SidebarViewMode["mode"]) => void;
  /** Current filters (only used in feed mode) */
  filters: ContentFilters;
  /** Callback to update filters */
  onFiltersChange: (filters: ContentFilters) => void;
  /** Current sort option */
  sortBy: SortOption;
  /** Callback to update sort */
  onSortChange: (sort: SortOption) => void;
  /** Whether there's an active document search */
  hasActiveSearch?: boolean;
}

/* Styled Components */
const ControlBarContainer = styled.div`
  background: white;
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
  padding: 1.25rem;
  position: relative;
  z-index: 20;
`;

const FilterSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const FilterRow = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: stretch;

  > * {
    flex: 1;
  }
`;

const DropdownContainer = styled.div`
  position: relative;
`;

const MultiSelectDropdown = styled.div<{ $isOpen: boolean }>`
  position: relative;
  background: white;
  border: 1px solid
    ${(props) =>
      props.$isOpen ? OS_LEGAL_COLORS.primaryBlue : OS_LEGAL_COLORS.border};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: ${(props) =>
      props.$isOpen
        ? OS_LEGAL_COLORS.primaryBlue
        : OS_LEGAL_COLORS.borderHover};
  }
`;

const DropdownHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  gap: 0.75rem;
  min-height: 48px;
`;

const DropdownLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.textPrimary};
  font-weight: 500;

  svg {
    width: 18px;
    height: 18px;
    color: ${OS_LEGAL_COLORS.textSecondary};
  }
`;

const SelectedCount = styled.span`
  background: ${OS_LEGAL_COLORS.primaryBlue};
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 0.5rem;
`;

const ChevronIcon = styled(ChevronDown)<{ $isOpen: boolean }>`
  width: 18px;
  height: 18px;
  color: ${OS_LEGAL_COLORS.textSecondary};
  transform: rotate(${(props) => (props.$isOpen ? 180 : 0)}deg);
  transition: transform 0.2s ease;
`;

const DropdownMenu = styled(motion.div)`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
  z-index: 50;
  overflow: hidden;
`;

const DropdownMenuItem = styled.div<{ $isSelected?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  cursor: pointer;
  transition: all 0.15s ease;
  background: ${(props) =>
    props.$isSelected ? OS_LEGAL_COLORS.infoSurface : "transparent"};
  border-left: 3px solid
    ${(props) =>
      props.$isSelected ? OS_LEGAL_COLORS.primaryBlue : "transparent"};

  &:hover {
    background: ${(props) =>
      props.$isSelected ? "#e0f2fe" : OS_LEGAL_COLORS.surfaceHover};
  }

  &:not(:last-child) {
    border-bottom: 1px solid ${OS_LEGAL_COLORS.surfaceLight};
  }
`;

const MenuItemLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.textPrimary};
  font-weight: 500;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const CheckIcon = styled(Check)`
  width: 18px;
  height: 18px;
  color: ${OS_LEGAL_COLORS.primaryBlue};
`;

const QuickActions = styled.div`
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid ${OS_LEGAL_COLORS.surfaceLight};
  background: ${OS_LEGAL_COLORS.surfaceHover};
`;

const QuickActionButton = styled.button`
  flex: 1;
  background: white;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  color: ${OS_LEGAL_COLORS.textSecondary};
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.5rem 0.875rem;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    border-color: ${OS_LEGAL_COLORS.borderHover};
    color: ${OS_LEGAL_COLORS.textTertiary};
  }

  &:active {
    transform: scale(0.98);
  }
`;

const SearchInputWrapper = styled.div`
  position: relative;
  flex: 1;
`;

const SearchIconWrapper = styled.div`
  position: absolute;
  left: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  color: ${OS_LEGAL_COLORS.textMuted};
  pointer-events: none;

  svg {
    width: 18px;
    height: 18px;
  }
`;

const StyledSearchInput = styled.input`
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2.75rem;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 8px;
  font-size: 0.9375rem;
  color: ${OS_LEGAL_COLORS.textPrimary};
  background: white;
  transition: all 0.2s ease;
  min-height: 48px;

  &::placeholder {
    color: ${OS_LEGAL_COLORS.textMuted};
  }

  &:focus {
    outline: none;
    border-color: ${OS_LEGAL_COLORS.primaryBlue};
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }
`;

const contentTypeIcons: Record<ContentItemType, React.ReactNode> = {
  note: <Notebook />,
  annotation: <FileText />,
  relationship: <ChartNetwork />,
  search: <Search />,
};

const contentTypeLabels: Record<ContentItemType, string> = {
  note: "Notes",
  annotation: "Annotations",
  relationship: "Relationships",
  search: "Search Results",
};

const contentTypeColors: Record<ContentItemType, string> = {
  note: OS_LEGAL_COLORS.folderIcon,
  annotation: OS_LEGAL_COLORS.primaryBlue,
  relationship: "#8b5cf6",
  search: OS_LEGAL_COLORS.greenMedium,
};

const AnnotationFiltersWrapper = styled(motion.div)`
  margin-top: 0.75rem;
`;

/**
 * SidebarControlBar provides controls for switching between chat/feed views
 * and filtering content in the unified feed. Memoized to prevent unnecessary rerenders.
 */
export const SidebarControlBar: React.FC<SidebarControlBarProps> = memo(
  ({
    viewMode,
    onViewModeChange,
    filters,
    onFiltersChange,
    sortBy,
    onSortChange,
    hasActiveSearch = false,
  }) => {
    const [searchQuery, setSearchQuery] = useState(filters.searchQuery || "");
    const [showContentDropdown, setShowContentDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target as Node)
        ) {
          setShowContentDropdown(false);
        }
      };

      if (showContentDropdown) {
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
          document.removeEventListener("mousedown", handleClickOutside);
      }
    }, [showContentDropdown]);

    // Memoize callbacks to prevent child component rerenders
    const handleContentTypeToggle = useCallback(
      (type: ContentItemType) => {
        const newTypes = new Set(filters.contentTypes);
        if (newTypes.has(type)) {
          newTypes.delete(type);
        } else {
          newTypes.add(type);
        }
        onFiltersChange({ ...filters, contentTypes: newTypes });
      },
      [filters, onFiltersChange]
    );

    const handleSelectAll = useCallback(() => {
      const allTypes: ContentItemType[] = [
        "note",
        "annotation",
        "relationship",
      ];
      if (hasActiveSearch) allTypes.push("search");
      onFiltersChange({ ...filters, contentTypes: new Set(allTypes) });
    }, [filters, onFiltersChange, hasActiveSearch]);

    const handleClearAll = useCallback(() => {
      onFiltersChange({ ...filters, contentTypes: new Set() });
    }, [filters, onFiltersChange]);

    const handleSearchChange = useCallback(
      (value: string) => {
        setSearchQuery(value);
        // Debounced update to filters
        const timeoutId = setTimeout(() => {
          onFiltersChange({ ...filters, searchQuery: value || undefined });
        }, 300);
        return () => clearTimeout(timeoutId);
      },
      [filters, onFiltersChange]
    );

    const sortOptions = [
      { value: "page", label: "Page Number" },
      { value: "type", label: "Content Type" },
      { value: "date", label: "Date Created" },
    ];

    const availableContentTypes: ContentItemType[] = [
      "note",
      "annotation",
      "relationship",
    ];
    if (hasActiveSearch) availableContentTypes.push("search");

    const selectedCount = filters.contentTypes.size;

    // Check if annotations are selected
    const showAnnotationFilters =
      viewMode === "feed" && filters.contentTypes.has("annotation");

    // Don't show control bar in chat mode at all
    if (viewMode === "chat") {
      return null;
    }

    return (
      <ControlBarContainer>
        {/* Feed Filters (only shown in feed mode) */}
        <FilterSection>
          {/* Search Input */}
          <SearchInputWrapper>
            <SearchIconWrapper>
              <Search />
            </SearchIconWrapper>
            <StyledSearchInput
              placeholder="Search in content..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </SearchInputWrapper>

          {/* Content Types and Sort Row */}
          <FilterRow>
            {/* Content Type Multi-Select */}
            <DropdownContainer ref={dropdownRef}>
              <MultiSelectDropdown
                $isOpen={showContentDropdown}
                onClick={() => setShowContentDropdown(!showContentDropdown)}
              >
                <DropdownHeader>
                  <DropdownLabel>
                    <Filter />
                    Content Types
                    {selectedCount > 0 && (
                      <SelectedCount>{selectedCount}</SelectedCount>
                    )}
                  </DropdownLabel>
                  <ChevronIcon $isOpen={showContentDropdown} />
                </DropdownHeader>
              </MultiSelectDropdown>

              <AnimatePresence>
                {showContentDropdown && (
                  <DropdownMenu
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {availableContentTypes.map((type) => (
                      <DropdownMenuItem
                        key={type}
                        $isSelected={filters.contentTypes.has(type)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContentTypeToggle(type);
                        }}
                      >
                        <MenuItemLabel
                          style={{ color: contentTypeColors[type] }}
                        >
                          {contentTypeIcons[type]}
                          {contentTypeLabels[type]}
                        </MenuItemLabel>
                        {filters.contentTypes.has(type) && <CheckIcon />}
                      </DropdownMenuItem>
                    ))}
                    <QuickActions>
                      <QuickActionButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAll();
                        }}
                      >
                        Select All
                      </QuickActionButton>
                      <QuickActionButton
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearAll();
                        }}
                      >
                        Clear All
                      </QuickActionButton>
                    </QuickActions>
                  </DropdownMenu>
                )}
              </AnimatePresence>
            </DropdownContainer>

            {/* Sort Dropdown */}
            <Dropdown
              mode="select"
              fluid
              options={sortOptions}
              value={sortBy}
              onChange={(value) => onSortChange(value as SortOption)}
              placeholder="Sort by..."
              trigger={(state) => (
                <DropdownHeader>
                  <DropdownLabel>
                    <ArrowUpDown />
                    {state.selectedOption &&
                    !Array.isArray(state.selectedOption)
                      ? state.selectedOption.label
                      : state.placeholder}
                  </DropdownLabel>
                  <ChevronIcon $isOpen={state.isOpen} />
                </DropdownHeader>
              )}
            />
          </FilterRow>

          {/* Annotation-specific Filters - Collapsible */}
          <AnimatePresence>
            {showAnnotationFilters && (
              <AnnotationFiltersWrapper
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{
                  opacity: 1,
                  height: "auto",
                  marginTop: "0.75rem",
                }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.2 }}
              >
                <CollapsibleAnnotationControls showLabelFilters />
              </AnnotationFiltersWrapper>
            )}
          </AnimatePresence>
        </FilterSection>
      </ControlBarContainer>
    );
  }
);

SidebarControlBar.displayName = "SidebarControlBar";
