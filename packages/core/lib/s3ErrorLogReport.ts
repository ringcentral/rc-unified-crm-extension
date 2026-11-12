import type { AwsSdkErrorLike, UploadUrlParams } from '../types';

const {
    S3Client,
    PutObjectCommand,
    CreateBucketCommand,
    HeadBucketCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const shortid = require('shortid');

const CONFIGURED_BUCKET = process.env.ERROR_REPORT_S3_BUCKET;
const BUCKET_NAME = CONFIGURED_BUCKET || 'error-reports-bucket';
const PRESIGN_EXPIRY = 300; // 5 minutes
const LOCAL_MODE = process.env.ERROR_REPORT_S3_LOCAL;
const IS_LOCAL = LOCAL_MODE === 'true';
const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:9001';

let s3Client: any;

function getS3Client() {
    if (s3Client) return s3Client;
    if (LOCAL_MODE && LOCAL_MODE !== 'true' && LOCAL_MODE !== 'false') {
        throw new Error('ERROR_REPORT_S3_LOCAL must be true or false');
    }
    if (!IS_LOCAL && !CONFIGURED_BUCKET) {
        throw new Error('ERROR_REPORT_S3_BUCKET is required unless ERROR_REPORT_S3_LOCAL=true');
    }
    const accessKeyId = process.env.MINIO_ROOT_USER;
    const secretAccessKey = process.env.MINIO_ROOT_PASSWORD;
    if (IS_LOCAL && (!accessKeyId?.trim() || !secretAccessKey?.trim())) {
        throw new Error('MINIO_ROOT_USER and MINIO_ROOT_PASSWORD are required for local error-report storage');
    }
    s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        ...(IS_LOCAL && {
            endpoint: LOCALSTACK_ENDPOINT,
            forcePathStyle: true,
            credentials: { accessKeyId, secretAccessKey }
        })
    });
    return s3Client;
}

async function ensureBucketExists(): Promise<void> {
    if (!IS_LOCAL) return;
    const client = getS3Client();

    try {
        await client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    } catch (err) {
        const awsError = err as AwsSdkErrorLike;
        if (awsError.name === 'NotFound' || awsError.$metadata?.httpStatusCode === 404) {
            await client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
            console.log(`[LocalStack] Created bucket: ${BUCKET_NAME}`);
        }
    }
}

async function getUploadUrl({ userId, platform, metadata }: UploadUrlParams): Promise<string> {
    const client = getS3Client();
    await ensureBucketExists();

    const reportId = shortid.generate();
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `error-reports/${timestamp}/${userId}-${reportId}.json`;

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: 'application/json',
        Metadata: {
            'user-id': userId,
            'platform': platform,
            ...metadata
        }
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRY });

    return uploadUrl;
}

export {
    ensureBucketExists,
    getUploadUrl
};
