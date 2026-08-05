import { z } from 'zod';
import {
  BasicMutationResponseSchema,
  EntityIdSchema,
  JsonMapSchema,
  NullableEntityIdSchema,
  ReturnMessageSchema,
} from './common';

export const AdditionalSubmissionSchema = JsonMapSchema.describe(
  'Connector-defined logging fields assembled by the browser client or server-side logging service, including Bullhorn note actions, Clio billing state, and administrator-assignment metadata when configured.',
);

export const ContactInfoSchema = z.looseObject({
  id: EntityIdSchema.describe(
    'CRM record identifier. The synthetic create-new-contact choice uses the exact sentinel createNewContact.',
  ).optional(),
  name: z.string().describe('CRM contact display name.').optional(),
  phone: z.string().describe('Phone number associated with the matched contact.').optional(),
  phoneNumber: z.string().describe('Compatibility alias for the matched contact phone number.').optional(),
  type: z.string().describe('CRM entity type, such as Contact, Lead, or Candidate.').optional(),
  title: z.string().describe('Contact job title when supplied by the connector.').optional(),
  company: z.string().describe('Contact company or organization name.').optional(),
  email: z.string().describe('Contact email address.').optional(),
  createdDate: z.string().describe('Connector-formatted CRM record creation date or timestamp.').optional(),
  mostRecentActivityDate: z.string().describe(
    'Connector-formatted date or timestamp of the contact\'s most recent CRM activity.',
  ).optional(),
  additionalInfo: JsonMapSchema.describe(
    'Connector-defined association, ownership, or display metadata for this contact.',
  ).optional(),
  isNewContact: z.boolean().describe(
    'Whether this is a synthetic create-new-contact option rather than an existing CRM record.',
  ).optional(),
}).describe('Connector-normalized CRM contact returned by lookup and create operations.');

export const CallLogMutationResponseSchema = z.looseObject({
  successful: z.boolean().describe('Whether the CRM call activity was created or accepted.'),
  logId: EntityIdSchema.describe('Connector-assigned CRM activity identifier.').optional(),
  returnMessage: ReturnMessageSchema.describe('Optional connector status message.').optional(),
}).describe('Result of creating a CRM call activity.');

export const MessageLogResponseSchema = z.looseObject({
  successful: z.boolean().describe('Whether message logging completed without a connector error.'),
  returnMessage: z.union([ReturnMessageSchema, z.null()]).describe(
    'Optional connector status message; null is used when every message was already logged.',
  ).optional(),
  logIds: z.array(EntityIdSchema).describe(
    'RingCentral message or local conversation-mapping identifiers recorded by this request; an empty list can indicate a no-op.',
  ).optional(),
}).describe('Result of logging an SMS, MMS, fax, voicemail, or message conversation.');

export const CallDispositionRequestSchema = z.looseObject({
  sessionId: z.string().min(1).describe('RingCentral call session identifier.'),
  extensionNumber: NullableEntityIdSchema.describe(
    'Legacy RingCentral extension-number identity fallback.',
  ).optional(),
  hashedExtensionId: NullableEntityIdSchema.describe(
    'Hashed RingCentral extension id used to find the local call-log mapping.',
  ).optional(),
  dispositions: JsonMapSchema.describe(
    'Disposition values keyed by connector-defined field identifier.',
  ).optional(),
  additionalSubmission: AdditionalSubmissionSchema.describe(
    'Accepted for client compatibility; the current call-disposition handler does not persist or forward these values.',
  ).optional(),
}).describe('Call identity and connector-defined dispositions to apply to an existing CRM activity.');

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
  dispositions: {
    outcome: 'Qualified lead',
  },
} satisfies CallDispositionRequest;

export const basicMutationResponseExample = {
  successful: true,
  returnMessage: {
    message: 'Disposition saved.',
    messageType: 'success',
    ttl: 3000,
  },
} satisfies z.input<typeof BasicMutationResponseSchema>;
