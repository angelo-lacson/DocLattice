import { Icon } from "semantic-ui-react";
import { LoadingOverlay } from "../common/LoadingOverlay";

import {
  NOT_STARTED,
  UPLOADING,
  SUCCESS,
  FAILED,
  FileDetailsProps,
} from "../widgets/modals/DocumentUploadModal";
import {
  FileListItem,
  FileItemContent,
  FileItemIcon,
  FileItemDetails,
  FileItemActions,
  DeleteButton,
} from "../widgets/modals/UploadModalStyles";

interface ContractListItemProps {
  document: FileDetailsProps;
  status: string;
  selected: boolean;
  onRemove: () => void;
  onSelect: () => void;
}

export const ContractListItem = ({
  document,
  status,
  selected,
  onRemove,
  onSelect,
}: ContractListItemProps) => {
  const getStatusIcon = () => {
    switch (status) {
      case SUCCESS:
        return "check circle";
      case FAILED:
        return "times circle";
      case UPLOADING:
        return "spinner";
      default:
        return "file pdf outline";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case SUCCESS:
        return "Uploaded successfully";
      case FAILED:
        return "Upload failed";
      case UPLOADING:
        return "Uploading...";
      default:
        return "Ready to upload";
    }
  };

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  return (
    <FileListItem $selected={selected} $status={status} onClick={onSelect}>
      <LoadingOverlay
        active={status === UPLOADING}
        inverted
        content="Uploading..."
      />
      <FileItemContent>
        <FileItemIcon $status={status}>
          <Icon name={getStatusIcon()} loading={status === UPLOADING} />
        </FileItemIcon>
        <FileItemDetails>
          <div className="file-name">
            {document?.title || "Untitled Document"}
          </div>
          <div
            className={`file-status ${
              status === FAILED ? "error" : status === SUCCESS ? "success" : ""
            }`}
          >
            {getStatusText()}
          </div>
        </FileItemDetails>
      </FileItemContent>
      {status === NOT_STARTED && (
        <FileItemActions>
          <DeleteButton
            icon
            onClick={handleRemoveClick}
            aria-label="Remove file"
          >
            <Icon name="trash alternate outline" />
          </DeleteButton>
        </FileItemActions>
      )}
    </FileListItem>
  );
};
