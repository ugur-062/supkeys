import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import {
  assertReportedSize,
  assertSafeFileName,
  assertUploadedObjectValid,
} from "../../common/helpers/upload-validation";

/** Belge türü → Company alanı. (6 KYC belgesi.) */
export const DOC_FIELDS = {
  taxPlate: "docTaxPlateUrl",
  tradeRegistry: "docTradeRegistryUrl",
  signatureCircular: "docSignatureCircularUrl",
  activityCert: "docActivityCertUrl",
  idFront: "docIdFrontUrl",
  idBack: "docIdBackUrl",
} as const;
type DocKind = keyof typeof DOC_FIELDS;
const KINDS = Object.keys(DOC_FIELDS) as DocKind[];

// Ülkeye göre ZORUNLU belge seti. TR: 6 KYC. Yabancı: daha az/farklı belge
// (Certificate of Incorporation + Tax/VAT Certificate + Yetkili Kimlik) →
// admin manuel KYB onayı. (Alanlar aynı; anlam/etiket ülkeye göre.)
const FOREIGN_REQUIRED: DocKind[] = ["tradeRegistry", "taxPlate", "idFront"];
function requiredKinds(country: string | null | undefined): DocKind[] {
  return (country ?? "TR").toUpperCase() === "TR" ? KINDS : FOREIGN_REQUIRED;
}

const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

@Injectable()
export class CompanyDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async get(companyId: string) {
    const c = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        docTaxPlateUrl: true,
        docTradeRegistryUrl: true,
        docSignatureCircularUrl: true,
        docActivityCertUrl: true,
        docIdFrontUrl: true,
        docIdBackUrl: true,
        country: true,
        companyVerificationStatus: true,
        companyVerifiedAt: true,
        companyRejectionReason: true,
        mersisNo: true,
        tradeRegistryNo: true,
        iban: true,
        ibanHolder: true,
      },
    });
    if (!c) throw new NotFoundException("Firma bulunamadı");
    // Hassas KYC belgeleri: kalıcı public URL yerine kısa ömürlü presigned GET
    // (bucket public olsa bile yetkisiz erişim engellenir).
    const entries = await Promise.all(
      KINDS.map(
        async (k) =>
          [k, await this.storage.presignStoredObject(c[DOC_FIELDS[k]])] as const,
      ),
    );
    const docs = Object.fromEntries(entries) as Record<DocKind, string | null>;
    return {
      status: c.companyVerificationStatus,
      verifiedAt: c.companyVerifiedAt,
      rejectionReason: c.companyRejectionReason,
      country: c.country,
      docs,
      required: requiredKinds(c.country),
      // KYC kimlik alanları — formda ön-doldurma + gönderimde zorunlu.
      mersisNo: c.mersisNo,
      tradeRegistryNo: c.tradeRegistryNo,
      iban: c.iban,
      ibanHolder: c.ibanHolder,
    };
  }

  async uploadUrl(
    companyId: string,
    kind: string,
    fileName: string,
    mimeType: string,
    fileSize?: number,
  ) {
    if (!(kind in DOC_FIELDS)) throw new BadRequestException("Geçersiz belge türü");
    if (!ALLOWED_MIME.includes(mimeType)) {
      throw new BadRequestException("Sadece PDF veya görsel yüklenebilir");
    }
    assertSafeFileName(fileName);
    assertReportedSize(fileSize);
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const key = `company-docs/${companyId}/${kind}-${randomUUID()}-${safe}`;
    const url = await this.storage.generatePresignedPut(key, mimeType);
    return { url, key };
  }

  async commit(companyId: string, kind: string, key: string) {
    if (!(kind in DOC_FIELDS)) throw new BadRequestException("Geçersiz belge türü");
    // GÜVENLİK: key yalnız BU firmanın klasörüne işaret edebilir; aksi halde
    // başka firmanın/rastgele bir nesnenin URL'i kaydedilebilirdi.
    if (!key.startsWith(`company-docs/${companyId}/`)) {
      throw new BadRequestException("Geçersiz dosya anahtarı");
    }
    await assertUploadedObjectValid(this.storage, key);
    // KEY saklanır (public URL değil); okurken presigned GET üretilir.
    await this.prisma.company.update({
      where: { id: companyId },
      data: { [DOC_FIELDS[kind as DocKind]]: key },
    });
    return { ok: true };
  }

  /** Tüm belgeler yüklüyse doğrulamaya gönder (PENDING). */
  async submit(
    companyId: string,
    kyc: {
      mersisNo?: string;
      tradeRegistryNo?: string;
      iban?: string;
      ibanHolder?: string;
    } = {},
  ) {
    const { docs, status, required, country } = await this.get(companyId);
    const missing = required.filter((k) => !docs[k]);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Eksik belge var (${missing.length}); tüm belgeleri yükleyin`,
      );
    }
    if (status === "VERIFIED") {
      throw new BadRequestException("Firma zaten doğrulanmış");
    }
    if (status === "PENDING") {
      throw new BadRequestException("Doğrulama zaten inceleniyor");
    }
    // KYC kimlik bilgileri — TR firmalar için zorunlu (yabancıda opsiyonel,
    // admin manuel KYB yapar). IBAN basit format kontrolü.
    const isTR = (country ?? "TR").toUpperCase() === "TR";
    const mersisNo = kyc.mersisNo?.trim();
    const tradeRegistryNo = kyc.tradeRegistryNo?.trim();
    const iban = kyc.iban?.replace(/\s+/g, "").toUpperCase();
    const ibanHolder = kyc.ibanHolder?.trim();
    if (isTR) {
      if (!mersisNo || mersisNo.length < 10) {
        throw new BadRequestException("MERSİS numarası gerekli (16 hane).");
      }
      if (!tradeRegistryNo) {
        throw new BadRequestException("Ticari sicil numarası gerekli.");
      }
      if (!iban || !/^TR\d{24}$/.test(iban)) {
        throw new BadRequestException(
          "Geçerli bir IBAN gerekli (TR + 24 rakam).",
        );
      }
      if (!ibanHolder) {
        throw new BadRequestException("IBAN hesap sahibi gerekli.");
      }
    }
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        companyVerificationStatus: "PENDING",
        companyRejectionReason: null, // yeniden gönderimde eski red temizlenir
        ...(mersisNo !== undefined ? { mersisNo } : {}),
        ...(tradeRegistryNo !== undefined ? { tradeRegistryNo } : {}),
        ...(iban !== undefined ? { iban } : {}),
        ...(ibanHolder !== undefined ? { ibanHolder } : {}),
      },
    });
    return { ok: true };
  }
}
