import React from "react";
import { Modal } from "@os-legal/ui";
import styled from "styled-components";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

const FullScreenModalWrapper = styled.div`
  .oc-modal-overlay {
    padding: 0;
  }

  .oc-modal {
    position: fixed !important;
    margin: 0 !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
    border-radius: 0 !important;
    background: ${OS_LEGAL_COLORS.gray50};
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
  }

  .oc-modal-body {
    flex: 1 1 auto !important;
    overflow: hidden !important;
    padding: 0 !important;
    margin: 0 !important;
  }
`;

interface FullScreenModalProps {
  id?: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const FullScreenModal: React.FC<FullScreenModalProps> = ({
  id,
  open,
  onClose,
  children,
}) => (
  <FullScreenModalWrapper id={id}>
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnEscape={false}
      closeOnOverlay={false}
    >
      {children}
    </Modal>
  </FullScreenModalWrapper>
);

export const SourceIndicator = styled.div`
  padding: 0.5rem;
  background: #eef2ff;
  border-left: 3px solid #818cf8;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #4338ca;
`;
