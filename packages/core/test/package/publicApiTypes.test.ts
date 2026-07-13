const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findRepositoryRoot(startDirectory: string): string {
  let currentDirectory = startDirectory;
  while (currentDirectory !== path.dirname(currentDirectory)) {
    if (fs.existsSync(path.join(currentDirectory, 'tsconfig.base.json'))) {
      return currentDirectory;
    }
    currentDirectory = path.dirname(currentDirectory);
  }
  throw new Error(`Could not find repository root from ${startDirectory}`);
}

describe('@app-connect/core package declarations', () => {
  test('compile for a TypeScript consumer through the published package entry points', () => {
    const repositoryRoot = findRepositoryRoot(__dirname);
    const corePackageDirectory = path.join(repositoryRoot, 'packages', 'core');
    const tempDirectory = fs.mkdtempSync(path.join(repositoryRoot, '.tmp-core-types-'));
    const packageScopeDirectory = path.join(tempDirectory, 'node_modules', '@app-connect');
    const installedPackageDirectory = path.join(packageScopeDirectory, 'core');

    try {
      fs.mkdirSync(packageScopeDirectory, { recursive: true });
      fs.symlinkSync(
        corePackageDirectory,
        installedPackageDirectory,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      fs.writeFileSync(path.join(tempDirectory, 'consumer.ts'), `
        import {
          DebugTracer,
          connectorRegistry,
          createCoreApp,
          createCoreMiddleware,
          createCoreRouter,
          initializeCore,
          proxyConnector,
          type ConnectorRegistry,
          type CoreInitializationOptions,
        } from '@app-connect/core';
        import type {
          ConnectorImplementation,
          ConnectorManifest,
        } from '@app-connect/core/types';
        import type { ConnectorCapabilities } from '@app-connect/core/types/connector';

        const options: CoreInitializationOptions = {
          skipDatabaseInit: true,
          skipAnalyticsInit: true,
        };
        const app = createCoreApp(options);
        const router = createCoreRouter();
        const middleware = createCoreMiddleware();
        const initialization: Promise<void> = initializeCore(options);
        const registry: ConnectorRegistry = connectorRegistry;
        const manifest: ConnectorManifest = {};
        const connector: ConnectorImplementation = {
          createCallLog: async () => ({}),
          updateCallLog: async () => ({}),
        };
        registry.registerConnector('typescript-consumer', connector, manifest);
        const capabilities: Promise<ConnectorCapabilities> =
          registry.getConnectorCapabilities('typescript-consumer');
        const tracer = new DebugTracer();

        void app.use;
        void router.use;
        void middleware.length;
        void initialization;
        void capabilities;
        void tracer.getTraceData();
        void proxyConnector.createCallLog;
      `);

      const typescriptCompiler = require.resolve('typescript/bin/tsc', {
        paths: [repositoryRoot],
      });
      try {
        execFileSync(process.execPath, [
          typescriptCompiler,
          '--noEmit',
          '--strict',
          '--target',
          'ES2020',
          '--module',
          'Node16',
          '--moduleResolution',
          'Node16',
          path.join(tempDirectory, 'consumer.ts'),
        ], {
          cwd: tempDirectory,
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (error) {
        const compilerError = error as { stdout?: string; stderr?: string };
        throw new Error([
          'TypeScript consumer compilation failed.',
          compilerError.stdout,
          compilerError.stderr,
        ].filter(Boolean).join('\n'));
      }
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });
});

export {};
