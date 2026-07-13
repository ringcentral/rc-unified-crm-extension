const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('../src/app');

const templateRoot = path.resolve(__dirname, '..', '..');

describe('Server', () => {
  describe('GET /is-alive', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/is-alive')
        .expect(200);
      expect(response.text).toBe('OK');
    });
  });

  describe('compiled entry point', () => {
    it('points production startup and package main at the emitted JavaScript file', () => {
      const packageJson = require(path.join(templateRoot, 'package.json'));

      expect(packageJson.main).toBe('dist/src/server.js');
      expect(packageJson.scripts.prod).toContain('node dist/src/server.js');
      expect(packageJson.scripts.prod).not.toContain('server.ts');
      expect(fs.existsSync(path.join(templateRoot, packageJson.main))).toBe(true);
    });

    it('starts the emitted JavaScript entry point', async () => {
      const serverPath = path.join(templateRoot, 'dist', 'src', 'server.js');
      const child = spawn(process.execPath, [serverPath], {
        cwd: templateRoot,
        env: {
          ...process.env,
          APP_HOST: '127.0.0.1',
          DATABASE_URL: 'sqlite::memory:',
          DISABLE_SYNC_DB_TABLE: 'true',
          IS_PROD: 'true',
          PORT: '0',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      await new Promise<void>((resolve, reject) => {
        let output = '';
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          child.kill();
          error ? reject(error) : resolve();
        };
        const timeout = setTimeout(() => {
          finish(new Error(`Template server did not start. Output:\n${output}`));
        }, 8000);

        child.stdout.on('data', (chunk) => {
          output += chunk.toString();
          if (output.includes('server running at:')) {
            finish();
          }
        });
        child.stderr.on('data', (chunk) => {
          output += chunk.toString();
        });
        child.on('error', finish);
        child.on('exit', (code) => {
          if (!settled) {
            finish(new Error(`Template server exited with code ${code}. Output:\n${output}`));
          }
        });
      });
    });
  });
});
