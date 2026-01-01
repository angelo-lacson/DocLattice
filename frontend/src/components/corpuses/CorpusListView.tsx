import React, { useState, useMemo, useCallback } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useMutation, useReactiveVar } from "@apollo/client";
import {
  SearchBox,
  FilterTabs,
  CollectionCard,
  CollectionList,
  StatBlock,
  StatGrid,
  Button,
  EmptyState,
} from "@os-legal/ui";
import { Menu } from "semantic-ui-react";
import type { FilterTabItem, CollectionType } from "@os-legal/ui";
import { Plus, Upload } from "lucide-react";
import { toast } from "react-toastify";

import { CorpusType, PageInfo } from "../../types/graphql-api";
import {
  editingCorpus,
  viewingCorpus,
  deletingCorpus,
  exportingCorpus,
  showAnalyzerSelectionForCorpus,
  authToken,
  userObj,
} from "../../graphql/cache";
import {
  StartForkCorpusInput,
  StartForkCorpusOutput,
  START_FORK_CORPUS,
} from "../../graphql/mutations";
import { navigateToCorpus } from "../../utils/navigationUtils";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import { LoadingOverlay } from "../common/LoadingOverlay";

// ═══════════════════════════════════════════════════════════════════════════════
// STYLED COMPONENTS - Following DiscoveryLanding patterns
// ═══════════════════════════════════════════════════════════════════════════════

const PageContainer = styled.div`
  height: 100%;
  background: #fafafa;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  overflow-y: auto;
  overflow-x: hidden;
`;

const ContentContainer = styled.main`
  max-width: 900px;
  margin: 0 auto;
  padding: 48px 24px 80px;

  @media (max-width: 768px) {
    padding: 32px 16px 60px;
  }
`;

const HeroSection = styled.section`
  margin-bottom: 48px;
`;

const HeroTitle = styled.h1`
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 42px;
  font-weight: 400;
  line-height: 1.2;
  color: #1e293b;
  margin: 0 0 16px;

  span {
    color: #0f766e;
  }

  @media (max-width: 768px) {
    font-size: 32px;
  }
`;

const HeroSubtitle = styled.p`
  font-size: 17px;
  line-height: 1.6;
  color: #64748b;
  margin: 0 0 32px;
  max-width: 600px;
`;

const SearchContainer = styled.div`
  margin-bottom: 16px;
`;

const StatsContainer = styled.div`
  margin-bottom: 48px;
  padding: 32px 0;

  /* Override stat value size like StatsSection does */
  [class*="StatBlock"] > *:first-child,
  [data-testid="stat-value"] {
    font-size: 36px !important;
  }

  @media (max-width: 768px) {
    padding: 24px 0;

    [class*="StatBlock"] > *:first-child,
    [data-testid="stat-value"] {
      font-size: 28px !important;
    }
  }
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 16px;
  flex-wrap: wrap;
`;

const SectionTitle = styled.h2`
  font-family: "Georgia", "Times New Roman", serif;
  font-size: 24px;
  font-weight: 400;
  color: #0f766e;
  margin: 0;
`;

const ActionButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const CorpusListContainer = styled.section`
  position: relative;
  min-height: 200px;
`;

// Note: Using the class expected by CollectionCard for proper styling
const MenuButton = styled.button`
  && {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: #f1f5f9;
      color: #334155;
    }
  }
`;

const EmptyStateWrapper = styled.div`
  padding: 48px 24px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
`;

// Wrapper to handle right-click context menu on cards
const CardWrapper = styled.div`
  position: relative;
`;

// Floating context menu (similar to old CorpusItem)
const FloatingMenu = styled(Menu)`
  &.ui.menu {
    position: fixed;
    z-index: 9999;
    min-width: 180px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    padding: 4px 0;

    .item {
      padding: 10px 14px !important;
      font-size: 14px !important;
      display: flex !important;
      align-items: center !important;
      gap: 10px !important;

      &:hover {
        background: #f1f5f9 !important;
      }

      &.danger {
        color: #dc2626 !important;

        &:hover {
          background: #fef2f2 !important;
        }
      }

      i.icon {
        margin: 0 !important;
        opacity: 0.7;
      }
    }
  }
`;

// ═══════════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════════

const KebabIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16">
    <circle cx="8" cy="3" r="1.5" fill="currentColor" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    <circle cx="8" cy="13" r="1.5" fill="currentColor" />
  </svg>
);

const FolderIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <path
      d="M4 12a4 4 0 014-4h8.343a4 4 0 012.829 1.172l1.656 1.656A4 4 0 0023.657 12H32a4 4 0 014 4v16a4 4 0 01-4 4H8a4 4 0 01-4-4V12z"
      fill="currentColor"
    />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function mapCategoryToType(corpus: CorpusType): CollectionType {
  const categoryName = corpus.categories?.[0]?.name?.toLowerCase() || "";
  if (categoryName.includes("legislation")) return "legislation";
  if (categoryName.includes("contract")) return "contracts";
  if (categoryName.includes("case") || categoryName.includes("law"))
    return "case-law";
  if (categoryName.includes("knowledge")) return "knowledge";
  return "default";
}

function getVisibilityStatus(
  corpus: CorpusType,
  currentUserEmail?: string
): string {
  const isOwner = corpus.creator?.email === currentUserEmail;
  // Using Unicode symbols for visual flair
  if (corpus.isPublic) return "🌐 Public";
  if (isOwner) return "🔒 Private";
  return "👥 Shared";
}

function formatStats(corpus: CorpusType): string[] {
  const stats: string[] = [];
  const docCount =
    corpus.documents?.totalCount || corpus.documents?.edges?.length || 0;
  const annCount = corpus.annotations?.totalCount || 0;

  if (docCount > 0)
    stats.push(`${docCount} ${docCount === 1 ? "doc" : "docs"}`);
  if (annCount > 0)
    stats.push(
      `${annCount.toLocaleString()} ${
        annCount === 1 ? "annotation" : "annotations"
      }`
    );

  // Add labelset name + label count together
  if (corpus.labelSet) {
    const totalLabels =
      (corpus.labelSet.docLabelCount || 0) +
      (corpus.labelSet.spanLabelCount || 0) +
      (corpus.labelSet.tokenLabelCount || 0);
    const labelsetName = corpus.labelSet.title || "Labeled";
    if (totalLabels > 0) {
      stats.push(
        `${labelsetName} (${totalLabels} ${
          totalLabels === 1 ? "label" : "labels"
        })`
      );
    } else {
      stats.push(labelsetName);
    }
  } else {
    stats.push("No Labels");
  }

  return stats;
}

function getCategoryBadge(corpus: CorpusType): string | undefined {
  if (corpus.categories && corpus.categories.length > 0) {
    return corpus.categories[0].name;
  }
  return undefined;
}

function getLastUpdatedText(corpus: CorpusType): string {
  // If we had a modified date, we'd format it here
  // For now, return empty or a placeholder
  return "";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface CorpusListViewProps {
  corpuses: CorpusType[] | null;
  pageInfo: PageInfo | undefined;
  loading: boolean;
  fetchMore: (args?: any) => void | any;
  onCreateCorpus: () => void;
  onImportCorpus?: () => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  allowImport?: boolean;
}

export const CorpusListView: React.FC<CorpusListViewProps> = ({
  corpuses,
  pageInfo,
  loading,
  fetchMore,
  onCreateCorpus,
  onImportCorpus,
  searchValue,
  onSearchChange,
  allowImport = false,
}) => {
  const navigate = useNavigate();
  const auth_token = useReactiveVar(authToken);
  const currentUser = useReactiveVar(userObj);
  const isAuthenticated = Boolean(auth_token);
  const currentUserEmail = currentUser?.email;

  // Filter state
  const [activeFilter, setActiveFilter] = useState("all");

  // Track which menu is open and its position
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Fork mutation
  const [startForkCorpus] = useMutation<
    StartForkCorpusOutput,
    StartForkCorpusInput
  >(START_FORK_CORPUS, {
    onCompleted: () => {
      toast.success(
        "SUCCESS! Fork started. Refresh the corpus page to view fork progress."
      );
    },
    onError: () => {
      toast.error("ERROR! Could not start corpus fork.");
    },
  });

  // Filter corpuses based on active filter
  const filteredCorpuses = useMemo(() => {
    if (!corpuses) return [];

    switch (activeFilter) {
      case "my":
        return corpuses.filter((c) => c.creator?.email === currentUserEmail);
      case "shared":
        return corpuses.filter(
          (c) =>
            !c.isPublic &&
            c.creator?.email !== currentUserEmail &&
            (c.myPermissions?.length || 0) > 0
        );
      case "public":
        return corpuses.filter((c) => c.isPublic);
      default:
        return corpuses;
    }
  }, [corpuses, activeFilter, currentUserEmail]);

  // Calculate counts for filter tabs
  const filterCounts = useMemo(() => {
    if (!corpuses) return { my: 0, shared: 0, public: 0 };

    return {
      my: corpuses.filter((c) => c.creator?.email === currentUserEmail).length,
      shared: corpuses.filter(
        (c) =>
          !c.isPublic &&
          c.creator?.email !== currentUserEmail &&
          (c.myPermissions?.length || 0) > 0
      ).length,
      public: corpuses.filter((c) => c.isPublic).length,
    };
  }, [corpuses, currentUserEmail]);

  // Filter tabs configuration
  const filterItems: FilterTabItem[] = [
    { id: "all", label: "All" },
    { id: "my", label: "My Corpuses", count: String(filterCounts.my) },
    { id: "shared", label: "Shared", count: String(filterCounts.shared) },
    { id: "public", label: "Public", count: String(filterCounts.public) },
  ];

  // Calculate stats
  const stats = useMemo(() => {
    const list = corpuses || [];
    return {
      totalCorpuses: list.length,
      totalDocuments: list.reduce(
        (sum, c) =>
          sum + (c.documents?.totalCount || c.documents?.edges?.length || 0),
        0
      ),
      totalAnnotations: list.reduce(
        (sum, c) => sum + (c.annotations?.totalCount || 0),
        0
      ),
      sharedCount: list.filter(
        (c) => !c.isPublic && c.creator?.email !== currentUserEmail
      ).length,
    };
  }, [corpuses, currentUserEmail]);

  // Handle infinite scroll
  const handleFetchMore = useCallback(() => {
    if (!loading && pageInfo?.hasNextPage) {
      fetchMore({
        variables: {
          limit: 20,
          cursor: pageInfo.endCursor,
        },
      });
    }
  }, [loading, pageInfo, fetchMore]);

  // Handle corpus navigation
  const handleCorpusClick = useCallback(
    (corpus: CorpusType) => {
      // Don't navigate if menu is open
      if (openMenuId) return;
      navigateToCorpus(corpus, navigate, window.location.pathname);
    },
    [navigate, openMenuId]
  );

  // Handle opening context menu
  const handleOpenContextMenu = useCallback(
    (e: React.MouseEvent, corpusId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuPosition({ x: e.clientX, y: e.clientY });
      setOpenMenuId(corpusId);
    },
    []
  );

  // Handle closing context menu
  const handleCloseMenu = useCallback(() => {
    setOpenMenuId(null);
    setMenuPosition(null);
  }, []);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (openMenuId) {
        handleCloseMenu();
      }
    };

    if (openMenuId) {
      // Delay to prevent immediate close
      const timer = setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timer);
        document.removeEventListener("click", handleClickOutside);
      };
    }
  }, [openMenuId, handleCloseMenu]);

  // Handle search submit
  const handleSearchSubmit = useCallback(
    (value: string) => {
      onSearchChange(value);
    },
    [onSearchChange]
  );

  // Handle fork
  const handleFork = useCallback(
    (corpusId: string) => {
      startForkCorpus({ variables: { corpusId } });
    },
    [startForkCorpus]
  );

  // Determine section title based on filter
  const getSectionTitle = () => {
    switch (activeFilter) {
      case "my":
        return "My Corpuses";
      case "shared":
        return "Shared with Me";
      case "public":
        return "Public Corpuses";
      default:
        return "Your Corpuses";
    }
  };

  return (
    <PageContainer>
      <ContentContainer>
        {/* Hero Section */}
        <HeroSection>
          <HeroTitle>
            Your <span>corpuses</span>
          </HeroTitle>
          <HeroSubtitle>
            Organize documents, collaborate on annotations, and build knowledge
            collections.
          </HeroSubtitle>

          {/* Search */}
          <SearchContainer>
            <SearchBox
              placeholder="Search your corpuses..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onSubmit={handleSearchSubmit}
            />
          </SearchContainer>

          {/* Filter Tabs */}
          <FilterTabs
            items={filterItems}
            value={activeFilter}
            onChange={setActiveFilter}
          />
        </HeroSection>

        {/* Stats Grid */}
        <StatsContainer>
          <StatGrid columns={2}>
            <StatBlock
              value={stats.totalCorpuses.toString()}
              label="Corpuses"
              sublabel="in your library"
            />
            <StatBlock
              value={stats.totalDocuments.toLocaleString()}
              label="Documents"
              sublabel="across all corpuses"
            />
            <StatBlock
              value={stats.totalAnnotations.toLocaleString()}
              label="Annotations"
              sublabel="total contributions"
            />
            <StatBlock
              value={stats.sharedCount.toString()}
              label="Shared"
              sublabel="with collaborators"
            />
          </StatGrid>
        </StatsContainer>

        {/* Corpus List Section */}
        <CorpusListContainer>
          <LoadingOverlay
            active={loading}
            inverted
            size="large"
            content="Loading corpuses..."
          />

          <SectionHeader>
            <SectionTitle>{getSectionTitle()}</SectionTitle>
            {isAuthenticated && (
              <ActionButtons>
                {allowImport && onImportCorpus && (
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Upload size={16} />}
                    onClick={onImportCorpus}
                  >
                    Import
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus size={16} />}
                  onClick={onCreateCorpus}
                >
                  New Corpus
                </Button>
              </ActionButtons>
            )}
          </SectionHeader>

          {filteredCorpuses.length > 0 ? (
            <>
              <CollectionList gap="md">
                {filteredCorpuses.map((corpus) => {
                  // Status shows visibility only (with icon)
                  const visibilityStatus = getVisibilityStatus(
                    corpus,
                    currentUserEmail
                  );

                  return (
                    <CardWrapper
                      key={corpus.id}
                      onContextMenu={(e) => handleOpenContextMenu(e, corpus.id)}
                    >
                      <CollectionCard
                        type={mapCategoryToType(corpus)}
                        badge={getCategoryBadge(corpus)}
                        image={corpus.icon || undefined}
                        imageAlt={corpus.title || "Corpus icon"}
                        status={visibilityStatus}
                        title={corpus.title || "Untitled Corpus"}
                        description={corpus.description || "No description"}
                        stats={formatStats(corpus)}
                        onClick={() => handleCorpusClick(corpus)}
                        menu={
                          <MenuButton
                            type="button"
                            className="oc-collection-card__menu-button"
                            aria-label="Open menu"
                            onClick={(e) => handleOpenContextMenu(e, corpus.id)}
                          >
                            <KebabIcon />
                          </MenuButton>
                        }
                      />
                    </CardWrapper>
                  );
                })}
              </CollectionList>

              {/* Floating Context Menu */}
              {openMenuId && menuPosition && (
                <FloatingMenu
                  vertical
                  style={{
                    left: menuPosition.x,
                    top: menuPosition.y,
                  }}
                >
                  {(() => {
                    const corpus = filteredCorpuses.find(
                      (c) => c.id === openMenuId
                    );
                    if (!corpus) return null;

                    const permissions = getPermissions(
                      corpus.myPermissions || []
                    );
                    const canUpdate = permissions.includes(
                      PermissionTypes.CAN_UPDATE
                    );
                    const canRemove = permissions.includes(
                      PermissionTypes.CAN_REMOVE
                    );

                    return (
                      <>
                        {canUpdate && (
                          <Menu.Item
                            icon="edit outline"
                            content="Edit"
                            onClick={(e) => {
                              e.stopPropagation();
                              editingCorpus(corpus);
                              handleCloseMenu();
                            }}
                          />
                        )}
                        <Menu.Item
                          icon="eye"
                          content="View Details"
                          onClick={(e) => {
                            e.stopPropagation();
                            viewingCorpus(corpus);
                            handleCloseMenu();
                          }}
                        />
                        <Menu.Item
                          icon="cloud download"
                          content="Export"
                          onClick={(e) => {
                            e.stopPropagation();
                            exportingCorpus(corpus);
                            handleCloseMenu();
                          }}
                        />
                        <Menu.Item
                          icon="fork"
                          content="Fork"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFork(corpus.id);
                            handleCloseMenu();
                          }}
                        />
                        {canRemove && (
                          <Menu.Item
                            className="danger"
                            icon="trash"
                            content="Delete"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletingCorpus(corpus);
                              handleCloseMenu();
                            }}
                          />
                        )}
                      </>
                    );
                  })()}
                </FloatingMenu>
              )}
            </>
          ) : !loading ? (
            <EmptyStateWrapper>
              <EmptyState
                icon={<FolderIcon />}
                title={
                  activeFilter !== "all"
                    ? `No ${getSectionTitle().toLowerCase()}`
                    : "No corpuses yet"
                }
                description={
                  activeFilter !== "all"
                    ? "Try selecting a different filter to see more corpuses."
                    : "Create your first corpus to start organizing documents, annotations, and collaborative analysis."
                }
                size="lg"
                action={
                  activeFilter === "all" && isAuthenticated ? (
                    <Button
                      variant="primary"
                      leftIcon={<Plus size={16} />}
                      onClick={onCreateCorpus}
                    >
                      Create Your First Corpus
                    </Button>
                  ) : undefined
                }
              />
            </EmptyStateWrapper>
          ) : null}

          {/* Infinite scroll trigger */}
          <FetchMoreOnVisible fetchNextPage={handleFetchMore} />
        </CorpusListContainer>
      </ContentContainer>
    </PageContainer>
  );
};

export default CorpusListView;
