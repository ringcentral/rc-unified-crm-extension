const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function detectPackageManager(cwd: string) {
  const has = (file) => fs.existsSync(path.join(cwd, file));
  if (has('bun.lockb')) return 'bun';
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('package-lock.json')) return 'npm';
  return 'npm';
}

function buildInstallCommand(manager: string, isDev: boolean) {
  const pkg = '@app-connect/core@latest';
  switch (manager) {
    case 'pnpm':
      return { cmd: 'pnpm', args: ['add', isDev ? '-D' : '', pkg].filter(Boolean) };
    case 'yarn':
      return { cmd: 'yarn', args: ['add', isDev ? '-D' : '', pkg].filter(Boolean) };
    case 'bun':
      return { cmd: 'bun', args: ['add', isDev ? '-d' : '', pkg].filter(Boolean) };
    case 'npm':
    default:
      return { cmd: 'npm', args: ['install', isDev ? '-D' : '', pkg].filter(Boolean) };
  }
}

function run(cmd: string, args: string[], options: any = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function upgrade(options: { dev?: boolean } = {}) {
  const cwd = process.cwd();
  const packageJsonPath = path.join(cwd, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('No package.json found in current directory. Run this in your project root.');
  }

  const isDev = Boolean(options.dev);
  const manager = detectPackageManager(cwd);
  const { cmd, args } = buildInstallCommand(manager, isDev);

  console.log(`Upgrading @app-connect/core to latest using ${manager}...`);
  await run(cmd, args, { cwd });
  console.log('✅ @app-connect/core upgraded to latest.');
}

module.exports = { upgrade };


