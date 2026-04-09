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
- `--template, -t` - Template to use (currently only supports `default`)
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

1. **Downloads Template**: Downloads the latest template from the [RingCentral App Connect repository](https://github.com/ringcentral/rc-unified-crm-extension/tree/main/packages/template)
2. **Creates Project Structure**: Sets up a new project directory with all necessary files
3. **Updates Configuration**: Modifies `package.json` with your project name
4. **Provides Next Steps**: Shows you what to do next to get started

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
