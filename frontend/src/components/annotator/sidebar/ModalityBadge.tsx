import React from "react";
import { Label } from "semantic-ui-react";
import styled from "styled-components";
import { FileText, Image, Layers } from "lucide-react";

const StyledBadge = styled(Label)<{ $badgeColor: string }>`
  &&& {
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    padding: 0.3em 0.6em;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.7rem;
    margin-left: 0.5rem;
    background: ${(props) => props.$badgeColor} !important;
    color: white !important;
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }
`;

interface ModalityBadgeProps {
  modalities: string[];
}

export const ModalityBadge: React.FC<ModalityBadgeProps> = ({ modalities }) => {
  if (!modalities || modalities.length === 0) {
    return null;
  }

  const hasText = modalities.includes("TEXT");
  const hasImage = modalities.includes("IMAGE");

  // Mixed modality (text + image)
  if (hasText && hasImage) {
    return (
      <StyledBadge $badgeColor="#8b5cf6" size="mini">
        <Layers size={12} />
        Mixed
      </StyledBadge>
    );
  }

  // Image only
  if (hasImage) {
    return (
      <StyledBadge $badgeColor="#f59e0b" size="mini">
        <Image size={12} />
        Image
      </StyledBadge>
    );
  }

  // Text only (or default)
  if (hasText) {
    return (
      <StyledBadge $badgeColor="#3b82f6" size="mini">
        <FileText size={12} />
        Text
      </StyledBadge>
    );
  }

  return null;
};
