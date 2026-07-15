import { z } from 'zod';
import {
  AdminManagedOAuthCacheRequestSchema,
  AdminSettingsUpdateRequestSchema,
  AdminSuccessMessageSchema,
  ManagedAuthAdminResponseSchema,
  ManagedAuthAdminUserValueSchema,
  ManagedAuthFieldDefinitionSchema,
  ManagedAuthUpdateRequestSchema,
  ManagedOAuthValuesSchema,
  StoredFieldValueSchema,
  adminSettingsUpdateRequestExample,
  adminSettingsUpdatedExample,
  managedAuthAdminResponseExample,
  managedAuthOrgUpdateExample,
  managedAuthUpdatedExample,
  managedAuthUserUpdateExample,
  managedOAuthCacheRequestExample,
  successfulAdminMutationExample,
} from './admin';
import {
  AppointmentActionResponseSchema,
  AppointmentAttendeeSchema,
  AppointmentContactReferenceSchema,
  AppointmentCreateInputSchema,
  AppointmentCreateRequestSchema,
  AppointmentCreateResponseSchema,
  AppointmentDateSchema,
  AppointmentFailureResponseSchema,
  AppointmentListResponseSchema,
  AppointmentPatchInputSchema,
  AppointmentPatchRequestSchema,
  AppointmentRangeSchema,
  AppointmentRecordResponseSchema,
  AppointmentStatusRequestSchema,
  IdentifiedAppointmentSchema,
  appointmentCancelResponseExample,
  appointmentConfirmResponseExample,
  appointmentCreateFailureResponseExample,
  appointmentCreateRequestExample,
  appointmentCreateResponseExample,
  appointmentListFailureResponseExample,
  appointmentListResponseExample,
  appointmentNotFoundResponseExample,
  appointmentPatchRequestExample,
  appointmentRangeExample,
  appointmentRefreshResponseExample,
  appointmentRefreshNotFoundResponseExample,
  appointmentStatusRequestExample,
  appointmentStatusResponseExample,
  appointmentStatusUnsupportedResponseExample,
  appointmentUpdateResponseExample,
} from './appointment';
import {
  ApiKeyLoginRequestSchema,
  ApiKeyLoginResponseSchema,
  AuthValidationResponseSchema,
  ManagedAuthStateResponseSchema,
  ManagedOAuthStateResponseSchema,
  apiKeyLoginRequestExample,
  apiKeyLoginResponseExample,
  authValidationResponseExample,
  managedAuthStateResponseExample,
  managedOAuthStateResponseExample,
} from './auth';
import {
  BasicMutationResponseSchema,
  ReturnMessageSchema,
} from './common';
import {
  AdditionalSubmissionSchema,
  CallDispositionRequestSchema,
  CallLogMutationResponseSchema,
  ContactInfoSchema,
  MessageLogResponseSchema,
  basicMutationResponseExample,
  callDispositionRequestExample,
  callLogMutationResponseExample,
  messageLogNoOpResponseExample,
  messageLogResponseExample,
} from './logging';
import {
  DebugReportUrlResponseSchema,
  HealthResponseSchema,
  ImplementedInterfacesResponseSchema,
  ReleaseNoteItemSchema,
  ReleaseNoteSectionsSchema,
  ReleaseNotesResponseSchema,
  ServerVersionInfoResponseSchema,
  UserInfoHashResponseSchema,
  debugReportUrlResponseExample,
  healthResponseExample,
  implementedInterfacesResponseExample,
  releaseNotesResponseExample,
  serverVersionInfoResponseExample,
  userInfoHashResponseExample,
} from './metadata';
import {
  PluginMutationResponseSchema,
  PluginRegisterRequestSchema,
  pluginMutationResponseExample,
  pluginRegisterRequestExample,
} from './plugin';
import {
  UserSettingSchema,
  UserSettingsEnvelopeSchema,
  UserSettingsSchema,
  UserSettingsUpdateRequestSchema,
  emptyUserSettingsEnvelopeExample,
  userSettingsEnvelopeExample,
  userSettingsExample,
  userSettingsUpdateRequestExample,
} from './user';

export const httpApiContractSchemas = {
  AdminSuccessMessage: AdminSuccessMessageSchema,
  AdminSettingsUpdateRequest: AdminSettingsUpdateRequestSchema,
  ManagedAuthFieldDefinition: ManagedAuthFieldDefinitionSchema,
  StoredFieldValue: StoredFieldValueSchema,
  ManagedAuthAdminUserValue: ManagedAuthAdminUserValueSchema,
  ManagedAuthAdminResponse: ManagedAuthAdminResponseSchema,
  ManagedAuthUpdateRequest: ManagedAuthUpdateRequestSchema,
  ManagedOAuthValues: ManagedOAuthValuesSchema,
  AdminManagedOAuthCacheRequest: AdminManagedOAuthCacheRequestSchema,
  AppointmentAttendee: AppointmentAttendeeSchema,
  IdentifiedAppointment: IdentifiedAppointmentSchema,
  AppointmentContactReference: AppointmentContactReferenceSchema,
  AppointmentCreateInput: AppointmentCreateInputSchema,
  AppointmentPatchInput: AppointmentPatchInputSchema,
  AppointmentCreateRequest: AppointmentCreateRequestSchema,
  AppointmentPatchRequest: AppointmentPatchRequestSchema,
  AppointmentStatusUpdateRequest: AppointmentStatusRequestSchema,
  AppointmentFailureResponse: AppointmentFailureResponseSchema,
  AppointmentListResponse: AppointmentListResponseSchema,
  AppointmentCreateResponse: AppointmentCreateResponseSchema,
  AppointmentRecordResponse: AppointmentRecordResponseSchema,
  AppointmentActionResponse: AppointmentActionResponseSchema,
  ReturnMessage: ReturnMessageSchema,
  BasicMutationResponse: BasicMutationResponseSchema,
  ApiKeyLoginRequest: ApiKeyLoginRequestSchema,
  ApiKeyLoginResponse: ApiKeyLoginResponseSchema,
  AuthValidationResponse: AuthValidationResponseSchema,
  ManagedAuthStateResponse: ManagedAuthStateResponseSchema,
  ManagedOAuthStateResponse: ManagedOAuthStateResponseSchema,
  HealthResponse: HealthResponseSchema,
  ReleaseNoteItem: ReleaseNoteItemSchema,
  ReleaseNoteSections: ReleaseNoteSectionsSchema,
  ReleaseNotesResponse: ReleaseNotesResponseSchema,
  ServerVersionInfoResponse: ServerVersionInfoResponseSchema,
  ImplementedInterfacesResponse: ImplementedInterfacesResponseSchema,
  UserInfoHashResponse: UserInfoHashResponseSchema,
  DebugReportUrlResponse: DebugReportUrlResponseSchema,
  PluginRegisterRequest: PluginRegisterRequestSchema,
  PluginMutationResponse: PluginMutationResponseSchema,
  AdditionalSubmission: AdditionalSubmissionSchema,
  ContactInfo: ContactInfoSchema,
  CallLogMutationResponse: CallLogMutationResponseSchema,
  MessageLogResponse: MessageLogResponseSchema,
  CallDispositionRequest: CallDispositionRequestSchema,
  UserSetting: UserSettingSchema,
  UserSettings: UserSettingsSchema,
  UserSettingsEnvelope: UserSettingsEnvelopeSchema,
  UserSettingsUpdateRequest: UserSettingsUpdateRequestSchema,
} as const;

export type HttpApiSchemaName = keyof typeof httpApiContractSchemas;

export const httpApiContractRegistry = z.registry<{ id: string }>();

for (const [id, schema] of Object.entries(httpApiContractSchemas)) {
  httpApiContractRegistry.add(schema, { id });
}

export interface OpenApiExample {
  summary: string;
  value: unknown;
}

export interface OpenApiPayloadContract {
  schema: HttpApiSchemaName;
  description: string;
  examples: Record<string, OpenApiExample>;
  mediaType?: string;
}

export interface OpenApiRequestContract extends OpenApiPayloadContract {
  component: string;
  required: boolean;
}

export interface OpenApiResponseContract extends OpenApiPayloadContract {
  includeRefreshedJwtHeader?: boolean;
}

export interface OpenApiParameterContract {
  name: string;
  in: 'query' | 'path' | 'header';
  description: string;
  required: boolean;
  deprecated?: boolean;
  schema: z.ZodType;
  example?: unknown;
}

export interface OpenApiOperationContract {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  parameters?: readonly OpenApiParameterContract[];
  request?: OpenApiRequestContract;
  responses: Record<string, OpenApiResponseContract>;
}

export const httpApiOperationContracts: readonly OpenApiOperationContract[] = [
  {
    method: 'get',
    path: '/isAlive',
    responses: {
      '200': {
        schema: 'HealthResponse',
        description: 'Plain-text liveness response.',
        mediaType: 'text/plain',
        examples: {
          healthy: {
            summary: 'Healthy server',
            value: healthResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/releaseNotes',
    responses: {
      '200': {
        schema: 'ReleaseNotesResponse',
        description: 'Release notes grouped by server version and connector.',
        examples: {
          release: {
            summary: 'Global and connector release notes',
            value: releaseNotesResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/apiKeyLogin',
    request: {
      component: 'ApiKeyLogin',
      schema: 'ApiKeyLoginRequest',
      description: 'Connector and credential data used to create an App Connect user session.',
      required: true,
      examples: {
        apiKey: {
          summary: 'API-key login',
          value: apiKeyLoginRequestExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'ApiKeyLoginResponse',
        description: 'The connector credentials were accepted and an App Connect user token was issued.',
        examples: {
          connected: {
            summary: 'Connected user session',
            value: apiKeyLoginResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/serverVersionInfo',
    responses: {
      '200': {
        schema: 'ServerVersionInfoResponse',
        description: 'Version metadata from the default CRM manifest.',
        includeRefreshedJwtHeader: true,
        examples: {
          version: {
            summary: 'Server version',
            value: serverVersionInfoResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/implementedInterfaces',
    responses: {
      '200': {
        schema: 'ImplementedInterfacesResponse',
        description: 'Connector-interface availability for the requested platform.',
        includeRefreshedJwtHeader: true,
        examples: {
          oauthConnector: {
            summary: 'OAuth connector capabilities',
            value: implementedInterfacesResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/userInfoHash',
    responses: {
      '200': {
        schema: 'UserInfoHashResponse',
        description: 'Deterministic account and extension hashes.',
        includeRefreshedJwtHeader: true,
        examples: {
          hashes: {
            summary: 'Hashed user identifiers',
            value: userInfoHashResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/debug/report/url',
    responses: {
      '200': {
        schema: 'DebugReportUrlResponse',
        description: 'A short-lived debug-report upload URL.',
        includeRefreshedJwtHeader: true,
        examples: {
          uploadUrl: {
            summary: 'Presigned report upload URL',
            value: debugReportUrlResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/plugin/register',
    request: {
      component: 'PluginRegister',
      schema: 'PluginRegisterRequest',
      description: 'Plugin and RingCentral account identifiers to register.',
      required: true,
      examples: {
        sharedPlugin: {
          summary: 'Register a shared plugin',
          value: pluginRegisterRequestExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'PluginMutationResponse',
        description: 'The plugin was registered for the account.',
        includeRefreshedJwtHeader: true,
        examples: {
          registered: {
            summary: 'Plugin registered',
            value: pluginMutationResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/callLog',
    responses: {
      '200': {
        schema: 'CallLogMutationResponse',
        description: 'Call-log creation result.',
        examples: {
          created: {
            summary: 'Call log created with a numeric connector id',
            value: callLogMutationResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/messageLog',
    responses: {
      '200': {
        schema: 'MessageLogResponse',
        description: 'Message-log creation result.',
        examples: {
          created: {
            summary: 'Message logs created with numeric connector ids',
            value: messageLogResponseExample,
          },
          alreadyLogged: {
            summary: 'All messages were already logged',
            value: messageLogNoOpResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'put',
    path: '/callDisposition',
    request: {
      component: 'CallDisposition',
      schema: 'CallDispositionRequest',
      description: 'Call-log identity and the dispositions selected by the user.',
      required: true,
      examples: {
        qualifiedLead: {
          summary: 'Set a call disposition',
          value: callDispositionRequestExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'BasicMutationResponse',
        description: 'Disposition upsert result.',
        examples: {
          saved: {
            summary: 'Disposition saved',
            value: basicMutationResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/authValidation',
    responses: {
      '200': {
        schema: 'AuthValidationResponse',
        description: 'CRM authentication validation result.',
        includeRefreshedJwtHeader: true,
        examples: {
          valid: {
            summary: 'Authentication is valid',
            value: authValidationResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/apiKeyManagedAuthState',
    responses: {
      '200': {
        schema: 'ManagedAuthStateResponse',
        description: 'Managed API-key field state for the RingCentral user and account.',
        examples: {
          manualAuth: {
            summary: 'No managed credentials are configured',
            value: managedAuthStateResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/oauthManagedAuthState',
    responses: {
      '200': {
        schema: 'ManagedOAuthStateResponse',
        description: 'Managed OAuth configuration state for the RingCentral account.',
        examples: {
          unconfigured: {
            summary: 'No managed OAuth configuration',
            value: managedOAuthStateResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/user/preloadSettings',
    responses: {
      '200': {
        schema: 'UserSettingsEnvelope',
        description: 'Account-level user settings to preload before CRM login.',
        examples: {
          configured: {
            summary: 'Preconfigured account settings',
            value: userSettingsEnvelopeExample,
          },
          empty: {
            summary: 'No account settings configured',
            value: emptyUserSettingsEnvelopeExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/user/refreshInfo',
    responses: {
      '200': {
        schema: 'BasicMutationResponse',
        description: 'CRM user-information refresh result.',
        includeRefreshedJwtHeader: true,
        examples: {
          refreshed: {
            summary: 'User information refreshed',
            value: {
              successful: true,
              returnMessage: {
                message: 'User information refreshed.',
                messageType: 'success',
              },
            },
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/user/settings',
    responses: {
      '200': {
        schema: 'UserSettings',
        description: 'Effective user settings after account-level overrides are applied.',
        includeRefreshedJwtHeader: true,
        examples: {
          settings: {
            summary: 'Effective user settings',
            value: userSettingsExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/user/settings',
    request: {
      component: 'UserSettingsUpdate',
      schema: 'UserSettingsUpdateRequest',
      description: 'User settings to upsert and setting keys to remove.',
      required: true,
      examples: {
        update: {
          summary: 'Update user settings',
          value: userSettingsUpdateRequestExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'UserSettingsEnvelope',
        description: 'Updated user settings. Legacy connector-hook failures can return an empty object.',
        includeRefreshedJwtHeader: true,
        examples: {
          updated: {
            summary: 'User settings updated',
            value: userSettingsEnvelopeExample,
          },
          empty: {
            summary: 'Legacy connector hook returned no settings',
            value: emptyUserSettingsEnvelopeExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/admin/settings',
    request: {
      component: 'AdminSettingsUpdate',
      schema: 'AdminSettingsUpdateRequest',
      description: 'Account-level App Connect settings. Nested setting definitions are extensible.',
      required: true,
      examples: {
        settings: {
          summary: 'Update account settings',
          value: adminSettingsUpdateRequestExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'AdminSuccessMessage',
        description: 'The account settings were updated.',
        mediaType: 'text/html',
        examples: {
          updated: {
            summary: 'Settings updated',
            value: adminSettingsUpdatedExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/admin/managedAuth',
    responses: {
      '200': {
        schema: 'ManagedAuthAdminResponse',
        description: 'Managed authentication field definitions and configured account/user values.',
        includeRefreshedJwtHeader: true,
        examples: {
          configured: {
            summary: 'Managed authentication configuration',
            value: managedAuthAdminResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/admin/managedAuth',
    request: {
      component: 'ManagedAuthUpdate',
      schema: 'ManagedAuthUpdateRequest',
      description: 'Account-scoped or user-scoped managed authentication values.',
      required: true,
      examples: {
        account: {
          summary: 'Update account-scoped values',
          value: managedAuthOrgUpdateExample,
        },
        user: {
          summary: 'Update user-scoped values',
          value: managedAuthUserUpdateExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'AdminSuccessMessage',
        description: 'The managed authentication values were updated.',
        includeRefreshedJwtHeader: true,
        mediaType: 'text/html',
        examples: {
          updated: {
            summary: 'Managed authentication updated',
            value: managedAuthUpdatedExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/admin/managedOAuth/cache',
    request: {
      component: 'AdminManagedOAuthCache',
      schema: 'AdminManagedOAuthCacheRequest',
      description: 'Managed OAuth values cached until the account OAuth flow completes.',
      required: true,
      examples: {
        oauth: {
          summary: 'Cache managed OAuth client settings',
          value: managedOAuthCacheRequestExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'BasicMutationResponse',
        description: 'The pending managed OAuth values were cached.',
        examples: {
          cached: {
            summary: 'Pending values cached',
            value: successfulAdminMutationExample,
          },
        },
      },
    },
  },
  {
    method: 'delete',
    path: '/admin/managedOAuth/cache',
    responses: {
      '200': {
        schema: 'BasicMutationResponse',
        description: 'The pending managed OAuth values were removed.',
        examples: {
          removed: {
            summary: 'Pending values removed',
            value: successfulAdminMutationExample,
          },
        },
      },
    },
  },
  {
    method: 'delete',
    path: '/admin/managedOAuth/account',
    responses: {
      '200': {
        schema: 'BasicMutationResponse',
        description: 'The account managed OAuth values were reset.',
        examples: {
          reset: {
            summary: 'Account OAuth reset',
            value: successfulAdminMutationExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/appointments',
    parameters: [
      {
        name: 'startDate',
        in: 'query',
        required: false,
        description: 'Inclusive appointment start date. Supply together with endDate.',
        schema: AppointmentDateSchema,
        example: appointmentRangeExample.startDate,
      },
      {
        name: 'endDate',
        in: 'query',
        required: false,
        description: 'Inclusive appointment end date. Supply together with startDate.',
        schema: AppointmentDateSchema,
        example: appointmentRangeExample.endDate,
      },
    ],
    responses: {
      '200': {
        schema: 'AppointmentListResponse',
        description: 'Appointments returned by the active connector.',
        includeRefreshedJwtHeader: true,
        examples: {
          appointments: {
            summary: 'Scheduled appointments',
            value: appointmentListResponseExample,
          },
          unavailable: {
            summary: 'Appointments unavailable',
            value: appointmentListFailureResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/appointments',
    request: {
      component: 'AppointmentCreate',
      schema: 'AppointmentCreateRequest',
      description: 'Appointment payload. The wrapper is canonical; the direct form remains for compatibility.',
      required: true,
      examples: {
        appointment: {
          summary: 'Create an appointment',
          value: appointmentCreateRequestExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'AppointmentCreateResponse',
        description: 'Appointment creation result.',
        includeRefreshedJwtHeader: true,
        examples: {
          created: {
            summary: 'Appointment created',
            value: appointmentCreateResponseExample,
          },
          rejected: {
            summary: 'Connector rejected the create request',
            value: appointmentCreateFailureResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'patch',
    path: '/appointments/{appointmentId}',
    request: {
      component: 'AppointmentPatch',
      schema: 'AppointmentPatchRequest',
      description: 'Partial appointment update. Omitted fields are preserved.',
      required: true,
      examples: {
        appointment: {
          summary: 'Patch an appointment',
          value: appointmentPatchRequestExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'AppointmentRecordResponse',
        description: 'Appointment update result.',
        includeRefreshedJwtHeader: true,
        examples: {
          updated: {
            summary: 'Appointment updated',
            value: appointmentUpdateResponseExample,
          },
          missing: {
            summary: 'Appointment not found',
            value: appointmentNotFoundResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/appointments/{appointmentId}/status',
    request: {
      component: 'AppointmentStatusUpdate',
      schema: 'AppointmentStatusUpdateRequest',
      description: 'New appointment status. Status support depends on connector capability.',
      required: true,
      examples: {
        tentative: {
          summary: 'Mark an appointment tentative',
          value: appointmentStatusRequestExample,
        },
      },
    },
    responses: {
      '200': {
        schema: 'AppointmentRecordResponse',
        description: 'Appointment status update result; connector support varies.',
        includeRefreshedJwtHeader: true,
        examples: {
          updated: {
            summary: 'Appointment status updated',
            value: appointmentStatusResponseExample,
          },
          unsupported: {
            summary: 'Connector does not support status changes',
            value: appointmentStatusUnsupportedResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'get',
    path: '/appointments/{appointmentId}/refresh',
    responses: {
      '200': {
        schema: 'AppointmentRecordResponse',
        description: 'Refreshed appointment result.',
        includeRefreshedJwtHeader: true,
        examples: {
          refreshed: {
            summary: 'Appointment refreshed',
            value: appointmentRefreshResponseExample,
          },
          missing: {
            summary: 'Appointment not found',
            value: appointmentRefreshNotFoundResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/appointments/{appointmentId}/confirm',
    responses: {
      '200': {
        schema: 'AppointmentActionResponse',
        description: 'Appointment confirmation result.',
        includeRefreshedJwtHeader: true,
        examples: {
          confirmed: {
            summary: 'Appointment confirmed',
            value: appointmentConfirmResponseExample,
          },
        },
      },
    },
  },
  {
    method: 'post',
    path: '/appointments/{appointmentId}/cancel',
    responses: {
      '200': {
        schema: 'AppointmentActionResponse',
        description: 'Appointment cancellation result.',
        includeRefreshedJwtHeader: true,
        examples: {
          cancelled: {
            summary: 'Appointment cancelled',
            value: appointmentCancelResponseExample,
          },
        },
      },
    },
  },
] as const;

export const httpApiExamplesToValidate = [
  ['HealthResponse', HealthResponseSchema, healthResponseExample],
  ['ReleaseNotesResponse', ReleaseNotesResponseSchema, releaseNotesResponseExample],
  ['AdminSettingsUpdateRequest', AdminSettingsUpdateRequestSchema, adminSettingsUpdateRequestExample],
  ['AdminSettingsUpdated', AdminSuccessMessageSchema, adminSettingsUpdatedExample],
  ['ManagedAuthAdminResponse', ManagedAuthAdminResponseSchema, managedAuthAdminResponseExample],
  ['ManagedAuthOrgUpdate', ManagedAuthUpdateRequestSchema, managedAuthOrgUpdateExample],
  ['ManagedAuthUserUpdate', ManagedAuthUpdateRequestSchema, managedAuthUserUpdateExample],
  ['ManagedAuthUpdated', AdminSuccessMessageSchema, managedAuthUpdatedExample],
  ['ManagedOAuthCacheRequest', AdminManagedOAuthCacheRequestSchema, managedOAuthCacheRequestExample],
  ['SuccessfulAdminMutation', BasicMutationResponseSchema, successfulAdminMutationExample],
  ['AppointmentCreateRequest', AppointmentCreateRequestSchema, appointmentCreateRequestExample],
  ['AppointmentRange', AppointmentRangeSchema, appointmentRangeExample],
  ['AppointmentPatchRequest', AppointmentPatchRequestSchema, appointmentPatchRequestExample],
  ['AppointmentStatusRequest', AppointmentStatusRequestSchema, appointmentStatusRequestExample],
  ['AppointmentListResponse', AppointmentListResponseSchema, appointmentListResponseExample],
  ['AppointmentListFailureResponse', AppointmentListResponseSchema, appointmentListFailureResponseExample],
  ['AppointmentCreateResponse', AppointmentCreateResponseSchema, appointmentCreateResponseExample],
  ['AppointmentCreateFailureResponse', AppointmentCreateResponseSchema, appointmentCreateFailureResponseExample],
  ['AppointmentUpdateResponse', AppointmentRecordResponseSchema, appointmentUpdateResponseExample],
  ['AppointmentNotFoundResponse', AppointmentRecordResponseSchema, appointmentNotFoundResponseExample],
  ['AppointmentStatusResponse', AppointmentRecordResponseSchema, appointmentStatusResponseExample],
  ['AppointmentStatusUnsupportedResponse', AppointmentRecordResponseSchema, appointmentStatusUnsupportedResponseExample],
  ['AppointmentRefreshResponse', AppointmentRecordResponseSchema, appointmentRefreshResponseExample],
  ['AppointmentRefreshNotFoundResponse', AppointmentRecordResponseSchema, appointmentRefreshNotFoundResponseExample],
  ['AppointmentConfirmResponse', AppointmentActionResponseSchema, appointmentConfirmResponseExample],
  ['AppointmentCancelResponse', AppointmentActionResponseSchema, appointmentCancelResponseExample],
  ['ApiKeyLoginRequest', ApiKeyLoginRequestSchema, apiKeyLoginRequestExample],
  ['ApiKeyLoginResponse', ApiKeyLoginResponseSchema, apiKeyLoginResponseExample],
  ['AuthValidationResponse', AuthValidationResponseSchema, authValidationResponseExample],
  ['ManagedAuthStateResponse', ManagedAuthStateResponseSchema, managedAuthStateResponseExample],
  ['ManagedOAuthStateResponse', ManagedOAuthStateResponseSchema, managedOAuthStateResponseExample],
  ['ServerVersionInfoResponse', ServerVersionInfoResponseSchema, serverVersionInfoResponseExample],
  ['ImplementedInterfacesResponse', ImplementedInterfacesResponseSchema, implementedInterfacesResponseExample],
  ['UserInfoHashResponse', UserInfoHashResponseSchema, userInfoHashResponseExample],
  ['DebugReportUrlResponse', DebugReportUrlResponseSchema, debugReportUrlResponseExample],
  ['PluginRegisterRequest', PluginRegisterRequestSchema, pluginRegisterRequestExample],
  ['PluginMutationResponse', PluginMutationResponseSchema, pluginMutationResponseExample],
  ['CallLogMutationResponse', CallLogMutationResponseSchema, callLogMutationResponseExample],
  ['MessageLogResponse', MessageLogResponseSchema, messageLogResponseExample],
  ['MessageLogNoOpResponse', MessageLogResponseSchema, messageLogNoOpResponseExample],
  ['CallDispositionRequest', CallDispositionRequestSchema, callDispositionRequestExample],
  ['BasicMutationResponse', BasicMutationResponseSchema, basicMutationResponseExample],
  ['UserSettings', UserSettingsSchema, userSettingsExample],
  ['UserSettingsEnvelope', UserSettingsEnvelopeSchema, userSettingsEnvelopeExample],
  ['EmptyUserSettingsEnvelope', UserSettingsEnvelopeSchema, emptyUserSettingsEnvelopeExample],
  ['UserSettingsUpdateRequest', UserSettingsUpdateRequestSchema, userSettingsUpdateRequestExample],
] as const;
