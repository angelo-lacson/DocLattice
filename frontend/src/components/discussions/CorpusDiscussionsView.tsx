import React, { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useReactiveVar } from "@apollo/client";
import styled from "styled-components";
import { MessageSquare, Plus, Search, Shield } from "lucide-react";
import { openedCorpus } from "../../graphql/cache";
import { navigateToCorpusThread } from "../../utils/navigationUtils";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";
import { ThreadList } from "../threads/ThreadList";
import { CreateThreadForm } from "../threads/CreateThreadForm";
import { ThreadSearch } from "../search/ThreadSearch";
import { ModerationDashboard } from "../moderation";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1.5rem;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e2e8f0;
`;

const TitleSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.025em;
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const Subtitle = styled.p`
  font-size: 0.875rem;
  color: #64748b;
  margin: 0;
`;

const CreateButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  border: none;
  border-radius: 8px;
  background: #4a90e2;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover {
    background: #357abd;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  &:active {
    transform: translateY(0);
  }
`;

const TabContainer = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #e2e8f0;
`;

const Tab = styled.button<{ $isActive: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  color: ${(props) => (props.$isActive ? "#4a90e2" : "#64748b")};
  font-size: 0.9375rem;
  font-weight: ${(props) => (props.$isActive ? "600" : "500")};
  cursor: pointer;
  border-bottom: 2px solid
    ${(props) => (props.$isActive ? "#4a90e2" : "transparent")};
  margin-bottom: -2px;
  transition: all 0.2s;

  &:hover {
    color: ${(props) => (props.$isActive ? "#4a90e2" : "#0f172a")};
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const ContentContainer = styled.div`
  flex: 1;
  overflow: auto;
`;

interface CorpusDiscussionsViewProps {
  corpusId: string;
}

/**
 * CorpusDiscussionsView - Container for corpus discussion threads
 *
 * This component displays a list of discussion threads for a corpus and provides
 * the ability to create new threads. It integrates with the routing system to
 * navigate to full-page thread views.
 *
 * @param corpusId - ID of the corpus to display discussions for
 *
 * @example
 * <CorpusDiscussionsView corpusId="corpus-123" />
 *
 * Features:
 * - Displays list of threads filtered by corpus
 * - Create new thread button with modal
 * - Navigates to full-page thread view on click
 * - Responsive design
 * - Moderation dashboard tab (visible to corpus owners and moderators)
 *   - View moderation action audit logs
 *   - View moderation metrics and statistics
 *   - Rollback automated moderation actions
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

  // Check if current user can moderate this corpus
  // Users with update or permission permissions can access the moderation dashboard
  const canModerate = useMemo(() => {
    if (!corpus) {
      return false;
    }

    // Transform raw permission strings to PermissionTypes enum
    // myPermissions from GraphQL are raw strings like "update_corpus", "permission_corpus"
    const rawPermissions = corpus.myPermissions as unknown as string[];
    const permissions = getPermissions(rawPermissions);

    // Check for moderation-related permissions
    // If user has CAN_UPDATE or CAN_PERMISSION, they can moderate
    const hasUpdate = permissions.includes(PermissionTypes.CAN_UPDATE);
    const hasPermission = permissions.includes(PermissionTypes.CAN_PERMISSION);

    return hasUpdate || hasPermission;
  }, [corpus]);

  const handleThreadClick = (threadId: string) => {
    console.log("[CorpusDiscussionsView] handleThreadClick called", {
      threadId,
      corpus,
      pathname: location.pathname,
    });
    if (corpus) {
      navigateToCorpusThread(corpus, threadId, navigate, location.pathname);
    } else {
      console.warn("[CorpusDiscussionsView] Cannot navigate - no corpus");
    }
  };

  if (!corpus) {
    return (
      <Container>
        <p>Loading corpus...</p>
      </Container>
    );
  }

  return (
    <Container>
      <Header>
        <TitleSection>
          <Title>
            <MessageSquare size={24} />
            Corpus Discussions
          </Title>
          <Subtitle>
            Forum-style threads for collaborative discussion about{" "}
            {corpus.title}
          </Subtitle>
        </TitleSection>
        <CreateButton
          onClick={() => setShowCreateModal(true)}
          aria-label="Create new discussion thread"
        >
          <Plus size={16} />
          New Thread
        </CreateButton>
      </Header>

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
          <span>Search</span>
        </Tab>
        {canModerate && (
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
        )}
      </TabContainer>

      <ContentContainer>
        {activeTab === "list" && (
          <ThreadList
            corpusId={corpusId}
            embedded={false}
            onThreadClick={handleThreadClick}
            showModeratorFilters={canModerate}
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
