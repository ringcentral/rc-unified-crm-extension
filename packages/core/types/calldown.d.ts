import type { ReturnMessage } from './common';

export interface CallDownJwtData {
  id?: string | number;
  [key: string]: unknown;
}

export interface CallDownScheduleBody {
  contactId?: string | number | null;
  contactType?: string | null;
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
  returnMessage?: ReturnMessage;
}

export interface CallDownSnapshot {
  id: string;
  contactId: string | number | null;
  contactType: string | null;
  phoneNumber?: string;
  status: string | null;
  scheduledAt: string | null;
  lastCallAt: string | null;
}

export type CallDownSyncEvent = 'created' | 'updated' | 'called' | 'deleted';

export interface CallDownCallbackParams {
  user: unknown;
  authHeader: string;
  proxyConfig?: unknown | null;
  callback: CallDownSnapshot;
}

export interface CreateCallbackParams extends CallDownCallbackParams {}

export interface UpdateCallbackParams extends CallDownCallbackParams {
  previous: CallDownSnapshot | null;
  thirdPartyId: string | null;
}

export interface MarkCalledCallbackParams extends CallDownCallbackParams {
  previous: CallDownSnapshot | null;
  thirdPartyId: string | null;
}

export interface DeleteCallbackParams extends CallDownCallbackParams {
  thirdPartyId: string | null;
}

export interface CallDownSyncResult {
  successful?: boolean;
  thirdPartyId?: string | number | null;
  returnMessage?: ReturnMessage;
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
