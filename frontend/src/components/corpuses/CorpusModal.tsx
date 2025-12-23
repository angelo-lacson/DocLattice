import React, { useState, useEffect, useCallback, useRef } from "react";
import { Modal, Button, Icon } from "semantic-ui-react";
import styled from "styled-components";
import { LabelSetSelector } from "../widgets/CRUD/LabelSetSelector";
import { EmbedderSelector } from "../widgets/CRUD/EmbedderSelector";
import { FilePreviewAndUpload } from "../widgets/file-controls/FilePreviewAndUpload";
import { CorpusType, LabelSetType } from "../../types/graphql-api";

// Types
export type CorpusModalMode = "CREATE" | "EDIT" | "VIEW";

export interface CorpusFormData {
  id?: string;
  title?: string;
  slug?: string;
  description?: string;
  icon?: string | null;
  labelSet?: string | null;
  preferredEmbedder?: string | null;
}

export interface CorpusModalProps {
  open: boolean;
  mode: CorpusModalMode;
  corpus?: CorpusType | null;
  loading?: boolean;
  onSubmit?: (data: CorpusFormData) => void;
  onClose: () => void;
}

// Styled Components
const StyledModal = styled(Modal)`
  &&& {
    border-radius: 16px;
    overflow: hidden;
    max-width: 600px;
    margin: 1rem auto;

    @media (max-width: 768px) {
      margin: 0;
      border-radius: 0;
      max-height: 100vh;
      height: 100%;
      max-width: 100%;
    }
  }
`;

const ModalHeader = styled.div`
  background: #ffffff;
  padding: 1.5rem 2rem;
  color: #1a1a1a;
  border-bottom: 1px solid #e5e5e5;

  @media (max-width: 768px) {
    padding: 1rem 1.25rem;
    position: sticky;
    top: 0;
    z-index: 10;
  }
`;

const HeaderTitle = styled.h2`
  margin: 0 0 0.25rem 0;
  font-size: 1.5rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  @media (max-width: 768px) {
    font-size: 1.25rem;
  }
`;

const HeaderSubtitle = styled.p`
  margin: 0;
  color: #666666;
  font-size: 0.9rem;

  @media (max-width: 768px) {
    font-size: 0.85rem;
  }
`;

const ModalBody = styled.div`
  padding: 2rem;
  background: #fafafa;
  max-height: calc(100vh - 200px);
  overflow-y: auto;

  @media (max-width: 768px) {
    padding: 1.25rem;
    /* Add extra bottom padding so content (including dropdowns) can scroll above sticky footer */
    padding-bottom: 200px;
    max-height: calc(100vh - 80px);
    /* Smooth scrolling on iOS */
    -webkit-overflow-scrolling: touch;
  }

  /* Ensure Semantic UI dropdowns appear above the sticky footer (z-index: 10) */
  /* z-index scale: header/footer=10, dropdowns=20 */
  .ui.dropdown .menu {
    z-index: 20;
  }
`;

const FormSection = styled.div`
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border: 1px solid #e5e5e5;

  @media (max-width: 768px) {
    padding: 1rem;
    margin-bottom: 1rem;
    border-radius: 10px;
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 600;
  color: #888888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 1rem 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  @media (max-width: 768px) {
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
  }
`;

const FormField = styled.div`
  margin-bottom: 1.25rem;

  &:last-child {
    margin-bottom: 0;
  }

  @media (max-width: 768px) {
    margin-bottom: 1rem;
  }
`;

const Label = styled.label`
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 0.5rem;

  @media (max-width: 768px) {
    font-size: 0.875rem;
  }
`;

const HelpText = styled.span`
  display: block;
  font-size: 0.8rem;
  color: #888888;
  margin-top: 0.25rem;

  @media (max-width: 768px) {
    font-size: 0.75rem;
  }
`;

const TextInput = styled.input<{ $readOnly?: boolean }>`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 2px solid #e5e5e5;
  border-radius: 10px;
  font-size: 1rem;
  color: #1a1a1a;
  background: ${(props) => (props.$readOnly ? "#fafafa" : "white")};
  transition: all 0.2s ease;
  outline: none;

  &:focus {
    border-color: #1a1a1a;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08);
  }

  &:disabled {
    background: #f5f5f5;
    color: #999999;
    cursor: not-allowed;
  }

  &::placeholder {
    color: #999999;
  }

  @media (max-width: 768px) {
    padding: 1rem;
    /* Prevent iOS zoom on focus */
    font-size: 16px;
    border-radius: 8px;
    /* Larger touch target */
    min-height: 48px;
  }
`;

const TextArea = styled.textarea<{ $readOnly?: boolean }>`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 2px solid #e5e5e5;
  border-radius: 10px;
  font-size: 1rem;
  color: #1a1a1a;
  background: ${(props) => (props.$readOnly ? "#fafafa" : "white")};
  transition: all 0.2s ease;
  outline: none;
  resize: vertical;
  min-height: 100px;
  font-family: inherit;
  line-height: 1.5;

  &:focus {
    border-color: #1a1a1a;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08);
  }

  &:disabled {
    background: #f5f5f5;
    color: #999999;
    cursor: not-allowed;
  }

  &::placeholder {
    color: #999999;
  }

  @media (max-width: 768px) {
    padding: 1rem;
    /* Prevent iOS zoom on focus */
    font-size: 16px;
    border-radius: 8px;
    min-height: 120px;
  }
`;

const ModalFooter = styled.div`
  padding: 1.25rem 2rem;
  background: white;
  border-top: 1px solid #e5e5e5;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;

  @media (max-width: 768px) {
    padding: 1rem 1.25rem;
    flex-direction: column-reverse;
    gap: 0.5rem;
    position: sticky;
    bottom: 0;
    z-index: 10;

    button {
      width: 100%;
      margin: 0 !important;
      justify-content: center;
      min-height: 48px;
    }
  }
`;

const CancelButton = styled(Button)`
  &&& {
    background: #f5f5f5;
    color: #666666;
    border: none;
    padding: 0.875rem 1.5rem;
    font-weight: 600;
    border-radius: 10px;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      background: #e5e5e5;
      color: #1a1a1a;
    }

    &:disabled {
      opacity: 0.6;
    }
  }
`;

const SubmitButton = styled(Button)`
  &&& {
    background: #1a1a1a;
    color: white;
    border: none;
    padding: 0.875rem 1.5rem;
    font-weight: 600;
    border-radius: 10px;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

    &:hover:not(:disabled) {
      background: #333333;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    &:active:not(:disabled) {
      background: #000000;
    }

    &:disabled {
      background: #cccccc;
      box-shadow: none;
    }
  }
`;

const IconUploadWrapper = styled.div`
  max-width: 280px;
  margin: 0 auto;

  @media (max-width: 768px) {
    max-width: 150px;
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: #f5f5f5;
  border: none;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #666666;

  &:hover {
    background: #e5e5e5;
    color: #1a1a1a;
  }

  @media (max-width: 768px) {
    width: 40px;
    height: 40px;
  }
`;

/**
 * CorpusModal - A modern, mobile-friendly modal for creating and editing corpuses.
 *
 * Features:
 * - Clean, responsive design that works well on mobile
 * - Simple controlled inputs (no complex form libraries)
 * - Supports Create, Edit, and View modes
 * - Integrates with LabelSetSelector, EmbedderSelector, and icon upload
 */
export const CorpusModal: React.FC<CorpusModalProps> = ({
  open,
  mode,
  corpus,
  loading = false,
  onSubmit,
  onClose,
}) => {
  const isReadOnly = mode === "VIEW";
  const isCreate = mode === "CREATE";

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [labelSetId, setLabelSetId] = useState<string | null>(null);
  const [labelSetObj, setLabelSetObj] = useState<LabelSetType | undefined>(
    undefined
  );
  const [preferredEmbedder, setPreferredEmbedder] = useState<string | null>(
    null
  );

  // Track original values for change detection in EDIT mode
  const [originalValues, setOriginalValues] = useState<{
    title: string;
    slug: string;
    description: string;
    icon: string | null;
    labelSetId: string | null;
    preferredEmbedder: string | null;
  } | null>(null);

  // Track whether the modal was previously open to detect open transitions
  // This prevents re-initializing form when user is typing on mobile
  const wasOpenRef = useRef(false);

  // Initialize form from corpus data only when modal opens (not on every render)
  useEffect(() => {
    // Only initialize form when modal transitions from closed to open
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;

    if (!justOpened) {
      return;
    }

    if (corpus) {
      const corpusTitle = corpus.title || "";
      const corpusSlug = corpus.slug || "";
      const corpusDescription = corpus.description || "";
      const corpusIcon = corpus.icon || null;
      const corpusLabelSetId = corpus.labelSet?.id || null;
      const corpusPreferredEmbedder = corpus.preferredEmbedder || null;

      setTitle(corpusTitle);
      setSlug(corpusSlug);
      setDescription(corpusDescription);
      setIcon(corpusIcon);
      setLabelSetId(corpusLabelSetId);
      setLabelSetObj(corpus.labelSet || undefined);
      setPreferredEmbedder(corpusPreferredEmbedder);

      // Store original values for change detection
      setOriginalValues({
        title: corpusTitle,
        slug: corpusSlug,
        description: corpusDescription,
        icon: corpusIcon,
        labelSetId: corpusLabelSetId,
        preferredEmbedder: corpusPreferredEmbedder,
      });
    } else {
      // Reset for create mode
      setTitle("");
      setSlug("");
      setDescription("");
      setIcon(null);
      setLabelSetId(null);
      setLabelSetObj(undefined);
      setPreferredEmbedder(null);
      setOriginalValues(null);
    }
  }, [corpus, open]);

  // Handle form field changes
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value);
    },
    []
  );

  const handleSlugChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSlug(e.target.value);
    },
    []
  );

  const handleDescriptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDescription(e.target.value);
    },
    []
  );

  const handleIconChange = useCallback(
    ({ data }: { data: string | ArrayBuffer; filename: string }) => {
      // FilePreviewAndUpload uses readAsDataURL which returns a string (base64)
      // but the type allows ArrayBuffer for flexibility
      if (typeof data === "string") {
        setIcon(data);
      }
    },
    []
  );

  const handleLabelSetChange = useCallback((values: any) => {
    setLabelSetId(values.labelSet || null);
  }, []);

  const handleEmbedderChange = useCallback((values: any) => {
    setPreferredEmbedder(values.preferredEmbedder || null);
  }, []);

  // Form validation - both title and description are required
  const isFormValid = title.trim().length > 0 && description.trim().length > 0;

  // Compute isDirty by comparing current values against original values
  // For CREATE mode, form is "dirty" (has submittable content) when valid
  // For EDIT mode, compare each field against original values
  const isDirty = isCreate
    ? isFormValid
    : originalValues !== null &&
      (title !== originalValues.title ||
        slug !== originalValues.slug ||
        description !== originalValues.description ||
        icon !== originalValues.icon ||
        labelSetId !== originalValues.labelSetId ||
        preferredEmbedder !== originalValues.preferredEmbedder);

  const canSubmit = isFormValid && isDirty && !loading;

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (!canSubmit || !onSubmit) return;

    const formData: CorpusFormData = {};

    if (mode === "EDIT" && corpus && originalValues) {
      // Only include changed fields for edit mode
      formData.id = corpus.id;

      if (title.trim() !== originalValues.title) {
        formData.title = title.trim();
      }
      if (slug.trim() !== originalValues.slug) {
        formData.slug = slug.trim();
      }
      if (description.trim() !== originalValues.description) {
        formData.description = description.trim();
      }
      if (icon !== originalValues.icon) {
        formData.icon = icon;
      }
      if (labelSetId !== originalValues.labelSetId) {
        formData.labelSet = labelSetId;
      }
      if (preferredEmbedder !== originalValues.preferredEmbedder) {
        formData.preferredEmbedder = preferredEmbedder;
      }
    } else {
      // Include all for create mode
      formData.title = title.trim();
      formData.slug = slug.trim() || undefined;
      formData.description = description.trim();
      formData.icon = icon;
      formData.labelSet = labelSetId;
      formData.preferredEmbedder = preferredEmbedder;
    }

    onSubmit(formData);
  }, [
    canSubmit,
    onSubmit,
    mode,
    corpus,
    originalValues,
    title,
    slug,
    description,
    icon,
    labelSetId,
    preferredEmbedder,
  ]);

  // Get header text based on mode
  const getHeaderText = () => {
    switch (mode) {
      case "CREATE":
        return "Create New Corpus";
      case "EDIT":
        return `Edit Corpus`;
      case "VIEW":
        return "View Corpus";
      default:
        return "Corpus";
    }
  };

  const getSubtitle = () => {
    switch (mode) {
      case "CREATE":
        return "Set up a new corpus to organize your documents";
      case "EDIT":
        return title || "Update corpus details";
      case "VIEW":
        return title || "Viewing corpus details";
      default:
        return "";
    }
  };

  return (
    <StyledModal open={open} onClose={onClose} size="small">
      <ModalHeader>
        <HeaderTitle>
          <Icon name={isCreate ? "plus circle" : "edit"} />
          {getHeaderText()}
        </HeaderTitle>
        <HeaderSubtitle>{getSubtitle()}</HeaderSubtitle>
        <CloseButton
          onClick={onClose}
          disabled={loading}
          aria-label="Close modal"
        >
          <Icon name="close" />
        </CloseButton>
      </ModalHeader>

      <ModalBody>
        {/* Basic Info Section */}
        <FormSection>
          <SectionTitle>
            <Icon name="info circle" />
            Basic Information
          </SectionTitle>

          <FormField>
            <Label htmlFor="corpus-title">Title *</Label>
            <TextInput
              id="corpus-title"
              type="text"
              placeholder="Enter corpus title"
              value={title}
              onChange={handleTitleChange}
              disabled={loading || isReadOnly}
              $readOnly={isReadOnly}
              autoComplete="off"
            />
          </FormField>

          <FormField>
            <Label htmlFor="corpus-slug">Slug</Label>
            <TextInput
              id="corpus-slug"
              type="text"
              placeholder="my-corpus-slug (auto-generated if blank)"
              value={slug}
              onChange={handleSlugChange}
              disabled={loading || isReadOnly}
              $readOnly={isReadOnly}
              autoComplete="off"
            />
            <HelpText>
              Case-sensitive. Allowed: A-Z, a-z, 0-9, hyphen (-). Leave blank to
              auto-generate.
            </HelpText>
          </FormField>

          <FormField>
            <Label htmlFor="corpus-description">Description *</Label>
            <TextArea
              id="corpus-description"
              placeholder="Describe what this corpus is about..."
              value={description}
              onChange={handleDescriptionChange}
              disabled={loading || isReadOnly}
              $readOnly={isReadOnly}
            />
          </FormField>
        </FormSection>

        {/* Icon Section */}
        <FormSection>
          <SectionTitle>
            <Icon name="image" />
            Corpus Icon
          </SectionTitle>
          <IconUploadWrapper>
            <FilePreviewAndUpload
              isImage={true}
              acceptedTypes="image/*"
              file={icon || ""}
              readOnly={isReadOnly}
              disabled={loading}
              onChange={handleIconChange}
            />
          </IconUploadWrapper>
        </FormSection>

        {/* Settings Section */}
        <FormSection>
          <SectionTitle>
            <Icon name="cog" />
            Settings
          </SectionTitle>

          <FormField>
            <LabelSetSelector
              read_only={isReadOnly || loading}
              labelSet={labelSetObj}
              onChange={handleLabelSetChange}
            />
          </FormField>

          <FormField>
            <EmbedderSelector
              read_only={isReadOnly || loading}
              preferredEmbedder={preferredEmbedder || undefined}
              onChange={handleEmbedderChange}
            />
          </FormField>
        </FormSection>
      </ModalBody>

      <ModalFooter>
        <CancelButton onClick={onClose} disabled={loading}>
          <Icon name="close" />
          {isReadOnly ? "Close" : "Cancel"}
        </CancelButton>
        {!isReadOnly && onSubmit && (
          <SubmitButton
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={loading}
          >
            <Icon name="check" />
            {isCreate ? "Create Corpus" : "Save Changes"}
          </SubmitButton>
        )}
      </ModalFooter>
    </StyledModal>
  );
};

export default CorpusModal;
