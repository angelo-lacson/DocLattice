#!/bin/bash
# Test script for corpus-scoped MCP endpoints
# Usage: ./test_mcp_scoped.sh [corpus_slug]

set -e

CORPUS_SLUG="${1:-test-mcp-corpus}"
BASE_URL="http://localhost:8000"
HEADERS='-H "Content-Type: application/json" -H "Accept: application/json, text/event-stream"'

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  MCP Corpus-Scoped Endpoint Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to make MCP request and format output
mcp_request() {
    local endpoint="$1"
    local method="$2"
    local params="$3"
    local description="$4"

    echo -e "${YELLOW}>>> ${description}${NC}"
    echo -e "${GREEN}Endpoint:${NC} ${endpoint}"
    echo -e "${GREEN}Method:${NC} ${method}"
    if [ -n "$params" ]; then
        echo -e "${GREEN}Params:${NC} ${params}"
    fi
    echo ""

    local data
    if [ -n "$params" ]; then
        data="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}"
    else
        data="{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\"}"
    fi

    response=$(curl -s -X POST "${endpoint}" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json, text/event-stream" \
        -d "${data}" 2>&1)

    # Extract JSON from SSE response if present
    if [[ "$response" == event:* ]]; then
        response=$(echo "$response" | grep "^data:" | sed 's/^data: //')
    fi

    echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
    echo ""
    echo -e "${BLUE}----------------------------------------${NC}"
    echo ""
}

# Test 1: Global endpoint - list tools
echo -e "${GREEN}[1/6] Testing Global MCP Endpoint${NC}"
mcp_request "${BASE_URL}/mcp/" "tools/list" "" "List available tools (global)"

# Test 2: Global endpoint - list public corpuses
echo -e "${GREEN}[2/6] List Public Corpuses (global)${NC}"
mcp_request "${BASE_URL}/mcp/" "tools/call" '{"name":"list_public_corpuses","arguments":{}}' "List all public corpuses"

# Test 3: Scoped endpoint - list tools (notice no corpus_slug required)
echo -e "${GREEN}[3/6] Testing Scoped MCP Endpoint: /mcp/corpus/${CORPUS_SLUG}/${NC}"
mcp_request "${BASE_URL}/mcp/corpus/${CORPUS_SLUG}/" "tools/list" "" "List available tools (scoped to ${CORPUS_SLUG})"

# Test 4: Scoped endpoint - get corpus info
echo -e "${GREEN}[4/6] Get Corpus Info (scoped)${NC}"
mcp_request "${BASE_URL}/mcp/corpus/${CORPUS_SLUG}/" "tools/call" '{"name":"get_corpus_info","arguments":{}}' "Get detailed corpus information"

# Test 5: Scoped endpoint - list documents (no corpus_slug needed!)
echo -e "${GREEN}[5/6] List Documents (scoped, no corpus_slug parameter needed)${NC}"
mcp_request "${BASE_URL}/mcp/corpus/${CORPUS_SLUG}/" "tools/call" '{"name":"list_documents","arguments":{}}' "List documents in corpus"

# Test 6: Error case - nonexistent corpus
echo -e "${GREEN}[6/6] Error Case: Nonexistent Corpus${NC}"
echo -e "${YELLOW}>>> Testing 404 response for nonexistent corpus${NC}"
echo -e "${GREEN}Endpoint:${NC} ${BASE_URL}/mcp/corpus/nonexistent-corpus/"
echo ""
curl -s "${BASE_URL}/mcp/corpus/nonexistent-corpus/" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -X POST \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | python3 -m json.tool 2>/dev/null || echo "$response"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}All tests completed!${NC}"
echo ""
echo -e "${YELLOW}Key observations:${NC}"
echo "1. Global endpoint requires corpus_slug in tool calls"
echo "2. Scoped endpoint auto-injects corpus_slug - simpler API"
echo "3. Scoped endpoint has get_corpus_info instead of list_public_corpuses"
echo "4. Invalid/nonexistent slugs return helpful 404 errors"
echo ""
echo -e "${YELLOW}To use the MCP Inspector GUI:${NC}"
echo "  npx @anthropic/inspector --url ${BASE_URL}/mcp/corpus/${CORPUS_SLUG}/"
echo ""
