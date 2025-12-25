import React, { useCallback, useRef } from "react";
import { Icon, List } from "semantic-ui-react";
import { DropEvent, FileRejection, useDropzone } from "react-dropzone";
import { ContractListItem } from "./DocumentListItem";
import { FileUploadPackageProps } from "../widgets/modals/DocumentUploadModal";
import {
  DropZone,
  DropZoneIcon,
  DropZoneText,
  DropZoneButton,
  FileListContainer,
} from "../widgets/modals/UploadModalStyles";

interface DocumentUploadListProps {
  documents: FileUploadPackageProps[];
  statuses: string[];
  selected_file_num: number;
  onSelect: (args?: any) => void | any;
  onRemove: (args?: any) => void | any;
  onAddFile: (args?: any) => void | any;
}

export function DocumentUploadList(props: DocumentUploadListProps) {
  const {
    documents,
    statuses,
    onSelect,
    onRemove,
    onAddFile,
    selected_file_num,
  } = props;

  const onDrop = useCallback(
    <T extends File>(
      acceptedFiles: T[],
      fileRejections: FileRejection[],
      event: DropEvent
    ) => {
      Array.from(acceptedFiles).forEach((file) => {
        onAddFile({
          file,
          formData: {
            title: file.name,
            description: `Content summary for ${file.name}`,
          },
        });
      });
    },
    [props]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    disabled: documents && Object.keys(documents).length > 0,
    onDrop,
  });

  const fileInputRef = useRef() as React.MutableRefObject<HTMLInputElement>;

  const grid =
    documents && documents.length > 0
      ? documents.map((document, index) => {
          // console.log("Document index", index);
          // console.log("Status", statuses[index]);
          return (
            <ContractListItem
              key={document?.file.name ? document.file.name : index}
              onRemove={() => onRemove(index)}
              onSelect={() => onSelect(index)}
              selected={index === selected_file_num}
              document={document.formData}
              status={statuses[index]}
            />
          );
        })
      : [<></>];

  function filesChanged(event: React.ChangeEvent<HTMLInputElement>) {
    let files: File[] = [];
    if (event?.target?.files) {
      for (var file of event.target.files) {
        if (file) {
          files.push(file as File);
        }
      }
      onDrop(files, [], event);
    }
  }

  return (
    <div style={{ height: "100%" }}>
      <div {...getRootProps()}>
        {documents && documents.length > 0 ? (
          <FileListContainer>
            <List divided relaxed>
              {grid}
            </List>
          </FileListContainer>
        ) : (
          <DropZone $isDragActive={isDragActive} $hasFiles={false}>
            <DropZoneIcon>
              <Icon name="file pdf outline" />
            </DropZoneIcon>
            <DropZoneText>
              <div className="primary-text">
                {isDragActive
                  ? "Drop your PDFs here..."
                  : "Drag & drop PDF files here"}
              </div>
              <div className="secondary-text">
                or click the button below to browse
              </div>
            </DropZoneText>
            <DropZoneButton onClick={() => fileInputRef.current.click()}>
              <Icon name="folder open" /> Browse Files
            </DropZoneButton>
          </DropZone>
        )}
        <input
          accept="application/pdf"
          {...getInputProps()}
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          onChange={filesChanged}
        />
      </div>
    </div>
  );
}
