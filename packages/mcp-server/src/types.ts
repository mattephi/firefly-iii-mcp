/**
 * MCP Protocol Types
 */

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: any;
  error?: MCPError;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  name: string;
  arguments?: Record<string, any>;
}

/**
 * OAuth 2.1 Types
 */

export interface OAuthTokenRequest {
  grant_type: 'authorization_code' | 'refresh_token' | 'client_credentials';
  code?: string;
  redirect_uri?: string;
  client_id: string;
  client_secret?: string;
  refresh_token?: string;
  code_verifier?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface OAuthAuthorizationRequest {
  response_type: 'code';
  client_id: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: 'S256' | 'plain';
}

export interface OAuthClient {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  grant_types: string[];
  scope: string;
  created_at: number;
}

export interface OAuthAuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri?: string;
  scope: string;
  code_challenge?: string;
  code_challenge_method?: string;
  created_at: number;
  expires_at: number;
}

export interface OAuthAccessToken {
  access_token: string;
  client_id: string;
  scope: string;
  created_at: number;
  expires_at: number;
  refresh_token?: string;
  refresh_token_expires_at?: number;
}

/**
 * Firefly III Types
 */

export interface FireflyConfig {
  baseUrl: string;
  accessToken: string;
}

export interface FireflyAccount {
  id: string;
  type: string;
  attributes: {
    name: string;
    type: string;
    account_number?: string;
    current_balance: string;
    currency_code: string;
  };
}

export interface FireflyTransaction {
  id: string;
  type: string;
  attributes: {
    description: string;
    date: string;
    amount: string;
    currency_code: string;
    source_name: string;
    destination_name: string;
  };
}

/**
 * Server Configuration
 */

export interface ServerConfig {
  port: number;
  publicUrl: string;
  trustProxy: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  firefly: FireflyConfig;
  oauth: {
    issuer: string;
    tokenExpiration: number;
    refreshTokenExpiration: number;
  };
}
