const connectorRegistry = require('../../connector/registry');

describe('ConnectorRegistry Interface Registration with Composition', () => {
  beforeEach(() => {
    // Clear the registry before each test
    connectorRegistry.connectors.clear();
    connectorRegistry.manifests.clear();
    connectorRegistry.platformInterfaces.clear();
  });

  test('should register interface functions for a platform', () => {
    const mockFunction = jest.fn();
    
    connectorRegistry.registerConnectorInterface('testPlatform', 'testInterface', mockFunction);
    
    expect(connectorRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(true);
    expect(connectorRegistry.getPlatformInterfaces('testPlatform').get('testInterface')).toBe(mockFunction);
  });

  test('should throw error when registering non-function as interface', () => {
    expect(() => {
      connectorRegistry.registerConnectorInterface('testPlatform', 'testInterface', 'not a function');
    }).toThrow('Interface function must be a function, got: string');
  });

  test('should return original connector when no interfaces are registered', () => {
    const mockConnector = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    connectorRegistry.registerConnector('testPlatform', mockConnector);
    
    const retrievedConnector = connectorRegistry.getConnector('testPlatform');
    expect(retrievedConnector).toBe(mockConnector);
  });

  test('should return composed connector with interface functions when interfaces are registered', () => {
    const mockInterface = jest.fn();
    const mockConnector = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    // Register interface function first
    connectorRegistry.registerConnectorInterface('testPlatform', 'customMethod', mockInterface);
    
    // Register connector
    connectorRegistry.registerConnector('testPlatform', mockConnector);
    
    // Get composed connector
    const composedConnector = connectorRegistry.getConnector('testPlatform');
    
    // Should be a different object (composed)
    expect(composedConnector).not.toBe(mockConnector);
    
    // Should have the interface function
    expect(composedConnector.customMethod).toBe(mockInterface);
    
    // Should still have original methods
    expect(composedConnector.getAuthType).toBe(mockConnector.getAuthType);
    expect(composedConnector.createCallLog).toBe(mockConnector.createCallLog);
  });

  test('should not override existing connector methods when composing interfaces', () => {
    const existingMethod = jest.fn();
    const mockConnector = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn(),
      existingMethod: existingMethod
    };

    // Register connector first
    connectorRegistry.registerConnector('testPlatform', mockConnector);
    
    // Try to register interface with same name as existing method
    const newMethod = jest.fn();
    connectorRegistry.registerConnectorInterface('testPlatform', 'existingMethod', newMethod);
    
    // Get composed connector
    const composedConnector = connectorRegistry.getConnector('testPlatform');
    
    // Should not override the existing method
    expect(composedConnector.existingMethod).toBe(existingMethod);
    expect(composedConnector.existingMethod).not.toBe(newMethod);
  });

  test('should preserve original connector when composing interfaces', () => {
    const mockInterface = jest.fn();
    const mockConnector = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    connectorRegistry.registerConnectorInterface('testPlatform', 'customMethod', mockInterface);
    connectorRegistry.registerConnector('testPlatform', mockConnector);
    
    // Get original connector
    const originalConnector = connectorRegistry.getOriginalConnector('testPlatform');
    
    // Original connector should be unchanged
    expect(originalConnector).toBe(mockConnector);
    expect(originalConnector.customMethod).toBeUndefined();
    
    // Composed connector should have the interface
    const composedConnector = connectorRegistry.getConnector('testPlatform');
    expect(composedConnector.customMethod).toBe(mockInterface);
  });

  test('should unregister interface functions', () => {
    const mockFunction = jest.fn();
    
    connectorRegistry.registerConnectorInterface('testPlatform', 'testInterface', mockFunction);
    expect(connectorRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(true);
    
    connectorRegistry.unregisterConnectorInterface('testPlatform', 'testInterface');
    expect(connectorRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(false);
  });

  test('should return empty map for non-existent platform interfaces', () => {
    const interfaces = connectorRegistry.getPlatformInterfaces('nonExistentPlatform');
    expect(interfaces).toBeInstanceOf(Map);
    expect(interfaces.size).toBe(0);
  });

  test('should return false for non-existent platform interface', () => {
    expect(connectorRegistry.hasPlatformInterface('nonExistentPlatform', 'anyInterface')).toBe(false);
  });

  test('should handle multiple interface functions for same platform', () => {
    const mockFunction1 = jest.fn();
    const mockFunction2 = jest.fn();
    const mockConnector = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };
    
    connectorRegistry.registerConnectorInterface('testPlatform', 'interface1', mockFunction1);
    connectorRegistry.registerConnectorInterface('testPlatform', 'interface2', mockFunction2);
    connectorRegistry.registerConnector('testPlatform', mockConnector);
    
    const platformInterfaces = connectorRegistry.getPlatformInterfaces('testPlatform');
    expect(platformInterfaces.size).toBe(2);
    expect(platformInterfaces.get('interface1')).toBe(mockFunction1);
    expect(platformInterfaces.get('interface2')).toBe(mockFunction2);
    
    // Check composed connector has both interfaces
    const composedConnector = connectorRegistry.getConnector('testPlatform');
    expect(composedConnector.interface1).toBe(mockFunction1);
    expect(composedConnector.interface2).toBe(mockFunction2);
  });

  test('should clean up platform interfaces when unregistering connector', () => {
    const mockFunction = jest.fn();
    const mockConnector = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    connectorRegistry.registerConnectorInterface('testPlatform', 'testInterface', mockFunction);
    connectorRegistry.registerConnector('testPlatform', mockConnector);
    
    expect(connectorRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(true);
    
    connectorRegistry.unregisterConnector('testPlatform');
    
    expect(connectorRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(false);
  });

  test('should get connector capabilities correctly', async () => {
    const mockInterface = jest.fn();
    const mockConnector = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    connectorRegistry.registerConnectorInterface('testPlatform', 'customMethod', mockInterface);
    connectorRegistry.registerConnector('testPlatform', mockConnector);
    
    const capabilities = await connectorRegistry.getConnectorCapabilities('testPlatform');
    
    expect(capabilities.platform).toBe('testPlatform');
    expect(capabilities.originalMethods).toContain('getAuthType');
    expect(capabilities.originalMethods).toContain('createCallLog');
    expect(capabilities.originalMethods).toContain('updateCallLog');
    expect(capabilities.composedMethods).toContain('customMethod');
    expect(capabilities.registeredInterfaces).toContain('customMethod');
    expect(capabilities.authType).toBe('apiKey');
  });

  test('should handle interface registration after connector registration', () => {
    const mockConnector = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    // Register connector first
    connectorRegistry.registerConnector('testPlatform', mockConnector);
    
    // Register interface function after
    const mockInterface = jest.fn();
    connectorRegistry.registerConnectorInterface('testPlatform', 'customMethod', mockInterface);
    
    // Get composed connector
    const composedConnector = connectorRegistry.getConnector('testPlatform');
    
    // Should have the interface function
    expect(composedConnector.customMethod).toBe(mockInterface);
    
    // Original connector should be unchanged
    const originalConnector = connectorRegistry.getOriginalConnector('testPlatform');
    expect(originalConnector.customMethod).toBeUndefined();
  });

  test('should return interface-only connector when no base connector is registered', () => {
    const mockInterface1 = jest.fn();
    const mockInterface2 = jest.fn();
    
    // Register only interface functions, no base connector
    connectorRegistry.registerConnectorInterface('interfaceOnlyPlatform', 'method1', mockInterface1);
    connectorRegistry.registerConnectorInterface('interfaceOnlyPlatform', 'method2', mockInterface2);
    
    // Get connector - should return interface-only object
    const interfaceOnlyConnector = connectorRegistry.getConnector('interfaceOnlyPlatform');
    
    // Should have interface functions
    expect(interfaceOnlyConnector.method1).toBe(mockInterface1);
    expect(interfaceOnlyConnector.method2).toBe(mockInterface2);
    
    // Should not have base connector methods
    expect(interfaceOnlyConnector.getAuthType).toBeUndefined();
    
    // Should be a plain object, not inherited from any connector
    expect(Object.getPrototypeOf(interfaceOnlyConnector)).toBe(Object.prototype);
  });

  test('should throw error when no connector and no interfaces are registered', () => {
    expect(() => {
      connectorRegistry.getConnector('nonExistentPlatform');
    }).toThrow('Connector not found for platform: nonExistentPlatform');
  });

  test('should handle mixed scenarios correctly', async () => {
    // Scenario 1: Only interfaces, no connector
    connectorRegistry.registerConnectorInterface('mixedPlatform', 'interfaceMethod', jest.fn());
    const interfaceOnly = connectorRegistry.getConnector('mixedPlatform');
    expect(interfaceOnly.interfaceMethod).toBeDefined();
    expect(interfaceOnly.getAuthType).toBeUndefined();
    
    // Scenario 2: Add connector later
    const mockConnector = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };
    connectorRegistry.registerConnector('mixedPlatform', mockConnector);
    
    const composedConnector = connectorRegistry.getConnector('mixedPlatform');
    expect(composedConnector.interfaceMethod).toBeDefined();
    expect(composedConnector.getAuthType).toBeDefined();
    expect(await composedConnector.getAuthType()).toBe('apiKey');
  });
}); 