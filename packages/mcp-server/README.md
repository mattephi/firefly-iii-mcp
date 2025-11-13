# Firefly III MCP Server (v2.0)

A completely fresh implementation of an MCP (Model Context Protocol) server for Firefly III, built from scratch with full support for **Claude.ai Custom Connectors**.

## ✨ Features

- **✅ Full MCP Protocol Compliance** - Implements MCP 2024-11-05 specification
- **✅ OAuth 2.1 Support** - Complete OAuth implementation with PKCE for Claude.ai
- **✅ Caddy Proxy Ready** - Works seamlessly behind reverse proxies
- **✅ Security Hardened** - Helmet, CORS, rate limiting, secure headers
- **✅ Firefly III Integration** - Full API support for personal finance management
- **✅ Dynamic Client Registration** - RFC 7591 compliant
- **✅ Production Ready** - TypeScript, error handling, logging

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun
- A running Firefly III instance
- A Firefly III Personal Access Token (PAT)
- A public domain with HTTPS (for Claude.ai)

### Installation

```bash
cd packages/mcp-server
npm install
npm run build
```

### Configuration

Create a `.env` file:

```env
# Server Configuration
PORT=3000
PUBLIC_URL=https://mcp.yourdomain.com
NODE_ENV=production

# Firefly III Configuration
FIREFLY_BASE_URL=https://firefly.yourdomain.com
FIREFLY_ACCESS_TOKEN=your_firefly_pat_here

# OAuth Configuration
OAUTH_ISSUER=https://mcp.yourdomain.com/oauth
OAUTH_TOKEN_EXPIRATION=3600
OAUTH_REFRESH_TOKEN_EXPIRATION=86400

# Reverse Proxy
TRUST_PROXY=true

# Logging
LOG_LEVEL=info
```

### Running

```bash
npm start
```

Or with Bun:

```bash
bun run src/index.ts
```

### Startup Validation

The server automatically validates your Firefly III connection on startup. You'll see:

**✅ Success:**
```
╔════════════════════════════════════════════════════════════════╗
║  Testing Firefly III Connection...                            ║
╚════════════════════════════════════════════════════════════════╝

[Startup] Firefly III URL: https://firefly.example.com
[Startup] PAT Token: eyJ0eXAiOi...
[Startup] Attempting connection to Firefly III...

✅ FIREFLY III CONNECTION SUCCESSFUL ✅
═══════════════════════════════════════════════════════════════
Firefly III Version: 6.1.0
API Version: 2.0.0
OS: Linux
PHP Version: 8.2.0
═══════════════════════════════════════════════════════════════
```

**❌ Failure (Invalid PAT):**
```
❌ FIREFLY III CONNECTION FAILED ❌
═══════════════════════════════════════════════════════════════
Status: 401 Unauthorized

🔑 Authentication Error:
  - Your PAT token is invalid or expired
  - Get a new token from Firefly III:
    Options > Profile > OAuth > Personal Access Tokens

⚠️  Server will start, but MCP tools will not work!
```

**❌ Failure (Wrong URL):**
```
❌ FIREFLY III CONNECTION FAILED ❌
═══════════════════════════════════════════════════════════════
Error: getaddrinfo ENOTFOUND firefly.example.com

🌐 Network Error:
  - Cannot reach Firefly III server
  - Check FIREFLY_BASE_URL in your .env file
  - Ensure Firefly III is running and accessible

⚠️  Server will start, but MCP tools will not work!
```

This validation happens **before** the server starts accepting connections, so you'll know immediately if there's a configuration issue.

## 🔐 OAuth 2.1 Flow for Claude.ai

This server implements a complete OAuth 2.1 flow specifically designed for Claude.ai Custom Connectors:

### 1. Well-Known Endpoints

The server automatically exposes discovery endpoints:

- `/.well-known/oauth-authorization-server` - Authorization server metadata
- `/.well-known/oauth-protected-resource` - Protected resource metadata

### 2. OAuth Endpoints

- `POST /oauth/register` - Dynamic client registration
- `GET /oauth/authorize` - Authorization endpoint (with PKCE)
- `POST /oauth/token` - Token exchange endpoint
- `POST /oauth/revoke` - Token revocation endpoint

### 3. MCP Endpoint

- `POST /mcp` - Protected MCP endpoint (requires Bearer token)

## 🌐 Setting Up with Caddy

Create a `Caddyfile`:

```caddyfile
mcp.yourdomain.com {
    reverse_proxy localhost:3000

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer-when-downgrade"
    }

    # Enable compression
    encode gzip

    # Access logging
    log {
        output file /var/log/caddy/mcp-access.log
    }
}
```

Start Caddy:

```bash
caddy run --config Caddyfile
```

## 📝 Connecting to Claude.ai

1. Go to Claude.ai Custom Connectors settings
2. Click "Add Custom Connector"
3. Enter your server details:
   - **Name**: Firefly III
   - **Base URL**: `https://mcp.yourdomain.com`
   - **Authentication**: OAuth 2.0
   - **Authorization URL**: Auto-discovered via `.well-known`
4. Claude will automatically register as an OAuth client
5. Authorize the connection
6. Start using Firefly III tools in Claude!

## 🛠️ Available MCP Tools

The server provides the following tools:

### Account Management
- `firefly_get_accounts` - List all accounts
- `firefly_get_account` - Get account details
- `firefly_create_account` - Create new account
- `firefly_update_account` - Update account
- `firefly_delete_account` - Delete account

### Transaction Management
- `firefly_get_transactions` - List transactions
- `firefly_get_transaction` - Get transaction details
- `firefly_create_transaction` - Create transaction
- `firefly_update_transaction` - Update transaction
- `firefly_delete_transaction` - Delete transaction

### Financial Data
- `firefly_get_budgets` - List budgets
- `firefly_get_categories` - List categories
- `firefly_get_bills` - List bills
- `firefly_get_tags` - List tags
- `firefly_get_summary` - Get financial summary

### Search
- `firefly_search` - Search transactions

## 🔧 Development

### Build

```bash
npm run build
```

### Clean

```bash
npm run clean
```

### Development Mode

```bash
npm run dev
```

## 📊 Architecture

```
┌─────────────┐
│  Claude.ai  │
└──────┬──────┘
       │ OAuth 2.1 + MCP
       │
┌──────▼──────┐
│    Caddy    │ (HTTPS, reverse proxy)
└──────┬──────┘
       │
┌──────▼──────────────────┐
│   MCP Server (Express)  │
│  ┌──────────────────┐   │
│  │ OAuth Provider   │   │
│  ├──────────────────┤   │
│  │ MCP Handler      │   │
│  ├──────────────────┤   │
│  │ Firefly Client   │   │
│  └──────────────────┘   │
└──────┬──────────────────┘
       │
┌──────▼──────┐
│ Firefly III │
└─────────────┘
```

## 🔒 Security Features

- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **OAuth 2.1** - Modern OAuth with PKCE
- **Bearer Tokens** - Secure API authentication
- **HTTPS Ready** - Works with reverse proxies
- **Rate Limiting Ready** - Can be added via middleware
- **Input Validation** - All tool inputs validated

## 📖 API Reference

### Initialize Connection

```json
POST /mcp
Authorization: Bearer <token>

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "Claude",
      "version": "1.0"
    }
  }
}
```

### List Tools

```json
POST /mcp
Authorization: Bearer <token>

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

### Call Tool

```json
POST /mcp
Authorization: Bearer <token>

{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "firefly_get_accounts",
    "arguments": {
      "type": "asset"
    }
  }
}
```

## 🐛 Troubleshooting

### Connection Issues

1. Verify Firefly III is accessible
2. Check your Personal Access Token
3. Ensure PUBLIC_URL is correct
4. Verify Caddy is running and configured

### OAuth Issues

1. Check `.well-known` endpoints are accessible
2. Verify redirect URIs match
3. Check CORS headers
4. Review server logs

### MCP Issues

1. Verify Bearer token is valid
2. Check tool names and arguments
3. Review Firefly III API responses
4. Enable debug logging: `LOG_LEVEL=debug`

## 📄 License

MIT

## 🤝 Contributing

This is a fresh implementation built for reliability and Claude.ai compatibility. Contributions welcome!

## 📞 Support

For issues or questions:
- Check the logs: `LOG_LEVEL=debug`
- Review Firefly III API docs
- Check MCP protocol specification
- Open an issue on GitHub
