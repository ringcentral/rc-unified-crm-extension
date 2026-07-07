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

function getTemplatePath(templateName = 'default') {
  const templatePath = TEMPLATE_PATHS[templateName];
  if (!templatePath) {
    throw new Error(`Unsupported template "${templateName}". Supported templates: ${Object.keys(TEMPLATE_PATHS).join(', ')}`);
  }
  return templatePath;
}

async function downloadTemplate(projectName: string | undefined, options: any) {
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
      packageJson.name = (projectName || 'my-app-connect-project').replace(/\s+/g, '-');
      packageJson.version = '0.0.1';
      packageJson.description = `RingCentral App Connect project: ${projectName || 'my-app-connect-project'}`;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    const appTsPath = path.join(fullPath, 'src', 'app.ts');
    if (templateName === 'default' && fs.existsSync(appTsPath) && projectName) {
      const appTs = fs.readFileSync(appTsPath, 'utf8');
      const updatedAppTs = appTs.replace('\'myCRM\'', `'${projectName}'`);
      fs.writeFileSync(appTsPath, updatedAppTs);
    }

    console.log('\nProject created successfully!');
    console.log('\nNext steps:');
    console.log(`  cd ${projectDir}`);
    console.log('  npm install');
    if (templateName === 'default') {
      console.log('  cp .env.test .env  # Configure your environment');
    }
    console.log('  npm run dev        # Start development server');

    const docsUrl = templateName === 'plugin'
      ? 'https://ringcentral.github.io/rc-unified-crm-extension/developers/plugins/'
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
    const { fullPath, projectDir, templateName } = await downloadTemplate(projectName, options);

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

    console.log('\nDone. Next:');
    console.log(`  cd ${projectDir}`);
    if (!options.install) console.log('  npm install');
    if (!options.env && templateName === 'default') console.log('  cp .env.test .env');
    console.log('  npm run dev');
  } catch (error) {
    throw new Error(`Failed to initialize project: ${error.message}`);
  }
}

module.exports = { init };
