import type { ReturnMessage } from './common';

export interface CallDownJwtData {
  id?: string | number;
  [key: string]: unknown;
}

export interface CallDownScheduleBody {
  contactId?: string | number | null;
  contactType?: string | null;
  contactName?: string | null;
  phoneNumber?: string | null;
  scheduledAt?: string | number | Date | null;
  [key: string]: unknown;
}

export interface CallDownScheduleParams {
  jwtToken: string;
  body: CallDownScheduleBody;
  rcAccessToken?: string;
}

export interface CallDownScheduleResult {
  id: string;
}

export interface CallDownListParams {
  jwtToken: string;
  status?: string | number | null;
}

export interface CallDownListResult {
  items: unknown[];
}

export interface CallDownRecordParams {
  jwtToken: string;
  id: string;
}

export interface CallDownMarkCalledParams extends CallDownRecordParams {
  lastCallAt?: string | number | Date | null;
}

export type CallDownUpdateData = Record<string, unknown>;

export interface CallDownUpdateParams extends CallDownRecordParams {
  updateData: CallDownUpdateData;
}

export interface CallDownOperationResult {
  successful: boolean;
  returnMessage?: ReturnMessage;
}
