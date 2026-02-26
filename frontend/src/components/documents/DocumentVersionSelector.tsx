import React, { useState, useCallback, useRef, useEffect } from "react";
import { useLazyQuery, useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Popup, Loader, Icon } from "semantic-ui-react";
import { selectedDocVersion } from "../../graphql/cache";
import { GET_CORPUS_VERSIONS } from "../../graphql/queries";

interface CorpusVersion {
  versionNumber: number;
  documentId: string;
  documentSlug: string | null;
  created: string;
  /** Whether this is the latest (most recent) version in the corpus. */
  isCurrent: boolean;
}

const SelectorContainer = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
`;

const VersionPill = styled.button<{
  $isOutdated: boolean;
  $hasHistory: boolean;
}>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 12px;
  border: 1px solid;
  cursor: ${(props) => (props.$hasHistory ? "pointer" : "default")};
  user-select: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  line-height: 1.6;

  background: ${(props) => {
    if (props.$isOutdated) return "rgba(249, 115, 22, 0.12)";
    if (props.$hasHistory) return "rgba(59, 130, 246, 0.12)";
    return "rgba(100, 116, 139, 0.08)";
  }};

  color: ${(props) => {
    if (props.$isOutdated) return "#c2410c";
    if (props.$hasHistory) return "#1d4ed8";
    return "#64748b";
  }};

  border-color: ${(props) => {
    if (props.$isOutdated) return "rgba(249, 115, 22, 0.25)";
    if (props.$hasHistory) return "rgba(59, 130, 246, 0.25)";
    return "rgba(100, 116, 139, 0.15)";
  }};

  &:hover {
    ${(props) =>
      props.$hasHistory &&
      `
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
      background: ${
        props.$isOutdated
          ? "rgba(249, 115, 22, 0.2)"
          : "rgba(59, 130, 246, 0.2)"
      };
    `}
  }

  &:active {
    ${(props) => props.$hasHistory && `transform: translateY(0);`}
  }
`;

const DropdownMenu = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 1000;
  min-width: 220px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
`;

const DropdownItem = styled.button<{
  $isActive: boolean;
  $isFocused: boolean;
}>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 14px;
  border: none;
  background: ${(props) => {
    if (props.$isActive) return "#eff6ff";
    if (props.$isFocused) return "#f8fafc";
    return "transparent";
  }};
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
  outline: ${(props) => (props.$isFocused ? "2px solid #3b82f6" : "none")};
  outline-offset: -2px;

  &:hover {
    background: ${(props) => (props.$isActive ? "#dbeafe" : "#f8fafc")};
  }

  &:not(:last-child) {
    border-bottom: 1px solid #f1f5f9;
  }
`;

const VersionLabel = styled.span`
  font-size: 13px;
  font-weight: 500;
  color: #0f172a;
`;

const VersionDate = styled.span`
  font-size: 11px;
  color: #94a3b8;
  margin-left: 8px;
`;

const CurrentTag = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: #3b82f6;
  background: #eff6ff;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
`;

const DropdownLoading = styled.div`
  padding: 16px;
  text-align: center;
`;

interface DocumentVersionSelectorProps {
  documentId: string;
  corpusId: string;
}

/**
 * DocumentVersionSelector - Inline version badge and dropdown for switching
 * between document versions.
 *
 * Renders in the document header's MetadataRow. Shows current version number
 * with visual indicators:
 * - Gray: Single version (no history)
 * - Blue: Multiple versions, viewing latest
 * - Orange: Viewing an older version (not latest)
 *
 * Clicking opens a dropdown to switch versions via the ?v=N URL parameter.
 *
 * Supports full keyboard navigation per WAI-ARIA listbox pattern:
 * - Arrow Up/Down: Move focus between options
 * - Home/End: Jump to first/last option
 * - Enter/Space: Select the focused option
 * - Escape: Close the dropdown
 */
export const DocumentVersionSelector: React.FC<
  DocumentVersionSelectorProps
> = ({ documentId, corpusId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const location = useLocation();
  const navigate = useNavigate();
  const currentVersion = useReactiveVar(selectedDocVersion);

  const [fetchVersions, { loading, data: versionsData }] = useLazyQuery(
    GET_CORPUS_VERSIONS,
    { fetchPolicy: "cache-first" }
  );
  const versions: CorpusVersion[] =
    versionsData?.document?.corpusVersions ?? [];

  // Sort descending (newest first) once for consistent indexing
  const sortedVersions = [...versions].sort(
    (a, b) => b.versionNumber - a.versionNumber
  );

  const versionCount = versions.length;
  const hasHistory = versionCount > 1;
  const latestVersion = versions.find((v) => v.isCurrent);
  const displayVersion =
    currentVersion ?? latestVersion?.versionNumber ?? null;
  const isOutdated =
    currentVersion !== null &&
    !versions.find((v) => v.versionNumber === currentVersion && v.isCurrent);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const opening = !prev;
      if (opening) {
        // Focus the currently active option when opening
        const activeIdx = sortedVersions.findIndex((v) =>
          currentVersion === null
            ? v.isCurrent
            : v.versionNumber === currentVersion
        );
        setFocusedIndex(activeIdx >= 0 ? activeIdx : 0);
      } else {
        setFocusedIndex(-1);
      }
      return opening;
    });
  }, [sortedVersions, currentVersion]);

  const handleVersionSelect = useCallback(
    (versionNumber: number, isCurrent: boolean) => {
      setIsOpen(false);
      setFocusedIndex(-1);
      const searchParams = new URLSearchParams(location.search);

      if (isCurrent) {
        // Remove ?v= param to go to latest version
        searchParams.delete("v");
      } else {
        searchParams.set("v", String(versionNumber));
      }

      const newSearch = searchParams.toString();
      const newSearchStr = newSearch ? `?${newSearch}` : "";
      // Use replace when the result is equivalent to the current URL
      // to avoid polluting browser history on redundant clicks.
      const isNoop = newSearchStr === location.search;
      navigate({ search: newSearchStr }, { replace: isNoop });
    },
    [location.search, navigate]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation for listbox
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "Escape":
          setIsOpen(false);
          setFocusedIndex(-1);
          pillRef.current?.focus();
          event.preventDefault();
          break;
        case "ArrowDown":
          setFocusedIndex((prev) =>
            prev < sortedVersions.length - 1 ? prev + 1 : prev
          );
          event.preventDefault();
          break;
        case "ArrowUp":
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          event.preventDefault();
          break;
        case "Home":
          setFocusedIndex(0);
          event.preventDefault();
          break;
        case "End":
          setFocusedIndex(sortedVersions.length - 1);
          event.preventDefault();
          break;
        case "Enter":
        case " ": {
          if (focusedIndex >= 0 && focusedIndex < sortedVersions.length) {
            const version = sortedVersions[focusedIndex];
            handleVersionSelect(version.versionNumber, version.isCurrent);
            pillRef.current?.focus();
          }
          event.preventDefault();
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, focusedIndex, sortedVersions, handleVersionSelect]);

  // Fetch versions on mount to know if there's history
  useEffect(() => {
    if (documentId && corpusId) {
      fetchVersions({ variables: { documentId, corpusId } });
    }
  }, [documentId, corpusId, fetchVersions]);

  // Don't render anything until we have data
  if (loading && versions.length === 0) {
    return null;
  }

  // Single version, no history - show simple badge
  if (!hasHistory) {
    return (
      <SelectorContainer>
        <VersionPill $isOutdated={false} $hasHistory={false}>
          {displayVersion !== null ? `v${displayVersion}` : "v?"}
        </VersionPill>
      </SelectorContainer>
    );
  }

  return (
    <SelectorContainer ref={containerRef}>
      <Popup
        trigger={
          <VersionPill
            ref={pillRef}
            $isOutdated={isOutdated}
            $hasHistory={hasHistory}
            onClick={handleToggle}
            aria-label={`Version ${displayVersion} of ${versionCount}, click to switch versions`}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-activedescendant={
              isOpen && focusedIndex >= 0
                ? `version-option-${sortedVersions[focusedIndex]?.versionNumber}`
                : undefined
            }
          >
            v{displayVersion}
            <span style={{ fontSize: "9px", opacity: 0.7 }}>
              / {versionCount}
            </span>
            <Icon
              name={isOpen ? "chevron up" : "chevron down"}
              style={{ fontSize: "9px", margin: 0 }}
            />
          </VersionPill>
        }
        content={
          isOutdated
            ? `Viewing version ${displayVersion} of ${versionCount}. A newer version is available.`
            : `Version ${displayVersion} of ${versionCount}. Click to switch versions.`
        }
        position="bottom left"
        size="small"
        disabled={isOpen}
      />

      {isOpen && (
        <DropdownMenu role="listbox" aria-label="Document versions">
          {loading ? (
            <DropdownLoading>
              <Loader active inline="centered" size="tiny" />
            </DropdownLoading>
          ) : (
            sortedVersions.map((version, index) => {
              const isActive =
                currentVersion === null
                  ? version.isCurrent
                  : version.versionNumber === currentVersion;

              return (
                <DropdownItem
                  key={version.versionNumber}
                  id={`version-option-${version.versionNumber}`}
                  $isActive={isActive}
                  $isFocused={index === focusedIndex}
                  onClick={() =>
                    handleVersionSelect(
                      version.versionNumber,
                      version.isCurrent
                    )
                  }
                  onMouseEnter={() => setFocusedIndex(index)}
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                >
                  <div>
                    <VersionLabel>
                      Version {version.versionNumber}
                    </VersionLabel>
                    <VersionDate>
                      {new Date(version.created).toLocaleDateString()}
                    </VersionDate>
                  </div>
                  {version.isCurrent && <CurrentTag>Latest</CurrentTag>}
                </DropdownItem>
              );
            })
          )}
        </DropdownMenu>
      )}
    </SelectorContainer>
  );
};

export default DocumentVersionSelector;
