import React, { useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useReactiveVar, useQuery } from "@apollo/client";
import { useAtom } from "jotai";
import styled from "styled-components";
import {
  MessageSquare,
  Plus,
  Search,
  Shield,
  HelpCircle,
  Lightbulb,
  AlertCircle,
} from "lucide-react";
import { openedCorpus } from "../../graphql/cache";
import { navigateToCorpusThread } from "../../utils/navigationUtils";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { ThreadList } from "../threads/ThreadList";
import { CreateThreadForm } from "../threads/CreateThreadForm";
import { ThreadSearch } from "../search/ThreadSearch";
import { ModerationDashboard } from "../moderation";
import { ThreadFilterToggles } from "../threads/ThreadFilterToggles";
import { color } from "../../theme/colors";
import { threadSortAtom, ThreadSortOption } from "../../atoms/threadAtoms";
import {
  GET_CONVERSATIONS,
  GetConversationsInputs,
  GetConversationsOutputs,
} from "../../graphql/queries";
import {
  inferDiscussionCategory,
  DiscussionCategory,
} from "../threads/DiscussionTypeBadge";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: ${color.N2};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.5rem;
  background: ${color.N1};
  border-bottom: 1px solid ${color.N4};
  gap: 1rem;

  @media (max-width: 768px) {
    padding: 0.75rem 1rem;
    flex-wrap: wrap;
  }
`;

const TitleSection = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
`;

const Breadcrumb = styled.div`
  font-size: 13px;
  color: ${color.N6};
  white-space: nowrap;

  a {
    color: ${color.N6};
    text-decoration: none;

    &:hover {
      color: ${color.G7};
      text-decoration: underline;
    }
  }

  span {
    margin: 0 0.375rem;
  }
`;

const Title = styled.h1`
  font-size: 1.25rem;
  font-weight: 700;
  color: ${color.N10};
  margin: 0;
  letter-spacing: -0.025em;
`;

const CreateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  background: ${color.G6};
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: ${color.G7};
  }

  svg {
    width: 16px;
    height: 16px;
  }

  @media (max-width: 480px) {
    padding: 0.5rem;
    span {
      display: none;
    }
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1.5rem;
  background: ${color.N1};
  border-bottom: 1px solid ${color.N4};
  flex-wrap: wrap;

  @media (max-width: 768px) {
    padding: 0.5rem 1rem;
    gap: 0.5rem;
  }
`;

const FilterPills = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
`;

const FilterPill = styled.button<{ $isActive: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid ${(props) => (props.$isActive ? color.G5 : color.N4)};
  border-radius: 16px;
  background: ${(props) => (props.$isActive ? color.G6 : color.N1)};
  color: ${(props) => (props.$isActive ? "white" : color.N7)};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${color.G5};
    background: ${(props) => (props.$isActive ? color.G7 : color.G1)};
    color: ${(props) => (props.$isActive ? "white" : color.G8)};
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

const FilterCount = styled.span<{ $isActive: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: ${(props) =>
    props.$isActive ? "rgba(255,255,255,0.25)" : color.N3};
  font-size: 10px;
  font-weight: 600;
`;

const ToolbarDivider = styled.div`
  width: 1px;
  height: 24px;
  background: ${color.N4};
  margin: 0 0.25rem;

  @media (max-width: 640px) {
    display: none;
  }
`;

const SearchInput = styled.div`
  position: relative;
  flex: 1;
  min-width: 150px;
  max-width: 280px;

  svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    color: ${color.N6};
  }

  input {
    width: 100%;
    padding: 0.375rem 0.75rem 0.375rem 2rem;
    border: 1px solid ${color.N4};
    border-radius: 6px;
    background: ${color.N1};
    font-size: 13px;
    color: ${color.N10};
    transition: all 0.15s;

    &:focus {
      outline: none;
      border-color: ${color.G5};
      box-shadow: 0 0 0 2px ${color.G1};
    }

    &::placeholder {
      color: ${color.N6};
    }
  }

  @media (max-width: 640px) {
    max-width: none;
    flex-basis: 100%;
    order: 10;
  }
`;

const SortDropdown = styled.select`
  padding: 0.375rem 1.75rem 0.375rem 0.625rem;
  border: 1px solid ${color.N4};
  border-radius: 6px;
  background: ${color.N1}
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238C96A3' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")
    no-repeat right 8px center;
  font-size: 13px;
  color: ${color.N9};
  cursor: pointer;
  appearance: none;
  transition: all 0.15s;

  &:focus {
    outline: none;
    border-color: ${color.G5};
  }

  &:hover {
    border-color: ${color.N5};
  }
`;

const TabGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;

  @media (max-width: 640px) {
    margin-left: 0;
  }
`;

const TabButton = styled.button<{ $isActive: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: 1px solid ${(props) => (props.$isActive ? color.G5 : color.N4)};
  border-radius: 6px;
  background: ${(props) => (props.$isActive ? color.G1 : color.N1)};
  color: ${(props) => (props.$isActive ? color.G7 : color.N6)};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${color.G5};
    color: ${color.G7};
  }

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ContentContainer = styled.div`
  flex: 1;
  overflow: auto;
  padding: 0;
`;

type CategoryFilter = "all" | DiscussionCategory;

interface CorpusDiscussionsViewProps {
  corpusId: string;
  /** When true, hides the built-in header (for embedding in corpus tabs) */
  hideHeader?: boolean;
}

/**
 * CorpusDiscussionsView - Container for corpus discussion threads
 *
 * Redesigned to match GitHub Discussions-style layout with:
 * - Stats bar showing discussion counts
 * - Category filter pills (All, Questions, Ideas, Help)
 * - Search input
 * - Sort dropdown
 * - Moderation dashboard tab for moderators
 */
export const CorpusDiscussionsView: React.FC<CorpusDiscussionsViewProps> = ({
  corpusId,
  hideHeader = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const corpus = useReactiveVar(openedCorpus);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "search" | "moderation">(
    "list"
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useAtom(threadSortAtom);

  // Fetch all threads for stats calculation
  const { data: threadsData } = useQuery<
    GetConversationsOutputs,
    GetConversationsInputs
  >(GET_CONVERSATIONS, {
    variables: {
      corpusId,
      conversationType: "THREAD",
      limit: 100, // Fetch more for accurate stats
    },
    fetchPolicy: "cache-and-network",
  });

  // Calculate category counts for filter pills
  const stats = useMemo(() => {
    const threads =
      threadsData?.conversations?.edges
        ?.map((e) => e?.node)
        .filter((n): n is NonNullable<typeof n> => n != null && !n.deletedAt) ||
      [];

    const categoryCounts: Record<DiscussionCategory, number> = {
      question: 0,
      idea: 0,
      help: 0,
      answered: 0,
    };

    threads.forEach((thread) => {
      const category = inferDiscussionCategory(
        thread.title || "",
        thread.description
      );
      categoryCounts[category]++;
    });

    return {
      total: threads.length,
      categories: categoryCounts,
    };
  }, [threadsData]);

  // Check if current user can moderate this corpus
  const canModerate = useMemo(() => {
    if (!corpus) return false;

    const rawPermissions = corpus.myPermissions as unknown as string[];
    const permissions = getPermissions(rawPermissions);

    const hasUpdate = permissions.includes(PermissionTypes.CAN_UPDATE);
    const hasPermission = permissions.includes(PermissionTypes.CAN_PERMISSION);

    return hasUpdate || hasPermission;
  }, [corpus]);

  const handleThreadClick = useCallback(
    (threadId: string) => {
      if (corpus) {
        navigateToCorpusThread(corpus, threadId, navigate, location.pathname);
      }
    },
    [corpus, navigate, location.pathname]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const handleCategoryChange = useCallback((category: CategoryFilter) => {
    setCategoryFilter(category);
  }, []);

  const handleSortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSortBy(e.target.value as ThreadSortOption);
    },
    [setSortBy]
  );

  if (!corpus) {
    return (
      <Container>
        <p style={{ padding: "2rem", color: color.N6 }}>Loading corpus...</p>
      </Container>
    );
  }

  return (
    <Container>
      {/* Compact Header: Breadcrumb + Title + Create button (hidden when embedded) */}
      {!hideHeader && (
        <Header>
          <TitleSection>
            <Breadcrumb>
              <a href="/corpuses">Corpuses</a>
              <span>/</span>
              <a href={`/c/${corpus.creator?.slug}/${corpus.slug}`}>
                {corpus.title}
              </a>
            </Breadcrumb>
            <Title>Discussions</Title>
          </TitleSection>
          <CreateButton
            onClick={() => setShowCreateModal(true)}
            aria-label="Create new discussion"
          >
            <Plus />
            <span>New Discussion</span>
          </CreateButton>
        </Header>
      )}

      {/* Single Toolbar: Category filters + Search + Sort + Tabs */}
      <Toolbar>
        {/* Category filter pills */}
        <FilterPills>
          <FilterPill
            $isActive={categoryFilter === "all"}
            onClick={() => handleCategoryChange("all")}
          >
            All
            <FilterCount $isActive={categoryFilter === "all"}>
              {stats.total}
            </FilterCount>
          </FilterPill>
          <FilterPill
            $isActive={categoryFilter === "question"}
            onClick={() => handleCategoryChange("question")}
          >
            <HelpCircle />
            <FilterCount $isActive={categoryFilter === "question"}>
              {stats.categories.question}
            </FilterCount>
          </FilterPill>
          <FilterPill
            $isActive={categoryFilter === "idea"}
            onClick={() => handleCategoryChange("idea")}
          >
            <Lightbulb />
            <FilterCount $isActive={categoryFilter === "idea"}>
              {stats.categories.idea}
            </FilterCount>
          </FilterPill>
          <FilterPill
            $isActive={categoryFilter === "help"}
            onClick={() => handleCategoryChange("help")}
          >
            <AlertCircle />
            <FilterCount $isActive={categoryFilter === "help"}>
              {stats.categories.help}
            </FilterCount>
          </FilterPill>
        </FilterPills>

        <ToolbarDivider />

        {/* Search */}
        <SearchInput>
          <Search />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search discussions"
          />
        </SearchInput>

        {/* Sort */}
        <SortDropdown
          aria-label="Sort discussions"
          value={sortBy}
          onChange={handleSortChange}
        >
          <option value="pinned">Pinned First</option>
          <option value="active">Recent Activity</option>
          <option value="newest">Newest</option>
          <option value="upvoted">Most Upvoted</option>
        </SortDropdown>

        {/* Moderator filter toggles */}
        {canModerate && activeTab === "list" && (
          <>
            <ToolbarDivider />
            <ThreadFilterToggles showModeratorFilters />
          </>
        )}

        {/* Tab buttons (moderators see all three, others see none - just list) */}
        {canModerate && (
          <TabGroup>
            <TabButton
              $isActive={activeTab === "list"}
              onClick={() => setActiveTab("list")}
              type="button"
              aria-label="View all threads"
            >
              <MessageSquare />
              Threads
            </TabButton>
            <TabButton
              $isActive={activeTab === "search"}
              onClick={() => setActiveTab("search")}
              type="button"
              aria-label="Advanced search"
            >
              <Search />
              Search
            </TabButton>
            <TabButton
              $isActive={activeTab === "moderation"}
              onClick={() => setActiveTab("moderation")}
              type="button"
              aria-label="Moderation dashboard"
            >
              <Shield />
              Moderate
            </TabButton>
          </TabGroup>
        )}
      </Toolbar>

      {/* Content */}
      <ContentContainer>
        {activeTab === "list" && (
          <ThreadList
            corpusId={corpusId}
            embedded
            onThreadClick={handleThreadClick}
            showModeratorFilters={false}
            searchQuery={searchQuery}
            showCreateButton={false}
            categoryFilter={categoryFilter}
          />
        )}
        {activeTab === "search" && <ThreadSearch corpusId={corpusId} />}
        {activeTab === "moderation" && canModerate && (
          <ModerationDashboard
            corpusId={corpusId}
            corpusTitle={corpus?.title}
          />
        )}
      </ContentContainer>

      {/* Create Thread Modal */}
      {showCreateModal && (
        <CreateThreadForm
          corpusId={corpusId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(threadId) => {
            setShowCreateModal(false);
            handleThreadClick(threadId);
          }}
        />
      )}
    </Container>
  );
};
