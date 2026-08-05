import type { ReturnMessage } from './common';

export type ErrorStatusCode = number | 'unknown';

export interface ProviderError extends Error {
  response?: {
    status?: number;
    data?: unknown;
    [key: string]: unknown;
  };
  statusCode?: number;
  [key: string]: unknown;
}

export interface OperationFailureResult {
  successful: false;
  returnMessage: ReturnMessage;
  extraDataTracking?: {
    statusCode: ErrorStatusCode;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface OperationErrorMessageConfig {
  message: string;
  details: string[];
}

export type OperationMessageMap = Record<string, OperationErrorMessageConfig>;

export interface ExpressLikeRequest {
  platform?: string;
  query?: {
    platform?: string;
    [key: string]: unknown;
  };
  route?: {
    path?: string;
    [key: string]: unknown;
  };
  method?: string;
  path?: string;
  correlationId?: string;
  [key: string]: unknown;
}

export interface ExpressLikeResponse {
  status(code: number): ExpressLikeResponse;
  json(body: unknown): unknown;
  [key: string]: unknown;
}

export type ExpressLikeNext = (error?: unknown) => void;

export type AsyncRouteHandler = (
  req: ExpressLikeRequest,
  res: ExpressLikeResponse,
  next: ExpressLikeNext,
) => unknown | Promise<unknown>;
