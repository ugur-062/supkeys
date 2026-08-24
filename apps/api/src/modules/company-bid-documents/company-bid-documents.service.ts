import { OWNER_VISIBLE_BID_STATUSES } from "../../common/company/bid-items";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "node:crypto";
import { ListingBidDocKind, type ListingType } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { bidderOpRole } from "../company-listings/bidder-op-role";
import { StorageService } from "../storage/storage.service";
import {
  assertReportedSize,
  assertSafeFileName,
  assertUploadedObjectValid,
} from "../../common/helpers/upload-validation";

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
      select: { status: true, type: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.status !== "OPEN") {
      throw new BadRequestException(
        "İhale teklife kapalı — belge eklenemez/silinemez",
      );
    }
    return listing;
  }

  /**
   * Teklif belgeleri teklifin İÇERİĞİDİR → placeBid ile AYNI op-rol kapısı
   * (bidderOpRole tek kaynak; Faz R: SAHIP muafiyeti yok — rolsüz/etiket-only
   * üye bağlayıcı teklife belge ekleyemez/silemez).
   */
  private assertBidderRole(
    user: AuthenticatedCompanyUser,
    listingType: ListingType,
  ) {
    const needed = bidderOpRole(listingType);
    if (!user.roles.includes(needed)) {
      throw new ForbiddenException(
        listingType === "ALIM"
          ? "Teklif belgeleri için Satışçı rolü gerekir"
          : "Teklif belgeleri için Satın Almacı rolü gerekir",
      );
    }
  }

  /**
   * Teklif sahibinin bu ilandaki teklifini bulur (yoksa hata).
   *
   * GÖNDERİM KİLİDİ (2026-07-28): belgeler teklifin İÇERİĞİDİR ve "SUBMITTED
   * teklif editlenmez" kuralı bunları da kapsar. Arayüz gönderim sonrası
   * ekle/sil'i zaten gizliyordu ama servis `bid.status`'ü hiç okumuyordu —
   * doğrudan istekle bağlayıcı teklifin ekleri gönderimden SONRA sessizce
   * değiştirilebiliyordu (versiyon artmadan, iz bırakmadan). Yalnız DRAFT
   * teklifte belge yönetilir; yeniden teklif ancak eleme sonrası yeni
   * versiyonla olur.
   */
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
      select: { id: true, status: true },
    });
    if (!bid) {
      throw new BadRequestException("Önce teklif verin, sonra belge ekleyin");
    }
    if (bid.status !== "DRAFT") {
      throw new BadRequestException(
        "Gönderilmiş teklifin belgeleri değiştirilemez",
      );
    }
    return bid;
  }

  async requestUploadUrl(
    user: AuthenticatedCompanyUser,
    listingId: string,
    input: { fileName: string; mimeType: string; fileSize?: number },
  ) {
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new BadRequestException("Sadece PDF, görsel veya Excel yüklenebilir");
    }
    assertSafeFileName(input.fileName);
    assertReportedSize(input.fileSize);
    const listing = await this.assertListingOpen(listingId);
    this.assertBidderRole(user, listing.type);
    await this.requireOwnBid(user, listingId);
    const safe = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const key = `listing-bids/${listingId}/${user.companyId}/${crypto.randomUUID()}-${safe}`;
    const url = await this.storage.generatePresignedPut("private", key, input.mimeType);
    return { url, key };
  }

  async register(
    user: AuthenticatedCompanyUser,
    listingId: string,
    input: {
      key: string;
      fileName: string;
      mimeType: string;
      kind?: ListingBidDocKind;
    },
  ) {
    // GÜVENLİK (F4 benzeri): key yalnız BU ilanın BU firmaya ait klasörüne
    // işaret edebilir — başka teklifin/rastgele bir nesnenin key'i kaydedilemez.
    if (!input.key.startsWith(`listing-bids/${listingId}/${user.companyId}/`)) {
      throw new BadRequestException("Geçersiz dosya anahtarı");
    }
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new BadRequestException("Sadece PDF, görsel veya Excel yüklenebilir");
    }
    assertSafeFileName(input.fileName);
    await assertUploadedObjectValid(this.storage, "private", input.key);
    const listing = await this.assertListingOpen(listingId);
    this.assertBidderRole(user, listing.type);
    const bid = await this.requireOwnBid(user, listingId);
    const doc = await this.prisma.listingBidDocument.create({
      data: {
        bidId: bid.id,
        kind: input.kind ?? "DIGER",
        key: input.key,
        fileName: input.fileName.slice(0, 200),
        mimeType: input.mimeType,
        uploadedByCompanyId: user.companyId,
      },
    });
    return { id: doc.id };
  }

  private async assertOwnerReadContext(user: AuthenticatedCompanyUser, listingId: string): Promise<void> {
    const fullRead =
      user.isOwner ||
      user.roles.some((r) => (["SAHIP", "YONETICI", "SATIN_ALMACI", "SATISCI"] as string[]).includes(r));
    if (fullRead) return;
    const linked = await this.prisma.approvalRequest.findFirst({
      where: { listingId, companyId: user.companyId, steps: { some: { approverUserId: user.userId } } },
      select: { id: true },
    });
    if (!linked) throw new NotFoundException("İlan bulunamadı");
  }

  /** İlan sahibi tüm teklif belgelerini; teklifçi yalnızca kendi belgelerini görür. */
  async list(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    const isOwner = listing.companyId === user.companyId;
    // Faz O dar-bağlam (denetim 2026-08-23 P2 #8): sahip firmanın ONAYLAYICI-only/
    // rolsüz üyesi teklifçi belgelerini yalnız onay bağı varsa görür
    // (CompanyListingsService.assertOwnerReadContext aynası).
    if (isOwner) await this.assertOwnerReadContext(user, listingId);

    const docs = await this.prisma.listingBidDocument.findMany({
      where: isOwner
        ? {
            // Denetim 2026-08-23 Parça 4: sahip yalnız GÖNDERİLMİŞ tekliflerin
            // belgelerini görür — ilan detayındaki kardeş kural (getOne sahip
            // dalı) ile TEK KAYNAK. Eskiden DRAFT teklifin belgeleri + teklifçi
            // adı + presigned indirme URL'i sahibe dönüyordu.
            bid: {
              listingId,
              status: { in: [...OWNER_VISIBLE_BID_STATUSES] },
            },
          }
        : { bid: { listingId, bidderCompanyId: user.companyId } },
      include: { bid: { include: { bidderCompany: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        bidId: d.bidId,
        kind: d.kind,
        bidderName: d.bid.bidderCompany.name,
        fileName: d.fileName,
        mimeType: d.mimeType,
        createdAt: d.createdAt,
        mine: d.uploadedByCompanyId === user.companyId,
        url: await this.storage.generatePresignedGet("private", d.key, d.fileName),
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
      include: { bid: { select: { listingId: true, status: true } } },
    });
    if (!doc || doc.bid.listingId !== listingId) {
      throw new NotFoundException("Belge bulunamadı");
    }
    if (doc.uploadedByCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu belgeyi silemezsiniz");
    }
    // Gönderim kilidi (bkz. requireOwnBid): bağlayıcı teklifin eki silinemez.
    if (doc.bid.status !== "DRAFT") {
      throw new BadRequestException(
        "Gönderilmiş teklifin belgeleri değiştirilemez",
      );
    }
    const listing = await this.assertListingOpen(listingId);
    this.assertBidderRole(user, listing.type);
    await this.storage.deleteObject("private", doc.key).catch(() => undefined);
    await this.prisma.listingBidDocument.delete({ where: { id: docId } });
    return { ok: true };
  }
}
