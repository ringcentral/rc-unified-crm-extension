import type { AppConnectUser, ContactInfo, ReturnMessage } from './common';
import type { JsonObject, JsonValue } from './json';

export type LoggerLevelName = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export type LoggerContext = Record<string, any>;

export interface LoggerOptions {
  level?: string;
}

export interface ChildLogger {
  error(message: string, context?: LoggerContext): void;
  warn(message: string, context?: LoggerContext): void;
  info(message: string, context?: LoggerContext): void;
  debug(message: string, context?: LoggerContext): void;
  child(additionalContext?: LoggerContext): ChildLogger;
}

export interface ApiRequestLogOptions {
  method?: string;
  url?: string;
  status?: number;
  duration?: number;
  platform?: string;
  error?: unknown;
}

export interface DatabaseQueryLogOptions {
  operation?: string;
  table?: string;
  duration?: number;
  error?: unknown;
}

export type TraceLevel = 'info' | 'warn' | 'error' | (string & {});

export interface TraceOptions {
  includeStack?: boolean;
  level?: TraceLevel;
}

export interface TraceEntry {
  timestamp: string;
  elapsed: number;
  methodName: string;
  level: TraceLevel;
  data: unknown;
  stackTrace?: string[];
}

export interface TraceActionSummary {
  index: number;
  timestamp: string;
  level: string;
  method: string;
  elapsedMs: number;
}

export interface DebugTraceData {
  sum: TraceActionSummary[];
  requestId: string;
  totalDuration: string;
  traceCount: number;
  traces: TraceEntry[];
}

export interface RequestWithHeaders {
  headers?: Record<string, unknown>;
  [key: string]: unknown;
}

export type LogDetailsFormatType = 'text/plain' | 'text/html' | 'text/markdown';

export type CallDirection = 'Inbound' | 'Outbound' | (string & {});

export interface PhoneParty {
  phoneNumber?: string;
  extensionNumber?: string;
  name?: string;
  [key: string]: unknown;
}

export interface RingCentralCallLog {
  id?: string;
  telephonySessionId?: string;
  sessionId?: string;
  direction?: CallDirection;
  from?: PhoneParty;
  to?: PhoneParty;
  startTime?: string | Date;
  duration?: number;
  result?: string;
  legs?: JsonObject[];
  [key: string]: unknown;
}

export interface CallLogLookupInput {
  extensionNumber?: string | number | null;
  hashedExtensionId?: string | number | null;
  rcExtensionId?: string | number | null;
  logInfo?: {
    extensionNumber?: string | number | null;
    hashedExtensionId?: string | number | null;
    rcExtensionId?: string | number | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export interface PersistedCallLogIdentity {
  sessionId?: string;
  extensionNumber?: string | number | null;
  hashedExtensionId?: string | number | null;
  [key: string]: unknown;
}

export interface BuildCallLogSessionWhereParams {
  sessionId?: string;
  sessionIds?: string[];
  extensionNumber?: string | number | null;
  hashedExtensionId?: string | number | null;
}

export interface CallLogSubmission {
  logInfo?: JsonObject;
  callLog?: RingCentralCallLog;
  contactInfo?: ContactInfo;
  contactId?: string | number;
  note?: string;
  aiNote?: string;
  transcript?: string;
  recordingLink?: string;
  subject?: string;
  startTime?: string | Date;
  duration?: number;
  result?: string;
  [key: string]: unknown;
}

export interface ComposeCallLogParams {
  logFormat?: LogDetailsFormatType;
  existingBody?: string;
  callLog?: RingCentralCallLog;
  contactInfo?: ContactInfo;
  user: AppConnectUser;
  note?: string;
  aiNote?: string;
  transcript?: string;
  recordingLink?: string;
  subject?: string;
  startTime?: string | Date;
  duration?: number;
  result?: string;
  ringSenseTranscript?: string;
  ringSenseSummary?: string;
  ringSenseAIScore?: string | number;
  ringSenseBulletedSummary?: string;
  ringSenseLink?: string;
  [key: string]: unknown;
}

export interface MessageLogSubmission {
  messageId?: string;
  conversationId?: string;
  direction?: CallDirection;
  from?: PhoneParty;
  to?: PhoneParty[];
  text?: string;
  attachments?: JsonValue[];
  [key: string]: unknown;
}

export interface AppointmentSubmission {
  id?: string;
  subject?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  contactId?: string | number;
  thirdPartyAppointmentId?: string | number;
  [key: string]: unknown;
}

export interface CallDispositionItem {
  id?: string | number;
  value?: unknown;
  [key: string]: unknown;
}

export interface UpsertCallDispositionParams {
  platform: string;
  userId: string | number;
  sessionId: string;
  extensionNumber?: string | number | null;
  hashedExtensionId?: string | number | null;
  dispositions?: CallDispositionItem[];
}

export interface UpsertCallDispositionResult {
  successful: boolean;
  logId?: string | number;
  returnMessage?: ReturnMessage;
  extraDataTracking?: unknown;
  isRevokeUserSession?: boolean;
  [key: string]: unknown;
}

export interface MockGetCallLogParams {
  sessionIds: string;
  extensionNumber?: string | number | null;
  hashedExtensionId?: string | number | null;
}

export interface MockCreateCallLogParams {
  sessionId: string;
  extensionNumber?: string | number | null;
  hashedExtensionId?: string | number | null;
}

export interface MockCallLogMatchResult {
  sessionId: string;
  matched: boolean;
  logId?: string;
}
