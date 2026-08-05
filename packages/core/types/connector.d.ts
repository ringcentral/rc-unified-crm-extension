import type { JsonObject } from './json';

export type ConnectorInterfaceFunction = (...args: any[]) => unknown;

export interface ConnectorImplementation {
  createCallLog?: ConnectorInterfaceFunction;
  updateCallLog?: ConnectorInterfaceFunction;
  getAuthType?: ConnectorInterfaceFunction;
  [key: string]: unknown;
}

export type ConnectorManifest = JsonObject;

export interface ConnectorCapabilities {
  platform: string;
  originalMethods: string[];
  composedMethods: string[];
  registeredInterfaces: string[];
  authType: string | null;
}

export interface DeveloperPortalConnectorSummary {
  id?: string;
  accountId?: string | number;
  [key: string]: unknown;
}

export interface DeveloperPortalConnectorList {
  connectors?: DeveloperPortalConnectorSummary[];
  [key: string]: unknown;
}

export interface DeveloperPortalPrivateConnectorList {
  privateConnectors: DeveloperPortalConnectorSummary[];
  sharedConnectors: DeveloperPortalConnectorSummary[];
  [key: string]: unknown;
}

export interface GetPrivateConnectorListParams {
  rcAccountId?: string | number;
}

export interface GetConnectorManifestParams extends GetPrivateConnectorListParams {
  connectorId: string;
  isPrivate?: boolean;
}

export interface ProxyAuthConfig {
  type?: string;
  scheme?: string;
  credentialTemplate?: string;
  encode?: string;
  headerName?: string;
  [key: string]: unknown;
}

export interface ProxyResponseItemMapping {
  idPath?: string;
  namePath?: string;
  phonePath?: string;
  typePath?: string;
  titlePath?: string;
  companyPath?: string;
  createdDatePath?: string;
  mostRecentActivityDatePath?: string;
  additionalInfoPath?: string;
  [key: string]: unknown;
}

export interface ProxyResponseMapping {
  listPath?: string;
  item?: ProxyResponseItemMapping;
  idPath?: string;
  namePath?: string;
  emailPath?: string;
  typePath?: string;
  subjectPath?: string;
  notePath?: string;
  fullBodyPath?: string;
  timezoneNamePath?: string;
  overridingApiKeyPath?: string;
  messagePath?: string;
  platformAdditionalInfoPaths?: Record<string, string>;
  isLicenseValidPath?: string;
  licenseStatusPath?: string;
  licenseStatusDescriptionPath?: string;
  [key: string]: unknown;
}

export interface ProxyOperationConfig {
  method?: string;
  url?: string;
  headers?: Record<string, unknown>;
  query?: unknown;
  body?: unknown;
  auth?: ProxyAuthConfig;
  responseMapping?: ProxyResponseMapping;
  [key: string]: unknown;
}

export interface ProxyRequestDefaults {
  baseUrl?: string;
  timeoutSeconds?: number;
  defaultHeaders?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProxyConfig {
  secretKey?: string;
  auth?: ProxyAuthConfig;
  meta?: {
    logFormat?: string;
    [key: string]: unknown;
  };
  requestDefaults?: ProxyRequestDefaults;
  operations?: Record<string, ProxyOperationConfig>;
  [key: string]: unknown;
}

export interface ProxyUserContext {
  accessToken?: string;
  id?: string;
  hostname?: string;
  timezoneName?: string;
  timezoneOffset?: string | number;
  platform?: string;
  platformAdditionalInfo?: unknown;
  refreshToken?: unknown;
  tokenExpiry?: unknown;
  [key: string]: unknown;
}

export interface PerformProxyRequestParams {
  config: ProxyConfig;
  opName: string;
  inputs?: Record<string, any>;
  user?: ProxyUserContext | null;
  authHeader?: string;
}

export interface ProxyResponse<TData = unknown> {
  data: TData;
  [key: string]: unknown;
}

export interface ProxyContactInfo {
  id: unknown;
  name: unknown;
  phone?: unknown;
  type: unknown;
  title: unknown;
  company: unknown;
  createdDate?: unknown;
  mostRecentActivityDate?: unknown;
  additionalInfo: unknown;
}

export interface MapProxyResponseParams {
  config: ProxyConfig;
  response: ProxyResponse;
}

export interface MapFindContactResponseParams extends MapProxyResponseParams {
  opName?: string;
}
