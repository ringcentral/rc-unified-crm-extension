import { z } from 'zod';
import { EntityIdSchema, JsonMapSchema, ReturnMessageSchema } from './common';

export const ApiKeyLoginRequestSchema = z.strictObject({
  platform: z.string().min(1).meta({
    description: 'Connector platform identifier from the App Connect manifest.',
    example: 'exampleCRM',
  }),
  apiKey: z.string().meta({
    format: 'password',
    writeOnly: true,
    description: 'Primary connector credential. It can be omitted when managed authentication supplies the value.',
  }).optional(),
  rcAccessToken: z.string().meta({
    format: 'password',
    writeOnly: true,
    deprecated: true,
    description: 'Legacy body location for a RingCentral access token. Use the X-RC-Access-Token header instead.',
  }).optional(),
  rcAccountId: EntityIdSchema.meta({
    deprecated: true,
    description: 'Ignored browser-client compatibility field. The server derives the RingCentral account from rcAccessToken.',
  }).optional(),
  rcExtensionId: EntityIdSchema.meta({
    deprecated: true,
    description: 'Ignored browser-client compatibility field. The server derives the RingCentral extension from rcAccessToken.',
  }).optional(),
  userEmail: z.string().meta({
    deprecated: true,
    description: 'Ignored browser-client compatibility field. Connector credential fields belong in additionalInfo.',
  }).optional(),
  hostname: z.string().describe(
    'Optional connector host name for CRM deployments with tenant-specific endpoints.',
  ).optional(),
  proxyId: z.string().describe('Optional proxy connector identifier.').optional(),
  connectorId: z.string().describe(
    'Developer Portal connector identifier used to resolve managed authentication fields.',
  ).optional(),
  isPrivate: z.boolean().meta({
    default: false,
    description: 'Whether connectorId identifies a private connector.',
  }).optional(),
  additionalInfo: JsonMapSchema.describe(
    'Connector-defined credential fields, such as tenant or user identifiers.',
  ).optional(),
}).describe(
  'Credentials and connector context used to establish an App Connect session for an API-key connector.',
);

export const ApiKeyLoginResponseSchema = z.looseObject({
  jwtToken: z.string().describe(
    'App Connect JWT used to authenticate subsequent user operations.',
  ),
  name: z.string().describe('Display name returned by the CRM connector.').optional(),
  returnMessage: ReturnMessageSchema.describe(
    'Optional connector message about the completed login.',
  ).optional(),
}).describe('Successful API-key login result and the new App Connect session token.');

export const AuthValidationResponseSchema = z.looseObject({
  successful: z.boolean().describe(
    'Whether the connector considers the stored CRM authorization valid.',
  ),
  returnMessage: ReturnMessageSchema.describe(
    'Optional connector message explaining the validation result.',
  ).optional(),
}).describe('Result of validating the current user\'s stored CRM authorization.');

export const ManagedAuthStateResponseSchema = z.looseObject({
  hasManagedAuth: z.boolean().describe(
    'Whether the selected connector declares administrator-managed API-key fields.',
  ),
  allRequiredFieldsSatisfied: z.boolean().describe(
    'Whether every required login field can be resolved from managed storage; required manual fields make this false.',
  ),
  visibleFieldConsts: z.array(z.string()).nullable().describe(
    'Required credential field identifiers that the login form should display; null means no visibility override and allows the complete manual form.',
  ),
  missingRequiredFieldConsts: z.array(z.string()).describe(
    'Required credential field identifiers that are not currently available from managed storage, including unmanaged fields that must be entered manually.',
  ),
  fallbackToManualAuth: z.boolean().describe(
    'Whether a previous managed-auth login failure marked this account and extension to retry with manual credentials.',
  ),
}).describe(
  'Readiness of administrator-managed API-key credentials for a RingCentral account and extension.',
);

export const ManagedOAuthStateResponseSchema = z.looseObject({
  isAdmin: z.boolean().describe('Whether the supplied RingCentral token belongs to an account administrator.'),
  hasAccountOAuth: z.boolean().describe(
    'Whether completed account-scoped OAuth configuration exists for the connector.',
  ),
  hasPendingOAuth: z.boolean().describe(
    'Whether administrator-supplied OAuth values are cached for an unfinished authorization flow.',
  ),
  oauthValues: JsonMapSchema.describe(
    'Completed managed OAuth values that are safe to return to the requesting client.',
  ).optional(),
  pendingValues: JsonMapSchema.describe(
    'Cached values for the administrator\'s in-progress OAuth setup. This object can contain sensitive client credentials.',
  ).optional(),
}).describe('Account-level managed OAuth setup state for the selected connector.');

export type ApiKeyLoginRequest = z.input<typeof ApiKeyLoginRequestSchema>;
export type ApiKeyLoginResponse = z.input<typeof ApiKeyLoginResponseSchema>;
export type AuthValidationResponse = z.input<typeof AuthValidationResponseSchema>;
export type ManagedAuthStateResponse = z.input<typeof ManagedAuthStateResponseSchema>;
export type ManagedOAuthStateResponse = z.input<typeof ManagedOAuthStateResponseSchema>;

export const apiKeyLoginRequestExample = {
  platform: 'exampleCRM',
  apiKey: 'example-api-key',
  hostname: 'crm.example.com',
} satisfies ApiKeyLoginRequest;

export const apiKeyLoginResponseExample = {
  jwtToken: 'eyJhbGciOiJIUzI1NiJ9.example.signature',
  name: 'Ada Lovelace',
  returnMessage: {
    message: 'Connected successfully.',
    messageType: 'success',
    ttl: 3000,
  },
} satisfies ApiKeyLoginResponse;

export const authValidationResponseExample = {
  successful: true,
  returnMessage: {
    message: 'Authentication is valid.',
    messageType: 'success',
    ttl: 1000,
  },
} satisfies AuthValidationResponse;

export const managedAuthStateResponseExample = {
  hasManagedAuth: false,
  allRequiredFieldsSatisfied: false,
  visibleFieldConsts: null,
  missingRequiredFieldConsts: ['apiKey'],
  fallbackToManualAuth: false,
} satisfies ManagedAuthStateResponse;

export const managedOAuthStateResponseExample = {
  isAdmin: false,
  hasAccountOAuth: false,
  hasPendingOAuth: false,
} satisfies ManagedOAuthStateResponse;
