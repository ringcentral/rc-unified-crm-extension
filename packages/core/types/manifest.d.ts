import type { JsonObject, JsonValue } from './json';

export type ConnectorAuthType = 'oauth' | 'apiKey' | (string & {});

export interface AuthorInfo {
  name?: string;
  websiteUrl?: string;
  [key: string]: JsonValue | undefined;
}

export interface EnvironmentSelection {
  const: string;
  name: string;
  [key: string]: JsonValue;
}

export interface ConnectorEnvironment {
  type: 'fixed' | 'dynamic' | 'selectable' | (string & {});
  url?: string;
  urlIdentifier?: string;
  instructions?: string[];
  selections?: EnvironmentSelection[];
  [key: string]: JsonValue | undefined;
}

export interface PageField {
  const: string;
  title?: string;
  type?: string;
  required?: boolean;
  default?: JsonValue;
  [key: string]: JsonValue | undefined;
}

export interface OAuthManifestConfig {
  authUrl?: string;
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  customState?: string;
  [key: string]: JsonValue | undefined;
}

export interface ApiKeyManifestConfig {
  page?: {
    title?: string;
    content?: PageField[];
    [key: string]: JsonValue | undefined;
  };
  [key: string]: JsonValue | undefined;
}

export interface ManifestAuthConfig {
  type: ConnectorAuthType;
  oauth?: OAuthManifestConfig;
  apiKey?: ApiKeyManifestConfig;
  [key: string]: JsonValue | undefined;
}

export interface ServerSideLoggingConfig {
  url?: string;
  useAdminAssignedUserToken?: boolean;
  enableUserMapping?: boolean;
  additionalFields?: PageField[];
  [key: string]: JsonValue | undefined;
}

export interface ContactTypeConfig {
  id?: string;
  name?: string;
  type?: string;
  [key: string]: JsonValue | undefined;
}

export interface PlatformPageConfig {
  useContactSearch?: boolean;
  disableContactCache?: boolean;
  callLog?: JsonObject;
  messageLog?: JsonObject;
  [key: string]: JsonValue | undefined;
}

export interface PlatformManifest {
  name: string;
  displayName?: string;
  developer?: AuthorInfo;
  environment?: ConnectorEnvironment;
  urlIdentifier?: string;
  embedUrls?: string[];
  logoUrl?: string;
  documentationUrl?: string;
  releaseNotesUrl?: string;
  getSupportUrl?: string;
  writeReviewUrl?: string;
  auth: ManifestAuthConfig;
  serverSideLogging?: ServerSideLoggingConfig;
  contactTypes?: ContactTypeConfig[];
  contactPageUrl?: string;
  enableFallbackContactPageUrl?: boolean;
  fallbackContactPageUrl?: string;
  logPageUrl?: string;
  canOpenLogPage?: boolean;
  settings?: JsonValue[];
  page?: PlatformPageConfig;
  requestConfig?: JsonObject;
  enableExtensionNumberLoggingSetting?: boolean;
  trackSmsTypingDuration?: boolean;
  rcAdditionalSubmission?: string[];
  override?: JsonObject;
  [key: string]: JsonValue | undefined;
}

export interface AppConnectManifest {
  serverUrl?: string;
  redirectUri?: string;
  author?: AuthorInfo;
  platforms: Record<string, PlatformManifest>;
  version?: string;
  [key: string]: JsonValue | undefined;
}
