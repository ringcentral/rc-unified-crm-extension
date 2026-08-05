import type { JsonObject } from './json';
import type { PlatformManifest } from './manifest';

export type PluginAccess = 'public' | 'private' | 'shared' | (string & {});

export type PluginLogType = 'call' | 'sms' | 'fax' | (string & {});

export interface PluginManifest extends PlatformManifest {
  endpointUrl: string;
  supportedLogTypes: PluginLogType[];
  isAsync?: boolean;
  tokenSyncUrl?: string;
  userRegisterEndpointUrl?: string;
  licenseStatusUrl?: string;
  jwtToken?: string;
  phase?: string;
  access?: PluginAccess;
}

export interface InstalledPlugin {
  id: string;
  data: PluginManifest;
}

export interface AsyncPluginTaskData {
  type: 'asyncPluginTask';
  asyncTaskId: string;
  callbackUrl: string;
  pluginId: string;
  platform: string;
  logType: PluginLogType;
  operation: string;
  userId: string | number;
  rcAccountId?: string | number;
  sessionId?: string;
  extensionNumber?: string;
  hashedExtensionId?: string;
  callLogId?: string | number;
  thirdPartyLogId?: string | number;
  contactId?: string | number;
  incomingData: unknown;
  hashedAccountId?: string;
  isFromSSCL?: boolean;
  [key: string]: unknown;
}

export interface PluginInvocationBody {
  data: unknown;
  config?: JsonObject | null;
  asyncTaskId?: string;
  callbackUrl?: string;
  hashedExtensionId?: string;
}

export interface PluginLicenseStatus {
  licenseStatus: boolean;
  licenseStatusDescription?: string;
  [key: string]: unknown;
}

export interface ResolvePluginManifestResult {
  pluginData: {
    platforms?: Record<string, PluginManifest>;
    [key: string]: unknown;
  };
  pluginManifest: PluginManifest;
  platformKey: string;
}

export interface RegisterPluginAccountResult {
  successful: true;
  registerUrl: string;
  jwtToken: string;
}
