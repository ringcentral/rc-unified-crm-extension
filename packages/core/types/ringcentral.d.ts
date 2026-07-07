export interface RingCentralOptions {
  server: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface RingCentralToken {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: string | number;
  refresh_token_expires_in?: string | number;
  expire_time?: number;
  refresh_token_expire_time?: number;
  [key: string]: unknown;
}

export interface RingCentralLoginUrlParams {
  state?: string;
}

export interface RingCentralGenerateTokenParams {
  code: string;
}

export interface RingCentralRequestOptions {
  server?: string;
  path: string;
  query?: Record<string, any>;
  body?: unknown;
  method: string;
  accept?: string;
}

export interface RingCentralFetchResponse {
  status: string | number;
  json(): Promise<any>;
  text(): Promise<string>;
  [key: string]: unknown;
}

export interface RingCentralSubscriptionParams {
  eventFilters: string[];
  webhookUri: string;
}

export interface RingCentralCallsAggregationParams {
  token: RingCentralToken;
  timezone: string;
  timeFrom: string;
  timeTo: string;
  groupBy: string;
}

export interface RingCentralPaginatedDataParams {
  extensionId?: string | number;
  token: RingCentralToken;
  timeFrom: string;
  timeTo: string;
}
