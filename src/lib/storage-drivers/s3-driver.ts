import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageDriver, StorageDriverConfig, StorageDriverFactory, StorageDriverConfigField, FileInfo } from "./types";

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  pathPrefix?: string;
  forcePathStyle?: boolean;
}

export class S3StorageDriver implements StorageDriver {
  readonly type = "s3";
  readonly config: StorageDriverConfig;
  private client: S3Client;
  private bucket: string;
  private pathPrefix: string;

  constructor(config: StorageDriverConfig) {
    this.config = config;
    const s3Config = config.config as unknown as S3Config;
    this.bucket = s3Config.bucket || "clouddrive";
    this.pathPrefix = (s3Config.pathPrefix || "").replace(/^\/+|\/+$/g, "");

    this.client = new S3Client({
      endpoint: s3Config.endpoint || undefined,
      region: s3Config.region || "us-east-1",
      credentials: {
        accessKeyId: s3Config.accessKeyId || "",
        secretAccessKey: s3Config.secretAccessKey || "",
      },
      forcePathStyle: s3Config.forcePathStyle ?? !!s3Config.endpoint,
    });
  }

  private getKey(path: string): string {
    const cleanPath = path.replace(/^\/+/, "");
    return this.pathPrefix ? `${this.pathPrefix}/${cleanPath}` : cleanPath;
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    const key = this.getKey(path);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
      })
    );
  }

  async readFile(path: string): Promise<Buffer> {
    const key = this.getKey(path);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    const bytes = await response.Body?.transformToByteArray();
    return Buffer.from(bytes || new Uint8Array(0));
  }

  async deleteFile(path: string): Promise<void> {
    const key = this.getKey(path);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const key = this.getKey(path);
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  async getFileSize(path: string): Promise<number> {
    const key = this.getKey(path);
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
    return response.ContentLength ?? 0;
  }

  async createDir(path: string): Promise<void> {
    // S3 doesn't have real directories, but we can create a zero-byte object with trailing /
    const key = this.getKey(path) + "/";
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: new Uint8Array(0),
      })
    );
  }

  async deleteDir(path: string): Promise<void> {
    // List and delete all objects with this prefix using batch delete
    const prefix = this.getKey(path) + "/";
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents && response.Contents.length > 0) {
        // Batch delete up to 1000 objects at a time (S3 limit)
        const objects = response.Contents
          .filter((obj) => obj.Key)
          .map((obj) => ({ Key: obj.Key! }));

        // Delete in batches of 1000
        for (let i = 0; i < objects.length; i += 1000) {
          const batch = objects.slice(i, i + 1000);
          await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: {
                Objects: batch,
                Quiet: true,
              },
            })
          );
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  }

  async dirExists(path: string): Promise<boolean> {
    const prefix = this.getKey(path) + "/";
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: 1,
        })
      );
      return (response.Contents?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<FileInfo[]> {
    const prefix = this.getKey(path);
    const prefixWithSlash = prefix ? prefix + "/" : "";
    const results: FileInfo[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefixWithSlash,
          Delimiter: "/",
          ContinuationToken: continuationToken,
        })
      );

      // Add files
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key && obj.Key !== prefixWithSlash) {
            const name = obj.Key.replace(prefixWithSlash, "").replace(/\/$/, "");
            if (name && !name.includes("/")) {
              results.push({
                name,
                size: obj.Size ?? 0,
                isDir: false,
                lastModified: obj.LastModified,
              });
            }
          }
        }
      }

      // Add "directories"
      if (response.CommonPrefixes) {
        for (const prefix of response.CommonPrefixes) {
          if (prefix.Prefix) {
            const name = prefix.Prefix.replace(prefixWithSlash, "").replace(/\/$/, "");
            if (name) {
              results.push({
                name,
                size: 0,
                isDir: true,
              });
            }
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return results;
  }

  async getPublicUrl(path: string): Promise<string> {
    const key = this.getKey(path);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    // Generate a presigned URL valid for 1 hour
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      // First, verify the bucket exists and we have access
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        })
      );

      // Then, try to list objects to verify read access
      await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          MaxKeys: 1,
        })
      );

      return { healthy: true, message: `S3 bucket "${this.bucket}" is accessible` };
    } catch (e) {
      const err = e as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      const statusCode = err.$metadata?.httpStatusCode;

      if (statusCode === 403 || err.name === "AccessDenied") {
        return { healthy: false, message: `S3 access denied for bucket "${this.bucket}": check credentials and permissions` };
      }
      if (statusCode === 404 || err.name === "NoSuchBucket") {
        return { healthy: false, message: `S3 bucket "${this.bucket}" does not exist` };
      }
      if (err.name === "InvalidAccessKeyId") {
        return { healthy: false, message: "S3 invalid access key ID: check your credentials" };
      }
      if (err.name === "SignatureDoesNotMatch") {
        return { healthy: false, message: "S3 signature mismatch: check your secret access key" };
      }

      return { healthy: false, message: `S3 error: ${err.message || "unknown error"}` };
    }
  }

  async getStorageInfo(): Promise<{ used: number; total: number; available: number }> {
    // S3 doesn't have a concept of total/available storage
    // We can calculate used by listing all objects
    try {
      let totalSize = 0;
      let continuationToken: string | undefined;
      const prefix = this.pathPrefix ? this.pathPrefix + "/" : undefined;

      do {
        const response = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );

        if (response.Contents) {
          for (const obj of response.Contents) {
            totalSize += obj.Size ?? 0;
          }
        }

        continuationToken = response.NextContinuationToken;
      } while (continuationToken);

      return { used: totalSize, total: 0, available: 0 };
    } catch {
      return { used: 0, total: 0, available: 0 };
    }
  }
}

export const s3DriverFactory: StorageDriverFactory = {
  type: "s3",
  displayName: "Amazon S3",
  description: "Use Amazon S3 or compatible services (MinIO, DigitalOcean Spaces) as storage backend",
  configFields: [
    {
      key: "endpoint",
      label: "Endpoint URL",
      type: "url",
      required: false,
      placeholder: "https://s3.amazonaws.com",
      helpText: "Leave empty for AWS S3. Set for MinIO, DigitalOcean Spaces, etc.",
    },
    {
      key: "region",
      label: "Region",
      type: "text",
      required: true,
      placeholder: "us-east-1",
      defaultValue: "us-east-1",
    },
    {
      key: "bucket",
      label: "Bucket Name",
      type: "text",
      required: true,
      placeholder: "my-clouddrive-bucket",
    },
    {
      key: "accessKeyId",
      label: "Access Key ID",
      type: "text",
      required: true,
      placeholder: "AKIAIOSFODNN7EXAMPLE",
    },
    {
      key: "secretAccessKey",
      label: "Secret Access Key",
      type: "password",
      required: true,
      placeholder: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    },
    {
      key: "pathPrefix",
      label: "Path Prefix",
      type: "text",
      required: false,
      placeholder: "clouddrive",
      helpText: "Optional prefix for all files in the bucket",
    },
    {
      key: "forcePathStyle",
      label: "Force Path Style",
      type: "text",
      required: false,
      placeholder: "true",
      defaultValue: "false",
      helpText: "Enable for MinIO and self-hosted S3. Set to 'true' if using custom endpoint.",
    },
  ],
  create: (config) => new S3StorageDriver(config),
};
