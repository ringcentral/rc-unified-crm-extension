# RingCentral App Connect CLI

A command-line interface for creating new RingCentral App Connect projects from templates.

## Installation

### Using npx (Recommended)

No installation required! Use npx to run the CLI directly:

```bash
npx @app-connect/cli init [project-name]
```

### Global Installation

Alternatively, you can install it globally:

```bash
npm install -g @app-connect/cli
```

Then use it as:

```bash
appconnect init [project-name]
```

## Usage

### Initialize a New Project

**With npx (recommended):**
```bash
npx @app-connect/cli init [project-name]
```

**With global installation:**
```bash
appconnect init [project-name]
```

**Options:**
- `project-name` - Name of the project directory (optional, defaults to `my-app-connect-project`)
- `--force, -f` - Force overwrite if directory exists
- `--template, -t` - Template to use (default: `default`)
- `--no-install` - Skip installing dependencies (installs by default)
- `--no-env` - Skip copying `.env.test` to `.env` (copies by default if present)
- `--start, -s` - Automatically run the dev server after init

**Examples:**

```bash
# Create a new project with default name
npx @app-connect/cli init

# Create a new project with custom name
npx @app-connect/cli init my-crm-connector

# Force overwrite existing directory
npx @app-connect/cli init my-crm-connector --force

# Auto-install deps and copy env (default behavior)
npx @app-connect/cli init my-crm-connector

# Do everything and start the dev server
npx @app-connect/cli init my-crm-connector -s
```

### Add Plugin Template to Existing Connector

**With npx (recommended):**
```bash
npx @app-connect/cli add-plugin <plugin-name>
```

**With global installation:**
```bash
appconnect add-plugin <plugin-name>
```

This command validates that a connector project already exists and installs plugin template files into:

`src/plugin/<plugin-name>`

The template now provides `src/pluginApp.js` (no `server.js` or `lambda.js`).
The CLI automatically:
- adds plugin route registration lines to connector `src/app.js`
- updates `src/.env` with `SYNC_PLUGIN_ID` and `ASYNC_PLUGIN_ID` using the provided plugin id

**Options:**
- `plugin-name` - Folder name to create under `src/plugin/`
- `--plugin-id, -i` - Required plugin id from developer portal profile URL
- `--path, -p` - Connector project root path (defaults to current directory)
- `--force, -f` - Overwrite existing plugin folder

**Examples:**

```bash
# From connector root
npx @app-connect/cli add-plugin my-plugin --plugin-id yourPluginId

# From anywhere, point to connector root explicitly
npx @app-connect/cli add-plugin my-plugin --plugin-id yourPluginId --path ../my-crm-connector
```

### Upgrade @app-connect/core in an existing project

Run inside your project directory:

**With npx (recommended):**
```bash
npx @app-connect/cli upgrade
```

**With global installation:**
```bash
appconnect upgrade
```

**Options:**
- `--dev, -D` - Install as a devDependency

This will detect your package manager (npm, pnpm, yarn, bun) and upgrade `@app-connect/core` to the latest version.

### Start the development server

Run inside your project directory:

**With npx (recommended):**
```bash
npx @app-connect/cli start [port]
```

**With global installation:**
```bash
appconnect start [port]
```

`port` is optional. If provided, it sets the `PORT` env var before running the project's `dev` script.

### What the CLI Does

1. **Downloads Template**: Downloads the selected template from the RingCentral App Connect repository
   - Connector template: `packages/template`
   - Plugin template: `packages/plugin-template`
2. **Creates Project Structure**: Sets up a new project directory with all necessary files
3. **Updates Configuration**: Modifies `package.json` with your project name
4. **Provides Next Steps**: Shows you what to do next to get started

For plugin template installation, use `add-plugin`.
The CLI validates connector presence and installs into `src/plugin/<plugin-name>`.
Since plugin template is an extension to the existing connector service, `add-plugin` does not run dependency install or start commands.
If plugin id is missing, use this instruction:
go to plugin profile on developer portal and the url will look like https://appconnect.labs.ringcentral.com/console#/app/plugins/{pluginId}. Use the pluginId to fill in existing .env file under src folder as SYNC_PLUGIN_ID and ASYNC_PLUGIN_ID

### After Initialization

Once your project is created, follow these steps:

```bash
cd your-project-name
npm install
cp .env.test .env  # Configure your environment
npm run dev        # Start development server
```

## Support

For support and questions:
- Check the [App Connect documentation](https://ringcentral.github.io/rc-unified-crm-extension/developers/getting-started/)
- Open a question on [RingCentral Community App Connect group](https://community.ringcentral.com/groups/app-connect-22)
