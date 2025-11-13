/**
 * OAuth 2.1 Implementation for Claude.ai Custom Connectors
 * Supports PKCE, dynamic client registration, and all required endpoints
 */

import { randomBytes, createHash } from 'crypto';
import * as jose from 'jose';
import {
  OAuthClient,
  OAuthAuthorizationCode,
  OAuthAccessToken,
  OAuthTokenRequest,
  OAuthTokenResponse,
  OAuthAuthorizationRequest
} from './types.js';

export class OAuthProvider {
  private clients: Map<string, OAuthClient> = new Map();
  private authCodes: Map<string, OAuthAuthorizationCode> = new Map();
  private tokens: Map<string, OAuthAccessToken> = new Map();
  private issuerUrl: string;
  private tokenExpiration: number;
  private refreshTokenExpiration: number;

  constructor(issuerUrl: string, tokenExpiration = 3600, refreshTokenExpiration = 86400) {
    this.issuerUrl = issuerUrl;
    this.tokenExpiration = tokenExpiration;
    this.refreshTokenExpiration = refreshTokenExpiration;
  }

  /**
   * Generate OAuth Authorization Server Metadata
   * Required by Claude.ai for discovery
   */
  getAuthorizationServerMetadata() {
    return {
      issuer: this.issuerUrl,
      authorization_endpoint: `${this.issuerUrl}/authorize`,
      token_endpoint: `${this.issuerUrl}/token`,
      registration_endpoint: `${this.issuerUrl}/register`,
      revocation_endpoint: `${this.issuerUrl}/revoke`,
      scopes_supported: ['mcp'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      service_documentation: `${this.issuerUrl.replace('/oauth', '')}/docs`
    };
  }

  /**
   * Generate OAuth Protected Resource Metadata
   * Required by Claude.ai to identify the MCP resource
   */
  getProtectedResourceMetadata(resourceUrl: string) {
    return {
      resource: resourceUrl,
      authorization_servers: [this.issuerUrl],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
      resource_signing_alg_values_supported: ['none'],
      resource_documentation: `${this.issuerUrl.replace('/oauth', '')}/docs`
    };
  }

  /**
   * Dynamic Client Registration (RFC 7591)
   * Allows Claude.ai to register itself as a client
   */
  registerClient(metadata: {
    redirect_uris?: string[];
    grant_types?: string[];
    scope?: string;
    client_name?: string;
  }): OAuthClient {
    const clientId = this.generateRandomString(32);
    const clientSecret = this.generateRandomString(48);

    const client: OAuthClient = {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: metadata.redirect_uris || [],
      grant_types: metadata.grant_types || ['authorization_code', 'refresh_token'],
      scope: metadata.scope || 'mcp',
      created_at: Date.now()
    };

    this.clients.set(clientId, client);

    console.log(`[OAuth] Registered new client: ${clientId}`);

    return client;
  }

  /**
   * Authorization Endpoint
   * Handles authorization requests with PKCE support
   */
  async authorize(params: OAuthAuthorizationRequest): Promise<{ code: string; state?: string }> {
    const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method } = params;

    // Validate client
    const client = this.clients.get(client_id);
    if (!client) {
      throw new Error('Invalid client_id');
    }

    // Validate redirect_uri if client has registered URIs
    if (client.redirect_uris.length > 0 && redirect_uri) {
      if (!client.redirect_uris.includes(redirect_uri)) {
        throw new Error('Invalid redirect_uri');
      }
    }

    // Generate authorization code
    const code = this.generateRandomString(32);
    const authCode: OAuthAuthorizationCode = {
      code,
      client_id,
      redirect_uri,
      scope: scope || 'mcp',
      code_challenge,
      code_challenge_method,
      created_at: Date.now(),
      expires_at: Date.now() + 600000 // 10 minutes
    };

    this.authCodes.set(code, authCode);

    console.log(`[OAuth] Generated authorization code for client: ${client_id}`);

    // Auto-cleanup expired codes
    setTimeout(() => {
      this.authCodes.delete(code);
    }, 600000);

    return { code, state };
  }

  /**
   * Token Endpoint
   * Exchanges authorization code for access token
   */
  async token(params: OAuthTokenRequest): Promise<OAuthTokenResponse> {
    const { grant_type, code, client_id, code_verifier, refresh_token } = params;

    if (grant_type === 'authorization_code') {
      return this.handleAuthorizationCodeGrant(code!, client_id, code_verifier);
    } else if (grant_type === 'refresh_token') {
      return this.handleRefreshTokenGrant(refresh_token!, client_id);
    } else {
      throw new Error('Unsupported grant_type');
    }
  }

  private async handleAuthorizationCodeGrant(
    code: string,
    clientId: string,
    codeVerifier?: string
  ): Promise<OAuthTokenResponse> {
    // Validate authorization code
    const authCode = this.authCodes.get(code);
    if (!authCode) {
      throw new Error('Invalid or expired authorization code');
    }

    // Check expiration
    if (Date.now() > authCode.expires_at) {
      this.authCodes.delete(code);
      throw new Error('Authorization code expired');
    }

    // Validate client
    if (authCode.client_id !== clientId) {
      throw new Error('Client mismatch');
    }

    // Validate PKCE if code_challenge was provided
    if (authCode.code_challenge) {
      if (!codeVerifier) {
        throw new Error('code_verifier required');
      }

      const isValid = this.verifyPKCE(
        codeVerifier,
        authCode.code_challenge,
        authCode.code_challenge_method || 'S256'
      );

      if (!isValid) {
        throw new Error('Invalid code_verifier');
      }
    }

    // Delete used authorization code
    this.authCodes.delete(code);

    // Generate tokens
    const accessToken = this.generateRandomString(48);
    const refreshToken = this.generateRandomString(48);

    const tokenData: OAuthAccessToken = {
      access_token: accessToken,
      client_id: clientId,
      scope: authCode.scope,
      created_at: Date.now(),
      expires_at: Date.now() + this.tokenExpiration * 1000,
      refresh_token: refreshToken,
      refresh_token_expires_at: Date.now() + this.refreshTokenExpiration * 1000
    };

    this.tokens.set(accessToken, tokenData);

    console.log(`[OAuth] Issued access token for client: ${clientId}`);

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.tokenExpiration,
      refresh_token: refreshToken,
      scope: authCode.scope
    };
  }

  private async handleRefreshTokenGrant(
    refreshToken: string,
    clientId: string
  ): Promise<OAuthTokenResponse> {
    // Find token by refresh_token
    let existingToken: OAuthAccessToken | undefined;
    for (const token of this.tokens.values()) {
      if (token.refresh_token === refreshToken && token.client_id === clientId) {
        existingToken = token;
        break;
      }
    }

    if (!existingToken) {
      throw new Error('Invalid refresh_token');
    }

    // Check refresh token expiration
    if (existingToken.refresh_token_expires_at && Date.now() > existingToken.refresh_token_expires_at) {
      throw new Error('Refresh token expired');
    }

    // Revoke old access token
    this.tokens.delete(existingToken.access_token);

    // Generate new tokens
    const newAccessToken = this.generateRandomString(48);
    const newRefreshToken = this.generateRandomString(48);

    const tokenData: OAuthAccessToken = {
      access_token: newAccessToken,
      client_id: clientId,
      scope: existingToken.scope,
      created_at: Date.now(),
      expires_at: Date.now() + this.tokenExpiration * 1000,
      refresh_token: newRefreshToken,
      refresh_token_expires_at: Date.now() + this.refreshTokenExpiration * 1000
    };

    this.tokens.set(newAccessToken, tokenData);

    console.log(`[OAuth] Refreshed access token for client: ${clientId}`);

    return {
      access_token: newAccessToken,
      token_type: 'Bearer',
      expires_in: this.tokenExpiration,
      refresh_token: newRefreshToken,
      scope: existingToken.scope
    };
  }

  /**
   * Revoke token endpoint
   */
  async revoke(token: string): Promise<void> {
    // Try to find and delete the token
    this.tokens.delete(token);

    // Also check if it's a refresh token
    for (const [accessToken, tokenData] of this.tokens.entries()) {
      if (tokenData.refresh_token === token) {
        this.tokens.delete(accessToken);
      }
    }

    console.log(`[OAuth] Revoked token`);
  }

  /**
   * Validate access token (for protected endpoints)
   */
  validateToken(accessToken: string): OAuthAccessToken | null {
    const token = this.tokens.get(accessToken);
    if (!token) {
      return null;
    }

    // Check expiration
    if (Date.now() > token.expires_at) {
      this.tokens.delete(accessToken);
      return null;
    }

    return token;
  }

  /**
   * PKCE Helpers
   */
  private verifyPKCE(verifier: string, challenge: string, method: string): boolean {
    if (method === 'plain') {
      return verifier === challenge;
    }

    if (method === 'S256') {
      const hash = createHash('sha256').update(verifier).digest('base64url');
      return hash === challenge;
    }

    return false;
  }

  private generateRandomString(length: number): string {
    return randomBytes(length).toString('base64url').substring(0, length);
  }
}
