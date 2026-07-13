import { z } from 'zod';
import { JsonMapSchema, ReturnMessageSchema } from './common';

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
});

export const ApiKeyLoginResponseSchema = z.looseObject({
  jwtToken: z.string().describe(
    'App Connect JWT used to authenticate subsequent user operations.',
  ),
  name: z.string().describe('Display name returned by the CRM connector.').optional(),
  returnMessage: ReturnMessageSchema.optional(),
});

export const AuthValidationResponseSchema = z.looseObject({
  successful: z.boolean(),
  returnMessage: ReturnMessageSchema.optional(),
});

export const ManagedAuthStateResponseSchema = z.looseObject({
  hasManagedAuth: z.boolean(),
  allRequiredFieldsSatisfied: z.boolean(),
  visibleFieldConsts: z.array(z.string()).nullable(),
  missingRequiredFieldConsts: z.array(z.string()),
  fallbackToManualAuth: z.boolean(),
});

export const ManagedOAuthStateResponseSchema = z.looseObject({
  isAdmin: z.boolean(),
  hasAccountOAuth: z.boolean(),
  hasPendingOAuth: z.boolean(),
  oauthValues: JsonMapSchema.optional(),
  pendingValues: JsonMapSchema.optional(),
});

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
