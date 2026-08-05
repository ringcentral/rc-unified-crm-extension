const mockS3Send = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockShortIdGenerate = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  class HeadBucketCommand {
    input;
    commandName;

    constructor(input) {
      this.input = input;
      this.commandName = 'HeadBucketCommand';
    }
  }

  class CreateBucketCommand {
    input;
    commandName;

    constructor(input) {
      this.input = input;
      this.commandName = 'CreateBucketCommand';
    }
  }

  class PutObjectCommand {
    input;
    commandName;

    constructor(input) {
      this.input = input;
      this.commandName = 'PutObjectCommand';
    }
  }

  class GetObjectCommand {
    input;
    commandName;

    constructor(input) {
      this.input = input;
      this.commandName = 'GetObjectCommand';
    }
  }

  return {
    S3Client: jest.fn(() => ({
      send: mockS3Send,
    })),
    HeadBucketCommand,
    CreateBucketCommand,
    PutObjectCommand,
    GetObjectCommand,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

jest.mock('shortid', () => ({
  generate: mockShortIdGenerate,
}));

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const {
  ensureBucketExists,
  getUploadUrl,
} = require('../../lib/s3ErrorLogReport');
const tsS3ErrorLogReport = require('../../lib/s3ErrorLogReport.ts');

describe('s3ErrorLogReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShortIdGenerate.mockReturnValue('report-123');
    mockGetSignedUrl.mockResolvedValue('https://signed-upload.example.com/report');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('ensureBucketExists', () => {
    test('checks bucket existence and does not create when the bucket exists', async () => {
      mockS3Send.mockResolvedValueOnce({});

      await ensureBucketExists();

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
      expect(mockS3Send.mock.calls[0][0].input).toEqual({
        Bucket: 'error-reports-bucket',
      });
    });

    test('creates the bucket when the local bucket is missing by name', async () => {
      const notFound = new Error('missing');
      notFound.name = 'NotFound';
      mockS3Send
        .mockRejectedValueOnce(notFound)
        .mockResolvedValueOnce({});

      await ensureBucketExists();

      expect(mockS3Send).toHaveBeenCalledTimes(2);
      expect(mockS3Send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
      expect(mockS3Send.mock.calls[1][0]).toBeInstanceOf(CreateBucketCommand);
      expect(mockS3Send.mock.calls[1][0].input).toEqual({
        Bucket: 'error-reports-bucket',
      });
    });

    test('creates the bucket when the local bucket is missing by 404 metadata', async () => {
      const notFound = new Error('missing');
      notFound.$metadata = { httpStatusCode: 404 };
      mockS3Send
        .mockRejectedValueOnce(notFound)
        .mockResolvedValueOnce({});

      await ensureBucketExists();

      expect(mockS3Send).toHaveBeenCalledTimes(2);
      expect(mockS3Send.mock.calls[1][0]).toBeInstanceOf(CreateBucketCommand);
    });

    test('keeps current behavior of swallowing non-404 bucket check errors', async () => {
      const accessDenied = new Error('access denied');
      accessDenied.name = 'AccessDenied';
      accessDenied.$metadata = { httpStatusCode: 403 };
      mockS3Send.mockRejectedValueOnce(accessDenied);

      await expect(ensureBucketExists()).resolves.toBeUndefined();

      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
    });
  });

  describe('getUploadUrl', () => {
    test('checks the local bucket, composes metadata and key, then requests a presigned URL', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-02T09:20:00.000Z'));
      mockS3Send.mockResolvedValueOnce({});

      const uploadUrl = await getUploadUrl({
        userId: 'user-1',
        platform: 'clio',
        metadata: {
          source: 'test-suite',
          severity: 'warning',
        },
      });

      expect(uploadUrl).toBe('https://signed-upload.example.com/report');
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
      expect(getSignedUrl).toHaveBeenCalledTimes(1);
      expect(getSignedUrl.mock.calls[0][0]).toEqual(expect.objectContaining({
        send: mockS3Send,
      }));
      expect(getSignedUrl.mock.calls[0][1]).toBeInstanceOf(PutObjectCommand);
      expect(getSignedUrl.mock.calls[0][1].input).toEqual({
        Bucket: 'error-reports-bucket',
        Key: 'error-reports/2026-07-02/user-1-report-123.json',
        ContentType: 'application/json',
        Metadata: {
          'user-id': 'user-1',
          platform: 'clio',
          source: 'test-suite',
          severity: 'warning',
        },
      });
      expect(getSignedUrl.mock.calls[0][2]).toEqual({
        expiresIn: 300,
      });
    });

    test('uses default metadata when no metadata object is provided', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-03T01:02:03.000Z'));
      mockS3Send.mockResolvedValueOnce({});

      await getUploadUrl({
        userId: 'user-2',
        platform: 'bullhorn',
      });

      expect(getSignedUrl.mock.calls[0][1].input).toMatchObject({
        Key: 'error-reports/2026-07-03/user-2-report-123.json',
        Metadata: {
          'user-id': 'user-2',
          platform: 'bullhorn',
        },
      });
    });

    test('TypeScript implementation checks bucket and composes upload command', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-04T01:02:03.000Z'));
      mockS3Send.mockResolvedValueOnce({});

      const uploadUrl = await tsS3ErrorLogReport.getUploadUrl({
        userId: 'user-ts',
        platform: 'clio',
        metadata: {
          source: 'ts-suite',
        },
      });

      expect(uploadUrl).toBe('https://signed-upload.example.com/report');
      expect(mockS3Send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
      expect(getSignedUrl.mock.calls[0][1]).toBeInstanceOf(PutObjectCommand);
      expect(getSignedUrl.mock.calls[0][1].input).toEqual({
        Bucket: 'error-reports-bucket',
        Key: 'error-reports/2026-07-04/user-ts-report-123.json',
        ContentType: 'application/json',
        Metadata: {
          'user-id': 'user-ts',
          platform: 'clio',
          source: 'ts-suite',
        },
      });
    });
  });
});

export {};
