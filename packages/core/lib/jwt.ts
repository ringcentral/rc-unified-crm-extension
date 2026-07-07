import type { DecodedJwtPayload, JwtPayloadData } from '../types';

const { sign, verify } = require('jsonwebtoken');
const logger = require('./logger');

function generateJwt(data: JwtPayloadData): string {
  return sign(data, process.env.APP_SERVER_SECRET_KEY, { expiresIn: '2w' });
}

function decodeJwt(token: string): DecodedJwtPayload | null {
  try {
    return verify(token, process.env.APP_SERVER_SECRET_KEY) as DecodedJwtPayload;
  } catch (e: any) {
    logger.error('Error decoding JWT', { stack: e.stack });
    return null;
  }
}

export {
  decodeJwt,
  generateJwt
};
