import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import styled from "styled-components";
import { motion } from "framer-motion";
import { MessageSquare, Database, FileText, Plus, Search } from "lucide-react";
import { useQuery } from "@apollo/client";
import {
  GET_CONVERSATIONS,
  GetConversationsInputs,
  GetConversationsOutputs,
} from "../graphql/queries";
import { ThreadListItem } from "../components/threads/ThreadListItem";
import { color } from "../theme/colors";
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
  margin: 0 auto;
  padding: 2rem 4rem;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

  @media (max-width: 1400px) {
    padding: 2rem 3rem;
  }

  @media (max-width: 1024px) {
    padding: 1.5rem 2rem;
  }

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const TitleRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 800;
  color: ${color.N10};
  margin: 0;
  letter-spacing: -0.025em;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const FilterBar = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

const TabContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  background: ${color.N2};
  padding: 0.375rem;
  border-radius: 12px;
  border: 1px solid ${color.N4};
`;

const Tab = styled(motion.button)<{ $isActive: boolean }>`
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  border: none;
  background: ${(props) => (props.$isActive ? "white" : "transparent")};
  color: ${(props) => (props.$isActive ? color.N10 : color.N7)};
  font-weight: ${(props) => (props.$isActive ? "600" : "500")};
  font-size: 0.9375rem;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: ${(props) =>
    props.$isActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none"};
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    background: ${(props) =>
      props.$isActive ? "white" : "rgba(255,255,255,0.6)"};
  }

  @media (max-width: 640px) {
    padding: 0.5rem 0.875rem;
    font-size: 0.875rem;
  }
`;

const SearchInputContainer = styled.div`
  flex: 1;
  min-width: 200px;
  max-width: 400px;
  position: relative;
`;

const SearchIconStyled = styled(Search)`
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: ${color.N6};
  pointer-events: none;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.625rem 1rem 0.625rem 2.75rem;
  border: 1px solid ${color.N4};
  border-radius: 8px;
  font-size: 0.9375rem;
  color: ${color.N10};
  background: white;

  &:focus {
    outline: none;
    border-color: ${color.B5};
    box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
  }

  &::placeholder {
    color: ${color.N6};
  }
`;

const FAB = styled(motion.button)`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: linear-gradient(135deg, ${color.B6} 0%, ${color.B7} 100%);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(74, 144, 226, 0.4);
  z-index: 100;

  &:hover {
    box-shadow: 0 12px 32px rgba(74, 144, 226, 0.5);
  }

  @media (max-width: 768px) {
    bottom: 1rem;
    right: 1rem;
  }
`;

const SectionContainer = styled(motion.div)`
  margin-bottom: 2.5rem;
`;

const SectionHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid ${color.N4};
`;

const SectionIcon = styled.div<{ $color: string }>`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: ${(props) => props.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: ${color.N10};
  margin: 0;
`;

const SectionCount = styled.span`
  font-size: 0.875rem;
  color: ${color.N6};
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
  padding: 2rem 1rem;
  color: ${color.N6};
  font-size: 0.9375rem;
`;

const LoadingContainer = styled.div`
  padding: 2rem;
  display: flex;
  justify-content: center;
`;

type FilterTab = "all" | "corpus" | "document" | "general";

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
        <SectionCount>{loading ? "..." : `${totalCount} threads`}</SectionCount>
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
            <EmptyState>No discussions found</EmptyState>
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
          <TabContainer>
            <Tab
              $isActive={activeTab === "all"}
              onClick={() => setActiveTab("all")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <MessageSquare size={16} />
              All
            </Tab>
            <Tab
              $isActive={activeTab === "corpus"}
              onClick={() => setActiveTab("corpus")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Database size={16} />
              Corpus
            </Tab>
            <Tab
              $isActive={activeTab === "document"}
              onClick={() => setActiveTab("document")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <FileText size={16} />
              Document
            </Tab>
            <Tab
              $isActive={activeTab === "general"}
              onClick={() => setActiveTab("general")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <MessageSquare size={16} />
              General
            </Tab>
          </TabContainer>

          <SearchInputContainer>
            <SearchIconStyled size={18} />
            <SearchInput
              placeholder="Search discussions..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </SearchInputContainer>
        </FilterBar>
      </Header>

      {/* Corpus Discussions - show in "all" or "corpus" tabs */}
      {(activeTab === "all" || activeTab === "corpus") && (
        <ThreadSection
          title="Corpus Discussions"
          icon={<Database size={18} />}
          iconColor="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          filterType="corpus"
          searchQuery={debouncedSearch}
        />
      )}

      {/* Document Discussions - show in "all" or "document" tabs */}
      {(activeTab === "all" || activeTab === "document") && (
        <ThreadSection
          title="Document Discussions"
          icon={<FileText size={18} />}
          iconColor="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
          filterType="document"
          searchQuery={debouncedSearch}
        />
      )}

      {/* General Discussions - show in "all" or "general" tabs */}
      {(activeTab === "all" || activeTab === "general") && (
        <ThreadSection
          title="General Discussions"
          icon={<MessageSquare size={18} />}
          iconColor="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
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
        <Plus size={28} />
      </FAB>

      {/* TODO: Wire up CreateThreadButton modal */}
      {showCreateModal && <div>Create thread modal placeholder</div>}
    </Container>
  );
};
