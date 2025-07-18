# App Connect Core

Core package for RingCentral App Connect project providing modular APIs for CRM integration, authentication, contact management, and call logging.

## Features

- **Modular API Design**: Flexible Express app setup with customizable middleware and routes
- **CRM Adapter Registry**: Centralized adapter management for multiple CRM platforms
- **Authentication**: OAuth and API key authentication support
- **Contact Management**: Find, create, and manage contacts across CRM platforms
- **Call Logging**: Comprehensive call and message logging capabilities
- **Analytics**: Built-in analytics tracking for all operations
- **Database Integration**: DynamoDB integration with automatic table management

## Installation

```bash
npm install @app-connect/core
```

## Quick Start

### Basic Usage

```javascript
const { createCoreApp, adapterRegistry } = require('@app-connect/core');

// Register your CRM adapters
adapterRegistry.registerAdapter('myCRM', myCRMAdapter);

// Create Express app with all core functionality
const app = createCoreApp();

// Add your custom routes
app.get('/my-custom-route', (req, res) => {
    res.send('Hello from custom route!');
});

exports.getServer = () => app;
```

### Advanced Usage with Custom Middleware

```javascript
const express = require('express');
const { 
    createCoreRouter, 
    createCoreMiddleware, 
    initializeCore, 
    adapterRegistry 
} = require('@app-connect/core');

// Register adapters
adapterRegistry.registerAdapter('myCRM', myCRMAdapter);

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

### Adapter Registry

#### `adapterRegistry.setDefaultManifest(manifest)`
Sets the default manifest for adapters.

**Parameters:**
- `manifest` (Object): Default manifest

#### `adapterRegistry.registerAdapter(name, adapter, manifest)`
Registers a CRM adapter.

**Parameters:**
- `name` (String): Adapter name
- `adapter` (Object): Adapter implementation
- `manifest` (Object, optional): Adapter manifest

#### `adapterRegistry.getAdapter(name)`
Retrieves a registered adapter.

**Parameters:**
- `name` (String): Adapter name

**Returns:** Adapter instance

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

- `DYNAMODB_LOCALHOST` - Local DynamoDB endpoint for development
- `DISABLE_SYNC_DB_TABLE` - Skip database table synchronization
- `OVERRIDE_APP_SERVER` - Override app server URL in manifests
- `HASH_KEY` - Key for hashing user information
- `APP_SERVER_SECRET_KEY` - Server secret key
- `IS_PROD` - Production environment flag

## Architecture

The core package follows a modular architecture:

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
├── Adapter Registry
│   └── registry.js  - CRM adapter management
└── API Layer
    ├── createCoreApp()     - Complete app setup
    ├── createCoreRouter()  - Route management
    ├── createCoreMiddleware() - Middleware management
    └── initializeCore()    - Service initialization
```
