import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PUT_TTL_SECONDS = 15 * 60;
const GET_TTL_SECONDS = 60 * 60;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;
  private envPrefix!: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const accountId = this.configService.get<string>("R2_ACCOUNT_ID");
    const accessKey = this.configService.get<string>("R2_ACCESS_KEY_ID");
    const secretKey = this.configService.get<string>("R2_SECRET_ACCESS_KEY");
    const endpoint = this.configService.get<string>("R2_ENDPOINT");
    const bucket = this.configService.get<string>("R2_BUCKET") ?? "supkeys-attachments";

    if (
      !accountId ||
      !accessKey ||
      !secretKey ||
      !endpoint ||
      accountId.startsWith("<") ||
      accessKey.startsWith("<") ||
      secretKey.startsWith("<") ||
      endpoint.includes("<account-id>")
    ) {
      this.logger.error(
        "R2 yapılandırması eksik veya placeholder. apps/api/.env içinde R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT değerlerini doldur.",
      );
      throw new InternalServerErrorException("R2 storage configuration missing");
    }

    this.bucket = bucket;
    this.envPrefix =
      this.configService.get<string>("NODE_ENV") === "production" ? "prod" : "dev";

    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: false,
    });

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(
        `R2 bucket "${this.bucket}" erişilebilir (env prefix: ${this.envPrefix})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `R2 bucket erişilemiyor: ${msg}. Bucket adını ve API token izinlerini doğrula.`,
      );
      throw new InternalServerErrorException("R2 bucket erişilemiyor");
    }
  }

  /**
   * Storage key — `{env}/{tenantId}/{attachmentId}-{sanitizedFilename}`
   */
  buildKey(tenantId: string, attachmentId: string, originalFilename: string): string {
    const sanitized = this.sanitizeFilename(originalFilename);
    return `${this.envPrefix}/${tenantId}/${attachmentId}-${sanitized}`;
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^[._-]+/, "")
      .substring(0, 100) || "file";
  }

  async generatePresignedPut(key: string, mimeType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(this.client, command, { expiresIn: PUT_TTL_SECONDS });
  }

  async generatePresignedGet(
    key: string,
    originalFilename?: string,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(originalFilename && {
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
          originalFilename,
        )}"`,
      }),
    });
    return getSignedUrl(this.client, command, { expiresIn: GET_TTL_SECONDS });
  }

  async checkExists(key: string): Promise<{ exists: boolean; size?: number }> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { exists: true, size: result.ContentLength };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;
      const name = (err as { name?: string })?.name;
      if (name === "NotFound" || status === 404) {
        return { exists: false };
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    this.logger.log(`Deleted: ${key}`);
  }

  getEnvPrefix(): string {
    return this.envPrefix;
  }
}
