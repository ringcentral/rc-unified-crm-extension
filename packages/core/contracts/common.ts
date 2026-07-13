import { z } from 'zod';

export const EntityIdSchema = z.union([
  z.string(),
  z.number(),
]);

export const NullableEntityIdSchema = z.union([
  z.string().nullable(),
  z.number().nullable(),
]);

export const JsonMapSchema = z.looseObject({});

export const ReturnMessageSchema = z.looseObject({
  message: z.string().optional(),
  messageType: z.string().describe(
    'Presentation severity. Common values are success, info, warning, danger, and error.',
  ).optional(),
  ttl: z.number().int().min(0).max(2_147_483_647).meta({ format: 'int32' }).optional(),
  details: z.array(JsonMapSchema).optional(),
});

export const BasicMutationResponseSchema = z.looseObject({
  successful: z.boolean(),
  returnMessage: ReturnMessageSchema.optional(),
});

export type EntityId = z.input<typeof EntityIdSchema>;
export type ReturnMessage = z.input<typeof ReturnMessageSchema>;
export type BasicMutationResponse = z.input<typeof BasicMutationResponseSchema>;
