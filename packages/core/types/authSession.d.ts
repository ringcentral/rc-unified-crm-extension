export type AuthSessionStatus =
  | 'pending'
  | 'completed'
  | 'expired'
  | (string & {});

export interface AuthSessionData {
  platform?: string;
  hostname?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: AuthSessionStatus;
  jwtToken?: string;
  rcExtensionId?: string;
  [key: string]: unknown;
}

export type AuthSessionCreateData = Pick<AuthSessionData, 'platform' | 'hostname'> & Record<string, unknown>;

export interface AuthSessionUpdateData extends AuthSessionData {}

export interface AuthSessionRecord {
  userId?: string;
  status?: AuthSessionStatus;
  data?: AuthSessionData | null;
  expiry?: Date | null;
  update(values: Record<string, unknown>): Promise<unknown>;
  [key: string]: unknown;
}

export interface AuthSessionResult extends AuthSessionData {
  sessionId?: string;
  status?: AuthSessionStatus;
}
