import { z } from 'zod';
import { EntityIdSchema } from './common';

export const PluginRegisterRequestSchema = z.strictObject({
  pluginId: z.string().min(1).describe('Plugin identifier from the developer portal.'),
  rcAccountId: EntityIdSchema.describe('RingCentral account that will receive the plugin.'),
  ownerRcAccountId: EntityIdSchema.describe(
    'RingCentral account used to resolve a private or shared plugin manifest.',
  ).optional(),
  pluginAccess: z.string().describe(
    'Manifest lookup mode: public uses the public catalog; private or shared uses ownerRcAccountId; when omitted, the server tries both.',
  ).optional(),
  pluginName: z.string().describe(
    'Plugin platform key used to select the manifest entry when the manifest contains multiple platforms.',
  ).optional(),
  rcAccessToken: z.string().meta({
    format: 'password',
    writeOnly: true,
    deprecated: true,
    description: 'Legacy body location for a RingCentral access token. Use the X-RC-Access-Token header instead.',
  }).optional(),
}).describe('Plugin catalog identity and RingCentral account context used for installation.');

export const PluginMutationResponseSchema = z.looseObject({
  successful: z.boolean().describe('Whether the plugin installation or removal operation completed.'),
  returnMessage: z.string().describe('Optional error or status message.').optional(),
}).describe('Result of installing or removing an account-level plugin registration.');

export type PluginRegisterRequest = z.input<typeof PluginRegisterRequestSchema>;
export type PluginMutationResponse = z.input<typeof PluginMutationResponseSchema>;

export const pluginRegisterRequestExample = {
  pluginId: 'plugin.example',
  rcAccountId: '123456789',
  pluginAccess: 'shared',
  pluginName: 'examplePlugin',
} satisfies PluginRegisterRequest;

export const pluginMutationResponseExample = {
  successful: true,
} satisfies PluginMutationResponse;
