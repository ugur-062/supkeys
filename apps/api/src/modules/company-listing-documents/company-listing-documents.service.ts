import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { StorageService } from "../storage/storage.service";

const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

@Injectable()
export class CompanyListingDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async requireOwner(
    user: AuthenticatedCompanyUser,
    listingId: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi dosya ekleyebilir");
    }
    return listing;
  }

  /**
   * Belge değişikliği kilidi — ihale belgeleri ilanın içeriğidir; ilk SUBMITTED
   * teklif geldikten sonra eklenemez/silinemez (eski sistem edit kuralıyla
   * tutarlı). İndirme/listeleme her zaman serbest.
   */
  private async assertEditable(listingId: string) {
    const submitted = await this.prisma.listingBid.count({
      where: { listingId, status: "SUBMITTED" },
    });
    if (submitted > 0) {
      throw new BadRequestException(
        "Bu ihaleye teklif verilmiş; belgeler değiştirilemez",
      );
    }
  }

  async requestUploadUrl(
    user: AuthenticatedCompanyUser,
    listingId: string,
    input: { fileName: string; mimeType: string },
  ) {
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new BadRequestException("Sadece PDF, görsel veya Excel yüklenebilir");
    }
    await this.requireOwner(user, listingId);
    await this.assertEditable(listingId);
    const safe = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const key = `listing-docs/${listingId}/${crypto.randomUUID()}-${safe}`;
    const url = await this.storage.generatePresignedPut(key, input.mimeType);
    return { url, key };
  }

  async register(
    user: AuthenticatedCompanyUser,
    listingId: string,
    input: { key: string; fileName: string; mimeType: string },
  ) {
    await this.requireOwner(user, listingId);
    await this.assertEditable(listingId);
    const doc = await this.prisma.listingDocument.create({
      data: {
        listingId,
        key: input.key,
        fileName: input.fileName.slice(0, 200),
        mimeType: input.mimeType,
        uploadedByCompanyId: user.companyId,
      },
    });
    return { id: doc.id };
  }

  /** İlanı görebilen herkes (sahip + davetli/bağlı) dosyaları indirebilir. */
  async list(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    const docs = await this.prisma.listingDocument.findMany({
      where: { listingId },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        fileName: d.fileName,
        mimeType: d.mimeType,
        createdAt: d.createdAt,
        mine: d.uploadedByCompanyId === user.companyId,
        url: await this.storage.generatePresignedGet(d.key, d.fileName),
      })),
    );
  }

  async remove(
    user: AuthenticatedCompanyUser,
    listingId: string,
    docId: string,
  ) {
    await this.requireOwner(user, listingId);
    await this.assertEditable(listingId);
    const doc = await this.prisma.listingDocument.findUnique({
      where: { id: docId },
    });
    if (!doc || doc.listingId !== listingId) {
      throw new NotFoundException("Belge bulunamadı");
    }
    await this.storage.deleteObject(doc.key).catch(() => undefined);
    await this.prisma.listingDocument.delete({ where: { id: docId } });
    return { ok: true };
  }
}
