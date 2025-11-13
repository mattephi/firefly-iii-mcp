import express, { Express, Request, Response } from 'express';
import { getServer, McpServerConfig } from '@firefly-iii-mcp/core';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from './event-store.js';
import { randomUUID } from 'node:crypto';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import http from 'http';
import https from 'https';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InMemoryOAuthProvider } from './auth/in-memory-oauth-provider.js';

/**
 * HTTPS server options
 */
export interface HttpsOptions {
  /** SSL key content */
  key: string | Buffer;
  /** SSL certificate content */
  cert: string | Buffer;
  /** Optional CA certificates */
  ca?: string | Buffer | Array<string | Buffer>;
}

/**
 * CORS configuration options
 */
export interface CorsOptions {
  /** Allowed origins (e.g. 'https://example.com' or '*') */
  origin?: string | string[] | boolean;
  /** Whether to allow credentials */
  credentials?: boolean;
  /** Allowed HTTP methods */
  methods?: string | string[];
  /** Allowed HTTP headers */
  allowedHeaders?: string | string[];
  /** Headers exposed to the client */
  exposedHeaders?: string | string[];
  /** Max age of CORS preflight requests in seconds */
  maxAge?: number;
}

/**
 * Server configuration options
 */
export interface ServerConfig {
  /** Port to listen on (default: 3000) */
  port?: number;
  /** Firefly III Personal Access Token */
  pat: string;
  /** Firefly III Base URL */
  baseUrl: string;
  /** HTTPS options for secure server */
  https?: HttpsOptions;
  /** CORS configuration */
  corsOptions?: CorsOptions;
  /** Log level (default: 'info') */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  /** Tool tags to enable */
  enableToolTags?: string[];
  /** Optional OAuth configuration for Claude/remote MCP clients */
  auth?: OAuthConfig;
}

/**
 * OAuth configuration for MCP server
 */
export interface OAuthConfig {
  /** Issuer/authorization server base URL (e.g. https://example.com/oauth) */
  issuerUrl: string;
  /** Canonical MCP resource URL (e.g. https://example.com/mcp) */
  resourceServerUrl: string;
  /** Optional documentation URL shown in metadata */
  documentationUrl?: string;
  /** Scopes supported by this server */
  scopes?: string[];
  /** Human readable resource name */
  resourceName?: string;
  /** Access token lifetime in seconds */
  accessTokenTtlSeconds?: number;
  /** Refresh token lifetime in seconds */
  refreshTokenTtlSeconds?: number;
  /** Whether to enforce the resource parameter */
  strictResource?: boolean;
}

/**
 * MCP Server instance
 */
export interface McpServer {
  /** Express application instance */
  app: Express;
  /** HTTP or HTTPS server instance */
  server: http.Server | https.Server;
  /** Start the server */
  start(): Promise<void>;
  /** Stop the server */
  stop(): Promise<void>;
}

/**
 * Create an Express-based MCP server
 * @param config Server configuration
 * @returns MCP server instance
 */
export function createServer(config: ServerConfig): McpServer {
  const {
    port = 3000,
    pat,
    baseUrl,
    https: httpsOptions,
    corsOptions,
    logLevel = 'info',
    enableToolTags
  } = config;

  // Set up logging based on log level
  const logDebug = logLevel === 'debug' ? console.debug : () => {};
  const logInfo = ['debug', 'info'].includes(logLevel) ? console.info : () => {};
  const logWarn = ['debug', 'info', 'warn'].includes(logLevel) ? console.warn : () => {};
  const logError = console.error;

  // Setup Express app
  const app = express();
  
  // Apply middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(compression());
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }));
  
  // Apply CORS if options provided
  if (corsOptions) {
    app.use(cors(corsOptions));
  }

  let authMiddleware: ReturnType<typeof requireBearerAuth> | undefined;

  if (config.auth) {
    const scopes = config.auth.scopes && config.auth.scopes.length > 0 ? config.auth.scopes : ['mcp:tools'];
    const resourceServerUrl = new URL(config.auth.resourceServerUrl);
    const issuerUrl = new URL(config.auth.issuerUrl);
    const documentationUrl = config.auth.documentationUrl ? new URL(config.auth.documentationUrl) : undefined;

    const oauthProvider = new InMemoryOAuthProvider({
      resourceServerUrl,
      defaultScopes: scopes,
      accessTokenTtlSeconds: config.auth.accessTokenTtlSeconds,
      refreshTokenTtlSeconds: config.auth.refreshTokenTtlSeconds,
      strictResource: config.auth.strictResource ?? true
    });

    app.use(
      mcpAuthRouter({
        provider: oauthProvider,
        issuerUrl,
        baseUrl: issuerUrl,
        scopesSupported: scopes,
        serviceDocumentationUrl: documentationUrl,
        resourceName: config.auth.resourceName ?? 'Firefly III MCP',
        resourceServerUrl
      })
    );

    const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceServerUrl);
    authMiddleware = requireBearerAuth({
      verifier: oauthProvider,
      resourceMetadataUrl
    });
  }

  // Store transports by session ID
  const transports: Record<string, SSEServerTransport | StreamableHTTPServerTransport> = {};

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  const mcpHandler = async (req: Request, res: Response) => {
    logDebug(`Received ${req.method} request to /mcp`);

    try {
      // Check for existing session ID
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        // Check if the transport is of the correct type
        const existingTransport = transports[sessionId];
        if (existingTransport instanceof StreamableHTTPServerTransport) {
          // Reuse existing transport
          transport = existingTransport;
        } else {
          // Transport exists but is not a StreamableHTTPServerTransport
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: Session exists but uses a different transport protocol',
            },
            id: null,
          });
          return;
        }
      } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore, // Enable resumability
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID when session is initialized
            logDebug(`StreamableHTTP session initialized with ID: ${sessionId}`);
            transports[sessionId] = transport;
          }
        });

        // Set up onclose handler to clean up transport when closed
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            logDebug(`Transport closed for session ${sid}, removing from transports map`);
            delete transports[sid];
          }
        };

        // Connect the transport to the MCP server
        const mcpServerConfig: McpServerConfig = {
          baseUrl,
          pat,
          enableToolTags
        };
        const server = getServer(mcpServerConfig);
        await server.connect(transport);
      } else {
        // Invalid request - no session ID or not initialization request
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      // Handle the request with the transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logError('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  };

  if (authMiddleware) {
    app.all('/mcp', authMiddleware, mcpHandler);
  } else {
    app.all('/mcp', mcpHandler);
  }

  // SSE endpoint
  const sseHandler = async (req: Request, res: Response) => {
    logDebug('Received GET request to /sse');
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    res.on("close", () => {
      delete transports[transport.sessionId];
    });
    
    const mcpServerConfig: McpServerConfig = {
      baseUrl,
      pat,
    };
    const server = getServer(mcpServerConfig);
    await server.connect(transport);
  };

  if (authMiddleware) {
    app.get('/sse', authMiddleware, sseHandler);
  } else {
    app.get('/sse', sseHandler);
  }

  // Messages endpoint for SSE
  const sseMessagesHandler = async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    let transport: SSEServerTransport;
    const existingTransport = transports[sessionId];
    if (existingTransport instanceof SSEServerTransport) {
      // Reuse existing transport
      transport = existingTransport;
    } else {
      // Transport exists but is not a SSEServerTransport
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Session exists but uses a different transport protocol',
        },
        id: null,
      });
      return;
    }
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  };

  if (authMiddleware) {
    app.post("/messages", authMiddleware, sseMessagesHandler);
  } else {
    app.post("/messages", sseMessagesHandler);
  }

  // Create HTTP or HTTPS server
  const server = httpsOptions 
    ? https.createServer(httpsOptions, app)
    : http.createServer(app);

  return {
    app,
    server,
    async start(): Promise<void> {
      return new Promise((resolve) => {
        server.listen(port, () => {
          logInfo(`🦋 Firefly III MCP server running on port ${port}`);
          logInfo(`
    ==============================================
    SUPPORTED TRANSPORT OPTIONS:
    
    1. Streamable Http (Protocol version: 2025-03-26)
       Endpoint: /mcp
       Methods: GET, POST, DELETE
       Usage: 
         - Initialize with POST to /mcp
         - Establish SSE stream with GET to /mcp
         - Send requests with POST to /mcp
         - Terminate session with DELETE to /mcp
    
    2. Http + SSE (Protocol version: 2024-11-05)
       Endpoints: /sse (GET) and /messages (POST)
       Usage:
         - Establish SSE stream with GET to /sse
         - Send requests with POST to /messages?sessionId=<id>
    
    3. Health Check
       Endpoint: /health
       Method: GET
    ==============================================`);
          resolve();
        });
      });
    },
    async stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        logInfo('Shutting down server...');
        
        // Close all active transports to properly clean up resources
        for (const sessionId in transports) {
          try {
            logDebug(`Closing transport for session ${sessionId}`);
            transports[sessionId].close();
            delete transports[sessionId];
          } catch (error) {
            logWarn(`Error closing transport for session ${sessionId}:`, error);
          }
        }
        
        server.close((err) => {
          if (err) {
            logError('Error shutting down server:', err);
            reject(err);
          } else {
            logInfo('Server shutdown complete');
            resolve();
          }
        });
      });
    }
  };
} 
