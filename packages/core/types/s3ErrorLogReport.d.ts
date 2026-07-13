export interface S3ErrorLogMetadata {
  [key: string]: string | number | boolean | undefined;
}

export interface UploadUrlParams {
  userId: string;
  platform: string;
  metadata?: S3ErrorLogMetadata;
}

export interface AwsSdkErrorLike extends Error {
  $metadata?: {
    httpStatusCode?: number;
    [key: string]: unknown;
  };
}
