import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
} from "@os-legal/ui";
import {
  Upload,
  FileArchive,
  ArrowLeft,
  ArrowRight,
  X,
  Check,
} from "lucide-react";
import {
  StyledModalWrapper,
  HeaderIcon,
  FormSection,
  SectionTitle,
  EditSection,
  EditPanel,
  EditPanelHeader,
  ErrorMessage,
} from "./UploadModalStyles";
import {
  FileDropZone,
  FileList,
  FileDetailsForm,
  CorpusSelectorCard,
  StepIndicator,
  UploadProgress,
  UploadMode,
  UploadStep,
} from "./components";
import {
  useUploadState,
  useUploadMutations,
  useCorpusSearch,
  FileDetails,
} from "./hooks";
import { CorpusType } from "../../../../types/graphql-api";

export interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selected corpus ID - skips corpus selection step */
  corpusId?: string | null;
  /** Pre-selected folder ID */
  folderId?: string | null;
  /** Force a specific mode instead of auto-detecting */
  forceMode?: UploadMode;
  /** Files to preload into the modal */
  preloadedFiles?: File[];
  /** Callback when upload completes */
  onUploadComplete?: () => void;
  /** Refetch callback after successful upload */
  refetch?: () => void;
}

/**
 * Unified Upload Modal component supporting both single PDF and bulk ZIP upload.
 *
 * Features:
 * - Auto-detects mode based on file type (ZIP → bulk, PDF → single)
 * - Multi-step wizard for single mode (Select → Details → Corpus)
 * - Simplified single-step flow for bulk mode
 * - Uses @os-legal/ui design system
 */
export const UploadModal: React.FC<UploadModalProps> = ({
  open,
  onClose,
  corpusId,
  folderId,
  forceMode,
  preloadedFiles,
  onUploadComplete,
  refetch,
}) => {
  // Mode state - auto-detected or forced
  const [mode, setMode] = useState<UploadMode>(forceMode || "single");

  // Step state for single mode
  const [step, setStep] = useState<UploadStep>("select");

  // For bulk mode - the selected ZIP file
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipUploadProgress, setZipUploadProgress] = useState<number>(0);

  // Selected corpus for upload (when not pre-provided)
  const [selectedCorpus, setSelectedCorpus] = useState<CorpusType | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Track if modal just opened to handle initialization
  const prevOpenRef = useRef(false);

  // File upload state for single mode
  const uploadState = useUploadState();

  // Corpus search hook - needed for both single mode (corpus step) and bulk mode (inline selector)
  const corpusSearch = useCorpusSearch({
    skip: !open || !!corpusId,
    requireUpdatePermission: true,
  });

  // Upload mutations
  const uploadMutations = useUploadMutations({
    corpusId: corpusId || selectedCorpus?.id || undefined,
    folderId: folderId || undefined,
    onFileStatusChange: uploadState.setFileStatus,
    onComplete: () => {
      onUploadComplete?.();
      refetch?.();
      onClose();
    },
  });

  // Handle modal open/close
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (justOpened) {
      // Reset state when modal opens
      setStep("select");
      setError(null);
      setZipFile(null);
      setZipUploadProgress(0);
      setSelectedCorpus(null);
      uploadState.reset();

      // Load preloaded files if provided
      if (preloadedFiles && preloadedFiles.length > 0) {
        uploadState.addFiles(preloadedFiles);
      }

      // Set mode based on force or default
      setMode(forceMode || "single");
    }

    if (!open) {
      // Clean up on close
      setError(null);
    }
  }, [open, forceMode, preloadedFiles]);

  // Handle file selection
  const handleFilesSelected = useCallback(
    (files: File[]) => {
      setError(null);

      if (mode === "bulk") {
        // Bulk mode - only accept ZIP
        const zipFiles = files.filter(
          (f) => f.type === "application/zip" || f.name.endsWith(".zip")
        );
        if (zipFiles.length > 0) {
          setZipFile(zipFiles[0]);
        } else {
          setError("Please select a .zip file");
        }
      } else {
        // Single mode - accept PDFs
        const pdfFiles = files.filter(
          (f) => f.type === "application/pdf" || f.name.endsWith(".pdf")
        );
        if (pdfFiles.length > 0) {
          uploadState.addFiles(pdfFiles);
        } else {
          setError("Please select PDF files");
        }
      }
    },
    [mode, uploadState]
  );

  // Handle file rejections from dropzone
  const handleFileRejected = useCallback(() => {
    if (mode === "bulk") {
      setError("Invalid file type. Please select a .zip file.");
    } else {
      setError("Invalid file type. Please select PDF files.");
    }
  }, [mode]);

  // Form validation for single mode
  const isFormValid = useCallback(() => {
    if (!uploadState.hasFiles) return false;

    // Check all files have required fields (with null guards)
    return uploadState.files.every(
      (pkg) =>
        pkg.formData &&
        pkg.formData.title?.trim().length > 0 &&
        pkg.formData.description?.trim().length > 0
    );
  }, [uploadState.files, uploadState.hasFiles]);

  // Handle step navigation
  const handleContinue = useCallback(() => {
    if (step === "select" && uploadState.hasFiles) {
      setStep("details");
      // Select first file for editing
      if (uploadState.selectedIndex < 0) {
        uploadState.setSelectedIndex(0);
      }
    } else if (step === "details") {
      if (corpusId) {
        // Skip corpus step if already provided
        setStep("uploading");
        uploadMutations.uploadFiles(uploadState.files);
      } else {
        setStep("corpus");
      }
    } else if (step === "corpus") {
      setStep("uploading");
      uploadMutations.uploadFiles(uploadState.files, selectedCorpus?.id);
    }
  }, [step, uploadState, corpusId, selectedCorpus, uploadMutations]);

  const handleBack = useCallback(() => {
    if (step === "details") {
      setStep("select");
    } else if (step === "corpus") {
      setStep("details");
    }
  }, [step]);

  // Handle form field changes
  const handleFormChange = useCallback(
    (updates: Partial<FileDetails>) => {
      if (uploadState.selectedIndex >= 0) {
        uploadState.updateFileDetails(uploadState.selectedIndex, updates);
      }
    },
    [uploadState]
  );

  // Handle bulk upload
  const handleBulkUpload = useCallback(async () => {
    if (!zipFile) return;

    setError(null);
    setZipUploadProgress(50);

    const success = await uploadMutations.uploadZipFile(
      zipFile,
      selectedCorpus?.id
    );

    if (success) {
      setZipUploadProgress(100);
      refetch?.();
      onUploadComplete?.();
      onClose();
    } else {
      setZipUploadProgress(0);
    }
  }, [
    zipFile,
    selectedCorpus,
    uploadMutations,
    refetch,
    onUploadComplete,
    onClose,
  ]);

  // Handle skip corpus
  const handleSkipCorpus = useCallback(() => {
    setStep("uploading");
    uploadMutations.uploadFiles(uploadState.files, null);
  }, [uploadState.files, uploadMutations]);

  // Get header content
  const getHeaderTitle = () => {
    if (mode === "bulk") {
      return (
        <>
          <HeaderIcon>
            <FileArchive />
          </HeaderIcon>
          Bulk Upload Documents
        </>
      );
    }
    return (
      <>
        <HeaderIcon>
          <Upload />
        </HeaderIcon>
        Upload Documents
      </>
    );
  };

  const getSubtitle = () => {
    if (mode === "bulk") {
      return "Upload multiple PDFs from a ZIP file";
    }
    switch (step) {
      case "select":
        return "Select PDF files to upload";
      case "details":
        return "Review and edit document details";
      case "corpus":
        return "Optionally add to a corpus";
      case "uploading":
        return "Processing your uploads...";
      default:
        return "";
    }
  };

  // Get current file's form data
  const currentFormData =
    uploadState.selectedIndex >= 0
      ? uploadState.files[uploadState.selectedIndex]?.formData || null
      : null;

  const isUploading = step === "uploading" || uploadMutations.isUploading;

  return (
    <StyledModalWrapper>
      <Modal
        open={open}
        onClose={onClose}
        size="lg"
        closeOnEscape={!isUploading}
      >
        <ModalHeader
          title={getHeaderTitle()}
          subtitle={getSubtitle()}
          onClose={onClose}
          showCloseButton={!isUploading}
        />

        <ModalBody>
          {/* Error message */}
          {error && (
            <ErrorMessage>
              <X />
              <div className="content">
                <div className="header">Error</div>
                <div className="message">{error}</div>
              </div>
            </ErrorMessage>
          )}

          {/* Bulk mode content */}
          {mode === "bulk" && (
            <>
              <FileDropZone
                mode="bulk"
                selectedFile={zipFile}
                disabled={isUploading}
                onFilesSelected={handleFilesSelected}
                onFileRejected={handleFileRejected}
              />

              {/* Corpus selector for bulk mode */}
              <FormSection style={{ marginTop: "var(--oc-spacing-md)" }}>
                <SectionTitle>Add to Corpus (Optional)</SectionTitle>
                <Input
                  id="bulk-corpus-search"
                  placeholder="Search corpuses..."
                  value={corpusSearch.searchTerm}
                  onChange={(e) => corpusSearch.setSearchTerm(e.target.value)}
                  disabled={isUploading}
                  size="lg"
                  fullWidth
                />
                {corpusSearch.corpuses.length > 0 && (
                  <div style={{ marginTop: "var(--oc-spacing-sm)" }}>
                    {corpusSearch.corpuses.slice(0, 5).map((corpus) => (
                      <div
                        key={corpus.id}
                        onClick={() =>
                          setSelectedCorpus(
                            selectedCorpus?.id === corpus.id ? null : corpus
                          )
                        }
                        style={{
                          padding: "var(--oc-spacing-sm)",
                          cursor: "pointer",
                          borderRadius: "var(--oc-radius-md)",
                          background:
                            selectedCorpus?.id === corpus.id
                              ? "rgba(15, 118, 110, 0.1)"
                              : "transparent",
                          border:
                            selectedCorpus?.id === corpus.id
                              ? "1px solid var(--oc-accent)"
                              : "1px solid transparent",
                          marginBottom: "var(--oc-spacing-xs)",
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{corpus.title}</div>
                      </div>
                    ))}
                  </div>
                )}
              </FormSection>

              {/* Progress for bulk mode */}
              {zipUploadProgress > 0 && (
                <div style={{ marginTop: "var(--oc-spacing-md)" }}>
                  <UploadProgress
                    files={[
                      {
                        file: zipFile!,
                        formData: { title: "", slug: "", description: "" },
                        status:
                          zipUploadProgress === 100 ? "success" : "uploading",
                      },
                    ]}
                  />
                </div>
              )}
            </>
          )}

          {/* Single mode content */}
          {mode === "single" && (
            <>
              {/* Step indicator */}
              <StepIndicator currentStep={step} showCorpusStep={!corpusId} />

              {/* Uploading progress */}
              {step === "uploading" && (
                <>
                  <UploadProgress files={uploadState.files} />
                  <FileList
                    files={uploadState.files}
                    selectedIndex={uploadState.selectedIndex}
                    onSelect={uploadState.toggleSelectedFile}
                    onRemove={() => {}}
                    disabled={true}
                  />
                </>
              )}

              {/* Select step */}
              {step === "select" && (
                <>
                  {!uploadState.hasFiles ? (
                    <FileDropZone
                      mode="single"
                      hasFiles={uploadState.hasFiles}
                      onFilesSelected={handleFilesSelected}
                      onFileRejected={handleFileRejected}
                    />
                  ) : (
                    <FileList
                      files={uploadState.files}
                      selectedIndex={uploadState.selectedIndex}
                      onSelect={uploadState.toggleSelectedFile}
                      onRemove={uploadState.removeFile}
                    />
                  )}
                </>
              )}

              {/* Details step */}
              {step === "details" && (
                <EditSection>
                  <EditPanel>
                    <EditPanelHeader>Selected Files</EditPanelHeader>
                    <FileList
                      files={uploadState.files}
                      selectedIndex={uploadState.selectedIndex}
                      onSelect={uploadState.toggleSelectedFile}
                      onRemove={uploadState.removeFile}
                    />
                  </EditPanel>
                  <EditPanel>
                    <EditPanelHeader>Document Details</EditPanelHeader>
                    <FileDetailsForm
                      formData={currentFormData}
                      onChange={handleFormChange}
                    />
                  </EditPanel>
                </EditSection>
              )}

              {/* Corpus step */}
              {step === "corpus" && !corpusId && (
                <CorpusSelectorCard
                  corpuses={corpusSearch.corpuses}
                  selectedCorpus={selectedCorpus}
                  onSelect={setSelectedCorpus}
                  onSearchChange={corpusSearch.debouncedSetSearchTerm}
                  searchTerm={corpusSearch.searchTerm}
                  loading={corpusSearch.loading}
                />
              )}
            </>
          )}
        </ModalBody>

        <ModalFooter>
          {/* Bulk mode actions */}
          {mode === "bulk" && (
            <>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleBulkUpload}
                disabled={!zipFile || isUploading}
                loading={isUploading}
              >
                {isUploading ? (
                  "Uploading..."
                ) : (
                  <>
                    <Upload style={{ width: 16, height: 16, marginRight: 8 }} />
                    Upload ZIP
                  </>
                )}
              </Button>
            </>
          )}

          {/* Single mode actions */}
          {mode === "single" && (
            <>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isUploading}
              >
                <X style={{ width: 16, height: 16, marginRight: 8 }} />
                {isUploading ? "Close" : "Cancel"}
              </Button>

              {step === "select" && uploadState.hasFiles && (
                <Button variant="primary" onClick={handleContinue}>
                  Continue
                  <ArrowRight
                    style={{ width: 16, height: 16, marginLeft: 8 }}
                  />
                </Button>
              )}

              {step === "details" && (
                <>
                  <Button variant="secondary" onClick={handleBack}>
                    <ArrowLeft
                      style={{ width: 16, height: 16, marginRight: 8 }}
                    />
                    Back
                  </Button>
                  {corpusId ? (
                    <Button
                      variant="primary"
                      onClick={handleContinue}
                      disabled={!isFormValid()}
                    >
                      <Upload
                        style={{ width: 16, height: 16, marginRight: 8 }}
                      />
                      Upload
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        onClick={handleSkipCorpus}
                        disabled={!isFormValid()}
                      >
                        Skip Corpus
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleContinue}
                        disabled={!isFormValid()}
                      >
                        Continue
                        <ArrowRight
                          style={{ width: 16, height: 16, marginLeft: 8 }}
                        />
                      </Button>
                    </>
                  )}
                </>
              )}

              {step === "corpus" && !corpusId && (
                <>
                  <Button variant="secondary" onClick={handleBack}>
                    <ArrowLeft
                      style={{ width: 16, height: 16, marginRight: 8 }}
                    />
                    Back
                  </Button>
                  <Button variant="secondary" onClick={handleSkipCorpus}>
                    Skip
                  </Button>
                  <Button variant="primary" onClick={handleContinue}>
                    <Upload style={{ width: 16, height: 16, marginRight: 8 }} />
                    Upload
                  </Button>
                </>
              )}
            </>
          )}
        </ModalFooter>
      </Modal>
    </StyledModalWrapper>
  );
};

export default UploadModal;
