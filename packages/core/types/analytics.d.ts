export interface AnalyticsTrackParams {
  eventName: string;
  interfaceName?: string;
  connectorName?: string;
  accountId?: string | number;
  extensionId?: string | number;
  rcAccountIdRaw?: unknown;
  rcExtensionIdRaw?: unknown;
  success?: boolean;
  requestDuration?: number;
  userAgent?: string;
  ip?: string;
  author?: string;
  eventAddedVia?: string;
  extras?: Record<string, unknown> | null;
}
