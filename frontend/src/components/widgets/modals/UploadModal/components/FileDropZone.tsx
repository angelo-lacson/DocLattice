import React, { useCallback, useRef } from "react";
import { useDropzone, FileRejection, DropEvent, Accept } from "react-dropzone";
import { Upload, FileArchive, FileText, RefreshCw } from "lucide-react";
import { Button } from "@os-legal/ui";
import { DropZone, DropZoneIcon, DropZoneText } from "../UploadModalStyles";
import { formatFileSize } from "../../../../../utils/files";

export type UploadMode = "single" | "bulk";

interface FileDropZoneProps {
  mode: UploadMode;
  disabled?: boolean;
  /** For bulk mode, the selected ZIP file */
  selectedFile?: File | null;
  /** For single mode, whether files have been added */
  hasFiles?: boolean;
  onFilesSelected: (files: File[]) => void;
  onFileRejected?: (rejections: FileRejection[]) => void;
}

/**
 * FileDropZone component for drag-and-drop file upload.
 * Supports two modes:
 * - single: Accept multiple PDF files
 * - bulk: Accept a single ZIP file
 */
export const FileDropZone: React.FC<FileDropZoneProps> = ({
  mode,
  disabled = false,
  selectedFile,
  hasFiles = false,
  onFilesSelected,
  onFileRejected,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Accept configs must be defined separately to avoid TypeScript union issues
  const ACCEPT_ZIP: Accept = { "application/zip": [".zip"] };
  const ACCEPT_PDF: Accept = { "application/pdf": [".pdf"] };
  const acceptConfig = mode === "bulk" ? ACCEPT_ZIP : ACCEPT_PDF;

  const onDrop = useCallback(
    (acceptedFiles: File[], rejections: FileRejection[], event: DropEvent) => {
      if (acceptedFiles.length > 0) {
        onFilesSelected(acceptedFiles);
      }
      if (rejections.length > 0 && onFileRejected) {
        onFileRejected(rejections);
      }
    },
    [onFilesSelected, onFileRejected]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: acceptConfig,
    multiple: mode === "single",
    disabled: disabled || (mode === "single" && hasFiles),
  });

  const handleBrowseClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!disabled && fileInputRef.current) {
        fileInputRef.current.click();
      }
    },
    [disabled]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      // Reset input to allow selecting the same file again
      if (e.target) {
        e.target.value = "";
      }
    },
    [onFilesSelected]
  );

  // Render for bulk mode with a file selected
  if (mode === "bulk" && selectedFile) {
    return (
      <DropZone
        $hasFiles={true}
        onClick={handleBrowseClick}
        data-testid="file-dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          onChange={handleFileChange}
          disabled={disabled}
          style={{ display: "none" }}
          aria-label="Select ZIP file for bulk upload"
        />
        <DropZoneIcon>
          <FileArchive />
        </DropZoneIcon>
        <DropZoneText>
          <div className="primary-text">{selectedFile.name}</div>
          <div className="secondary-text">
            {formatFileSize(selectedFile.size)}
          </div>
        </DropZoneText>
        <Button
          variant="secondary"
          size="md"
          onClick={handleBrowseClick}
          disabled={disabled}
          style={{ marginTop: "var(--oc-spacing-md)" }}
        >
          <RefreshCw style={{ width: 16, height: 16, marginRight: 8 }} />
          Change File
        </Button>
      </DropZone>
    );
  }

  // Render empty drop zone
  return (
    <DropZone
      {...getRootProps()}
      $isDragActive={isDragActive}
      $hasFiles={false}
      data-testid="file-dropzone"
    >
      <input {...getInputProps()} />
      <input
        ref={fileInputRef}
        type="file"
        accept={
          mode === "bulk" ? ".zip,application/zip" : ".pdf,application/pdf"
        }
        multiple={mode === "single"}
        onChange={handleFileChange}
        disabled={disabled}
        style={{ display: "none" }}
        aria-label={mode === "bulk" ? "Select ZIP file" : "Select PDF files"}
      />
      <DropZoneIcon>
        {mode === "bulk" ? <FileArchive /> : <Upload />}
      </DropZoneIcon>
      <DropZoneText>
        <div className="primary-text">
          {isDragActive
            ? mode === "bulk"
              ? "Drop your ZIP file here..."
              : "Drop your PDFs here..."
            : mode === "bulk"
            ? "Click to select a ZIP file"
            : "Drag & drop PDF files here"}
        </div>
        <div className="secondary-text">
          {mode === "bulk"
            ? "The ZIP should contain PDF documents"
            : "or click the button below to browse"}
        </div>
      </DropZoneText>
      <Button
        variant="primary"
        size="md"
        onClick={handleBrowseClick}
        disabled={disabled}
        style={{ marginTop: "var(--oc-spacing-md)" }}
      >
        <FileText style={{ width: 16, height: 16, marginRight: 8 }} />
        Browse Files
      </Button>
    </DropZone>
  );
};

export default FileDropZone;
