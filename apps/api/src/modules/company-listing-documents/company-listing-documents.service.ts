import { tierAtLeast } from "@rothern/shared";
import { hasValidConnection } from "../../common/company/valid-connection";
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
import {
  LISTING_MANAGE_DENY_MESSAGE,
  listingManageDenial,
} from "../company-listings/listing-manage-access";
import { StorageService } from "../storage/storage.service";
import {
  assertReportedSize,
  assertSafeFileName,
  assertUploadedObjectValid,
  MAX_UPLOAD_BYTES,
} from "../../common/helpers/upload-validation";
import { AuditService } from "../audit/audit.service";
/** Dalga B-5: ilan başına belge tavanı (depolama/bant maliyeti freni). */
// Faz 3: kalem-bazlı belge eklendiği için ilan toplamı yükseltildi; ayrıca
// KALEM başına ayrı bir tavan var, yani tek kalem toplamı tüketemez.
const MAX_DOCUMENTS_PER_LISTING = 100;
/** Faz 3: kalem başına teknik resim/çizim tavanı. */
const MAX_DOCUMENTS_PER_ITEM = 10;


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
    private readonly audit: AuditService,
  ) {}

  /** İlanı görme yetkisi (getOne ile aynı kural). Yetkisizse 404. */
  private async assertCanView(
    user: AuthenticatedCompanyUser,
    listing: {
      id: string;
      companyId: string;
      status: string;
      bidsOpenAt: Date | null;
      visibility: string;
      isInternational: boolean;
      targetCountries: string[];
      company: { country: string };
    },
  ) {
    if (listing.companyId === user.companyId) return; // sahip

    // YAYIN + EMBARGO KAPISI (2026-07-28) — getOne'daki iki kuralın aynası.
    // Bu servis eskiden yalnız görünürlük/bağlantı/ülke bakıyordu: ilan
    // detayı 404 verirken şartname ucu presigned URL döndürüyordu, yani
    // taslak ya da açılışı gelmemiş ihalenin dosyaları id'yi bilen firmaca
    // indirilebiliyordu (mühürlü açılış avantajı).
    if (listing.status === "DRAFT") {
      throw new NotFoundException("İlan bulunamadı");
    }
    if (listing.bidsOpenAt && listing.bidsOpenAt.getTime() > Date.now()) {
      // getOne istisnası: ilanda TEKLİFİ olan firma (önceki tur katılımcısı)
      // açılıştan önce de görür.
      const myBid = await this.prisma.listingBid.count({
        where: { listingId: listing.id, bidderCompanyId: user.companyId },
      });
      if (myBid === 0) throw new NotFoundException("İlan bulunamadı");
    }

    // Engellenen firma şartname/çizim dosyalarını göremez (getOne/placeBid ile
    // aynı kural — bu servis eskiden blok kontrolünü atlıyordu: engelli-ama-
    // bağlantılı/premium firma dosyaları indirebiliyordu).
    const blockedIds = await this.blocks.blockedCompanyIds(listing.companyId);
    if (blockedIds.includes(user.companyId)) {
      throw new NotFoundException("İlan bulunamadı");
    }

    // Denetim 2026-08-24 Parça 7: "bağlantılı mı" sorusu ham `ACTIVE` sayımıyla
    // yanıtlanıyordu; ilan tarafındaki kural (bağlantıyı KURAN taraf efektif
    // BRONZ+ olmalı — INV-TIER-1) uygulanmıyordu. Sonuç: davet eden firma
    // paketten düşünce ilan detayı 404 verirken şartname/çizim dosyaları
    // indirilmeye devam ediyordu. Artık tek kaynak `hasValidConnection`.
    const [connected, invitedCount] = await Promise.all([
      hasValidConnection(this.prisma as never, user.companyId, listing.companyId),
      this.prisma.listingInvitation.count({
        where: { listingId: listing.id, invitedCompanyId: user.companyId },
      }),
    ]);
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
      select: { id: true, companyId: true, type: true, createdById: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi dosya ekleyebilir");
    }
    // Belgeler ilanın İÇERİĞİDİR → updateListing ile AYNI yönetim kapısı
    // (listingManageDenial tek kaynak): izin ∧ oluşturan; SAHİP istisnası yok.
    // Rolsüz/etiket-only üye şartname/çizim ekleyemez-silemez.
    if (listingManageDenial(user, listing)) {
      throw new ForbiddenException(LISTING_MANAGE_DENY_MESSAGE);
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
    // HERHANGİ bir teklif kaydı kilitler — updateListing ve arayüzdeki canEdit
    // ile BİREBİR (ikisi de `listingBid.count({listingId})` sayar). Burada
    // eskiden yalnız SUBMITTED sayılıyordu (yorum "canEdit ile aynı" diyordu
    // ama değildi): taslak teklif kaydı olan, tüm teklifleri elenen ya da
    // carryBids ile yeni tura taşınan ihalede şartname, katılım başladıktan
    // sonra sürüm izi bırakmadan değiştirilebiliyordu — updateListing
    // kilidinin arka kapısıydı.
    const bidCount = await this.prisma.listingBid.count({
      where: { listingId },
    });
    if (bidCount > 0) {
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
      /** Faz 3: doluysa belge o KALEME bağlanır (ilan seviyesi değil). */
      itemId?: string;
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
    await assertUploadedObjectValid(
      this.storage,
      "private",
      input.key,
      MAX_UPLOAD_BYTES,
      ALLOWED_MIME,
    );
    // Dalga B-5 (P5): ilan başına belge TAVANI yoktu — tek ilana sınırsız
    // dosya eklenip depolama/bant maliyeti üretilebiliyordu.
    const existing = await this.prisma.listingDocument.count({
      where: { listingId },
    });
    if (existing >= MAX_DOCUMENTS_PER_LISTING) {
      throw new BadRequestException(
        `Bir ilana en fazla ${MAX_DOCUMENTS_PER_LISTING} belge eklenebilir — önce eskilerden silin`,
      );
    }
    // Faz 3 — kalem-bazlı belge. Kalem AYNI ilana ait olmalı: aksi hâlde
    // başka bir ilanın kalemine belge iliştirilebilirdi (IDOR).
    let itemId: string | null = null;
    if (input.itemId) {
      const owned = await this.prisma.listingItem.count({
        where: { id: input.itemId, listingId },
      });
      if (owned !== 1) throw new NotFoundException("Kalem bulunamadı");
      const perItem = await this.prisma.listingDocument.count({
        where: { itemId: input.itemId },
      });
      if (perItem >= MAX_DOCUMENTS_PER_ITEM) {
        throw new BadRequestException(
          `Bir kaleme en fazla ${MAX_DOCUMENTS_PER_ITEM} belge eklenebilir`,
        );
      }
      itemId = input.itemId;
    }
    const doc = await this.prisma.listingDocument.create({
      data: {
        listingId,
        kind: input.kind ?? "DIGER",
        itemId,
        key: input.key,
        fileName: input.fileName.slice(0, 200),
        mimeType: input.mimeType,
        uploadedByCompanyId: user.companyId,
      },
    });
    // Dalga B-5: belge ekleme/silme İZ BIRAKMIYORDU (KYC yüklemesi bırakıyor —
    // asimetri). Şartname/çizim uyuşmazlığında "hangi dosya ne zaman eklendi/
    // kaldırıldı" sorusunun tek yanıtı bu iz.
    void this.audit.log({
      action: "company.listing_document.added",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing_document",
      entityId: doc.id,
      metadata: {
        listingId,
        fileName: doc.fileName,
        kind: doc.kind,
        itemId: doc.itemId,
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
        status: true,
        bidsOpenAt: true,
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
        // Faz 3: null = ilan seviyesi, dolu = kalem-bazlı teknik belge.
        itemId: d.itemId,
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
    void this.audit.log({
      action: "company.listing_document.removed",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing_document",
      entityId: docId,
      metadata: { listingId },
    });
    return { ok: true };
  }
}
