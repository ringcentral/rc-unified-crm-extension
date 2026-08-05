import type { OAuthInfo } from './auth';
import type { ReturnMessage } from './common';
import type { ProxyConfig } from './connector';

export interface AdminConfigRecord {
  id?: string;
  adminAccessToken?: string;
  adminRefreshToken?: string;
  adminTokenExpiry?: Date | string | number;
  userMappings?: AdminUserMapping[];
  update(values: Record<string, unknown>): Promise<unknown>;
  [key: string]: any;
}

export interface AdminUserMapping {
  crmUserId?: string | number;
  rcExtensionId?: string | number | Array<string | number>;
  [key: string]: any;
}

export interface AdminHandlerUser {
  id?: string | number;
  platform: string;
  hostname?: string;
  accessToken?: string | null;
  rcAccountId?: string | number;
  platformAdditionalInfo?: {
    proxyId?: string;
    tokenUrl?: string;
    [key: string]: unknown;
  } | null;
  [key: string]: any;
}

export interface RcExtensionInfo {
  id: string | number;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  extensionNumber?: string | number;
  [key: string]: any;
}

export interface CrmUserInfo {
  id: string | number;
  name?: string;
  email?: string;
  [key: string]: any;
}

export interface AdminConnectorImplementation {
  getAuthType(params: { proxyId?: string; proxyConfig?: ProxyConfig | null }): string | Promise<string>;
  getBasicAuth(params: { apiKey?: unknown }): string;
  getOauthInfo(params: { tokenUrl?: unknown; hostname?: unknown; proxyId?: string; proxyConfig?: ProxyConfig | null }): OAuthInfo | Promise<OAuthInfo>;
  getUserList?(params: { user: AdminHandlerUser; authHeader: string; proxyConfig?: ProxyConfig | null }): CrmUserInfo[] | Promise<CrmUserInfo[]>;
  getServerLoggingSettings?(params: { user: AdminHandlerUser }): unknown | Promise<unknown>;
  updateServerLoggingSettings?(params: { user: AdminHandlerUser; additionalFieldValues?: unknown; oauthApp?: unknown }): { successful?: boolean; returnMessage?: ReturnMessage } | Promise<{ successful?: boolean; returnMessage?: ReturnMessage }>;
  [key: string]: unknown;
}

export interface ValidateRcUserTokenParams {
  rcAccessToken?: string;
}

export interface ValidateRcUserTokenResult {
  rcAccountId: string;
  rcExtensionId: string;
}

export interface ValidateAdminRoleParams {
  rcAccessToken: string;
}

export interface ValidateAdminRoleResult {
  isValidated: boolean;
  rcAccountId: string | number;
}

export interface UpsertAdminSettingsParams {
  hashedRcAccountId: string;
  adminSettings: Record<string, unknown>;
}

export interface AdminSettingsParams {
  hashedRcAccountId: string;
}

export interface UpdateAdminRcTokensParams {
  hashedRcAccountId: string;
  adminAccessToken?: string;
  adminRefreshToken?: string;
  adminTokenExpiry?: Date | string | number;
}

export interface ServerLoggingSettingsParams {
  user: AdminHandlerUser;
}

export interface UpdateServerLoggingSettingsParams extends ServerLoggingSettingsParams {
  additionalFieldValues?: unknown;
}

export interface AdminReportParams {
  rcAccountId: string | number;
  timezone?: string;
  timeFrom?: string;
  timeTo?: string;
  groupBy?: string;
}

export interface UserReportParams extends AdminReportParams {
  rcExtensionId?: string | number;
}

export interface UserMappingParams {
  user: AdminHandlerUser;
  hashedRcAccountId: string;
  rcExtensionList: RcExtensionInfo[];
}

export interface UserMappingResultItem {
  crmUser: {
    id: string | number;
    name: string;
    email: string;
  };
  rcUser: Array<{
    extensionId: string | number;
    name: string;
    extensionNumber: string | number;
    email: string;
  }>;
}

export interface RingCentralSdkLike {
  refreshToken(params: Record<string, unknown>): Promise<Record<string, any>>;
  getCallsAggregationData(params: Record<string, unknown>): Promise<Record<string, any>>;
  getCallLogData(params: Record<string, unknown>): Promise<{ records: any[] }>;
  getSMSData(params: Record<string, unknown>): Promise<{ records: any[] }>;
}
