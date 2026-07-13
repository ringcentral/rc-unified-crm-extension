import { z } from 'zod';
import {
  BasicMutationResponseSchema,
  EntityIdSchema,
  JsonMapSchema,
  NullableEntityIdSchema,
  ReturnMessageSchema,
} from './common';

export const AdditionalSubmissionSchema = JsonMapSchema.describe(
  'Connector-defined custom fields collected by the App Connect client.',
);

export const ContactInfoSchema = z.looseObject({
  id: EntityIdSchema.optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  phoneNumber: z.string().optional(),
  type: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  email: z.string().optional(),
  createdDate: z.string().optional(),
  mostRecentActivityDate: z.string().optional(),
  additionalInfo: JsonMapSchema.optional(),
  isNewContact: z.boolean().optional(),
});

export const CallLogMutationResponseSchema = z.looseObject({
  successful: z.boolean(),
  logId: EntityIdSchema.optional(),
  returnMessage: ReturnMessageSchema.optional(),
});

export const MessageLogResponseSchema = z.looseObject({
  successful: z.boolean(),
  returnMessage: z.union([ReturnMessageSchema, z.null()]).optional(),
  logIds: z.array(EntityIdSchema).optional(),
});

export const CallDispositionItemSchema = z.looseObject({
  id: EntityIdSchema.optional(),
  value: z.unknown().optional(),
});

export const CallDispositionRequestSchema = z.looseObject({
  sessionId: z.string().min(1),
  extensionNumber: NullableEntityIdSchema.describe(
    'Legacy RingCentral extension-number identity fallback.',
  ).optional(),
  hashedExtensionId: NullableEntityIdSchema.describe(
    'Hashed RingCentral extension id used to find the local call-log mapping.',
  ).optional(),
  dispositions: z.array(CallDispositionItemSchema).optional(),
  additionalSubmission: AdditionalSubmissionSchema.describe(
    'Accepted for client compatibility; the current call-disposition handler does not persist or forward these values.',
  ).optional(),
});

export type ContactInfo = z.input<typeof ContactInfoSchema>;
export type CallLogMutationResponse = z.input<typeof CallLogMutationResponseSchema>;
export type MessageLogResponse = z.input<typeof MessageLogResponseSchema>;
export type CallDispositionRequest = z.input<typeof CallDispositionRequestSchema>;

export const callLogMutationResponseExample = {
  successful: true,
  logId: 42,
  returnMessage: {
    message: 'Call logged.',
    messageType: 'success',
    ttl: 3000,
  },
} satisfies CallLogMutationResponse;

export const messageLogResponseExample = {
  successful: true,
  logIds: [101, 102],
  returnMessage: {
    message: 'Messages logged.',
    messageType: 'success',
    ttl: 3000,
  },
} satisfies MessageLogResponse;

export const messageLogNoOpResponseExample = {
  successful: true,
  logIds: [],
  returnMessage: null,
} satisfies MessageLogResponse;

export const callDispositionRequestExample = {
  sessionId: 's-a1b2c3d4',
  extensionNumber: '101',
  hashedExtensionId: 'c16b7b40d7a9d5b5f6d8f633f0e362af',
  dispositions: [
    {
      id: 'qualified-lead',
      value: 'Qualified lead',
    },
  ],
} satisfies CallDispositionRequest;

export const basicMutationResponseExample = {
  successful: true,
  returnMessage: {
    message: 'Disposition saved.',
    messageType: 'success',
    ttl: 3000,
  },
} satisfies z.input<typeof BasicMutationResponseSchema>;
