const { createCoreApp, adapterRegistry } = require('@app-connect/core');

// Import your custom CRM adapter
const myCRMAdapter = require('./adapters/myCRM');
const releaseNotes = require('./releaseNotes.json');

// Register your CRM adapter
adapterRegistry.registerAdapter('myCRM', myCRMAdapter);
adapterRegistry.setReleaseNotes(releaseNotes);

// Create Express app with all core functionality
const app = createCoreApp();

exports.app = app;
