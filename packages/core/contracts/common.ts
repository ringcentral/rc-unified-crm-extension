import { z } from 'zod';

export const EntityIdSchema = z.union([
  z.string(),
  z.number(),
]).describe('Connector-defined entity identifier, represented as a string or number.');

export const NullableEntityIdSchema = z.union([
  z.string().nullable(),
  z.number().nullable(),
]).describe('Connector-defined entity identifier, or null when the connector has no value.');

export const JsonMapSchema = z.looseObject({}).describe(
  'Extensible JSON object whose fields are defined by the selected connector or workflow.',
);

export const ReturnMessageSchema = z.looseObject({
  message: z.string().describe('User-facing status or error message.').optional(),
  messageType: z.string().describe(
    'Presentation severity. Common values are success, info, warning, danger, and error.',
  ).optional(),
  ttl: z.number().int().min(0).max(2_147_483_647).meta({ format: 'int32' }).describe(
    'Suggested notification display time in milliseconds.',
  ).optional(),
  details: z.array(JsonMapSchema).describe(
    'Optional structured details for clients that can present more than the main message.',
  ).optional(),
}).describe(
  'Optional user-facing notification returned by connector and App Connect workflows.',
);

export const BasicMutationResponseSchema = z.looseObject({
  successful: z.boolean().describe('Whether the requested operation completed successfully.'),
  returnMessage: z.union([
    ReturnMessageSchema,
    z.string(),
  ]).describe(
    'Optional status message. Most routes return a structured notification; a few legacy routes return plain text.',
  ).optional(),
}).describe('Standard result envelope for an App Connect mutation.');

export type EntityId = z.input<typeof EntityIdSchema>;
export type ReturnMessage = z.input<typeof ReturnMessageSchema>;
export type BasicMutationResponse = z.input<typeof BasicMutationResponseSchema>;
