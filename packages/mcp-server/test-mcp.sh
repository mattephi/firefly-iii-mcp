#!/bin/bash

# Test script for MCP server
# This helps debug connection issues with Claude.ai

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  MCP Server Test Script                                       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo

# Get server URL from user or use default
read -p "Enter server URL (default: http://localhost:3000): " SERVER_URL
SERVER_URL=${SERVER_URL:-http://localhost:3000}

echo
echo -e "${YELLOW}Testing server: $SERVER_URL${NC}"
echo

# Test 1: Health check
echo -e "${YELLOW}[1/6] Testing health endpoint...${NC}"
HEALTH_RESPONSE=$(curl -s "$SERVER_URL/health")
if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
    echo -e "${GREEN}✓ Health check passed${NC}"
    echo "$HEALTH_RESPONSE" | jq . 2>/dev/null || echo "$HEALTH_RESPONSE"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo "$HEALTH_RESPONSE"
    exit 1
fi
echo

# Test 2: OAuth authorization server metadata
echo -e "${YELLOW}[2/6] Testing OAuth authorization server metadata...${NC}"
AUTH_SERVER_METADATA=$(curl -s "$SERVER_URL/.well-known/oauth-authorization-server")
if echo "$AUTH_SERVER_METADATA" | grep -q "issuer"; then
    echo -e "${GREEN}✓ OAuth metadata endpoint working${NC}"
    echo "$AUTH_SERVER_METADATA" | jq . 2>/dev/null || echo "$AUTH_SERVER_METADATA"
else
    echo -e "${RED}✗ OAuth metadata endpoint failed${NC}"
    echo "$AUTH_SERVER_METADATA"
    exit 1
fi
echo

# Test 3: OAuth protected resource metadata
echo -e "${YELLOW}[3/6] Testing OAuth protected resource metadata...${NC}"
RESOURCE_METADATA=$(curl -s "$SERVER_URL/.well-known/oauth-protected-resource")
if echo "$RESOURCE_METADATA" | grep -q "resource"; then
    echo -e "${GREEN}✓ Protected resource metadata endpoint working${NC}"
    echo "$RESOURCE_METADATA" | jq . 2>/dev/null || echo "$RESOURCE_METADATA"
else
    echo -e "${RED}✗ Protected resource metadata endpoint failed${NC}"
    echo "$RESOURCE_METADATA"
    exit 1
fi
echo

# Test 4: Register OAuth client
echo -e "${YELLOW}[4/6] Registering test OAuth client...${NC}"
REGISTER_RESPONSE=$(curl -s -X POST "$SERVER_URL/oauth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["http://localhost:8080/callback"],
    "grant_types": ["authorization_code", "refresh_token"]
  }')

CLIENT_ID=$(echo "$REGISTER_RESPONSE" | jq -r '.client_id' 2>/dev/null)
CLIENT_SECRET=$(echo "$REGISTER_RESPONSE" | jq -r '.client_secret' 2>/dev/null)

if [ -n "$CLIENT_ID" ] && [ "$CLIENT_ID" != "null" ]; then
    echo -e "${GREEN}✓ Client registered successfully${NC}"
    echo "Client ID: $CLIENT_ID"
    echo "Client Secret: $CLIENT_SECRET"
else
    echo -e "${RED}✗ Client registration failed${NC}"
    echo "$REGISTER_RESPONSE"
    exit 1
fi
echo

# Test 5: Get authorization code (manual step)
echo -e "${YELLOW}[5/6] Getting authorization code...${NC}"
echo -e "${YELLOW}Visit this URL in your browser:${NC}"
REDIRECT_URI="http://localhost:8080/callback"
AUTH_URL="$SERVER_URL/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=$REDIRECT_URI"
echo "$AUTH_URL"
echo
echo -e "${YELLOW}You will be redirected to: http://localhost:8080/callback?code=...${NC}"
echo -e "${YELLOW}Copy the 'code' parameter from the URL${NC}"
echo
read -p "Enter the authorization code: " AUTH_CODE
echo

# Test 6: Exchange code for token
echo -e "${YELLOW}[6/6] Exchanging code for access token...${NC}"
TOKEN_RESPONSE=$(curl -s -X POST "$SERVER_URL/oauth/token" \
  -H "Content-Type: application/json" \
  -d "{
    \"grant_type\": \"authorization_code\",
    \"code\": \"$AUTH_CODE\",
    \"client_id\": \"$CLIENT_ID\",
    \"redirect_uri\": \"$REDIRECT_URI\"
  }")

ACCESS_TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token' 2>/dev/null)

if [ -n "$ACCESS_TOKEN" ] && [ "$ACCESS_TOKEN" != "null" ]; then
    echo -e "${GREEN}✓ Access token obtained successfully${NC}"
    echo "Access Token: ${ACCESS_TOKEN:0:20}..."
    echo "$TOKEN_RESPONSE" | jq . 2>/dev/null || echo "$TOKEN_RESPONSE"
else
    echo -e "${RED}✗ Token exchange failed${NC}"
    echo "$TOKEN_RESPONSE"
    exit 1
fi
echo

# Test 7: Call MCP initialize endpoint
echo -e "${YELLOW}[BONUS] Testing MCP initialize endpoint...${NC}"
MCP_RESPONSE=$(curl -s -X POST "$SERVER_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-script",
        "version": "1.0"
      }
    }
  }')

if echo "$MCP_RESPONSE" | grep -q "serverInfo"; then
    echo -e "${GREEN}✓ MCP initialize successful!${NC}"
    echo "$MCP_RESPONSE" | jq . 2>/dev/null || echo "$MCP_RESPONSE"
else
    echo -e "${RED}✗ MCP initialize failed${NC}"
    echo "$MCP_RESPONSE"
    exit 1
fi
echo

# Test 8: Call MCP tools/list endpoint
echo -e "${YELLOW}[BONUS] Testing MCP tools/list endpoint...${NC}"
TOOLS_RESPONSE=$(curl -s -X POST "$SERVER_URL/mcp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }')

if echo "$TOOLS_RESPONSE" | grep -q "tools"; then
    echo -e "${GREEN}✓ MCP tools/list successful!${NC}"
    TOOL_COUNT=$(echo "$TOOLS_RESPONSE" | jq '.result.tools | length' 2>/dev/null)
    echo "Available tools: $TOOL_COUNT"
    echo "$TOOLS_RESPONSE" | jq '.result.tools[0:3]' 2>/dev/null || echo "$TOOLS_RESPONSE"
else
    echo -e "${RED}✗ MCP tools/list failed${NC}"
    echo "$TOOLS_RESPONSE"
    exit 1
fi
echo

echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  All tests passed! MCP server is working correctly!           ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${YELLOW}If Claude.ai still shows 'disconnected', check the server logs for:${NC}"
echo -e "${YELLOW}  - MCP initialize requests from Claude${NC}"
echo -e "${YELLOW}  - Authentication errors${NC}"
echo -e "${YELLOW}  - CORS issues${NC}"
