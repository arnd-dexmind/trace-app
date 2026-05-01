import { randomUUID } from "node:crypto";
import { extname, join } from "node:path";
import { mkdirSync, createReadStream } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as s3GetSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StoredFile {
  url: string;
  key: string;
  size: number;
  mimetype: string;
}

export interface StorageProvider {
  upload(params: {
    buffer: Buffer;
    originalName: string;
    mimetype: string;
    prefix: string;
  }): Promise<StoredFile>;
  getSignedUploadUrl(params: {
    key: string;
    mimetype: string;
    expiresInSec?: number;
  }): Promise<string>;
  getSignedReadUrl(key: string, expiresInSec?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

const UPLOADS_DIR = join(process.cwd(), "uploads");

// ── Local storage provider ─────────────────────────────────────────────────

class LocalStorageProvider implements StorageProvider {
  async upload(params: {
    buffer: Buffer;
    originalName: string;
    mimetype: string;
    prefix: string;
  }): Promise<StoredFile> {
    mkdirSync(UPLOADS_DIR, { recursive: true });
    const ext = extname(params.originalName).toLowerCase() || ".bin";
    const filename = `${randomUUID()}${ext}`;
    const filePath = join(UPLOADS_DIR, filename);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, params.buffer);
    return {
      url: `/uploads/${filename}`,
      key: filename,
      size: params.buffer.length,
      mimetype: params.mimetype,
    };
  }

  async getSignedUploadUrl(): Promise<string> {
    throw new Error("Signed uploads not supported with local storage");
  }

  getSignedReadUrl(key: string): Promise<string> {
    return Promise.resolve(`/uploads/${key}`);
  }

  async delete(key: string): Promise<void> {
    try { await unlink(join(UPLOADS_DIR, key)); } catch { /* ignore */ }
  }
}

// ── S3 storage provider ────────────────────────────────────────────────────

class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private publicUrlBase: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET!;
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || "auto";
    this.client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: Boolean(endpoint),
    });
    this.publicUrlBase = process.env.S3_PUBLIC_URL_BASE
      || (endpoint ? `${endpoint}/${this.bucket}` : `https://${this.bucket}.s3.${region}.amazonaws.com`);
  }

  async upload(params: {
    buffer: Buffer;
    originalName: string;
    mimetype: string;
    prefix: string;
  }): Promise<StoredFile> {
    const ext = extname(params.originalName).toLowerCase() || ".bin";
    const key = `${params.prefix}/${randomUUID()}${ext}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.mimetype,
    }));
    return {
      url: `${this.publicUrlBase}/${key}`,
      key,
      size: params.buffer.length,
      mimetype: params.mimetype,
    };
  }

  async getSignedUploadUrl(params: {
    key: string;
    mimetype: string;
    expiresInSec?: number;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.mimetype,
    });
    return s3GetSignedUrl(this.client, command, { expiresIn: params.expiresInSec ?? 300 });
  }

  async getSignedReadUrl(key: string, expiresInSec?: number): Promise<string> {
    return `${this.publicUrlBase}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

// ── Provider selection ─────────────────────────────────────────────────────

function createStorageProvider(): StorageProvider {
  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}

export const storage = createStorageProvider();

// ── Cleanup helper ─────────────────────────────────────────────────────────

export async function cleanupMediaAssets(
  keys: string[],
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (const key of keys) {
    try {
      await storage.delete(key);
      deleted++;
    } catch {
      failed++;
    }
  }
  return { deleted, failed };
}

export { UPLOADS_DIR };
