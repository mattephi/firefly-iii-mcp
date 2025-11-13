# Deployment Guide

Complete guide for deploying the Firefly III MCP Server for use with Claude.ai Custom Connectors.

## Prerequisites

- A server with a public IP address
- A domain name pointed to your server
- Firefly III instance (self-hosted or cloud)
- Firefly III Personal Access Token

## Deployment Options

### Option 1: Docker Compose (Recommended)

This is the easiest way to deploy with automatic HTTPS via Caddy.

#### Step 1: Prepare Environment

```bash
# Clone or copy the mcp-server package to your server
cd /opt
git clone <your-repo> firefly-mcp
cd firefly-mcp/packages/mcp-server
```

#### Step 2: Configure Environment

Create `.env` file:

```bash
cp .env.example .env
nano .env
```

Fill in your details:

```env
PUBLIC_URL=https://mcp.yourdomain.com
FIREFLY_BASE_URL=https://firefly.yourdomain.com
FIREFLY_ACCESS_TOKEN=your_firefly_pat_here
LOG_LEVEL=info
```

#### Step 3: Configure Caddy

```bash
cp Caddyfile.example Caddyfile
nano Caddyfile
```

Replace `mcp.yourdomain.com` with your actual domain.

#### Step 4: Start Services

```bash
docker-compose up -d
```

#### Step 5: Verify

```bash
# Check if services are running
docker-compose ps

# Check logs
docker-compose logs -f mcp-server

# Test health endpoint
curl https://mcp.yourdomain.com/health
```

#### Step 6: Test OAuth Discovery

```bash
curl https://mcp.yourdomain.com/.well-known/oauth-authorization-server
```

You should see OAuth metadata.

---

### Option 2: Systemd Service (No Docker)

#### Step 1: Install Node.js

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### Step 2: Install Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

#### Step 3: Setup MCP Server

```bash
# Create app directory
sudo mkdir -p /opt/firefly-mcp
cd /opt/firefly-mcp

# Copy files
# ... upload your files here ...

# Install dependencies
npm install
npm run build

# Create .env file
sudo nano .env
```

#### Step 4: Create Systemd Service

Create `/etc/systemd/system/firefly-mcp.service`:

```ini
[Unit]
Description=Firefly III MCP Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/firefly-mcp
EnvironmentFile=/opt/firefly-mcp/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=firefly-mcp

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable firefly-mcp
sudo systemctl start firefly-mcp
sudo systemctl status firefly-mcp
```

#### Step 5: Configure Caddy

```bash
sudo cp Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Restart Caddy:

```bash
sudo systemctl restart caddy
sudo systemctl status caddy
```

---

### Option 3: Manual Installation

#### Step 1: Build

```bash
npm install
npm run build
```

#### Step 2: Run

```bash
# Set environment variables
export PUBLIC_URL=https://mcp.yourdomain.com
export FIREFLY_BASE_URL=https://firefly.yourdomain.com
export FIREFLY_ACCESS_TOKEN=your_pat_here

# Start server
npm start
```

---

## Setting Up in Claude.ai

### Step 1: Access Custom Connectors

1. Go to Claude.ai
2. Click on your profile
3. Navigate to "Custom Connectors" or "Integrations"
4. Click "Add Custom Connector"

### Step 2: Configure Connector

Enter the following details:

- **Name**: Firefly III Personal Finance
- **Base URL**: `https://mcp.yourdomain.com`
- **Description**: Manage your Firefly III finances with AI
- **Authentication Type**: OAuth 2.0

### Step 3: OAuth Configuration

Claude will automatically discover OAuth endpoints via `.well-known/oauth-authorization-server`.

If manual configuration is needed:

- **Authorization URL**: `https://mcp.yourdomain.com/oauth/authorize`
- **Token URL**: `https://mcp.yourdomain.com/oauth/token`
- **Scopes**: `mcp`

### Step 4: Authorize

1. Click "Connect" or "Authorize"
2. Claude will redirect you to the authorization endpoint
3. The server will auto-approve and redirect back
4. You should see "Connected" status

### Step 5: Test

Ask Claude:

```
List my Firefly III accounts
```

Claude should use the `firefly_get_accounts` tool and return your accounts!

---

## Security Checklist

- [ ] HTTPS enabled (Caddy handles this automatically)
- [ ] Firefly III PAT is kept secret (never commit to git)
- [ ] Server firewall configured (only ports 80, 443 open)
- [ ] Caddy security headers enabled
- [ ] Regular updates scheduled
- [ ] Logs monitored
- [ ] Backup strategy in place

---

## Monitoring

### Check Server Status

```bash
# Systemd
sudo systemctl status firefly-mcp

# Docker
docker-compose ps
docker-compose logs -f mcp-server
```

### Check Caddy Status

```bash
# Systemd
sudo systemctl status caddy

# Docker
docker-compose logs -f caddy
```

### View Logs

```bash
# MCP Server logs
sudo journalctl -u firefly-mcp -f

# Docker logs
docker-compose logs -f

# Caddy logs
tail -f /var/log/caddy/mcp-access.log
```

---

## Troubleshooting

### Can't connect to Firefly III

```bash
# Test from server
curl -H "Authorization: Bearer YOUR_PAT" https://firefly.yourdomain.com/api/v1/about
```

### OAuth not working

```bash
# Check well-known endpoint
curl https://mcp.yourdomain.com/.well-known/oauth-authorization-server

# Should return OAuth metadata JSON
```

### Certificate issues

```bash
# Check Caddy logs
sudo journalctl -u caddy -f

# Force cert renewal
sudo caddy reload --config /etc/caddy/Caddyfile
```

### Server crashes

```bash
# Check logs
sudo journalctl -u firefly-mcp -n 100

# Check if port is already in use
sudo netstat -tlnp | grep 3000
```

---

## Updating

### Docker

```bash
cd /opt/firefly-mcp/packages/mcp-server
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

### Systemd

```bash
cd /opt/firefly-mcp
git pull
npm install
npm run build
sudo systemctl restart firefly-mcp
```

---

## Backup

### Important Files to Backup

- `.env` - Configuration
- `Caddyfile` - Caddy configuration
- Server logs (if needed)

OAuth tokens are stored in memory and don't need backup.

---

## Performance Tuning

### For High Traffic

1. **Enable Rate Limiting** in Caddy (requires plugin)
2. **Increase Node.js memory**:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" npm start
   ```
3. **Use PM2** for process management:
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name firefly-mcp
   pm2 startup
   pm2 save
   ```

---

## Support

- Check logs first
- Verify Firefly III is accessible
- Test OAuth endpoints
- Review environment variables
- Check network/firewall settings
