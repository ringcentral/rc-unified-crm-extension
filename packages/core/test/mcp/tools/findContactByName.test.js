const findContactByName = require('../../../mcp/tools/findContactByName');
const jwt = require('../../../lib/jwt');
const connectorRegistry = require('../../../connector/registry');
const contactCore = require('../../../handlers/contact');

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
      expect(findContactByName.definition.description).toContain('REQUIRES AUTHENTICATION');
      expect(findContactByName.definition.inputSchema).toBeDefined();
    });

    test('should require jwtToken and name parameters', () => {
      expect(findContactByName.definition.inputSchema.required).toContain('jwtToken');
      expect(findContactByName.definition.inputSchema.required).toContain('name');
    });
  });

  describe('execute', () => {
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
        returnMessage: { message: 'Name parameter is required' }
      });

      // Act
      const result = await findContactByName.execute({
        jwtToken: 'mock-jwt-token',
        name: ''
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Name parameter is required');
    });
  });
});

