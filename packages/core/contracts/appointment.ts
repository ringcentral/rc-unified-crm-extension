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
]).describe('Connector appointment identifier.');

const AppointmentContactIdSchema = z.union([
  z.string().regex(/^[1-9]\d*$/),
  z.number().int().positive(),
]).describe('Positive CRM contact identifier.');

export const AppointmentDateSchema = z.iso.date().describe(
  'ISO-8601 calendar date.',
);

export const AppointmentAttendeeSchema = z.looseObject({
  id: EntityIdSchema.describe('CRM attendee or contact identifier.'),
  name: z.string().describe('Attendee display name.').optional(),
  type: z.string().describe('Connector-specific attendee entity type.').optional(),
  status: z.string().describe('Connector-specific invitation or attendance status.').optional(),
  email: z.string().describe('Attendee email address.').optional(),
}).describe('Normalized attendee returned with an appointment.');

export const AppointmentSchema = z.looseObject({
  id: NullableEntityIdSchema.describe('App Connect or connector appointment identifier.'),
  thirdPartyAppointmentId: NullableEntityIdSchema.describe(
    'CRM-native appointment identifier used when opening the record in the CRM.',
  ).optional(),
  title: z.string().nullable().describe('Appointment title.').optional(),
  description: z.string().nullable().describe(
    'Canonical appointment description returned by list operations.',
  ).optional(),
  summary: z.string().nullable().describe(
    'Compatibility alias returned by some create, update, and refresh connectors.',
  ).optional(),
  participantName: z.string().nullable().describe(
    'Compatibility display name for the primary participant.',
  ).optional(),
  startTimeUtc: AppointmentDateTimeSchema.nullable().describe(
    'Appointment start timestamp, including its UTC offset.',
  ).optional(),
  durationMinutes: z.number().min(0).nullable().describe('Appointment duration in minutes.').optional(),
  status: z.string().nullable().describe('Connector-specific appointment status.').optional(),
  contactId: NullableEntityIdSchema.describe('Primary related CRM contact identifier.').optional(),
  contactType: z.string().nullable().describe('Primary related CRM contact type.').optional(),
  attendees: z.array(AppointmentAttendeeSchema).describe('Normalized appointment attendees.').optional(),
  attendeeIds: z.array(EntityIdSchema).describe(
    'Compatibility representation returned by connectors that do not provide attendee objects.',
  ).optional(),
}).describe('Connector-normalized appointment or event record.');

export const IdentifiedAppointmentSchema = AppointmentSchema.extend({
  id: AppointmentIdSchema,
}).describe('Appointment record with the identifier required by list and mutation responses.');

export const AppointmentContactReferenceSchema = z.union([
  AppointmentContactIdSchema,
  z.strictObject({
    id: AppointmentContactIdSchema,
    type: z.string().optional(),
    contactType: z.string().optional(),
  }),
]).describe('CRM contact to associate with the appointment, as an id or typed reference.');

export const AppointmentRangeSchema = z.strictObject({
  startDate: AppointmentDateSchema,
  endDate: AppointmentDateSchema,
}).refine(({ startDate, endDate }) => startDate <= endDate, {
  message: 'startDate must be on or before endDate.',
  path: ['endDate'],
}).describe('Inclusive calendar-date window used when listing appointments.');

export const AppointmentCreateInputSchema = z.strictObject({
  title: z.string().trim().min(1).describe('Appointment title.'),
  summary: z.string().describe('Appointment description or agenda.'),
  startTimeUtc: AppointmentDateTimeSchema.describe('Appointment start timestamp, including its UTC offset.'),
  durationMinutes: AppointmentDurationSchema,
  contacts: z.array(AppointmentContactReferenceSchema).describe(
    'CRM contacts to associate with or invite to the appointment.',
  ).optional(),
}).describe('Fields required to create a connector appointment.');

const AppointmentNonTimePatchSchema = z.strictObject({
  title: z.string().trim().min(1).describe('Replacement appointment title.').optional(),
  summary: z.string().describe('Replacement appointment description or agenda.').optional(),
  contacts: z.array(AppointmentContactReferenceSchema).describe(
    'Replacement set of associated CRM contacts.',
  ).optional(),
}).refine((patch) => Object.keys(patch).length > 0, {
  message: 'At least one appointment field must be supplied.',
}).meta({ minProperties: 1 });

const AppointmentUtcTimePatchSchema = z.strictObject({
  title: z.string().trim().min(1).describe('Replacement appointment title.').optional(),
  summary: z.string().describe('Replacement appointment description or agenda.').optional(),
  contacts: z.array(AppointmentContactReferenceSchema).describe(
    'Replacement set of associated CRM contacts.',
  ).optional(),
  startTimeUtc: AppointmentDateTimeSchema.describe('Replacement start timestamp, including its UTC offset.'),
  durationMinutes: AppointmentDurationSchema,
});

const AppointmentLegacyTimePatchSchema = z.strictObject({
  title: z.string().trim().min(1).describe('Replacement appointment title.').optional(),
  summary: z.string().describe('Replacement appointment description or agenda.').optional(),
  contacts: z.array(AppointmentContactReferenceSchema).describe(
    'Replacement set of associated CRM contacts.',
  ).optional(),
  startTime: AppointmentDateTimeSchema.describe(
    'Deprecated replacement start time in ISO 8601 form with an explicit offset. The paired durationMinutes field is required.',
  ),
  durationMinutes: AppointmentDurationSchema,
}).meta({ deprecated: true });

export const AppointmentPatchInputSchema = z.union([
  AppointmentNonTimePatchSchema,
  AppointmentUtcTimePatchSchema,
  AppointmentLegacyTimePatchSchema,
]).describe('Appointment fields to replace; omitted fields remain unchanged.');

export const AppointmentCreateRequestSchema = z.union([
  z.strictObject({
    payload: AppointmentCreateInputSchema.describe('Canonical appointment create payload.'),
  }),
  AppointmentCreateInputSchema.meta({ deprecated: true }),
]).describe('Canonical wrapped appointment create request or deprecated direct payload.');

export const AppointmentPatchRequestSchema = z.union([
  z.strictObject({
    patch: AppointmentPatchInputSchema.describe('Canonical partial appointment update.'),
  }),
  AppointmentPatchInputSchema.meta({ deprecated: true }),
]).describe('Canonical wrapped appointment patch request or deprecated direct payload.');

export const AppointmentStatusRequestSchema = z.strictObject({
  status: z.string().trim().min(1).describe(
    'Requested connector status. The server normalizes this value to lowercase before dispatch.',
  ),
}).describe('Generic appointment status update request.');

export const AppointmentFailureResponseSchema = z.looseObject({
  successful: z.literal(false).describe('Always false for a rejected appointment operation.'),
  returnMessage: ReturnMessageSchema.describe('Connector explanation of the failure.'),
}).describe('Connector-level appointment failure returned with HTTP 200.');

export const AppointmentListSuccessResponseSchema = z.looseObject({
  successful: z.literal(true).describe('Always true when the connector returned a list.'),
  appointments: z.array(IdentifiedAppointmentSchema).describe('Appointments in the requested date window.'),
}).describe('Successful appointment list result.');

export const AppointmentListResponseSchema = z.union([
  AppointmentListSuccessResponseSchema,
  AppointmentFailureResponseSchema,
]).describe('Appointment list result, including connector-level failures returned with HTTP 200.');

export const AppointmentCreateSuccessResponseSchema = z.looseObject({
  successful: z.literal(true).describe('Always true when the connector created the appointment.'),
  appointmentId: AppointmentIdSchema.describe('Identifier assigned to the created appointment.'),
  appointment: IdentifiedAppointmentSchema.describe('Created appointment when the connector returns it.').optional(),
  returnMessage: ReturnMessageSchema.describe('Optional connector status message.').optional(),
}).describe('Successful appointment creation result.');

export const AppointmentCreateResponseSchema = z.union([
  AppointmentCreateSuccessResponseSchema,
  AppointmentFailureResponseSchema,
]).describe('Appointment creation result.');

export const AppointmentRecordSuccessResponseSchema = z.looseObject({
  successful: z.literal(true).describe('Always true when the connector returned the updated record.'),
  appointmentId: AppointmentIdSchema.describe('Identifier of the affected appointment.'),
  appointment: IdentifiedAppointmentSchema.describe('Current appointment after the operation.'),
  returnMessage: ReturnMessageSchema.describe('Optional connector status message.').optional(),
}).describe('Successful appointment update or refresh result with the current record.');

export const AppointmentRecordResponseSchema = z.union([
  AppointmentRecordSuccessResponseSchema,
  AppointmentFailureResponseSchema,
]).describe('Appointment mutation or refresh result that returns the current record on success.');

export const AppointmentActionSuccessResponseSchema = z.union([
  z.looseObject({
    successful: z.literal(true).describe('Always true when the connector completed the action.'),
    appointmentId: AppointmentIdSchema.describe('Identifier of the affected appointment.'),
    appointment: IdentifiedAppointmentSchema.describe('Current appointment after the action.'),
    returnMessage: ReturnMessageSchema.describe('Optional connector status message.').optional(),
  }),
  z.looseObject({
    successful: z.literal(true).describe('Always true when the connector completed the action.'),
    appointmentId: AppointmentIdSchema.describe('Identifier of the affected appointment.'),
    returnMessage: ReturnMessageSchema.describe('Connector confirmation when no record is returned.'),
  }),
]).describe('Successful confirm or cancel result, with either the current record or a status message.');

export const AppointmentActionResponseSchema = z.union([
  AppointmentActionSuccessResponseSchema,
  AppointmentFailureResponseSchema,
]).describe('Appointment confirmation or cancellation result.');

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
