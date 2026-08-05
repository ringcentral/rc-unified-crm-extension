const findContactByName = require('../../../mcp/tools/findContactByName');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const contactCore = require('../../../handlers/contact');
const {
  invalidContactAuthTokenCases,
  invalidContactDecodedJwtCases,
  normalizedAdapterRejectionCases,
  invalidAdapterResponseCases,
  successfulContactPayloadCases,
  contactSearchFailureCases,
} = require('../data/contactToolCases');
const {
  contactNameForwardingCases,
  invalidContactNameCases,
  invalidFindByNameCapabilityCases,
} = require('../data/findContactByNameCases');

// Mock dependencies
jest.mock('../../../lib/jwt');
jest.mock('../../../connector/registry');
jest.mock('../../../handlers/contact');

describe('MCP Tool: findContactByName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(findContactByName.definition).toBeDefined();
      expect(findContactByName.definition.name).toBe('findContactByName');
      expect(findContactByName.definition.description).toContain('REQUIRES CRM CONNECTION');
      expect(findContactByName.definition.inputSchema).toBeDefined();
    });

    test('should require name parameter (jwtToken is server-injected)', () => {
      expect(findContactByName.definition.inputSchema.required).not.toContain('jwtToken');
      expect(findContactByName.definition.inputSchema.required).toContain('name');
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
        findContactWithName: jest.fn(),
      });
      contactCore.findContactWithName.mockResolvedValue(searchResult);
    };

    test('should find contact by name successfully', async () => {
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
        findContactWithName: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      contactCore.findContactWithName.mockResolvedValue({
        successful: true,
        contact: mockContact,
        returnMessage: { message: 'Contact found' }
      });

      // Act
      const result = await findContactByName.execute({
        jwtToken: 'mock-jwt-token',
        name: 'John Doe'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: mockContact
      });
      expect(jwt.decodeJwt).toHaveBeenCalledWith('mock-jwt-token');
      expect(connectorRegistry.getConnector).toHaveBeenCalledWith('testCRM');
      expect(contactCore.findContactWithName).toHaveBeenCalledWith({
        platform: 'testCRM',
        userId: 'user-123',
        name: 'John Doe'
      });
    });

    test('should find contact with partial name', async () => {
      // Arrange
      const mockContact = {
        id: 'contact-456',
        name: 'Jane Smith',
        phone: '+9876543210',
        type: 'Contact'
      };

      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        findContactWithName: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      contactCore.findContactWithName.mockResolvedValue({
        successful: true,
        contact: mockContact
      });

      // Act
      const result = await findContactByName.execute({
        jwtToken: 'mock-jwt-token',
        name: 'Jane'
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockContact);
      expect(contactCore.findContactWithName).toHaveBeenCalledWith({
        platform: 'testCRM',
        userId: 'user-123',
        name: 'Jane'
      });
    });

    test('should return error when contact not found', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {
        findContactWithName: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      contactCore.findContactWithName.mockResolvedValue({
        successful: false,
        contact: null,
        returnMessage: { message: 'Contact not found' }
      });

      // Act
      const result = await findContactByName.execute({
        jwtToken: 'mock-jwt-token',
        name: 'NonExistent Person'
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
      const result = await findContactByName.execute({
        jwtToken: 'invalid-token',
        name: 'John Doe'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JWT token');
    });

    test('should return error when decodeJwt returns null', async () => {
      jwt.decodeJwt.mockReturnValue(null);

      const result = await findContactByName.execute({
        jwtToken: 'invalid-token',
        name: 'John Doe'
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
      const result = await findContactByName.execute({
        jwtToken: 'mock-jwt-token',
        name: 'John Doe'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Platform connector not found');
    });

    test('should return error when findContactWithName is not implemented', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123',
        platform: 'testCRM'
      });

      const mockConnector = {}; // No findContactWithName method
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      // Act
      const result = await findContactByName.execute({
        jwtToken: 'mock-jwt-token',
        name: 'John Doe'
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
        findContactWithName: jest.fn()
      };
      connectorRegistry.getConnector.mockReturnValue(mockConnector);

      contactCore.findContactWithName.mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      // Act
      const result = await findContactByName.execute({
        jwtToken: 'mock-jwt-token',
        name: 'John Doe'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('API rate limit exceeded');
      expect(result.errorDetails).toBeDefined();
    });

    test('should handle empty name parameter', async () => {
      const result = await findContactByName.execute({
        jwtToken: 'mock-jwt-token',
        name: ''
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Name is required');
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
    });

    test.each<[any]>(contactNameForwardingCases as [any][])('forwards the exact $label without normalization', async ({ name }) => {
      arrangeAuthorizedSearch();

      const result = await findContactByName.execute({
        jwtToken: 'jwt-会话-🚀',
        name,
      });

      expect(result).toEqual({
        success: true,
        data: { id: 'contact-variation' },
      });
      expect(contactCore.findContactWithName).toHaveBeenCalledWith({
        platform: 'crm-東京',
        userId: 'user-客户-42',
        name,
      });
    });

    test.each<[any]>(successfulContactPayloadCases as [any][])('preserves a successful $label payload', async ({ contact }) => {
      arrangeAuthorizedSearch({ successful: true, contact });

      await expect(findContactByName.execute({
        jwtToken: 'jwt-token',
        name: 'Customer',
      })).resolves.toEqual({ success: true, data: contact });
    });

    test.each<[any]>(contactSearchFailureCases as [any][])('returns a stable failure for $label', async ({ searchResult, expected }) => {
      arrangeAuthorizedSearch(searchResult);

      await expect(findContactByName.execute({
        jwtToken: 'jwt-token',
        name: 'Customer',
      })).resolves.toEqual({ success: false, error: expected });
    });

    test.each<[any]>(invalidAdapterResponseCases as [any][])('handles an invalid $label handler response without throwing', async ({ result }) => {
      arrangeAuthorizedSearch(result);

      await expect(findContactByName.execute({
        jwtToken: 'jwt-token',
        name: 'Customer',
      })).resolves.toMatchObject({
        success: false,
        error: 'Contact search returned an invalid response',
      });
    });

    test.each<[any]>(normalizedAdapterRejectionCases as [any][])('normalizes a $label into a stable error result', async ({ rejection, expected }) => {
      arrangeAuthorizedSearch();
      contactCore.findContactWithName.mockRejectedValueOnce(rejection);

      await expect(findContactByName.execute({
        jwtToken: 'jwt-token',
        name: 'Customer',
      })).resolves.toMatchObject({ success: false, error: expected });
    });

    test.each<[any]>(invalidContactAuthTokenCases as [any][])('rejects $label before decoding authentication', async ({ jwtToken }) => {
      await expect(findContactByName.execute({
        jwtToken,
        name: 'Customer',
      })).resolves.toMatchObject({
        success: false,
        error: 'Not authenticated. Please connect to your CRM first.',
      });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidContactNameCases as [any][])('rejects $label before decoding authentication', async ({ name, expected }) => {
      await expect(findContactByName.execute({
        jwtToken: 'jwt-token',
        name,
      })).resolves.toMatchObject({ success: false, error: expected });
      expect(jwt.decodeJwt).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidContactDecodedJwtCases as [any][])('rejects decoded JWT with $label', async ({ decoded, expected }) => {
      jwt.decodeJwt.mockReturnValue(decoded);

      await expect(findContactByName.execute({
        jwtToken: 'jwt-token',
        name: 'Customer',
      })).resolves.toMatchObject({ success: false, error: expected });
      expect(contactCore.findContactWithName).not.toHaveBeenCalled();
    });

    test.each<[any]>(invalidFindByNameCapabilityCases as [any][])('rejects connector with $label', async ({ connector }) => {
      jwt.decodeJwt.mockReturnValue({ id: 'user-1', platform: 'testCRM' });
      connectorRegistry.getConnector.mockReturnValue(connector);

      await expect(findContactByName.execute({
        jwtToken: 'jwt-token',
        name: 'Customer',
      })).resolves.toMatchObject({
        success: false,
        error: 'findContactByName is not implemented for platform: testCRM',
      });
      expect(contactCore.findContactWithName).not.toHaveBeenCalled();
    });
  });
});


export {};
