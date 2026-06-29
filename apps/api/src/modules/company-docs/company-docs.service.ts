import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

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
        companyVerificationStatus: true,
        companyVerifiedAt: true,
      },
    });
    if (!c) throw new NotFoundException("Firma bulunamadı");
    const docs = Object.fromEntries(
      KINDS.map((k) => [k, c[DOC_FIELDS[k]] ?? null]),
    ) as Record<DocKind, string | null>;
    return {
      status: c.companyVerificationStatus,
      verifiedAt: c.companyVerifiedAt,
      docs,
      required: KINDS,
    };
  }

  async uploadUrl(
    companyId: string,
    kind: string,
    fileName: string,
    mimeType: string,
  ) {
    if (!(kind in DOC_FIELDS)) throw new BadRequestException("Geçersiz belge türü");
    if (!ALLOWED_MIME.includes(mimeType)) {
      throw new BadRequestException("Sadece PDF veya görsel yüklenebilir");
    }
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const key = `company-docs/${companyId}/${kind}-${randomUUID()}-${safe}`;
    const url = await this.storage.generatePresignedPut(key, mimeType);
    return { url, key };
  }

  async commit(companyId: string, kind: string, key: string) {
    if (!(kind in DOC_FIELDS)) throw new BadRequestException("Geçersiz belge türü");
    const url = this.storage.getPublicUrl(key) ?? key;
    await this.prisma.company.update({
      where: { id: companyId },
      data: { [DOC_FIELDS[kind as DocKind]]: url },
    });
    return { url };
  }

  /** Tüm belgeler yüklüyse doğrulamaya gönder (PENDING). */
  async submit(companyId: string) {
    const { docs, status } = await this.get(companyId);
    const missing = KINDS.filter((k) => !docs[k]);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Eksik belge var (${missing.length}); tüm belgeleri yükleyin`,
      );
    }
    if (status === "VERIFIED") {
      throw new BadRequestException("Firma zaten doğrulanmış");
    }
    await this.prisma.company.update({
      where: { id: companyId },
      data: { companyVerificationStatus: "PENDING" },
    });
    return { ok: true };
  }
}
