import { z } from 'zod';

export const HealthResponseSchema = z.literal('OK').describe(
  'Literal liveness response. It does not verify databases, connectors, or upstream services.',
);

export const ReleaseNoteItemSchema = z.strictObject({
  type: z.string().min(1).describe('Release-note category such as New or Fix.'),
  description: z.string().min(1).describe('Human-readable release-note text.'),
}).describe('One categorized App Connect or connector release note.');

export const ReleaseNoteSectionsSchema = z.record(
  z.string().min(1),
  z.array(ReleaseNoteItemSchema),
).describe('Release-note lists keyed by global or connector platform name.');

export const ReleaseNotesResponseSchema = z.record(
  z.string().min(1).describe('Server version.'),
  ReleaseNoteSectionsSchema,
).describe(
  'App Connect and connector release notes grouped by connector-declared server version; global-only versions are not emitted.',
);

export const ServerVersionInfoResponseSchema = z.strictObject({
  version: z.string().describe('Version declared by the default CRM manifest.'),
}).describe('Legacy server version metadata retained for older App Connect clients.');

export const ImplementedInterfacesResponseSchema = z.looseObject({
  getAuthType: z.boolean().describe('Whether the connector implements getAuthType.'),
  getOauthInfo: z.boolean().describe(
    'For OAuth connectors, whether getOauthInfo is implemented.',
  ).optional(),
  getBasicAuth: z.boolean().describe(
    'For API-key connectors, whether getBasicAuth is implemented.',
  ).optional(),
  getUserInfo: z.boolean().describe('Whether the connector implements getUserInfo.'),
  createCallLog: z.boolean().describe('Whether the connector implements createCallLog.'),
  updateCallLog: z.boolean().describe('Whether the connector implements updateCallLog.'),
  getCallLog: z.boolean().describe('Whether the connector implements getCallLog.'),
  createMessageLog: z.boolean().describe('Whether the connector implements createMessageLog.'),
  updateMessageLog: z.boolean().describe('Whether the connector implements updateMessageLog.'),
  createContact: z.boolean().describe('Whether the connector implements createContact.'),
  findContact: z.boolean().describe('Whether the connector implements findContact.'),
  listAppointments: z.boolean().describe('Whether the connector implements listAppointments.'),
  createAppointment: z.boolean().describe('Whether the connector implements createAppointment.'),
  updateAppointment: z.boolean().describe('Whether the connector implements updateAppointment.'),
  refreshAppointment: z.boolean().describe('Whether the connector implements refreshAppointment.'),
  confirmAppointment: z.boolean().describe('Whether the connector implements confirmAppointment.'),
  cancelAppointment: z.boolean().describe('Whether the connector implements cancelAppointment.'),
  unAuthorize: z.boolean().describe('Whether the connector implements unAuthorize.'),
  upsertCallDisposition: z.boolean().describe(
    'Whether the connector implements upsertCallDisposition.',
  ),
  findContactWithName: z.boolean().describe('Whether the connector implements findContactWithName.'),
  getUserList: z.boolean().describe('Whether the connector implements getUserList.'),
  getLicenseStatus: z.boolean().describe('Whether the connector implements getLicenseStatus.'),
  getLogFormatType: z.boolean().describe('Whether the connector implements getLogFormatType.'),
  refreshUserInfo: z.boolean().describe('Whether the connector implements refreshUserInfo.'),
  cacheCallNote: z.boolean().describe(
    'Whether this App Connect deployment enables the temporary call-note cache.',
  ),
}).describe('Feature flags derived from the selected connector module and server configuration.');

export const UserInfoHashResponseSchema = z.looseObject({
  extensionId: z.string().length(64).describe('SHA-256 hash of the supplied extension identifier.'),
  accountId: z.string().length(64).describe('SHA-256 hash of the supplied account identifier.'),
}).describe('Server-keyed hashes of RingCentral account and extension identifiers.');

export const DebugReportUrlResponseSchema = z.looseObject({
  presignedUrl: z.url().describe('Short-lived URL for uploading the debug report.'),
}).describe('Temporary object-storage upload destination for an App Connect debug report.');

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
