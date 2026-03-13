import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import styled from "styled-components";
import {
  accentAlpha,
  OS_LEGAL_COLORS,
} from "../assets/configurations/osLegalStyles";
import { motion } from "framer-motion";
import { MessageSquare, Database, FileText, Plus } from "lucide-react";
import { FilterTabs, SearchBox } from "@os-legal/ui";
import type { FilterTabItem } from "@os-legal/ui";
import { useQuery } from "@apollo/client";
import {
  GET_CONVERSATIONS,
  GetConversationsInputs,
  GetConversationsOutputs,
} from "../graphql/queries";
import { ThreadListItem } from "../components/threads/ThreadListItem";
import {
  CORPUS_COLORS,
  CORPUS_FONTS,
  CORPUS_RADII,
  mediaQuery,
} from "../components/threads/styles/discussionStyles";
import { ModernLoadingDisplay } from "../components/widgets/ModernLoadingDisplay";

// Custom hook for debounced value
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Styled components
const Container = styled.div`
  max-width: 75rem;
  margin: 0 auto;
  padding: 2.5rem 4rem;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  @media (max-width: 1400px) {
    padding: 2rem 3rem;
  }

  @media (max-width: 1024px) {
    padding: 1.5rem 2rem;
  }

  ${mediaQuery.mobile} {
    padding: 1rem;
  }
`;

const Header = styled.div`
  margin-bottom: 1.5rem;
`;

const TitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
`;

const Title = styled.h1`
  font-family: ${CORPUS_FONTS.serif};
  font-size: 2rem;
  font-weight: 700;
  color: ${CORPUS_COLORS.slate[900]};
  margin: 0;
  letter-spacing: -0.02em;

  ${mediaQuery.mobile} {
    font-size: 1.5rem;
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;

  ${mediaQuery.mobile} {
    gap: 0.5rem;
  }
`;

const SearchContainer = styled.div`
  flex: 1;
  min-width: 12.5rem;
  max-width: 20rem;

  ${mediaQuery.mobile} {
    min-width: 100%;
    max-width: none;
  }
`;

const FAB = styled(motion.button)`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 3rem;
  height: 3rem;
  border-radius: ${CORPUS_RADII.xl};
  background: linear-gradient(
    135deg,
    ${CORPUS_COLORS.teal[600]} 0%,
    ${CORPUS_COLORS.teal[700]} 100%
  );
  border: none;
  color: ${CORPUS_COLORS.white};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 8px 24px ${accentAlpha(0.4)};
  z-index: 100;

  &:hover {
    box-shadow: 0 12px 32px ${accentAlpha(0.5)};
  }

  ${mediaQuery.mobile} {
    bottom: 1rem;
    right: 1rem;
  }
`;

const SectionContainer = styled(motion.div)`
  margin-bottom: 2rem;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.625rem;
  border-bottom: 1px solid ${CORPUS_COLORS.slate[200]};
`;

const SectionIcon = styled.div<{ $color: string }>`
  width: 1.625rem;
  height: 1.625rem;
  border-radius: ${CORPUS_RADII.sm};
  background: ${(props) => props.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${CORPUS_COLORS.white};
  flex-shrink: 0;

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`;

const SectionTitle = styled.h2`
  font-family: ${CORPUS_FONTS.serif};
  font-size: 1.125rem;
  font-weight: 600;
  color: ${CORPUS_COLORS.slate[800]};
  margin: 0;
`;

const SectionCount = styled.span`
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
  color: ${CORPUS_COLORS.slate[400]};
  font-weight: 500;
  margin-left: auto;
`;

const ThreadGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 1.5rem 1rem;
  color: ${CORPUS_COLORS.slate[400]};
  font-family: ${CORPUS_FONTS.sans};
  font-size: 0.8125rem;
`;

const LoadingContainer = styled.div`
  padding: 2rem;
  display: flex;
  justify-content: center;
`;

type FilterTab = "all" | "corpus" | "document" | "general";

const VALID_FILTER_TABS = new Set<FilterTab>([
  "all",
  "corpus",
  "document",
  "general",
]);

const FILTER_ITEMS: FilterTabItem[] = [
  { id: "all", label: "All", icon: <MessageSquare size={14} /> },
  { id: "corpus", label: "Corpus", icon: <Database size={14} /> },
  { id: "document", label: "Document", icon: <FileText size={14} /> },
  { id: "general", label: "General", icon: <MessageSquare size={14} /> },
];

/**
 * Thread section component - handles its own query
 */
interface ThreadSectionProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  filterType: "corpus" | "document" | "general";
  searchQuery: string;
}

const ThreadSection: React.FC<ThreadSectionProps> = ({
  title,
  icon,
  iconColor,
  filterType,
  searchQuery,
}) => {
  // Memoize variables to prevent unnecessary query restarts
  const variables = useMemo((): GetConversationsInputs => {
    const base: GetConversationsInputs = {
      conversationType: "THREAD",
      limit: 20,
      title_Contains: searchQuery || undefined,
    };

    switch (filterType) {
      case "corpus":
        return { ...base, hasCorpus: true, hasDocument: false };
      case "document":
        return { ...base, hasDocument: true };
      case "general":
        return { ...base, hasCorpus: false, hasDocument: false };
    }
  }, [filterType, searchQuery]);

  const { data, loading } = useQuery<
    GetConversationsOutputs,
    GetConversationsInputs
  >(GET_CONVERSATIONS, {
    variables,
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  const threads =
    data?.conversations?.edges
      ?.map((e) => e?.node)
      .filter((node): node is NonNullable<typeof node> => node != null)
      .filter((t) => !t?.deletedAt)
      .sort((a, b) => {
        // Pinned first, then by date
        if (a?.isPinned && !b?.isPinned) return -1;
        if (!a?.isPinned && b?.isPinned) return 1;
        return (
          new Date(b?.createdAt || 0).getTime() -
          new Date(a?.createdAt || 0).getTime()
        );
      }) || [];

  const totalCount = data?.conversations?.totalCount ?? threads.length;

  return (
    <SectionContainer
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <SectionHeader>
        <SectionIcon $color={iconColor}>{icon}</SectionIcon>
        <SectionTitle>{title}</SectionTitle>
        <SectionCount>
          {loading
            ? "..."
            : `${totalCount} ${totalCount === 1 ? "thread" : "threads"}`}
        </SectionCount>
      </SectionHeader>

      {loading && !data ? (
        <LoadingContainer>
          <ModernLoadingDisplay message="Loading..." size="small" />
        </LoadingContainer>
      ) : (
        <ThreadGrid>
          {threads.length > 0 ? (
            threads.map((thread) => (
              <ThreadListItem key={thread.id} thread={thread} />
            ))
          ) : (
            <EmptyState>
              {searchQuery
                ? "No discussions match your search"
                : "No discussions yet"}
            </EmptyState>
          )}
        </ThreadGrid>
      )}
    </SectionContainer>
  );
};

/**
 * Global Discussions View
 * Shows all platform discussions with tabbed filtering
 * Uses server-side filtering for efficiency
 * Part of Issue #623
 */
export const GlobalDiscussions: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchInput, setSearchInput] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Debounce the search input (300ms delay)
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Initialize search input from URL parameter
  useEffect(() => {
    const urlSearch = searchParams.get("search");
    if (urlSearch) {
      setSearchInput(urlSearch);
    }
  }, [searchParams]);

  return (
    <Container>
      <Header>
        <TitleRow>
          <Title>Discussions</Title>
        </TitleRow>

        <FilterBar>
          <FilterTabs
            items={FILTER_ITEMS}
            value={activeTab}
            onChange={(id) => {
              if (VALID_FILTER_TABS.has(id as FilterTab)) {
                setActiveTab(id as FilterTab);
              }
            }}
          />

          <SearchContainer>
            <SearchBox
              placeholder="Search discussions..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onSubmit={(value) => setSearchInput(value)}
              hideButton
            />
          </SearchContainer>
        </FilterBar>
      </Header>

      {/* Corpus Discussions - show in "all" or "corpus" tabs */}
      {(activeTab === "all" || activeTab === "corpus") && (
        <ThreadSection
          title="Corpus Discussions"
          icon={<Database size={14} />}
          iconColor={`linear-gradient(135deg, ${CORPUS_COLORS.teal[600]} 0%, ${CORPUS_COLORS.teal[800]} 100%)`}
          filterType="corpus"
          searchQuery={debouncedSearch}
        />
      )}

      {/* Document Discussions - show in "all" or "document" tabs */}
      {(activeTab === "all" || activeTab === "document") && (
        <ThreadSection
          title="Document Discussions"
          icon={<FileText size={14} />}
          iconColor={`linear-gradient(135deg, ${OS_LEGAL_COLORS.primaryBlue} 0%, ${OS_LEGAL_COLORS.blueDark} 100%)`}
          filterType="document"
          searchQuery={debouncedSearch}
        />
      )}

      {/* General Discussions - show in "all" or "general" tabs */}
      {(activeTab === "all" || activeTab === "general") && (
        <ThreadSection
          title="General Discussions"
          icon={<MessageSquare size={14} />}
          iconColor={`linear-gradient(135deg, ${CORPUS_COLORS.slate[500]} 0%, ${CORPUS_COLORS.slate[700]} 100%)`}
          filterType="general"
          searchQuery={debouncedSearch}
        />
      )}

      <FAB
        onClick={() => setShowCreateModal(true)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Create new discussion"
      >
        <Plus size={22} />
      </FAB>

      {/* Placeholder — CreateThread modal not yet implemented */}
      {showCreateModal && <div>Create thread modal placeholder</div>}
    </Container>
  );
};
