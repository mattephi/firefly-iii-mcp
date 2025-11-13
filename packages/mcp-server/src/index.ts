#!/usr/bin/env node

/**
 * Main Entry Point for Firefly III MCP Server
 */

import { config } from 'dotenv';
import { MCPServer } from './server.js';
import { ServerConfig } from './types.js';

// Load environment variables
config();

/**
 * Load configuration from environment
 */
function loadConfig(): ServerConfig {
  const port = parseInt(process.env.PORT || '3000', 10);
  const publicUrl = process.env.PUBLIC_URL;
  const fireflyBaseUrl = process.env.FIREFLY_BASE_URL;
  const fireflyAccessToken = process.env.FIREFLY_ACCESS_TOKEN;

  // Validate required configuration
  if (!publicUrl) {
    console.error('ERROR: PUBLIC_URL environment variable is required');
    console.error('Example: PUBLIC_URL=https://mcp.example.com');
    process.exit(1);
  }

  if (!fireflyBaseUrl) {
    console.error('ERROR: FIREFLY_BASE_URL environment variable is required');
    console.error('Example: FIREFLY_BASE_URL=https://firefly.example.com');
    process.exit(1);
  }

  if (!fireflyAccessToken) {
    console.error('ERROR: FIREFLY_ACCESS_TOKEN environment variable is required');
    console.error('Get your token from Firefly III: Options > Profile > OAuth > Personal Access Tokens');
    process.exit(1);
  }

  const oauthIssuer = process.env.OAUTH_ISSUER || `${publicUrl}/oauth`;
  const trustProxy = process.env.TRUST_PROXY !== 'false';
  const logLevel = (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
  const tokenExpiration = parseInt(process.env.OAUTH_TOKEN_EXPIRATION || '3600', 10);
  const refreshTokenExpiration = parseInt(process.env.OAUTH_REFRESH_TOKEN_EXPIRATION || '86400', 10);

  return {
    port,
    publicUrl,
    trustProxy,
    logLevel,
    firefly: {
      baseUrl: fireflyBaseUrl,
      accessToken: fireflyAccessToken
    },
    oauth: {
      issuer: oauthIssuer,
      tokenExpiration,
      refreshTokenExpiration
    }
  };
}

/**
 * Main function
 */
async function main() {
  console.log('Starting Firefly III MCP Server...\n');

  try {
    const serverConfig = loadConfig();
    const server = new MCPServer(serverConfig);
    await server.start();

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\nReceived SIGINT, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n\nReceived SIGTERM, shutting down gracefully...');
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the server
main();
