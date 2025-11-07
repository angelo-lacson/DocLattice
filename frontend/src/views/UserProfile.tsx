/**
 * User Profile View Component
 *
 * Issue: #611 - Create User Profile Page with badge display and stats
 * Epic: #572 - Social Features Epic
 *
 * Displays comprehensive user profile including:
 * - User information and avatar
 * - Earned badges
 * - Contribution statistics
 * - Recent activity
 * - Edit profile button (for own profile)
 */

import React from "react";
import styled from "styled-components";
import { User, Settings, TrendingUp } from "lucide-react";
import { Container, Button } from "semantic-ui-react";
import { UserBadges } from "../components/badges/UserBadges";
import { UserProfileReputation } from "../components/threads/UserProfileReputation";
import { UserStats } from "../components/profile/UserStats";
import { RecentActivity } from "../components/profile/RecentActivity";
import { showUserSettingsModal } from "../graphql/cache";
import { color } from "../theme/colors";

const ProfileContainer = styled(Container)`
  padding: 2rem;
  max-width: 1200px !important;
  margin: 0 auto !important;

  @media (max-width: 640px) {
    padding: 1rem;
  }
`;

const ProfileHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 2rem;
  padding: 2rem;
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid ${color.N4};
  border-radius: 16px;
  margin-bottom: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
  }
`;

const Avatar = styled.div`
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: linear-gradient(135deg, ${color.B5} 0%, ${color.P5} 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);

  @media (max-width: 640px) {
    width: 100px;
    height: 100px;
    font-size: 40px;
  }
`;

const ProfileInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const ProfileName = styled.h1`
  margin: 0;
  font-size: 32px;
  font-weight: 700;
  color: ${color.N10};

  @media (max-width: 640px) {
    font-size: 24px;
    text-align: center;
  }
`;

const ProfileUsername = styled.div`
  font-size: 18px;
  color: ${color.N7};
  font-weight: 500;

  @media (max-width: 640px) {
    font-size: 16px;
    text-align: center;
  }
`;

const ProfileEmail = styled.div`
  font-size: 14px;
  color: ${color.N6};

  @media (max-width: 640px) {
    text-align: center;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 1rem;

  @media (max-width: 640px) {
    width: 100%;
    flex-direction: column;
  }
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;

  @media (min-width: 768px) {
    grid-template-columns: 2fr 1fr;
  }
`;

const MainColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const SideColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const Section = styled.div`
  background: white;
  border: 1px solid ${color.N4};
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const SectionTitle = styled.h2`
  margin: 0 0 1.5rem 0;
  font-size: 20px;
  font-weight: 600;
  color: ${color.N10};
  display: flex;
  align-items: center;
  gap: 0.5rem;

  svg {
    width: 20px;
    height: 20px;
  }
`;

export interface UserProfileProps {
  user: {
    id: string;
    username: string;
    slug: string;
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    isProfilePublic: boolean;
    reputationGlobal: number;
    totalMessages: number;
    totalThreadsCreated: number;
    totalAnnotationsCreated: number;
    totalDocumentsUploaded: number;
  };
  isOwnProfile: boolean;
}

export const UserProfile: React.FC<UserProfileProps> = ({
  user,
  isOwnProfile,
}) => {
  // Get initials for avatar
  const getInitials = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.name) {
      const parts = user.name.split(" ");
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return user.name.substring(0, 2).toUpperCase();
    }
    return user.username.substring(0, 2).toUpperCase();
  };

  const displayName =
    user.name ||
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    user.username;

  // Calculate recent change (placeholder - would need backend support for real data)
  const recentChange = 0; // TODO: Backend would need to track this

  return (
    <ProfileContainer>
      <ProfileHeader>
        <Avatar>{getInitials()}</Avatar>
        <ProfileInfo>
          <ProfileName>{displayName}</ProfileName>
          <ProfileUsername>@{user.username}</ProfileUsername>
          {isOwnProfile && user.email && (
            <ProfileEmail>{user.email}</ProfileEmail>
          )}
          {isOwnProfile && (
            <ActionButtons>
              <Button
                icon
                labelPosition="left"
                onClick={() => showUserSettingsModal(true)}
              >
                <Settings size={16} />
                Edit Profile
              </Button>
            </ActionButtons>
          )}
        </ProfileInfo>
      </ProfileHeader>

      <ContentGrid>
        <MainColumn>
          {/* Badges Section */}
          <Section>
            <UserBadges userId={user.id} showTitle={true} title="Badges" />
          </Section>

          {/* Recent Activity Section */}
          <Section>
            <SectionTitle>
              <TrendingUp />
              Recent Activity
            </SectionTitle>
            <RecentActivity userId={user.id} />
          </Section>
        </MainColumn>

        <SideColumn>
          {/* Reputation Section */}
          <Section>
            <UserProfileReputation
              globalReputation={user.reputationGlobal}
              upvotesReceived={0} // TODO: Backend support needed
              downvotesReceived={0} // TODO: Backend support needed
              recentChange={recentChange}
              changePeriod="this week"
            />
          </Section>

          {/* Stats Section */}
          <Section>
            <SectionTitle>
              <User />
              Contribution Stats
            </SectionTitle>
            <UserStats
              totalMessages={user.totalMessages}
              totalThreads={user.totalThreadsCreated}
              totalAnnotations={user.totalAnnotationsCreated}
              totalDocuments={user.totalDocumentsUploaded}
            />
          </Section>
        </SideColumn>
      </ContentGrid>
    </ProfileContainer>
  );
};
