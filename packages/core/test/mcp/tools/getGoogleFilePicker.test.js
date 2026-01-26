const getGoogleFilePicker = require('../../../mcp/tools/getGoogleFilePicker');
const jwt = require('../../../lib/jwt');
const { UserModel } = require('../../../models/userModel');
const axios = require('axios');

// Mock dependencies
jest.mock('../../../lib/jwt');
jest.mock('../../../models/userModel');
jest.mock('axios');

describe('MCP Tool: getGoogleFilePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_SERVER = 'https://test-app-server.com';
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(getGoogleFilePicker.definition).toBeDefined();
      expect(getGoogleFilePicker.definition.name).toBe('getGoogleFilePicker');
      expect(getGoogleFilePicker.definition.description).toContain('REQUIRES AUTHENTICATION');
      expect(getGoogleFilePicker.definition.description).toContain('Google Sheets file picker');
      expect(getGoogleFilePicker.definition.inputSchema).toBeDefined();
    });

    test('should require jwtToken parameter', () => {
      expect(getGoogleFilePicker.definition.inputSchema.required).toContain('jwtToken');
    });

    test('should have optional sheetName parameter', () => {
      expect(getGoogleFilePicker.definition.inputSchema.properties).toHaveProperty('sheetName');
      expect(getGoogleFilePicker.definition.inputSchema.required).not.toContain('sheetName');
    });

    test('should have correct annotations', () => {
      expect(getGoogleFilePicker.definition.annotations).toEqual({
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: false
      });
    });
  });

  describe('execute - file picker URL', () => {
    test('should return file picker URL successfully', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123'
      });

      UserModel.findByPk.mockResolvedValue({
        id: 'user-123',
        name: 'Test User'
      });

      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          filePickerUrl: 'https://test-app-server.com/googleSheets/filePicker?token=mock-jwt-token}',
          message: expect.stringContaining('Please open this URL')
        }
      });
      expect(jwt.decodeJwt).toHaveBeenCalledWith('mock-jwt-token');
      expect(UserModel.findByPk).toHaveBeenCalledWith('user-123');
    });
  });

  describe('execute - create new sheet', () => {
    test('should create new sheet when sheetName is provided', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123'
      });

      UserModel.findByPk.mockResolvedValue({
        id: 'user-123',
        name: 'Test User'
      });

      const mockSheetResponse = {
        data: {
          success: true,
          data: {
            sheetId: 'sheet-123',
            sheetName: 'My Call Logs'
          }
        }
      };

      axios.post.mockResolvedValue(mockSheetResponse);

      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: 'mock-jwt-token',
        sheetName: 'My Call Logs'
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          sheetId: 'sheet-123',
          sheetName: 'My Call Logs'
        }
      });
      expect(axios.post).toHaveBeenCalledWith(
        'https://test-app-server.com/googleSheets/sheet?jwtToken=mock-jwt-token',
        { name: 'My Call Logs' }
      );
    });

    test('should return error when sheet creation fails', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123'
      });

      UserModel.findByPk.mockResolvedValue({
        id: 'user-123',
        name: 'Test User'
      });

      axios.post.mockRejectedValue(new Error('Failed to create sheet'));

      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: 'mock-jwt-token',
        sheetName: 'My Call Logs'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create sheet');
      expect(result.errorDetails).toBeDefined();
    });
  });

  describe('execute - error handling', () => {
    test('should return error when jwtToken is missing', async () => {
      // Act
      const result = await getGoogleFilePicker.execute({});

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'JWT token is required. Please authenticate with googleSheets platform first using the doAuth tool.'
      });
    });

    test('should return error when jwtToken is null', async () => {
      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: null
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'JWT token is required. Please authenticate with googleSheets platform first using the doAuth tool.'
      });
    });

    test('should return error when JWT is invalid (no userId)', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        // id is missing
        platform: 'googleSheets'
      });

      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: 'invalid-jwt-token'
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Invalid JWT token: userId not found'
      });
    });

    test('should return error when JWT decode returns null', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue(null);

      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: 'malformed-jwt-token'
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'Invalid JWT token: userId not found'
      });
    });

    test('should return error when user not found', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'nonexistent-user'
      });

      UserModel.findByPk.mockResolvedValue(null);

      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert
      expect(result).toEqual({
        success: false,
        error: 'User not found. Please authenticate with googleSheets platform first.'
      });
      expect(UserModel.findByPk).toHaveBeenCalledWith('nonexistent-user');
    });

    test('should handle database errors gracefully', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123'
      });

      UserModel.findByPk.mockRejectedValue(new Error('Database connection failed'));

      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(result.errorDetails).toBeDefined();
    });

    test('should handle JWT decode errors gracefully', async () => {
      // Arrange
      jwt.decodeJwt.mockImplementation(() => {
        throw new Error('JWT decode error');
      });

      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: 'corrupted-jwt-token'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('JWT decode error');
      expect(result.errorDetails).toBeDefined();
    });

    test('should handle errors without message property', async () => {
      // Arrange
      jwt.decodeJwt.mockReturnValue({
        id: 'user-123'
      });

      const errorWithoutMessage = { code: 'UNKNOWN_ERROR' };
      UserModel.findByPk.mockRejectedValue(errorWithoutMessage);

      // Act
      const result = await getGoogleFilePicker.execute({
        jwtToken: 'mock-jwt-token'
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error occurred');
    });
  });
});

