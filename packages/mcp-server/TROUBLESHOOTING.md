# Troubleshooting Claude.ai Connection Issues

This guide helps debug connection issues between Claude.ai and your MCP server.

## Common Issue: "Connected" then immediately "Disconnected"

### Symptoms
- OAuth flow completes successfully
- Client registers and token is issued
- Claude.ai shows "Connected" briefly
- Then immediately shows "Disconnected"

### Root Causes

This usually means the MCP **initialize** handshake is failing. Here are the common reasons:

#### 1. Firefly III Connection Failing

**Problem:** The server tries to test the Firefly III connection during initialization and fails.

**Solution:** Check your Firefly III configuration:

```bash
# Test manually
curl -H "Authorization: Bearer YOUR_PAT" https://your-firefly-url.com/api/v1/about

# Check server logs
docker-compose logs -f mcp-server
# or
journalctl -u firefly-mcp -f
```

**Fix:** Ensure your `.env` file has correct values:
```env
FIREFLY_BASE_URL=https://firefly.example.com  # No trailing slash
FIREFLY_ACCESS_TOKEN=your_actual_token_here
```

#### 2. Wrong MCP Protocol Version

**Problem:** Claude expects a specific protocol version.

**Solution:** The server now uses `2024-11-05`. Check logs to see what Claude requests:

```
[MCP] Protocol version requested: 2024-11-05
```

#### 3. Invalid Initialize Response Format

**Problem:** The initialize response doesn't match Claude's expectations.

**Current Format (Correct):**
```json
{
  "protocolVersion": "2024-11-05",
  "capabilities": {
    "tools": {}
  },
  "serverInfo": {
    "name": "firefly-iii-mcp-server",
    "version": "2.0.0"
  }
}
```

#### 4. CORS or Network Issues

**Problem:** Browser/network blocking requests.

**Solution:** Check CORS headers in server logs and ensure Caddy is properly configured.

---

## Debugging Steps

### Step 1: Enable Debug Logging

Update your `.env`:
```env
LOG_LEVEL=debug
```

Restart the server:
```bash
docker-compose restart mcp-server
# or
sudo systemctl restart firefly-mcp
```

### Step 2: Watch Server Logs

```bash
# Docker
docker-compose logs -f mcp-server

# Systemd
journalctl -u firefly-mcp -f
```

### Step 3: Attempt Connection from Claude.ai

Go through the OAuth flow and watch the logs. You should see:

```
[OAuth] ========================================
[OAuth] CLIENT REGISTRATION REQUEST
...
[OAuth] ✓ Client registered successfully

[OAuth] ========================================
[OAuth] AUTHORIZATION REQUEST
...
[OAuth] ✓ Authorization code generated

[OAuth] ========================================
[OAuth] TOKEN REQUEST
...
[OAuth] ✓ Token issued successfully

[Server] ========================================
[Server] MCP REQUEST RECEIVED
[MCP] Received request - Method: initialize
[MCP] INITIALIZE REQUEST
[MCP] Client: Claude
...
[MCP] ✓ Firefly III connection successful
[MCP] Sending initialize response
```

### Step 4: Identify the Issue

#### If OAuth fails:
- Check client registration logs
- Verify redirect URIs
- Check PKCE challenge/verifier

#### If authentication fails:
```
[Auth] Token validation failed - token is invalid or expired
```
- Token might have expired
- Try reconnecting from Claude.ai

#### If initialize fails:
```
[MCP] ⚠ Firefly III connection test failed
```
- Fix Firefly III configuration
- Check PAT validity
- Verify network connectivity

#### If response is wrong:
Check the actual response in logs and compare with expected format.

---

## Quick Diagnostic Commands

### Test OAuth Discovery

```bash
# Should return OAuth server metadata
curl https://your-domain.com/.well-known/oauth-authorization-server

# Should return protected resource metadata
curl https://your-domain.com/.well-known/oauth-protected-resource
```

### Test Health Endpoint

```bash
curl https://your-domain.com/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Test Firefly Connection

```bash
# From your server
curl -H "Authorization: Bearer YOUR_PAT" \
  https://your-firefly-url.com/api/v1/about
```

### Manual OAuth Flow

1. **Register a client:**
```bash
curl -X POST https://your-domain.com/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "redirect_uris": ["http://localhost:8080/callback"],
    "grant_types": ["authorization_code", "refresh_token"]
  }'
```

2. **Get authorization code:**
Visit in browser:
```
https://your-domain.com/oauth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=http://localhost:8080/callback&code_challenge=CHALLENGE&code_challenge_method=S256
```

3. **Exchange for token:**
```bash
curl -X POST https://your-domain.com/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "AUTH_CODE",
    "client_id": "CLIENT_ID",
    "code_verifier": "VERIFIER"
  }'
```

4. **Test MCP initialize:**
```bash
curl -X POST https://your-domain.com/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test",
        "version": "1.0"
      }
    }
  }'
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "firefly-iii-mcp-server",
      "version": "2.0.0"
    }
  }
}
```

---

## Common Error Messages

### `Failed to connect to Firefly III`
- **Cause:** Firefly III is unreachable or PAT is invalid
- **Fix:** Verify `FIREFLY_BASE_URL` and `FIREFLY_ACCESS_TOKEN`

### `Token is invalid or expired`
- **Cause:** OAuth token has expired or been revoked
- **Fix:** Disconnect and reconnect from Claude.ai

### `Missing or invalid Authorization header`
- **Cause:** Claude.ai didn't send Bearer token
- **Fix:** Check OAuth flow completed successfully

### `Method not found: initialize`
- **Cause:** Request routing issue
- **Fix:** Check server logs, verify `/mcp` endpoint is accessible

---

## Still Not Working?

### Collect Full Diagnostic Info

1. **Server logs during connection attempt:**
```bash
docker-compose logs --tail=200 mcp-server > debug.log
```

2. **Configuration (redact sensitive data):**
```bash
echo "PUBLIC_URL: $PUBLIC_URL"
echo "FIREFLY_BASE_URL: $FIREFLY_BASE_URL"
echo "FIREFLY_ACCESS_TOKEN: ${FIREFLY_ACCESS_TOKEN:0:10}..."
```

3. **Network connectivity:**
```bash
# From server to Firefly
curl -I https://your-firefly-url.com

# From internet to server
curl -I https://your-domain.com/health
```

4. **Browser console:**
- Open browser DevTools (F12)
- Go to Network tab
- Try connecting from Claude.ai
- Check for failed requests

### Create a GitHub Issue

Include:
- Server logs (redacted)
- Network traces
- Error messages
- Configuration (redacted)

---

## Workarounds

### Disable Firefly Connection Test

If Firefly III is causing issues but you want to test the connection:

Edit `src/mcp-handler.ts` and make the connection test non-blocking (already done in latest version).

### Extend Token Lifetime

If tokens are expiring too quickly:

Update `.env`:
```env
OAUTH_TOKEN_EXPIRATION=7200  # 2 hours instead of 1
OAUTH_REFRESH_TOKEN_EXPIRATION=172800  # 2 days instead of 1
```

---

## Success Indicators

When everything works, you should see:

1. **OAuth flow completes:**
   - ✓ Client registered
   - ✓ Authorization code generated
   - ✓ Token issued

2. **MCP initialize succeeds:**
   - ✓ Token validated
   - ✓ Firefly connection successful (or warning if disabled)
   - ✓ Initialize response sent

3. **Tools available:**
   - Claude can list and call tools
   - Tools return data from Firefly III

4. **Connection persists:**
   - Claude shows "Connected"
   - Connection doesn't drop
   - Can make multiple tool calls

---

## Prevention

### Use Health Checks

Monitor your server:
```bash
*/5 * * * * curl -f https://your-domain.com/health || systemctl restart firefly-mcp
```

### Keep Tokens Fresh

Claude.ai should automatically refresh tokens, but monitor logs for refresh requests.

### Update Regularly

Pull latest changes:
```bash
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

---

## Getting Help

If you've followed all steps and it still doesn't work:

1. Collect diagnostic info (see above)
2. Check GitHub issues
3. Open a new issue with full details
4. Join community discussions

Remember: **The logs are your friend!** They will show exactly what's failing.
