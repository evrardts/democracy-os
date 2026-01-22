import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';

// Configure S3 client (works with both AWS S3 and MinIO)
const s3Client = new S3Client({
  endpoint: process.env.MINIO_USE_SSL === 'true'
    ? `https://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`
    : `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.MINIO_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true, // Required for MinIO
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'democracy-os';

/**
 * Generate a safe filename with random prefix to avoid collisions
 */
function generateSafeFilename(originalFilename: string): string {
  const ext = path.extname(originalFilename);
  const basename = path.basename(originalFilename, ext);
  const sanitized = basename.replace(/[^a-zA-Z0-9-_]/g, '-').substring(0, 100);
  const randomPrefix = crypto.randomBytes(8).toString('hex');
  return `${randomPrefix}-${sanitized}${ext}`;
}

/**
 * Upload a file to S3/MinIO
 */
export async function uploadFile(
  file: Express.Multer.File,
  tenantId: string,
  folder: string = 'documents'
): Promise<{ key: string; url: string; filename: string; size: number }> {
  const safeFilename = generateSafeFilename(file.originalname);
  const key = `${tenantId}/${folder}/${safeFilename}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    Metadata: {
      originalName: file.originalname,
      uploadedAt: new Date().toISOString(),
    },
  });

  await s3Client.send(command);

  // Generate public URL (for MinIO in development)
  const url = process.env.MINIO_USE_SSL === 'true'
    ? `https://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${BUCKET_NAME}/${key}`
    : `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}/${BUCKET_NAME}/${key}`;

  return {
    key,
    url,
    filename: file.originalname,
    size: file.size,
  };
}

/**
 * Generate a presigned URL for secure file download (expires in 1 hour)
 */
export async function getPresignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from S3/MinIO
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Check if S3/MinIO is accessible
 */
export async function healthCheck(): Promise<boolean> {
  try {
    // Try to list objects in the bucket (this will fail if bucket doesn't exist or no access)
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: 'health-check-dummy', // This file doesn't need to exist
    });

    // We don't care if the file exists, just that we can access the bucket
    await s3Client.send(command).catch((err) => {
      // NoSuchKey error means bucket is accessible
      if (err.name === 'NoSuchKey') {
        return true;
      }
      throw err;
    });

    return true;
  } catch (error) {
    console.error('S3 health check failed:', error);
    return false;
  }
}

/**
 * Validate file type and size
 */
export function validateFile(
  file: Express.Multer.File,
  allowedTypes: string[] = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  maxSizeMB: number = 10
): { valid: boolean; error?: string } {
  // Check file type
  if (!allowedTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: `File type ${file.mimetype} not allowed. Allowed types: ${allowedTypes.join(', ')}`,
    };
  }

  // Check file size (convert MB to bytes)
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size ${(file.size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

export { s3Client, BUCKET_NAME };
