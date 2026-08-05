import type { OAuthInfo } from './auth';
import type { ContactInfo, ReturnMessage } from './common';
import type { ProxyConfig } from './connector';
import type { TraceLogger } from './user';

export interface ContactHandlerUser {
  id: string | number;
  platform?: string;
  accessToken?: string | null;
  refreshToken?: unknown;
  tokenExpiry?: unknown;
  hostname?: string;
  rcAccountId?: string | number;
  platformAdditionalInfo?: {
    proxyId?: string;
    tokenUrl?: string;
    [key: string]: unknown;
  } | null;
  save?(): Promise<unknown>;
  [key: string]: any;
}

export interface AccountContactDataRecord {
  data?: ContactInfo[] | unknown;
  update(values: { data: unknown }): Promise<unknown>;
  destroy(): Promise<unknown>;
  [key: string]: any;
}

export type ContactAuthType = 'oauth' | 'apiKey' | (string & {});

export interface ContactAuthParams {
  proxyId?: string;
  proxyConfig?: ProxyConfig | null;
}

export interface ContactOAuthInfoParams extends ContactAuthParams {
  tokenUrl?: unknown;
  hostname?: unknown;
}

export interface FindContactParams {
  platform: string;
  userId: string | number;
  phoneNumber: string;
  overridingFormat?: unknown;
  isExtension?: boolean;
  tracer?: TraceLogger;
  isForceRefreshAccountData?: boolean;
}

export interface CreateContactParams {
  platform: string;
  userId: string | number;
  phoneNumber: string;
  newContactName?: string;
  newContactType?: string;
  additionalSubmission?: unknown;
}

export interface FindContactWithNameParams {
  platform: string;
  userId: string | number;
  name: string;
}

export interface ContactHandlerResult {
  successful: boolean;
  returnMessage?: ReturnMessage | null;
  message?: string;
  contact?: ContactInfo[] | ContactInfo | null | unknown;
  extraDataTracking?: unknown;
  isRevokeUserSession?: boolean;
  [key: string]: unknown;
}

export interface FindContactConnectorParams {
  user: ContactHandlerUser;
  authHeader: string;
  phoneNumber: string;
  overridingFormat?: unknown;
  isExtension?: boolean;
  proxyConfig?: ProxyConfig | null;
  tracer?: TraceLogger;
  isForceRefreshAccountData?: boolean;
}

export interface FindContactConnectorResult {
  successful: boolean;
  matchedContactInfo?: ContactInfo[] | null;
  returnMessage?: ReturnMessage | null;
  extraDataTracking?: unknown;
}

export interface CreateContactConnectorParams {
  user: ContactHandlerUser;
  authHeader: string;
  phoneNumber: string;
  newContactName?: string;
  newContactType?: string;
  additionalSubmission?: unknown;
  proxyConfig?: ProxyConfig | null;
}

export interface CreateContactConnectorResult {
  contactInfo?: ContactInfo | ContactInfo[] | null;
  returnMessage?: ReturnMessage | null;
  extraDataTracking?: unknown;
}

export interface FindContactWithNameConnectorParams {
  user: ContactHandlerUser;
  authHeader: string;
  name: string;
  proxyConfig?: ProxyConfig | null;
}

export interface ContactConnectorImplementation {
  getAuthType(params: ContactAuthParams): ContactAuthType | Promise<ContactAuthType>;
  getBasicAuth(params: { apiKey?: unknown }): string;
  getOauthInfo(params: ContactOAuthInfoParams): OAuthInfo | Promise<OAuthInfo>;
  findContact(params: FindContactConnectorParams): FindContactConnectorResult | Promise<FindContactConnectorResult>;
  createContact(params: CreateContactConnectorParams): CreateContactConnectorResult | Promise<CreateContactConnectorResult>;
  findContactWithName(params: FindContactWithNameConnectorParams): FindContactConnectorResult | Promise<FindContactConnectorResult>;
}
