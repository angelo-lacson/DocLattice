import React from "react";
import { BookOpen, Edit, Plus, Activity, Sparkles } from "lucide-react";
import { SafeMarkdown } from "../../knowledge_base/markdown/SafeMarkdown";
import {
  AboutCard,
  AboutHeader,
  AboutTitle,
  ActionButtons,
  HistoryButton,
  EditButton,
  AboutContent,
  AddDescriptionButton,
  LoadingPlaceholder,
} from "./styles";

/** Minimal corpus data required for CorpusAbout */
export interface CorpusAboutData {
  description?: string | null;
}

export interface CorpusAboutProps {
  /** The corpus object containing description data */
  corpus: CorpusAboutData;
  /** Markdown content fetched from mdDescription URL */
  mdContent: string | null;
  /** Whether the corpus data is currently loading */
  isLoading: boolean;
  /** Whether the user has permission to edit the description */
  canEdit: boolean;
  /** Callback when edit/add description button is clicked */
  onEditDescription: () => void;
  /** Test ID for the component */
  testId?: string;
}

/**
 * CorpusAbout - Displays the "About this Corpus" card with markdown description
 *
 * Features:
 * - Renders markdown content with OS-Legal design system styling
 * - Teal-colored headings (h3, h4, h5, h6)
 * - Georgia serif font for headings
 * - Version History and Edit/Add buttons
 * - Loading skeleton state
 * - Empty state with call-to-action
 */
export const CorpusAbout: React.FC<CorpusAboutProps> = ({
  corpus,
  mdContent,
  isLoading,
  canEdit,
  onEditDescription,
  testId = "corpus-about",
}) => {
  const hasContent = mdContent || corpus.description;

  return (
    <AboutCard
      id={testId}
      data-testid={testId}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ minHeight: 0 }}
    >
      <AboutHeader>
        <AboutTitle>
          <BookOpen size={22} />
          About this Corpus
        </AboutTitle>
        <ActionButtons>
          {hasContent && (
            <HistoryButton
              onClick={onEditDescription}
              aria-label="View version history"
            >
              <Activity size={14} />
              Version History
            </HistoryButton>
          )}
          {canEdit && (
            <EditButton
              onClick={onEditDescription}
              aria-label={hasContent ? "Edit description" : "Add description"}
            >
              {hasContent ? (
                <>
                  <Edit size={14} />
                  Edit
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Add Description
                </>
              )}
            </EditButton>
          )}
        </ActionButtons>
      </AboutHeader>

      <AboutContent className={!hasContent && !isLoading ? "empty" : ""}>
        {isLoading ? (
          <LoadingPlaceholder>
            <div className="title-skeleton" />
            <div className="paragraph-skeleton">
              <div className="line-skeleton long" />
              <div className="line-skeleton long" />
              <div className="line-skeleton medium" />
            </div>
            <div className="paragraph-skeleton">
              <div className="line-skeleton long" />
              <div className="line-skeleton short" />
            </div>
            <div className="paragraph-skeleton">
              <div className="line-skeleton medium" />
              <div className="line-skeleton long" />
              <div className="line-skeleton medium" />
              <div className="line-skeleton short" />
            </div>
          </LoadingPlaceholder>
        ) : mdContent ? (
          <SafeMarkdown>{mdContent}</SafeMarkdown>
        ) : corpus.description ? (
          <p>{corpus.description}</p>
        ) : (
          <>
            <Sparkles
              size={48}
              style={{ marginBottom: "1rem", color: "#cbd5e1" }}
            />
            <p
              style={{
                fontSize: "1.125rem",
                color: "#64748b",
                marginBottom: "1.5rem",
              }}
            >
              No description yet. Help others understand what this corpus
              contains.
            </p>
            {canEdit && (
              <AddDescriptionButton onClick={onEditDescription}>
                <Plus size={18} />
                Add Description
              </AddDescriptionButton>
            )}
          </>
        )}
      </AboutContent>
    </AboutCard>
  );
};
