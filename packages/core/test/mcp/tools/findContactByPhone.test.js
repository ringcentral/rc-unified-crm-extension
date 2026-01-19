const findContactByPhone = require('../../../mcp/tools/findContactByPhone');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const contactCore = require('../../../handlers/contact');

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
      expect(findContactByPhone.definition.description).toContain('REQUIRES AUTHENTICATION');
      expect(findContactByPhone.definition.inputSchema).toBeDefined();
    });

    test('should require jwtToken and phoneNumber parameters', () => {
      expect(findContactByPhone.definition.inputSchema.required).toContain('jwtToken');
      expect(findContactByPhone.definition.inputSchema.required).toContain('phoneNumber');
    });

    test('should have optional parameters', () => {
      expect(findContactByPhone.definition.inputSchema.properties).toHaveProperty('overridingFormat');
      expect(findContactByPhone.definition.inputSchema.properties).toHaveProperty('isExtension');
    });
  });

  describe('execute', () => {
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
  });
});

