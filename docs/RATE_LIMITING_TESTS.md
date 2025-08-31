# Rate Limiting Tests

## Overview

The OpenContracts application implements rate limiting at two levels:
1. **Infrastructure level**: Traefik reverse proxy for overall API protection
2. **Application level**: Django/GraphQL decorators for fine-grained control per operation

## Testing Environments

### CI/CD Environment (HTTP-only)
- **Configuration**: `compose/test-production-ci.yml` + `compose/production/traefik/traefik-ci.yml`
- **Protocol**: HTTP only (no SSL/TLS)
- **Test Script**: `scripts/test-ci-rate-limiting.sh`
- **Purpose**: Automated testing in GitHub Actions without certificate complexity

### Production Environment (HTTPS with ACME)
- **Configuration**: `production.yml` + `compose/production/traefik/traefik.yml`
- **Protocol**: HTTPS with Let's Encrypt ACME certificates
- **Domains**: `opencontracts.opensource.legal`, `www.opencontracts.opensource.legal`
- **Purpose**: Real production deployment with automatic SSL certificate management

## Rate Limits

### Traefik (Infrastructure Level)

The following rate limits are configured at the reverse proxy:

| Endpoint | Average (req/sec) | Burst | Redis DB |
|----------|------------------|-------|----------|
| Frontend (`/`) | 10 | 20 | 1 |
| API (`/graphql`, `/admin`) | 5 | 10 | 1 |
| Flower (`/flower`) | 10 | 20 | 1 |

### Django/GraphQL (Application Level)

Fine-grained rate limits per GraphQL operation type:

| Operation Type | Base Rate | Authenticated (2x) | Superuser (10x) | Usage-Capped (0.5x) |
|----------------|-----------|-------------------|-----------------|---------------------|
| AUTH_LOGIN | 5/m | N/A | N/A | N/A |
| AUTH_REGISTER | 3/m | N/A | N/A | N/A |
| AUTH_PASSWORD_RESET | 3/h | N/A | N/A | N/A |
| READ_LIGHT | 100/m | 200/m | 1000/m | 50/m |
| READ_MEDIUM | 30/m | 60/m | 300/m | 15/m |
| READ_HEAVY | 10/m | 20/m | 100/m | 5/m |
| WRITE_LIGHT | 30/m | 60/m | 300/m | 15/m |
| WRITE_MEDIUM | 10/m | 20/m | 100/m | 5/m |
| WRITE_HEAVY | 5/m | 10/m | 50/m | 2/m |
| AI_ANALYSIS | 5/m | 10/m | 50/m | 2/m |
| AI_EXTRACT | 10/m | 20/m | 100/m | 5/m |
| AI_QUERY | 20/m | 40/m | 200/m | 10/m |
| EXPORT | 5/h | 10/h | 50/h | 2/h |
| IMPORT | 10/h | 20/h | 100/h | 5/h |

## Running Tests

### Django/GraphQL Rate Limiting Tests
```bash
# Run the application-level rate limiting tests
docker compose -f test.yml run django python manage.py test opencontractserver.tests.test_rate_limiting

# These tests verify:
# - Rate limits are applied to GraphQL queries and mutations
# - Different user tiers get appropriate limits
# - Rate limit grouping works correctly
# - Anonymous vs authenticated limits are enforced
```

### Traefik Rate Limiting Tests (CI/CD)
The infrastructure-level tests run automatically on PRs and pushes that modify production stack files:
```bash
# Automatically runs in GitHub Actions using:
docker compose -f production.yml -f compose/test-production-ci.yml up -d
./scripts/test-ci-rate-limiting.sh --compose-files "production.yml compose/test-production-ci.yml"
```

### Running Both Locally
```bash
# 1. Test Django/GraphQL rate limiting
docker compose -f test.yml run django python manage.py test opencontractserver.tests.test_rate_limiting

# 2. Test Traefik rate limiting
docker compose -f production.yml -f compose/test-production-ci.yml up -d
./scripts/test-ci-rate-limiting.sh --compose-files "production.yml compose/test-production-ci.yml"
docker compose -f production.yml -f compose/test-production-ci.yml down -v
```

## Key Differences from Production

1. **No SSL/TLS**: CI tests use HTTP-only to avoid certificate complexity
2. **Localhost routing**: Tests target `localhost` instead of production domains
3. **No HTTPS redirect**: HTTP to HTTPS redirection is disabled in CI mode
4. **Simplified configuration**: No certificate stores or resolvers in CI mode

## Troubleshooting

### Django/GraphQL Rate Limiting Issues

#### Rate limiting not applied in tests
- Check if `TESTING=true` is set in `.envs/.test/.django`
- Verify decorators are applied to GraphQL resolvers and mutations
- Check Django cache is working: `docker exec django python manage.py shell -c "from django.core.cache import cache; print(cache.get('test'))"`

#### "Context is not a Django request" warnings
- Expected in unit tests using mock contexts (TestContext)
- Should NOT appear in production or integration tests
- If seen in production logs, indicates a security concern

### Traefik Rate Limiting Issues

#### Tests failing with connection errors
- Check if all services are running: `docker compose ps`
- Verify Traefik is healthy: `docker logs opencontracts-traefik-1`
- Check Redis connectivity: `docker exec opencontracts-redis-1 redis-cli ping`

#### Rate limiting not triggering
- Verify Redis is running and accessible
- Check Traefik middleware configuration in logs
- Ensure burst limits match test expectations

#### 502 Bad Gateway errors
- Backend services may not be ready
- Check Django logs: `docker logs opencontracts-django-1`
- Verify frontend is running: `docker logs opencontracts-frontend-1`

## Implementation Details

### Django/GraphQL Rate Limiting
- **Location**: `/config/graphql/ratelimits.py`
- **Decorators**: `@graphql_ratelimit`, `@graphql_ratelimit_dynamic`
- **Cache backend**: Django's default cache (Redis in production)
- **Key format**: `rl:[group]:[user_id|ip]:[function_name]`

### Security Considerations
- Rate limiting is enforced at both infrastructure and application levels
- Application-level limits provide defense in depth
- Bypassing Traefik still triggers Django-level limits
- All rate limit bypasses are logged in production for security monitoring
