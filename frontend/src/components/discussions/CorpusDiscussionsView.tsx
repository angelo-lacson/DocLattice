import React, { useState, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useReactiveVar, useQuery } from "@apollo/client";
import styled from "styled-components";
import {
  MessageSquare,
  Plus,
  Search,
  Shield,
  Users,
  CheckCircle,
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
import { color } from "../../theme/colors";
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

  @media (max-width: 768px) {
    padding: 0;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.5rem 2rem;
  background: ${color.N1};
  border-bottom: 1px solid ${color.N4};

  @media (max-width: 768px) {
    padding: 1rem;
    flex-direction: column;
    gap: 1rem;
  }
`;

const TitleSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const Breadcrumb = styled.div`
  font-size: 13px;
  color: ${color.N6};

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
  font-size: 1.75rem;
  font-weight: 700;
  color: ${color.N10};
  margin: 0;
  letter-spacing: -0.025em;
`;

const Subtitle = styled.p`
  font-size: 0.9375rem;
  color: ${color.N6};
  margin: 0.25rem 0 0 0;
`;

const CreateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 8px;
  background: ${color.G6};
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    background: ${color.G7};
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(30, 194, 142, 0.3);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 18px;
    height: 18px;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const StatsBar = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1rem 2rem;
  background: ${color.N1};
  border-bottom: 1px solid ${color.N4};
  flex-wrap: wrap;

  @media (max-width: 768px) {
    padding: 0.75rem 1rem;
    gap: 1rem;
  }
`;

const StatItem = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  font-size: 14px;
  color: ${color.N7};

  strong {
    font-size: 18px;
    font-weight: 700;
    color: ${color.N10};
  }

  @media (max-width: 640px) {
    font-size: 13px;

    strong {
      font-size: 16px;
    }
  }
`;

const FilterBar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 2rem;
  background: ${color.N1};
  border-bottom: 1px solid ${color.N4};
  flex-wrap: wrap;

  @media (max-width: 768px) {
    padding: 0.75rem 1rem;
    gap: 0.375rem;
  }
`;

const FilterPill = styled.button<{ $isActive: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: 1px solid ${(props) => (props.$isActive ? color.G5 : color.N4)};
  border-radius: 20px;
  background: ${(props) => (props.$isActive ? color.G6 : color.N1)};
  color: ${(props) => (props.$isActive ? "white" : color.N7)};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: ${color.G5};
    background: ${(props) => (props.$isActive ? color.G7 : color.G1)};
    color: ${(props) => (props.$isActive ? "white" : color.G8)};
  }

  svg {
    width: 14px;
    height: 14px;
  }

  @media (max-width: 640px) {
    padding: 0.375rem 0.75rem;
    font-size: 12px;
  }
`;

const FilterCount = styled.span<{ $isActive: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  background: ${(props) =>
    props.$isActive ? "rgba(255,255,255,0.25)" : color.N3};
  font-size: 11px;
  font-weight: 600;

  @media (max-width: 640px) {
    min-width: 18px;
    height: 18px;
    font-size: 10px;
  }
`;

const SearchAndSortBar = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 2rem;
  background: ${color.N1};
  border-bottom: 1px solid ${color.N4};

  @media (max-width: 768px) {
    padding: 0.75rem 1rem;
    flex-direction: column;
    gap: 0.75rem;
  }
`;

const SearchInput = styled.div`
  flex: 1;
  position: relative;
  max-width: 500px;

  svg {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 18px;
    height: 18px;
    color: ${color.N6};
  }

  input {
    width: 100%;
    padding: 0.625rem 1rem 0.625rem 2.5rem;
    border: 1px solid ${color.N4};
    border-radius: 8px;
    background: ${color.N1};
    font-size: 14px;
    color: ${color.N10};
    transition: all 0.15s;

    &:focus {
      outline: none;
      border-color: ${color.G5};
      box-shadow: 0 0 0 3px ${color.G1};
    }

    &::placeholder {
      color: ${color.N6};
    }
  }

  @media (max-width: 768px) {
    max-width: none;
    width: 100%;
  }
`;

const SortDropdown = styled.select`
  padding: 0.625rem 2rem 0.625rem 1rem;
  border: 1px solid ${color.N4};
  border-radius: 8px;
  background: ${color.N1}
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238C96A3' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")
    no-repeat right 10px center;
  font-size: 14px;
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

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const TabContainer = styled.div`
  display: flex;
  gap: 0;
  background: ${color.N1};
  border-bottom: 1px solid ${color.N4};
  padding: 0 2rem;

  @media (max-width: 768px) {
    padding: 0 1rem;
  }
`;

const Tab = styled.button<{ $isActive: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.25rem;
  border: none;
  background: transparent;
  color: ${(props) => (props.$isActive ? color.G7 : color.N6)};
  font-size: 0.9375rem;
  font-weight: ${(props) => (props.$isActive ? "600" : "500")};
  cursor: pointer;
  border-bottom: 2px solid
    ${(props) => (props.$isActive ? color.G6 : "transparent")};
  margin-bottom: -1px;
  transition: all 0.15s;

  &:hover {
    color: ${(props) => (props.$isActive ? color.G7 : color.N9)};
  }

  svg {
    width: 18px;
    height: 18px;
  }

  @media (max-width: 640px) {
    padding: 0.75rem 1rem;
    font-size: 0.875rem;

    svg {
      width: 16px;
      height: 16px;
    }
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

  // Calculate stats from threads
  const stats = useMemo(() => {
    const threads =
      threadsData?.conversations?.edges
        ?.map((e) => e?.node)
        .filter((n): n is NonNullable<typeof n> => n != null) || [];

    const categoryCounts: Record<DiscussionCategory, number> = {
      question: 0,
      idea: 0,
      help: 0,
      answered: 0,
    };

    // Collect unique participants
    const participants = new Set<string>();

    threads.forEach((thread) => {
      if (thread.deletedAt) return; // Don't count deleted threads

      const category = inferDiscussionCategory(
        thread.title || "",
        thread.description
      );
      categoryCounts[category]++;

      if (thread.creator?.id) {
        participants.add(thread.creator.id);
      }
    });

    // Count open vs answered (threads with replies are considered "answered")
    const openCount = threads.filter(
      (t) =>
        !t.deletedAt &&
        (!t.chatMessages?.totalCount || t.chatMessages.totalCount === 0)
    ).length;
    const answeredCount = threads.filter(
      (t) =>
        !t.deletedAt &&
        t.chatMessages?.totalCount &&
        t.chatMessages.totalCount > 0
    ).length;

    return {
      total: threads.filter((t) => !t.deletedAt).length,
      open: openCount,
      answered: answeredCount,
      participants: participants.size,
      categories: categoryCounts,
    };
  }, [threadsData]);

  // Filter threads by category
  const filteredThreads = useMemo(() => {
    if (categoryFilter === "all") return undefined; // Let ThreadList handle filtering

    const threads =
      threadsData?.conversations?.edges
        ?.map((e) => e?.node)
        .filter((n): n is NonNullable<typeof n> => n != null) || [];

    return threads.filter((thread) => {
      const category = inferDiscussionCategory(
        thread.title || "",
        thread.description
      );
      return category === categoryFilter;
    });
  }, [threadsData, categoryFilter]);

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

  if (!corpus) {
    return (
      <Container>
        <p style={{ padding: "2rem", color: color.N6 }}>Loading corpus...</p>
      </Container>
    );
  }

  return (
    <Container>
      {/* Header */}
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
          <Subtitle>Community conversations about this corpus</Subtitle>
        </TitleSection>
        <CreateButton
          onClick={() => setShowCreateModal(true)}
          aria-label="Create new discussion"
        >
          <Plus />
          New Discussion
        </CreateButton>
      </Header>

      {/* Stats Bar */}
      <StatsBar>
        <StatItem>
          <strong>{stats.total}</strong> discussions
        </StatItem>
        <StatItem>
          <strong>{stats.open}</strong> open
        </StatItem>
        <StatItem>
          <strong>{stats.answered}</strong> answered
        </StatItem>
        <StatItem>
          <Users size={16} style={{ marginRight: 4 }} />
          <strong>{stats.participants}</strong> participants
        </StatItem>
      </StatsBar>

      {/* Category Filter Pills */}
      <FilterBar>
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
          Questions
          <FilterCount $isActive={categoryFilter === "question"}>
            {stats.categories.question}
          </FilterCount>
        </FilterPill>
        <FilterPill
          $isActive={categoryFilter === "idea"}
          onClick={() => handleCategoryChange("idea")}
        >
          <Lightbulb />
          Ideas
          <FilterCount $isActive={categoryFilter === "idea"}>
            {stats.categories.idea}
          </FilterCount>
        </FilterPill>
        <FilterPill
          $isActive={categoryFilter === "help"}
          onClick={() => handleCategoryChange("help")}
        >
          <AlertCircle />
          Help
          <FilterCount $isActive={categoryFilter === "help"}>
            {stats.categories.help}
          </FilterCount>
        </FilterPill>
      </FilterBar>

      {/* Search and Sort Bar */}
      <SearchAndSortBar>
        <SearchInput>
          <Search />
          <input
            type="text"
            placeholder="Search discussions..."
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search discussions"
          />
        </SearchInput>
        <SortDropdown aria-label="Sort discussions">
          <option value="recent">Recent Activity</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most-replied">Most Replied</option>
        </SortDropdown>
      </SearchAndSortBar>

      {/* Tabs (only show moderation for moderators) */}
      {canModerate && (
        <TabContainer>
          <Tab
            $isActive={activeTab === "list"}
            onClick={() => setActiveTab("list")}
            type="button"
            aria-label="View all threads"
            aria-selected={activeTab === "list"}
          >
            <MessageSquare />
            <span>All Threads</span>
          </Tab>
          <Tab
            $isActive={activeTab === "search"}
            onClick={() => setActiveTab("search")}
            type="button"
            aria-label="Search threads"
            aria-selected={activeTab === "search"}
          >
            <Search />
            <span>Advanced Search</span>
          </Tab>
          <Tab
            $isActive={activeTab === "moderation"}
            onClick={() => setActiveTab("moderation")}
            type="button"
            aria-label="Moderation dashboard"
            aria-selected={activeTab === "moderation"}
          >
            <Shield />
            <span>Moderation</span>
          </Tab>
        </TabContainer>
      )}

      {/* Content */}
      <ContentContainer>
        {activeTab === "list" && (
          <ThreadList
            corpusId={corpusId}
            embedded={false}
            onThreadClick={handleThreadClick}
            showModeratorFilters={canModerate}
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
