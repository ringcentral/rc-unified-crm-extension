const { randomBytes } = require('crypto');
const mockSend = jest.fn().mockResolvedValue({});
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  HeadBucketCommand: class { constructor(public input: any) {} },
  CreateBucketCommand: class { constructor(public input: any) {} },
  PutObjectCommand: class { constructor(public input: any) {} },
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/upload') }));

const { S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const keys = ['ERROR_REPORT_S3_LOCAL', 'ERROR_REPORT_S3_BUCKET', 'LOCALSTACK_ENDPOINT', 'MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD'];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const credentials = { MINIO_ROOT_USER: randomBytes(8).toString('hex'), MINIO_ROOT_PASSWORD: randomBytes(24).toString('hex') };

function loadReport(environment: Record<string, string> = {}) {
  Object.assign(process.env, environment);
  let report;
  jest.isolateModules(() => { report = require('../../lib/s3ErrorLogReport'); });
  return report;
}

describe('explicit error-report storage configuration', () => {
  beforeEach(() => { keys.forEach(key => delete process.env[key]); jest.clearAllMocks(); });
  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  test('leaves optional storage uninitialized at import and fails clearly on use', async () => {
    const report = loadReport();
    expect(S3Client).not.toHaveBeenCalled();
    await expect(report.getUploadUrl({ userId: 'user', platform: 'crm' })).rejects.toThrow('ERROR_REPORT_S3_BUCKET');
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  test.each([{}, { MINIO_ROOT_USER: credentials.MINIO_ROOT_USER }, { MINIO_ROOT_PASSWORD: credentials.MINIO_ROOT_PASSWORD }])
    ('rejects local mode without both credentials: %p', async (partial) => {
      const report = loadReport({ ERROR_REPORT_S3_LOCAL: 'true', ...partial });
      await expect(report.getUploadUrl({ userId: 'user', platform: 'crm' })).rejects.toThrow('MINIO_ROOT_');
      expect(S3Client).not.toHaveBeenCalled();
    });

  test('rejects an ambiguous local-mode flag', async () => {
    const report = loadReport({ ERROR_REPORT_S3_LOCAL: 'yes', ERROR_REPORT_S3_BUCKET: 'cloud-bucket' });
    await expect(report.getUploadUrl({ userId: 'user', platform: 'crm' })).rejects.toThrow('ERROR_REPORT_S3_LOCAL');
  });

  test('supports an explicit local endpoint and custom bucket using MinIO environment credentials', async () => {
    const report = loadReport({ ERROR_REPORT_S3_LOCAL: 'true', ERROR_REPORT_S3_BUCKET: 'local-bucket', LOCALSTACK_ENDPOINT: 'http://minio:9000', ...credentials });
    await expect(report.getUploadUrl({ userId: 'user', platform: 'crm' })).resolves.toBe('https://signed.example/upload');
    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: 'http://minio:9000', forcePathStyle: true,
      credentials: { accessKeyId: credentials.MINIO_ROOT_USER, secretAccessKey: credentials.MINIO_ROOT_PASSWORD },
    }));
    expect(getSignedUrl.mock.calls[0][1].input.Bucket).toBe('local-bucket');
    expect(getSignedUrl.mock.calls[0][2]).toEqual({ expiresIn: 300 });
  });

  test('retains the default local endpoint and bucket after explicit opt-in', async () => {
    const report = loadReport({ ERROR_REPORT_S3_LOCAL: 'true', ...credentials });
    await report.getUploadUrl({ userId: 'user', platform: 'crm' });
    expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'http://localhost:9001' }));
    expect(getSignedUrl.mock.calls[0][1].input.Bucket).toBe('error-reports-bucket');
  });

  test('keeps cloud credentials and endpoints on the AWS provider chain', async () => {
    const report = loadReport({ ERROR_REPORT_S3_LOCAL: 'false', ERROR_REPORT_S3_BUCKET: 'cloud-bucket', LOCALSTACK_ENDPOINT: 'http://minio:9000', ...credentials });
    await report.getUploadUrl({ userId: 'user', platform: 'crm' });
    expect(S3Client.mock.calls[0][0]).not.toHaveProperty('credentials');
    expect(S3Client.mock.calls[0][0]).not.toHaveProperty('endpoint');
    expect(mockSend).not.toHaveBeenCalled();
    expect(getSignedUrl.mock.calls[0][1].input.Bucket).toBe('cloud-bucket');
  });
});

export {};
