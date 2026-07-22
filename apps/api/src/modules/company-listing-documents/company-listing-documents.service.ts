import { tierAtLeast } from "@rothern/shared";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "node:crypto";
import { ListingDocKind } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { CompanyBlocksService } from "../company-blocks/company-blocks.service";
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
export class CompanyListingDocumentsService {
  private readonly logger = new Logger(CompanyListingDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly blocks: CompanyBlocksService,
  ) {}

  /** İlanı görme yetkisi (getOne ile aynı kural). Yetkisizse 404. */
  private async assertCanView(
    user: AuthenticatedCompanyUser,
    listing: {
      id: string;
      companyId: string;
      visibility: string;
      isInternational: boolean;
      targetCountries: string[];
      company: { country: string };
    },
  ) {
    if (listing.companyId === user.companyId) return; // sahip

    // Engellenen firma şartname/çizim dosyalarını göremez (getOne/placeBid ile
    // aynı kural — bu servis eskiden blok kontrolünü atlıyordu: engelli-ama-
    // bağlantılı/premium firma dosyaları indirebiliyordu).
    const blockedIds = await this.blocks.blockedCompanyIds(listing.companyId);
    if (blockedIds.includes(user.companyId)) {
      throw new NotFoundException("İlan bulunamadı");
    }

    const [connectedCount, invitedCount] = await Promise.all([
      this.prisma.companyConnection.count({
        where: {
          status: "ACTIVE",
          OR: [
            { inviterCompanyId: user.companyId, inviteeCompanyId: listing.companyId },
            { inviterCompanyId: listing.companyId, inviteeCompanyId: user.companyId },
          ],
        },
      }),
      this.prisma.listingInvitation.count({
        where: { listingId: listing.id, invitedCompanyId: user.companyId },
      }),
    ]);
    const connected = connectedCount > 0;
    const isInvited = invitedCount > 0;

    // Davet, getOne/placeBid ile aynı şekilde HER görünürlüğü ve ülke
    // kapsamını aşar — davetli teklif verebildiği ilanın şartname
    // dosyalarını da indirebilmeli (requireBidDocument akışı buna dayanır).
    if (isInvited) return;

    let allowed: boolean;
    if (listing.visibility === "PUBLIC") {
      allowed = connected || tierAtLeast(user.tier, "BRONZ");
    } else if (listing.visibility === "CONNECTIONS") {
      allowed = connected;
    } else {
      allowed = false; // PRIVATE → yalnız davetli (yukarıda döndü)
    }

    // Ülke kapsamı (uluslararası → hedef ülke; yurtiçi → aynı ülke).
    if (allowed) {
      const myCountry = user.country;
      allowed = listing.isInternational
        ? myCountry !== listing.company.country &&
          (listing.targetCountries.length === 0 ||
            listing.targetCountries.includes(myCountry))
        : myCountry === listing.company.country;
    }

    if (!allowed) throw new NotFoundException("İlan bulunamadı");
  }

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
   * Belge değişikliği kilidi — ihale belgeleri ilanın içeriğidir; ilan
   * düzenlenebilir durumdayken (TASLAK her zaman, AÇIK ise henüz SUBMITTED
   * teklif yokken) eklenebilir/silinebilir. İlan teklife kapandıktan
   * (CLOSED/IN_AWARD/AWARDED…) sonra dondurulur. Listeleme/indirme serbest.
   * (İlan `canEdit` kuralıyla birebir aynı.)
   */
  private async assertEditable(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { status: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.status === "DRAFT") return; // taslak her zaman düzenlenebilir
    if (listing.status !== "OPEN") {
      throw new BadRequestException(
        "İhale teklife kapalı; belgeler değiştirilemez",
      );
    }
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
    input: { fileName: string; mimeType: string; fileSize?: number },
  ) {
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new BadRequestException("Sadece PDF, görsel veya Excel yüklenebilir");
    }
    assertSafeFileName(input.fileName);
    assertReportedSize(input.fileSize);
    await this.requireOwner(user, listingId);
    await this.assertEditable(listingId);
    const safe = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const key = `listing-docs/${listingId}/${crypto.randomUUID()}-${safe}`;
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
      kind?: ListingDocKind;
    },
  ) {
    await this.requireOwner(user, listingId);
    await this.assertEditable(listingId);
    // Anahtar yalnızca bu ilanın presigned-PUT öneki altında olabilir; aksi
    // halde istemci keyfi bir bucket nesnesini kaydedip indirilebilir kılabilir
    // (F4). Mime de burada yeniden doğrulanır (requestUploadUrl ile aynı set).
    const prefix = `listing-docs/${listingId}/`;
    if (!input.key.startsWith(prefix) || input.key.length > 300) {
      throw new BadRequestException("Geçersiz dosya anahtarı");
    }
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new BadRequestException("Sadece PDF, görsel veya Excel yüklenebilir");
    }
    assertSafeFileName(input.fileName);
    await assertUploadedObjectValid(this.storage, "private", input.key);
    const doc = await this.prisma.listingDocument.create({
      data: {
        listingId,
        kind: input.kind ?? "DIGER",
        key: input.key,
        fileName: input.fileName.slice(0, 200),
        mimeType: input.mimeType,
        uploadedByCompanyId: user.companyId,
      },
    });
    return { id: doc.id };
  }

  /**
   * İlanı GÖREBİLEN firmalar dosyaları indirebilir: sahip + (PUBLIC & premium/
   * bağlı) + (CONNECTIONS & bağlı) + (PRIVATE & davetli) + ülke kapsamı.
   * Yoksa 404 (gizli şartname/çizim sızıntısını önler).
   */
  async list(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        visibility: true,
        isInternational: true,
        targetCountries: true,
        company: { select: { country: true } },
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    await this.assertCanView(user, listing);
    const docs = await this.prisma.listingDocument.findMany({
      where: { listingId },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        kind: d.kind,
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
    await this.requireOwner(user, listingId);
    await this.assertEditable(listingId);
    const doc = await this.prisma.listingDocument.findUnique({
      where: { id: docId },
    });
    if (!doc || doc.listingId !== listingId) {
      throw new NotFoundException("Belge bulunamadı");
    }
    // Best-effort R2 silme; başarısız olursa DB satırı yine silinir ama
    // sahipsiz nesne izlenebilsin diye logla (sessiz yutma yok).
    await this.storage.deleteObject("private", doc.key).catch((err) => {
      this.logger.warn(
        `R2 nesnesi silinemedi (key=${doc.key}); sahipsiz kalabilir: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
    await this.prisma.listingDocument.delete({ where: { id: docId } });
    return { ok: true };
  }
}
