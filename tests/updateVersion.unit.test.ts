const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  OPENAPI_FILES_TO_UPDATE,
  METADATA_FILE_TO_UPDATE,
  updateOpenApiVersion,
  updateMetadataExampleVersion,
} = require('../scripts/updateVersion');

describe('updateVersion script', () => {
  let tempDirectory = '';

  beforeEach(() => {
    tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'app-connect-version-'));
  });

  afterEach(() => {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  });

  test('includes every versioned OpenAPI and metadata source', () => {
    expect(OPENAPI_FILES_TO_UPDATE.map((file) => file.path)).toEqual([
      'docs/developers/crm-server-openapi.json',
      'docs/developers/crm-server-openapi-public.json',
      'docs/developers/plugin-server-openapi.json',
    ]);
    expect(METADATA_FILE_TO_UPDATE.path).toBe('packages/core/contracts/metadata.ts');
  });

  test('updates matching OpenAPI versions without changing unrelated values', () => {
    const filePath = path.join(tempDirectory, 'openapi.json');
    fs.writeFileSync(filePath, JSON.stringify({
      openapi: '3.0.3',
      info: { version: '1.0.0' },
      example: { version: '1.0.0' },
      unrelated: { version: 'keep-me' },
    }));

    expect(updateOpenApiVersion(filePath, '1.1.0', 'Test OpenAPI')).toBe(true);
    const updated = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(updated.info.version).toBe('1.1.0');
    expect(updated.example.version).toBe('1.1.0');
    expect(updated.unrelated.version).toBe('keep-me');
  });

  test('updates the server version metadata example', () => {
    const filePath = path.join(tempDirectory, 'metadata.ts');
    fs.writeFileSync(filePath, [
      'export const serverVersionInfoResponseExample = {',
      "  version: '1.0.0',",
      '};',
      '',
    ].join('\n'));

    expect(updateMetadataExampleVersion(filePath, '1.1.0', 'Test metadata')).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toContain("version: '1.1.0'");
  });
});

export {};