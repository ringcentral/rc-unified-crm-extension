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

async function downloadTemplate(projectName, options) {
  const templateName = options.template || 'default';
  const templatePath = getTemplatePath(templateName);
  let projectDir = projectName || 'my-app-connect-project';
  let fullPath = path.resolve(projectDir);
  let cleanOnError = true;

  if (templateName === 'plugin') {
    const pluginFolderName = options.pluginName || 'plugin-template';
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

  console.log('Step 1/3: Downloading template from GitHub...');

  try {
    await downloadFile(archiveUrl, tempArchivePath);

    console.log('Step 2/3: Extracting template files...');
    await extract({
      file: tempArchivePath,
      cwd: fullPath
    });

    const extractedDir = path.join(fullPath, `rc-unified-crm-extension-${TEMPLATE_BRANCH}`, templatePath);
    const files = fs.readdirSync(extractedDir);

    console.log('Step 3/3: Installing template files...');
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

    if (templateName === 'plugin' && fs.existsSync(packageJsonPath) && options.pluginName) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const normalizedPluginName = options.pluginName.replace(/\s+/g, '-');
      packageJson.name = `@app-connect/${normalizedPluginName}`;
      packageJson.version = '0.0.1';
      packageJson.description = `RingCentral App Connect plugin template: ${normalizedPluginName}`;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    const appJsPath = path.join(fullPath, 'src', 'app.js');
    if (templateName === 'default' && fs.existsSync(appJsPath) && projectName) {
      const appJs = fs.readFileSync(appJsPath, 'utf8');
      const updatedAppJs = appJs.replace('\'myCRM\'', `'${projectName}'`);
      fs.writeFileSync(appJsPath, updatedAppJs);
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
      console.log('  # import registerPluginRoutes from src/plugin/<plugin-name>/src/pluginApp.js');
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

    const makeRequest = (requestUrl) => {
      https.get(requestUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const location = response.headers.location;
          if (location) {
            console.log(`Following redirect to: ${location}`);
            makeRequest(location);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
          return;
        }

        pipeline(response, file)
          .then(() => resolve())
          .catch(reject);
      }).on('error', reject);
    };

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
      console.log(`  cd ${workDir}`);
      console.log(`  # plugin template added at: ${fullPath}`);
      console.log('  # import registerPluginRoutes from src/plugin/<plugin-name>/src/pluginApp.js');
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
    pluginName: derivedOptions.pluginName
  };

  return init(connectorPath, normalizedOptions);
}

module.exports = { init, addPlugin };
