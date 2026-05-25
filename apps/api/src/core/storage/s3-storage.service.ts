import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly internalClient: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;
  private readonly publicEndpoint: string;

  constructor(private readonly config: ConfigService) {
    const internalEndpoint = this.config.get<string>('S3_ENDPOINT') ?? 'http://127.0.0.1:9000';
    this.publicEndpoint =
      this.config.get<string>('S3_PUBLIC_ENDPOINT') ?? 'https://agent.neeklo.ru/storage';
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'botme';

    const credentials = {
      accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? 'botme',
      secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? 'botme_secret',
    };
    const region = this.config.get<string>('S3_REGION') ?? 'us-east-1';
    const forcePathStyle = this.config.get<string>('S3_FORCE_PATH_STYLE') !== 'false';

    this.internalClient = new S3Client({
      region,
      endpoint: internalEndpoint,
      forcePathStyle,
      credentials,
    });

    this.presignClient = new S3Client({
      region,
      endpoint: this.publicEndpoint,
      forcePathStyle,
      credentials,
    });

    if (/127\.0\.0\.1|localhost/.test(internalEndpoint)) {
      this.logger.log(`S3 internal=${internalEndpoint} public=${this.publicEndpoint}`);
    }
  }

  buildObjectKey(workspaceId: string, knowledgeBaseId: string, documentId: string, filename: string): string {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `workspaces/${workspaceId}/kb/${knowledgeBaseId}/${documentId}/${safe}`;
  }

  async putObject(storageKey: string, body: Buffer, mimeType: string): Promise<void> {
    await this.internalClient.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: body,
        ContentType: mimeType,
      }),
    );
  }

  async createUploadUrl(storageKey: string, mimeType: string, expiresSec = 900): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
    });
    const url = await getSignedUrl(this.presignClient, command, { expiresIn: expiresSec });
    this.assertPublicUploadUrl(url);
    return url;
  }

  /** Reject presigned URLs that would send the browser to a private host. */
  assertPublicUploadUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid presigned upload URL');
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.')
    ) {
      throw new Error(
        `Presigned URL uses private host "${host}" — set S3_PUBLIC_ENDPOINT=https://agent.neeklo.ru/storage`,
      );
    }
    if (parsed.protocol !== 'https:' && !host.includes('agent.neeklo.ru')) {
      this.logger.warn(`Presigned URL is not HTTPS: ${parsed.origin}`);
    }
  }

  async getObjectBuffer(storageKey: string): Promise<Buffer> {
    const res = await this.internalClient.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    const body = res.Body;
    if (!body) throw new Error('Empty object body');
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.internalClient.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }
}
