import type { ReturnMessage, UserSettings } from './common';

export interface TraceLogger {
  trace(event: string, data?: unknown): void;
  traceError(event: string, error: unknown, data?: unknown): void;
}

export interface RefreshUserInfoParams {
  platform: string;
  userId: string | number;
  tracer?: TraceLogger;
}

export interface HandlerResult {
  successful?: boolean;
  returnMessage?: ReturnMessage;
  isRevokeUserSession?: boolean;
  [key: string]: unknown;
}

export interface UserSettingsByAdminParams {
  rcAccessToken?: string;
  rcAccountId?: string | number | null;
}

export interface UserSettingsByAdminResult {
  userSettings?: UserSettings;
}

export interface GetUserSettingsParams extends UserSettingsByAdminParams {
  user?: {
    userSettings?: UserSettings;
    [key: string]: unknown;
  } | null;
}

export interface UpdateUserSettingsParams {
  user: {
    userSettings?: UserSettings;
    update(values: { userSettings: UserSettings }): Promise<unknown>;
    [key: string]: unknown;
  };
  userSettings?: UserSettings;
  settingKeysToRemove: string[];
  platformName: string;
}
