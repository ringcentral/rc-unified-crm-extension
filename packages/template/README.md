# RingCentral App Connect Template

A new RingCentral App Connect project

## Quick Start

### 1. Install Dependencies

```bash
npm i
```

### 2. Configure Environment

Copy the environment example file and configure your settings:

```bash
npx @app-connect/cli env
```

This creates `.env` from `.env.test` (if `npx @app-connect/cli init` has not already) and prompts for `APP_SERVER` and `APP_SERVER_SECRET_KEY` from the Developer Console Quick setup. Then edit `.env` with your CRM API credentials and other configuration.

Make sure `src/app.ts` registers the connector with the complete Unique Identifier from the Developer Console (`connectorRegistry.registerConnector('<unique-identifier>', ...)`). `npx @app-connect/cli init` sets this for you.

### 3. Start the Server

```bash
# Development mode with files watch
npm run dev

# Production mode
npm run prod
```

The server will start on `http://localhost:6066` (or the port specified in your `.env` file).

## Project Organization

The template follows a modular structure:

- **`src/app.ts`**: Main application setup with core functionality and custom routes
- **`src/server.ts`**: Server entry point for local development
- **`src/lambda.ts`**: Lambda function entry point for serverless deployment
- **`src/connectors/`**: CRM connector implementations and manifests
- **`scripts/`**: Utility scripts for setup and deployment
- **`test/`**: Test files organized by component

## Development

### Connector development

1. Create a new connector file in the `src/connectors/` directory, or update `src/connectors/myCRM.ts` directly. Implement the required [interface methods](https://ringcentral.github.io/rc-unified-crm-extension/developers/interfaces/)
2. Manage the manifest in the [Developer Console](https://appconnect.labs.ringcentral.com/console); the template does not ship a manifest file. Set the connector server URL to your tunnel URL for local development. Full manifest docs [here](https://ringcentral.github.io/rc-unified-crm-extension/developers/manifest/).

### Adding Custom Endpoints

Add your custom routes directly to the app after creating it:

```javascript
// path: /src/app.ts
const app = createCoreApp();

// Add your custom routes
app.get('/my-endpoint', (req, res) => {
  // Your endpoint logic
});
```

### Adding Custom Middleware

Add your custom middleware directly to the app after creating it:

```javascript
const app = createCoreApp();

// Add your custom middleware
app.use((req, res, next) => {
  // Your middleware logic
  next();
});
```

## Deployment

Check [AWS serverless deployment](https://ringcentral.github.io/rc-unified-crm-extension/developers/deploy/) here.

- [Azure App Service deployment guide](./azure-deploy/README.md)

## Support

For support and questions:

- Check the full [App Connect documentation]([../packages/core/README.md](https://ringcentral.github.io/rc-unified-crm-extension/developers/getting-started/))
- Open an question on [RingCentral Community App Connect group](https://community.ringcentral.com/integrations-app-connect-33)
