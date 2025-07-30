const adapterRegistry = require('../../adapter/registry');

describe('AdapterRegistry Interface Registration with Composition', () => {
  beforeEach(() => {
    // Clear the registry before each test
    adapterRegistry.adapters.clear();
    adapterRegistry.manifests.clear();
    adapterRegistry.platformInterfaces.clear();
  });

  test('should register interface functions for a platform', () => {
    const mockFunction = jest.fn();
    
    adapterRegistry.registerAdapterInterface('testPlatform', 'testInterface', mockFunction);
    
    expect(adapterRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(true);
    expect(adapterRegistry.getPlatformInterfaces('testPlatform').get('testInterface')).toBe(mockFunction);
  });

  test('should throw error when registering non-function as interface', () => {
    expect(() => {
      adapterRegistry.registerAdapterInterface('testPlatform', 'testInterface', 'not a function');
    }).toThrow('Interface function must be a function, got: string');
  });

  test('should return original adapter when no interfaces are registered', () => {
    const mockAdapter = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    adapterRegistry.registerAdapter('testPlatform', mockAdapter);
    
    const retrievedAdapter = adapterRegistry.getAdapter('testPlatform');
    expect(retrievedAdapter).toBe(mockAdapter);
  });

  test('should return composed adapter with interface functions when interfaces are registered', () => {
    const mockInterface = jest.fn();
    const mockAdapter = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    // Register interface function first
    adapterRegistry.registerAdapterInterface('testPlatform', 'customMethod', mockInterface);
    
    // Register adapter
    adapterRegistry.registerAdapter('testPlatform', mockAdapter);
    
    // Get composed adapter
    const composedAdapter = adapterRegistry.getAdapter('testPlatform');
    
    // Should be a different object (composed)
    expect(composedAdapter).not.toBe(mockAdapter);
    
    // Should have the interface function
    expect(composedAdapter.customMethod).toBe(mockInterface);
    
    // Should still have original methods
    expect(composedAdapter.getAuthType).toBe(mockAdapter.getAuthType);
    expect(composedAdapter.createCallLog).toBe(mockAdapter.createCallLog);
  });

  test('should not override existing adapter methods when composing interfaces', () => {
    const existingMethod = jest.fn();
    const mockAdapter = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn(),
      existingMethod: existingMethod
    };

    // Register adapter first
    adapterRegistry.registerAdapter('testPlatform', mockAdapter);
    
    // Try to register interface with same name as existing method
    const newMethod = jest.fn();
    adapterRegistry.registerAdapterInterface('testPlatform', 'existingMethod', newMethod);
    
    // Get composed adapter
    const composedAdapter = adapterRegistry.getAdapter('testPlatform');
    
    // Should not override the existing method
    expect(composedAdapter.existingMethod).toBe(existingMethod);
    expect(composedAdapter.existingMethod).not.toBe(newMethod);
  });

  test('should preserve original adapter when composing interfaces', () => {
    const mockInterface = jest.fn();
    const mockAdapter = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    adapterRegistry.registerAdapterInterface('testPlatform', 'customMethod', mockInterface);
    adapterRegistry.registerAdapter('testPlatform', mockAdapter);
    
    // Get original adapter
    const originalAdapter = adapterRegistry.getOriginalAdapter('testPlatform');
    
    // Original adapter should be unchanged
    expect(originalAdapter).toBe(mockAdapter);
    expect(originalAdapter.customMethod).toBeUndefined();
    
    // Composed adapter should have the interface
    const composedAdapter = adapterRegistry.getAdapter('testPlatform');
    expect(composedAdapter.customMethod).toBe(mockInterface);
  });

  test('should unregister interface functions', () => {
    const mockFunction = jest.fn();
    
    adapterRegistry.registerAdapterInterface('testPlatform', 'testInterface', mockFunction);
    expect(adapterRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(true);
    
    adapterRegistry.unregisterAdapterInterface('testPlatform', 'testInterface');
    expect(adapterRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(false);
  });

  test('should return empty map for non-existent platform interfaces', () => {
    const interfaces = adapterRegistry.getPlatformInterfaces('nonExistentPlatform');
    expect(interfaces).toBeInstanceOf(Map);
    expect(interfaces.size).toBe(0);
  });

  test('should return false for non-existent platform interface', () => {
    expect(adapterRegistry.hasPlatformInterface('nonExistentPlatform', 'anyInterface')).toBe(false);
  });

  test('should handle multiple interface functions for same platform', () => {
    const mockFunction1 = jest.fn();
    const mockFunction2 = jest.fn();
    const mockAdapter = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };
    
    adapterRegistry.registerAdapterInterface('testPlatform', 'interface1', mockFunction1);
    adapterRegistry.registerAdapterInterface('testPlatform', 'interface2', mockFunction2);
    adapterRegistry.registerAdapter('testPlatform', mockAdapter);
    
    const platformInterfaces = adapterRegistry.getPlatformInterfaces('testPlatform');
    expect(platformInterfaces.size).toBe(2);
    expect(platformInterfaces.get('interface1')).toBe(mockFunction1);
    expect(platformInterfaces.get('interface2')).toBe(mockFunction2);
    
    // Check composed adapter has both interfaces
    const composedAdapter = adapterRegistry.getAdapter('testPlatform');
    expect(composedAdapter.interface1).toBe(mockFunction1);
    expect(composedAdapter.interface2).toBe(mockFunction2);
  });

  test('should clean up platform interfaces when unregistering adapter', () => {
    const mockFunction = jest.fn();
    const mockAdapter = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    adapterRegistry.registerAdapterInterface('testPlatform', 'testInterface', mockFunction);
    adapterRegistry.registerAdapter('testPlatform', mockAdapter);
    
    expect(adapterRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(true);
    
    adapterRegistry.unregisterAdapter('testPlatform');
    
    expect(adapterRegistry.hasPlatformInterface('testPlatform', 'testInterface')).toBe(false);
  });

  test('should get adapter capabilities correctly', () => {
    const mockInterface = jest.fn();
    const mockAdapter = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    adapterRegistry.registerAdapterInterface('testPlatform', 'customMethod', mockInterface);
    adapterRegistry.registerAdapter('testPlatform', mockAdapter);
    
    const capabilities = adapterRegistry.getAdapterCapabilities('testPlatform');
    
    expect(capabilities.platform).toBe('testPlatform');
    expect(capabilities.originalMethods).toContain('getAuthType');
    expect(capabilities.originalMethods).toContain('createCallLog');
    expect(capabilities.originalMethods).toContain('updateCallLog');
    expect(capabilities.composedMethods).toContain('customMethod');
    expect(capabilities.registeredInterfaces).toContain('customMethod');
    expect(capabilities.authType).toBe('apiKey');
  });

  test('should handle interface registration after adapter registration', () => {
    const mockAdapter = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };

    // Register adapter first
    adapterRegistry.registerAdapter('testPlatform', mockAdapter);
    
    // Register interface function after
    const mockInterface = jest.fn();
    adapterRegistry.registerAdapterInterface('testPlatform', 'customMethod', mockInterface);
    
    // Get composed adapter
    const composedAdapter = adapterRegistry.getAdapter('testPlatform');
    
    // Should have the interface function
    expect(composedAdapter.customMethod).toBe(mockInterface);
    
    // Original adapter should be unchanged
    const originalAdapter = adapterRegistry.getOriginalAdapter('testPlatform');
    expect(originalAdapter.customMethod).toBeUndefined();
  });

  test('should return interface-only adapter when no base adapter is registered', () => {
    const mockInterface1 = jest.fn();
    const mockInterface2 = jest.fn();
    
    // Register only interface functions, no base adapter
    adapterRegistry.registerAdapterInterface('interfaceOnlyPlatform', 'method1', mockInterface1);
    adapterRegistry.registerAdapterInterface('interfaceOnlyPlatform', 'method2', mockInterface2);
    
    // Get adapter - should return interface-only object
    const interfaceOnlyAdapter = adapterRegistry.getAdapter('interfaceOnlyPlatform');
    
    // Should have interface functions
    expect(interfaceOnlyAdapter.method1).toBe(mockInterface1);
    expect(interfaceOnlyAdapter.method2).toBe(mockInterface2);
    
    // Should not have base adapter methods
    expect(interfaceOnlyAdapter.getAuthType).toBeUndefined();
    
    // Should be a plain object, not inherited from any adapter
    expect(Object.getPrototypeOf(interfaceOnlyAdapter)).toBe(Object.prototype);
  });

  test('should throw error when no adapter and no interfaces are registered', () => {
    expect(() => {
      adapterRegistry.getAdapter('nonExistentPlatform');
    }).toThrow('Adapter not found for platform: nonExistentPlatform');
  });

  test('should handle mixed scenarios correctly', () => {
    // Scenario 1: Only interfaces, no adapter
    adapterRegistry.registerAdapterInterface('mixedPlatform', 'interfaceMethod', jest.fn());
    const interfaceOnly = adapterRegistry.getAdapter('mixedPlatform');
    expect(interfaceOnly.interfaceMethod).toBeDefined();
    expect(interfaceOnly.getAuthType).toBeUndefined();
    
    // Scenario 2: Add adapter later
    const mockAdapter = {
      getAuthType: () => 'apiKey',
      createCallLog: jest.fn(),
      updateCallLog: jest.fn()
    };
    adapterRegistry.registerAdapter('mixedPlatform', mockAdapter);
    
    const composedAdapter = adapterRegistry.getAdapter('mixedPlatform');
    expect(composedAdapter.interfaceMethod).toBeDefined();
    expect(composedAdapter.getAuthType).toBeDefined();
    expect(composedAdapter.getAuthType()).toBe('apiKey');
  });
}); 