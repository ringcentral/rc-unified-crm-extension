import type { JsonObject } from './json';
import type { ReturnMessage } from './common';

export interface OAuthInfo {
  authUrl?: string;
  accessTokenUri?: string;
  authorizationUri?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scope?: string;
  scopes?: string[] | string;
  customState?: string;
  hostname?: string;
  failMessage?: string;
  tokenEndpointAuthMethod?: 'client_secret_basic' | 'client_secret_post';
  [key: string]: unknown;
}

export interface OAuthRefreshResult {
  accessToken?: unknown;
  refreshToken?: unknown;
  expires?: unknown;
  [key: string]: unknown;
}

export interface OAuthTokenLike {
  refresh(): Promise<OAuthRefreshResult>;
  [key: string]: unknown;
}

export interface OAuthAppLike {
  createToken(accessToken?: unknown, refreshToken?: unknown): OAuthTokenLike;
  [key: string]: unknown;
}

export interface RefreshableOAuthUser {
  id: string;
  platform?: string;
  accessToken?: unknown;
  refreshToken?: unknown;
  tokenExpiry?: unknown;
  save(): Promise<unknown>;
  [key: string]: unknown;
}

export interface PlatformUserInfo {
  id?: string | number;
  name?: string;
  email?: string;
  overridingHostname?: string;
  additionalInfo?: JsonObject;
  [key: string]: unknown;
}

export interface ConnectorAuthResult {
  successful: boolean;
  platformUserInfo?: PlatformUserInfo;
  returnMessage?: ReturnMessage;
  [key: string]: unknown;
}

export interface AuthHandlerResult {
  successful?: boolean;
  userInfo?: unknown | null;
  returnMessage?: ReturnMessage;
}

export interface OAuthCallbackQuery {
  callbackUri: string;
  apiUrl?: string;
  username?: string;
  proxyId?: string;
  userEmail?: string;
  rcAccountId?: string | number;
  [key: string]: unknown;
}

export interface OAuthCallbackParams {
  platform: string;
  hostname?: string;
  tokenUrl?: string;
  query: OAuthCallbackQuery;
  verifiedRcAccountId?: string;
  hashedRcExtensionId?: string;
  isFromMCP?: boolean;
}

export interface ApiKeyLoginParams {
  platform: string;
  hostname?: string;
  apiKey?: string;
  proxyId?: string;
  rcAccountId?: string | number;
  rcExtensionId?: string | number;
  devRcAccountId?: string | number;
  connectorId?: string;
  isPrivate?: boolean;
  canPersistManagedAuth?: boolean;
  hashedRcExtensionId?: string;
  additionalInfo?: Record<string, unknown>;
}

export type ValidateApiKeyLogin = (
  context: Pick<ApiKeyLoginParams, 'rcAccountId' | 'rcExtensionId'>
) => ReturnMessage | undefined | Promise<ReturnMessage | undefined>;

export interface ApiKeyUserSaveContext {
  existingUser: {
    platform?: string;
    rcAccountId?: string | number | null;
    accessToken?: unknown;
    platformAdditionalInfo?: Record<string, unknown> | null;
  } | null;
  platformUserInfo: SaveUserInfoParams['platformUserInfo'];
  rcAccountId?: string | number;
  accessToken?: unknown;
}

/** Return a warning to deny the write while the existing user row is locked. */
export type ValidateApiKeyUserSave = (
  context: ApiKeyUserSaveContext
) => ReturnMessage | undefined | Promise<ReturnMessage | undefined>;

export interface SaveUserInfoParams {
  platformUserInfo: PlatformUserInfo & {
    id: string | number;
    name?: string;
    platformAdditionalInfo?: Record<string, unknown>;
  };
  platform: string;
  hostname?: string;
  accessToken?: unknown;
  refreshToken?: unknown;
  tokenExpiry?: unknown;
  rcAccountId?: string | number;
  hashedRcExtensionId?: string;
  proxyId?: string;
  [key: string]: unknown;
}

export interface LicenseStatusParams {
  userId: string | number;
  platform: string;
}

export interface AuthValidationParams {
  platform: string;
  userId: string | number;
}

export interface AuthValidationResult {
  successful: boolean;
  returnMessage?: ReturnMessage;
  status?: number;
  failReason: string;
  [key: string]: unknown;
}

export interface RingcentralOAuthCallbackParams {
  code: string;
  rcAccountId?: string | number;
}
