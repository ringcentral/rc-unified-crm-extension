// packages/core/lib/s3ErrorReport.js
const { S3Client, PutObjectCommand, GetObjectCommand, CreateBucketCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const shortid = require('shortid');

const BUCKET_NAME = process.env.ERROR_REPORT_S3_BUCKET || 'error-reports-bucket';
const PRESIGN_EXPIRY = 300; // 5 minutes
const IS_LOCAL = !process.env.ERROR_REPORT_S3_BUCKET;
const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:9001';

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(IS_LOCAL && {
        endpoint: LOCALSTACK_ENDPOINT,
        forcePathStyle: true, // Required for LocalStack/MinIO
        credentials: {
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin'
        }
    })
});

/**
 * Ensure bucket exists (useful for local testing)
 */
async function ensureBucketExists() {
    if (!IS_LOCAL) return;
    
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
            await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
            console.log(`[LocalStack] Created bucket: ${BUCKET_NAME}`);
        }
    }
}

/**
 * Generate presigned URL for upload
 */
async function getUploadUrl({ userId, platform, metadata }) {
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

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: PRESIGN_EXPIRY });

    return uploadUrl;
}

exports.getUploadUrl = getUploadUrl;
exports.ensureBucketExists = ensureBucketExists;