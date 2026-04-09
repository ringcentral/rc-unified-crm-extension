const fs = require('fs');
const path = require('path');
const https = require('https');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { extract } = require('tar');
const { spawn } = require('child_process');

const TEMPLATE_REPO = 'https://github.com/ringcentral/rc-unified-crm-extension';
const TEMPLATE_BRANCH = 'main';
const TEMPLATE_PATHS = {
  default: 'packages/template',
  plugin: 'packages/plugin-template'
};
const PLUGIN_ID_HELP = 'go to plugin profile on developer portal and the url will look like https://appconnect.labs.ringcentral.com/console#/app/plugins/{pluginId}/overview. Use the pluginId to fill in existing .env file under src folder as SYNC_PLUGIN_ID and ASYNC_PLUGIN_ID';

function isConnectorProject(dirPath) {
  const packageJsonPath = path.join(dirPath, 'package.json');
  const appJsPath = path.join(dirPath, 'src', 'app.js');
  const connectorsDir = path.join(dirPath, 'src', 'connectors');
  if (!fs.existsSync(packageJsonPath) || !fs.existsSync(appJsPath) || !fs.existsSync(connectorsDir)) {
    return false;
  }
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    return Boolean(deps['@app-connect/core'] || devDeps['@app-connect/core']);
  } catch {
    return false;
  }
}

function detectPackageManager(cwd) {
  const has = (file) => fs.existsSync(path.join(cwd, file));
  if (has('bun.lockb')) return 'bun';
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('package-lock.json')) return 'npm';
  return 'npm';
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function buildInstallCommand(manager) {
  switch (manager) {
    case 'pnpm':
      return { cmd: 'pnpm', args: ['install'] };
    case 'yarn':
      return { cmd: 'yarn', args: ['install'] };
    case 'bun':
      return { cmd: 'bun', args: ['install'] };
    case 'npm':
    default:
      return { cmd: 'npm', args: ['install'] };
  }
}

function buildDevCommand(manager) {
  switch (manager) {
    case 'pnpm':
      return { cmd: 'pnpm', args: ['dev'] };
    case 'yarn':
      return { cmd: 'yarn', args: ['dev'] };
    case 'bun':
      return { cmd: 'bun', args: ['run', 'dev'] };
    case 'npm':
    default:
      return { cmd: 'npm', args: ['run', 'dev'] };
  }
}

function getTemplatePath(templateName = 'default') {
  const templatePath = TEMPLATE_PATHS[templateName];
  if (!templatePath) {
    throw new Error(`Unsupported template "${templateName}". Supported templates: ${Object.keys(TEMPLATE_PATHS).join(', ')}`);
  }
  return templatePath;
}

function toIdentifier(name) {
  const words = (name || '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return 'Plugin';
  }
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function upsertEnvVar(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) {
    return content.replace(re, line);
  }
  const endsWithNewline = content.length === 0 || content.endsWith('\n');
  return `${content}${endsWithNewline ? '' : '\n'}${line}\n`;
}

function wirePluginRoutesInAppJs({ connectorRoot, pluginName }) {
  const appJsPath = path.join(connectorRoot, 'src', 'app.js');
  if (!fs.existsSync(appJsPath)) {
    throw new Error(`Connector src/app.js not found at ${appJsPath}`);
  }

  const pluginFn = `register${toIdentifier(pluginName)}PluginRoutes`;
  const requireLine = `const { registerPluginRoutes: ${pluginFn} } = require('./plugin/${pluginName}/src/pluginApp');`;
  const registerLine = `${pluginFn}(app);`;
  let appJs = fs.readFileSync(appJsPath, 'utf8');

  if (!appJs.includes(requireLine)) {
    const createCoreAppMarker = 'const app = createCoreApp();';
    const idx = appJs.indexOf(createCoreAppMarker);
    if (idx >= 0) {
      appJs = `${appJs.slice(0, idx)}${requireLine}\n${appJs.slice(idx)}`;
    } else {
      appJs = `${requireLine}\n${appJs}`;
    }
  }

  if (!appJs.includes(registerLine)) {
    const createCoreAppMarker = 'const app = createCoreApp();';
    const idx = appJs.indexOf(createCoreAppMarker);
    if (idx >= 0) {
      const insertAt = idx + createCoreAppMarker.length;
      appJs = `${appJs.slice(0, insertAt)}\n${registerLine}${appJs.slice(insertAt)}`;
    } else {
      appJs = `${appJs}\n${registerLine}\n`;
    }
  }

  fs.writeFileSync(appJsPath, appJs);
}

function updatePluginIdsInEnv({ connectorRoot, pluginId }) {
  const envPath = path.join(connectorRoot, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing .env at ${envPath}. ${PLUGIN_ID_HELP}`);
  }
  let envText = fs.readFileSync(envPath, 'utf8');
  envText += '\n#plugin\n';
  envText = upsertEnvVar(envText, 'SYNC_PLUGIN_ID', pluginId);
  envText = upsertEnvVar(envText, 'ASYNC_PLUGIN_ID', pluginId);
  fs.writeFileSync(envPath, envText);
}

async function downloadTemplate(projectName, options) {
  const templateName = options.template || 'default';
  const templatePath = getTemplatePath(templateName);
  let projectDir = projectName || 'my-app-connect-project';
  let fullPath = path.resolve(projectDir);
  let cleanOnError = true;

  if (templateName === 'plugin') {
    const pluginFolderName = options.pluginName || 'plugin-template';
    if (!options.pluginId) {
      throw new Error(`Plugin id is required. ${PLUGIN_ID_HELP}`);
    }
    const connectorRoot = path.resolve(projectName || process.cwd());
    if (!fs.existsSync(connectorRoot)) {
      throw new Error(`Connector project directory not found: ${connectorRoot}`);
    }
    if (!isConnectorProject(connectorRoot)) {
      throw new Error(`Connector project not detected at ${connectorRoot}. Install the connector template first.`);
    }
    projectDir = path.relative(process.cwd(), connectorRoot) || '.';
    fullPath = path.join(connectorRoot, 'src', 'plugin', pluginFolderName);
    cleanOnError = false;

    if (fs.existsSync(fullPath)) {
      if (!options.force) {
        throw new Error(`Plugin template already exists at ${fullPath}. Use --force to overwrite.`);
      }
      console.log(`Removing existing plugin template: ${fullPath}`);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  } else if (fs.existsSync(fullPath)) {
    if (!options.force) {
      throw new Error(`Directory ${projectDir} already exists. Use --force to overwrite.`);
    }
    console.log(`Removing existing directory: ${projectDir}`);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }

  if (templateName === 'plugin') {
    console.log(`Installing plugin template into connector project: ${projectDir}`);
  } else {
    console.log(`Creating new RingCentral App Connect project: ${projectDir}`);
  }
  console.log(`Using template: ${templateName}`);

  fs.mkdirSync(fullPath, { recursive: true });

  const archiveUrl = `${TEMPLATE_REPO}/archive/refs/heads/${TEMPLATE_BRANCH}.tar.gz`;
  const tempArchivePath = path.join(fullPath, 'template.tar.gz');

  console.log('Step 1/5: Downloading template from GitHub...');

  try {
    await downloadFile(archiveUrl, tempArchivePath);

    console.log('Step 2/5: Extracting template files...');
    await extract({
      file: tempArchivePath,
      cwd: fullPath
    });

    const extractedDir = path.join(fullPath, `rc-unified-crm-extension-${TEMPLATE_BRANCH}`, templatePath);
    const files = fs.readdirSync(extractedDir);

    console.log('Step 3/5: Installing template files...');
    for (const file of files) {
      const sourcePath = path.join(extractedDir, file);
      const targetPath = path.join(fullPath, file);

      if (fs.statSync(sourcePath).isDirectory()) {
        fs.cpSync(sourcePath, targetPath, { recursive: true });
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }

    fs.rmSync(path.join(fullPath, `rc-unified-crm-extension-${TEMPLATE_BRANCH}`), { recursive: true, force: true });
    fs.unlinkSync(tempArchivePath);

    const packageJsonPath = path.join(fullPath, 'package.json');
    if (templateName === 'default' && fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      packageJson.name = (projectName || 'my-app-connect-project').replace(/\s+/g, '-');
      packageJson.version = '0.0.1';
      packageJson.description = `RingCentral App Connect project: ${projectName || 'my-app-connect-project'}`;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    const appJsPath = path.join(fullPath, 'src', 'app.js');
    if (templateName === 'default' && fs.existsSync(appJsPath) && projectName) {
      const appJs = fs.readFileSync(appJsPath, 'utf8');
      const updatedAppJs = appJs.replace('\'myCRM\'', `'${projectName}'`);
      fs.writeFileSync(appJsPath, updatedAppJs);
    }

    if (templateName === 'plugin') {
      const connectorRoot = path.resolve(projectName || process.cwd());
      console.log('Step 4/5: Wiring plugin routes into connector src/app.js...');
      wirePluginRoutesInAppJs({ connectorRoot, pluginName: options.pluginName });
      console.log('Step 5/5: Updating src/.env plugin ids...');
      updatePluginIdsInEnv({ connectorRoot, pluginId: options.pluginId });
    }

    if (templateName === 'plugin') {
      console.log('\nPlugin template installed successfully!');
    } else {
      console.log('\nProject created successfully!');
    }
    console.log('\nNext steps:');
    if (templateName === 'plugin') {
      const connectorRoot = path.resolve(projectName || process.cwd());
      console.log(`  cd ${connectorRoot}`);
      console.log(`  # plugin template added at: ${fullPath}`);
      console.log('  # registerPluginRoutes has been added to connector src/app.js');
      console.log('  # SYNC_PLUGIN_ID and ASYNC_PLUGIN_ID have been set in src/.env');
      console.log('  # restart your existing connector dev server');
    } else {
      console.log(`  cd ${projectDir}`);
      console.log('  npm install');
      console.log('  cp .env.test .env  # Configure your environment');
      console.log('  npm run dev        # Start development server');
    }

    const docsUrl = templateName === 'plugin'
      ? 'https://ringcentral.github.io/rc-unified-crm-extension/developers/plugins/'
      : 'https://ringcentral.github.io/rc-unified-crm-extension/developers/getting-started/';
    console.log(`\nDocumentation: ${docsUrl}`);

    return { fullPath, projectDir, templateName };
  } catch (error) {
    if (cleanOnError && fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    throw error;
  }
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      try {
        file.destroy();
      } catch { }
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const makeRequest = (requestUrl) => {
      https.get(requestUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const location = response.headers.location;
          response.resume();
          if (location) {
            console.log(`Following redirect to: ${location}`);
            makeRequest(location);
            return;
          }
          fail(new Error('Redirect response did not include a location header'));
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          fail(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
          return;
        }

        pipeline(response, file)
          .then(() => succeed())
          .catch(fail);
      }).on('error', fail);
    };

    file.on('error', fail);
    makeRequest(url);
  });
}

async function init(projectName, options) {
  try {
    const { fullPath, projectDir, templateName } = await downloadTemplate(projectName, options);
    const workDir = templateName === 'plugin' ? path.resolve(projectName || process.cwd()) : fullPath;

    const runInCwd = async (cmd, args) => run(cmd, args, { cwd: workDir });
    const manager = detectPackageManager(workDir);

    if (templateName !== 'plugin' && options.install) {
      console.log(`\nInstalling dependencies using ${manager}...`);
      const { cmd, args } = buildInstallCommand(manager);
      await runInCwd(cmd, args);
      console.log('Dependencies installed');
    }

    if (templateName !== 'plugin' && options.env) {
      const envSrc = path.join(workDir, '.env.test');
      const envDest = path.join(workDir, '.env');
      if (fs.existsSync(envSrc)) {
        if (!fs.existsSync(envDest)) {
          fs.copyFileSync(envSrc, envDest);
          console.log('Copied .env.test to .env');
        } else {
          console.log('.env already exists, skipping copy');
        }
      } else {
        console.log('.env.test not found, skipping env setup');
      }
    }

    if (templateName !== 'plugin' && options.start) {
      console.log('\nStarting development server...');
      const { cmd, args } = buildDevCommand(manager);
      await runInCwd(cmd, args);
      return;
    }

    console.log('\nDone. Next:');
    if (templateName === 'plugin') {
      console.log(`  # plugin template added at: ${fullPath}`);
      console.log('  # restart your existing connector dev server');
    } else {
      console.log(`  cd ${projectDir}`);
      if (!options.install) console.log('  npm install');
      if (!options.env && templateName === 'default') console.log('  cp .env.test .env');
      console.log('  npm run dev');
    }
  } catch (error) {
    throw new Error(`Failed to initialize project: ${error.message}`);
  }
}

async function addPlugin(pluginName, options = {}) {
  if (!pluginName) {
    throw new Error('Plugin name is required. Example: appconnect add-plugin my-plugin');
  }
  if (!options.pluginId) {
    throw new Error(`Plugin id is required. ${PLUGIN_ID_HELP}`);
  }

  const connectorPath = options.path || process.cwd();
  const derivedOptions = {
    ...options,
    template: 'plugin',
    pluginName
  };

  const normalizedOptions = {
    force: !!derivedOptions.force,
    install: false,
    env: false,
    start: false,
    template: derivedOptions.template,
    pluginName: derivedOptions.pluginName,
    pluginId: derivedOptions.pluginId
  };

  return init(connectorPath, normalizedOptions);
}

module.exports = { init, addPlugin };
