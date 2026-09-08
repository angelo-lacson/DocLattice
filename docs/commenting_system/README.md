# Corpus Collaboration System Documentation

## Overview

The DocLattice Corpus Collaboration System enables rich, community-driven interactions within corpus contexts. This system transforms DocLattice from a document annotation platform into a collaborative knowledge hub by adding discussion capabilities, voting/reputation systems, and moderation tools.

## Epic Issue

This system was implemented as part of Epic historical issue 581 - Corpus Interactivity: Discussion Collaboration System.

## Implemented Sub-Epics

The following sub-epics have been completed:

1. **historical issue 549** - Update GraphQL schema and mutations for thread support
2. **historical issue 550** - Epic: Voting System & Reputation
3. **historical issue 554** - Create GraphQL mutations for voting with rate limiting
4. **historical issue 557** - Create GraphQL mutations for moderation actions
5. **historical issue 558** - Epic: Badge System
6. **historical issue 562** - Epic: Notification System
7. **historical issue 565** - Epic: Corpus Engagement Metrics & Analytics

## Current Implementation Status

### Backend: ✅ Complete

The backend implementation is fully functional with:
- Complete database models for threads, voting, reputation, moderation, badges, and notifications
- Comprehensive GraphQL API with mutations and queries
- Robust permission system with corpus owners and designated moderators
- Rate limiting to prevent abuse
- Automatic reputation calculation and notification creation via Django signals
- Soft delete functionality for reversible moderation
- Badge system with auto-awarding capabilities
- Real-time notification system for all user interactions
- Extensive test coverage (8 test files, 100,000+ characters of tests)

### Frontend: ✅ Partial Implementation

The frontend has partial implementation:
- Agent mentions with TipTap editor extension (autocomplete UI)
- Chat interface components for agent conversations
- Backend API is ready to support full UI implementation for discussion threads

## Core Features

### 1. Discussion Threads

- Create threaded discussions at the corpus or document level
- Support for nested message replies (unlimited depth)
- Thread metadata: title, description, creation timestamp
- Conversation types: CHAT (agent-based) or THREAD (discussion)

### 2. Voting & Reputation System

- Upvote/downvote functionality on messages
- User reputation tracking (both global and per-corpus)
- Denormalized vote counts for performance
- Asynchronous reputation calculation via signals
- Protection against self-voting

### 3. Moderation System

- Corpus-level moderator designation with granular permissions
- Thread locking to prevent new messages
- Thread pinning to highlight important discussions
- Soft deletion of threads and messages (reversible)
- Complete audit trail of all moderation actions
- Permission hierarchy: superusers > corpus owners > designated moderators > creators

### 4. Badge System

- Global and corpus-specific badges
- Manual and automatic badge awarding
- Configurable criteria for auto-awards (reputation thresholds, contribution metrics)
- Badge icons and customizable colors
- Complete audit trail of badge awards and revocations
- Integration with notification system

### 5. Notification System

- Real-time notifications for all user interactions
- 14 notification types: replies, mentions, votes, badges, moderation actions, thread participation
- @username mention detection with smart parsing
- Configurable read/unread status
- GraphQL API for managing notifications
- Automatic cleanup via signal handlers
- Rich notification context data

### 6. Agent Mentions

- Reference AI agents in chat messages using `@agent` syntax
- Autocomplete search for agents via GraphQL query
- Support for global agents and corpus-scoped agents
- Server-side permission enforcement using `visible_to_user()`
- Markdown link format: `[@Agent Name](/agents/agent-slug)`
- ManyToMany relationship tracking between messages and mentioned agents
- Default agents: Document Assistant, Corpus Assistant

### 7. Rate Limiting

- Multi-level rate limiting to prevent abuse
- Different limits for different operation types
- User-tier based limits (superuser > authenticated > anonymous)
- IP and user-based tracking

### 8. Engagement Metrics & Analytics

- Denormalized engagement metrics per corpus (threads, messages, contributors)
- Time-based metrics (7-day and 30-day activity)
- Async calculation via Celery tasks
- Global and corpus-specific reputation leaderboards
- GraphQL queries for metrics and leaderboards
- Dashboard-ready aggregated statistics

## Documentation Structure

This documentation is organized into the following sections:

1. **[Overview](./README.md)** - This document
2. **[Backend Architecture](./backend_architecture.md)** - Database models, signals, and core logic
3. **[GraphQL API](./graphql_api.md)** - Mutations, queries, and type definitions
4. **[Voting & Reputation](./voting_and_reputation.md)** - How voting and reputation scoring works
5. **[Moderation System](./moderation.md)** - Moderator roles, permissions, and actions
6. **[Notifications](./notifications.md)** - Notification system and user alerts
7. **[Testing](./testing.md)** - Test coverage and testing strategies
8. **[Implementation Timeline](./implementation_timeline.md)** - What was built and when

## Quick Links

### Key Backend Files

- **Models**: `doclatticeserver/conversations/models.py`, `doclatticeserver/badges/models.py`, `doclatticeserver/notifications/models.py`, `doclatticeserver/agents/models.py`
- **Signals**: `doclatticeserver/conversations/signals.py`, `doclatticeserver/notifications/signals.py`
- **Thread Mutations**: `config/graphql/conversation_mutations.py`
- **Voting Mutations**: `config/graphql/voting_mutations.py`
- **Moderation Mutations**: `config/graphql/moderation_mutations.py`
- **Badge Mutations**: `config/graphql/badge_mutations.py`
- **Notification Mutations**: `config/graphql/notification_mutations.py`
- **Queries**: `config/graphql/queries.py`
- **Rate Limits**: `config/graphql/ratelimits.py`
- **Mention Parser**: `doclatticeserver/utils/mention_parser.py`

### Test Files

- `doclatticeserver/tests/test_threading.py`
- `doclatticeserver/tests/test_voting.py`
- `doclatticeserver/tests/test_voting_mutations_graphql.py`
- `doclatticeserver/tests/test_moderation.py`
- `doclatticeserver/tests/test_conversation_mutations_graphql.py`
- `doclatticeserver/tests/test_conversation_query.py`
- `doclatticeserver/tests/test_badges.py`
- `doclatticeserver/tests/test_notifications.py`
- `doclatticeserver/tests/test_notification_graphql.py`
- `doclatticeserver/tests/test_agents.py`

## Development Guidelines

All contributions to this feature set followed these requirements:

### Test Coverage

- **Backend**: All changes include comprehensive tests
  - Run with: `docker compose -f test.yml run django python manage.py test`
  - Target: >90% coverage for new code
  - All tests must pass before PR approval

- **Frontend**: UI components must include Playwright component tests
  - Run with: `yarn run test:ct`
  - Mock backend data appropriately
  - Test user interactions, loading states, and error handling

### Code Quality

- **Pre-commit hooks**: Run `pre-commit run --all-files` before pushing
  - Ensures code formatting (Black, isort, prettier)
  - Linting (flake8, ESLint)
  - Type checking where applicable

### Pull Request Process

- **Target Branch**: PRs opened against the `v3.0.0.b3` branch
- **PR Description**: Includes link to issue, description of changes, test coverage summary, screenshots/videos for UI changes
- **Reviews**: At least one approval required
- **CI/CD**: All GitHub Actions checks must pass

## Next Steps

The following epics remain to be implemented:

- **#569**: Epic: Thread Search & Discovery
- **#572**: Epic: Frontend UI Implementation (Discussion threads UI - agent chat UI partially complete)

---

*Last Updated: 2026-01-09*
