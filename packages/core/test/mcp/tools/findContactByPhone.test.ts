const findContactByPhone = require('../../../mcp/tools/findContactByPhone');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const contactCore = require('../../../handlers/contact');
const {
  invalidContactAuthTokenCases,
  invalidContactDecodedJwtCases,
  invalidContactPhoneNumberCases,
  normalizedAdapterRejectionCases,
  invalidAdapterResponseCases,
  successfulContactPayloadCases,
  contactSearchFailureCases,
} = require('../data/contactToolCases');
const {
  phoneSearchForwardingCases,
  invalidPhoneSearchOptionCases,
  invalidFindByPhoneCapabilityCases,
} = require('../data/findContactByPhoneCases');

// Mock dependencies
jest.mock('../../../lib/jwt');
jest.mock('../../../connector/registry');
jest.mock('../../../handlers/contact');

describe('MCP Tool: findContactByPhone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(findContactByPhone.definition).toBeDefined();
      expect(findContactByPhone.definition.name).toBe('findContactByPhone');
      expect(findContactByPhone.definition.description).toContain('REQUIRES CRM CONNECTION');
      expect(findContactByPhone.definition.inputSchema).toBeDefined();
    });

    test('should require phoneNumber parameter (jwtToken is server-injected)', () => {
      expect(findContactByPhone.definition.inputSchema.required).not.toContain('jwtToken');
      expect(findContactByPhone.definition.inputSchema.required).toContain('phoneNumber');
    });

    test('should have optional parameters', () => {
      expect(findContactByPhone.definition.inputSchema.properties).toHaveProperty('overridingFormat');
      expect(findContactByPhone.definition.inputSchema.properties).toHaveProperty('isExtension');
    });
  });

  describe('execute', () => {
    const arrangeAuthorizedSearch = (...resultArgs) => {
      const searchResult = resultArgs.length === 0
        ? { successful: true, contact: { id: 'contact-variation' } }
        : resultArgs[0];
      jwt.decodeJwt.mockReturnValue({
        id: 'user-客户-42',
        platform: 'crm-東京',
      });
      connectorRegistry.getConnector.mockReturnValue({
        findContact: jest.fn(),
      });
      contactCore.findContact.mockResolvedValue(searchResult);
    };

    test('should find contact by phone successfully', async () => {
      // Arrange
      const mockContact = {
        id: 'contact-123',
        name: 'John Doe',
        phone: '+1234567890',
        type: 'Contact'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        findContact: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      contactCore.findContact.mockResolvedValue({
        successful: true,
        contact: mockContact,
        returnMessage: { message: 'Contact found' }
      });

      // Act
      const result = await findContactByPhone.execute({
        jwtToken: 'mock-jwt-token',
        phoneNumber: '+1234567890'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: mockContact
      });
      expect(jwt.decodeJwt).toHaveBeenCalledWith('mock-jwt-token');
      expect(connectorRegistry.getConnector).toHaveBeenCalledWith('testCRM');
      expect(contactCore.findContact).toHaveBeenCalledWith({
        platform: 'testCRM',
        userId: 'user-123',
        phoneNumber: '+1234567890',
        overridingFormat: '',
        isExtension: false
      });
    });

    test('should handle overriding format parameter', async () => {
      // Arrange
      const mockContact = {
        id: 'contact-456',
        name: 'Jane Smith',
        phone: '1234567890'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        findContact: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      contactCore.findContact.mockResolvedValue({
        successful: true,
        contact: mockContact
      });

      // Act
      const result = await findContactByPhone.execute({
        jwtToken: 'mock-jwt-token',
        phoneNumber: '+1234567890',
        overridingFormat: '1234567890'
      });

      // Assert
      expect(result.success).toBe(true);
      expect(contactCore.findContact).toHaveBeenCalledWith({
        platform: 'testCRM',
        userId: 'user-123',
        phoneNumber: '+1234567890',
        overridingFormat: '1234567890',
        isExtension: false
      });
    });

    test('should handle isExtension parameter', async () => {
      // Arrange
      const mockContact = {
        id: 'contact-789',
        name: 'Bob Johnson',
        phone: '101'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        findContact: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      contactCore.findContact.mockResolvedValue({
        successful: true,
        contact: mockContact
      });

      // Act
      const result = await findContactByPhone.execute({
        jwtToken: 'mock-jwt-token',
        phoneNumber: '101',
        isExtension: true
      });

      // Assert
      expect(result.success).toBe(true);
      expect(contactCore.findContact).toHaveBeenCalledWith({
        platform: 'testCRM',
        userId: 'user-123',
        phoneNumber: '101',
        overridingFormat: '',
        isExtension: true
      });
    });

    test('should return error when contact not found', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        findContact: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      contactCore.findContact.mockResolvedValue({
        successful: false,
        contact: null,
        returnMessage: { message: 'Contact not found' }
      });

      // Act
      const result = await findContactByPhone.execute({
        jwtToken: 'mock-jwt-token',
        phoneNumber: '+9999999999'
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Contact not found'
      });
    });

    test('should return error when JWT is invalid', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        platform: 'testCRM'
        // id is missing
      });

      // Act
      const result = await findContactByPhone.execute({
        jwtToken: 'invalid-token',
        phoneNumber: '+1234567890'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JWT token');
    });

    test('should return error when decodeJwt returns null', async () => {
      jwt.decodeJwt.mockReturnValue(null);

      const result = await findContactByPhone.execute({
        jwtToken: 'invalid-token',
        phoneNumber: '+1234567890'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JWT token');
    });

    test('should return error when platform connector not found', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'unknownCRM'
      });

      connectorRegistry.getConnector.mockReturnValue(null);

      // Act
      const result = await findContactByPhone.execute({
        jwtToken: 'mock-jwt-token',
        phoneNumber: '+1234567890'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Platform connector not found');
    });

    test('should return error when findContact is not implemented', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {}; // No findContact method
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await findContactByPhone.execute({
        jwtToken: 'mock-jwt-token',
        phoneNumber: '+1234567890'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('not implemented');
    });

    test('should handle unexpected errors gracefully', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        findContact: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      contactCore.findContact.mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const result = await findContactByPhone.execute({
        jwtToken: 'mock-jwt-token',
        phoneNumber: '+1234567890'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(result.errorDetails).toBeDefined();
    });

    test.each<[any]>(phoneSearchForwardingCases as [any][])('forwards the exact $label and optional search controls', async ({
      phoneNumber,
      overridingFormat,
      isExtension,
      expectedFormat,
      expectedExtension,
    }) => {
      arrangeAuthorizedSearch();

      const result = await findContactByPhone.execute({
        jwtToken: 'jwt-会话-🚀',
        phoneNumber,
        overridingFormat,
        isExtension,
      });

      expect(result).toEqual({
        success: true,
        data: { id: 'contact-variation' },
      });
      expect(contactCore.findContact).toHaveBeenCalledWith({
        platform: 'crm-東京',
        userId: 'user-客户-42',
        phoneNumber,
        overridingFormat: expectedFormat,
        isExtension: expectedExtension,
      });
    });

    test.each<[any]>(successfulContactPayloadCases as [any][])('preserves a successful $label payload', async ({ contact }) => {
      arrangeAuthorizedSearch({ successful: true, contact });

      await expect(findContactByPhone.execute({
        jwtToken: 'jwt-token',
        phoneNumber: '+14155550100',
      })).resolves.toEqual({ success: true, data: contact });
    });

    test.each<[any]>(contactSearchFailureCases as [any][])('returns a stable failure for $label', async ({ searchResult, expected }) => {
      arrangeAuthorizedSearch(searchResult);

      await expect(findContactByPhone.execute({
        jwtToken: 'jwt-token',
        phoneNumber: '+14155550100',
      })).resolves.toEqual({ success: false, error: expected });
    });

    test.each<[any]>(invalidAdapterResponseCases as [any][])('handles an invalid $label handler response without throwing', async ({ result }) => {
      arrangeAuthorizedSearch(result);

      await expect(findContactByPhone.execute({
        jwtToken: 'jwt-token',
        phoneNumber: '+14155550100',
      })).resolves.toMatchObject({
        success: false,
        error: 'Contact search returned an invalid response',
      });
    });

    test.each<[any]>(normalizedAdapterRejectionCases as [any][])('normalizes a $label into a stable error result', async ({ rejection, expected }) => {
      arrangeAuthorizedSearch();
      contactCore.findContact.mockRejectedValueOnce(rejection);

      await expect(findContactByPhone.execute({
        jwtToken: 'jwt-token',
        phoneNumber: '+14155550100',
      })).resolves.toMatchObject({ success: false, error: expected });
    });

    test.each<[any]>(invalidContactAuthTokenCases as [any][])('rejects $label before decoding authentication', async ({ jwtToken }) => {
      await expect(findContactByPhone.execute({
        jwtToken,
        phoneNumber: '+14155550100',
      })).resolves.toMatchObject({
        success: false,
        error: 'Not authenticated. Please connect to your CRM first.',
      });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidContactPhoneNumberCases as [any][])('rejects $label before decoding authentication', async ({ phoneNumber, expected }) => {
      await expect(findContactByPhone.execute({
        jwtToken: 'jwt-token',
        phoneNumber,
      })).resolves.toMatchObject({ success: false, error: expected });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidPhoneSearchOptionCases as [any][])('rejects invalid optional $field value $value', async ({ field, value, expected }) => {
      await expect(findContactByPhone.execute({
        jwtToken: 'jwt-token',
        phoneNumber: '+14155550100',
        [field]: value,
      })).resolves.toMatchObject({ success: false, error: expected });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidContactDecodedJwtCases as [any][])('rejects decoded JWT with $label', async ({ decoded, expected }) => {
      jwt.decodeJwt.mockReturnValue(decoded);

      await expect(findContactByPhone.execute({
        jwtToken: 'jwt-token',
        phoneNumber: '+14155550100',
      })).resolves.toMatchObject({ success: false, error: expected });
      expect(contactCore.findContact).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidFindByPhoneCapabilityCases as [any][])('rejects connector with $label', async ({ connector }) => {
      jwt.decodeJwt.mockReturnValue({ id: 'user-1', platform: 'testCRM' });
      connectorRegistry.getConnector.mockReturnValue(connector);

      await expect(findContactByPhone.execute({
        jwtToken: 'jwt-token',
        phoneNumber: '+14155550100',
      })).resolves.toMatchObject({
        success: false,
        error: 'findContactByPhone is not implemented for platform: testCRM',
      });
      expect(contactCore.findContact).not.toHaveBeenCalled();
    });
  });
});


export {};
