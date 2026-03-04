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
  yesAction: (args?: any) => void;
  noAction: (args?: any) => void;
  toggleModal: (args?: any) => void;
}
export function ConfirmModal({
  message,
  visible,
  yesAction,
  noAction,
  toggleModal,
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
          variant="danger"
          onClick={() => onNoClick()}
          leftIcon={<X size={16} />}
        >
          No
        </Button>
        <Button
          variant="primary"
          onClick={() => onYesClick()}
          leftIcon={<Check size={16} />}
        >
          Yes
        </Button>
      </ModalFooter>
    </Modal>
  );
}
