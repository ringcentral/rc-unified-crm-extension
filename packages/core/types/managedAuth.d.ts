import type { AppConnectManifest } from './manifest';

export type ManagedAuthValue = unknown;

export type ManagedAuthValues = Record<string, ManagedAuthValue>;

export interface ManagedAuthStoredValue {
  version?: number;
  encrypted?: boolean;
  value?: string;
  [key: string]: unknown;
}

export interface ManagedAuthStoredData {
  rcExtensionId?: string | number;
  rcUserName?: string;
  fields?: Record<string, ManagedAuthStoredValue | unknown>;
  failedAt?: string;
  [key: string]: unknown;
}

export interface ManagedAuthRecord {
  id?: string;
  dataKey?: string;
  data?: ManagedAuthStoredData;
  update(values: Record<string, unknown>): Promise<unknown>;
  destroy?(): Promise<unknown>;
  [key: string]: any;
}

export interface ManagedAuthFieldDefinition {
  const: string;
  required?: boolean;
  managed?: boolean;
  managedScope?: 'account' | 'user' | (string & {});
  managedFieldType?: 'input' | 'dynamic' | (string & {});
  [key: string]: unknown;
}

export interface ManagedAuthOption {
  value: string;
  label: string;
}

export interface GetManagedAuthOptionsParams extends ManagedAuthFieldDefinitionParams {
  fieldConst: string;
  accountValues?: ManagedAuthValues;
}

export interface ConnectorManagedAuthOptionsParams {
  fieldConst: string;
  accountValues: ManagedAuthValues;
}

export interface ManagedAuthAccountParams {
  rcAccountId?: string | number;
  platform?: string;
}

export interface ManagedAuthFieldDefinitionParams extends ManagedAuthAccountParams {
  devRcAccountId?: string | number;
  connectorId?: string;
  isPrivate?: boolean;
}

export interface ManagedAuthUserParams extends ManagedAuthAccountParams {
  rcExtensionId?: string | number;
}

export interface ManagedAuthLoginFailureParams extends ManagedAuthUserParams {}

export interface UpsertOrgManagedAuthValuesParams extends ManagedAuthAccountParams {
  values?: ManagedAuthValues;
  fieldsToRemove?: string[];
}

export interface UpsertUserManagedAuthValuesParams extends ManagedAuthUserParams {
  rcUserName?: string;
  values?: ManagedAuthValues;
  fieldsToRemove?: string[];
}

export interface ManagedAuthAdminSettingsParams extends ManagedAuthFieldDefinitionParams {}

export interface ManagedAuthStateParams extends ManagedAuthFieldDefinitionParams {
  rcExtensionId?: string | number;
}

export interface ResolveApiKeyLoginFieldsParams extends ManagedAuthStateParams {
  apiKey?: unknown;
  additionalInfo?: ManagedAuthValues;
  preferSubmittedValuesForManagedFields?: boolean;
}

export interface PersistSubmittedManagedValuesParams extends ManagedAuthUserParams {
  rcUserName?: string;
  submittedManagedValues?: {
    org?: ManagedAuthValues;
    user?: ManagedAuthValues;
    [key: string]: unknown;
  };
}

export interface StoredFieldValue {
  hasValue: boolean;
  value: unknown;
}

export interface ManagedAuthAdminUserEntry {
  rcExtensionId: string | number;
  rcUserName: string;
  fields: Record<string, ManagedAuthStoredValue | unknown>;
}

export interface ManagedAuthState {
  hasManagedAuth: boolean;
  allRequiredFieldsSatisfied: boolean;
  visibleFieldConsts: string[] | null;
  missingRequiredFieldConsts: string[];
  fallbackToManualAuth: boolean;
}

export interface ResolveApiKeyLoginFieldsResult {
  resolvedAdditionalInfo: ManagedAuthValues;
  resolvedApiKey?: unknown;
  missingRequiredFieldConsts: string[];
}

export interface DeveloperPortalManifestProvider {
  getConnectorManifest(params: ManagedAuthFieldDefinitionParams): Promise<AppConnectManifest | null | undefined>;
}
