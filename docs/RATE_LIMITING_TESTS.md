# Rate Limiting Tests

## Overview

The OpenContracts application uses Traefik for rate limiting with different configurations for production and CI/CD environments.

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

The following rate limits are configured:

| Endpoint | Average (req/sec) | Burst | Redis DB |
|----------|------------------|-------|----------|
| Frontend (`/`) | 10 | 20 | 1 |
| API (`/graphql`, `/admin`) | 5 | 10 | 1 |
| Flower (`/flower`) | 10 | 20 | 1 |

## Running Tests

### In CI/CD (GitHub Actions)
The tests run automatically on PRs and pushes that modify production stack files:
```bash
# Automatically runs in GitHub Actions using:
docker compose -f production.yml -f compose/test-production-ci.yml up -d
./scripts/test-ci-rate-limiting.sh --compose-files "production.yml compose/test-production-ci.yml"
```

### Locally (for development)
```bash
# Start the stack in CI mode (HTTP-only)
docker compose -f production.yml -f compose/test-production-ci.yml up -d

# Run the rate limiting test
./scripts/test-ci-rate-limiting.sh --compose-files "production.yml compose/test-production-ci.yml"

# Clean up
docker compose -f production.yml -f compose/test-production-ci.yml down -v
```

## Key Differences from Production

1. **No SSL/TLS**: CI tests use HTTP-only to avoid certificate complexity
2. **Localhost routing**: Tests target `localhost` instead of production domains
3. **No HTTPS redirect**: HTTP to HTTPS redirection is disabled in CI mode
4. **Simplified configuration**: No certificate stores or resolvers in CI mode

## Troubleshooting

### Tests failing with connection errors
- Check if all services are running: `docker compose ps`
- Verify Traefik is healthy: `docker logs opencontracts-traefik-1`
- Check Redis connectivity: `docker exec opencontracts-redis-1 redis-cli ping`

### Rate limiting not triggering
- Verify Redis is running and accessible
- Check Traefik middleware configuration in logs
- Ensure burst limits match test expectations

### 502 Bad Gateway errors
- Backend services may not be ready
- Check Django logs: `docker logs opencontracts-django-1`
- Verify frontend is running: `docker logs opencontracts-frontend-1`
