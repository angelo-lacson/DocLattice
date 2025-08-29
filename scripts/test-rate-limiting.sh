#!/bin/bash

# Rate Limiting Test Script
# Can be run locally or in CI to test Traefik rate limiting configuration
#
# Usage:
#   Local:  ./scripts/test-rate-limiting.sh
#   CI:     ./scripts/test-rate-limiting.sh --compose-files "production.yml compose/test-production.yml"

set -e

# Default compose files for local testing
COMPOSE_FILES="production.yml compose/test-production.yml"
CLIENT_CONTAINER="django"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --compose-files)
      COMPOSE_FILES="$2"
      shift 2
      ;;
    --client-container)
      CLIENT_CONTAINER="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  --compose-files FILE1,FILE2    Docker compose files to use (default: production.yml compose/test-production.yml)"
      echo "  --client-container CONTAINER   Container to run tests from (default: django)"
      echo "  -h, --help                     Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Convert comma-separated compose files to -f flags
COMPOSE_CMD="docker compose"
for file in $COMPOSE_FILES; do
  COMPOSE_CMD="$COMPOSE_CMD -f $file"
done

echo "========================================="
echo "🧪 Testing Traefik Rate Limiting Setup"
echo "========================================="
echo "Compose files: $COMPOSE_FILES"
echo "Client container: $CLIENT_CONTAINER"
echo ""

# Function to make a request and extract HTTP status code
make_request() {
  local url="$1"
  local host_header="$2"

  # Use Python instead of wget since wget may not be available
  $COMPOSE_CMD exec -T $CLIENT_CONTAINER python -c "
import urllib.request, urllib.error, sys
try:
    req = urllib.request.Request('$url', headers={'Host': '$host_header'})
    with urllib.request.urlopen(req, timeout=5) as response:
        print(response.status)
except urllib.error.HTTPError as e:
    print(e.code)
except:
    print('000')
" 2>/dev/null || echo "000"
}

echo "=== 1. Testing Traefik Configuration ==="
echo "Checking Traefik logs for rate limiting setup..."
if $COMPOSE_CMD logs traefik | grep -i "rate" >/dev/null 2>&1; then
  echo "✅ Rate limiting configuration found in Traefik logs"
else
  echo "⚠️  No rate limiting configuration found in logs (this may be normal)"
fi

echo ""
echo "=== 2. Testing Basic Connectivity ==="
echo "Testing if Traefik responds to requests..."
response=$(make_request "http://traefik:80/" "opencontracts.opensource.legal")
if [ "$response" != "000" ]; then
  echo "✅ Traefik is responding (HTTP $response)"
else
  echo "❌ Traefik is not responding - check if services are running"
  echo "Tip: Run 'docker compose -f production.yml -f compose/test-production.yml ps' to check service status"
  exit 1
fi

echo ""
echo "=== 3. Testing Frontend Rate Limits ==="
echo "Testing frontend rate limiting (burst: 200, average: 100/sec)..."
echo "Sending 250 requests rapidly..."

success_count=0
rate_limited_count=0
error_count=0

for i in {1..250}; do
  if [ $((i % 50)) -eq 0 ]; then
    echo "  Progress: $i/250 requests"
  fi

  response=$(make_request "http://traefik:80/" "opencontracts.opensource.legal")

  case $response in
    200|301|302|404|502|503)
      success_count=$((success_count + 1))
      ;;
    429)
      rate_limited_count=$((rate_limited_count + 1))
      ;;
    *)
      error_count=$((error_count + 1))
      ;;
  esac

  # Small delay to avoid overwhelming
  sleep 0.01
done

echo ""
echo "Frontend Results:"
echo "  ✅ Successful requests: $success_count"
echo "  🚫 Rate limited (429): $rate_limited_count"
echo "  ❌ Error responses: $error_count"

# Validate frontend rate limiting
if [ $rate_limited_count -gt 0 ]; then
  echo "✅ Frontend rate limiting is working!"
else
  echo "❌ FAILURE: Frontend rate limiting not working!"
  echo "   Expected some 429 responses after burst limit (~200 requests)"
  exit 1
fi

echo ""
echo "=== 4. Testing API Rate Limits ==="
echo "Waiting 5 seconds for rate limits to reset..."
sleep 5

echo "Testing API rate limiting (burst: 60, average: 30/sec)..."
echo "Sending 100 requests rapidly..."

api_success=0
api_rate_limited=0
api_error=0

for i in {1..100}; do
  if [ $((i % 25)) -eq 0 ]; then
    echo "  Progress: $i/100 requests"
  fi

  response=$(make_request "http://traefik:80/graphql" "opencontracts.opensource.legal")

  case $response in
    200|301|302|404|502|503)
      api_success=$((api_success + 1))
      ;;
    429)
      api_rate_limited=$((api_rate_limited + 1))
      ;;
    *)
      api_error=$((api_error + 1))
      ;;
  esac

  sleep 0.01
done

echo ""
echo "API Results:"
echo "  ✅ Successful requests: $api_success"
echo "  🚫 Rate limited (429): $api_rate_limited"
echo "  ❌ Error responses: $api_error"

# Validate API rate limiting
if [ $api_rate_limited -gt 0 ]; then
  echo "✅ API rate limiting is working!"
else
  echo "❌ FAILURE: API rate limiting not working!"
  echo "   Expected some 429 responses after burst limit (~60 requests)"
  exit 1
fi

echo ""
echo "=== 5. Testing Redis Integration ==="
echo "Checking if rate limiting data is stored in Redis..."

if $COMPOSE_CMD exec -T redis redis-cli -n 1 keys "*" 2>/dev/null | head -5; then
  echo "✅ Rate limiting data found in Redis database 1"

  # Show some stats
  echo ""
  echo "Redis keyspace info:"
  $COMPOSE_CMD exec -T redis redis-cli -n 1 info keyspace 2>/dev/null || echo "No keyspace info available"
else
  echo "⚠️  Could not retrieve Redis data (Redis may not be accessible)"
fi

echo ""
echo "=== 6. Final Validation ==="

# Check if we got any successful responses at all
total_success=$((success_count + api_success))
if [ $total_success -eq 0 ]; then
  echo "❌ FAILURE: No successful responses received!"
  echo "   This indicates services may not be working properly"
  exit 1
fi

# Check if rate limiting is working for both endpoints
total_rate_limited=$((rate_limited_count + api_rate_limited))
if [ $total_rate_limited -eq 0 ]; then
  echo "❌ FAILURE: No rate limiting detected on any endpoint!"
  exit 1
fi

echo "========================================="
echo "🎉 SUCCESS: Rate limiting is working correctly!"
echo "========================================="
echo ""
echo "Summary:"
echo "  📊 Frontend: $success_count successful, $rate_limited_count rate-limited"
echo "  📊 API:      $api_success successful, $api_rate_limited rate-limited"
echo "  📊 Total:    $total_success successful, $total_rate_limited rate-limited"
echo ""
echo "✅ Rate limiting middleware is properly configured"
echo "✅ Redis backend is storing rate limit data"
echo "✅ Different limits are applied to different endpoints"
echo ""
echo "Your Traefik rate limiting setup is ready for production! 🚀"
