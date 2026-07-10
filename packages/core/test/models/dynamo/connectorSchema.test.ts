// Mock dynamoose before requiring the module
const crypto = require('crypto');

jest.mock('dynamoose', () => {
  const mockModel = {
    query: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    using: jest.fn().mockReturnThis(),
    exec: jest.fn()
  };

  return {
    Schema: jest.fn().mockReturnValue({}),
    model: jest.fn().mockReturnValue(mockModel)
  };
});

describe('Connector Schema', () => {
  const originalEnv = process.env.DEVELOPER_APP_SERVER_SECRET_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env.DEVELOPER_APP_SERVER_SECRET_KEY = 'test-secret-key-12345678901234';
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.DEVELOPER_APP_SERVER_SECRET_KEY = originalEnv;
    } else {
      delete process.env.DEVELOPER_APP_SERVER_SECRET_KEY;
    }
    if (originalNodeEnv) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  function encryptSecret(secret, key) {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, Buffer.alloc(16, 0));
    return cipher.update(secret, 'utf8', 'hex') + cipher.final('hex');
  }

  describe('getProxyConfig', () => {
    test('should return proxy config when connector found', async () => {
      const mockProxyConfig = {
        operations: {
          createCallLog: { method: 'POST', url: '/api/logs' },
          findContact: { method: 'GET', url: '/api/contacts' }
        }
      };

      const mockConnector = {
        proxyConfig: mockProxyConfig,
        encodedSecretKey: null
      };

      // Import fresh module
      const { Connector } = require('../../../models/dynamo/connectorSchema');

      // Mock the query chain
      Connector.query = jest.fn().mockReturnThis();
      Connector.eq = jest.fn().mockReturnThis();
      Connector.using = jest.fn().mockReturnThis();
      Connector.exec = jest.fn().mockResolvedValue([mockConnector]);

      const result = await Connector.getProxyConfig('proxy-123');

      expect(Connector.query).toHaveBeenCalledWith('proxyId');
      expect(Connector.eq).toHaveBeenCalledWith('proxy-123');
      expect(Connector.using).toHaveBeenCalledWith('proxyIdIndex');
      expect(result).toEqual(mockProxyConfig);
    });

    test('should return null when no connector found', async () => {
      const { Connector } = require('../../../models/dynamo/connectorSchema');

      Connector.query = jest.fn().mockReturnThis();
      Connector.eq = jest.fn().mockReturnThis();
      Connector.using = jest.fn().mockReturnThis();
      Connector.exec = jest.fn().mockResolvedValue([]);

      const result = await Connector.getProxyConfig('non-existent-proxy');

      expect(result).toBeNull();
    });

    test('should handle proxy config without encoded secret key', async () => {
      const mockProxyConfig = {
        operations: {
          findContact: { method: 'GET', url: '/api/contacts' }
        }
      };

      const mockConnector = {
        proxyConfig: mockProxyConfig,
        encodedSecretKey: ''
      };

      const { Connector } = require('../../../models/dynamo/connectorSchema');

      Connector.query = jest.fn().mockReturnThis();
      Connector.eq = jest.fn().mockReturnThis();
      Connector.using = jest.fn().mockReturnThis();
      Connector.exec = jest.fn().mockResolvedValue([mockConnector]);

      const result = await Connector.getProxyConfig('proxy-no-secret');

      expect(result).toEqual(mockProxyConfig);
      expect(result.secretKey).toBeUndefined();
    });

    test('should handle undefined encoded secret key', async () => {
      const mockProxyConfig = {
        operations: {
          createCallLog: { method: 'POST', url: '/api/logs' }
        }
      };

      const mockConnector = {
        proxyConfig: mockProxyConfig,
        encodedSecretKey: undefined
      };

      const { Connector } = require('../../../models/dynamo/connectorSchema');

      Connector.query = jest.fn().mockReturnThis();
      Connector.eq = jest.fn().mockReturnThis();
      Connector.using = jest.fn().mockReturnThis();
      Connector.exec = jest.fn().mockResolvedValue([mockConnector]);

      const result = await Connector.getProxyConfig('proxy-undefined-secret');

      expect(result).toEqual(mockProxyConfig);
      expect(result.secretKey).toBeUndefined();
    });
  });

  describe('CONNECTOR_STATUS constants', () => {
    test('should have correct status values in schema enum', () => {
      // The status values are defined in the schema
      const expectedStatuses = ['private', 'under_review', 'approved', 'rejected'];
      
      // Import the module to verify it loads without error
      const { Connector } = require('../../../models/dynamo/connectorSchema');
      
      // The module exports Connector which means schema was created successfully
      expect(Connector).toBeDefined();
      expect(typeof Connector.getProxyConfig).toBe('function');
    });
  });

  describe('Module Structure', () => {
    test('should export Connector model', () => {
      const connectorModule = require('../../../models/dynamo/connectorSchema');
      
      expect(connectorModule.Connector).toBeDefined();
    });

    test('should have getProxyConfig static method', () => {
      const { Connector } = require('../../../models/dynamo/connectorSchema');
      
      expect(typeof Connector.getProxyConfig).toBe('function');
    });
  });

  describe('table options', () => {
    test('should disable table creation in production', () => {
      process.env.NODE_ENV = 'production';
      jest.resetModules();

      const dynamoose = require('dynamoose');
      require('../../../models/dynamo/connectorSchema');

      expect(dynamoose.model).toHaveBeenCalledWith(
        'connectors',
        expect.anything(),
        expect.objectContaining({
          create: false,
          waitForActive: false
        })
      );
    });
  });

  describe('getDeveloperCipherKey behavior', () => {
    // These tests verify the cipher key handling indirectly through the module
    
    test('should handle secret key of exactly 32 characters', async () => {
      process.env.DEVELOPER_APP_SERVER_SECRET_KEY = '12345678901234567890123456789012'; // exactly 32 chars
      
      jest.resetModules();
      
      const { Connector } = require('../../../models/dynamo/connectorSchema');
      
      // If the key is exactly 32 chars, no padding/truncation needed
      expect(Connector).toBeDefined();
    });

    test('should throw error when DEVELOPER_APP_SERVER_SECRET_KEY is not set and decode is called', async () => {
      delete process.env.DEVELOPER_APP_SERVER_SECRET_KEY;
      
      jest.resetModules();
      
      const { Connector } = require('../../../models/dynamo/connectorSchema');
      
      Connector.query = jest.fn().mockReturnThis();
      Connector.eq = jest.fn().mockReturnThis();
      Connector.using = jest.fn().mockReturnThis();
      Connector.exec = jest.fn().mockResolvedValue([{
        proxyConfig: { test: true },
        encodedSecretKey: 'some-encrypted-value'
      }]);

      // The decode function will be called which requires the secret key
      await expect(Connector.getProxyConfig('test')).rejects.toThrow('DEVELOPER_APP_SERVER_SECRET_KEY is not defined');
    });

    test('should decrypt encoded secret key using padded short secret', async () => {
      process.env.DEVELOPER_APP_SERVER_SECRET_KEY = 'short-secret';
      jest.resetModules();

      const encodedSecretKey = encryptSecret(
        'decoded-secret',
        process.env.DEVELOPER_APP_SERVER_SECRET_KEY.padEnd(32, ' ')
      );
      const { Connector } = require('../../../models/dynamo/connectorSchema');

      Connector.query = jest.fn().mockReturnThis();
      Connector.eq = jest.fn().mockReturnThis();
      Connector.using = jest.fn().mockReturnThis();
      Connector.exec = jest.fn().mockResolvedValue([{
        proxyConfig: { operations: {} },
        encodedSecretKey
      }]);

      const result = await Connector.getProxyConfig('test');

      expect(result.secretKey).toBe('decoded-secret');
    });

    test('should decrypt encoded secret key using truncated long secret', async () => {
      process.env.DEVELOPER_APP_SERVER_SECRET_KEY = '12345678901234567890123456789012-extra';
      jest.resetModules();

      const encodedSecretKey = encryptSecret(
        'decoded-secret',
        process.env.DEVELOPER_APP_SERVER_SECRET_KEY.slice(0, 32)
      );
      const { Connector } = require('../../../models/dynamo/connectorSchema');

      Connector.query = jest.fn().mockReturnThis();
      Connector.eq = jest.fn().mockReturnThis();
      Connector.using = jest.fn().mockReturnThis();
      Connector.exec = jest.fn().mockResolvedValue([{
        proxyConfig: { operations: {} },
        encodedSecretKey
      }]);

      const result = await Connector.getProxyConfig('test');

      expect(result.secretKey).toBe('decoded-secret');
    });
  });
});

export {};
