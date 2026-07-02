import { BadRequestException } from "@nestjs/common";
import type { StorageService } from "../../modules/storage/storage.service";

/** Yükleme başına azami boyut (eski sistem paritesi: 50 MB). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

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
  key: string,
): Promise<void> {
  const head = await storage.checkExists(key);
  if (!head.exists) {
    throw new BadRequestException(
      "Dosya yüklenmemiş görünüyor — lütfen tekrar deneyin",
    );
  }
  if (head.size != null && head.size > MAX_UPLOAD_BYTES) {
    // Yetim (limit aşan) nesneyi temizle ki bucket şişmesin.
    await storage.deleteObject(key).catch(() => undefined);
    throw new BadRequestException("Dosya boyutu 50 MB sınırını aşıyor");
  }
}
