// Use in-memory SQLite for isolated model tests
jest.mock('../../models/sequelize', () => {
  const { Sequelize } = require('sequelize');
  return {
    sequelize: new Sequelize({
      dialect: 'sqlite',
      storage: ':memory:',
      logging: false,
    }),
  };
});

jest.mock('../../connector/registry');
jest.mock('../../lib/oauth');
jest.mock('../../models/dynamo/connectorSchema', () => ({
  Connector: {
    getProxyConfig: jest.fn()
  }
}));

const contactHandler = require('../../handlers/contact');
const { UserModel } = require('../../models/userModel');
const { AccountDataModel } = require('../../models/accountDataModel');
const connectorRegistry = require('../../connector/registry');
const oauth = require('../../lib/oauth');
const { Connector } = require('../../models/dynamo/connectorSchema');
const { sequelize } = require('../../models/sequelize');

describe('Contact Handler', () => {
  beforeAll(async () => {
    await UserModel.sync({ force: true });
    await AccountDataModel.sync({ force: true });
  });

  afterEach(async () => {
    await UserModel.destroy({ where: {} });
    await AccountDataModel.destroy({ where: {} });
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('findContact', () => {
    const mockUser = {
      id: 'test-user-id',
      platform: 'testCRM',
      accessToken: 'test-access-token',
      rcAccountId: 'rc-account-123',
      platformAdditionalInfo: {}
    };

    test('should return warning when user not found', async () => {
      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'non-existent-user',
        phoneNumber: '+1234567890'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('Contact not found');
      expect(result.returnMessage.messageType).toBe('warning');
    });

    test('should return warning when user has no access token', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: null
      });

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('Contact not found');
    });

    test('should return cached contact when available', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const cachedContact = [
        { id: 'contact-1', name: 'Cached Contact', type: 'Contact', phone: '+1234567890' }
      ];
      await AccountDataModel.create({
        rcAccountId: 'rc-account-123',
        platformName: 'testCRM',
        dataKey: 'contact-+1234567890',
        data: cachedContact
      });

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890',
        isForceRefreshAccountData: false
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.contact).toEqual(cachedContact);
      // Should not call platform module
      expect(connectorRegistry.getConnector).not.toHaveBeenCalled();
    });

    test('should bypass cache when isForceRefreshAccountData is true', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const cachedContact = [
        { id: 'contact-1', name: 'Cached Contact', type: 'Contact', phone: '+1234567890' }
      ];
      await AccountDataModel.create({
        rcAccountId: 'rc-account-123',
        platformName: 'testCRM',
        dataKey: 'contact-+1234567890',
        data: cachedContact
      });

      const freshContact = [
        { id: 'contact-1', name: 'Fresh Contact', type: 'Contact', phone: '+1234567890' }
      ];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContact: jest.fn().mockResolvedValue({
          successful: true,
          matchedContactInfo: freshContact
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890',
        isForceRefreshAccountData: true
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.contact).toEqual(freshContact);
      expect(mockConnector.findContact).toHaveBeenCalled();
    });

    test('should find contact with apiKey auth and cache result', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const matchedContact = [
        { id: 'contact-new', name: 'New Contact', type: 'Contact', phone: '+9876543210' }
      ];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContact: jest.fn().mockResolvedValue({
          successful: true,
          matchedContactInfo: matchedContact
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+9876543210'
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.contact).toEqual(matchedContact);
      expect(mockConnector.getBasicAuth).toHaveBeenCalledWith({ apiKey: 'test-access-token' });

      // Verify contact was cached
      const cachedData = await AccountDataModel.findOne({
        where: {
          rcAccountId: 'rc-account-123',
          platformName: 'testCRM',
          dataKey: 'contact-+9876543210'
        }
      });
      expect(cachedData).not.toBeNull();
      expect(cachedData.data).toEqual(matchedContact);
    });

    test('should find contact with oauth auth', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const matchedContact = [
        { id: 'oauth-contact', name: 'OAuth Contact', type: 'Lead' }
      ];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('oauth'),
        getOauthInfo: jest.fn().mockResolvedValue({
          clientId: 'client-id',
          clientSecret: 'client-secret',
          accessTokenUri: 'https://token.url',
          authorizationUri: 'https://auth.url'
        }),
        findContact: jest.fn().mockResolvedValue({
          successful: true,
          matchedContactInfo: matchedContact
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      const mockOAuthApp = {};
      oauth.getOAuthApp.mockReturnValue(mockOAuthApp);
      oauth.checkAndRefreshAccessToken.mockResolvedValue({
        ...mockUser,
        accessToken: 'refreshed-token'
      });

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1111111111'
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(oauth.checkAndRefreshAccessToken).toHaveBeenCalled();
    });

    test('should use proxy config when proxyId is present', async () => {
      // Arrange
      const userWithProxy = {
        ...mockUser,
        platformAdditionalInfo: { proxyId: 'proxy-123' }
      };
      await UserModel.create(userWithProxy);

      const proxyConfig = { baseUrl: 'https://proxy.example.com' };
      Connector.getProxyConfig.mockResolvedValue(proxyConfig);

      const matchedContact = [{ id: 'proxy-contact', name: 'Proxy Contact' }];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContact: jest.fn().mockResolvedValue({
          successful: true,
          matchedContactInfo: matchedContact
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+2222222222'
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(Connector.getProxyConfig).toHaveBeenCalledWith('proxy-123');
      expect(mockConnector.findContact).toHaveBeenCalledWith(
        expect.objectContaining({ proxyConfig })
      );
    });

    test('should return warning when no contacts found', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContact: jest.fn().mockResolvedValue({
          successful: false,
          matchedContactInfo: null
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+9999999999'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('Contact not found');
      expect(result.returnMessage.details[0].items[0].text).toContain('+9999999999');
    });

    test('should return platform returnMessage when provided', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const customReturnMessage = {
        message: 'Custom platform message',
        messageType: 'info',
        ttl: 5000
      };

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContact: jest.fn().mockResolvedValue({
          successful: false,
          matchedContactInfo: null,
          returnMessage: customReturnMessage
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+8888888888'
      });

      // Assert
      expect(result.returnMessage).toEqual(customReturnMessage);
    });

    test('should handle 429 rate limit error', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContact: jest.fn().mockRejectedValue({
          response: { status: 429 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+7777777777'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.extraDataTracking.statusCode).toBe(429);
    });

    test('should handle 401 authorization error', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContact: jest.fn().mockRejectedValue({
          response: { status: 401 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+6666666666'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.extraDataTracking.statusCode).toBe(401);
    });

    test('should update existing cached contact', async () => {
      // Arrange
      await UserModel.create(mockUser);

      // Create existing cached contact
      await AccountDataModel.create({
        rcAccountId: 'rc-account-123',
        platformName: 'testCRM',
        dataKey: 'contact-+5555555555',
        data: [{ id: 'old-contact', name: 'Old Name' }]
      });

      const updatedContact = [
        { id: 'old-contact', name: 'Updated Name', type: 'Contact' }
      ];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContact: jest.fn().mockResolvedValue({
          successful: true,
          matchedContactInfo: updatedContact
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+5555555555',
        isForceRefreshAccountData: true
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.contact).toEqual(updatedContact);

      // Verify cache was updated
      const cachedData = await AccountDataModel.findOne({
        where: {
          rcAccountId: 'rc-account-123',
          platformName: 'testCRM',
          dataKey: 'contact-+5555555555'
        }
      });
      expect(cachedData.data).toEqual(updatedContact);
    });

    test('should work with tracer when provided', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockTracer = {
        trace: jest.fn(),
        traceError: jest.fn()
      };

      const matchedContact = [{ id: 'traced-contact', name: 'Traced Contact' }];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContact: jest.fn().mockResolvedValue({
          successful: true,
          matchedContactInfo: matchedContact
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+4444444444',
        tracer: mockTracer
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(mockTracer.trace).toHaveBeenCalled();
    });
  });

  describe('createContact', () => {
    const mockUser = {
      id: 'test-user-id',
      platform: 'testCRM',
      accessToken: 'test-access-token',
      platformAdditionalInfo: {}
    };

    test('should return error when user not found', async () => {
      // Act
      const result = await contactHandler.createContact({
        platform: 'testCRM',
        userId: 'non-existent-user',
        phoneNumber: '+1234567890',
        newContactName: 'New Contact',
        newContactType: 'Contact'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.message).toBe('Contact not found');
    });

    test('should return error when user has no access token', async () => {
      // Arrange
      await UserModel.create({
        id: 'test-user-id',
        platform: 'testCRM',
        accessToken: null
      });

      // Act
      const result = await contactHandler.createContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890',
        newContactName: 'New Contact',
        newContactType: 'Contact'
      });

      // Assert
      expect(result.successful).toBe(false);
    });

    test('should successfully create contact with apiKey auth', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const createdContact = {
        id: 'new-contact-123',
        name: 'New Contact',
        type: 'Contact',
        phone: '+1234567890'
      };

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createContact: jest.fn().mockResolvedValue({
          contactInfo: createdContact,
          returnMessage: { message: 'Contact created', messageType: 'success', ttl: 2000 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.createContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890',
        newContactName: 'New Contact',
        newContactType: 'Contact',
        additionalSubmission: {}
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.contact).toEqual(createdContact);
      expect(mockConnector.createContact).toHaveBeenCalledWith({
        user: expect.any(Object),
        authHeader: 'Basic base64-encoded',
        phoneNumber: '+1234567890',
        newContactName: 'New Contact',
        newContactType: 'Contact',
        additionalSubmission: {},
        proxyConfig: null
      });
    });

    test('should successfully create contact with oauth auth', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const createdContact = {
        id: 'oauth-contact-123',
        name: 'OAuth Contact'
      };

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('oauth'),
        getOauthInfo: jest.fn().mockResolvedValue({
          clientId: 'client-id',
          clientSecret: 'client-secret',
          accessTokenUri: 'https://token.url',
          authorizationUri: 'https://auth.url'
        }),
        createContact: jest.fn().mockResolvedValue({
          contactInfo: createdContact,
          returnMessage: { message: 'Created', messageType: 'success' }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      oauth.getOAuthApp.mockReturnValue({});
      oauth.checkAndRefreshAccessToken.mockResolvedValue({
        ...mockUser,
        accessToken: 'refreshed-token'
      });

      // Act
      const result = await contactHandler.createContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890',
        newContactName: 'OAuth Contact',
        newContactType: 'Lead'
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.contact).toEqual(createdContact);
      expect(oauth.checkAndRefreshAccessToken).toHaveBeenCalled();
    });

    test('should return unsuccessful when platform returns null contactInfo', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createContact: jest.fn().mockResolvedValue({
          contactInfo: null,
          returnMessage: { message: 'Failed to create', messageType: 'error' }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.createContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890',
        newContactName: 'Failed Contact',
        newContactType: 'Contact'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('Failed to create');
    });

    test('should handle 429 rate limit error', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createContact: jest.fn().mockRejectedValue({
          response: { status: 429 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.createContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890',
        newContactName: 'Rate Limited',
        newContactType: 'Contact'
      });

      // Assert
      expect(result.successful).toBe(false);
    });

    test('should handle 401 authorization error', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createContact: jest.fn().mockRejectedValue({
          response: { status: 401 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.createContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890',
        newContactName: 'Unauthorized',
        newContactType: 'Contact'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.extraDataTracking.statusCode).toBe(401);
    });

    test('should handle generic errors', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        createContact: jest.fn().mockRejectedValue(new Error('Unknown error'))
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.createContact({
        platform: 'testCRM',
        userId: 'test-user-id',
        phoneNumber: '+1234567890',
        newContactName: 'Error Contact',
        newContactType: 'Contact'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toBe('Error creating contact');
    });
  });

  describe('findContactWithName', () => {
    const mockUser = {
      id: 'test-user-id',
      platform: 'testCRM',
      accessToken: 'test-access-token',
      platformAdditionalInfo: {}
    };

    test('should return warning when user not found', async () => {
      // Act
      const result = await contactHandler.findContactWithName({
        platform: 'testCRM',
        userId: 'non-existent-user',
        name: 'John Doe'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toContain('No contact found with name');
    });

    test('should find contact by name with apiKey auth', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const matchedContacts = [
        { id: 'contact-1', name: 'John Doe', type: 'Contact' }
      ];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContactWithName: jest.fn().mockResolvedValue({
          successful: true,
          matchedContactInfo: matchedContacts
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContactWithName({
        platform: 'testCRM',
        userId: 'test-user-id',
        name: 'John Doe'
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(result.contact).toEqual(matchedContacts);
    });

    test('should return warning when no contacts found by name', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContactWithName: jest.fn().mockResolvedValue({
          successful: false,
          matchedContactInfo: null
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContactWithName({
        platform: 'testCRM',
        userId: 'test-user-id',
        name: 'Unknown Person'
      });

      // Assert
      expect(result.successful).toBe(false);
      expect(result.returnMessage.message).toContain('No contact found with name');
    });

    test('should handle 429 rate limit error', async () => {
      // Arrange
      await UserModel.create(mockUser);

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContactWithName: jest.fn().mockRejectedValue({
          response: { status: 429 }
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContactWithName({
        platform: 'testCRM',
        userId: 'test-user-id',
        name: 'Rate Limited'
      });

      // Assert
      expect(result.successful).toBe(false);
    });

    test('should use proxy config when proxyId is present', async () => {
      // Arrange
      const userWithProxy = {
        ...mockUser,
        platformAdditionalInfo: { proxyId: 'proxy-123' }
      };
      await UserModel.create(userWithProxy);

      const proxyConfig = { baseUrl: 'https://proxy.example.com' };
      Connector.getProxyConfig.mockResolvedValue(proxyConfig);

      const matchedContacts = [{ id: 'proxy-contact', name: 'Proxy Contact' }];

      const mockConnector = {
        getAuthType: jest.fn().mockResolvedValue('apiKey'),
        getBasicAuth: jest.fn().mockReturnValue('base64-encoded'),
        findContactWithName: jest.fn().mockResolvedValue({
          successful: true,
          matchedContactInfo: matchedContacts
        })
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await contactHandler.findContactWithName({
        platform: 'testCRM',
        userId: 'test-user-id',
        name: 'Proxy Contact'
      });

      // Assert
      expect(result.successful).toBe(true);
      expect(Connector.getProxyConfig).toHaveBeenCalledWith('proxy-123');
    });
  });
});

