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
export class CompanyBidDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** İlan teklife açık (OPEN) değilse belge değişikliği yapılamaz. */
  private async assertListingOpen(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { status: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.status !== "OPEN") {
      throw new BadRequestException(
        "İhale teklife kapalı — belge eklenemez/silinemez",
      );
    }
  }

  /** Teklif sahibinin bu ilandaki teklifini bulur (yoksa hata). */
  private async requireOwnBid(
    user: AuthenticatedCompanyUser,
    listingId: string,
  ) {
    const bid = await this.prisma.listingBid.findUnique({
      where: {
        listingId_bidderCompanyId: {
          listingId,
          bidderCompanyId: user.companyId,
        },
      },
      select: { id: true },
    });
    if (!bid) {
      throw new BadRequestException("Önce teklif verin, sonra belge ekleyin");
    }
    return bid;
  }

  async requestUploadUrl(
    user: AuthenticatedCompanyUser,
    listingId: string,
    input: { fileName: string; mimeType: string },
  ) {
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new BadRequestException("Sadece PDF, görsel veya Excel yüklenebilir");
    }
    await this.assertListingOpen(listingId);
    await this.requireOwnBid(user, listingId);
    const safe = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const key = `listing-bids/${listingId}/${user.companyId}/${crypto.randomUUID()}-${safe}`;
    const url = await this.storage.generatePresignedPut(key, input.mimeType);
    return { url, key };
  }

  async register(
    user: AuthenticatedCompanyUser,
    listingId: string,
    input: { key: string; fileName: string; mimeType: string },
  ) {
    await this.assertListingOpen(listingId);
    const bid = await this.requireOwnBid(user, listingId);
    const doc = await this.prisma.listingBidDocument.create({
      data: {
        bidId: bid.id,
        key: input.key,
        fileName: input.fileName.slice(0, 200),
        mimeType: input.mimeType,
        uploadedByCompanyId: user.companyId,
      },
    });
    return { id: doc.id };
  }

  /** İlan sahibi tüm teklif belgelerini; teklifçi yalnızca kendi belgelerini görür. */
  async list(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    const isOwner = listing.companyId === user.companyId;

    const docs = await this.prisma.listingBidDocument.findMany({
      where: isOwner
        ? { bid: { listingId } }
        : { bid: { listingId, bidderCompanyId: user.companyId } },
      include: { bid: { include: { bidderCompany: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        bidId: d.bidId,
        bidderName: d.bid.bidderCompany.name,
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
    const doc = await this.prisma.listingBidDocument.findUnique({
      where: { id: docId },
      include: { bid: { select: { listingId: true } } },
    });
    if (!doc || doc.bid.listingId !== listingId) {
      throw new NotFoundException("Belge bulunamadı");
    }
    if (doc.uploadedByCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu belgeyi silemezsiniz");
    }
    await this.assertListingOpen(listingId);
    await this.storage.deleteObject(doc.key).catch(() => undefined);
    await this.prisma.listingBidDocument.delete({ where: { id: docId } });
    return { ok: true };
  }
}
