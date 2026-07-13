export interface JwtPayloadData {
  [key: string]: unknown;
}

export interface DecodedJwtPayload extends JwtPayloadData {
  exp?: number;
  iat?: number;
}
