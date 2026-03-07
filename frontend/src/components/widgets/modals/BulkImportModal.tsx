/**
 * BulkImportModal - Modal for importing a ZIP file with folder structure preserved.
 *
 * This modal provides:
 * 1. A confirmation step warning users about the import
 * 2. A file selection step with drag-and-drop
 * 3. Upload progress display
 *
 * The import uses the ImportZipToCorpus mutation which:
 * - Preserves folder structure from the ZIP
 * - Creates document relationships if a relationships.csv file is present
 * - Validates ZIP security (path traversal, zip bombs, etc.)
 */
import React, { useState, useRef, useCallback } from "react";
import { useMutation, useReactiveVar } from "@apollo/client";
import { toast } from "react-toastify";
import {
  CheckCircle,
  FileArchive,
  CloudUpload,
  AlertTriangle,
  Info,
  AlertCircle,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  ArrowLeft,
  Loader,
} from "lucide-react";

import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";
import {
  showBulkImportModal,
  selectedFolderId as selectedFolderIdVar,
} from "../../../graphql/cache";
import { folderCorpusIdAtom } from "../../../atoms/folderAtoms";
import { useAtomValue } from "jotai";
import {
  IMPORT_ZIP_TO_CORPUS,
  ImportZipToCorpusInputs,
  ImportZipToCorpusOutputs,
} from "../../../graphql/mutations";
import {
  StyledUploadModal,
  ModalHeader,
  ModalHeaderContent,
  DropZone,
  DropZoneIcon,
  DropZoneText,
  DropZoneButton,
  UploadProgress,
  ActionButton,
  ErrorMessage,
  StepIndicator,
  Step,
  StepConnector,
} from "./UploadModalStyles";

type UploadStep = "confirm" | "upload" | "progress";

export const BulkImportModal: React.FC = () => {
  const visible = useReactiveVar(showBulkImportModal);
  const corpusId = useAtomValue(folderCorpusIdAtom);
  const targetFolderId = useReactiveVar(selectedFolderIdVar);

  const [step, setStep] = useState<UploadStep>("confirm");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [base64File, setBase64File] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importZipMutation] = useMutation<
    ImportZipToCorpusOutputs,
    ImportZipToCorpusInputs
  >(IMPORT_ZIP_TO_CORPUS, {
    // Evict documents and folders from cache to force refetch after import
    update(cache) {
      cache.evict({ fieldName: "documents" });
      cache.evict({ fieldName: "corpusFolders" });
      cache.gc();
    },
  });

  /**
   * Resets all modal state and closes the modal.
   */
  const handleClose = useCallback(() => {
    setStep("confirm");
    setSelectedFile(null);
    setBase64File(null);
    setLoading(false);
    setError(null);
    setUploadProgress(0);
    setIsDragActive(false);
    showBulkImportModal(false);
  }, []);

  /**
   * Handles file selection and converts to base64.
   */
  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError("Please select a ZIP file.");
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      // Remove the data URL prefix (e.g., "data:application/zip;base64,")
      const base64Data = base64.split(",")[1];
      setBase64File(base64Data);
    };
    reader.onerror = () => {
      setError("Failed to read the file. Please try again.");
    };
    reader.readAsDataURL(file);
  }, []);

  /**
   * Handle file input change event.
   */
  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  /**
   * Handle drag events.
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  /**
   * Trigger file input click.
   */
  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Handle the import submission.
   */
  const handleImport = useCallback(async () => {
    if (!base64File || !corpusId) {
      setError("Missing required data for import.");
      return;
    }

    setLoading(true);
    setStep("progress");
    setUploadProgress(10);

    try {
      // Simulate progress during upload
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      const result = await importZipMutation({
        variables: {
          base64FileString: base64File,
          corpusId,
          targetFolderId: targetFolderId || undefined,
          makePublic: false,
        },
      });

      clearInterval(progressInterval);

      if (result.data?.importZipToCorpus?.ok) {
        setUploadProgress(100);
        toast.success(
          `Import started! Job ID: ${
            result.data.importZipToCorpus.jobId || "N/A"
          }`
        );
        // Close modal after a brief delay to show completion
        setTimeout(() => {
          handleClose();
        }, 1500);
      } else {
        setError(
          result.data?.importZipToCorpus?.message ||
            "Import failed. Please try again."
        );
        setStep("upload");
        setUploadProgress(0);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during import.");
      setStep("upload");
      setUploadProgress(0);
    } finally {
      setLoading(false);
    }
  }, [base64File, corpusId, targetFolderId, importZipMutation, handleClose]);

  /**
   * Proceed to upload step after confirmation.
   */
  const handleConfirm = useCallback(() => {
    setStep("upload");
  }, []);

  /**
   * Go back to confirmation step.
   */
  const handleBack = useCallback(() => {
    setStep("confirm");
    setSelectedFile(null);
    setBase64File(null);
    setError(null);
  }, []);

  /**
   * Render the step indicator.
   */
  const renderStepIndicator = () => (
    <StepIndicator>
      <Step $active={step === "confirm"} $completed={step !== "confirm"}>
        <CheckCircle size={16} />
        Confirm
      </Step>
      <StepConnector $completed={step !== "confirm"} />
      <Step $active={step === "upload"} $completed={step === "progress"}>
        <FileArchive size={16} />
        Select File
      </Step>
      <StepConnector $completed={step === "progress"} />
      <Step $active={step === "progress"}>
        <CloudUpload size={16} />
        Import
      </Step>
    </StepIndicator>
  );

  /**
   * Render the confirmation step content.
   */
  const renderConfirmStep = () => (
    <div>
      <div
        style={{
          background: OS_LEGAL_COLORS.warningSurface,
          color: OS_LEGAL_COLORS.warningText,
          border: `1px solid ${OS_LEGAL_COLORS.warningBorder}`,
          borderRadius: "4px",
          padding: "1rem",
          marginBottom: "1rem",
          display: "flex",
          gap: "0.75rem",
        }}
      >
        <AlertTriangle
          size={20}
          style={{ flexShrink: 0, marginTop: "0.125rem" }}
        />
        <div>
          <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
            Important: Bulk Import Cannot Be Easily Undone
          </div>
          <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
            This will import all documents from the ZIP file into the current
            corpus, preserving the folder structure. Consider the following:
          </p>
          <ul style={{ marginTop: "0.5rem", marginBottom: 0 }}>
            <li>
              Documents will be created with the folder structure from the ZIP
            </li>
            <li>
              If a <strong>relationships.csv</strong> file is included, document
              relationships will be automatically created
            </li>
            <li>
              Duplicate file paths will create new versions of existing
              documents
            </li>
            <li>
              Removing imported documents requires deleting them individually or
              in batches
            </li>
          </ul>
        </div>
      </div>

      <div
        style={{
          background: OS_LEGAL_COLORS.infoSurface,
          color: OS_LEGAL_COLORS.infoText,
          border: `1px solid ${OS_LEGAL_COLORS.infoBorder}`,
          borderRadius: "4px",
          padding: "1rem",
          display: "flex",
          gap: "0.75rem",
        }}
      >
        <Info size={20} style={{ flexShrink: 0, marginTop: "0.125rem" }} />
        <div>
          <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
            Supported Format
          </div>
          <p style={{ marginTop: "0.5rem", marginBottom: 0 }}>
            Upload a ZIP file containing PDF, DOCX, PPTX, XLSX, or TXT files.
            The folder structure within the ZIP will be preserved in the corpus.
          </p>
        </div>
      </div>
    </div>
  );

  /**
   * Render the upload step content.
   */
  const renderUploadStep = () => (
    <div>
      {error && (
        <ErrorMessage>
          <div className="icon">
            <AlertCircle size={24} />
          </div>
          <div className="content">
            <div className="header">Error</div>
            <div className="message">{error}</div>
          </div>
        </ErrorMessage>
      )}

      <DropZone
        $isDragActive={isDragActive}
        $hasFiles={!!selectedFile}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={selectedFile ? undefined : handleBrowseClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          style={{ display: "none" }}
          onChange={handleFileInputChange}
        />

        {selectedFile ? (
          <>
            <DropZoneIcon>
              <FileArchive size={48} />
            </DropZoneIcon>
            <DropZoneText>
              <div className="primary-text">{selectedFile.name}</div>
              <div className="secondary-text">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </div>
            </DropZoneText>
            <DropZoneButton onClick={handleBrowseClick}>
              <RefreshCw size={14} style={{ marginRight: "0.25rem" }} /> Choose
              Different File
            </DropZoneButton>
          </>
        ) : (
          <>
            <DropZoneIcon>
              <CloudUpload size={48} />
            </DropZoneIcon>
            <DropZoneText>
              <div className="primary-text">
                {isDragActive
                  ? "Drop your ZIP file here"
                  : "Drag & drop a ZIP file here"}
              </div>
              <div className="secondary-text">or click to browse</div>
            </DropZoneText>
            <DropZoneButton onClick={handleBrowseClick}>
              <FolderOpen size={14} style={{ marginRight: "0.25rem" }} /> Browse
              Files
            </DropZoneButton>
          </>
        )}
      </DropZone>
    </div>
  );

  /**
   * Render the progress step content.
   */
  const renderProgressStep = () => (
    <div style={{ textAlign: "center", padding: "2rem" }}>
      <Loader
        size={48}
        style={{
          marginBottom: "1rem",
          animation: "spin 1s linear infinite",
        }}
      />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <h3>Importing Documents...</h3>
      <p
        style={{ color: OS_LEGAL_COLORS.textSecondary, marginBottom: "1.5rem" }}
      >
        This may take a few moments depending on the size of your ZIP file.
      </p>
      <UploadProgress $percent={uploadProgress} />
    </div>
  );

  /**
   * Render the modal actions based on current step.
   */
  const renderActions = () => {
    switch (step) {
      case "confirm":
        return (
          <>
            <ActionButton $variant="secondary" onClick={handleClose}>
              Cancel
            </ActionButton>
            <ActionButton $variant="primary" onClick={handleConfirm}>
              <ArrowRight size={14} style={{ marginRight: "0.25rem" }} />{" "}
              Continue
            </ActionButton>
          </>
        );
      case "upload":
        return (
          <>
            <ActionButton $variant="secondary" onClick={handleBack}>
              <ArrowLeft size={14} style={{ marginRight: "0.25rem" }} /> Back
            </ActionButton>
            <ActionButton
              $variant="primary"
              onClick={handleImport}
              disabled={!selectedFile || !base64File || loading}
            >
              <CloudUpload size={14} style={{ marginRight: "0.25rem" }} /> Start
              Import
            </ActionButton>
          </>
        );
      case "progress":
        return null; // No actions during progress
      default:
        return null;
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <StyledUploadModal open={visible} onClose={handleClose} size="sm">
      <div className="header">
        <ModalHeader>
          <FileArchive size={24} />
          <ModalHeaderContent>
            <div className="title">Bulk Import Documents</div>
            <div className="subtitle">
              Import a ZIP file with folder structure
            </div>
          </ModalHeaderContent>
        </ModalHeader>
      </div>

      <div className="content">
        {renderStepIndicator()}
        {step === "confirm" && renderConfirmStep()}
        {step === "upload" && renderUploadStep()}
        {step === "progress" && renderProgressStep()}
      </div>

      {step !== "progress" && <div className="actions">{renderActions()}</div>}
    </StyledUploadModal>
  );
};
