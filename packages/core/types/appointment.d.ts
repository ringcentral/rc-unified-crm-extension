import type {
  Appointment,
  AppointmentActionResponse,
  AppointmentCreateRequest,
  AppointmentCreateResponse,
  AppointmentListResponse,
  AppointmentPatchRequest,
  AppointmentRange,
  AppointmentRecordResponse,
  AppointmentStatusRequest,
} from '../contracts/appointment';
import type { AppConnectUser, ReturnMessage } from './common';

type UnwrapAppointmentPayload<TRequest> = TRequest extends { payload: infer TPayload }
  ? TPayload
  : TRequest;

type UnwrapAppointmentPatch<TRequest> = TRequest extends { patch: infer TPatch }
  ? TPatch
  : TRequest;

type WithoutRouteAppointmentId<TResponse> = TResponse extends {
  successful: true;
  appointmentId: unknown;
}
  ? Omit<TResponse, 'appointmentId'>
  : TResponse;

type WithAppointmentHandlerMetadata<TResponse> = TResponse extends unknown
  ? TResponse & AppointmentHandlerMetadata
  : never;

export type AppointmentPayload = UnwrapAppointmentPayload<AppointmentCreateRequest>;
export type AppointmentPatch = UnwrapAppointmentPatch<AppointmentPatchRequest>;

export interface AppointmentAuthParams {
  platform: string;
  userId: string | number;
}

export interface AppointmentAuthFailure {
  successful: false;
  returnMessage: ReturnMessage;
  isRevokeUserSession?: boolean;
  [key: string]: unknown;
}

export interface AppointmentResolvedAuth {
  successful: true;
  user: AppConnectUser;
  platformModule: AppointmentConnector;
  authHeader: string;
  proxyConfig?: unknown | null;
  [key: string]: unknown;
}

export type AppointmentAuthResult = AppointmentAuthFailure | AppointmentResolvedAuth;

export interface AppointmentHandlerMetadata {
  isRevokeUserSession?: boolean;
  extraDataTracking?: Record<string, unknown>;
}

export type AppointmentConnectorAppointment = Appointment & {
  id: string | number;
};

export interface AppointmentConnectorSuccessEnvelope
  extends AppointmentHandlerMetadata {
  successful?: true;
}

export interface AppointmentConnectorFailure
  extends AppointmentHandlerMetadata {
  successful: false;
  returnMessage: ReturnMessage;
}

export interface AppointmentListConnectorSuccess
  extends AppointmentConnectorSuccessEnvelope {
  appointments: AppointmentConnectorAppointment[];
}

export type AppointmentListConnectorResult =
  | AppointmentListConnectorSuccess
  | AppointmentConnectorFailure;

export interface AppointmentCreateConnectorSuccess
  extends AppointmentConnectorSuccessEnvelope {
  appointmentId: string | number;
  appointment?: AppointmentConnectorAppointment;
  returnMessage?: ReturnMessage;
}

export type AppointmentCreateConnectorResult =
  | AppointmentCreateConnectorSuccess
  | AppointmentConnectorFailure;

export interface AppointmentRecordConnectorSuccess
  extends AppointmentConnectorSuccessEnvelope {
  appointmentId?: never;
  appointment: AppointmentConnectorAppointment;
  returnMessage?: ReturnMessage;
}

export type AppointmentRecordConnectorResult =
  | AppointmentRecordConnectorSuccess
  | AppointmentConnectorFailure;

export interface AppointmentActionConnectorAppointmentSuccess
  extends AppointmentConnectorSuccessEnvelope {
  appointmentId?: never;
  appointment: AppointmentConnectorAppointment;
  returnMessage?: ReturnMessage;
}

export interface AppointmentActionConnectorMessageSuccess
  extends AppointmentConnectorSuccessEnvelope {
  appointmentId?: never;
  appointment?: never;
  returnMessage: ReturnMessage;
}

export type AppointmentActionConnectorResult =
  | AppointmentActionConnectorAppointmentSuccess
  | AppointmentActionConnectorMessageSuccess
  | AppointmentConnectorFailure;

export interface AppointmentConnectorAuthContext {
  proxyId?: unknown;
  proxyConfig?: unknown | null;
}

export interface AppointmentConnectorOAuthContext
  extends AppointmentConnectorAuthContext {
  tokenUrl?: unknown;
  hostname?: string;
}

export interface AppointmentConnectorRequestContext {
  user: AppConnectUser;
  authHeader: string;
  proxyConfig?: unknown | null;
}

export interface AppointmentListConnectorParams
  extends AppointmentConnectorRequestContext {
  range?: AppointmentRange;
}

export interface AppointmentCreateConnectorParams
  extends AppointmentConnectorRequestContext {
  payload?: AppointmentPayload;
}

export interface AppointmentPatchConnectorParams
  extends AppointmentConnectorRequestContext {
  appointmentId: string | number;
  patchBody?: AppointmentPatch | AppointmentStatusRequest;
}

export interface AppointmentRecordConnectorParams
  extends AppointmentConnectorRequestContext {
  appointmentId: string | number;
}

export interface AppointmentConnector {
  getAuthType(
    params: AppointmentConnectorAuthContext,
  ): string | Promise<string>;
  getOauthInfo(params: AppointmentConnectorOAuthContext): Promise<unknown>;
  getBasicAuth(params: { apiKey: string }): string;
  listAppointments(
    params: AppointmentListConnectorParams,
  ): Promise<AppointmentListConnectorResult>;
  createAppointment(
    params: AppointmentCreateConnectorParams,
  ): Promise<AppointmentCreateConnectorResult>;
  updateAppointment(
    params: AppointmentPatchConnectorParams,
  ): Promise<AppointmentRecordConnectorResult>;
  refreshAppointment(
    params: AppointmentRecordConnectorParams,
  ): Promise<AppointmentRecordConnectorResult>;
  confirmAppointment(
    params: AppointmentRecordConnectorParams,
  ): Promise<AppointmentActionConnectorResult>;
  cancelAppointment(
    params: AppointmentRecordConnectorParams,
  ): Promise<AppointmentActionConnectorResult>;
}

export type AppointmentListHandlerResult = WithAppointmentHandlerMetadata<AppointmentListResponse>;

export type AppointmentCreateHandlerResult = WithAppointmentHandlerMetadata<AppointmentCreateResponse>;

export type AppointmentRecordHandlerResult = WithAppointmentHandlerMetadata<
  WithoutRouteAppointmentId<AppointmentRecordResponse>
>;

export type AppointmentActionHandlerResult = WithAppointmentHandlerMetadata<
  WithoutRouteAppointmentId<AppointmentActionResponse>
>;

export type AppointmentMutationHandlerResult =
  | AppointmentCreateHandlerResult
  | AppointmentRecordHandlerResult
  | AppointmentActionHandlerResult;

export interface ListAppointmentsParams extends AppointmentAuthParams {
  range?: AppointmentRange;
}

export interface AppointmentPayloadParams extends AppointmentAuthParams {
  payload?: AppointmentPayload;
}

export interface AppointmentPatchParams extends AppointmentAuthParams {
  appointmentId: string | number;
  patchBody?: AppointmentPatch | AppointmentStatusRequest;
}

export interface AppointmentRecordParams extends AppointmentAuthParams {
  appointmentId: string | number;
}
