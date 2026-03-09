/**
 * GetStarted Component
 *
 * Displays a Getting Started guide with action items for new users.
 * Can be dismissed by authenticated users - preference is persisted to backend.
 * For anonymous users, dismissal is stored in localStorage.
 */
import React from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { X, Upload, Users, FolderPlus, BookOpen } from "lucide-react";
import { OS_LEGAL_COLORS } from "../../assets/configurations/osLegalStyles";

// GraphQL mutation to dismiss Getting Started
export const DISMISS_GETTING_STARTED = gql`
  mutation DismissGettingStarted {
    dismissGettingStarted {
      ok
      message
    }
  }
`;

interface GetStartedProps {
  isAuthenticated: boolean;
  isDismissed: boolean;
  onDismiss: () => void;
}

const Container = styled.div`
  position: relative;
`;

const Title = styled.h3`
  font-size: 16px;
  font-weight: 600;
  color: ${OS_LEGAL_COLORS.textPrimary};
  margin: 0 0 16px 0;
`;

const Card = styled.div`
  background: white;
  border-radius: 16px;
  border: 1px solid ${OS_LEGAL_COLORS.border};
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
`;

const DismissButton = styled.button`
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: ${OS_LEGAL_COLORS.textMuted};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceLight};
    color: ${OS_LEGAL_COLORS.textSecondary};
  }
`;

const ActionList = styled.div`
  display: flex;
  flex-direction: column;
`;

const ActionItem = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-radius: 8px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: ${OS_LEGAL_COLORS.surfaceHover};
  }
`;

const ActionIcon = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${OS_LEGAL_COLORS.accent};

  svg {
    width: 18px;
    height: 18px;
  }
`;

const ActionLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: ${OS_LEGAL_COLORS.accent};
`;

// Get Started action items
const actions = [
  {
    id: "upload",
    label: "Upload your first document",
    icon: Upload,
    path: "/documents",
  },
  {
    id: "browse",
    label: "Browse knowledge bases",
    icon: Users,
    path: "/corpuses",
  },
  {
    id: "create",
    label: "Create new corpus",
    icon: FolderPlus,
    path: "/corpuses?create=true",
  },
  {
    id: "guide",
    label: "Read the contributor guide",
    icon: BookOpen,
    path: "https://open-source-legal.github.io/OpenContracts/",
    external: true,
  },
];

export const GetStarted: React.FC<GetStartedProps> = ({
  isAuthenticated,
  isDismissed,
  onDismiss,
}) => {
  const navigate = useNavigate();
  const [dismissMutation] = useMutation(DISMISS_GETTING_STARTED);

  const handleDismiss = async () => {
    if (isAuthenticated) {
      try {
        await dismissMutation();
      } catch (error) {
        console.error("Failed to dismiss Getting Started:", error);
      }
    }
    onDismiss();
  };

  const handleActionClick = (action: (typeof actions)[0]) => {
    if (action.external) {
      window.open(action.path, "_blank", "noopener,noreferrer");
    } else {
      navigate(action.path);
    }
  };

  // Don't render if dismissed
  if (isDismissed) {
    return null;
  }

  return (
    <Container>
      <Title>Get Started</Title>
      <DismissButton
        onClick={handleDismiss}
        aria-label="Dismiss Getting Started"
      >
        <X size={16} />
      </DismissButton>
      <Card>
        <ActionList>
          {actions.map((action) => (
            <ActionItem
              key={action.id}
              onClick={() => handleActionClick(action)}
            >
              <ActionIcon>
                <action.icon />
              </ActionIcon>
              <ActionLabel>{action.label}</ActionLabel>
            </ActionItem>
          ))}
        </ActionList>
      </Card>
    </Container>
  );
};
