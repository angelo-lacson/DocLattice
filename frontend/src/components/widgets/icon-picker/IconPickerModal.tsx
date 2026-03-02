import React, { useCallback, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { Search, X } from "lucide-react";

import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";
import { resolveIcon } from "../../../utils/iconCompat";
import {
  ICON_CATEGORIES,
  LUCIDE_ICONS,
  type IconCategory,
  type IconEntry,
} from "./icons";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICON_CELL_SIZE = 56;
const GRID_GAP = 4;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IconPickerModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Currently selected icon name (Lucide kebab-case). */
  value?: string;
  /** Called when the user confirms a selection. */
  onSelect: (name: string) => void;
  /** Called when the modal is dismissed without selecting. */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const IconPickerModal: React.FC<IconPickerModalProps> = ({
  open,
  value,
  onSelect,
  onClose,
}) => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<IconCategory | "all">("all");
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Filter icons by search + category
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return LUCIDE_ICONS.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (!q) return true;
      return (
        entry.name.includes(q) ||
        entry.label.toLowerCase().includes(q) ||
        entry.category.includes(q)
      );
    });
  }, [search, category]);

  const handleSelect = useCallback(
    (name: string) => {
      onSelect(name);
      setSearch("");
      setCategory("all");
    },
    [onSelect]
  );

  const handleClose = useCallback(() => {
    setSearch("");
    setCategory("all");
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    },
    [handleClose]
  );

  // Resolve the preview icon for the hovered or selected entry
  const previewName = hoveredIcon ?? value ?? null;

  if (!open) return null;

  return (
    <Backdrop onClick={handleClose} data-testid="icon-picker-backdrop">
      <ModalContainer
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Icon picker"
        data-testid="icon-picker-modal"
      >
        {/* ── Header ─────────────────────────────────────── */}
        <Header>
          <HeaderTitle>Select Icon</HeaderTitle>
          <CloseButton
            onClick={handleClose}
            aria-label="Close"
            data-testid="icon-picker-close"
          >
            <X size={18} />
          </CloseButton>
        </Header>

        {/* ── Search ─────────────────────────────────────── */}
        <SearchWrapper>
          <SearchIcon>
            <Search size={16} />
          </SearchIcon>
          <SearchInput
            ref={searchRef}
            type="text"
            placeholder="Search icons…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            data-testid="icon-picker-search"
          />
          {search && (
            <ClearButton
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              aria-label="Clear search"
              data-testid="icon-picker-clear-search"
            >
              <X size={14} />
            </ClearButton>
          )}
        </SearchWrapper>

        {/* ── Category pills ─────────────────────────────── */}
        <CategoryRow data-testid="icon-picker-categories">
          <CategoryPill
            $active={category === "all"}
            onClick={() => setCategory("all")}
          >
            All
          </CategoryPill>
          {ICON_CATEGORIES.map((cat) => (
            <CategoryPill
              key={cat.id}
              $active={category === cat.id}
              onClick={() => setCategory(cat.id)}
            >
              {cat.label}
            </CategoryPill>
          ))}
        </CategoryRow>

        {/* ── Grid ───────────────────────────────────────── */}
        <GridWrapper data-testid="icon-picker-grid">
          {filtered.length === 0 ? (
            <EmptyState data-testid="icon-picker-empty">
              No icons match &ldquo;{search}&rdquo;
            </EmptyState>
          ) : (
            <Grid>
              {filtered.map((entry) => (
                <IconCell
                  key={entry.name}
                  $selected={entry.name === value}
                  onClick={() => handleSelect(entry.name)}
                  onMouseEnter={() => setHoveredIcon(entry.name)}
                  onMouseLeave={() => setHoveredIcon(null)}
                  title={entry.label}
                  aria-label={entry.label}
                  data-testid={`icon-cell-${entry.name}`}
                >
                  <IconRenderer name={entry.name} />
                </IconCell>
              ))}
            </Grid>
          )}
        </GridWrapper>

        {/* ── Preview bar ────────────────────────────────── */}
        <PreviewBar data-testid="icon-picker-preview">
          {previewName ? (
            <PreviewContent entry={findEntry(previewName)} name={previewName} />
          ) : (
            <PreviewHint>Hover or select an icon to preview</PreviewHint>
          )}
        </PreviewBar>
      </ModalContainer>
    </Backdrop>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Renders a single Lucide icon component by name. */
const IconRenderer: React.FC<{ name: string }> = React.memo(({ name }) => {
  const Icon = resolveIcon(name);
  return <Icon size={20} />;
});

/** Renders the preview bar content. */
const PreviewContent: React.FC<{
  entry: IconEntry | undefined;
  name: string;
}> = ({ entry, name }) => {
  const Icon = resolveIcon(name);
  return (
    <>
      <Icon size={28} />
      <PreviewLabel>
        <PreviewName>{name}</PreviewName>
        {entry && <PreviewCategory>{entry.category}</PreviewCategory>}
      </PreviewLabel>
    </>
  );
};

function findEntry(name: string): IconEntry | undefined {
  return LUCIDE_ICONS.find((i) => i.name === name);
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
`;

const ModalContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 560px;
  max-width: 95vw;
  max-height: 80vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.18);
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid ${OS_LEGAL_COLORS.border};
`;

const HeaderTitle = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
`;

const CloseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: ${OS_LEGAL_COLORS.textSecondary};
  transition: all 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    color: ${OS_LEGAL_COLORS.textPrimary};
  }
`;

const SearchWrapper = styled.div`
  position: relative;
  margin: 12px 20px 0;
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: ${OS_LEGAL_COLORS.textMuted};
  pointer-events: none;
  display: flex;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 8px 32px 8px 34px;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  border-radius: 8px;
  font-size: 14px;
  color: ${OS_LEGAL_COLORS.textPrimary};
  outline: none;
  box-sizing: border-box;

  &::placeholder {
    color: ${OS_LEGAL_COLORS.textMuted};
  }

  &:focus {
    border-color: ${OS_LEGAL_COLORS.accent};
    box-shadow: 0 0 0 3px ${OS_LEGAL_COLORS.accentLight};
  }
`;

const ClearButton = styled.button`
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: ${OS_LEGAL_COLORS.surfaceHover};
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: ${OS_LEGAL_COLORS.textSecondary};

  &:hover {
    background: ${OS_LEGAL_COLORS.border};
  }
`;

const CategoryRow = styled.div`
  display: flex;
  gap: 6px;
  padding: 12px 20px 0;
  overflow-x: auto;
  flex-shrink: 0;

  /* Hide scrollbar but keep scrollable */
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const CategoryPill = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  padding: 4px 12px;
  border: 1px solid
    ${(p) => (p.$active ? OS_LEGAL_COLORS.accent : OS_LEGAL_COLORS.border)};
  border-radius: 999px;
  background: ${(p) => (p.$active ? OS_LEGAL_COLORS.accentLight : "#fff")};
  color: ${(p) =>
    p.$active ? OS_LEGAL_COLORS.accent : OS_LEGAL_COLORS.textSecondary};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${OS_LEGAL_COLORS.accent};
    color: ${OS_LEGAL_COLORS.accent};
  }
`;

const GridWrapper = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
  min-height: 200px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${ICON_CELL_SIZE}px, 1fr));
  gap: ${GRID_GAP}px;
`;

const IconCell = styled.button<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: ${ICON_CELL_SIZE}px;
  height: ${ICON_CELL_SIZE}px;
  padding: 0;
  border: 2px solid
    ${(p) => (p.$selected ? OS_LEGAL_COLORS.accent : "transparent")};
  border-radius: 8px;
  background: ${(p) =>
    p.$selected ? OS_LEGAL_COLORS.accentLight : "transparent"};
  color: ${(p) =>
    p.$selected ? OS_LEGAL_COLORS.accent : OS_LEGAL_COLORS.textSecondary};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
    color: ${OS_LEGAL_COLORS.textPrimary};
    border-color: ${OS_LEGAL_COLORS.border};
  }
`;

const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: ${OS_LEGAL_COLORS.textMuted};
  font-size: 14px;
`;

const PreviewBar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid ${OS_LEGAL_COLORS.border};
  min-height: 52px;
  background: ${OS_LEGAL_COLORS.surfaceHover};
`;

const PreviewHint = styled.span`
  color: ${OS_LEGAL_COLORS.textMuted};
  font-size: 13px;
`;

const PreviewLabel = styled.div`
  display: flex;
  flex-direction: column;
`;

const PreviewName = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
  font-family: monospace;
`;

const PreviewCategory = styled.span`
  font-size: 11px;
  color: ${OS_LEGAL_COLORS.textMuted};
  text-transform: capitalize;
`;
