export type SharedSMSLogFormat = 'text/plain' | 'text/html' | 'text/markdown' | (string & {});

export interface SharedSMSNamedParty {
  name?: string;
  [key: string]: unknown;
}

export interface SharedSMSEntity {
  recordType?: string;
  creationTime?: any;
  direction?: string;
  author?: SharedSMSNamedParty;
  from?: SharedSMSNamedParty | null;
  initiator?: SharedSMSNamedParty;
  assignee?: SharedSMSNamedParty;
  text?: string;
  subject?: string;
  body?: string;
  [key: string]: unknown;
}

export interface SharedSMSMessage {
  lastModifiedTime?: any;
  [key: string]: unknown;
}

export interface SharedSMSOwner {
  name?: string;
  extensionType?: string;
  extensionId?: string | number;
  [key: string]: unknown;
}

export interface SharedSMSConversation {
  creationTime?: any;
  messages: SharedSMSMessage[];
  entities?: SharedSMSEntity[];
  owner?: SharedSMSOwner;
  [key: string]: unknown;
}

export interface ComposeSharedSMSLogParams {
  logFormat?: SharedSMSLogFormat;
  conversation: SharedSMSConversation;
  contactName: string;
  timezoneOffset?: string | number;
}

export interface SharedSMSLogContent {
  subject: string;
  body: string;
}

export interface SharedSMSOwnerInfo {
  type: 'callQueue' | 'user';
  name: string;
  extensionId?: string | number;
}

export interface SharedSMSEntityCounts {
  messageCount: number;
  noteCount: number;
}

export interface SharedSMSProcessedEntry {
  type: string;
  creationTime: any;
  content: string;
}

export interface ComposeSharedSMSBodyParams extends ComposeSharedSMSLogParams {
  conversationCreatedDate: any;
  conversationUpdatedDate: any;
  logFormat: SharedSMSLogFormat;
}

export interface ProcessSharedSMSEntitiesParams {
  entities: SharedSMSEntity[];
  timezoneOffset?: string | number;
  logFormat: SharedSMSLogFormat;
  contactName: string;
}

export interface ProcessSharedSMSEntityParams extends Omit<ProcessSharedSMSEntitiesParams, 'entities'> {
  entity: SharedSMSEntity;
}

export interface FormatSharedSMSEntryParams {
  entity: SharedSMSEntity;
  formattedTime: string;
  creationTime: any;
  logFormat: SharedSMSLogFormat;
  contactName?: string;
}

export interface ComposeSharedSMSFormattedBodyParams {
  conversationCreatedDate: any;
  conversationUpdatedDate: any;
  contactName: string;
  agents: string[];
  ownerInfo: SharedSMSOwnerInfo | null;
  messageCount: number;
  noteCount: number;
  formattedEntries: SharedSMSProcessedEntry[];
}
