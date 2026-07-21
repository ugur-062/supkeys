import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CompanyVerificationStatus, KycDocStatus } from "@rothern/db";
import { randomUUID } from "node:crypto";
import { maskIban } from "@rothern/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { StorageService } from "../storage/storage.service";
import {
  assertReportedSize,
  assertSafeFileName,
  assertUploadedObjectValid,
} from "../../common/helpers/upload-validation";

/**
 * Belge türü → Company alanları (URL/key + inceleme durumu + red gerekçesi).
 * (6 KYC belgesi.) Admin her belgeyi ayrı onaylar/reddeder; reddedilen belge
 * firma tarafından yeniden yüklenebilir.
 */
export const DOC_META = {
  taxPlate: {
    url: "docTaxPlateUrl",
    status: "docTaxPlateStatus",
    reason: "docTaxPlateReason",
  },
  tradeRegistry: {
    url: "docTradeRegistryUrl",
    status: "docTradeRegistryStatus",
    reason: "docTradeRegistryReason",
  },
  signatureCircular: {
    url: "docSignatureCircularUrl",
    status: "docSignatureCircularStatus",
    reason: "docSignatureCircularReason",
  },
  activityCert: {
    url: "docActivityCertUrl",
    status: "docActivityCertStatus",
    reason: "docActivityCertReason",
  },
  idFront: {
    url: "docIdFrontUrl",
    status: "docIdFrontStatus",
    reason: "docIdFrontReason",
  },
  idBack: {
    url: "docIdBackUrl",
    status: "docIdBackStatus",
    reason: "docIdBackReason",
  },
} as const;
export type DocKind = keyof typeof DOC_META;
const KINDS = Object.keys(DOC_META) as DocKind[];
/** Geriye dönük: türe göre yalnız URL alanı. */
export const DOC_FIELDS = Object.fromEntries(
  KINDS.map((k) => [k, DOC_META[k].url]),
) as Record<DocKind, string>;

// Ülkeye göre ZORUNLU belge seti. TR: 6 KYC. Yabancı: daha az/farklı belge
// (Certificate of Incorporation + Tax/VAT Certificate + Yetkili Kimlik) →
// admin manuel KYB onayı. (Alanlar aynı; anlam/etiket ülkeye göre.)
const FOREIGN_REQUIRED: DocKind[] = ["tradeRegistry", "taxPlate", "idFront"];
export function requiredKinds(country: string | null | undefined): DocKind[] {
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
    private readonly audit: AuditService,
  ) {}

  async get(companyId: string) {
    // Belge alanları (url/status/reason) + KYC/genel alanları tek select'te.
    const docSelect = Object.fromEntries(
      KINDS.flatMap((k) => [
        [DOC_META[k].url, true],
        [DOC_META[k].status, true],
        [DOC_META[k].reason, true],
      ]),
    );
    const c = (await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        ...docSelect,
        country: true,
        companyVerificationStatus: true,
        companyVerifiedAt: true,
        companyRejectionReason: true,
        mersisNo: true,
        tradeRegistryNo: true,
        iban: true,
        ibanHolder: true,
      },
    })) as Record<string, unknown> | null;
    if (!c) throw new NotFoundException("Firma bulunamadı");
    // Hassas KYC belgeleri: kalıcı public URL yerine kısa ömürlü presigned GET
    // (bucket public olsa bile yetkisiz erişim engellenir).
    const entries = await Promise.all(
      KINDS.map(
        async (k) =>
          [
            k,
            await this.storage.presignStoredObject(
              "private",
              c[DOC_META[k].url] as string | null,
            ),
          ] as const,
      ),
    );
    const docs = Object.fromEntries(entries) as Record<DocKind, string | null>;
    const docStatus = Object.fromEntries(
      KINDS.map((k) => [k, c[DOC_META[k].status] as KycDocStatus]),
    ) as Record<DocKind, KycDocStatus>;
    const docReason = Object.fromEntries(
      KINDS.map((k) => [k, (c[DOC_META[k].reason] as string | null) ?? null]),
    ) as Record<DocKind, string | null>;
    return {
      status: c.companyVerificationStatus as CompanyVerificationStatus,
      verifiedAt: c.companyVerifiedAt as Date | null,
      rejectionReason: c.companyRejectionReason as string | null,
      country: c.country as string | null,
      docs,
      docStatus,
      docReason,
      required: requiredKinds(c.country as string | null),
      // KYC kimlik alanları — formda ön-doldurma + gönderimde zorunlu.
      mersisNo: c.mersisNo as string | null,
      tradeRegistryNo: c.tradeRegistryNo as string | null,
      iban: c.iban as string | null,
      ibanHolder: c.ibanHolder as string | null,
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
    const url = await this.storage.generatePresignedPut("private", key, mimeType);
    return { url, key };
  }

  async commit(
    companyId: string,
    kind: string,
    key: string,
    actor?: AuthenticatedCompanyUser,
  ) {
    if (!(kind in DOC_META)) throw new BadRequestException("Geçersiz belge türü");
    const k = kind as DocKind;
    // GÜVENLİK: key yalnız BU firmanın klasörüne işaret edebilir; aksi halde
    // başka firmanın/rastgele bir nesnenin URL'i kaydedilebilirdi.
    if (!key.startsWith(`company-docs/${companyId}/`)) {
      throw new BadRequestException("Geçersiz dosya anahtarı");
    }
    // KİLİT: belge yalnız (a) hiç gönderilmemişken (UNVERIFIED) ya da (b) genel
    // durum REJECTED iken ve BU belge onaylı değilken değiştirilebilir. İnceleme
    // sürerken (PENDING) veya doğrulanmışken (VERIFIED) ya da onaylı belgeye
    // yükleme reddedilir — UI kilidini atlayan istekler de burada durur.
    const company = (await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { companyVerificationStatus: true, [DOC_META[k].status]: true },
    })) as
      | ({ companyVerificationStatus: CompanyVerificationStatus } & Record<
          string,
          unknown
        >)
      | null;
    if (!company) throw new NotFoundException("Firma bulunamadı");
    const overall = company.companyVerificationStatus;
    const docStatus = company[DOC_META[k].status] as KycDocStatus;
    const editable =
      overall === "UNVERIFIED" ||
      (overall === "REJECTED" && docStatus !== "APPROVED");
    if (!editable) {
      throw new BadRequestException(
        overall === "PENDING"
          ? "Doğrulama inceleniyor; belge değiştirilemez"
          : overall === "VERIFIED"
            ? "Firma zaten doğrulandı; belge değiştirilemez"
            : "Bu belge onaylandı; değiştirilemez",
      );
    }
    await assertUploadedObjectValid(this.storage, "private", key);
    // KEY saklanır (public URL değil); okurken presigned GET üretilir. Yeniden
    // yüklenen (reddedilmiş) belge PENDING'e döner, red gerekçesi temizlenir.
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        [DOC_META[k].url]: key,
        [DOC_META[k].status]: "PENDING",
        [DOC_META[k].reason]: null,
      },
    });
    // INV-AUDIT-1: KYC belge yüklemesi iz bırakır (tür adı; key/URL yazılmaz).
    await this.audit.log({
      action: "company.docs.uploaded",
      actorType: "company",
      actorId: actor?.userId ?? null,
      actorEmail: actor?.email ?? null,
      tenantId: companyId,
      entityType: "company",
      entityId: companyId,
      metadata: { kind: k },
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
    actor?: AuthenticatedCompanyUser,
  ) {
    const { docs, docStatus, status, required, country } =
      await this.get(companyId);
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
    // Onaylı belgeler APPROVED kalır (admin yeniden incelemez); onaylı olmayan
    // (PENDING/REJECTED) belgeler PENDING'e çekilir + gerekçeleri temizlenir.
    const docStatusReset = Object.fromEntries(
      required
        .filter((k) => docStatus[k] !== "APPROVED")
        .flatMap((k) => [
          [DOC_META[k].status, "PENDING"],
          [DOC_META[k].reason, null],
        ]),
    );
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        companyVerificationStatus: "PENDING",
        companyRejectionReason: null, // yeniden gönderimde eski red temizlenir
        ...docStatusReset,
        ...(mersisNo !== undefined ? { mersisNo } : {}),
        ...(tradeRegistryNo !== undefined ? { tradeRegistryNo } : {}),
        ...(iban !== undefined ? { iban } : {}),
        ...(ibanHolder !== undefined ? { ibanHolder } : {}),
      },
    });
    // INV-AUDIT-1: doğrulamaya gönderim — KYC alan ADLARI + sıfırlanan belge
    // türleri; IBAN yalnız maskeli referans. IBAN yazımı para-yolu → critical.
    const kycFields = (
      ["mersisNo", "tradeRegistryNo", "iban", "ibanHolder"] as const
    ).filter((f) => kyc[f] !== undefined);
    await this.audit.log({
      action: "company.docs.submitted",
      actorType: "company",
      actorId: actor?.userId ?? null,
      actorEmail: actor?.email ?? null,
      tenantId: companyId,
      entityType: "company",
      entityId: companyId,
      metadata: {
        kycFields,
        resetDocs: required.filter((k) => docStatus[k] !== "APPROVED"),
        ...(iban !== undefined ? { ibanMasked: maskIban(iban) } : {}),
      },
      critical: iban !== undefined,
    });
    return { ok: true };
  }
}
