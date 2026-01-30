# Deploying to Azure App Service

This guide covers how to deploy your service to Azure App Service. It assumes you already have an Azure account and have created an Azure App Service instance.

## Prerequisites

Before deploying, ensure your Azure App Service is configured to build on deployment:

1. In the Azure Portal, navigate to your App Service
2. Go to **Configuration** → **Application settings**
3. Add the following setting:
   - Name: `SCM_DO_BUILD_DURING_DEPLOYMENT`
   - Value: `true`
4. Click **Save**

This ensures Azure will automatically run `npm install` after deployment.

## What Gets Deployed

Only the source code is deployed. The following are **excluded** from deployment:

- `node_modules/` - Dependencies are installed on the server
- `*.test.js`, `__tests__/` - Test files
- `.env` - Environment variables (configure these in Azure Portal instead)
- `.git/` - Git repository data
- `*.log` - Log files
- `db.sqlite` - Local database file

> **Important:** Configure your environment variables in Azure Portal under **Configuration** → **Application settings** rather than deploying a `.env` file.

---

## Deployment Methods

### Method 1: VS Code Extension (Recommended for Development)

The Azure App Service extension provides the easiest deployment experience directly from VS Code.

#### Setup

1. Install the [Azure App Service extension](https://marketplace.visualstudio.com/items?itemName=ms-azuretools.vscode-azureappservice) in VS Code
2. Sign in to your Azure account via the Azure sidebar

#### Deploy

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Type and select **Azure App Service: Deploy to Web App...**
3. Select your subscription and App Service instance
4. Choose the folder to deploy
5. Confirm the deployment

The extension will automatically create a `.deployment` file and handle the build process.

#### Tips

- Right-click your App Service in the Azure sidebar to access quick actions
- Use **Stream Logs** to monitor deployment progress and application logs

---

### Method 2: Azure CLI

The Azure CLI offers flexible command-line deployment options.

#### Prerequisites

- Install [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
- Login: `az login`

#### Option A: ZIP Deploy (Recommended)

Create a ZIP file of your code and deploy:

```bash
# Create deployment package (excluding unnecessary files)
zip -r deploy.zip . \
  -x "node_modules/*" \
  -x "*.test.js" \
  -x "__tests__/*" \
  -x ".env" \
  -x ".git" \
  -x ".git/*" \
  -x "*.log" \
  -x "db.sqlite"

# Deploy to Azure
az webapp deploy \
  --resource-group <your-resource-group> \
  --name <your-app-name> \
  --src-path deploy.zip \
  --type zip

# Clean up
rm deploy.zip
```

#### Option B: az webapp up (Quick Deploy)

For rapid deployment with automatic configuration:

```bash
az webapp up \
  --resource-group <your-resource-group> \
  --name <your-app-name> \
  --runtime "NODE:24-lts"
```

> **Note:** `az webapp up` creates/updates resources automatically. Use with caution in production.

#### Option C: Local Git Deployment

Set up continuous deployment from a local Git repository:

```bash
# Configure deployment source
az webapp deployment source config-local-git \
  --resource-group <your-resource-group> \
  --name <your-app-name>

# Get the Git remote URL (from output)
# Add it as a remote
git remote add azure <deployment-url>

# Push to deploy
git push azure main
```

---

### Method 3: Azure Portal (Web Console)

Deploy directly through the Azure web interface.

#### Option A: Deployment Center

1. Navigate to your App Service in Azure Portal
2. Go to **Deployment Center** in the left sidebar
3. Choose your source:
   - **Local Git** - Push from your machine
   - **GitHub** - Connect your repository for CI/CD
   - **Bitbucket** - Connect your Bitbucket repository
   - **External Git** - Any Git repository URL
4. Follow the wizard to complete setup

#### Option B: ZIP Deploy via Kudu

1. Navigate to `https://<your-app-name>.scm.azurewebsites.net`
2. Go to **Tools** → **Zip Push Deploy**
3. Drag and drop your ZIP file (excluding `node_modules`, tests, `.env`, `.git`, `*.log`, `db.sqlite`)

#### Option C: App Service Editor (Quick Edits)

For minor changes only:

1. In Azure Portal, go to your App Service
2. Select **App Service Editor** under Development Tools
3. Edit files directly in the browser

> **Warning:** Not recommended for full deployments. Use for hotfixes only.

---

### Method 4: GitHub Actions (CI/CD)

Automate deployments with GitHub Actions.

#### Setup

1. In Azure Portal, go to your App Service
2. Navigate to **Deployment Center**
3. Select **GitHub** as the source
4. Authorize and select your repository
5. Azure will create a workflow file automatically

#### Manual Workflow Setup

Create `.github/workflows/azure-deploy.yml`:

```yaml
name: Deploy to Azure App Service

on:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'

      - name: Create deployment package
        run: |
          zip -r deploy.zip . \
            -x "node_modules/*" \
            -x "*.test.js" \
            -x "__tests__/*" \
            -x ".env" \
            -x ".git" \
            -x ".git/*" \
            -x ".github/*" \
            -x "*.log" \
            -x "db.sqlite"

      - name: Deploy to Azure
        uses: azure/webapps-deploy@v2
        with:
          app-name: ${{ secrets.AZURE_WEBAPP_NAME }}
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: deploy.zip
```

#### Required Secrets

1. Download the publish profile from Azure Portal (**Get publish profile** button)
2. In GitHub, go to **Settings** → **Secrets and variables** → **Actions**
3. Add:
   - `AZURE_WEBAPP_NAME` - Your App Service name
   - `AZURE_WEBAPP_PUBLISH_PROFILE` - Contents of the downloaded publish profile

---

## Post-Deployment Configuration

### Environment Variables

Configure your environment variables in Azure Portal:

1. Go to **Configuration** → **Application settings**
2. Click **+ New application setting**
3. Add each variable from your `.env` file
4. Click **Save** and restart the app

### Startup Command (if needed)

If your app requires a custom startup command:

1. Go to **Configuration** → **General settings**
2. Set the **Startup Command** `npm run prod`

### Verify Deployment

1. Navigate to `https://<your-app-name>.azurewebsites.net`
2. Check **Log stream** in Azure Portal for real-time logs
3. Use **Diagnose and solve problems** for troubleshooting

---

## Troubleshooting

### Build Fails / Dependencies Not Installed

Ensure `SCM_DO_BUILD_DURING_DEPLOYMENT` is set to `true` in Application settings.

### Application Won't Start

- Check the **Log stream** for errors
- Verify the startup command is correct
- Ensure all required environment variables are configured

### Deployment Timeout

For large applications:
1. Go to **Configuration** → **Application settings**
2. Add `SCM_COMMAND_IDLE_TIMEOUT` with value `3600` (seconds)

### Node Version Issues

Specify the Node.js version:
1. Go to **Configuration** → **Application settings**
2. Add `WEBSITE_NODE_DEFAULT_VERSION` with your desired version (e.g., `24-lts`)

