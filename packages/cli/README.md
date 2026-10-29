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
- `--template, -t` - Template to use: `default` or `plugin`
- `--id <unique-identifier>` - Connector Unique Identifier from the Developer Console, including any namespace (e.g. `ringcentral_labs.zendesk`). Written into `src/app.ts` as the `registerConnector()` key. Prompted for interactively when omitted (connector template only)
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

# Create a new plugin project from the plugin template
npx @app-connect/cli init my-plugin-project --template plugin

# Pass the connector's Unique Identifier instead of answering the prompt
npx @app-connect/cli init my-crm-connector --id ringcentral_labs.zendesk

# Do everything and start the dev server
npx @app-connect/cli init my-crm-connector --id ringcentral_labs.zendesk -s
```

Without `--id`, `init` prompts for the Unique Identifier (and the project directory, if you did not pass one). In a non-interactive shell it leaves the placeholder `myCRM` in `src/app.ts`, which you must replace manually.

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

### Configure the environment

Run inside your project directory:

```bash
npx @app-connect/cli env
```

Creates `.env` from `.env.test` if it is missing, then prompts for the values shown in the Developer Console Quick setup:

- Connector projects: `APP_SERVER` and `APP_SERVER_SECRET_KEY`
- Plugin projects (detected from `PLUGIN_SERVER_SECRET_KEY` in `.env.test`): `PLUGIN_SERVER_SECRET_KEY`

**Options:**
- `--app-server <url>` - Connector server URL (connector projects only)
- `--secret-key <key>` - Secret key; skips the prompt

### What the CLI Does

1. **Downloads Template**: Downloads the selected template from the RingCentral App Connect repository
   - Connector template: `packages/template`
   - Plugin template: `packages/plugin-template`
2. **Creates Project Structure**: Sets up a new project directory with all necessary files
3. **Updates Configuration**: Modifies `package.json` with your project name and, for connectors, registers your Unique Identifier in `src/app.ts`
4. **Provides Next Steps**: Shows you what to do next to get started

### After Initialization

Once your project is created, follow these steps:

```bash
cd your-project-name
npm install                 # skipped if init already installed dependencies
npx @app-connect/cli env    # set the server URL / secret key (.env is created from .env.test)
npm run dev                 # Start development server
```

## Support

For support and questions:
- Check the [App Connect documentation](https://ringcentral.github.io/rc-unified-crm-extension/developers/getting-started/)
- Open a question on [RingCentral Community App Connect group](https://community.ringcentral.com/integrations-app-connect-33)
