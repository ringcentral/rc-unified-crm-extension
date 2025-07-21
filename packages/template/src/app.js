const { createCoreApp, adapterRegistry } = require('@app-connect/core');

// Import your custom CRM adapter
const myCRMAdapter = require('./adapters/myCRM');
const manifest = require('./adapters/manifest.json');
const releaseNotes = require('./releaseNotes.json');

adapterRegistry.setDefaultManifest(manifest);
// Register your CRM adapter
adapterRegistry.registerAdapter('myCRM', myCRMAdapter, manifest);
adapterRegistry.setReleaseNotes(releaseNotes);

// Create Express app with all core functionality
const app = createCoreApp();

exports.app = app;
