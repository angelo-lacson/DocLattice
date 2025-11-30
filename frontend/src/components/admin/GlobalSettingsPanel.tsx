import React from "react";
import { useNavigate } from "react-router-dom";
import { Header, Segment, Card, Icon } from "semantic-ui-react";
import styled from "styled-components";

const Container = styled.div`
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
`;

const PageHeader = styled.div`
  margin-bottom: 2rem;
`;

const PageTitle = styled(Header)`
  &.ui.header {
    margin-bottom: 0.5rem;
    color: #1e293b;
  }
`;

const PageDescription = styled.p`
  color: #64748b;
  font-size: 1rem;
  margin: 0;
`;

const SettingsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
`;

const SettingsCard = styled(Card)`
  &.ui.card {
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
    cursor: pointer;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .content {
      padding: 1.5rem;
    }
  }
`;

const CardIcon = styled.div<{ $color: string }>`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: ${(props) => props.$color};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;

  i.icon {
    color: white;
    margin: 0;
  }
`;

const CardTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
  margin: 0 0 0.5rem 0;
`;

const CardDescription = styled.p`
  font-size: 0.875rem;
  color: #64748b;
  margin: 0;
  line-height: 1.5;
`;

const ComingSoonBadge = styled.span`
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 500;
  color: #8b5cf6;
  background: #f3e8ff;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  margin-left: 0.5rem;
`;

interface SettingItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  route?: string;
  comingSoon?: boolean;
}

const settingsItems: SettingItem[] = [
  {
    id: "badges",
    title: "Badge Management",
    description:
      "Create and manage badges that can be awarded to users for achievements and contributions.",
    icon: "trophy",
    color: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
    route: "/admin/badges",
  },
  {
    id: "global-agents",
    title: "Global Agents",
    description:
      "Configure global AI agents available across all corpuses for document and corpus analysis.",
    icon: "robot",
    color: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
    route: "/admin/agents",
  },
  {
    id: "system-settings",
    title: "System Settings",
    description:
      "Configure system-wide settings including defaults, limits, and feature flags.",
    icon: "cog",
    color: "linear-gradient(135deg, #64748b 0%, #475569 100%)",
    comingSoon: true,
  },
  {
    id: "user-management",
    title: "User Management",
    description:
      "View and manage user accounts, permissions, and access controls.",
    icon: "users",
    color: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    comingSoon: true,
  },
];

export const GlobalSettingsPanel: React.FC = () => {
  const navigate = useNavigate();

  const handleCardClick = (item: SettingItem) => {
    if (item.route && !item.comingSoon) {
      navigate(item.route);
    }
  };

  return (
    <Container>
      <PageHeader>
        <PageTitle as="h1">
          <Icon name="settings" /> Admin Settings
        </PageTitle>
        <PageDescription>
          Manage global settings, configurations, and administrative features
          for OpenContracts.
        </PageDescription>
      </PageHeader>

      <SettingsGrid>
        {settingsItems.map((item) => (
          <SettingsCard
            key={item.id}
            onClick={() => handleCardClick(item)}
            style={{ opacity: item.comingSoon ? 0.7 : 1 }}
          >
            <Card.Content>
              <CardIcon $color={item.color}>
                <Icon name={item.icon as any} size="large" />
              </CardIcon>
              <CardTitle>
                {item.title}
                {item.comingSoon && (
                  <ComingSoonBadge>Coming Soon</ComingSoonBadge>
                )}
              </CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </Card.Content>
          </SettingsCard>
        ))}
      </SettingsGrid>
    </Container>
  );
};

export default GlobalSettingsPanel;
