const jwt = require('../../lib/jwt');

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
