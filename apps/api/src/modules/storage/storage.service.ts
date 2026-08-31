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
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertOwnProfileImageUrl } from "../../common/helpers/upload-validation";

const PUT_TTL_SECONDS = 15 * 60;
// GET presigned URL ömrü kısa tutulur — hassas belge (KYC/teklif) URL'si loglara/
// referer'a sızarsa tekrar-oynatma penceresi dar olsun. İndirme için 15 dk yeter.
const GET_TTL_SECONDS = 15 * 60;

/**
 * İki-bucket ayrımı (R2). Public erişim R2'da BUCKET seviyesindedir → hassas
 * belgeler (KYC/teklif/ihale/sipariş) public bucket'ta OLAMAZ, aksi halde key'i
 * bilen herkes imzasız çeker (presigned baypas). Bkz. docs/invariants.md
 * INV-STORAGE-1.
 *
 * - "public"  → yalnız profil görselleri; custom domain (R2_PUBLIC_BASE_URL) ile
 *               kalıcı public URL. Anahtar prefix'i `{env}/tenant-profile/`.
 * - "private" → KYC/ihale/teklif/sipariş belgeleri; public access ASLA, yalnız
 *               kısa-ömürlü presigned URL.
 */
export type BucketKind = "public" | "private";

// Public bucket'a KOYULABİLECEK tek prefix (env-öneki HARİÇ). Allowlist: bunun
// dışındaki HER key private kabul edilir (fail-closed).
const PUBLIC_KEY_INFIX = "tenant-profile/";

/**
 * Browser → R2 direct PUT/GET için bucket CORS policy gerekli.
 * R2 bucket default'unda CORS YOK; preflight fail → upload silently başarısız.
 * `onModuleInit`'te her iki bucket'a idempotent set ediyoruz.
 */
const CORS_ALLOWED_METHODS: CORSRule["AllowedMethods"] = ["PUT", "GET", "HEAD"];
const CORS_ALLOWED_HEADERS: CORSRule["AllowedHeaders"] = ["*"];
const CORS_EXPOSE_HEADERS: CORSRule["ExposeHeaders"] = ["ETag"];
const CORS_MAX_AGE_SECONDS = 3600;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private publicBucket!: string;
  private privateBucket!: string;
  private envPrefix!: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const accountId = this.configService.get<string>("R2_ACCOUNT_ID");
    const accessKey = this.configService.get<string>("R2_ACCESS_KEY_ID");
    const secretKey = this.configService.get<string>("R2_SECRET_ACCESS_KEY");
    const endpoint = this.configService.get<string>("R2_ENDPOINT");
    // Geçiş uyumu: R2_PRIVATE_BUCKET yoksa legacy R2_BUCKET'e düş (eski deploy
    // config'i "her şey tek/private bucket" olarak güvenle boot eder). Bilinmeyen
    // → private (fail-closed). R2_PUBLIC_BUCKET yoksa private ile aynı bucket
    // kullanılır (legacy tek-bucket davranışı birebir korunur).
    const privateBucket =
      this.configService.get<string>("R2_PRIVATE_BUCKET") ??
      this.configService.get<string>("R2_BUCKET");

    if (
      !accountId ||
      !accessKey ||
      !secretKey ||
      !endpoint ||
      !privateBucket ||
      accountId.startsWith("<") ||
      accessKey.startsWith("<") ||
      secretKey.startsWith("<") ||
      endpoint.includes("<account-id>")
    ) {
      this.logger.error(
        "R2 yapılandırması eksik veya placeholder. Root `.env` dosyasında (ConfigModule `envFilePath: '../../.env'`) R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT ve R2_PRIVATE_BUCKET (+ R2_PUBLIC_BUCKET) değerlerini doldur.",
      );
      throw new InternalServerErrorException("R2 storage configuration missing");
    }

    this.privateBucket = privateBucket;
    // R2_PUBLIC_BUCKET yoksa private ile aynı bucket (legacy tek-bucket davranışı).
    this.publicBucket =
      this.configService.get<string>("R2_PUBLIC_BUCKET") ?? privateBucket;
    this.envPrefix =
      this.configService.get<string>("NODE_ENV") === "production" ? "prod" : "dev";

    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle: false,
    });

    // Her iki bucket'ı doğrula + CORS uygula. Aynı bucket ise (legacy tek-bucket)
    // tekilleştir. DİKKAT: API token yeni bucket'a yetkisizse HeadBucket fail →
    // app BOOT ETMEZ (fail-closed) — token izni deploy'dan ÖNCE genişletilmeli.
    const buckets = Array.from(new Set([this.privateBucket, this.publicBucket]));
    for (const bucket of buckets) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
        this.logger.log(
          `R2 bucket "${bucket}" erişilebilir (env prefix: ${this.envPrefix})`,
        );
        await this.ensureCorsPolicy(bucket);
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
          `R2 bucket erişilemiyor (name=${e?.name ?? "?"}, code=${e?.Code ?? "?"}, status=${status ?? "?"}): ${msg}. Endpoint=${endpoint}, Bucket=${bucket}. API token'ın bu bucket'a yetkili olduğunu kontrol et.`,
        );
        throw new InternalServerErrorException("R2 bucket erişilemiyor");
      }
    }
  }

  // ── Bucket / key sınıflandırma ────────────────────────────────────────────

  private bucketName(kind: BucketKind): string {
    return kind === "public" ? this.publicBucket : this.privateBucket;
  }

  /**
   * Anahtarın ait olduğu bucket'ı belirler. YALNIZ `{env}/tenant-profile/` public;
   * diğer HER anahtar private (fail-closed). Bu, INV-STORAGE-1'in tek kaynağı.
   */
  classifyKey(key: string): BucketKind {
    return key.startsWith(`${this.envPrefix}/${PUBLIC_KEY_INFIX}`)
      ? "public"
      : "private";
  }

  /**
   * Savunma-derinliği: bir çağrının hedef bucket'ı, anahtarın sınıfıyla
   * uyuşmuyorsa (ör. KYC anahtarı public bucket'a) fırlat. Kodlama hatasını
   * runtime'da yakalar — hassas belge asla public düzleme yazılamaz.
   */
  private assertKeyBucket(kind: BucketKind, key: string): void {
    const expected = this.classifyKey(key);
    if (expected !== kind) {
      throw new InternalServerErrorException(
        `Storage bucket uyuşmazlığı: '${key}' anahtarı '${expected}' bucket'a ait ama '${kind}' istendi (INV-STORAGE-1).`,
      );
    }
  }

  // ── Anahtar üreticiler ────────────────────────────────────────────────────

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^[._-]+/, "")
      .substring(0, 100) || "file";
  }

  /** Alıcı (tenant) public profil görsel key'lerinin firma-öznel prefix'i. */
  buildTenantProfilePrefix(tenantId: string): string {
    return `${this.envPrefix}/tenant-profile/${tenantId}/`;
  }

  /** Alıcı (tenant) public profil görselleri (logo/cover/gallery) için R2 key. */
  buildTenantProfileKey(
    tenantId: string,
    kind: "cover" | "logo" | "gallery",
    id: string,
    originalFilename: string,
  ): string {
    const sanitized = this.sanitizeFilename(originalFilename);
    return `${this.buildTenantProfilePrefix(tenantId)}${kind}-${id}-${sanitized}`;
  }

  /**
   * İzinli görsel host'ları — R2 public base (CDN) + R2 endpoint (presigned).
   * İkisi de yoksa BOŞ döner → `assertOwnPublicImageUrl` her değeri reddeder
   * (FAIL-CLOSED: env eksikse "atla" değil "reddet").
   */
  private allowedImageHosts(): string[] {
    const hosts: string[] = [];
    for (const key of ["R2_PUBLIC_BASE_URL", "R2_ENDPOINT"] as const) {
      const v = this.configService.get<string>(key);
      if (v) {
        try {
          hosts.push(new URL(v).host);
        } catch {
          /* geçersiz env URL'i → atla */
        }
      }
    }
    return hosts;
  }

  /**
   * SAKLANAN public görsel değeri (logoUrl/photos[] vb.) kendi tenant-profile
   * deposundan mı? Harici/`data:` URL PATCH'ini engeller (bkz.
   * `assertOwnProfileImageUrl`). Fail-closed: R2 host'ları yoksa reddeder.
   */
  assertOwnPublicImageUrl(value: string, tenantId: string): void {
    assertOwnProfileImageUrl(value, {
      tenantPrefix: this.buildTenantProfilePrefix(tenantId),
      allowedHosts: this.allowedImageHosts(),
    });
  }

  // ── Yazma / okuma ─────────────────────────────────────────────────────────

  async generatePresignedPut(
    bucket: BucketKind,
    key: string,
    mimeType: string,
  ): Promise<string> {
    this.assertKeyBucket(bucket, key);
    const command = new PutObjectCommand({
      Bucket: this.bucketName(bucket),
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(this.client, command, { expiresIn: PUT_TTL_SECONDS });
  }

  /** Sunucu tarafı upload — buffer'ı doğrudan R2'ya yazar. */
  async putObject(
    bucket: BucketKind,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    this.assertKeyBucket(bucket, key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async generatePresignedGet(
    bucket: BucketKind,
    key: string,
    originalFilename?: string,
  ): Promise<string> {
    this.assertKeyBucket(bucket, key);
    // İndirme her zaman EK olarak sunulur ve içerik tipi nötrlenir: nesne
    // (istemci imzalı PUT'ta content-type'ı seçebildiği için) text/html ya da
    // image/svg+xml olabilir; tarayıcıda satır-içi açılırsa R2 origin'inde
    // saldırgan script çalışır ve admin/kullanıcı belgeyi "önizlerken" tuzağa
    // düşer (denetim 2026-08-24 Parça 5).
    const command = new GetObjectCommand({
      Bucket: this.bucketName(bucket),
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
        originalFilename ?? key.split("/").pop() ?? "dosya",
      )}"`,
      ResponseContentType: "application/octet-stream",
    });
    return getSignedUrl(this.client, command, { expiresIn: GET_TTL_SECONDS });
  }

  /**
   * SATIR-İÇİ önizleme URL'i — YALNIZ KYC belge incelemesi gibi, admin'in
   * belgeyi görmesi gereken yerler için (denetim 2026-08-26 Parça 9 #7).
   *
   * Parça 5'ten beri her presigned GET koşulsuz `attachment` + octet-stream
   * basıyordu; bu, XSS'i kapatırken admin önizlemesini de kapatmıştı — her
   * KYC belgesi (kimlik ön/arka dahil) inceleyenin diskine inmek zorunda
   * kalıyordu, yani Parça 5'in amaçladığının tersi bir veri yayılımı.
   *
   * XSS'i asıl kapatan `attachment` DEĞİL, yanıt içerik tipinin SUNUCU
   * tarafından sabitlenmesidir: burada tip nesnenin (istemci imzalı PUT'ta
   * seçebildiği) kendi content-type'ından DEĞİL, anahtarın uzantısından ve
   * KATI bir beyaz listeden gelir. Uzantı beyaz listede yoksa `attachment`
   * davranışına düşeriz. Böylece nesne gerçekte text/html olsa bile tarayıcı
   * onu application/pdf olarak görür ve script çalışmaz.
   */
  async presignInlinePreview(
    bucket: BucketKind,
    value: string | null | undefined,
    originalFilename?: string,
  ): Promise<string | null> {
    if (!value) return null;
    const key = this.resolveStoredKey(value);
    if (!key) return null;
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const INLINE_SAFE: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
    };
    const contentType = INLINE_SAFE[ext];
    if (!contentType) {
      return this.generatePresignedGet(bucket, key, originalFilename);
    }
    this.assertKeyBucket(bucket, key);
    const command = new GetObjectCommand({
      Bucket: this.bucketName(bucket),
      Key: key,
      ResponseContentDisposition: `inline; filename="${encodeURIComponent(
        originalFilename ?? key.split("/").pop() ?? "belge",
      )}"`,
      ResponseContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: GET_TTL_SECONDS });
  }

  async checkExists(
    bucket: BucketKind,
    key: string,
  ): Promise<{ exists: boolean; size?: number; contentType?: string }> {
    this.assertKeyBucket(bucket, key);
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
      );
      // contentType ZORUNLU: presigned PUT içerik tipini İMZALAMAZ (AWS SDK
      // `prepareRequest` → `unsignableHeaders.add("content-type")`), yani
      // istemci "image/png" beyan edip nesneyi text/html olarak yükleyebilir.
      // Tek otoritatif kaynak, yüklemeden SONRA okunan bu HEAD değeridir
      // (denetim 2026-08-24 Parça 5, HIGH).
      return {
        exists: true,
        size: result.ContentLength,
        contentType: result.ContentType,
      };
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

  /**
   * Sunucu-içi okuma (Faz AI-1) — nesne içeriğini Buffer olarak döner. AI
   * belge işleme gibi backend'in dosyayı KENDİSİNİN tüketmesi gereken akışlar
   * için; kullanıcıya indirme her zaman presigned GET ile.
   */
  async getObject(bucket: BucketKind, key: string): Promise<Buffer> {
    this.assertKeyBucket(bucket, key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new InternalServerErrorException("Dosya içeriği okunamadı");
    }
    return Buffer.from(bytes);
  }

  /**
   * Prefix altındaki nesneleri listeler (Faz AI-1 — geçici ai-extract/
   * dosyalarının TTL temizliği). Sayfalamayı içeride tüketir; anahtar +
   * lastModified döner.
   */
  async listObjects(
    bucket: BucketKind,
    prefix: string,
  ): Promise<{ key: string; lastModified?: Date }[]> {
    this.assertKeyBucket(bucket, prefix);
    const out: { key: string; lastModified?: Date }[] = [];
    let token: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName(bucket),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const o of result.Contents ?? []) {
        if (o.Key) out.push({ key: o.Key, lastModified: o.LastModified });
      }
      token = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async deleteObject(bucket: BucketKind, key: string): Promise<void> {
    this.assertKeyBucket(bucket, key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: key }),
    );
    this.logger.log(`Deleted (${bucket}): ${key}`);
  }

  getEnvPrefix(): string {
    return this.envPrefix;
  }

  getBucketNames(): { public: string; private: string } {
    return { public: this.publicBucket, private: this.privateBucket };
  }

  /**
   * Kalıcı public URL — YALNIZ public-sınıf anahtarlar için (`{env}/tenant-profile/`).
   * INV-STORAGE-1: hassas (private) anahtar public URL'e ÇEVRİLEMEZ → daima `null`.
   * `R2_PUBLIC_BASE_URL` set değilse de `null` (caller presigned public'e fallback).
   */
  getPublicUrl(key: string | null | undefined): string | null {
    if (!key) return null;
    if (this.classifyKey(key) !== "public") return null; // INV-STORAGE-1
    const base = this.configService.get<string>("R2_PUBLIC_BASE_URL");
    if (!base) return null;
    const normalized = base.replace(/\/$/, "");
    return `${normalized}/${key}`;
  }

  /**
   * `getPublicUrl` tersi — DB'de saklanan public görsel DEĞERİNDEN (tam URL ya
   * da doğrudan anahtar) nesne anahtarını çıkarır. KVKK imhasında nesneleri
   * silmek için gerekir (denetim 2026-08-24 Parça 5). Public-sınıf olmayan ya
   * da çözülemeyen değerlerde null döner (yanlış nesne SİLİNMEZ).
   */
  publicUrlToKey(value: string | null | undefined): string | null {
    if (!value) return null;
    let candidate = value.trim();
    if (/^https?:\/\//i.test(candidate)) {
      try {
        candidate = decodeURIComponent(new URL(candidate).pathname).replace(
          /^\/+/,
          "",
        );
      } catch {
        return null;
      }
    }
    if (!candidate) return null;
    return this.classifyKey(candidate) === "public" ? candidate : null;
  }

  /**
   * DB'de saklanan bir belge değeri (key veya legacy tam URL) için kısa ömürlü
   * presigned GET üretir. KYC gibi HASSAS belgeler bununla (private bucket)
   * sunulur. Legacy tam URL ise key'i domain'den sonra çıkarır. Boş/çözülemezse null.
   */
  async presignStoredObject(
    bucket: BucketKind,
    value: string | null | undefined,
    originalFilename?: string,
  ): Promise<string | null> {
    if (!value) return null;
    const key = this.resolveStoredKey(value);
    if (!key) return null;
    return this.generatePresignedGet(bucket, key, originalFilename);
  }

  /**
   * DB'de saklanan değer (key ya da legacy tam URL) → key. Domain-only legacy
   * değerlerde null. (presignStoredObject + presignInlinePreview ortak.)
   */
  private resolveStoredKey(value: string): string | null {
    let key = value;
    const schemeIdx = value.indexOf("://");
    if (schemeIdx !== -1) {
      const afterScheme = value.slice(schemeIdx + 3);
      const slash = afterScheme.indexOf("/");
      if (slash === -1) return null; // domain-only, key çıkarılamaz
      const rawKey = afterScheme.slice(slash + 1).split("?")[0]!;
      // Bozuk yüzde-kaçışında URIError yerine ham değere düş (Dalga B-3).
      try {
        key = decodeURIComponent(rawKey);
      } catch {
        key = rawKey;
      }
    }
    return key || null;
  }

  /**
   * Public URL varsa onu; yoksa presigned GET (public bucket, 15 dk TTL). Public
   * profil cover/galeri render'ında kullanılır. INV-STORAGE-1: yalnız public-sınıf
   * anahtarlarda anlamlıdır — private anahtar için `getPublicUrl` null döner ve
   * presigned de private değil public bucket'tan üretilir (assertKeyBucket ile
   * private anahtar buraya gelirse fırlatır).
   */
  async resolveImageUrl(
    key: string | null | undefined,
  ): Promise<string | null> {
    if (!key) return null;
    const publicUrl = this.getPublicUrl(key);
    if (publicUrl) return publicUrl;
    return this.generatePresignedGet("public", key);
  }

  // ── CORS ──────────────────────────────────────────────────────────────────

  /** Mevcut bucket CORS policy'sini oku. Set edilmemişse []. */
  async getBucketCorsConfig(bucket: BucketKind): Promise<CORSRule[]> {
    try {
      const result = await this.client.send(
        new GetBucketCorsCommand({ Bucket: this.bucketName(bucket) }),
      );
      return result.CORSRules ?? [];
    } catch (err) {
      const e = err as { name?: string; Code?: string };
      if (e?.name === "NoSuchCORSConfiguration" || e?.Code === "NoSuchCORSConfiguration") {
        return [];
      }
      throw err;
    }
  }

  /**
   * Allowed origin'leri `CORS_ORIGINS` env'inden okur — backend CORS ile aynı set.
   * Ek olarak tüm Vercel deploy/preview origin'leri izinli (S3/R2 tek `*` wildcard
   * destekler). Güvenlik sınırı CORS değil BUCKET AYRIMI + presigned imzadır.
   */
  private buildAllowedOrigins(): string[] {
    const raw = this.configService.get<string>(
      "CORS_ORIGINS",
      "http://localhost:3000,http://localhost:3001",
    );
    const origins = raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    if (!origins.includes("https://*.vercel.app")) {
      origins.push("https://*.vercel.app");
    }
    return origins;
  }

  /** Idempotent — istenen config zaten kuruluysa skip, değilse PutBucketCors. */
  private async ensureCorsPolicy(bucketName: string): Promise<void> {
    const current = await this.rawCors(bucketName);
    // PAYLAŞILAN BUCKET: dev ve prod AYNI bucket'lara koşar ve her ortam yalnız
    // KENDİ CORS_ORIGINS'ini bilir. Replace, diğer ortamın origin'lerini siler
    // (prod deploy localhost'u, lokal boot www.rothern.com'u düşürür → o ortamın
    // tarayıcı PUT'ları kırılır). Bu yüzden mevcut origin'lerle UNION'lanır;
    // origin'ler yalnız birikir, env'den silmek bucket CORS'undan silmez.
    // Güvenlik sınırı CORS değil presigned imzadır (bkz. buildAllowedOrigins).
    const currentOrigins = current.flatMap((r) => r.AllowedOrigins ?? []);
    const desired: CORSRule[] = [
      {
        AllowedOrigins: [
          ...new Set([...this.buildAllowedOrigins(), ...currentOrigins]),
        ].sort(),
        AllowedMethods: CORS_ALLOWED_METHODS,
        AllowedHeaders: CORS_ALLOWED_HEADERS,
        ExposeHeaders: CORS_EXPOSE_HEADERS,
        MaxAgeSeconds: CORS_MAX_AGE_SECONDS,
      },
    ];

    if (this.corsRulesEqual(current, desired)) {
      this.logger.log(
        `R2 bucket "${bucketName}" CORS policy güncel (origins: ${desired[0]!.AllowedOrigins?.join(", ")})`,
      );
      return;
    }

    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: bucketName,
          CORSConfiguration: { CORSRules: desired },
        }),
      );
      this.logger.log(
        `R2 bucket "${bucketName}" CORS policy ${current.length === 0 ? "kuruldu" : "güncellendi"} (origins: ${desired[0]!.AllowedOrigins?.join(", ")})`,
      );
    } catch (err) {
      const e = err as { name?: string; message?: string };
      this.logger.warn(
        `R2 bucket "${bucketName}" CORS policy set edilemedi (${e?.name ?? "?"}): ${e?.message ?? String(err)}. Browser uploadları başarısız olabilir; token'ın PutBucketCors izni olduğunu kontrol et.`,
      );
    }
  }

  /** Ham (bucket adıyla) CORS okuma — hem init hem debug endpoint için. */
  private async rawCors(bucketName: string): Promise<CORSRule[]> {
    try {
      const result = await this.client.send(
        new GetBucketCorsCommand({ Bucket: bucketName }),
      );
      return result.CORSRules ?? [];
    } catch (err) {
      const e = err as { name?: string; Code?: string };
      if (e?.name === "NoSuchCORSConfiguration" || e?.Code === "NoSuchCORSConfiguration") {
        return [];
      }
      throw err;
    }
  }

  /** Sıralamadan bağımsız basit equality — set'lerin aynı olup olmadığına bakar. */
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
