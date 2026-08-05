import { z } from 'zod';
import { EntityIdSchema, JsonMapSchema } from './common';

export const AdminSuccessMessageSchema = z.string().describe(
  'Plain-text confirmation returned after an administrator update succeeds.',
);

export const AdminSettingsUpdateRequestSchema = z.looseObject({
  adminSettings: JsonMapSchema.describe(
    'Account-level App Connect configuration, including user-setting overrides and optional custom-connector data.',
  ),
}).describe('Account-level App Connect settings submitted by a RingCentral administrator.');

export const ManagedAuthFieldDefinitionSchema = z.looseObject({
  const: z.string().describe('Stable field identifier declared in the connector manifest.'),
  required: z.boolean().describe('Whether login requires a value for this field.').optional(),
  managed: z.boolean().describe('Whether an administrator supplies this field.').optional(),
  managedScope: z.enum(['account', 'user']).describe(
    'Whether one value is shared by the RingCentral account or stored separately per extension.',
  ).optional(),
}).describe('Connector credential field that supports administrator-managed storage.');

export const StoredFieldValueSchema = z.looseObject({
  hasValue: z.boolean().describe('Whether a non-empty value is stored for the field.'),
  value: z.unknown().describe(
    'Sensitive decrypted value returned to the authenticated administrator, or an empty string when unset.',
  ),
}).describe('Administrator view of one stored managed-auth value.');

export const ManagedAuthAdminUserValueSchema = z.looseObject({
  rcExtensionId: EntityIdSchema.describe('RingCentral extension that owns these user-scoped values.'),
  rcUserName: z.string().describe('Display name associated with the RingCentral extension.'),
  fields: z.record(z.string(), StoredFieldValueSchema).describe(
    'Stored user-scoped values keyed by connector field identifier.',
  ),
}).describe('Managed-auth values stored for one RingCentral extension.');

export const ManagedAuthAdminResponseSchema = z.looseObject({
  hasManagedAuth: z.boolean().describe(
    'Whether the connector declares any administrator-managed authentication fields.',
  ),
  fields: z.array(ManagedAuthFieldDefinitionSchema).describe('All managed field definitions.'),
  orgFields: z.array(ManagedAuthFieldDefinitionSchema).describe(
    'Managed fields whose values are shared across the RingCentral account.',
  ),
  userFields: z.array(ManagedAuthFieldDefinitionSchema).describe(
    'Managed fields whose values are stored separately for each RingCentral extension.',
  ),
  orgValues: z.record(z.string(), StoredFieldValueSchema).describe(
    'Account-scoped stored values keyed by connector field identifier.',
  ),
  userValues: z.array(ManagedAuthAdminUserValueSchema).describe(
    'User-scoped stored values grouped by RingCentral extension.',
  ),
}).describe('Administrator-facing managed-auth definitions and currently stored values.');

const ManagedAuthUpdateFieldsSchema = {
  values: JsonMapSchema.describe('Field values to create or replace, keyed by field identifier.').optional(),
  fieldsToRemove: z.array(z.string()).describe(
    'Field identifiers whose stored values should be deleted.',
  ).optional(),
} as const;

export const ManagedAuthUpdateRequestSchema = z.discriminatedUnion('scope', [
  z.looseObject({
    scope: z.literal('org').describe('Update values shared by the RingCentral account.'),
    ...ManagedAuthUpdateFieldsSchema,
  }),
  z.looseObject({
    scope: z.literal('user').describe('Update values for one RingCentral extension.'),
    rcExtensionId: EntityIdSchema.describe('RingCentral extension that owns the values.'),
    rcUserName: z.string().describe('Optional display name stored with the extension values.').optional(),
    ...ManagedAuthUpdateFieldsSchema,
  }),
]).describe('Account-scoped or extension-scoped managed-auth value update.');

export const ManagedOAuthValuesSchema = z.looseObject({
  clientId: z.string().describe('OAuth client identifier configured for the CRM provider.').optional(),
  clientSecret: z.string().meta({ format: 'password', writeOnly: true }).describe(
    'OAuth client secret. Treat this value as sensitive and never log it.',
  ).optional(),
  accessTokenUri: z.string().describe('OAuth token endpoint URL.').optional(),
  authorizationUri: z.string().describe('OAuth authorization endpoint URL.').optional(),
  redirectUri: z.string().describe('Redirect URI registered with the CRM OAuth application.').optional(),
  scopes: z.union([z.string(), z.array(z.string())]).describe(
    'Requested OAuth scopes, supplied as one provider-formatted string or a list of scope names.',
  ).optional(),
  hostname: z.string().describe('Optional tenant-specific CRM hostname used by the OAuth flow.').optional(),
}).describe('Administrator-supplied values used to configure account-scoped CRM OAuth.');

export const AdminManagedOAuthCacheRequestSchema = z.looseObject({
  values: ManagedOAuthValuesSchema.describe(
    'OAuth values to hold until the administrator completes or cancels authorization.',
  ).optional(),
}).describe('Pending managed OAuth configuration to cache for the RingCentral account.');

export type AdminSuccessMessage = z.input<typeof AdminSuccessMessageSchema>;
export type AdminSettingsUpdateRequest = z.input<typeof AdminSettingsUpdateRequestSchema>;
export type ManagedAuthAdminResponse = z.input<typeof ManagedAuthAdminResponseSchema>;
export type ManagedAuthUpdateRequest = z.input<typeof ManagedAuthUpdateRequestSchema>;
export type AdminManagedOAuthCacheRequest = z.input<typeof AdminManagedOAuthCacheRequestSchema>;

export const adminSettingsUpdateRequestExample = {
  adminSettings: {
    userSettings: {
      autoLogCalls: true,
      autoLogMessages: false,
    },
  },
} satisfies AdminSettingsUpdateRequest;

export const managedAuthAdminResponseExample = {
  hasManagedAuth: true,
  fields: [
    { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
    { const: 'userToken', required: true, managed: true, managedScope: 'user' },
  ],
  orgFields: [
    { const: 'tenantId', required: true, managed: true, managedScope: 'account' },
  ],
  userFields: [
    { const: 'userToken', required: true, managed: true, managedScope: 'user' },
  ],
  orgValues: {
    tenantId: { hasValue: true, value: 'tenant.example' },
  },
  userValues: [
    {
      rcExtensionId: '101',
      rcUserName: 'Ada Lovelace',
      fields: {
        userToken: { hasValue: true, value: 'configured' },
      },
    },
  ],
} satisfies ManagedAuthAdminResponse;

export const managedAuthOrgUpdateExample = {
  scope: 'org',
  values: { tenantId: 'tenant.example' },
  fieldsToRemove: ['legacyTenantId'],
} satisfies ManagedAuthUpdateRequest;

export const managedAuthUserUpdateExample = {
  scope: 'user',
  rcExtensionId: '101',
  rcUserName: 'Ada Lovelace',
  values: { userToken: 'example-user-token' },
  fieldsToRemove: ['oldUserToken'],
} satisfies ManagedAuthUpdateRequest;

export const managedOAuthCacheRequestExample = {
  values: {
    clientId: 'managed-oauth-client',
    clientSecret: 'example-client-secret',
    authorizationUri: 'https://crm.example.com/oauth/authorize',
    accessTokenUri: 'https://crm.example.com/oauth/token',
    scopes: ['contacts.read', 'activities.write'],
  },
} satisfies AdminManagedOAuthCacheRequest;

export const adminSettingsUpdatedExample = 'Admin settings updated' satisfies AdminSuccessMessage;
export const managedAuthUpdatedExample = 'Shared authentication updated' satisfies AdminSuccessMessage;
export const successfulAdminMutationExample = { successful: true } as const;
