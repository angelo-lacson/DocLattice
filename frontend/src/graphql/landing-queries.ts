import { gql } from "@apollo/client";
import {
  CorpusType,
  ConversationType,
  DocumentType,
  UserType,
} from "../types/graphql-api";

// ============================================================================
// Landing Page Discovery Queries
// ============================================================================

/**
 * Get public/trending corpuses for landing page
 * Anonymous users will only see public corpuses
 */
export interface GetTrendingCorpusesOutput {
  corpuses: {
    edges: Array<{
      node: Pick<
        CorpusType,
        | "id"
        | "slug"
        | "title"
        | "description"
        | "icon"
        | "isPublic"
        | "created"
      > & {
        creator: {
          id: string;
          username: string;
          slug: string;
        };
        documents: {
          totalCount: number;
        };
        annotations: {
          totalCount: number;
        };
        engagementMetrics?: {
          totalThreads: number;
          totalMessages: number;
          uniqueContributors: number;
        } | null;
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export const GET_TRENDING_CORPUSES = gql`
  query GetTrendingCorpuses($limit: Int) {
    corpuses(first: $limit) {
      edges {
        node {
          id
          slug
          title
          description
          icon
          isPublic
          created
          creator {
            id
            username
            slug
          }
          documents {
            totalCount
          }
          annotations {
            totalCount
          }
          engagementMetrics {
            totalThreads
            totalMessages
            uniqueContributors
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Get recent public discussions/threads for landing page
 */
export interface GetRecentDiscussionsOutput {
  conversations: {
    edges: Array<{
      node: Pick<
        ConversationType,
        | "id"
        | "title"
        | "description"
        | "createdAt"
        | "updatedAt"
        | "isPinned"
        | "isLocked"
      > & {
        creator: {
          id: string;
          username: string;
        };
        chatMessages: {
          totalCount: number;
        };
        chatWithCorpus?: {
          id: string;
          title: string;
          slug: string;
          creator: {
            slug: string;
          };
        } | null;
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
    totalCount: number;
  };
}

export const GET_RECENT_DISCUSSIONS = gql`
  query GetRecentDiscussions(
    $limit: Int
    $conversationType: ConversationTypeEnum
  ) {
    conversations(first: $limit, conversationType: $conversationType) {
      edges {
        node {
          id
          title
          description
          createdAt
          updatedAt
          isPinned
          isLocked
          creator {
            id
            username
          }
          chatMessages {
            totalCount
          }
          chatWithCorpus {
            id
            title
            slug
            creator {
              slug
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
  }
`;

/**
 * Get recent public documents for landing page
 */
export interface GetRecentDocumentsOutput {
  documents: {
    edges: Array<{
      node: Pick<
        DocumentType,
        | "id"
        | "slug"
        | "title"
        | "description"
        | "icon"
        | "fileType"
        | "created"
      > & {
        creator: {
          slug: string;
          username?: string;
        };
      };
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export const GET_RECENT_DOCUMENTS = gql`
  query GetRecentDocuments($limit: Int) {
    documents(first: $limit) {
      edges {
        node {
          id
          slug
          title
          description
          icon
          fileType
          created
          creator {
            slug
            username
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Get platform-wide community statistics
 * Note: Backend CommunityStatsType doesn't have totalCorpuses/totalDocuments
 */
export interface GetCommunityStatsOutput {
  communityStats: {
    totalUsers: number;
    totalThreads: number;
    totalMessages: number;
    totalAnnotations: number;
    activeUsersThisWeek: number;
    activeUsersThisMonth: number;
  };
}

export const GET_COMMUNITY_STATS = gql`
  query GetCommunityStats {
    communityStats {
      totalUsers
      totalThreads
      totalMessages
      totalAnnotations
      activeUsersThisWeek
      activeUsersThisMonth
    }
  }
`;

/**
 * Get global leaderboard for top contributors
 * Note: User badges are accessed via 'badges' field (returns UserBadge connection)
 */
export interface LeaderboardEntry {
  id: string;
  username: string;
  slug?: string;
  reputationGlobal?: number;
  totalMessages?: number;
  totalThreadsCreated?: number;
  totalAnnotationsCreated?: number;
  badges?: {
    edges: Array<{
      node: {
        badge: {
          id: string;
          name: string;
          icon: string;
          color: string;
        };
      };
    }>;
  };
}

export interface GetGlobalLeaderboardOutput {
  globalLeaderboard: LeaderboardEntry[];
}

export const GET_GLOBAL_LEADERBOARD = gql`
  query GetGlobalLeaderboard($limit: Int) {
    globalLeaderboard(limit: $limit) {
      id
      username
      slug
      reputationGlobal
      totalMessages
      totalThreadsCreated
      totalAnnotationsCreated
      badges(first: 3) {
        edges {
          node {
            badge {
              id
              name
              icon
              color
            }
          }
        }
      }
    }
  }
`;

/**
 * Unified discovery query - fetches everything needed for landing page in one request
 */
export interface GetDiscoveryDataOutput {
  corpuses: GetTrendingCorpusesOutput["corpuses"];
  conversations: GetRecentDiscussionsOutput["conversations"];
  communityStats: GetCommunityStatsOutput["communityStats"];
  globalLeaderboard: LeaderboardEntry[];
}

export const GET_DISCOVERY_DATA = gql`
  query GetDiscoveryData(
    $corpusLimit: Int
    $discussionLimit: Int
    $leaderboardLimit: Int
    $conversationType: ConversationTypeEnum
  ) {
    corpuses(first: $corpusLimit) {
      edges {
        node {
          id
          slug
          title
          description
          icon
          isPublic
          created
          creator {
            id
            username
            slug
          }
          documents {
            totalCount
          }
          annotations {
            totalCount
          }
          engagementMetrics {
            totalThreads
            totalMessages
            uniqueContributors
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
    conversations(
      first: $discussionLimit
      conversationType: $conversationType
    ) {
      edges {
        node {
          id
          title
          description
          createdAt
          updatedAt
          isPinned
          isLocked
          creator {
            id
            username
          }
          chatMessages {
            totalCount
          }
          chatWithCorpus {
            id
            title
            slug
            creator {
              slug
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
    }
    communityStats {
      totalUsers
      totalThreads
      totalMessages
      totalAnnotations
      activeUsersThisWeek
      activeUsersThisMonth
    }
    globalLeaderboard(limit: $leaderboardLimit) {
      id
      username
      slug
      reputationGlobal
      totalMessages
      totalThreadsCreated
      totalAnnotationsCreated
      badges(first: 3) {
        edges {
          node {
            badge {
              id
              name
              icon
              color
            }
          }
        }
      }
    }
  }
`;
