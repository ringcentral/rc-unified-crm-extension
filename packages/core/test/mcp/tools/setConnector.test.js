const setConnector = require('../../../mcp/tools/setConnector');
const developerPortal = require('../../../connector/developerPortal');

// Mock the developerPortal module
jest.mock('../../../connector/developerPortal');

describe('MCP Tool: setConnector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    test('should have correct tool definition', () => {
      expect(setConnector.definition).toBeDefined();
      expect(setConnector.definition.name).toBe('setConnector');
      expect(setConnector.definition.description).toContain('Auth flow step.2');
      expect(setConnector.definition.inputSchema).toBeDefined();
    });

    test('should require connectorDisplayName parameter', () => {
      expect(setConnector.definition.inputSchema.required).toContain('connectorDisplayName');
    });
  });

  describe('execute', () => {
    test('should set connector successfully', async () => {
      // Arrange
      const mockPublicConnectors = [
        { id: '1', name: 'salesforce', displayName: 'Salesforce', status: 'public' }
      ];
      const mockPrivateConnectors = [];
      const mockManifest = {
        platforms: {
          salesforce: {
            name: 'salesforce',
            auth: { type: 'oauth' },
            environment: { type: 'fixed' }
          }
        }
      };

      developerPortal.getPublicConnectorList.mockResolvedValue({
        connectors: mockPublicConnectors
      });
      developerPortal.getPrivateConnectorList.mockResolvedValue({
        privateConnectors: mockPrivateConnectors
      });
      developerPortal.getConnectorManifest.mockResolvedValue(mockManifest);

      // Act
      const result = await setConnector.execute({ 
        connectorDisplayName: 'Salesforce' 
      });

      // Assert
      expect(result).toEqual({
        success: true,
        data: {
          connectorManifest: mockManifest,
          connectorDisplayName: 'Salesforce',
          connectorName: 'salesforce',
          message: expect.stringContaining('IMPORTANT')
        }
      });
      expect(developerPortal.getConnectorManifest).toHaveBeenCalledWith({
        connectorId: '1',
        isPrivate: false
      });
    });

    test('should handle private connector', async () => {
      // Arrange
      const mockPublicConnectors = [];
      const mockPrivateConnectors = [
        { id: '2', name: 'custom-crm', displayName: 'Custom CRM', status: 'private' }
      ];
      const mockManifest = {
        platforms: {
          'custom-crm': {
            name: 'custom-crm',
            auth: { type: 'apiKey' }
          }
        }
      };

      developerPortal.getPublicConnectorList.mockResolvedValue({
        connectors: mockPublicConnectors
      });
      developerPortal.getPrivateConnectorList.mockResolvedValue({
        privateConnectors: mockPrivateConnectors
      });
      developerPortal.getConnectorManifest.mockResolvedValue(mockManifest);

      // Act
      const result = await setConnector.execute({ 
        connectorDisplayName: 'Custom CRM' 
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.connectorName).toBe('custom-crm');
      expect(developerPortal.getConnectorManifest).toHaveBeenCalledWith({
        connectorId: '2',
        isPrivate: true
      });
    });

    test('should return error when connector manifest not found', async () => {
      // Arrange
      const mockPublicConnectors = [
        { id: '1', name: 'salesforce', displayName: 'Salesforce', status: 'public' }
      ];
      const mockPrivateConnectors = [];

      developerPortal.getPublicConnectorList.mockResolvedValue({
        connectors: mockPublicConnectors
      });
      developerPortal.getPrivateConnectorList.mockResolvedValue({
        privateConnectors: mockPrivateConnectors
      });
      developerPortal.getConnectorManifest.mockResolvedValue(null);

      // Act
      const result = await setConnector.execute({ 
        connectorDisplayName: 'Salesforce' 
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('Connector manifest not found');
    });

    test('should return error when connector not found in list', async () => {
      // Arrange
      const mockPublicConnectors = [
        { id: '1', name: 'salesforce', displayName: 'Salesforce', status: 'public' }
      ];
      const mockPrivateConnectors = [];

      developerPortal.getPublicConnectorList.mockResolvedValue({
        connectors: mockPublicConnectors
      });
      developerPortal.getPrivateConnectorList.mockResolvedValue({
        privateConnectors: mockPrivateConnectors
      });

      // Act
      const result = await setConnector.execute({ 
        connectorDisplayName: 'NonExistentCRM' 
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.errorDetails).toBeDefined();
    });

    test('should handle API errors gracefully', async () => {
      // Arrange
      const errorMessage = 'API connection failed';
      developerPortal.getPublicConnectorList.mockRejectedValue(
        new Error(errorMessage)
      );

      // Act
      const result = await setConnector.execute({ 
        connectorDisplayName: 'Salesforce' 
      });

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(result.errorDetails).toBeDefined();
    });
  });
});

