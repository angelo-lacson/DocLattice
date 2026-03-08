import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@os-legal/ui";
import { X, Check, AlertCircle } from "lucide-react";

interface ConfirmModalProps {
  message: string;
  visible: boolean;
  /** Called when the user clicks "Yes". Must NOT close the modal — toggleModal handles that. */
  yesAction: () => void;
  /** Called when the user clicks "No". Must NOT close the modal — toggleModal handles that. */
  noAction: () => void;
  /** Closes the modal. Called automatically after yesAction/noAction and on overlay/escape close. */
  toggleModal: () => void;
  /** Variant for the confirm button. Defaults to "danger" for destructive actions. */
  confirmVariant?: "primary" | "secondary" | "danger" | "ghost";
  /** Label for the confirm button. Defaults to "Yes". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "No". */
  cancelLabel?: string;
}
export function ConfirmModal({
  message,
  visible,
  yesAction,
  noAction,
  toggleModal,
  confirmVariant = "danger",
  confirmLabel = "Yes",
  cancelLabel = "No",
}: ConfirmModalProps) {
  const onYesClick = () => {
    yesAction();
    toggleModal();
  };

  const onNoClick = () => {
    noAction();
    toggleModal();
  };

  return (
    <Modal open={visible} onClose={() => toggleModal()} size="sm">
      <ModalHeader
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AlertCircle size={20} />
            ARE YOU SURE?
          </span>
        }
        onClose={() => toggleModal()}
      />
      <ModalBody>
        <p>{message}</p>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="secondary"
          onClick={() => onNoClick()}
          leftIcon={<X size={16} />}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant}
          onClick={() => onYesClick()}
          leftIcon={<Check size={16} />}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
