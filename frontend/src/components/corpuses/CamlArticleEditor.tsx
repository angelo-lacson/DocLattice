/**
 * CamlArticleEditor — Full-screen modal editor for Readme.CAML articles.
 *
 * Supports both creating new articles and editing existing ones.
 * Uses the UploadDocument mutation to create/version the Readme.CAML document.
 * Preview pane renders the parsed CAML via CamlArticle renderer.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import { BookOpen, Check, Eye, Edit, Save } from "lucide-react";
import styled from "styled-components";

import { Modal } from "@os-legal/ui";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";
import { CAML_ARTICLE_FILENAME } from "../../assets/configurations/constants";
import {
  GET_CORPUS_ARTICLE,
  GetCorpusArticleInput,
  GetCorpusArticleOutput,
} from "../../graphql/queries";
import {
  UPLOAD_DOCUMENT,
  UploadDocumentInputProps,
  UploadDocumentOutputProps,
} from "../../graphql/mutations";
import { parseCaml, CamlArticle } from "../../caml";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const StyledModalWrapper = styled.div`
  .modal-overlay {
    z-index: 1000;
  }

  [class*="modal-content"],
  [class*="ModalContent"],
  [role="dialog"] > div {
    width: 95vw !important;
    max-width: 1400px !important;
    height: 90vh !important;
    max-height: 90vh !important;
    border-radius: 16px !important;
    overflow: hidden !important;
  }

  @media (max-width: 768px) {
    [class*="modal-content"],
    [class*="ModalContent"],
    [role="dialog"] > div {
      width: 100vw !important;
      height: 100vh !important;
      max-height: 100vh !important;
      border-radius: 0 !important;
    }
  }
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: #fafbfc;

  h2 {
    font-size: 1rem;
    font-weight: 600;
    color: ${OS_LEGAL_COLORS.textPrimary};
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    flex: 1;
  }
`;

const ContentWrapper = styled.div`
  display: flex;
  height: calc(90vh - 60px - 64px);
  overflow: hidden;

  @media (max-width: 768px) {
    flex-direction: column;
    height: calc(100vh - 60px - 64px);
  }
`;

const EditorPane = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid #e2e8f0;
`;

const PaneHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const EditorTextarea = styled.textarea`
  flex: 1;
  width: 100%;
  padding: 1rem;
  border: none;
  resize: none;
  font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: ${OS_LEGAL_COLORS.textPrimary};
  background: #ffffff;
  outline: none;

  &::placeholder {
    color: #94a3b8;
  }
`;

const PreviewPane = styled.div`
  flex: 1;
  overflow-y: auto;
  background: #ffffff;
  min-width: 0;
`;

const ActionBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0.75rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  background: #fafbfc;
`;

const ActionButton = styled.button<{ $primary?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid
    ${({ $primary }) => ($primary ? OS_LEGAL_COLORS.accent : "#e2e8f0")};
  background: ${({ $primary }) =>
    $primary ? OS_LEGAL_COLORS.accent : "#ffffff"};
  color: ${({ $primary }) =>
    $primary ? "#ffffff" : OS_LEGAL_COLORS.textPrimary};

  &:hover {
    background: ${({ $primary }) =>
      $primary ? OS_LEGAL_COLORS.accentHover : "#f8fafc"};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const UnsavedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 600;
  background: #fef3c7;
  color: #92400e;
`;

const CAML_TEMPLATE = `---
version: "1.0"

hero:
  kicker: "Your organization · Interactive analysis"
  title:
    - "Your article"
    - "{title here}"
  subtitle: >
    Write a compelling subtitle that describes what this
    article is about and why readers should care.
  stats:
    - "Documents analyzed"
    - "Key findings"
---

::: chapter {#introduction}
>! Chapter 1
## Getting started

Write your article content here using CAML syntax.
You can use **bold**, *italic*, and [links](https://example.com).

>>> "Use triple blockquotes for pullquotes that stand out."

::: cards {columns: 2}

- **Key Finding 1** | #0f766e
  Describe the first key finding here.
  ~ Source: Document A

- **Key Finding 2** | #c4573a
  Describe the second key finding here.
  ~ Source: Document B

:::

:::
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CamlArticleEditorProps {
  corpusId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export const CamlArticleEditor: React.FC<CamlArticleEditorProps> = ({
  corpusId,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [content, setContent] = useState("");
  const [currentContent, setCurrentContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [isNew, setIsNew] = useState(false);

  // Query for existing Readme.CAML
  const articleVars = useMemo<GetCorpusArticleInput>(
    () => ({ corpusId, title: CAML_ARTICLE_FILENAME }),
    [corpusId]
  );

  const { data, refetch } = useQuery<
    GetCorpusArticleOutput,
    GetCorpusArticleInput
  >(GET_CORPUS_ARTICLE, {
    variables: articleVars,
    skip: !isOpen,
  });

  const [uploadDocument, { loading: saving }] = useMutation<
    UploadDocumentOutputProps,
    UploadDocumentInputProps
  >(UPLOAD_DOCUMENT);

  const articleDoc = data?.documents?.edges?.[0]?.node;

  // Load content from existing document or start with template
  useEffect(() => {
    if (!isOpen) return;

    if (articleDoc?.txtExtractFile) {
      setIsNew(false);
      fetch(articleDoc.txtExtractFile)
        .then((res) => res.text())
        .then((text) => {
          setContent(text);
          setCurrentContent(text);
          setHasChanges(false);
        })
        .catch((err) => {
          console.error("Failed to fetch article content:", err);
          setContent(CAML_TEMPLATE);
          setCurrentContent(CAML_TEMPLATE);
        });
    } else if (data && !articleDoc) {
      // No existing article — start fresh
      setIsNew(true);
      setContent(CAML_TEMPLATE);
      setCurrentContent(CAML_TEMPLATE);
      setHasChanges(false);
    }
  }, [articleDoc, data, isOpen]);

  // Track changes
  useEffect(() => {
    setHasChanges(content !== currentContent);
  }, [content, currentContent]);

  // Parse content for preview
  const parsedDocument = useMemo(() => {
    try {
      return parseCaml(content);
    } catch {
      return null;
    }
  }, [content]);

  const handleSave = useCallback(async () => {
    if (!hasChanges && !isNew) return;

    try {
      // Encode content as base64 for the upload mutation
      const bytes = new TextEncoder().encode(content);
      const base64Content = btoa(
        Array.from(bytes, (b) => String.fromCharCode(b)).join("")
      );

      const result = await uploadDocument({
        variables: {
          base64FileString: base64Content,
          filename: CAML_ARTICLE_FILENAME,
          title: CAML_ARTICLE_FILENAME,
          description: "Corpus article (CAML format)",
          customMeta: {},
          makePublic: false,
          addToCorpusId: corpusId,
        },
      });

      if (result.data?.uploadDocument.ok) {
        toast.success(isNew ? "Article created!" : "Article updated!", {
          icon: <Check size={20} />,
        });
        setCurrentContent(content);
        setHasChanges(false);
        setIsNew(false);
        await refetch();
        onUpdate?.();
      } else {
        toast.error(
          result.data?.uploadDocument.message || "Failed to save article"
        );
      }
    } catch (error) {
      console.error("Error saving article:", error);
      toast.error("Failed to save article");
    }
  }, [content, hasChanges, isNew, corpusId, uploadDocument, refetch, onUpdate]);

  const handleClose = () => {
    if (hasChanges) {
      if (
        window.confirm(
          "You have unsaved changes. Are you sure you want to close?"
        )
      ) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <StyledModalWrapper>
      <Modal size="full" open={isOpen} onClose={handleClose}>
        <ModalHeader>
          <h2>
            <BookOpen size={18} />
            {isNew ? "Create Article" : "Edit Article"}
            {hasChanges && <UnsavedBadge>Unsaved changes</UnsavedBadge>}
          </h2>
        </ModalHeader>

        <ContentWrapper>
          <EditorPane>
            <PaneHeader>
              <Edit size={12} />
              CAML Source
            </PaneHeader>
            <EditorTextarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your CAML article here..."
              spellCheck={false}
            />
          </EditorPane>

          <PreviewPane>
            <PaneHeader>
              <Eye size={12} />
              Preview
            </PaneHeader>
            {parsedDocument && <CamlArticle document={parsedDocument} />}
          </PreviewPane>
        </ContentWrapper>

        <ActionBar>
          <ActionButton onClick={handleClose}>Close</ActionButton>
          <ActionButton
            $primary
            onClick={handleSave}
            disabled={(!hasChanges && !isNew) || saving}
          >
            <Save size={14} />
            {saving ? "Saving..." : isNew ? "Create Article" : "Save Changes"}
          </ActionButton>
        </ActionBar>
      </Modal>
    </StyledModalWrapper>
  );
};
