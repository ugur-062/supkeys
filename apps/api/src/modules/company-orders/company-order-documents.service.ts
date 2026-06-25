import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { CompanyDocType } from "@supkeys/db";
import * as crypto from "crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

@Injectable()
export class CompanyOrderDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Yükleme için presigned PUT URL üretir (R2'ya doğrudan yükleme). */
  async requestUploadUrl(
    user: AuthenticatedCompanyUser,
    orderId: string,
    input: { fileName: string; mimeType: string; type: CompanyDocType },
  ) {
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new BadRequestException("Sadece PDF veya görsel yüklenebilir");
    }
    await this.assertCanUpload(user, orderId, input.type);

    const safe = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const key = `company-orders/${orderId}/${input.type.toLowerCase()}/${crypto.randomUUID()}-${safe}`;
    const url = await this.storage.generatePresignedPut(key, input.mimeType);
    return { url, key };
  }

  /** Yükleme tamamlanınca belge kaydını oluşturur. */
  async register(
    user: AuthenticatedCompanyUser,
    orderId: string,
    input: {
      type: CompanyDocType;
      key: string;
      fileName: string;
      mimeType: string;
    },
  ) {
    await this.assertCanUpload(user, orderId, input.type);
    const doc = await this.prisma.companyOrderDocument.create({
      data: {
        orderId,
        type: input.type,
        key: input.key,
        fileName: input.fileName.slice(0, 200),
        mimeType: input.mimeType,
        uploadedByCompanyId: user.companyId,
      },
    });
    return { id: doc.id };
  }

  /** Siparişin belgeleri (her iki taraf görür) — indirme için presigned GET. */
  async list(user: AuthenticatedCompanyUser, orderId: string) {
    await this.requireParty(user, orderId);
    const docs = await this.prisma.companyOrderDocument.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        type: d.type,
        fileName: d.fileName,
        mimeType: d.mimeType,
        createdAt: d.createdAt,
        url: await this.storage.generatePresignedGet(d.key, d.fileName),
      })),
    );
  }

  async remove(user: AuthenticatedCompanyUser, orderId: string, docId: string) {
    const doc = await this.prisma.companyOrderDocument.findUnique({
      where: { id: docId },
    });
    if (!doc || doc.orderId !== orderId) {
      throw new NotFoundException("Belge bulunamadı");
    }
    // Sadece yükleyen firma silebilir.
    if (doc.uploadedByCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu belgeyi silemezsiniz");
    }
    await this.storage.deleteObject(doc.key).catch(() => undefined);
    await this.prisma.companyOrderDocument.delete({ where: { id: docId } });
    return { ok: true };
  }

  // ---- yetki ----
  private async requireParty(user: AuthenticatedCompanyUser, orderId: string) {
    const order = await this.prisma.companyOrder.findUnique({
      where: { id: orderId },
      select: { sellerCompanyId: true, buyerCompanyId: true },
    });
    if (
      !order ||
      (order.sellerCompanyId !== user.companyId &&
        order.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    return order;
  }

  /** DELIVERY → satıcı yükler; PAYMENT → alıcı yükler. */
  private async assertCanUpload(
    user: AuthenticatedCompanyUser,
    orderId: string,
    type: CompanyDocType,
  ) {
    const order = await this.requireParty(user, orderId);
    const isSeller = order.sellerCompanyId === user.companyId;
    if (type === "DELIVERY" && !isSeller) {
      throw new ForbiddenException("Teslim belgesini satıcı yükler");
    }
    if (type === "PAYMENT" && isSeller) {
      throw new ForbiddenException("Ödeme dekontunu alıcı yükler");
    }
  }
}
