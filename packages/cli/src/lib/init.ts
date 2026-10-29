const fs = require('fs');
const path = require('path');
const https = require('https');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { extract } = require('tar');
const { spawn } = require('child_process');
const { ask, isInteractive } = require('./prompt');

const TEMPLATE_REPO = 'https://github.com/ringcentral/rc-unified-crm-extension';
const TEMPLATE_BRANCH = 'main';
const TEMPLATE_PATHS = {
  default: 'packages/template',
  plugin: 'packages/plugin-template'
};

function detectPackageManager(cwd: string) {
  const has = (file) => fs.existsSync(path.join(cwd, file));
  if (has('bun.lockb')) return 'bun';
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('package-lock.json')) return 'npm';
  return 'npm';
}

function run(cmd: string, args: string[], options: any = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

function buildInstallCommand(manager: string) {
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

function buildDevCommand(manager: string) {
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

const CONNECTOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function validateConnectorId(value: string): string | null {
  if (!value) return 'The unique identifier cannot be empty.';
  if (!CONNECTOR_ID_PATTERN.test(value)) {
    return 'Use only letters, numbers, ".", "_" and "-" (copy it from the Developer Console, e.g. ringcentral_labs.zendesk).';
  }
  return null;
}

function toSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '') || 'my-app-connect-project';
}

/**
 * The key passed to connectorRegistry.registerConnector() must equal the complete
 * Unique Identifier shown in the Developer Console (including its namespace).
 */
async function resolveConnectorId(options: any): Promise<string | undefined> {
  if (options.id) {
    const error = validateConnectorId(options.id);
    if (error) throw new Error(error);
    return options.id;
  }
  if (!isInteractive()) {
    console.log('\nNo --id provided and this is not an interactive terminal; leaving the placeholder "myCRM" in src/app.ts.');
    console.log('Replace it with the Unique Identifier from the Developer Console before starting the server.');
    return undefined;
  }
  console.log('\nOpen your connector in the Developer Console and copy its complete Unique Identifier');
  console.log('(including any namespace prefix, e.g. ringcentral_labs.zendesk).\n');
  return ask('Connector unique identifier', validateConnectorId);
}

function getTemplatePath(templateName = 'default') {
  const templatePath = TEMPLATE_PATHS[templateName];
  if (!templatePath) {
    throw new Error(`Unsupported template "${templateName}". Supported templates: ${Object.keys(TEMPLATE_PATHS).join(', ')}`);
  }
  return templatePath;
}

async function downloadTemplate(projectName: string | undefined, options: any, connectorId?: string) {
  const projectDir = projectName || 'my-app-connect-project';
  const fullPath = path.resolve(projectDir);
  const templateName = options.template || 'default';
  const templatePath = getTemplatePath(templateName);

  if (fs.existsSync(fullPath)) {
    if (!options.force) {
      throw new Error(`Directory ${projectDir} already exists. Use --force to overwrite.`);
    }
    console.log(`Removing existing directory: ${projectDir}`);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }

  console.log(`Creating new RingCentral App Connect project: ${projectDir}`);
  console.log(`Using template: ${templateName}`);

  fs.mkdirSync(fullPath, { recursive: true });

  const archiveUrl = `${TEMPLATE_REPO}/archive/refs/heads/${TEMPLATE_BRANCH}.tar.gz`;
  const tempArchivePath = path.join(fullPath, 'template.tar.gz');

  console.log('Downloading template from GitHub...');

  try {
    await downloadFile(archiveUrl, tempArchivePath);

    console.log('Extracting template files...');
    await extract({
      file: tempArchivePath,
      cwd: fullPath
    });

    const extractedDir = path.join(fullPath, `rc-unified-crm-extension-${TEMPLATE_BRANCH}`, templatePath);
    const files = fs.readdirSync(extractedDir);

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
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      packageJson.name = toSlug(path.basename(fullPath));
      packageJson.version = '0.0.1';
      packageJson.description = `RingCentral App Connect project: ${projectName || 'my-app-connect-project'}`;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    const appTsPath = path.join(fullPath, 'src', 'app.ts');
    if (templateName === 'default' && connectorId) {
      if (!fs.existsSync(appTsPath)) {
        throw new Error('src/app.ts not found in the template; cannot set the connector identifier.');
      }
      const appTs = fs.readFileSync(appTsPath, 'utf8');
      const registration = /registerConnector\(\s*'myCRM'/;
      if (!registration.test(appTs)) {
        throw new Error('Could not find registerConnector(\'myCRM\', ...) in src/app.ts; set the connector identifier manually.');
      }
      fs.writeFileSync(appTsPath, appTs.replace(registration, `registerConnector('${connectorId}'`));
      console.log(`Registered connector as '${connectorId}' in src/app.ts`);
    }

    console.log('\nProject created successfully!');
    const docsUrl = templateName === 'plugin'
      ? 'https://ringcentral.github.io/rc-unified-crm-extension/developers/plugins/getting-started/'
      : 'https://ringcentral.github.io/rc-unified-crm-extension/developers/getting-started/';
    console.log(`\nDocumentation: ${docsUrl}`);

    return { fullPath, projectDir, templateName };
  } catch (error) {
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    throw error;
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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

async function init(projectName: string | undefined, options: any) {
  try {
    const templateName = options.template || 'default';
    getTemplatePath(templateName);

    let connectorId: string | undefined;
    if (templateName === 'default') {
      connectorId = await resolveConnectorId(options);
      if (!projectName && isInteractive()) {
        projectName = await ask('Project directory', undefined, toSlug(connectorId.split('.').pop()));
      }
    }

    const { fullPath, projectDir } = await downloadTemplate(projectName, options, connectorId);

    const runInCwd = async (cmd, args) => run(cmd, args, { cwd: fullPath });
    const manager = detectPackageManager(fullPath);

    if (options.install) {
      console.log(`\nInstalling dependencies using ${manager}...`);
      const { cmd, args } = buildInstallCommand(manager);
      await runInCwd(cmd, args);
      console.log('Dependencies installed');
    }

    if (options.env) {
      const envSrc = path.join(fullPath, '.env.test');
      const envDest = path.join(fullPath, '.env');
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

    if (options.start) {
      console.log('\nStarting development server...');
      const { cmd, args } = buildDevCommand(manager);
      await runInCwd(cmd, args);
      return;
    }

    const quotedDir = /\s/.test(projectDir) ? `"${projectDir}"` : projectDir;
    console.log('\nDone. Next:');
    console.log(`  cd ${quotedDir}`);
    if (!options.install) console.log('  npm install');
    console.log('  npx @app-connect/cli env   # set the secret key (and server URL) from the Developer Console');
    console.log('  npm run dev');
  } catch (error) {
    throw new Error(`Failed to initialize project: ${error.message}`);
  }
}

module.exports = { init };
