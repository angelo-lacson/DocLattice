import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useReactiveVar } from "@apollo/client";
import styled from "styled-components";
import { MessageSquare, Plus } from "lucide-react";
import { openedCorpus } from "../../graphql/cache";
import { navigateToCorpusThread } from "../../utils/navigationUtils";
import { ThreadList } from "../threads/ThreadList";
import { CreateThreadForm } from "../threads/CreateThreadForm";

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

const ThreadListContainer = styled.div`
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
 */
export const CorpusDiscussionsView: React.FC<CorpusDiscussionsViewProps> = ({
  corpusId,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const corpus = useReactiveVar(openedCorpus);
  const [showCreateModal, setShowCreateModal] = useState(false);

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

      <ThreadListContainer>
        <ThreadList
          corpusId={corpusId}
          embedded={false}
          onThreadClick={handleThreadClick}
        />
      </ThreadListContainer>

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
