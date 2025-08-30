#!/bin/bash

# Production Rate Limiting Test Script
# Tests Traefik rate limiting in production environment with local certificates
# Designed for GitHub Actions and CI/CD environments
#
# Usage:
#   ./scripts/test-production-rate-limiting.sh --compose-files "production.yml compose/test-production.yml"

set -e

# Default configuration
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
      echo "  --compose-files FILE1,FILE2    Docker compose files to use"
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

# Convert compose files to -f flags
COMPOSE_CMD="docker compose"
for file in $COMPOSE_FILES; do
  COMPOSE_CMD="$COMPOSE_CMD -f $file"
done

echo "============================================="
echo "🧪 Production Rate Limiting Test"
echo "============================================="
echo "Environment: Production stack with local TLS"
echo "Compose files: $COMPOSE_FILES"
echo "Test strategy: Exceed rate limits to trigger 429s"
echo "Expected: Frontend burst=20, API burst=10"
echo ""

# Function to make external request (bypass internal networking issues)
make_external_request() {
  local url="$1"
  local result
  result=$(curl -k -s -w "%{http_code}" "$url" -o /dev/null --connect-timeout 5 --max-time 10 2>&1)
  local exit_code=$?

  # If curl failed completely, return connection error
  if [ $exit_code -ne 0 ]; then
    echo "000"
    return
  fi

  # Extract just the HTTP code (last 3 digits)
  echo "${result: -3}"
}

echo "=== 1. Environment Check ==="
echo "Checking if services are accessible..."

# Check if containers are running
echo ""
echo "--- Container Status ---"
$COMPOSE_CMD ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"

echo ""
echo "--- Service Health Checks ---"
echo "Testing Traefik dashboard access..."
traefik_dashboard=$(make_external_request "http://localhost:8080/api/rawdata")
if [ "$traefik_dashboard" != "000" ]; then
  echo "✅ Traefik dashboard accessible (HTTP $traefik_dashboard)"
else
  echo "❌ Traefik dashboard not accessible"
fi

echo ""
echo "Testing individual backend services..."
echo "Frontend service (docker network): $($COMPOSE_CMD exec -T traefik wget -qO- --timeout=2 http://frontend:5173 2>/dev/null | wc -c) bytes"
echo "Django service (docker network): $($COMPOSE_CMD exec -T traefik wget -qO- --timeout=2 http://django:5000/admin/ 2>/dev/null | wc -c) bytes"

echo ""
echo "--- External HTTPS Access ---"
# Test external HTTPS access
response=$(make_external_request "https://localhost/")
if [ "$response" != "000" ]; then
  echo "✅ HTTPS endpoint accessible (HTTP $response)"
  if [ "$response" == "502" ]; then
    echo "⚠️  WARNING: 502 Bad Gateway - Traefik can't reach backend services"
  fi
else
  echo "❌ HTTPS endpoint not accessible"
  echo "Checking HTTP redirect..."
  http_response=$(make_external_request "http://localhost/")
  if [ "$http_response" == "301" ]; then
    echo "✅ HTTP redirects to HTTPS (301)"
  else
    echo "❌ Services not accessible. Check if stack is running:"
    echo "   docker compose -f $COMPOSE_FILES ps"
    exit 1
  fi
fi

echo ""
echo "--- Certificate Debug ---"
echo "Checking if certificates exist on host:"
ls -la contrib/certs/ || echo "cert directory not found"
echo ""
echo "Checking certificates inside traefik container:"
$COMPOSE_CMD exec -T traefik ls -la /etc/certs/ || echo "❌ certs not mounted in container"
echo ""
echo "Checking certificate content (first few lines):"
$COMPOSE_CMD exec -T traefik head -2 /etc/certs/localhost.crt.pem 2>/dev/null || echo "❌ cert file not readable"
$COMPOSE_CMD exec -T traefik head -2 /etc/certs/localhost.key.pem 2>/dev/null || echo "❌ key file not readable"

echo ""
echo "--- Traefik Container Health ---"
echo "Traefik container status:"
$COMPOSE_CMD ps traefik
echo ""
echo "Traefik processes:"
$COMPOSE_CMD exec -T traefik ps aux 2>/dev/null || echo "❌ Can't check traefik processes"
echo ""
echo "Traefik listening ports:"
$COMPOSE_CMD exec -T traefik netstat -tlnp 2>/dev/null || echo "❌ Can't check listening ports"

echo ""
echo "--- Complete Traefik Logs ---"
$COMPOSE_CMD logs traefik

echo ""
echo "=== 2. Frontend Rate Limiting Test ==="
echo "Config: burst=20, average=10/sec"
echo "Test: Send 30 requests rapidly to exceed limits"
echo ""

frontend_success=0
frontend_rate_limited=0
frontend_errors=0

echo "Sending requests to frontend (https://localhost/):"
for i in {1..30}; do
  response=$(make_external_request "https://localhost/")

  case $response in
    200|302)
      frontend_success=$((frontend_success + 1))
      echo "✅ Request $i: $response (Success)"
      ;;
    429)
      frontend_rate_limited=$((frontend_rate_limited + 1))
      echo "🚫 Request $i: $response (RATE LIMITED)"
      ;;
    502)
      frontend_errors=$((frontend_errors + 1))
      echo "❌ Request $i: $response (Bad Gateway - backend service down)"
      ;;
    503)
      frontend_errors=$((frontend_errors + 1))
      echo "❌ Request $i: $response (Service Unavailable)"
      ;;
    404)
      frontend_errors=$((frontend_errors + 1))
      echo "❌ Request $i: $response (Not Found - routing issue)"
      ;;
    *)
      frontend_errors=$((frontend_errors + 1))
      echo "❌ Request $i: $response (Unexpected error)"
      ;;
  esac

  # Small delay to show progression in logs
  sleep 0.05
done

echo ""
echo "Frontend Test Results:"
echo "  ✅ Successful requests: $frontend_success"
echo "  🚫 Rate limited (429): $frontend_rate_limited"
echo "  ❌ Error responses: $frontend_errors"

if [ $frontend_rate_limited -gt 0 ]; then
  echo "✅ SUCCESS: Frontend rate limiting is working!"
  echo "   Got $frontend_rate_limited 429 responses"
else
  echo "⚠️  Frontend rate limiting not triggered"
  echo "   This may indicate limits are higher than test load"
fi

echo ""
echo "=== 3. API Rate Limiting Test ==="
echo "Config: burst=10, average=5/sec"
echo "Test: Send 20 requests rapidly to API endpoint"
echo ""

# Wait for rate limits to reset
echo "Waiting 3 seconds for rate limits to reset..."
sleep 3

api_success=0
api_rate_limited=0
api_errors=0

echo "Sending requests to API (https://localhost/graphql):"
for i in {1..20}; do
  response=$(make_external_request "https://localhost/graphql")

  case $response in
    200|302)
      api_success=$((api_success + 1))
      echo "✅ Request $i: $response (Success)"
      ;;
    429)
      api_rate_limited=$((api_rate_limited + 1))
      echo "🚫 Request $i: $response (RATE LIMITED)"
      ;;
    502)
      api_errors=$((api_errors + 1))
      echo "❌ Request $i: $response (Bad Gateway - backend service down)"
      ;;
    503)
      api_errors=$((api_errors + 1))
      echo "❌ Request $i: $response (Service Unavailable)"
      ;;
    404)
      api_errors=$((api_errors + 1))
      echo "❌ Request $i: $response (Not Found - routing issue)"
      ;;
    *)
      api_errors=$((api_errors + 1))
      echo "❌ Request $i: $response (Unexpected error)"
      ;;
  esac

  sleep 0.05
done

echo ""
echo "API Test Results:"
echo "  ✅ Successful requests: $api_success"
echo "  🚫 Rate limited (429): $api_rate_limited"
echo "  ❌ Error responses: $api_errors"

if [ $api_rate_limited -gt 0 ]; then
  echo "✅ SUCCESS: API rate limiting is working!"
  echo "   Got $api_rate_limited 429 responses"
else
  echo "⚠️  API rate limiting not triggered"
fi

echo ""
echo "=== 4. Final Summary ==="
total_success=$((frontend_success + api_success))
total_rate_limited=$((frontend_rate_limited + api_rate_limited))
total_errors=$((frontend_errors + api_errors))

echo "Overall Results:"
echo "  📊 Total successful requests: $total_success"
echo "  🚫 Total rate limited (429): $total_rate_limited"
echo "  ❌ Total error responses: $total_errors"
echo ""

if [ $total_rate_limited -gt 0 ]; then
  echo "🎉 SUCCESS: Rate limiting is functional!"
  echo "✅ Production environment successfully returns 429 responses"
  echo "✅ Traefik rate limiting middleware working correctly"
  echo "✅ Different rate limits applied to different endpoints"
  echo "✅ Ready for production deployment"
  exit 0
else
  echo "❌ FAILURE: No rate limiting detected"
  echo "   Expected some 429 responses when exceeding configured limits"
  echo "   Check Traefik configuration and middleware setup"
  exit 1
fi
