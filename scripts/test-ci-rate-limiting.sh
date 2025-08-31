#!/bin/bash

# Clean CI Rate Limiting Test Script
# Focuses only on testing rate limits without extra noise

set -e

# Configuration
COMPOSE_FILES="production.yml compose/test-production-ci.yml"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --compose-files)
      COMPOSE_FILES="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--compose-files 'file1 file2']"
      exit 0
      ;;
    *)
      shift
      ;;
  esac
done

# Build compose command
COMPOSE_CMD="docker compose"
for file in $COMPOSE_FILES; do
  COMPOSE_CMD="$COMPOSE_CMD -f $file"
done

echo "============================================="
echo "🧪 Rate Limiting Test (Clean Output)"
echo "============================================="
echo ""

# Function to make HTTP request (silent version)
make_request() {
  local url="$1"
  curl -s -w "%{http_code}" "$url" -o /dev/null --connect-timeout 5 --max-time 10 2>/dev/null || echo "000"
}

# Function to test rate limiting
test_rate_limit() {
  local endpoint="$1"
  local endpoint_name="$2"
  local burst_limit="$3"
  local num_requests="$4"

  local success=0
  local rate_limited=0
  local errors=0

  echo "Testing $endpoint_name (expecting burst=$burst_limit):"
  echo -n "Progress: "

  for i in $(seq 1 $num_requests); do
    response=$(make_request "$endpoint")

    case $response in
      200|301|302|304|400|405)
        success=$((success + 1))
        echo -n "."
        ;;
      429)
        rate_limited=$((rate_limited + 1))
        echo -n "!"
        ;;
      *)
        errors=$((errors + 1))
        echo -n "x"
        ;;
    esac

    # Tiny delay to avoid overwhelming
    sleep 0.02
  done

  echo ""
  echo "Results: $success OK, $rate_limited rate-limited, $errors errors"

  if [ $rate_limited -gt 0 ]; then
    echo "✅ Rate limiting active ($rate_limited requests blocked)"
  else
    echo "⚠️  No rate limiting detected"
  fi

  echo ""
  return $rate_limited
}

# Quick health check
echo "Checking services..."
response=$(make_request "http://localhost/")
if [ "$response" == "000" ]; then
  echo "❌ Services not accessible. Ensure stack is running:"
  echo "   $COMPOSE_CMD up -d"
  exit 1
fi

if [ "$response" == "502" ] || [ "$response" == "503" ]; then
  echo "⚠️  Backend services starting... waiting 10s"
  sleep 10
fi

echo "✅ Services accessible"
echo ""

# Test Frontend Rate Limiting
test_rate_limit "http://localhost/" "Frontend" 20 30
frontend_limited=$?

# Reset period
echo "Waiting 3s for rate limit reset..."
sleep 3
echo ""

# Test API Rate Limiting
test_rate_limit "http://localhost/graphql" "API Endpoint" 10 20
api_limited=$?

# Summary
echo "============================================="
echo "📊 Summary"
echo "============================================="

total_limited=$((frontend_limited + api_limited))

if [ $total_limited -gt 0 ]; then
  echo "✅ Rate limiting is working correctly!"
  echo "   - Frontend: ${frontend_limited} requests blocked"
  echo "   - API: ${api_limited} requests blocked"
  exit 0
else
  echo "❌ Rate limiting not detected"
  echo ""
  echo "Debug: Check Traefik logs with:"
  echo "   $COMPOSE_CMD logs traefik --tail=50"
  exit 1
fi
