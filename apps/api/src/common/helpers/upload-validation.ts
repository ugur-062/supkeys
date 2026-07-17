import { BadRequestException } from "@nestjs/common";
import type {
  BucketKind,
  StorageService,
} from "../../modules/storage/storage.service";

/** Yükleme başına azami boyut (eski sistem paritesi: 50 MB). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Profil görselleri için daha sıkı tavan — public bucket, kalıcı, dünyaya açık. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Çalıştırılabilir / betik uzantıları — MIME "pdf" gösterse bile reddedilir. */
const FORBIDDEN_EXTENSIONS = new Set([
  "exe",
  "com",
  "bat",
  "cmd",
  "sh",
  "js",
  "mjs",
  "jar",
  "msi",
  "dll",
  "scr",
  "vbs",
  "ps1",
  "php",
  "phtml",
  "html",
  "htm",
  "svg", // inline script taşıyabilir
]);

/** Dosya adının uzantısı kara listedeyse reddet (istemci MIME'ına güvenilmez). */
export function assertSafeFileName(fileName: string): void {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext && FORBIDDEN_EXTENSIONS.has(ext)) {
    throw new BadRequestException("Bu dosya türü yüklenemez");
  }
}

/** İstemcinin bildirdiği boyut (upload-url aşaması) — erken ret. */
export function assertReportedSize(size: number | undefined): void {
  if (size != null && (size <= 0 || size > MAX_UPLOAD_BYTES)) {
    throw new BadRequestException(
      "Dosya boyutu 50 MB sınırını aşıyor veya geçersiz",
    );
  }
}

/**
 * register/commit aşamasında OTORİTATİF doğrulama: nesne R2'da GERÇEKTEN var mı
 * ve boyutu limiti aşıyor mu (istemcinin PUT başarısına körü körüne güvenmeyiz —
 * hayalet kayıt + boyut spoof'u kapanır).
 */
export async function assertUploadedObjectValid(
  storage: StorageService,
  bucket: BucketKind,
  key: string,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<void> {
  const head = await storage.checkExists(bucket, key);
  if (!head.exists) {
    throw new BadRequestException(
      "Dosya yüklenmemiş görünüyor — lütfen tekrar deneyin",
    );
  }
  if (head.size != null && head.size > maxBytes) {
    // Yetim (limit aşan) nesneyi temizle ki bucket şişmesin.
    await storage.deleteObject(bucket, key).catch(() => undefined);
    throw new BadRequestException(
      `Dosya boyutu ${Math.round(maxBytes / 1024 / 1024)} MB sınırını aşıyor`,
    );
  }
}

/**
 * SAKLANAN public görsel değeri (logoUrl/coverImageUrl/photos[]/certificateImages[])
 * KENDİ tenant-profile deposundan mı? Upload akışını baypas edip PATCH ile harici/
 * `data:`/phishing URL enjekte edilmesini engeller (değer public profilde `<img src>`
 * render edilir). İki geçerli URL biçimi desteklenir:
 *   1. CDN kalıcı URL:  <R2_PUBLIC_BASE_URL>/<env>/tenant-profile/<id>/...   (path = key)
 *   2. presigned GET:   <R2_ENDPOINT>/<bucket>/<env>/tenant-profile/<id>/... (path = bucket/key)
 * Bu yüzden `startsWith` DEĞİL `includes(tenantPrefix)` — iki biçimde de prefix
 * path'in FARKLI konumunda (kökte vs bucket-sonrası). host allowlist zaten harici
 * host'u eler; own-`tenantPrefix` içeren yalnız kendi objeleri olabilir.
 */
export function assertOwnProfileImageUrl(
  value: string,
  opts: { tenantPrefix: string; allowedHosts: string[] },
): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("Geçersiz görsel adresi");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new BadRequestException("Geçersiz görsel adresi"); // data:/javascript: elenir
  }
  if (!opts.allowedHosts.includes(url.host)) {
    throw new BadRequestException(
      "Görsel yalnız kendi profil deponuzdan olabilir",
    );
  }
  const path = decodeURIComponent(url.pathname).replace(/^\//, "");
  if (!path.includes(opts.tenantPrefix)) {
    throw new BadRequestException(
      "Görsel yalnız kendi profil deponuzdan olabilir",
    );
  }
}
