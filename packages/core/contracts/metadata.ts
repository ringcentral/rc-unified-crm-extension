import { z } from 'zod';

export const HealthResponseSchema = z.literal('OK');

export const ReleaseNoteItemSchema = z.strictObject({
  type: z.string().min(1).describe('Release-note category such as New or Fix.'),
  description: z.string().min(1),
});

export const ReleaseNoteSectionsSchema = z.record(
  z.string().min(1),
  z.array(ReleaseNoteItemSchema),
);

export const ReleaseNotesResponseSchema = z.record(
  z.string().min(1).describe('Server version.'),
  ReleaseNoteSectionsSchema,
);

export const ServerVersionInfoResponseSchema = z.strictObject({
  version: z.string().describe('Version declared by the default CRM manifest.'),
});

export const ImplementedInterfacesResponseSchema = z.looseObject({
  getAuthType: z.boolean(),
  getOauthInfo: z.boolean().optional(),
  getBasicAuth: z.boolean().optional(),
  getUserInfo: z.boolean(),
  createCallLog: z.boolean(),
  updateCallLog: z.boolean(),
  getCallLog: z.boolean(),
  createMessageLog: z.boolean(),
  updateMessageLog: z.boolean(),
  createContact: z.boolean(),
  findContact: z.boolean(),
  listAppointments: z.boolean(),
  createAppointment: z.boolean(),
  updateAppointment: z.boolean(),
  refreshAppointment: z.boolean(),
  confirmAppointment: z.boolean(),
  cancelAppointment: z.boolean(),
  unAuthorize: z.boolean(),
  upsertCallDisposition: z.boolean(),
  findContactWithName: z.boolean(),
  getUserList: z.boolean(),
  getLicenseStatus: z.boolean(),
  getLogFormatType: z.boolean(),
  refreshUserInfo: z.boolean(),
  cacheCallNote: z.boolean(),
});

export const UserInfoHashResponseSchema = z.looseObject({
  extensionId: z.string().length(64).describe('SHA-256 hash of the supplied extension identifier.'),
  accountId: z.string().length(64).describe('SHA-256 hash of the supplied account identifier.'),
});

export const DebugReportUrlResponseSchema = z.looseObject({
  presignedUrl: z.url().describe('Short-lived URL for uploading the debug report.'),
});

export type ServerVersionInfoResponse = z.input<typeof ServerVersionInfoResponseSchema>;
export type HealthResponse = z.input<typeof HealthResponseSchema>;
export type ReleaseNotesResponse = z.input<typeof ReleaseNotesResponseSchema>;
export type ImplementedInterfacesResponse = z.input<typeof ImplementedInterfacesResponseSchema>;
export type UserInfoHashResponse = z.input<typeof UserInfoHashResponseSchema>;
export type DebugReportUrlResponse = z.input<typeof DebugReportUrlResponseSchema>;

export const serverVersionInfoResponseExample = {
  version: '1.7.38',
} satisfies ServerVersionInfoResponse;

export const healthResponseExample = 'OK' satisfies HealthResponse;

export const releaseNotesResponseExample = {
  '1.7.14': {
    global: [],
    exampleCRM: [
      {
        type: 'New',
        description: 'Added SMS time tracking.',
      },
    ],
  },
} satisfies ReleaseNotesResponse;

export const implementedInterfacesResponseExample = {
  getAuthType: true,
  getOauthInfo: true,
  getUserInfo: true,
  createCallLog: true,
  updateCallLog: true,
  getCallLog: true,
  createMessageLog: true,
  updateMessageLog: true,
  createContact: true,
  findContact: true,
  listAppointments: false,
  createAppointment: false,
  updateAppointment: false,
  refreshAppointment: false,
  confirmAppointment: false,
  cancelAppointment: false,
  unAuthorize: true,
  upsertCallDisposition: true,
  findContactWithName: true,
  getUserList: false,
  getLicenseStatus: true,
  getLogFormatType: true,
  refreshUserInfo: true,
  cacheCallNote: false,
} satisfies ImplementedInterfacesResponse;

export const userInfoHashResponseExample = {
  extensionId: '74c4089f5df0e6f37a78371fc535c2335327999ffb55ddf2c17ab6feeb9378c7',
  accountId: '318b43a184b5607066f97c570af26b73fc787778d221cd06002308ef50755d90',
} satisfies UserInfoHashResponse;

export const debugReportUrlResponseExample = {
  presignedUrl: 'https://uploads.example.com/debug-report.json?signature=example',
} satisfies DebugReportUrlResponse;
