import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { StorageService } from "../../modules/storage/storage.service";
import {
  MAX_IMAGE_BYTES,
  assertUploadedObjectValid,
} from "../helpers/upload-validation";

/**
 * HERKESE AÇIK GÖRSEL YÜKLEME — TEK KAYNAK.
 *
 * Firma profili (logo/kapak/galeri) ve ÜRÜN görselleri aynı public kovaya,
 * aynı prefix altına, aynı güvenlik kurallarıyla yazılır. Bu dosya çıkmadan
 * önce mantık `CompanyProfileService`de gömülüydü; ürün görselleri için
 * kopyalansaydı aşağıdaki sertleştirmelerin biri sessizce eksik kalırdı — ve
 * hangisi eksik kalırsa o bir güvenlik açığı olurdu:
 *
 *  · HER YÜKLEME BENZERSİZ ANAHTAR — sabit anahtar iki soruna yol açıyordu:
 *    R2 object-lock politikasında ikinci yazma 409 (görsel bir daha
 *    DEĞİŞTİRİLEMİYOR, canlıda görüldü) ve CDN önbelleğinde eski görsel kalıyor.
 *  · IDOR — istemcinin verdiği anahtar YALNIZ kendi firmasının prefix'inde
 *    olabilir; aksi hâlde aynı kovadaki başka firmanın nesnesine URL üretilir.
 *  · OTORİTATİF DOĞRULAMA — presigned PUT ne boyutu ne içerik tipini
 *    imzalayamaz. Yükleme bittikten SONRA nesne gerçekten okunup boyut ve
 *    GERÇEK MIME kontrol edilir; public kovadaki bir HTML/SVG,
 *    cdn.rothern.com'da barındırılan XSS demektir.
 *  · CDN YOKSA FAIL-CLOSED — presigned GET 15 dakikada ölür; onu kalıcı alana
 *    yazmak görselin çeyrek saat sonra ölmesi demek. CDN tabanı yoksa hata.
 */
const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
/** Ürün belgeleri (katalog/teknik föy) — yalnız PDF; ofis biçimleri makro taşır. */
const DOCUMENT_MIME = ["application/pdf"];
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type PublicImageKind = "logo" | "cover" | "gallery" | "product";

export async function requestPublicImageUpload(
  storage: StorageService,
  companyId: string,
  kind: PublicImageKind,
  fileName: string,
  mimeType: string,
): Promise<{ url: string; key: string }> {
  if (!IMAGE_MIME.includes(mimeType)) {
    throw new BadRequestException("Yalnızca JPEG, PNG veya WebP yüklenebilir");
  }
  const key = storage.buildTenantProfileKey(
    companyId,
    kind,
    randomUUID(),
    fileName,
  );
  const url = await storage.generatePresignedPut("public", key, mimeType);
  return { url, key };
}

/**
 * Ürün BELGESİ (PDF) yükleme — görsel yoluyla aynı iskelet (presigned PUT →
 * yükleme sonrası gerçek MIME/boyut doğrulaması), farklı allowlist. Aynı
 * fonksiyonu tip parametresiyle genişletmek yerine ayrı tutuldu: iki
 * allowlist'in karışması public CDN'de HTML/SVG barındırmak demek.
 */
export async function requestPublicDocumentUpload(
  storage: StorageService,
  companyId: string,
  fileName: string,
  mimeType: string,
): Promise<{ url: string; key: string }> {
  if (!DOCUMENT_MIME.includes(mimeType)) {
    throw new BadRequestException("Yalnızca PDF yüklenebilir");
  }
  const key = storage.buildTenantProfileKey(
    companyId,
    "document",
    randomUUID(),
    fileName,
  );
  const url = await storage.generatePresignedPut("public", key, mimeType);
  return { url, key };
}

export async function resolvePublicDocument(
  storage: StorageService,
  companyId: string,
  key: string,
): Promise<{ url: string }> {
  if (!key.startsWith(storage.buildTenantProfilePrefix(companyId))) {
    throw new ForbiddenException("Bu belge anahtarına erişim yetkiniz yok");
  }
  await assertUploadedObjectValid(
    storage,
    "public",
    key,
    MAX_DOCUMENT_BYTES,
    DOCUMENT_MIME,
  );
  const url = storage.getPublicUrl(key);
  if (!url) {
    throw new ServiceUnavailableException(
      "Belge yayınlama yapılandırması eksik (R2_PUBLIC_BASE_URL) — belge yüklenemedi. Lütfen sistem yöneticinize bildirin.",
    );
  }
  return { url };
}

export async function resolvePublicImage(
  storage: StorageService,
  companyId: string,
  key: string,
): Promise<{ url: string }> {
  if (!key.startsWith(storage.buildTenantProfilePrefix(companyId))) {
    throw new ForbiddenException("Bu görsel anahtarına erişim yetkiniz yok");
  }
  await assertUploadedObjectValid(
    storage,
    "public",
    key,
    MAX_IMAGE_BYTES,
    IMAGE_MIME,
  );
  const url = storage.getPublicUrl(key);
  if (!url) {
    throw new ServiceUnavailableException(
      "Görsel yayınlama yapılandırması eksik (R2_PUBLIC_BASE_URL) — görsel yüklenemedi. Lütfen sistem yöneticinize bildirin.",
    );
  }
  return { url };
}
