// core/src/adapter/registry.js
class AdapterRegistry {
  constructor() {
      this.adapters = new Map();
      this.manifests = new Map();
      this.releaseNotes = {};
      this.platformInterfaces = new Map(); // Store interface functions per platform
  }

  setDefaultManifest(manifest) {
    this.manifests.set('default', manifest);
  }

  /**
   * Register an interface function for a specific platform
   * @param {string} platformName - Platform identifier (e.g., 'pipedrive', 'salesforce')
   * @param {string} interfaceName - Interface function name (e.g., 'createCallLog', 'findContact')
   * @param {Function} interfaceFunction - The interface function to register
   */
  registerAdapterInterface(platformName, interfaceName, interfaceFunction) {
    if (typeof interfaceFunction !== 'function') {
      throw new Error(`Interface function must be a function, got: ${typeof interfaceFunction}`);
    }

    if (!this.platformInterfaces.has(platformName)) {
      this.platformInterfaces.set(platformName, new Map());
    }

    const platformInterfaceMap = this.platformInterfaces.get(platformName);
    platformInterfaceMap.set(interfaceName, interfaceFunction);

    console.log(`Registered interface function: ${platformName}.${interfaceName}`);
  }

  /**
   * Get registered interface functions for a platform
   * @param {string} platformName - Platform identifier
   * @returns {Map} Map of interface functions
   */
  getPlatformInterfaces(platformName) {
    return this.platformInterfaces.get(platformName) || new Map();
  }

  /**
   * Check if an interface function is registered for a platform
   * @param {string} platformName - Platform identifier
   * @param {string} interfaceName - Interface function name
   * @returns {boolean} True if interface is registered
   */
  hasPlatformInterface(platformName, interfaceName) {
    const platformInterfaceMap = this.platformInterfaces.get(platformName);
    return platformInterfaceMap ? platformInterfaceMap.has(interfaceName) : false;
  }

  /**
   * Unregister an interface function for a platform
   * @param {string} platformName - Platform identifier
   * @param {string} interfaceName - Interface function name
   */
  unregisterAdapterInterface(platformName, interfaceName) {
    const platformInterfaceMap = this.platformInterfaces.get(platformName);
    if (platformInterfaceMap && platformInterfaceMap.has(interfaceName)) {
      platformInterfaceMap.delete(interfaceName);
      console.log(`Unregistered interface function: ${platformName}.${interfaceName}`);
    }
  }

  /**
   * Register an adapter with the core system
   * @param {string} platform - Platform identifier (e.g., 'pipedrive', 'salesforce')
   * @param {Object} adapter - Adapter implementation
   * @param {Object} manifest - Adapter manifest configuration
   */
  registerAdapter(platform, adapter, manifest = null) {
      // Validate adapter interface
      this.validateAdapterInterface(platform, adapter);
      
      this.adapters.set(platform, adapter);
      if (manifest) {
        this.manifests.set(platform, manifest);
      }
      
      console.log(`Registered adapter: ${platform}`);
  }

  /**
   * Get adapter by platform name with composed interfaces
   * @param {string} platform - Platform identifier
   * @returns {Object} Composed adapter with interface functions
   */
  getAdapter(platform) {
      const adapter = this.adapters.get(platform);
      const platformInterfaceMap = this.platformInterfaces.get(platform);
      
      // If no adapter and no interfaces, throw error
      if (!adapter && (!platformInterfaceMap || platformInterfaceMap.size === 0)) {
          throw new Error(`Adapter not found for platform: ${platform}`);
      }

      // If no adapter but interfaces exist, create a composed object with just interfaces
      if (!adapter && platformInterfaceMap && platformInterfaceMap.size > 0) {
          const composedAdapter = {};
          
          // Add interface functions to the composed adapter
          for (const [interfaceName, interfaceFunction] of platformInterfaceMap) {
              composedAdapter[interfaceName] = interfaceFunction;
          }

          console.log(`Returning interface-only adapter for platform: ${platform}`);
          return composedAdapter;
      }

      // If adapter exists but no interfaces, return original adapter
      if (adapter && (!platformInterfaceMap || platformInterfaceMap.size === 0)) {
          return adapter;
      }

      // If both adapter and interfaces exist, create a composed object
      const composedAdapter = Object.create(adapter);
      
      // Add interface functions to the composed adapter
      for (const [interfaceName, interfaceFunction] of platformInterfaceMap) {
        // Only add if the interface doesn't already exist in the adapter
        if (!Object.prototype.hasOwnProperty.call(adapter, interfaceName)) {
          composedAdapter[interfaceName] = interfaceFunction;
        }
      }

      return composedAdapter;
  }

  /**
   * Get the original adapter without composed interfaces
   * @param {string} platform - Platform identifier
   * @returns {Object} Original adapter implementation
   */
  getOriginalAdapter(platform) {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`Adapter not found for platform: ${platform}`);
    }
    return adapter;
  }

  /**
   * Get manifest for a platform
   * @param {string} platform - Platform identifier
   * @returns {Object} Manifest configuration
   */
  getManifest(platform, fallbackToDefault = false) {
      let manifest = this.manifests.get(platform);
      if (!manifest && fallbackToDefault) {
        manifest = this.manifests.get('default');
      }
      if (!manifest) {
        throw new Error(`Manifest not found for platform: ${platform}`);
      }
      return manifest;
  }

  /**
   * Get all registered platforms
   * @returns {Array<string>} Array of platform names
   */
  getRegisteredPlatforms() {
      return Array.from(this.adapters.keys());
  }

  /**
   * Check if platform is registered
   * @param {string} platform - Platform identifier
   * @returns {boolean} True if platform is registered
   */
  isRegistered(platform) {
      return this.adapters.has(platform);
  }

  /**
   * Validate that adapter implements required interface
   * @param {Object} adapter - Adapter to validate
   */
  validateAdapterInterface(platform, adapter) {
      const requiredMethods = [
          'createCallLog',
          'updateCallLog',
      ];

      for (const method of requiredMethods) {
          if (typeof adapter[method] !== 'function') {
              throw new Error(`Adapter ${platform} missing required method: ${method}`);
          }
      }
  }

  /**
   * Unregister an adapter
   * @param {string} platform - Platform identifier
   */
  unregisterAdapter(platform) {
      this.adapters.delete(platform);
      this.manifests.delete(platform);
      this.platformInterfaces.delete(platform);
      console.log(`Unregistered adapter: ${platform}`);
  }

  setReleaseNotes(releaseNotes) {
    this.releaseNotes = releaseNotes;
  }

  getReleaseNotes(platform) {
    return this.releaseNotes; 
  }

  /**
   * Get adapter capabilities summary including composed interfaces
   * @param {string} platform - Platform identifier
   * @returns {Object} Adapter capabilities
   */
  getAdapterCapabilities(platform) {
    const originalAdapter = this.getOriginalAdapter(platform);
    const composedAdapter = this.getAdapter(platform);
    const platformInterfaceMap = this.getPlatformInterfaces(platform);
    
    const capabilities = {
      platform,
      originalMethods: Object.keys(originalAdapter),
      composedMethods: Object.keys(composedAdapter),
      registeredInterfaces: Array.from(platformInterfaceMap.keys()),
      authType: null
    };

    // Get auth type if available
    if (typeof originalAdapter.getAuthType === 'function') {
      try {
        capabilities.authType = originalAdapter.getAuthType();
      } catch (error) {
        capabilities.authType = 'unknown';
      }
    }

    return capabilities;
  }
}

// Export singleton instance
const adapterRegistry = new AdapterRegistry();
module.exports = adapterRegistry;
