import type { JsonObject, JsonValue } from './json';

export type MessageType =
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'error'
  | (string & {});

export interface ReturnMessage {
  message?: string;
  messageType?: MessageType;
  ttl?: number;
  [key: string]: JsonValue | undefined;
}

export interface UserSetting<TValue = unknown> {
  value?: TValue;
  isCustomizable?: boolean;
  [key: string]: unknown;
}

export type UserSettings = Record<string, UserSetting>;

export interface AppConnectUser {
  id: string;
  rcAccountId?: string | number;
  accountId?: string | number;
  hashedRcExtensionId?: string;
  crmPlatform?: string;
  hostname?: string;
  token?: string;
  timezoneOffset?: string | number;
  userSettings?: UserSettings;
  platformAdditionalInfo?: JsonObject;
  [key: string]: unknown;
}

export interface ContactInfo {
  id?: string | number;
  name?: string;
  type?: string;
  phoneNumber?: string;
  [key: string]: unknown;
}
