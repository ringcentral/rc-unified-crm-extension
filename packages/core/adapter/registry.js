// core/src/adapter/registry.js
class AdapterRegistry {
  constructor() {
      this.adapters = new Map();
      this.manifests = new Map();
      this.releaseNotes = {};
  }

  setDefaultManifest(manifest) {
    this.manifests.set('default', manifest);
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
   * Get adapter by platform name
   * @param {string} platform - Platform identifier
   * @returns {Object} Adapter implementation
   */
  getAdapter(platform) {
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
      console.log(`Unregistered adapter: ${platform}`);
  }

  setReleaseNotes(releaseNotes) {
    this.releaseNotes = releaseNotes;
  }

  getReleaseNotes(platform) {
    return this.releaseNotes; 
  }
}

// Export singleton instance
const adapterRegistry = new AdapterRegistry();
module.exports = adapterRegistry;