import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

/** Madde 29 — FAZ 3.2: 6 zorunlu doğrulama belgesi. */
export const COMPANY_DOC_TYPES = [
  "TAX_PLATE",
  "TRADE_REGISTRY",
  "SIGNATURE_CIRCULAR",
  "ACTIVITY_CERT",
  "ID_FRONT",
  "ID_BACK",
] as const;
export type CompanyDocType = (typeof COMPANY_DOC_TYPES)[number];

/** docType → Tenant/Supplier model alanı (ikisinde de aynı isimde). */
const DOC_FIELD: Record<CompanyDocType, string> = {
  TAX_PLATE: "docTaxPlateUrl",
  TRADE_REGISTRY: "docTradeRegistryUrl",
  SIGNATURE_CIRCULAR: "docSignatureCircularUrl",
  ACTIVITY_CERT: "docActivityCertUrl",
  ID_FRONT: "docIdFrontUrl",
  ID_BACK: "docIdBackUrl",
};

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];

export type CompanyOwner =
  | { type: "supplier"; id: string }
  | { type: "tenant"; id: string };

@Injectable()
export class CompanyDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private assertDocType(docType: string): asserts docType is CompanyDocType {
    if (!COMPANY_DOC_TYPES.includes(docType as CompanyDocType)) {
      throw new BadRequestException("Geçersiz belge türü");
    }
  }

  /** Presigned PUT URL üret (client doğrudan R2'ya yükler). */
  async createUploadUrl(
    owner: CompanyOwner,
    docType: string,
    filename: string,
    mimeType: string,
  ): Promise<{ key: string; uploadUrl: string }> {
    this.assertDocType(docType);
    if (!ALLOWED_MIME.includes(mimeType)) {
      throw new BadRequestException("Yalnızca PDF, JPG veya PNG yükleyebilirsiniz");
    }
    const key = this.storage.buildKey(
      `company-${owner.type}-${owner.id}`,
      `${docType}-${Date.now()}`,
      filename,
    );
    const uploadUrl = await this.storage.generatePresignedPut(key, mimeType);
    return { key, uploadUrl };
  }

  /** Yüklenen R2 key'ini ilgili alana kaydet; 6/6 dolduysa PENDING'e geçir. */
  async saveDoc(owner: CompanyOwner, docType: string, key: string) {
    this.assertDocType(docType);
    const field = DOC_FIELD[docType];
    await this.updateOwner(owner, { [field]: key });

    const status = await this.getStatus(owner);
    if (status.allUploaded && status.companyVerificationStatus === "UNVERIFIED") {
      await this.updateOwner(owner, { companyVerificationStatus: "PENDING" });
      status.companyVerificationStatus = "PENDING";
    }
    return status;
  }

  /** Tüm belgelerin durumu + (yüklü ise) presigned indirme URL'i. */
  async getStatus(owner: CompanyOwner) {
    const row = await this.readOwner(owner);
    const docs = await Promise.all(
      COMPANY_DOC_TYPES.map(async (docType) => {
        const key = row[DOC_FIELD[docType]] as string | null;
        return {
          docType,
          uploaded: !!key,
          url: key ? await this.storage.generatePresignedGet(key) : null,
        };
      }),
    );
    const allUploaded = docs.every((d) => d.uploaded);
    return {
      docs,
      allUploaded,
      companyVerificationStatus: row.companyVerificationStatus as string,
    };
  }

  // ---- owner (supplier|tenant) yardımcıları ----

  private async readOwner(
    owner: CompanyOwner,
  ): Promise<Record<string, unknown>> {
    const select = {
      docTaxPlateUrl: true,
      docTradeRegistryUrl: true,
      docSignatureCircularUrl: true,
      docActivityCertUrl: true,
      docIdFrontUrl: true,
      docIdBackUrl: true,
      companyVerificationStatus: true,
    };
    const row =
      owner.type === "supplier"
        ? await this.prisma.supplier.findUnique({
            where: { id: owner.id },
            select,
          })
        : await this.prisma.tenant.findUnique({
            where: { id: owner.id },
            select,
          });
    if (!row) throw new BadRequestException("Firma bulunamadı");
    return row as Record<string, unknown>;
  }

  private async updateOwner(
    owner: CompanyOwner,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (owner.type === "supplier") {
      await this.prisma.supplier.update({ where: { id: owner.id }, data });
    } else {
      await this.prisma.tenant.update({ where: { id: owner.id }, data });
    }
  }
}
