const getPublicConnectors = require('../../../mcp/tools/getPublicConnectors');
const developerPortal = require('../../../connector/developerPortal');

// Mock the developerPortal module
jest.mock('../../../connector/developerPortal');

describe('MCP Tool: getPublicConnectors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.RC_ACCOUNT_ID;
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(getPublicConnectors.definition).toBeDefined();
      expect(getPublicConnectors.definition.name).toBe('getPublicConnectors');
      expect(getPublicConnectors.definition.description).toContain('Auth flow step.1');
      expect(getPublicConnectors.definition.inputSchema).toBeDefined();
      expect(getPublicConnectors.definition.inputSchema.type).toBe('object');
    });

    test('should have no required parameters', () => {
      expect(getPublicConnectors.definition.inputSchema.required).toEqual([]);
    });
  });

  describe('execute', () => {
    test('should return public connectors successfully', async () => {
      // Arrange - use supported platform names: 'googleSheets' and 'clio'
      const mockConnectors = [
        { id: '1', name: 'googleSheets', displayName: 'Google Sheets' },
        { id: '2', name: 'clio', displayName: 'Clio' }
      ];

      developerPortal.getPublicConnectorList.mockResolvedValue({
        connectors: mockConnectors
      });

      // Act
      const result = await getPublicConnectors.execute();

      // Assert
      expect(result).toEqual({
        success: true,
        data: ['Google Sheets', 'Clio']
      });
      expect(developerPortal.getPublicConnectorList).toHaveBeenCalledTimes(1);
    });

    test('should include private connectors when RC_ACCOUNT_ID is set', async () => {
      // Arrange - use supported platform names
      process.env.RC_ACCOUNT_ID = 'test-account-id';
      
      const mockPublicConnectors = [
        { id: '1', name: 'googleSheets', displayName: 'Google Sheets' }
      ];
      const mockPrivateConnectors = [
        { id: '3', name: 'clio', displayName: 'Clio' }
      ];

      developerPortal.getPublicConnectorList.mockResolvedValue({
        connectors: mockPublicConnectors
      });
      developerPortal.getPrivateConnectorList.mockResolvedValue({
        privateConnectors: mockPrivateConnectors
      });

      // Act
      const result = await getPublicConnectors.execute();

      // Assert
      expect(result).toEqual({
        success: true,
        data: ['Google Sheets', 'Clio']
      });
      expect(developerPortal.getPublicConnectorList).toHaveBeenCalledTimes(1);
      expect(developerPortal.getPrivateConnectorList).toHaveBeenCalledTimes(1);
    });

    test('should return empty array when no connectors available', async () => {
      // Arrange
      developerPortal.getPublicConnectorList.mockResolvedValue({
        connectors: []
      });

      // Act
      const result = await getPublicConnectors.execute();

      // Assert
      expect(result).toEqual({
        success: true,
        data: []
      });
    });

    test('should handle errors gracefully', async () => {
      // Arrange
      const errorMessage = 'Failed to fetch connectors';
      developerPortal.getPublicConnectorList.mockRejectedValue(
        new Error(errorMessage)
      );

      // Act
      const result = await getPublicConnectors.execute();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(result.errorDetails).toBeDefined();
    });

    test('should handle network errors', async () => {
      // Arrange
      const networkError = new Error('Network request failed');
      networkError.code = 'ECONNREFUSED';
      developerPortal.getPublicConnectorList.mockRejectedValue(networkError);

      // Act
      const result = await getPublicConnectors.execute();

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network request failed');
      expect(result.errorDetails).toBeDefined();
    });
  });
});

