const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const testRoot = path.resolve(__dirname, '..');
const PROJECT_ROOT = path.basename(testRoot) === '.ts-build'
  ? path.resolve(testRoot, '..')
  : testRoot;
const BUILD_ROOT = path.join(PROJECT_ROOT, '.ts-build');

let tempRoot = '';
let artifactRoot = '';

function copy(source: string, destination: string) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true });
}

function validateArtifactInChildProcess() {
  const fs = require('fs');
  const path = require('path');
  const { createRequire } = require('module');
  const artifactRoot = process.argv[1];

  function jsFilesUnder(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return jsFilesUnder(filePath);
      }
      return entry.name.endsWith('.js') ? [filePath] : [];
    });
  }

  const importers = ['index.js', 'lambda.js', 'server.js', 'dbAccessor.js']
    .map((name) => path.join(artifactRoot, name))
    .concat(
      jsFilesUnder(path.join(artifactRoot, 'connectors')),
      jsFilesUnder(path.join(artifactRoot, 'plugins'))
    );
  const failures = [];
  const requirePattern = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g;

  for (const importer of importers) {
    const source = fs.readFileSync(importer, 'utf8');
    for (const match of source.matchAll(requirePattern)) {
      const specifier = match[2];
      const isCoreImport = specifier === '@app-connect/core'
        || specifier.startsWith('@app-connect/core/');
      if (!specifier.startsWith('.') && !isCoreImport) {
        continue;
      }

      try {
        const resolved = createRequire(importer).resolve(specifier);
        const relative = path.relative(artifactRoot, resolved);
        const escapedArtifact = relative === '..'
          || relative.startsWith(`..${path.sep}`)
          || path.isAbsolute(relative);
        if (escapedArtifact) {
          failures.push({
            importer: path.relative(artifactRoot, importer),
            specifier,
            reason: `escaped artifact: ${resolved}`
          });
        }
      } catch (error) {
        failures.push({
          importer: path.relative(artifactRoot, importer),
          specifier,
          reason: error.code || error.message
        });
      }
    }
  }

  process.stdout.write(JSON.stringify(failures));
}

describe('flattened serverless artifact imports', () => {
  beforeAll(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'app-connect-lambda-'));
    artifactRoot = path.join(tempRoot, 'var', 'task');
    fs.mkdirSync(artifactRoot, { recursive: true });

    for (const name of ['index.js', 'lambda.js', 'server.js', 'dbAccessor.js', 'releaseNotes.json']) {
      copy(path.join(BUILD_ROOT, 'src', name), path.join(artifactRoot, name));
    }
    for (const name of ['connectors', 'plugins']) {
      copy(path.join(BUILD_ROOT, 'src', name), path.join(artifactRoot, name));
    }

    const compiledCore = path.join(BUILD_ROOT, 'packages', 'core');
    copy(compiledCore, path.join(artifactRoot, 'packages', 'core'));
    // Model npm workspaces without relying on platform-specific symlinks.
    copy(compiledCore, path.join(artifactRoot, 'node_modules', '@app-connect', 'core'));
  });

  afterAll(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('every app-owned import resolves inside the Lambda task root', () => {
    const validatorSource = `(${validateArtifactInChildProcess.toString()})()`;
    const result = spawnSync(process.execPath, ['-e', validatorSource, artifactRoot], {
      encoding: 'utf8'
    });

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const failures = JSON.parse(result.stdout);
    expect(failures).toEqual([]);
  });
});

export {};
