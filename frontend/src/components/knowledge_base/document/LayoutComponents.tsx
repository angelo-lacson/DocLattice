import React from "react";
import { Modal } from "@os-legal/ui";
import styled, { createGlobalStyle } from "styled-components";
import { OS_LEGAL_COLORS } from "../../../assets/configurations/osLegalStyles";

// @os-legal/ui Modal renders via a portal outside the React tree,
// so wrapper descendant selectors never reach the portal DOM.
// We must use createGlobalStyle instead. Scoped via .fullscreen-modal class.
// TODO: Fix upstream in @os-legal/ui — add a size="fullscreen" variant
const FullScreenModalStyles = createGlobalStyle`
  .oc-modal-overlay:has(.fullscreen-modal) {
    padding: 0 !important;
  }

  .fullscreen-modal {
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

  .fullscreen-modal .oc-modal-body {
    flex: 1 1 auto !important;
    overflow: hidden !important;
    padding: 0 !important;
    margin: 0 !important;
    min-height: 0;
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
  <>
    <FullScreenModalStyles />
    <Modal
      id={id}
      open={open}
      onClose={onClose}
      size="lg"
      className="fullscreen-modal"
      closeOnEscape={false}
      closeOnOverlay={false}
    >
      {children}
    </Modal>
  </>
);

/* Indigo palette — no OS_LEGAL_COLORS tokens yet; add when indigo tokens are introduced */
export const SourceIndicator = styled.div`
  padding: 0.5rem;
  background: #eef2ff;
  border-left: 3px solid #818cf8;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #4338ca;
`;
