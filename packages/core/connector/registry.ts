// core/src/connector/registry.ts
// @ts-check

const logger = require('../lib/logger');

/** @typedef {import('../types').ConnectorCapabilities} ConnectorCapabilities */
/** @typedef {import('../types').ConnectorImplementation} ConnectorImplementation */
/** @typedef {import('../types').ConnectorInterfaceFunction} ConnectorInterfaceFunction */
/** @typedef {import('../types').ConnectorManifest} ConnectorManifest */

class ConnectorRegistry {
  connectors: Map<string, any>;

  manifests: Map<string, any>;

  releaseNotes: any;

  platformInterfaces: Map<string, Map<string, any>>;

  constructor() {
      /** @type {Map<string, ConnectorImplementation>} */
      this.connectors = new Map();
      /** @type {Map<string, ConnectorManifest>} */
      this.manifests = new Map();
      /** @type {unknown} */
      this.releaseNotes = {};
      /** @type {Map<string, Map<string, ConnectorInterfaceFunction>>} */
      this.platformInterfaces = new Map(); // Store interface functions per platform
  }

  /**
   * @param {ConnectorManifest} manifest
   */
  setDefaultManifest(manifest) {
    this.manifests.set('default', manifest);
  }

  /**
   * Register an interface function for a specific platform
   * @param {string} platformName - Platform identifier (e.g., 'pipedrive', 'salesforce')
   * @param {string} interfaceName - Interface function name (e.g., 'createCallLog', 'findContact')
   * @param {ConnectorInterfaceFunction} interfaceFunction - The interface function to register
   */
  registerConnectorInterface(platformName, interfaceName, interfaceFunction) {
    if (typeof interfaceFunction !== 'function') {
      throw new Error(`Interface function must be a function, got: ${typeof interfaceFunction}`);
    }

    if (!this.platformInterfaces.has(platformName)) {
      this.platformInterfaces.set(platformName, new Map());
    }

    const platformInterfaceMap = this.platformInterfaces.get(platformName);
    platformInterfaceMap.set(interfaceName, interfaceFunction);

    logger.info(`Registered interface function: ${platformName}.${interfaceName}`);
  }

  /**
   * Get registered interface functions for a platform
   * @param {string} platformName - Platform identifier
   * @returns {Map<string, ConnectorInterfaceFunction>} Map of interface functions
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
  unregisterConnectorInterface(platformName, interfaceName) {
    const platformInterfaceMap = this.platformInterfaces.get(platformName);
    if (platformInterfaceMap && platformInterfaceMap.has(interfaceName)) {
      platformInterfaceMap.delete(interfaceName);
      logger.info(`Unregistered interface function: ${platformName}.${interfaceName}`);
    }
  }

  /**
   * Register an connector with the core system
   * @param {string} platform - Platform identifier (e.g., 'pipedrive', 'salesforce')
   * @param {ConnectorImplementation} connector - Connector implementation
   * @param {ConnectorManifest | null} manifest - Connector manifest configuration
   */
  registerConnector(platform, connector, manifest = null) {
      // Validate connector interface
      this.validateConnectorInterface(platform, connector);
      
      this.connectors.set(platform, connector);
      if (manifest) {
        this.manifests.set(platform, manifest);
      }
      
      logger.info(`Registered connector: ${platform}`);
  }

  /**
   * Get connector by platform name with composed interfaces
   * @param {string} platform - Platform identifier
   * @returns {ConnectorImplementation} Composed connector with interface functions
   */
  getConnector(platform) {
      let connector = this.connectors.get(platform);
      const platformInterfaceMap = this.platformInterfaces.get(platform);

      if (!connector && (!platformInterfaceMap || platformInterfaceMap.size === 0)) {
        connector = this.connectors.get('proxy');
        if (connector) {
          return connector;
        }
        throw new Error(`Connector not found for platform: ${platform}`);
      }

      // If no connector but interfaces exist, create a composed object with just interfaces
      if (!connector && platformInterfaceMap && platformInterfaceMap.size > 0) {
          /** @type {ConnectorImplementation} */
          const composedConnector = {};

          // Add interface functions to the composed connector
          for (const [interfaceName, interfaceFunction] of platformInterfaceMap) {
              composedConnector[interfaceName] = interfaceFunction;
          }

          logger.info(`Returning interface-only connector for platform: ${platform}`);
          return composedConnector;
      }

      // If connector exists but no interfaces, return original connector
      if (connector && (!platformInterfaceMap || platformInterfaceMap.size === 0)) {
          return connector;
      }

      // If both connector and interfaces exist, create a composed object
      /** @type {ConnectorImplementation} */
      const composedConnector = Object.create(connector);

      // Add interface functions to the composed connector
      for (const [interfaceName, interfaceFunction] of platformInterfaceMap) {
        // Only add if the interface doesn't already exist in the connector
        if (!Object.prototype.hasOwnProperty.call(connector, interfaceName)) {
          composedConnector[interfaceName] = interfaceFunction;
        }
      }

      return composedConnector;
  }

  /**
   * Get the original connector without composed interfaces
   * @param {string} platform - Platform identifier
   * @returns {ConnectorImplementation} Original connector implementation
   */
  getOriginalConnector(platform) {
    const connector = this.connectors.get(platform);
    if (!connector) {
      throw new Error(`Connector not found for platform: ${platform}`);
    }
    return connector;
  }

  /**
   * Get manifest for a platform
   * @param {string} platform - Platform identifier
   * @param {boolean} [fallbackToDefault] - Use default manifest when platform-specific manifest is missing
   * @returns {ConnectorManifest} Manifest configuration
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
      return Array.from(this.connectors.keys());
  }

  /**
   * Check if platform is registered
   * @param {string} platform - Platform identifier
   * @returns {boolean} True if platform is registered
   */
  isRegistered(platform) {
      return this.connectors.has(platform);
  }

  /**
   * Validate that connector implements required interface
   * @param {string} platform - Platform identifier
   * @param {ConnectorImplementation} connector - Connector to validate
   */
  validateConnectorInterface(platform, connector) {
      const requiredMethods = [
          'createCallLog',
          'updateCallLog',
      ];

      for (const method of requiredMethods) {
          if (typeof connector[method] !== 'function') {
              throw new Error(`Connector ${platform} missing required method: ${method}`);
          }
      }
  }

  /**
   * Unregister an connector
   * @param {string} platform - Platform identifier
   */
  unregisterConnector(platform) {
      this.connectors.delete(platform);
      this.manifests.delete(platform);
      this.platformInterfaces.delete(platform);
      logger.info(`Unregistered connector: ${platform}`);
  }

  /**
   * @param {unknown} releaseNotes
   */
  setReleaseNotes(releaseNotes) {
    this.releaseNotes = releaseNotes;
  }

  /**
   * @returns {unknown}
   */
  getReleaseNotes() {
    return this.releaseNotes; 
  }

  /**
   * Get connector capabilities summary including composed interfaces
   * @param {string} platform - Platform identifier
   * @returns {Promise<ConnectorCapabilities>} Connector capabilities
   */
  async getConnectorCapabilities(platform) {
    const originalConnector = this.getOriginalConnector(platform);
    const composedConnector = this.getConnector(platform);
    const platformInterfaceMap = this.getPlatformInterfaces(platform);
    
    const capabilities = {
      platform,
      originalMethods: Object.keys(originalConnector),
      composedMethods: Object.keys(composedConnector),
      registeredInterfaces: Array.from(platformInterfaceMap.keys()),
      authType: null
    };

    // Get auth type if available
    if (typeof originalConnector.getAuthType === 'function') {
      try {
        capabilities.authType = await originalConnector.getAuthType();
      } catch (error) {
        logger.error('Error getting auth type', { stack: /** @type {any} */ (error).stack });
        capabilities.authType = 'unknown';
      }
    }

    return capabilities;
  }
}

// Export singleton instance
const connectorRegistry = new ConnectorRegistry();
module.exports = connectorRegistry;

export {};
