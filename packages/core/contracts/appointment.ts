import { z } from 'zod';
import {
  EntityIdSchema,
  NullableEntityIdSchema,
  ReturnMessageSchema,
} from './common';

const AppointmentDateTimeSchema = z.iso.datetime({ offset: true }).describe(
  'ISO-8601 appointment timestamp with a UTC offset.',
);

const AppointmentDurationSchema = z.number().int().positive().describe(
  'Appointment duration in whole minutes.',
);

const AppointmentIdSchema = z.union([
  z.string().trim().min(1),
  z.number(),
]);

const AppointmentContactIdSchema = z.union([
  z.string().regex(/^[1-9]\d*$/),
  z.number().int().positive(),
]);

export const AppointmentDateSchema = z.iso.date().describe(
  'ISO-8601 calendar date.',
);

export const AppointmentAttendeeSchema = z.looseObject({
  id: EntityIdSchema,
  name: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  email: z.string().optional(),
});

export const AppointmentSchema = z.looseObject({
  id: NullableEntityIdSchema,
  thirdPartyAppointmentId: NullableEntityIdSchema.optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().describe(
    'Canonical appointment description returned by list operations.',
  ).optional(),
  summary: z.string().nullable().describe(
    'Compatibility alias returned by some create, update, and refresh connectors.',
  ).optional(),
  participantName: z.string().nullable().optional(),
  startTimeUtc: AppointmentDateTimeSchema.nullable().optional(),
  durationMinutes: z.number().min(0).nullable().optional(),
  status: z.string().nullable().optional(),
  contactId: NullableEntityIdSchema.optional(),
  contactType: z.string().nullable().optional(),
  attendees: z.array(AppointmentAttendeeSchema).optional(),
  attendeeIds: z.array(EntityIdSchema).describe(
    'Compatibility representation returned by connectors that do not provide attendee objects.',
  ).optional(),
});

export const IdentifiedAppointmentSchema = AppointmentSchema.extend({
  id: AppointmentIdSchema,
});

export const AppointmentContactReferenceSchema = z.union([
  AppointmentContactIdSchema,
  z.strictObject({
    id: AppointmentContactIdSchema,
    type: z.string().optional(),
    contactType: z.string().optional(),
  }),
]);

export const AppointmentRangeSchema = z.strictObject({
  startDate: AppointmentDateSchema,
  endDate: AppointmentDateSchema,
}).refine(({ startDate, endDate }) => startDate <= endDate, {
  message: 'startDate must be on or before endDate.',
  path: ['endDate'],
});

export const AppointmentCreateInputSchema = z.strictObject({
  title: z.string().trim().min(1),
  summary: z.string(),
  startTimeUtc: AppointmentDateTimeSchema,
  durationMinutes: AppointmentDurationSchema,
  contacts: z.array(AppointmentContactReferenceSchema).optional(),
});

const AppointmentNonTimePatchSchema = z.strictObject({
  title: z.string().trim().min(1).optional(),
  summary: z.string().optional(),
  contacts: z.array(AppointmentContactReferenceSchema).optional(),
}).refine((patch) => Object.keys(patch).length > 0, {
  message: 'At least one appointment field must be supplied.',
}).meta({ minProperties: 1 });

const AppointmentUtcTimePatchSchema = z.strictObject({
  title: z.string().trim().min(1).optional(),
  summary: z.string().optional(),
  contacts: z.array(AppointmentContactReferenceSchema).optional(),
  startTimeUtc: AppointmentDateTimeSchema,
  durationMinutes: AppointmentDurationSchema,
});

const AppointmentLegacyTimePatchSchema = z.strictObject({
  title: z.string().trim().min(1).optional(),
  summary: z.string().optional(),
  contacts: z.array(AppointmentContactReferenceSchema).optional(),
  startTime: AppointmentDateTimeSchema,
  durationMinutes: AppointmentDurationSchema,
}).meta({ deprecated: true });

export const AppointmentPatchInputSchema = z.union([
  AppointmentNonTimePatchSchema,
  AppointmentUtcTimePatchSchema,
  AppointmentLegacyTimePatchSchema,
]);

export const AppointmentCreateRequestSchema = z.union([
  z.strictObject({ payload: AppointmentCreateInputSchema }),
  AppointmentCreateInputSchema.meta({ deprecated: true }),
]);

export const AppointmentPatchRequestSchema = z.union([
  z.strictObject({ patch: AppointmentPatchInputSchema }),
  AppointmentPatchInputSchema.meta({ deprecated: true }),
]);

export const AppointmentStatusRequestSchema = z.strictObject({
  status: z.string().trim().min(1),
});

export const AppointmentFailureResponseSchema = z.looseObject({
  successful: z.literal(false),
  returnMessage: ReturnMessageSchema,
});

export const AppointmentListSuccessResponseSchema = z.looseObject({
  successful: z.literal(true),
  appointments: z.array(IdentifiedAppointmentSchema),
});

export const AppointmentListResponseSchema = z.union([
  AppointmentListSuccessResponseSchema,
  AppointmentFailureResponseSchema,
]);

export const AppointmentCreateSuccessResponseSchema = z.looseObject({
  successful: z.literal(true),
  appointmentId: AppointmentIdSchema,
  appointment: IdentifiedAppointmentSchema.optional(),
  returnMessage: ReturnMessageSchema.optional(),
});

export const AppointmentCreateResponseSchema = z.union([
  AppointmentCreateSuccessResponseSchema,
  AppointmentFailureResponseSchema,
]);

export const AppointmentRecordSuccessResponseSchema = z.looseObject({
  successful: z.literal(true),
  appointmentId: AppointmentIdSchema,
  appointment: IdentifiedAppointmentSchema,
  returnMessage: ReturnMessageSchema.optional(),
});

export const AppointmentRecordResponseSchema = z.union([
  AppointmentRecordSuccessResponseSchema,
  AppointmentFailureResponseSchema,
]);

export const AppointmentActionSuccessResponseSchema = z.union([
  z.looseObject({
    successful: z.literal(true),
    appointmentId: AppointmentIdSchema,
    appointment: IdentifiedAppointmentSchema,
    returnMessage: ReturnMessageSchema.optional(),
  }),
  z.looseObject({
    successful: z.literal(true),
    appointmentId: AppointmentIdSchema,
    returnMessage: ReturnMessageSchema,
  }),
]);

export const AppointmentActionResponseSchema = z.union([
  AppointmentActionSuccessResponseSchema,
  AppointmentFailureResponseSchema,
]);

export const AppointmentMutationResponseSchema = z.union([
  AppointmentCreateResponseSchema,
  AppointmentRecordResponseSchema,
  AppointmentActionResponseSchema,
]);

export type Appointment = z.input<typeof AppointmentSchema>;
export type AppointmentRange = z.input<typeof AppointmentRangeSchema>;
export type AppointmentCreateInput = z.input<typeof AppointmentCreateInputSchema>;
export type AppointmentPatchInput = z.input<typeof AppointmentPatchInputSchema>;
export type AppointmentCreateRequest = z.input<typeof AppointmentCreateRequestSchema>;
export type AppointmentPatchRequest = z.input<typeof AppointmentPatchRequestSchema>;
export type AppointmentStatusRequest = z.input<typeof AppointmentStatusRequestSchema>;
export type AppointmentListResponse = z.input<typeof AppointmentListResponseSchema>;
export type AppointmentCreateResponse = z.input<typeof AppointmentCreateResponseSchema>;
export type AppointmentRecordResponse = z.input<typeof AppointmentRecordResponseSchema>;
export type AppointmentActionResponse = z.input<typeof AppointmentActionResponseSchema>;
export type AppointmentMutationResponse = z.input<typeof AppointmentMutationResponseSchema>;

export const appointmentCreateRequestExample = {
  payload: {
    title: 'Strategy Call',
    summary: 'Discuss case plan',
    startTimeUtc: '2026-07-20T19:00:00.000Z',
    durationMinutes: 30,
    contacts: [{ id: '501', type: 'Contact' }],
  },
} satisfies AppointmentCreateRequest;

export const appointmentRangeExample = {
  startDate: '2026-07-01',
  endDate: '2026-07-31',
} satisfies AppointmentRange;

export const appointmentPatchRequestExample = {
  patch: {
    title: 'Updated Strategy Call',
  },
} satisfies AppointmentPatchRequest;

export const appointmentStatusRequestExample = {
  status: 'tentative',
} satisfies AppointmentStatusRequest;

export const appointmentListResponseExample = {
  successful: true,
  appointments: [
    {
      id: '101',
      thirdPartyAppointmentId: '101',
      title: 'Candidate Screen',
      description: 'Talk through resume',
      participantName: '',
      startTimeUtc: '2026-07-20T15:00:00.000Z',
      durationMinutes: 45,
      status: 'scheduled',
      contactId: '501',
      contactType: 'Candidate',
      attendees: [
        {
          id: '601',
          name: 'Alice Able',
          type: 'CorporateUser',
          status: 'ACCEPTED',
        },
      ],
    },
  ],
} satisfies AppointmentListResponse;

export const appointmentListFailureResponseExample = {
  successful: false,
  returnMessage: {
    message: 'Error listing appointments',
    messageType: 'warning',
    ttl: 5000,
  },
} satisfies AppointmentListResponse;

export const appointmentCreateResponseExample = {
  successful: true,
  appointmentId: '777',
} satisfies AppointmentCreateResponse;

export const appointmentCreateFailureResponseExample = {
  successful: false,
  returnMessage: {
    message: 'Could not create appointment in Bullhorn.',
    messageType: 'warning',
    ttl: 5000,
  },
} satisfies AppointmentCreateResponse;

export const appointmentUpdateResponseExample = {
  successful: true,
  appointmentId: '333',
  appointment: {
    id: '333',
    title: 'Updated Strategy Call',
    description: 'Updated description',
    startTimeUtc: '2026-07-20T20:00:00.000Z',
    durationMinutes: 60,
    status: 'scheduled',
  },
} satisfies AppointmentRecordResponse;

export const appointmentStatusResponseExample = {
  successful: true,
  appointmentId: '3003',
  appointment: {
    id: '3003',
    title: 'Strategy Call',
    status: 'TENTATIVE',
  },
} satisfies AppointmentRecordResponse;

export const appointmentRefreshResponseExample = {
  successful: true,
  appointmentId: '888',
  appointment: {
    id: '888',
    title: 'Candidate Screen',
    description: 'Talk through resume',
    startTimeUtc: '2026-07-20T15:00:00.000Z',
    durationMinutes: 45,
    status: 'scheduled',
  },
} satisfies AppointmentRecordResponse;

export const appointmentConfirmResponseExample = {
  successful: true,
  appointmentId: '3003',
  returnMessage: {
    message: 'Appointment confirmed successfully',
    messageType: 'success',
    ttl: 60000,
  },
} satisfies AppointmentActionResponse;

export const appointmentCancelResponseExample = {
  successful: true,
  appointmentId: '888',
  returnMessage: {
    message: 'Appointment cancelled successfully.',
    messageType: 'success',
    ttl: 5000,
  },
} satisfies AppointmentActionResponse;

export const appointmentNotFoundResponseExample = {
  successful: false,
  returnMessage: {
    message: 'Appointment not found in Clio.',
    messageType: 'warning',
    ttl: 5000,
  },
} satisfies AppointmentMutationResponse;

export const appointmentRefreshNotFoundResponseExample = {
  successful: false,
  returnMessage: {
    message: 'Appointment not found in Bullhorn.',
    messageType: 'warning',
    ttl: 5000,
  },
} satisfies AppointmentRecordResponse;

export const appointmentStatusUnsupportedResponseExample = {
  successful: false,
  returnMessage: {
    message: 'This connector does not support appointment status changes.',
    messageType: 'warning',
    ttl: 5000,
  },
} satisfies AppointmentRecordResponse;
