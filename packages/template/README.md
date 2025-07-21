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
cp .env.test .env
```

Edit `.env` with your CRM API credentials and other configuration.

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

- **`src/app.js`**: Main application setup with core functionality and custom routes
- **`src/server.js`**: Server entry point for local development
- **`src/lambda.js`**: Lambda function entry point for serverless deployment
- **`src/adapters/`**: CRM adapter implementations and manifests
- **`scripts/`**: Utility scripts for setup and deployment
- **`test/`**: Test files organized by component

## Development

### Adapter development

1. Create a new adapter file in the `src/adapters/` directory, or update `src/adapter/myCRM` directly. Implement the required [interface methods](https://ringcentral.github.io/rc-unified-crm-extension/developers/interfaces/)
2. Edit `manifest.json` file in `src/adapter/manifest.json`. Change `serverUrl` to `http://localhost:6066` for local development. Full manifest docs [here](https://ringcentral.github.io/rc-unified-crm-extension/developers/manifest/).

### Adding Custom Endpoints

Add your custom routes directly to the app after creating it:

```javascript
// path: /src/app.js
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

Check [document](https://ringcentral.github.io/rc-unified-crm-extension/developers/deploy/) here.

## Support

For support and questions:

- Check the full [App Connect documentation]([../packages/core/README.md](https://ringcentral.github.io/rc-unified-crm-extension/developers/getting-started/))
- Open an question on [RingCentral Community App Connect group](https://community.ringcentral.com/groups/app-connect-22)
