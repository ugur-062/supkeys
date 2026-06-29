import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type CORSRule,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PUT_TTL_SECONDS = 15 * 60;
const GET_TTL_SECONDS = 60 * 60;

/**
 * Browser → R2 direct PUT/GET için bucket CORS policy gerekli.
 * R2 bucket default'unda CORS YOK; preflight fail → upload silently başarısız.
 * `onModuleInit`'te idempotent set ediyoruz.
 */
const CORS_ALLOWED_METHODS: CORSRule["AllowedMethods"] = ["PUT", "GET", "HEAD"];
const CORS_ALLOWED_HEADERS: CORSRule["AllowedHeaders"] = ["*"];
const CORS_EXPOSE_HEADERS: CORSRule["ExposeHeaders"] = ["ETag"];
const CORS_MAX_AGE_SECONDS = 3600;

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
    const bucket = this.configService.get<string>("R2_BUCKET");

    if (
      !accountId ||
      !accessKey ||
      !secretKey ||
      !endpoint ||
      !bucket ||
      accountId.startsWith("<") ||
      accessKey.startsWith("<") ||
      secretKey.startsWith("<") ||
      endpoint.includes("<account-id>")
    ) {
      this.logger.error(
        "R2 yapılandırması eksik veya placeholder. Root `.env` dosyasında (ConfigModule `envFilePath: '../../.env'`) R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET değerlerini doldur.",
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
      await this.ensureCorsPolicy();
    } catch (err) {
      const e = err as {
        name?: string;
        message?: string;
        Code?: string;
        $metadata?: { httpStatusCode?: number };
        $response?: { statusCode?: number };
      };
      const msg = e?.message ?? String(err);
      const status = e?.$metadata?.httpStatusCode ?? e?.$response?.statusCode;
      this.logger.error(
        `R2 bucket erişilemiyor (name=${e?.name ?? "?"}, code=${e?.Code ?? "?"}, status=${status ?? "?"}): ${msg}. Endpoint=${endpoint}, Bucket=${this.bucket}.`,
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

  /** Sunucu tarafı upload — buffer'ı doğrudan R2'ya yazar (web sitesi import vb.). */
  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
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

  getBucketName(): string {
    return this.bucket;
  }

  /**
   * V2-PUBLIC-PROFILE — Tedarikçi public profili için R2 key üretici.
   * Cover (tek) ve photo (galeri) için ayrı kind'lar.
   * Pattern: `{env}/supplier-profile/{supplierId}/{kind}-{id}-{sanitized}`
   */
  buildSupplierProfileKey(
    supplierId: string,
    kind: "cover" | "photo" | "logo",
    id: string,
    originalFilename: string,
  ): string {
    const sanitized = this.sanitizeFilename(originalFilename);
    return `${this.envPrefix}/supplier-profile/${supplierId}/${kind}-${id}-${sanitized}`;
  }

  /** G9 madde 26 — tedarikçi sertifika/belge dosyaları için R2 key. */
  buildSupplierCertificateKey(
    supplierId: string,
    id: string,
    originalFilename: string,
  ): string {
    const sanitized = this.sanitizeFilename(originalFilename);
    return `${this.envPrefix}/supplier-certificates/${supplierId}/${id}-${sanitized}`;
  }

  /** Alıcı (tenant) public profil görselleri (logo/cover) için R2 key. */
  buildTenantProfileKey(
    tenantId: string,
    kind: "cover" | "logo" | "gallery",
    id: string,
    originalFilename: string,
  ): string {
    const sanitized = this.sanitizeFilename(originalFilename);
    return `${this.envPrefix}/tenant-profile/${tenantId}/${kind}-${id}-${sanitized}`;
  }

  /**
   * Persistent public URL — `R2_PUBLIC_BASE_URL` set edilmişse (Cloudflare R2
   * public bucket veya custom domain) doğrudan URL döner. Aksi null →
   * caller presigned GET'e fallback yapar (kısa TTL, public profil için
   * ideal değil; production'da env doldurulmalı).
   */
  getPublicUrl(key: string | null | undefined): string | null {
    if (!key) return null;
    const base = this.configService.get<string>("R2_PUBLIC_BASE_URL");
    if (!base) return null;
    const normalized = base.replace(/\/$/, "");
    return `${normalized}/${key}`;
  }

  /**
   * Public URL varsa onu; yoksa presigned GET (1 saat TTL). Public profil
   * cover/galeri render'ında kullanılır.
   */
  async resolveImageUrl(
    key: string | null | undefined,
  ): Promise<string | null> {
    if (!key) return null;
    const publicUrl = this.getPublicUrl(key);
    if (publicUrl) return publicUrl;
    return this.generatePresignedGet(key);
  }

  /**
   * Mevcut bucket CORS policy'sini oku. Set edilmemişse [].
   */
  async getBucketCorsConfig(): Promise<CORSRule[]> {
    try {
      const result = await this.client.send(
        new GetBucketCorsCommand({ Bucket: this.bucket }),
      );
      return result.CORSRules ?? [];
    } catch (err) {
      const e = err as { name?: string; Code?: string };
      // R2'de policy yoksa NoSuchCORSConfiguration döner
      if (e?.name === "NoSuchCORSConfiguration" || e?.Code === "NoSuchCORSConfiguration") {
        return [];
      }
      throw err;
    }
  }

  /**
   * Allowed origin'leri `CORS_ORIGINS` env'inden okur — backend CORS ile aynı set.
   * Tedarikçi paneli + alıcı paneli aynı host'ta (apps/web), admin ayrı host
   * (apps/admin) — ikisini de kapsar.
   */
  private buildAllowedOrigins(): string[] {
    const raw = this.configService.get<string>(
      "CORS_ORIGINS",
      "http://localhost:3000,http://localhost:3001",
    );
    return raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }

  /**
   * Idempotent — istenen config zaten kuruluysa skip, değilse PutBucketCors.
   */
  private async ensureCorsPolicy(): Promise<void> {
    const desired: CORSRule[] = [
      {
        AllowedOrigins: this.buildAllowedOrigins(),
        AllowedMethods: CORS_ALLOWED_METHODS,
        AllowedHeaders: CORS_ALLOWED_HEADERS,
        ExposeHeaders: CORS_EXPOSE_HEADERS,
        MaxAgeSeconds: CORS_MAX_AGE_SECONDS,
      },
    ];

    const current = await this.getBucketCorsConfig();
    if (this.corsRulesEqual(current, desired)) {
      this.logger.log(
        `R2 bucket CORS policy güncel (origins: ${desired[0]!.AllowedOrigins?.join(", ")})`,
      );
      return;
    }

    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: { CORSRules: desired },
        }),
      );
      this.logger.log(
        `R2 bucket CORS policy ${current.length === 0 ? "kuruldu" : "güncellendi"} (origins: ${desired[0]!.AllowedOrigins?.join(", ")})`,
      );
    } catch (err) {
      const e = err as { name?: string; message?: string };
      this.logger.warn(
        `R2 bucket CORS policy set edilemedi (${e?.name ?? "?"}): ${e?.message ?? String(err)}. Browser uploadları başarısız olabilir; token'ın PutBucketCors izni olduğunu kontrol et.`,
      );
    }
  }

  /**
   * Sıralamadan bağımsız basit equality — set'lerin aynı olup olmadığına bakar.
   */
  private corsRulesEqual(a: CORSRule[], b: CORSRule[]): boolean {
    if (a.length !== b.length) return false;
    const norm = (rules: CORSRule[]) =>
      JSON.stringify(
        rules.map((r) => ({
          o: [...(r.AllowedOrigins ?? [])].sort(),
          m: [...(r.AllowedMethods ?? [])].sort(),
          h: [...(r.AllowedHeaders ?? [])].sort(),
          e: [...(r.ExposeHeaders ?? [])].sort(),
          x: r.MaxAgeSeconds ?? null,
        })),
      );
    return norm(a) === norm(b);
  }
}
