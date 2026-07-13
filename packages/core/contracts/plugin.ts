import { z } from 'zod';
import { EntityIdSchema } from './common';

export const PluginRegisterRequestSchema = z.strictObject({
  pluginId: z.string().min(1).describe('Plugin identifier from the developer portal.'),
  rcAccountId: EntityIdSchema.describe('RingCentral account that will receive the plugin.'),
  ownerRcAccountId: EntityIdSchema.describe('RingCentral account that owns a shared plugin.').optional(),
  pluginAccess: z.string().describe('Plugin access mode, such as private, shared, or public.').optional(),
  pluginName: z.string().describe('Human-readable plugin name.').optional(),
  rcAccessToken: z.string().meta({
    format: 'password',
    writeOnly: true,
    deprecated: true,
    description: 'Legacy body location for a RingCentral access token. Use the X-RC-Access-Token header instead.',
  }).optional(),
});

export const PluginMutationResponseSchema = z.looseObject({
  successful: z.boolean(),
  returnMessage: z.string().optional(),
});

export type PluginRegisterRequest = z.input<typeof PluginRegisterRequestSchema>;
export type PluginMutationResponse = z.input<typeof PluginMutationResponseSchema>;

export const pluginRegisterRequestExample = {
  pluginId: 'plugin.example',
  rcAccountId: '123456789',
  pluginAccess: 'shared',
  pluginName: 'Example CRM workflow',
} satisfies PluginRegisterRequest;

export const pluginMutationResponseExample = {
  successful: true,
} satisfies PluginMutationResponse;
