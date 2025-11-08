import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useReactiveVar } from "@apollo/client";
import styled from "styled-components";
import { ArrowLeft } from "lucide-react";
import { openedCorpus } from "../../graphql/cache";

// Placeholder for ThreadDetail component - will be imported once available
// import { ThreadDetail } from "../threads/ThreadDetail";

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;

  @media (max-width: 768px) {
    padding: 1rem;
  }
`;

const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  margin-bottom: 1.5rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  color: #64748b;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f8fafc;
    border-color: #4a90e2;
    color: #0f172a;
  }
`;

const PlaceholderContainer = styled.div`
  padding: 2rem;
  background: #f8fafc;
  border-radius: 8px;
  border: 2px dashed #cbd5e1;
  text-align: center;
  color: #64748b;
`;

/**
 * CorpusThreadRoute - Full-page route for viewing corpus discussion threads
 *
 * URL Pattern: /c/:userIdent/:corpusIdent/discussions/:threadId
 *
 * This component renders a full-page view of a discussion thread within a corpus context.
 * It provides navigation back to the corpus discussions tab and displays the thread detail.
 *
 * @example
 * URL: /c/john/legal-contracts/discussions/thread-123
 * Displays: Full thread view with back button to corpus discussions
 */
export const CorpusThreadRoute: React.FC = () => {
  const { threadId, userIdent, corpusIdent } = useParams<{
    threadId: string;
    userIdent: string;
    corpusIdent: string;
  }>();
  const navigate = useNavigate();
  const corpus = useReactiveVar(openedCorpus);

  const handleBack = () => {
    if (userIdent && corpusIdent) {
      // Navigate back to corpus discussions tab
      navigate(`/c/${userIdent}/${corpusIdent}?tab=discussions`);
    } else {
      // Fallback to browser history
      navigate(-1);
    }
  };

  if (!threadId) {
    return <Container>Thread ID not found</Container>;
  }

  return (
    <Container>
      <BackButton onClick={handleBack} aria-label="Back to Discussions">
        <ArrowLeft size={16} />
        Back to Discussions
      </BackButton>

      {/* Placeholder until ThreadDetail component is available from issue #573 */}
      <PlaceholderContainer>
        <h2>Thread Detail View</h2>
        <p>Thread ID: {threadId}</p>
        <p>Corpus: {corpus?.title || corpusIdent}</p>
        <p>
          <em>
            ThreadDetail component will be integrated here once available from
            issue #573
          </em>
        </p>
      </PlaceholderContainer>

      {/* Once ThreadDetail is available, uncomment this:
      <ThreadDetail
        conversationId={threadId}
        corpusId={corpus?.id}
        showBreadcrumbs
      />
      */}
    </Container>
  );
};
