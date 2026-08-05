export interface CacheCleanupOptions {
  now?: Date;
}

export interface AccountContactCleanupOptions extends CacheCleanupOptions {
  retentionMonths?: number;
}

export interface AccountContactCutoffOptions {
  now: Date;
  retentionMonths: number;
}
