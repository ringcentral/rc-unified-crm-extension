# App Connect Core

Core package for RingCentral App Connect project providing modular APIs for CRM integration, authentication, contact management, and call logging.

## Features

- **Modular API Design**: Flexible Express app setup with customizable middleware and routes
- **CRM Connector Registry**: Centralized connector management for multiple CRM platforms
- **Authentication**: OAuth and API key authentication support
- **Contact Management**: Find, create, and manage contacts across CRM platforms
- **Call Logging**: Comprehensive call and message logging capabilities
- **Analytics**: Built-in analytics tracking for all operations
- **Database Integration**: Sequelize.js ORM with automatic table management

## Installation

```bash
npm install @app-connect/core
```

## Quick Start

### Basic Usage

```javascript
const { createCoreApp, connectorRegistry } = require('@app-connect/core');
const myCRMConnector = require('./connectors/myCRM');
const manifest = require('./connectors/manifest.json');
// Set the default manifest for the connector registry. This ensures that all connectors
// have access to the necessary configuration and metadata before registration.
connectorRegistry.setDefaultManifest(manifest);
// Register your CRM connectors. The default manifest must be set before registration
// to ensure proper initialization of the connector with the required settings.
connectorRegistry.registerConnector('myCRM', myCRMConnector, manifest);

// Create Express app with all core functionality
const app = createCoreApp();

// Add your custom routes
app.get('/my-custom-route', (req, res) => {
    res.send('Hello from custom route!');
});

exports.getServer = () => app;
```

### Connector Interface Registration

The connector registry supports dynamic interface registration, allowing you to extend connector functionality without modifying the original connector:

```javascript
const { connectorRegistry } = require('@app-connect/core');

// Register interface functions for a platform
async function customCreateCallLog({ user, contactInfo, authHeader, callLog, note }) {
  // Custom implementation
  return {
    logId: 'custom-log-id',
    returnMessage: {
      message: 'Call logged with custom implementation',
      messageType: 'success',
      ttl: 2000
    }
  };
}

async function customFindContact({ user, authHeader, phoneNumber }) {
  // Custom implementation
  return [
    {
      id: 'custom-contact-id',
      name: 'Custom Contact',
      type: 'Contact',
      phone: phoneNumber,
      additionalInfo: null
    }
  ];
}

// Register interface functions
connectorRegistry.registerConnectorInterface('myCRM', 'createCallLog', customCreateCallLog);
connectorRegistry.registerConnectorInterface('myCRM', 'findContact', customFindContact);

// Register the base connector
connectorRegistry.registerConnector('myCRM', myCRMConnector);

// Get composed connector with interfaces
const composedConnector = connectorRegistry.getConnector('myCRM');
```

**Interface-Only Connectors (No Base Connector):**

```javascript
// Register only interface functions, no base connector
connectorRegistry.registerConnectorInterface('interfaceOnlyCRM', 'createCallLog', customCreateCallLog);
connectorRegistry.registerConnectorInterface('interfaceOnlyCRM', 'findContact', customFindContact);

// Get interface-only connector
const interfaceOnlyConnector = connectorRegistry.getConnector('interfaceOnlyCRM');
console.log('Interface-only methods:', Object.keys(interfaceOnlyConnector));
// Output: ['createCallLog', 'findContact']

// Later, you can add a base connector
connectorRegistry.registerConnector('interfaceOnlyCRM', myCRMConnector);
const fullConnector = connectorRegistry.getConnector('interfaceOnlyCRM');
console.log('Full connector methods:', Object.keys(fullConnector));
// Output: ['getAuthType', 'getUserInfo', 'updateCallLog', 'unAuthorize', 'createContact', 'createCallLog', 'findContact']
```

### Advanced Usage with Custom Middleware

```javascript
const express = require('express');
const { 
    createCoreRouter, 
    createCoreMiddleware, 
    initializeCore, 
    connectorRegistry 
} = require('@app-connect/core');

const myCRMConnector = require('./connectors/myCRM');
const manifest = require('./connectors/manifest.json');
// Set manifest
connectorRegistry.setDefaultManifest(manifest);
// Register connectors
connectorRegistry.registerConnector('myCRM', myCRMConnector, manifest);

// Initialize core services
initializeCore();

// Create your own Express app
const app = express();

// Add custom middleware first
app.use(express.static('public'));
app.use('/api/v2', customApiMiddleware);

// Apply core middleware
const coreMiddleware = createCoreMiddleware();
coreMiddleware.forEach(middleware => app.use(middleware));

// Add core routes
const coreRouter = createCoreRouter();
app.use('/', coreRouter);

// Add custom routes
app.get('/my-custom-route', (req, res) => {
    res.send('Hello from custom route!');
});
```

## API Reference

### Core Functions

#### `createCoreApp(options)`
Creates a complete Express app with all core functionality.

**Parameters:**
- `options` (Object, optional): Configuration options
  - `skipDatabaseInit` (Boolean): Skip database initialization (default: false)
  - `skipAnalyticsInit` (Boolean): Skip analytics initialization (default: false)

**Returns:** Express application instance

#### `createCoreRouter()`
Creates an Express router with all core routes.

**Returns:** Express router instance

#### `createCoreMiddleware()`
Returns an array of core middleware functions.

**Returns:** Array of middleware functions

#### `initializeCore(options)`
Initializes core services (database, analytics).

**Parameters:**
- `options` (Object, optional): Configuration options
  - `skipDatabaseInit` (Boolean): Skip database initialization (default: false)
  - `skipAnalyticsInit` (Boolean): Skip analytics initialization (default: false)

### Connector Registry

#### `connectorRegistry.setDefaultManifest(manifest)`
Sets the default manifest for connectors.

**Parameters:**
- `manifest` (Object): Default manifest

#### `connectorRegistry.registerConnector(name, connector, manifest)`
Registers a CRM connector.

**Parameters:**
- `name` (String): Connector name
- `connector` (Object): Connector implementation
- `manifest` (Object, optional): Connector manifest

#### `connectorRegistry.registerConnectorInterface(platformName, interfaceName, interfaceFunction)`
Registers an interface function for a specific platform that will be composed with the connector at retrieval time.

**Parameters:**
- `platformName` (String): Platform identifier (e.g., 'pipedrive', 'salesforce')
- `interfaceName` (String): Interface function name (e.g., 'createCallLog', 'findContact')
- `interfaceFunction` (Function): The interface function to register

**Example:**
```javascript
async function customCreateCallLog({ user, contactInfo, authHeader, callLog, note }) {
  // Custom implementation
  return {
    logId: 'custom-log-id',
    returnMessage: {
      message: 'Call logged with custom implementation',
      messageType: 'success',
      ttl: 2000
    }
  };
}

connectorRegistry.registerConnectorInterface('myCRM', 'createCallLog', customCreateCallLog);
```

#### `connectorRegistry.getConnector(name)`
Retrieves a registered connector with composed interfaces.

**Parameters:**
- `name` (String): Connector name

**Returns:** Composed connector object or interface-only object

**Behavior:**
- If connector exists and interfaces exist: Returns composed connector with both
- If connector exists but no interfaces: Returns original connector
- If no connector but interfaces exist: Returns object with just interface functions
- If no connector and no interfaces: Throws error

#### `connectorRegistry.getOriginalConnector(name)`
Retrieves the original connector without any composed interface functions.

**Parameters:**
- `name` (String): Connector name

**Returns:** Original connector object

#### `connectorRegistry.getPlatformInterfaces(platformName)`
Returns a Map of registered interface functions for a platform.

**Parameters:**
- `platformName` (String): Platform identifier

**Returns:** Map of interface functions

#### `connectorRegistry.hasPlatformInterface(platformName, interfaceName)`
Checks if a specific interface function is registered for a platform.

**Parameters:**
- `platformName` (String): Platform identifier
- `interfaceName` (String): Interface function name

**Returns:** Boolean indicating if interface exists

#### `connectorRegistry.unregisterConnectorInterface(platformName, interfaceName)`
Unregisters an interface function for a platform.

**Parameters:**
- `platformName` (String): Platform identifier
- `interfaceName` (String): Interface function name

#### `connectorRegistry.getConnectorCapabilities(platformName)`
Gets comprehensive information about an connector including its capabilities and registered interfaces.

**Parameters:**
- `platformName` (String): Platform identifier

**Returns:** Promise with Object with connector capabilities information

### Exported Components

#### Handlers
```javascript
const authHandler = require('@app-connect/core/handlers/auth');
const contactHandler = require('@app-connect/core/handlers/contact');
const logHandler = require('@app-connect/core/handlers/log');
const adminHandler = require('@app-connect/core/handlers/admin');
const userHandler = require('@app-connect/core/handlers/user');
const dispositionHandler = require('@app-connect/core/handlers/disposition');

// Available handlers:
// authHandler      - Authentication operations
// contactHandler   - Contact management
// logHandler       - Call/message logging
// adminHandler     - Admin operations
// userHandler      - User management
// dispositionHandler - Call disposition
```

#### Models
```javascript
const { UserModel } = require('@app-connect/core/models/userModel');
const { CallLogModel } = require('@app-connect/core/models/callLogModel');
const { MessageLogModel } = require('@app-connect/core/models/messageLogModel');
const { AdminConfigModel } = require('@app-connect/core/models/adminConfigModel');
const { CacheModel } = require('@app-connect/core/models/cacheModel');

// Available models:
// UserModel        - User data model
// CallLogModel     - Call log data model
// MessageLogModel  - Message log data model
// AdminConfigModel - Admin configuration model
// CacheModel       - Cache data model
```

#### Utilities
```javascript
const jwt = require('@app-connect/core/lib/jwt');
const analytics = require('@app-connect/core/lib/analytics');
const util = require('@app-connect/core/lib/util');

// Available utilities:
// jwt        - JWT token management
// analytics  - Analytics tracking
// util       - General utilities
```

## Core Routes

The core package provides the following API endpoints:

### Authentication
- `GET /authValidation` - Validate user authentication
- `GET /oauth-callback` - OAuth callback handler
- `POST /apiKeyLogin` - API key authentication
- `POST /unAuthorize` - Logout user

### Contact Management
- `GET /contact` - Find contacts by phone number
- `POST /contact` - Create new contact
- `GET /custom/contact/search` - Search contacts by name

### Call Logging
- `GET /callLog` - Retrieve call logs
- `POST /callLog` - Create call log
- `PATCH /callLog` - Update call log
- `PUT /callDisposition` - Set call disposition
- `POST /messageLog` - Create message log

### User Management
- `GET /user/settings` - Get user settings
- `POST /user/settings` - Update user settings
- `GET /user/preloadSettings` - Preload user settings

### Admin Operations
- `GET /admin/settings` - Get admin settings
- `POST /admin/settings` - Update admin settings
- `GET /admin/serverLoggingSettings` - Get server logging settings
- `POST /admin/serverLoggingSettings` - Update server logging settings

### System
- `GET /releaseNotes` - Get release notes
- `GET /crmManifest` - Get CRM manifest
- `GET /is-alive` - Health check
- `GET /serverVersionInfo` - Get server version
- `GET /hostname` - Get user hostname
- `GET /userInfoHash` - Get hashed user info

## Environment Variables

The core package uses the following environment variables:

- `DATABASE_URL` - Database connection string for Sequelize ORM
- `DISABLE_SYNC_DB_TABLE` - Skip database table synchronization
- `OVERRIDE_APP_SERVER` - Override app server URL in manifests
- `HASH_KEY` - Key for hashing user information
- `APP_SERVER_SECRET_KEY` - Server secret key
- `IS_PROD` - Production environment flag
- `DYNAMODB_LOCALHOST` - Local DynamoDB endpoint for development, used for lock cache

## Connector Interface Registration Benefits

### Key Features

- **Composition over Mutation**: Interface functions are composed with connectors at retrieval time, preserving the original connector
- **Dynamic Registration**: Register interface functions before or after connector registration
- **Immutability**: Original connector objects remain unchanged
- **Clean Separation**: Interface functions are kept separate from core connector logic
- **Flexibility**: Support for interface-only connectors (no base connector required)

### Best Practices

1. **Register Required Interfaces**: Register all required interface functions before using the connector
2. **Use Descriptive Names**: Use clear, descriptive names for interface functions
3. **Handle Errors**: Implement proper error handling in interface functions
4. **Test Composed Connectors**: Test the final composed connector to ensure interfaces work correctly
5. **Document Interfaces**: Document what each interface function does and expects

### Use Cases

- **Extending Existing Connectors**: Add new functionality to existing connectors without modification
- **Progressive Enhancement**: Start with interfaces, add base connector later
- **Testing**: Test interface functions separately from base connectors
- **Modular Development**: Develop interface functions independently
- **Plugin Architecture**: Create pluggable interface functions for different scenarios

## Architecture

```
Core Package
├── Handlers (Business Logic)
│   ├── auth.js      - Authentication logic
│   ├── contact.js   - Contact management
│   ├── log.js       - Call/message logging
│   ├── admin.js     - Admin operations
│   ├── user.js      - User management
│   └── disposition.js - Call disposition
├── Models (Data Layer)
│   ├── userModel.js
│   ├── callLogModel.js
│   ├── messageLogModel.js
│   ├── adminConfigModel.js
│   └── cacheModel.js
├── Utils (Utilities)
│   ├── jwt.js       - JWT operations
│   ├── analytics.js - Analytics tracking
│   └── util.js      - General utilities
├── Connector Registry
│   └── registry.js  - CRM connector management
└── API Layer
    ├── createCoreApp()     - Complete app setup
    ├── createCoreRouter()  - Route management
    ├── createCoreMiddleware() - Middleware management
    └── initializeCore()    - Service initialization
```
