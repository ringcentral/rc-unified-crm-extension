const jwt = require('../../lib/jwt');
const tsJwt = require('../../lib/jwt.ts');
const { sign } = require('jsonwebtoken');
const {
  roundTripPayloadCases,
  invalidTokenInputs,
} = require('../data/jwtCases');

describe('JWT Utility', () => {
  beforeEach(() => {
    // Reset environment
    process.env.APP_SERVER_SECRET_KEY = 'test-secret-key';
  });

  describe('generateJwt', () => {
    test('should generate JWT token from payload', () => {
      // Arrange
      const payload = {
        id: 'test-user-id',
        platform: 'testCRM'
      };

      // Act
      const token = jwt.generateJwt(payload);

      // Assert
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    test('should generate different tokens for different payloads', () => {
      // Arrange
      const payload1 = { id: 'user1', platform: 'testCRM' };
      const payload2 = { id: 'user2', platform: 'testCRM' };

      // Act
      const token1 = jwt.generateJwt(payload1);
      const token2 = jwt.generateJwt(payload2);

      // Assert
      expect(token1).not.toBe(token2);
    });

    test('should generate token with about 2 weeks lifetime', () => {
      // Arrange
      const payload = { id: 'user-ttl', platform: 'testCRM' };

      // Act
      const token = jwt.generateJwt(payload);
      const decoded = jwt.decodeJwt(token);
      const lifetimeSeconds = decoded.exp - decoded.iat;

      // Assert
      // Keep a tiny tolerance to avoid timing flakiness.
      expect(lifetimeSeconds).toBeGreaterThanOrEqual((14 * 24 * 60 * 60) - 2);
      expect(lifetimeSeconds).toBeLessThanOrEqual((14 * 24 * 60 * 60) + 2);
    });
  });

  describe('decodeJwt', () => {
    test('should decode valid JWT token', () => {
      // Arrange
      const payload = {
        id: 'test-user-id',
        platform: 'testCRM'
      };
      const token = jwt.generateJwt(payload);

      // Act
      const decoded = jwt.decodeJwt(token);

      // Assert
      expect(decoded).toMatchObject(payload);
      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('iat');
    });

    test('should return null for invalid token', () => {
      // Arrange
      const invalidToken = 'invalid.jwt.token';

      // Act
      const decoded = jwt.decodeJwt(invalidToken);

      // Assert
      expect(decoded).toBeNull();
    });

    test('should return null for malformed token', () => {
      // Arrange
      const malformedToken = 'not-a-jwt-token';

      // Act
      const decoded = jwt.decodeJwt(malformedToken);

      // Assert
      expect(decoded).toBeNull();
    });

    test('should return null for token with wrong secret', () => {
      // Arrange
      const payload = { id: 'test-user-id', platform: 'testCRM' };
      const token = jwt.generateJwt(payload);
      
      // Change secret temporarily
      const originalSecret = process.env.APP_SERVER_SECRET_KEY;
      process.env.APP_SERVER_SECRET_KEY = 'different-secret';

      // Act
      const decoded = jwt.decodeJwt(token);

      // Restore secret
      process.env.APP_SERVER_SECRET_KEY = originalSecret;

      // Assert
      expect(decoded).toBeNull();
    });
  });

  describe('generateJwt and decodeJwt round trip', () => {
    test('keeps TypeScript implementation aligned with compatibility JS entrypoint', () => {
      const payload = { id: 'cross-path-user', platform: 'testCRM' };

      const jsToken = jwt.generateJwt(payload);
      const tsToken = tsJwt.generateJwt(payload);

      expect(tsJwt.decodeJwt(jsToken)).toMatchObject(payload);
      expect(jwt.decodeJwt(tsToken)).toMatchObject(payload);
    });

    test('should successfully generate and decode complex payload', () => {
      // Arrange
      const complexPayload = {
        id: 'test-user-id',
        platform: 'testCRM',
        timestamp: Date.now(),
        metadata: {
          timezone: 'America/Los_Angeles',
          preferences: {
            autoLog: true,
            callPop: false
          }
        }
      };

      // Act
      const token = jwt.generateJwt(complexPayload);
      const decoded = jwt.decodeJwt(token);

      // Assert
      expect(decoded).toMatchObject(complexPayload);
      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('iat');
    });

    test('should handle empty payload', () => {
      // Arrange
      const emptyPayload = {};

      // Act
      const token = jwt.generateJwt(emptyPayload);
      const decoded = jwt.decodeJwt(token);

      // Assert
      expect(decoded).toMatchObject(emptyPayload);
      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('iat');
    });

    test.each<[any]>(roundTripPayloadCases as [any][])('preserves $label through a signed-token round trip', ({ payload }) => {
      const token = jwt.generateJwt(payload);

      expect(jwt.decodeJwt(token)).toMatchObject(payload);
      expect(tsJwt.decodeJwt(token)).toMatchObject(payload);
    });
  });

  describe('decodeJwt token variations', () => {
    test.each<[any]>(invalidTokenInputs as [any][])('returns null for $label input', ({ token }) => {
      expect(jwt.decodeJwt(token)).toBeNull();
    });

    test('returns null for an expired token', () => {
      const token = sign(
        { id: 'expired-user', platform: 'testCRM' },
        process.env.APP_SERVER_SECRET_KEY,
        { expiresIn: -1 },
      );

      expect(jwt.decodeJwt(token)).toBeNull();
    });

    test('returns null for a token that is not active yet', () => {
      const token = sign(
        { id: 'future-user', platform: 'testCRM' },
        process.env.APP_SERVER_SECRET_KEY,
        { notBefore: '10m' },
      );

      expect(jwt.decodeJwt(token)).toBeNull();
    });

    test('returns null when one character of an otherwise valid signature is changed', () => {
      const token = jwt.generateJwt({ id: 'tampered-user', platform: 'testCRM' });
      const finalCharacter = token.at(-1);
      const tamperedToken = `${token.slice(0, -1)}${finalCharacter === 'a' ? 'b' : 'a'}`;

      expect(jwt.decodeJwt(tamperedToken)).toBeNull();
    });
  });

  describe('error handling', () => {
    test('should handle missing secret key', () => {
      // Arrange
      const payload = { id: 'test-user-id' };
      delete process.env.APP_SERVER_SECRET_KEY;

      // Act & Assert
      expect(() => jwt.generateJwt(payload)).toThrow();
    });

    test('should handle null payload', () => {
      // Act & Assert
      expect(() => jwt.generateJwt(null)).toThrow();
    });

    test('should handle undefined payload', () => {
      // Act & Assert
      expect(() => jwt.generateJwt(undefined)).toThrow();
    });
  });
});

export {};
