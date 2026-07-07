import type { AppConnectUser, ReturnMessage } from './common';

export interface AppointmentAuthParams {
  platform: string;
  userId: string | number;
}

export interface AppointmentAuthFailure {
  successful: false;
  returnMessage?: ReturnMessage;
  isRevokeUserSession?: boolean;
  [key: string]: unknown;
}

export interface AppointmentResolvedAuth {
  successful: true;
  user: AppConnectUser;
  platformModule: any;
  authHeader: string;
  proxyConfig?: unknown | null;
  [key: string]: unknown;
}

export type AppointmentAuthResult = AppointmentAuthFailure | AppointmentResolvedAuth;

export interface AppointmentHandlerResult {
  successful: boolean;
  returnMessage?: ReturnMessage;
  isRevokeUserSession?: boolean;
  [key: string]: unknown;
}

export interface ListAppointmentsParams extends AppointmentAuthParams {
  range?: unknown;
  mineOnly?: boolean;
  forceSync?: boolean;
}

export interface AppointmentPayloadParams extends AppointmentAuthParams {
  payload?: unknown;
}

export interface AppointmentPatchParams extends AppointmentAuthParams {
  appointmentId: string | number;
  patchBody?: unknown;
}

export interface AppointmentRecordParams extends AppointmentAuthParams {
  appointmentId: string | number;
}
