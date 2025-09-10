const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function detectPackageManager(cwd) {
  const has = (file) => fs.existsSync(path.join(cwd, file));
  if (has('bun.lockb')) return 'bun';
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('package-lock.json')) return 'npm';
  return 'npm';
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

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function start(portArg, _options = {}) {
  const cwd = process.cwd();
  const packageJsonPath = path.join(cwd, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('No package.json found in current directory. Run this in your project root.');
  }

  let port = undefined;
  if (typeof portArg !== 'undefined' && portArg !== null && String(portArg).trim() !== '') {
    const parsed = Number(portArg);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Invalid port: ${portArg}`);
    }
    port = String(Math.floor(parsed));
  }

  const manager = detectPackageManager(cwd);
  const { cmd, args } = buildDevCommand(manager);

  const env = { ...process.env };
  if (port) env.PORT = port;

  console.log(`Starting dev server using ${manager}${port ? ` on port ${port}` : ''}...`);
  await run(cmd, args, { cwd, env });
}

module.exports = { start };


