export type SequelizeLike = any;

export type SequelizeTransactionLike = any;

export type TableDescription = Record<string, unknown>;

export interface PostgresClientLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface MigrationLogger {
  info?(message: string, context?: Record<string, unknown>): void;
  warn?(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
}
