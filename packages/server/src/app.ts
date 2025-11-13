#!/usr/bin/env node

import { resolve } from 'path';
import { existsSync } from 'fs';
import { config } from 'dotenv';
import { createServer, OAuthConfig } from './server.js';
import { parseArgs } from 'node:util';
import { getPresetTags, presetExists, getAvailablePresets } from '@firefly-iii-mcp/core';

const DEFAULT_OAUTH_SCOPES = ['mcp:tools'];

function parseList(value?: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }
  return value.split(',').map(tag => tag.trim()).filter(Boolean);
}

function parseInteger(value?: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseBooleanValue(value?: string | null): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = value.toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return undefined;
}

/**
 * Parse command line arguments
 */
function parseCommandLineArgs() {
  const options = {
    pat: {
      type: 'string',
      short: 'p',
      default: process.env.FIREFLY_III_PAT
    },
    baseUrl: {
      type: 'string',
      short: 'b',
      default: process.env.FIREFLY_III_BASE_URL
    },
    port: {
      type: 'string',
      short: 'P',
      default: process.env.PORT || '3000'
    },
    logLevel: {
      type: 'string',
      short: 'l',
      default: process.env.LOG_LEVEL || 'info'
    },
    preset: {
      type: 'string',
      short: 's',
      default: process.env.FIREFLY_III_PRESET
    },
    tools: {
      type: 'string',
      short: 't',
      default: process.env.FIREFLY_III_TOOLS
    },
    claude: {
      type: 'boolean',
      short: 'c'
    },
    publicUrl: {
      type: 'string',
      short: 'u',
      default: process.env.FIREFLY_III_PUBLIC_URL
    },
    authMode: {
      type: 'string',
      default: process.env.FIREFLY_III_AUTH_MODE
    },
    authIssuerUrl: {
      type: 'string',
      default: process.env.FIREFLY_III_AUTH_ISSUER_URL
    },
    authDocsUrl: {
      type: 'string',
      default: process.env.FIREFLY_III_AUTH_DOCS_URL
    },
    authScopes: {
      type: 'string',
      default: process.env.FIREFLY_III_AUTH_SCOPES
    },
    authResourceName: {
      type: 'string',
      default: process.env.FIREFLY_III_AUTH_RESOURCE_NAME
    },
    authAccessTtl: {
      type: 'string',
      default: process.env.FIREFLY_III_AUTH_ACCESS_TTL
    },
    authRefreshTtl: {
      type: 'string',
      default: process.env.FIREFLY_III_AUTH_REFRESH_TTL
    },
    authStrictResource: {
      type: 'boolean'
    },
    help: {
      type: 'boolean',
      short: 'h'
    }
  } as const;

  try {
    const { values } = parseArgs({ options, allowPositionals: false });
    return values;
  } catch (error) {
    console.error('Error parsing command line arguments:', error);
    process.exit(1);
  }
}

/**
 * Print help information
 */
function printHelp() {
  console.log(`
Firefly III MCP Server - Express

Usage: firefly-iii-mcp-server [options]

Options:
  -p, --pat <token>       Firefly III Personal Access Token
  -b, --baseUrl <url>     Firefly III Base URL
  -P, --port <number>     Port to listen on (default: 3000)
  -l, --logLevel <level>  Log level: debug, info, warn, error (default: info)
  -s, --preset <name>     Tool preset to use (default, full, basic, budget, reporting, admin, automation)
  -t, --tools <list>      Comma-separated list of tool tags to enable
  -c, --claude            Enable OAuth wrapper compatible with Claude's remote MCP requirements
  -u, --publicUrl <url>   Public URL to your /mcp endpoint (required when --claude or --authMode oauth)
      --authMode <mode>   Authentication mode: none (default) or oauth
      --authIssuerUrl <url>  Override OAuth issuer URL (defaults to <publicUrl origin>/oauth)
      --authDocsUrl <url> Documentation URL advertised in metadata
      --authScopes <list> Comma-separated OAuth scopes (default: mcp:tools)
      --authResourceName <name> Custom resource name exposed to clients
      --authAccessTtl <seconds> Access token lifetime (seconds)
      --authRefreshTtl <seconds> Refresh token lifetime (seconds)
      --authStrictResource     Enforce strict resource URI matching (default: true)
  -h, --help              Show this help information

Environment variables:
  FIREFLY_III_PAT         Firefly III Personal Access Token
  FIREFLY_III_BASE_URL    Firefly III Base URL
  PORT                    Port to listen on
  LOG_LEVEL               Log level
  FIREFLY_III_PRESET      Tool preset to use
  FIREFLY_III_TOOLS       Comma-separated list of tool tags to enable
  FIREFLY_III_PUBLIC_URL  Canonical public URL to the MCP endpoint (e.g. https://example.com/mcp)
  FIREFLY_III_AUTH_MODE   Authentication mode (none|oauth)
  FIREFLY_III_AUTH_ISSUER_URL  OAuth issuer URL
  FIREFLY_III_AUTH_DOCS_URL    Documentation URL for metadata
  FIREFLY_III_AUTH_SCOPES      Comma-separated OAuth scopes
  FIREFLY_III_AUTH_RESOURCE_NAME  Friendly resource name
  FIREFLY_III_AUTH_ACCESS_TTL     Access token lifetime (seconds)
  FIREFLY_III_AUTH_REFRESH_TTL    Refresh token lifetime (seconds)
  FIREFLY_III_AUTH_STRICT_RESOURCE  Set to false to allow flexible resource URIs
  FIREFLY_III_CLAUDE       Set to true to enable Claude-compatible OAuth mode

Examples:
  firefly-iii-mcp-server --pat YOUR_PAT --baseUrl https://firefly.example.com
  firefly-iii-mcp-server --port 8080 --logLevel debug
  firefly-iii-mcp-server --preset budget
  firefly-iii-mcp-server --tools accounts,transactions,categories
  firefly-iii-mcp-server --claude --publicUrl https://mcp.example.com/mcp --pat YOUR_PAT --baseUrl https://firefly.example.com
  `);
  process.exit(0);
}

/**
 * Main function
 */
async function main() {
  // Load environment variables from .env file
  const localEnvPath = resolve(process.cwd(), '.env');
  if (existsSync(localEnvPath)) {
    config({ path: localEnvPath });
  } else {
    // Fallback to default dotenv behavior
    config();
  }

  // Parse command line arguments
  const args = parseCommandLineArgs();

  // Show help if requested
  if (args.help) {
    printHelp();
  }

  // Check required parameters
  const pat = args.pat;
  const baseUrl = args.baseUrl;

  if (!pat || !baseUrl) {
    console.error('Error: Firefly III Personal Access Token (--pat) and Base URL (--baseUrl) are required');
    console.error('Set these values via command line arguments or environment variables (FIREFLY_III_PAT, FIREFLY_III_BASE_URL)');
    process.exit(1);
  }

  // Parse port
  const port = parseInt(args.port, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error('Error: Port must be a valid number between 1 and 65535');
    process.exit(1);
  }

  // Validate log level
  const logLevel = args.logLevel;
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    console.error('Error: Log level must be one of: debug, info, warn, error');
    process.exit(1);
  }

  // Process enableToolTags
  let enableToolTags: string[] | undefined = undefined;

  if (args.tools) {
    enableToolTags = args.tools.split(',').map(tag => tag.trim()).filter(Boolean);
  } else if (args.preset) {
    const presetArg = args.preset.toLowerCase();
    if (presetExists(presetArg)) {
      enableToolTags = getPresetTags(presetArg);
    } else {
      console.warn(`Warning: Unknown preset "${presetArg}". Using default preset.`);
      console.warn(`Available presets: ${getAvailablePresets().join(', ')}`);
    }
  }

  const envClaudeFlag = parseBooleanValue(process.env.FIREFLY_III_CLAUDE);
  const authModeArg = typeof args.authMode === 'string' ? args.authMode.toLowerCase() : undefined;
  const enableClaudeMode = typeof args.claude === 'boolean' ? args.claude : envClaudeFlag ?? false;
  const enableOAuth = enableClaudeMode || authModeArg === 'oauth';

  let authConfig: OAuthConfig | undefined;
  if (enableOAuth) {
    const publicUrl = args.publicUrl ?? process.env.FIREFLY_III_PUBLIC_URL;
    if (!publicUrl) {
      console.error('Error: --publicUrl (or FIREFLY_III_PUBLIC_URL) is required when OAuth mode is enabled via --claude or --authMode oauth');
      process.exit(1);
    }

    let canonicalUrl: URL;
    try {
      canonicalUrl = new URL(publicUrl);
    } catch (error) {
      console.error(`Error: Invalid --publicUrl value "${publicUrl}" - ${error}`);
      process.exit(1);
    }

    const issuerUrl = args.authIssuerUrl ?? process.env.FIREFLY_III_AUTH_ISSUER_URL ?? new URL('/oauth', canonicalUrl.origin).toString();
    const documentationUrl = args.authDocsUrl ?? process.env.FIREFLY_III_AUTH_DOCS_URL;
    const scopes = parseList(args.authScopes ?? process.env.FIREFLY_III_AUTH_SCOPES) ?? DEFAULT_OAUTH_SCOPES;
    const resourceName = args.authResourceName ?? process.env.FIREFLY_III_AUTH_RESOURCE_NAME;
    const accessTokenTtlSeconds = parseInteger(args.authAccessTtl ?? process.env.FIREFLY_III_AUTH_ACCESS_TTL);
    const refreshTokenTtlSeconds = parseInteger(args.authRefreshTtl ?? process.env.FIREFLY_III_AUTH_REFRESH_TTL);
    const strictResource = typeof args.authStrictResource === 'boolean'
      ? args.authStrictResource
      : parseBooleanValue(process.env.FIREFLY_III_AUTH_STRICT_RESOURCE);

    authConfig = {
      issuerUrl,
      resourceServerUrl: canonicalUrl.toString(),
      documentationUrl,
      scopes,
      resourceName,
      accessTokenTtlSeconds,
      refreshTokenTtlSeconds,
      strictResource: strictResource ?? true
    };
  }
  // Create and start server
  const server = createServer({
    port,
    pat,
    baseUrl,
    logLevel: logLevel as 'debug' | 'info' | 'warn' | 'error',
    enableToolTags,
    auth: authConfig
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  process.on('SIGTERM', async () => {
    try {
      await server.stop();
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Start the server
  try {
    await server.start();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
