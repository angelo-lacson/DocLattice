# Rate Limiting Implementation Summary

## Overview

DocLattice uses a unified rate limiting package (`config/ratelimit/`) that serves all protocols: GraphQL, WebSocket, MCP, and Django views. The system replaced the previous `django-ratelimit` dependency with a custom fixed-window counter engine backed by Django's cache framework (Redis in production).

## Implementation Status

### Core Components
1. **Rate Limiting Engine** (`config/ratelimit/engine.py`) — Fixed-window counter with sync and async APIs
2. **Identity Resolution** (`config/ratelimit/keys.py`) — IP extraction from HTTP requests and ASGI scopes
3. **Rate Categories** (`config/ratelimit/rates.py`) — `RateLimits` singleton with 17 categories and tier multipliers
4. **Protocol Adapters** (`config/ratelimit/decorators.py`) — `graphql_ratelimit`, `check_ws_rate_limit`, `check_mcp_rate_limit`, `view_ratelimit`

### Protocol Coverage

| Protocol | Adapter | Behavior on Limit |
|----------|---------|-------------------|
| GraphQL | `graphql_ratelimit` / `graphql_ratelimit_dynamic` | Raises `RateLimitExceeded` (GraphQLError) |
| WebSocket | `check_ws_rate_limit` | Sends JSON error message, keeps connection open |
| MCP | `check_mcp_rate_limit` | Global cap + per-tool limits (IP-based, always anonymous) |
| Django views | `view_ratelimit` | Sets `request.limited`, optionally returns HTTP 429 |

### Rate-Limited Endpoints
- **GraphQL**: 28 mutations + 21 query resolvers
- **WebSocket**: 3 consumers (agent chat, notifications, thread updates)
- **MCP**: Global cap + 8 tool-specific limits
- **Django views**: Admin login page

### User Tiers
- **Superusers**: 10x base rate limit
- **Authenticated Users**: 2x base rate limit (or 1x if usage-capped)
- **Anonymous Users**: 1x base rate limit

### Test Coverage
- `doclatticeserver/tests/test_rate_limiting.py` — GraphQL integration tests
- `doclatticeserver/tests/test_unified_rate_limiting.py` — Comprehensive tests for engine, keys, rates, and all protocol adapters

## Key Design Decisions
1. **No external dependency** — Replaced `django-ratelimit` with a custom engine to support ASGI protocols (WebSocket, MCP) that don't have `HttpRequest` objects
2. **Shared categories** — WebSocket and MCP operations map to existing rate categories (e.g., MCP `search_corpus` → `READ_HEAVY`, WS agent chat → `AI_QUERY`)
3. **Keep connection open** — WebSocket rate limiting sends error messages but doesn't close the connection
4. **Per-user scoping** — WebSocket limits are per-user (authenticated) or per-IP (anonymous)
5. **MCP global + per-tool** — Two-layer rate limiting for MCP: global cap plus per-tool category limits
6. **Backward-compatible re-exports** — `config/graphql/ratelimits.py` remains a valid import path for all 21+ files using it
