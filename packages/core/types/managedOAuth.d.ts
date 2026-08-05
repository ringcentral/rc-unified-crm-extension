export type ManagedOAuthValue = unknown;

export type ManagedOAuthValues = Record<string, ManagedOAuthValue>;

export interface ManagedOAuthStoredValue {
  version?: number;
  encrypted?: boolean;
  value?: string;
  [key: string]: unknown;
}

export interface ManagedOAuthStoredData {
  fields?: Record<string, ManagedOAuthStoredValue | unknown>;
  [key: string]: unknown;
}

export interface ManagedOAuthRecord {
  id?: string;
  data?: ManagedOAuthStoredData;
  expiry?: Date | string | number;
  update(values: Record<string, unknown>): Promise<unknown>;
  destroy(): Promise<unknown>;
  [key: string]: unknown;
}

export interface ManagedOAuthAccountParams {
  rcAccountId?: string | number;
  platform?: string;
}

export interface ManagedOAuthPendingParams {
  rcAccountId?: string | number;
}

export interface ManagedOAuthStateParams extends ManagedOAuthAccountParams {
  isAdmin?: boolean;
}

export interface UpsertPendingManagedOAuthParams extends ManagedOAuthPendingParams {
  values?: ManagedOAuthValues;
}

export interface ManagedOAuthState {
  isAdmin: boolean;
  hasAccountOAuth: boolean;
  hasPendingOAuth: boolean;
  oauthValues?: ManagedOAuthValues;
  pendingValues?: ManagedOAuthValues;
}

export interface ManagedOAuthResolution {
  source: 'account' | 'pending' | null;
  oauthInfo: ManagedOAuthValues | null;
}

export interface ResetManagedOAuthResult {
  deletedAccountCount: number;
  deletedPendingCount: number;
}
