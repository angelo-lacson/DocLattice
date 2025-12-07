Our test suite provides comprehensive coverage of the backend. Frontend tests use Playwright for component testing. All tests are integrated in our GitHub Actions CI pipeline.

NOTE: **Use Python 3.10 or above** as pydantic and certain pre-3.10 type annotations do not play well.

## Running Tests

### Parallel Test Execution (Recommended)

We use pytest-xdist for parallel test execution, which reduces test time from ~65 minutes to ~15-20 minutes:

```bash
# Run tests in parallel with 4 workers
docker compose -f test.yml run --rm django pytest -n 4 --dist loadscope

# Auto-detect workers based on CPU cores
docker compose -f test.yml run --rm django pytest -n auto --dist loadscope

# First run or after schema changes (creates fresh database)
docker compose -f test.yml run --rm django pytest -n 4 --dist loadscope --create-db
```

### Running with Coverage

```bash
# Run parallel tests with coverage
docker compose -f test.yml run --rm django pytest --cov --cov-report=xml -n 4 --dist loadscope

# Generate HTML coverage report
docker compose -f test.yml run --rm django pytest --cov --cov-report=html -n 4 --dist loadscope
```

### Running Specific Tests

```bash
# Run a specific test file
docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_analyzers.py -v

# Run a specific test class
docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_analyzers.py::TestAnalyzerClass -v

# Run a specific test method
docker compose -f test.yml run --rm django pytest opencontractserver/tests/test_analyzers.py::TestAnalyzerClass::test_method -v

# Run tests matching a pattern
docker compose -f test.yml run --rm django pytest -k "analyzer" -v
```

### Serial Test Execution

Some tests cannot run in parallel (websocket tests, async event loop tests). These are marked with `@pytest.mark.serial`:

```bash
# Run only serial tests
docker compose -f test.yml run --rm django pytest -m serial -v

# Run only parallelizable tests
docker compose -f test.yml run --rm django pytest -m "not serial" -n 4 --dist loadscope
```

## Writing Tests for Parallel Execution

When writing new tests, keep these guidelines in mind:

### Tests That Need `@pytest.mark.serial`

Mark tests as serial if they:
- Use `channels.testing.WebsocketCommunicator` (websocket tests)
- Call `agent.run_sync()` or other PydanticAI sync wrappers
- Use Django Channels async consumers
- Have complex async event loop requirements

```python
import pytest

@pytest.mark.serial
class MyWebsocketTestCase(TestCase):
    """Tests that use websocket communicators must run serially."""
    pass
```

### Tests Safe for Parallel Execution

Most tests are safe for parallel execution by default:
- Standard Django TestCase and TransactionTestCase
- GraphQL query/mutation tests
- Model tests
- API tests

The `--dist loadscope` option keeps tests from the same class together, which is important for `setUpClass`/`setUpTestData` patterns.

## Production Stack Testing

We have a dedicated test setup for validating the production Docker Compose stack, including Traefik rate limiting configuration with proper 429 response handling.

### Prerequisites

Before running production tests, you need to generate self-signed certificates for local TLS testing:

```bash
# Generate certificates (only needed once)
./contrib/generate-certs.sh
```

This creates certificates for `localhost`, `opencontracts.opensource.legal`, and other testing domains.

### Testing Rate Limiting with Production Stack

To test the production stack with rate limiting:

1. **Start the production test stack:**
   ```bash
   # Start all services (nlm-ingestor has been removed for faster startup)
   docker compose -f production.yml -f compose/test-production.yml up -d

   # Wait for services to be ready (Django takes 1-2 minutes)
   docker compose -f production.yml -f compose/test-production.yml ps
   ```

2. **Run the production rate limiting test:**
   ```bash
   # Run comprehensive rate limiting test with detailed logging
   ./scripts/test-production-rate-limiting.sh --compose-files "production.yml compose/test-production.yml"
   ```

3. **What the test validates:**
   - ✅ **TLS Configuration** - Self-signed certificates for HTTPS testing
   - ✅ **Service Connectivity** - Traefik properly routes to backend services
   - ✅ **Rate Limiting Enforcement** - Returns 429 responses when limits exceeded
   - ✅ **Frontend Limits** - 10 req/sec average, 20 burst limit
   - ✅ **API Limits** - 5 req/sec average, 10 burst limit (stricter)
   - ✅ **Detailed Logging** - Request-by-request response code logging
   - ✅ **GitHub Actions Ready** - External testing compatible with CI/CD

4. **Example test output:**
   ```
   🧪 Production Rate Limiting Test
   =============================================
   Environment: Production stack with local TLS

   === 1. Environment Check ===
   ✅ HTTPS endpoint accessible (HTTP 404)

   === 2. Frontend Rate Limiting Test ===
   Sending requests to frontend (https://localhost/):
   ✅ Request 1: 200 (Success)
   ✅ Request 2: 200 (Success)
   ...
   🚫 Request 9: 429 (RATE LIMITED)
   🚫 Request 10: 429 (RATE LIMITED)

   🎉 SUCCESS: Rate limiting is functional!
   ✅ Production environment successfully returns 429 responses
   ```

5. **Debugging and monitoring:**
   ```bash
   # Check container status
   docker compose -f production.yml -f compose/test-production.yml ps

   # View Traefik configuration logs
   docker compose -f production.yml -f compose/test-production.yml logs traefik | grep -i rate

   # Access Traefik dashboard (if available)
   curl -s http://localhost:8080/api/rawdata | jq '.middlewares'

   # Check certificate generation
   ls -la contrib/certs/
   ```

6. **Clean up:**
   ```bash
   # Stop and remove containers
   docker compose -f production.yml -f compose/test-production.yml down -v
   ```

### Configuration Details

The production test environment uses:

- **Self-signed TLS certificates** - Avoids Let's Encrypt in testing environments
- **File-based Traefik configuration** - `compose/production/traefik/working-rate-test.yml`
- **Local certificate generation** - `contrib/generate-certs.sh` for testing
- **External HTTP testing** - Compatible with GitHub Actions and CI environments
- **Removed nlm-ingestor** - Eliminated 1.21GB Docker image for faster testing
- **Detailed request logging** - Shows each HTTP response code for debugging

**Rate Limiting Configuration:**
- **Frontend**: 10 requests/second average, 20 request burst limit
- **API**: 5 requests/second average, 10 request burst limit
- **IP-based limiting**: Per-client source IP with depth=1 strategy
- **Period**: 1-second rate limiting windows
- **Response**: HTTP 429 "Too Many Requests" when exceeded

This test setup is used in GitHub Actions CI pipeline to validate that rate limiting properly returns 429 responses in production-like environments.
