import { z } from 'zod';
import { EntityIdSchema, JsonMapSchema } from './common';

export const AdminSuccessMessageSchema = z.string();

export const AdminSettingsUpdateRequestSchema = z.looseObject({
  adminSettings: JsonMapSchema,
});

export const ManagedAuthFieldDefinitionSchema = z.looseObject({
  const: z.string(),
  required: z.boolean().optional(),
  managed: z.boolean().optional(),
  managedScope: z.enum(['account', 'user']).optional(),
});

export const StoredFieldValueSchema = z.looseObject({
  hasValue: z.boolean(),
  value: z.unknown(),
});

export const ManagedAuthAdminUserValueSchema = z.looseObject({
  rcExtensionId: EntityIdSchema,
  rcUserName: z.string(),
  fields: z.record(z.string(), StoredFieldValueSchema),
});

export const ManagedAuthAdminResponseSchema = z.looseObject({
  hasManagedAuth: z.boolean(),
  fields: z.array(ManagedAuthFieldDefinitionSchema),
  orgFields: z.array(ManagedAuthFieldDefinitionSchema),
  userFields: z.array(ManagedAuthFieldDefinitionSchema),
  orgValues: z.record(z.string(), StoredFieldValueSchema),
  userValues: z.array(ManagedAuthAdminUserValueSchema),
});

const ManagedAuthUpdateFieldsSchema = {
  values: JsonMapSchema.optional(),
  fieldsToRemove: z.array(z.string()).optional(),
} as const;

export const ManagedAuthUpdateRequestSchema = z.discriminatedUnion('scope', [
  z.looseObject({
    scope: z.literal('org'),
    ...ManagedAuthUpdateFieldsSchema,
  }),
  z.looseObject({
    scope: z.literal('user'),
    rcExtensionId: EntityIdSchema,
    rcUserName: z.string().optional(),
    ...ManagedAuthUpdateFieldsSchema,
  }),
]);

export const ManagedOAuthValuesSchema = z.looseObject({
  clientId: z.string().optional(),
  clientSecret: z.string().meta({ format: 'password', writeOnly: true }).optional(),
  accessTokenUri: z.string().optional(),
  authorizationUri: z.string().optional(),
  redirectUri: z.string().optional(),
  scopes: z.union([z.string(), z.array(z.string())]).optional(),
  hostname: z.string().optional(),
});

export const AdminManagedOAuthCacheRequestSchema = z.looseObject({
  values: ManagedOAuthValuesSchema.optional(),
});

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
