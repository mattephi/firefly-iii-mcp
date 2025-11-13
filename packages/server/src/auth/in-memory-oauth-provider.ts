import { randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import {
  AuthorizationParams,
  OAuthServerProvider,
  OAuthTokenVerifier
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import {
  OAuthClientInformationFull,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js';
import {
  InvalidGrantError,
  InvalidRequestError,
  InvalidTokenError
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

interface AuthorizationCodeRecord {
  codeChallenge: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  resource?: URL;
  expiresAt: number;
}

interface AccessTokenRecord {
  token: string;
  clientId: string;
  scopes: string[];
  resource?: URL;
  expiresAt: number;
}

interface RefreshTokenRecord {
  token: string;
  clientId: string;
  scopes: string[];
  resource?: URL;
  expiresAt: number;
}

export interface InMemoryOAuthProviderOptions {
  /** Canonical MCP resource URL (e.g. https://example.com/mcp) */
  resourceServerUrl: URL;
  /** Default scopes assigned when client does not request any */
  defaultScopes?: string[];
  /** Lifetime of access tokens in seconds */
  accessTokenTtlSeconds?: number;
  /** Lifetime of refresh tokens in seconds */
  refreshTokenTtlSeconds?: number;
  /** Enforce that tokens only target the configured resource */
  strictResource?: boolean;
}

const DEFAULT_ACCESS_TOKEN_TTL = 3600; // 1 hour
const DEFAULT_REFRESH_TOKEN_TTL = 86400; // 24 hours
const AUTH_CODE_TTL = 5 * 60 * 1000; // 5 minutes

export class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  private readonly clients = new Map<string, OAuthClientInformationFull>();

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return this.clients.get(clientId);
  }

  async registerClient(client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>): Promise<OAuthClientInformationFull> {
    const clientId = randomUUID();
    const clientSecret = client.client_secret ?? randomBytes(32).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const fullClient: OAuthClientInformationFull = {
      ...client,
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: now,
      client_secret_expires_at: 0,
      token_endpoint_auth_method: client.token_endpoint_auth_method ?? 'client_secret_post',
      grant_types: client.grant_types ?? ['authorization_code', 'refresh_token'],
      response_types: client.response_types ?? ['code']
    };
    this.clients.set(clientId, fullClient);
    return fullClient;
  }

  preRegister(client: OAuthClientInformationFull) {
    this.clients.set(client.client_id, client);
  }
}

export class InMemoryOAuthProvider implements OAuthServerProvider, OAuthTokenVerifier {
  readonly clientsStore: InMemoryClientsStore;
  private readonly codes = new Map<string, AuthorizationCodeRecord>();
  private readonly accessTokens = new Map<string, AccessTokenRecord>();
  private readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  private readonly options: Required<Omit<InMemoryOAuthProviderOptions, 'defaultScopes'>> & {
    defaultScopes: string[];
  };

  constructor(options: InMemoryOAuthProviderOptions, clientsStore = new InMemoryClientsStore()) {
    if (!options.resourceServerUrl) {
      throw new Error('resourceServerUrl is required for OAuth provider');
    }
    this.options = {
      resourceServerUrl: options.resourceServerUrl,
      defaultScopes: options.defaultScopes?.length ? options.defaultScopes : ['mcp:tools'],
      accessTokenTtlSeconds: options.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TOKEN_TTL,
      refreshTokenTtlSeconds: options.refreshTokenTtlSeconds ?? DEFAULT_REFRESH_TOKEN_TTL,
      strictResource: options.strictResource ?? true
    };
    this.clientsStore = clientsStore;
  }

  private validateResource(resource?: URL): URL | undefined {
    if (!resource) return undefined;
    if (!this.options.strictResource) {
      return resource;
    }
    const canonical = this.options.resourceServerUrl.href;
    if (resource.href !== canonical) {
      throw new InvalidRequestError(`Invalid resource parameter. Expected ${canonical}`);
    }
    return resource;
  }

  private determineResource(requested?: URL): URL {
    return this.validateResource(requested) ?? this.options.resourceServerUrl;
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (!client.redirect_uris.includes(params.redirectUri)) {
      throw new InvalidRequestError('Unregistered redirect_uri');
    }
    const code = randomUUID();
    const scopes = params.scopes && params.scopes.length > 0 ? params.scopes : this.options.defaultScopes;
    const resource = this.determineResource(params.resource);
    const expiresAt = Date.now() + AUTH_CODE_TTL;

    this.codes.set(code, {
      codeChallenge: params.codeChallenge,
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      scopes,
      resource,
      expiresAt
    });

    const redirectTarget = new URL(params.redirectUri);
    redirectTarget.searchParams.set('code', code);
    if (params.state) {
      redirectTarget.searchParams.set('state', params.state);
    }
    res.redirect(redirectTarget.toString());
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const record = this.codes.get(authorizationCode);
    if (!record || record.clientId !== client.client_id || record.expiresAt < Date.now()) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const record = this.codes.get(authorizationCode);
    if (!record || record.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid authorization code');
    }

    if (record.expiresAt < Date.now()) {
      this.codes.delete(authorizationCode);
      throw new InvalidGrantError('Authorization code expired');
    }

    if (redirectUri && record.redirectUri !== redirectUri) {
      throw new InvalidGrantError('Redirect URI mismatch');
    }

    const tokenResource = this.determineResource(resource ?? record.resource);
    this.codes.delete(authorizationCode);

    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    const accessExpiresAt = Date.now() + this.options.accessTokenTtlSeconds * 1000;
    const refreshExpiresAt = Date.now() + this.options.refreshTokenTtlSeconds * 1000;

    this.accessTokens.set(accessToken, {
      token: accessToken,
      clientId: client.client_id,
      scopes: record.scopes,
      resource: tokenResource,
      expiresAt: accessExpiresAt
    });

    this.refreshTokens.set(refreshToken, {
      token: refreshToken,
      clientId: client.client_id,
      scopes: record.scopes,
      resource: tokenResource,
      expiresAt: refreshExpiresAt
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: this.options.accessTokenTtlSeconds,
      scope: record.scopes.join(' ')
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const record = this.refreshTokens.get(refreshToken);
    if (!record || record.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid refresh token');
    }
    if (record.expiresAt < Date.now()) {
      this.refreshTokens.delete(refreshToken);
      throw new InvalidGrantError('Refresh token expired');
    }

    const requestedScopes = scopes && scopes.length > 0 ? scopes : record.scopes;
    const missingScopes = requestedScopes.some(scope => !record.scopes.includes(scope));
    if (missingScopes) {
      throw new InvalidGrantError('Refresh token not authorized for requested scopes');
    }

    const tokenResource = this.determineResource(resource ?? record.resource);

    const newAccessToken = randomUUID();
    const newRefreshToken = randomUUID();
    const accessExpiresAt = Date.now() + this.options.accessTokenTtlSeconds * 1000;
    const refreshExpiresAt = Date.now() + this.options.refreshTokenTtlSeconds * 1000;

    this.accessTokens.set(newAccessToken, {
      token: newAccessToken,
      clientId: client.client_id,
      scopes: requestedScopes,
      resource: tokenResource,
      expiresAt: accessExpiresAt
    });

    this.refreshTokens.set(newRefreshToken, {
      token: newRefreshToken,
      clientId: client.client_id,
      scopes: requestedScopes,
      resource: tokenResource,
      expiresAt: refreshExpiresAt
    });

    // Revoke old refresh token
    this.refreshTokens.delete(refreshToken);

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      token_type: 'bearer',
      expires_in: this.options.accessTokenTtlSeconds,
      scope: requestedScopes.join(' ')
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const record = this.accessTokens.get(token);
    if (!record) {
      throw new InvalidTokenError('Unknown access token');
    }
    if (record.expiresAt < Date.now()) {
      this.accessTokens.delete(token);
      throw new InvalidTokenError('Access token expired');
    }

    if (this.options.strictResource && record.resource && record.resource.href !== this.options.resourceServerUrl.href) {
      throw new InvalidTokenError('Token not issued for this resource');
    }

    return {
      token: record.token,
      clientId: record.clientId,
      scopes: record.scopes,
      expiresAt: Math.floor(record.expiresAt / 1000),
      resource: record.resource ?? this.options.resourceServerUrl
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: { token: string }): Promise<void> {
    if (this.accessTokens.has(request.token)) {
      this.accessTokens.delete(request.token);
    }
    if (this.refreshTokens.has(request.token)) {
      this.refreshTokens.delete(request.token);
    }
  }
}
