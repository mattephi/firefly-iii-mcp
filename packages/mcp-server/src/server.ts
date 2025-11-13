/**
 * Express Server for MCP with OAuth 2.1 Support
 * Designed for Claude.ai Custom Connectors with Caddy proxy support
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ServerConfig } from './types.js';
import { OAuthProvider } from './oauth.js';
import { FireflyClient } from './firefly-client.js';
import { MCPHandler } from './mcp-handler.js';

export class MCPServer {
  private app: express.Application;
  private config: ServerConfig;
  private oauthProvider: OAuthProvider;
  private mcpHandler: MCPHandler;
  private fireflyClient: FireflyClient;

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();

    // Initialize OAuth provider
    this.oauthProvider = new OAuthProvider(
      config.oauth.issuer,
      config.oauth.tokenExpiration,
      config.oauth.refreshTokenExpiration
    );

    // Initialize Firefly client
    this.fireflyClient = new FireflyClient(config.firefly);

    // Initialize MCP handler
    this.mcpHandler = new MCPHandler(this.fireflyClient);

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware() {
    // Trust proxy (required for Caddy and other reverse proxies)
    if (this.config.trustProxy) {
      this.app.set('trust proxy', 1);
    }

    // Security headers with Helmet
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      if (this.config.logLevel === 'debug') {
        console.log(`[Server] ${req.method} ${req.path}`);
      }
      next();
    });
  }

  /**
   * Setup all routes
   */
  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // OAuth 2.1 Endpoints
    this.setupOAuthRoutes();

    // MCP Endpoint (protected)
    this.app.post('/mcp', this.authenticateRequest.bind(this), this.handleMCP.bind(this));

    // Server info (public)
    this.app.get('/info', (req, res) => {
      res.json({
        name: 'Firefly III MCP Server',
        version: '2.0.0',
        mcp_version: '2024-11-05',
        oauth_enabled: true
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.path} not found`
      });
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('[Server] Error:', err);
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    });
  }

  /**
   * Setup OAuth 2.1 routes
   */
  private setupOAuthRoutes() {
    // OAuth Authorization Server Metadata (RFC 8414)
    this.app.get('/.well-known/oauth-authorization-server', (req, res) => {
      res.json(this.oauthProvider.getAuthorizationServerMetadata());
    });

    // OAuth Protected Resource Metadata (RFC 9470)
    this.app.get('/.well-known/oauth-protected-resource', (req, res) => {
      const resourceUrl = `${this.config.publicUrl}/mcp`;
      res.json(this.oauthProvider.getProtectedResourceMetadata(resourceUrl));
    });

    // Dynamic Client Registration (RFC 7591)
    this.app.post('/oauth/register', async (req, res) => {
      console.log('[OAuth] ========================================');
      console.log('[OAuth] CLIENT REGISTRATION REQUEST');
      console.log('[OAuth] Metadata:', JSON.stringify(req.body, null, 2));
      console.log('[OAuth] ========================================');

      try {
        const client = this.oauthProvider.registerClient(req.body);
        console.log('[OAuth] ✓ Client registered successfully');
        console.log('[OAuth] Client ID:', client.client_id);

        res.status(201).json({
          client_id: client.client_id,
          client_secret: client.client_secret,
          client_id_issued_at: Math.floor(client.created_at / 1000),
          grant_types: client.grant_types,
          redirect_uris: client.redirect_uris
        });
      } catch (error) {
        console.error('[OAuth] Registration error:', error);
        res.status(400).json({
          error: 'invalid_client_metadata',
          error_description: error instanceof Error ? error.message : 'Invalid client metadata'
        });
      }
    });

    // Authorization Endpoint
    this.app.get('/oauth/authorize', async (req, res) => {
      console.log('[OAuth] ========================================');
      console.log('[OAuth] AUTHORIZATION REQUEST');
      console.log('[OAuth] Query params:', JSON.stringify(req.query, null, 2));
      console.log('[OAuth] ========================================');

      try {
        const params = {
          response_type: req.query.response_type as 'code',
          client_id: req.query.client_id as string,
          redirect_uri: req.query.redirect_uri as string,
          scope: req.query.scope as string,
          state: req.query.state as string,
          code_challenge: req.query.code_challenge as string,
          code_challenge_method: req.query.code_challenge_method as 'S256' | 'plain'
        };

        if (!params.client_id || !params.response_type) {
          console.error('[OAuth] Missing required parameters');
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing required parameters'
          });
        }

        // Auto-approve for simplicity (in production, show consent screen)
        const result = await this.oauthProvider.authorize(params);
        console.log('[OAuth] ✓ Authorization code generated');

        // Redirect back with authorization code
        const redirectUrl = new URL(params.redirect_uri || 'about:blank');
        redirectUrl.searchParams.set('code', result.code);
        if (result.state) {
          redirectUrl.searchParams.set('state', result.state);
        }

        console.log('[OAuth] Redirecting to:', redirectUrl.toString());
        res.redirect(redirectUrl.toString());
      } catch (error) {
        console.error('[OAuth] Authorization error:', error);
        res.status(400).json({
          error: 'invalid_request',
          error_description: error instanceof Error ? error.message : 'Authorization failed'
        });
      }
    });

    // Token Endpoint
    this.app.post('/oauth/token', async (req, res) => {
      console.log('[OAuth] ========================================');
      console.log('[OAuth] TOKEN REQUEST');
      console.log('[OAuth] Grant type:', req.body.grant_type);
      console.log('[OAuth] Client ID:', req.body.client_id);
      console.log('[OAuth] ========================================');

      try {
        const tokenResponse = await this.oauthProvider.token(req.body);
        console.log('[OAuth] ✓ Token issued successfully');
        console.log('[OAuth] Access token expires in:', tokenResponse.expires_in, 'seconds');
        res.json(tokenResponse);
      } catch (error) {
        console.error('[OAuth] Token error:', error);
        res.status(400).json({
          error: 'invalid_grant',
          error_description: error instanceof Error ? error.message : 'Token request failed'
        });
      }
    });

    // Revocation Endpoint (RFC 7009)
    this.app.post('/oauth/revoke', async (req, res) => {
      try {
        const { token } = req.body;
        if (!token) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'Missing token parameter'
          });
        }

        await this.oauthProvider.revoke(token);
        res.status(200).json({ success: true });
      } catch (error) {
        console.error('[OAuth] Revocation error:', error);
        res.status(400).json({
          error: 'invalid_request',
          error_description: error instanceof Error ? error.message : 'Revocation failed'
        });
      }
    });
  }

  /**
   * Authenticate request using Bearer token
   */
  private authenticateRequest(req: Request, res: Response, next: NextFunction) {
    console.log('[Auth] Authenticating request to:', req.path);
    console.log('[Auth] Headers:', JSON.stringify(req.headers, null, 2));

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[Auth] Missing or invalid Authorization header');
      return res.status(401).json({
        error: 'unauthorized',
        error_description: 'Missing or invalid Authorization header',
        www_authenticate: 'Bearer realm="MCP"'
      });
    }

    const token = authHeader.substring(7);
    console.log('[Auth] Validating token:', token.substring(0, 10) + '...');

    const tokenData = this.oauthProvider.validateToken(token);

    if (!tokenData) {
      console.error('[Auth] Token validation failed - token is invalid or expired');
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Token is invalid or expired',
        www_authenticate: 'Bearer realm="MCP" error="invalid_token"'
      });
    }

    console.log('[Auth] ✓ Token validated successfully for client:', tokenData.client_id);

    // Attach token data to request
    (req as any).oauth = tokenData;
    next();
  }

  /**
   * Handle MCP requests
   */
  private async handleMCP(req: Request, res: Response) {
    console.log('[Server] ========================================');
    console.log('[Server] MCP REQUEST RECEIVED');
    console.log('[Server] Body:', JSON.stringify(req.body, null, 2));
    console.log('[Server] ========================================');

    try {
      const mcpRequest = req.body;

      // Handle batch requests
      if (Array.isArray(mcpRequest)) {
        console.log('[Server] Processing batch request with', mcpRequest.length, 'items');
        const responses = await this.mcpHandler.handleBatch(mcpRequest);
        console.log('[Server] Batch request completed successfully');
        return res.json(responses);
      }

      // Handle single request
      console.log('[Server] Processing single MCP request');
      const response = await this.mcpHandler.handleRequest(mcpRequest);

      console.log('[Server] ========================================');
      console.log('[Server] MCP RESPONSE SENT');
      console.log('[Server] Response:', JSON.stringify(response, null, 2));
      console.log('[Server] ========================================');

      res.json(response);
    } catch (error) {
      console.error('[Server] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
      console.error('[Server] MCP REQUEST HANDLING ERROR');
      console.error('[Server] Error:', error);
      console.error('[Server] Stack:', error instanceof Error ? error.stack : 'No stack');
      console.error('[Server] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');

      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.config.port, () => {
        console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🦋 Firefly III MCP Server v2.0.0                            ║
║                                                                ║
║   Status: Running                                              ║
║   Port: ${this.config.port.toString().padEnd(57)}║
║   Public URL: ${this.config.publicUrl.padEnd(49)}║
║                                                                ║
║   OAuth Endpoints:                                             ║
║   • Authorization: ${(this.config.oauth.issuer + '/authorize').padEnd(45)}║
║   • Token: ${(this.config.oauth.issuer + '/token').padEnd(52)}║
║   • Register: ${(this.config.oauth.issuer + '/register').padEnd(49)}║
║                                                                ║
║   MCP Endpoint: ${(this.config.publicUrl + '/mcp').padEnd(48)}║
║                                                                ║
║   Ready for Claude.ai Custom Connectors! 🚀                   ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
        `);
        resolve();
      });
    });
  }

  /**
   * Get Express app instance
   */
  getApp() {
    return this.app;
  }
}
