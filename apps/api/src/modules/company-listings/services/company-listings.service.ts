import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  CompanyRole,
  type Currency,
  ListingType,
  type ListingFormat,
  type ListingVisibility,
  type ListingDeliveryTerm,
  type ListingPaymentTerm,
  type ListingPaymentTiming,
  type ListingBidVisibility,
  type ListingBidStatus,
  type ListingDecrementType,
  type ListingDecrementBasis,
  type ListingQuestionAnswerType,
  Prisma,
} from "@supkeys/db";
import { OnEvent } from "@nestjs/event-emitter";
import { normalizeShortCode, validateShortCode } from "@supkeys/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CompanyApprovalsService } from "../../company-approvals/company-approvals.service";
import { CompanyBlocksService } from "../../company-blocks/company-blocks.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { ConfigService } from "@nestjs/config";
import { ExchangeRateService } from "../../currency/services/exchange-rate.service";
import { EmailService } from "../../email/email.service";
import { deriveCategoryMatchCandidates } from "../../../common/helpers/tender-category-match.helper";
import { CreateListingDto } from "../dto/create-listing.dto";
import { NextRoundDto } from "../dto/next-round.dto";
import { PlaceBidDto } from "../dto/place-bid.dto";

@Injectable()
export class CompanyListingsService {
  private readonly logger = new Logger(CompanyListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: CompanyBlocksService,
    private readonly approvals: CompanyApprovalsService,
    private readonly exchangeRates: ExchangeRateService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private webUrl(): string {
    return this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
  }

  /** Firmanın bildirim alıcısı — fatura e-postası veya ilk aktif kullanıcı. */
  private async companyRecipient(
    companyId: string,
  ): Promise<{ email: string; name: string } | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, billingEmail: true },
    });
    if (!company) return null;
    if (company.billingEmail) {
      return { email: company.billingEmail, name: company.name };
    }
    const user = await this.prisma.companyUser.findFirst({
      where: { companyId, isActive: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user) return null;
    return { email: user.email, name: `${user.firstName} ${user.lastName}` };
  }

  /**
   * Çok sayıda firmanın bildirim alıcısını TEK seferde çözer (N+1 yerine 2 sorgu):
   * billingEmail olanlar doğrudan; olmayanlar için tek toplu kullanıcı sorgusu.
   */
  private async companyRecipients(
    companyIds: string[],
  ): Promise<Map<string, { email: string; name: string }>> {
    const ids = [...new Set(companyIds)];
    const out = new Map<string, { email: string; name: string }>();
    if (ids.length === 0) return out;
    const companies = await this.prisma.company.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, billingEmail: true },
    });
    const needUser: string[] = [];
    const nameById = new Map<string, string>();
    for (const c of companies) {
      nameById.set(c.id, c.name);
      if (c.billingEmail) out.set(c.id, { email: c.billingEmail, name: c.name });
      else needUser.push(c.id);
    }
    if (needUser.length > 0) {
      const users = await this.prisma.companyUser.findMany({
        where: { companyId: { in: needUser }, isActive: true, deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { companyId: true, email: true, firstName: true, lastName: true },
      });
      for (const u of users) {
        if (out.has(u.companyId)) continue; // ilk aktif kullanıcı
        out.set(u.companyId, {
          email: u.email,
          name: `${u.firstName} ${u.lastName}`,
        });
      }
    }
    return out;
  }

  /** Bildirim e-postası gönder (fire-and-forget). */
  private notify(
    to: { email: string; name: string },
    data: {
      subject: string;
      heading: string;
      paragraphs: string[];
      infoRows?: { label: string; value: string }[];
      ctaLabel?: string;
      ctaUrl?: string;
      footerNote?: string;
    },
    context?: { type: string; id: string },
  ): void {
    void this.email
      .send({
        to: { email: to.email, name: to.name },
        templateData: { template: "notification", data },
        subject: data.subject,
        context,
      })
      .catch((err) =>
        this.logger.error(
          `Bildirim e-postası gönderilemedi (${to.email}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  /**
   * İlan teklife kapandığında (süre dolumu veya erken kapatma) bildirim:
   * davetlilere "ihale kapandı", sahibe "kazandırma kararı zamanı".
   */
  async notifyListingClosed(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, number: true, companyId: true },
    });
    if (!listing) return;
    const label = `"${listing.title}" (${listing.number ?? "—"})`;

    // Davetlilere kapanış bildirimi.
    const invs = await this.prisma.listingInvitation.findMany({
      where: { listingId },
      select: { invitedCompanyId: true },
    });
    const bidUrl = `${this.webUrl()}/company/ilan/${listingId}`;
    const closeRecipients = await this.companyRecipients(
      invs.map((iv) => iv.invitedCompanyId),
    );
    for (const iv of invs) {
      const r = closeRecipients.get(iv.invitedCompanyId);
      if (!r) continue;
      this.notify(
        r,
        {
          subject: "İhale teklife kapandı",
          heading: "İhale kapandı",
          paragraphs: [
            "Merhaba,",
            `${label} ihalesi teklife kapandı. Sonuç açıklandığında bilgilendirileceksiniz.`,
          ],
          ctaLabel: "İhaleyi Gör",
          ctaUrl: bidUrl,
        },
        { type: "listing_closed", id: listingId },
      );
    }

    // Sahibe "karar zamanı" bildirimi.
    const owner = await this.companyRecipient(listing.companyId);
    if (owner) {
      this.notify(
        owner,
        {
          subject: "İhaleniz kapandı — kazandırma kararı bekleniyor",
          heading: "Kazandırma kararı zamanı",
          paragraphs: [
            "Merhaba,",
            `${label} ihaleniz teklife kapandı. Teklifleri inceleyip kazandırma kararınızı verebilirsiniz.`,
          ],
          ctaLabel: "Teklifleri İncele",
          ctaUrl: `${this.webUrl()}/company/satinalma/ihalelerim/${listingId}`,
        },
        { type: "listing_closed_owner", id: listingId },
      );
    }
  }

  /**
   * PUBLIC + ALIM ilan yayına çıkınca, ilan kategorileriyle eşleşen
   * (sellerCategoryIds/sellerSubCategoryIds) PAKET + SATISCI firmaları bulur.
   * E-posta gönderimi Faz 8 ile bağlanacak; şimdilik aday listesi + log.
   */
  async notifyCategoryMatchedSellers(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        visibility: true,
        categoryIds: true,
        number: true,
        title: true,
        isInternational: true,
        targetCountries: true,
        company: { select: { country: true } },
      },
    });
    if (
      !listing ||
      listing.type !== "ALIM" ||
      listing.visibility !== "PUBLIC" ||
      listing.categoryIds.length === 0
    ) {
      return [];
    }
    // Ülke kapsamı: yurtiçi ilan → yalnızca sahip ülkesi; uluslararası →
    // YALNIZCA yabancı hedef ülkeler (sahip ülkesi HARİÇ — yurtiçi görmez).
    const ownerCountry = listing.company.country;
    const countryWhere = !listing.isInternational
      ? { country: ownerCountry }
      : listing.targetCountries.length === 0
        ? { country: { not: ownerCountry } }
        : { country: { in: listing.targetCountries } };
    const { segmentIds, subCandidates } = deriveCategoryMatchCandidates(
      listing.categoryIds,
    );
    if (segmentIds.length === 0 && subCandidates.length === 0) return [];

    const blocked = await this.blocks.blockedCompanyIds(listing.companyId);
    const candidates = await this.prisma.company.findMany({
      where: {
        id: { notIn: [listing.companyId, ...blocked] },
        tier: "PAKET",
        isActive: true,
        ...countryWhere,
        users: {
          some: { roles: { has: "SATISCI" }, deletedAt: null, isActive: true },
        },
        OR: [
          { sellerCategoryIds: { hasSome: segmentIds } },
          { sellerSubCategoryIds: { hasSome: subCandidates } },
        ],
      },
      select: { id: true, name: true, billingEmail: true },
      take: 300, // flood-guard
    });
    if (candidates.length === 0) return [];

    const url = `${this.webUrl()}/company/satis/acik-ihaleler`;
    for (const c of candidates) {
      if (!c.billingEmail) continue;
      this.notify(
        { email: c.billingEmail, name: c.name },
        {
          subject: "Size uygun yeni bir ihale yayınlandı",
          heading: "Kategorinize uygun yeni ihale",
          paragraphs: [
            "Merhaba,",
            `Sattığınız kategorilerle eşleşen yeni bir ihale yayınlandı: "${listing.title ?? "İhale"}" (${listing.number ?? "—"}). İncelemek ve teklif vermek için Rothern'e giriş yapın.`,
          ],
          ctaLabel: "Açık İhaleleri Gör",
          ctaUrl: url,
          footerNote:
            "Bu bildirimi kategori tercihlerinize göre alıyorsunuz.",
        },
        { type: "listing_category_match", id: listingId },
      );
    }
    this.logger.log(
      `Kategori eşleşmesi (${listing.number}): ${candidates.length} tedarikçiye bildirim`,
    );
    return candidates;
  }

  /** Davetli firmalara ihale daveti / kapanış hatırlatması e-postası. */
  async notifyListingInvitees(
    listingId: string,
    mode: "invitation" | "reminder",
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, number: true },
    });
    if (!listing) return;
    const invs = await this.prisma.listingInvitation.findMany({
      where: { listingId },
      select: { invitedCompanyId: true },
    });
    const url = `${this.webUrl()}/company/ilan/${listingId}`;
    const recipients = await this.companyRecipients(
      invs.map((iv) => iv.invitedCompanyId),
    );
    for (const iv of invs) {
      const r = recipients.get(iv.invitedCompanyId);
      if (!r) continue;
      if (mode === "invitation") {
        this.notify(
          r,
          {
            subject: "Bir ihaleye davet edildiniz",
            heading: "İhale daveti",
            paragraphs: [
              "Merhaba,",
              `"${listing.title}" (${listing.number ?? "—"}) ihalesine davet edildiniz. Detayları görmek ve teklif vermek için giriş yapın.`,
            ],
            ctaLabel: "İhaleyi Gör",
            ctaUrl: url,
          },
          { type: "listing_invitation", id: listingId },
        );
      } else {
        this.notify(
          r,
          {
            subject: "İhale kapanışı yaklaşıyor",
            heading: "Kapanış hatırlatması",
            paragraphs: [
              "Merhaba,",
              `"${listing.title}" (${listing.number ?? "—"}) ihalesinin kapanışı yaklaşıyor. Teklif vermek için son şansınız.`,
            ],
            ctaLabel: "Teklif Ver",
            ctaUrl: url,
          },
          { type: "listing_reminder", id: listingId },
        );
      }
    }
  }

  /**
   * Yayınlanan (taslak olmayan) ilanda kapanış geleceğe; açılış varsa kapanıştan
   * önce olmalı. Taslakta tarih serbest.
   */
  private validateListingDates(dto: CreateListingDto) {
    if (dto.asDraft) return;
    if (!dto.closesAt) {
      throw new BadRequestException("Kapanış tarihi zorunlu");
    }
    const close = new Date(dto.closesAt);
    if (Number.isNaN(close.getTime()) || close.getTime() <= Date.now()) {
      throw new BadRequestException("Kapanış tarihi gelecekte olmalı");
    }
    if (dto.bidsOpenAt) {
      const open = new Date(dto.bidsOpenAt);
      if (!Number.isNaN(open.getTime()) && open.getTime() >= close.getTime()) {
        throw new BadRequestException("Açılış tarihi kapanıştan önce olmalı");
      }
    }
  }

  /**
   * İlan oluştur. PAKET üyelik gerektirir (STANDARD yalnızca teklif verir,
   * ilan/ihale açamaz). Rol-korumalı: ALIM → SATIN_ALMACI, SATIS → SATISCI.
   */
  async create(user: AuthenticatedCompanyUser, dto: CreateListingDto) {
    const type = dto.type as ListingType;
    this.validateListingDates(dto);

    if (user.tier !== "PAKET") {
      throw new ForbiddenException(
        "İlan/ihale açmak için premium (PAKET) üyelik gerekir. Standart üyeler yalnızca teklif verebilir.",
      );
    }

    const neededRole =
      type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;

    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException(
        type === "ALIM"
          ? "Alım ilanı açmak için Satın Almacı rolü gerekir"
          : "Satış ilanı açmak için Satışçı rolü gerekir",
      );
    }

    // Tipe göre format / fiyat doğrulama.
    let format: ListingFormat | null = null;
    let minPrice: number | null = null;
    let buyNowPrice: number | null = null;

    if (type === "ALIM") {
      if (!dto.format) {
        throw new BadRequestException("Alım ilanı için format seçin (RFQ / İngiliz Usulü)");
      }
      format = dto.format as ListingFormat;
    } else {
      // SATIS: taban fiyat zorunlu, hemen-al opsiyonel (≥ taban).
      if (!dto.minPrice || dto.minPrice <= 0) {
        throw new BadRequestException("Satış ilanı için taban fiyat girin");
      }
      minPrice = dto.minPrice;
      if (dto.buyNowPrice != null) {
        if (dto.buyNowPrice < dto.minPrice) {
          throw new BadRequestException(
            "Hemen-al fiyatı taban fiyattan düşük olamaz",
          );
        }
        buyNowPrice = dto.buyNowPrice;
      }
    }

    const number = await this.nextListingNumber();

    // Davet edilecek firmaları çöz: supkeysId → companyId, bağlı olmalı.
    let inviteCompanyIds: string[] = [];
    if (dto.invitations?.length) {
      const connectedIds = await this.connectedCompanyIds(user.companyId);
      const codes = dto.invitations
        .map((c) => normalizeShortCode(c))
        .filter((c) => validateShortCode(c));
      const targets = await this.prisma.company.findMany({
        where: { supkeysId: { in: codes } },
        select: { id: true },
      });
      inviteCompanyIds = targets
        .map((t) => t.id)
        .filter((id) => id !== user.companyId && connectedIds.includes(id));
    }

    const listing = await this.prisma.$transaction(async (tx) => {
      const l = await tx.listing.create({
        data: {
          number,
          companyId: user.companyId,
          type,
          isInternational: dto.isInternational ?? false,
          // Hedef ülkeler yalnızca uluslararası ilanda anlamlı; aksi halde boş.
          // Firmanın kendi ülkesi hedefe eklenmez (yurtiçi kapsam zaten görür).
          targetCountries: dto.isInternational
            ? (dto.targetCountries ?? []).filter((c) => c !== user.country)
            : [],
          deliveryAddressId: dto.deliveryAddressId ?? null,
          billingAddressId: dto.billingAddressId ?? null,
          format,
          minPrice,
          buyNowPrice,
          visibility: (dto.visibility as ListingVisibility) ?? "CONNECTIONS",
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
          createdById: user.userId,
          status: dto.asDraft ? "DRAFT" : "OPEN",
          publishedAt: dto.asDraft ? null : new Date(),
          categoryIds: dto.categoryIds ?? [],
          keywords: dto.keywords ?? [],
          terms: dto.terms?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          requireAllItems: dto.requireAllItems ?? false,
          requireBidDocument: dto.requireBidDocument ?? false,
          primaryCurrency: (dto.primaryCurrency as Currency) ?? "TRY",
          allowedCurrencies: (dto.allowedCurrencies as Currency[]) ?? [],
          // ── Wizard zenginleştirme ──
          bidsOpenAt: dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null,
          isSealedBid: dto.isSealedBid ?? true,
          isLogistics: dto.isLogistics ?? false,
          logistics: dto.logistics
            ? (dto.logistics as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          deliveryTerm: (dto.deliveryTerm as ListingDeliveryTerm) ?? null,
          paymentTerm: (dto.paymentTerm as ListingPaymentTerm) ?? "CASH",
          paymentDays: dto.paymentDays ?? null,
          paymentTiming:
            (dto.paymentTiming as ListingPaymentTiming) ?? "AFTER_DELIVERY",
          bidVisibility:
            (dto.bidVisibility as ListingBidVisibility) ?? "OWN_ONLY",
          priceDecrementType:
            (dto.priceDecrementType as ListingDecrementType) ?? null,
          priceDecrementValue: dto.priceDecrementValue ?? null,
          priceDecrementBasis:
            (dto.priceDecrementBasis as ListingDecrementBasis) ?? null,
          decimalPlaces: dto.decimalPlaces ?? 2,
          sendClosingReminder: dto.sendClosingReminder ?? false,
          reminderMinutesBefore: dto.reminderMinutesBefore ?? null,
          autoExtendOnLateBid: dto.autoExtendOnLateBid ?? false,
          autoExtendThresholdMin: dto.autoExtendThresholdMin ?? null,
          autoExtendByMinutes: dto.autoExtendByMinutes ?? null,
        },
      });
      if (dto.items?.length) {
        // Kalemleri tek tek oluştur (soru ekleyebilmek için id gerekiyor).
        for (let i = 0; i < dto.items.length; i++) {
          const it = dto.items[i]!;
          const item = await tx.listingItem.create({
            data: {
              listingId: l.id,
              lineNo: i + 1,
              name: it.name.trim(),
              description: it.description?.trim() || null,
              quantity: it.quantity,
              unit: it.unit.trim(),
              targetPrice: it.targetPrice ?? null,
              materialCode: it.materialCode?.trim() || null,
              requiredByDate: it.requiredByDate
                ? new Date(it.requiredByDate)
                : null,
            },
          });
          if (it.questions?.length) {
            await tx.listingItemQuestion.createMany({
              data: it.questions.map((q) => ({
                itemId: item.id,
                text: q.text.trim(),
                answerType: q.answerType as ListingQuestionAnswerType,
                required: q.required ?? false,
              })),
            });
          }
        }
      }
      if (inviteCompanyIds.length) {
        await tx.listingInvitation.createMany({
          data: inviteCompanyIds.map((cid) => ({
            listingId: l.id,
            invitedCompanyId: cid,
            invitedById: user.userId,
          })),
          skipDuplicates: true,
        });
      }
      return l;
    });
    // Doğrudan yayınlandıysa: davetlilere davet + PUBLIC+ALIM'da kategori haberi.
    if (!dto.asDraft) {
      void this.notifyListingInvitees(listing.id, "invitation");
      void this.notifyCategoryMatchedSellers(listing.id);
    }
    return this.serialize(listing);
  }

  /**
   * İlanı düzenle (eski sistemdeki updateDraft kuralı): yalnızca SAHİP,
   * ilan AÇIK ve henüz SUBMITTED teklif gelmemişken. İlk teklif gelince
   * kilitlenir. Tür değiştirilemez (mevcut tür korunur). Kalemler ve davetler
   * tamamen yeniden yazılır (sil-ve-oluştur).
   */
  async updateListing(
    user: AuthenticatedCompanyUser,
    listingId: string,
    dto: CreateListingDto,
  ) {
    const existing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, status: true, type: true },
    });
    if (!existing || existing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    // Düzenlenebilirlik kilidi — eski sistem birebir. DRAFT her zaman serbest;
    // OPEN ise yalnızca henüz SUBMITTED teklif yokken.
    if (existing.status !== "OPEN" && existing.status !== "DRAFT") {
      throw new BadRequestException(
        "Sadece taslak veya henüz teklif gelmemiş ihaleler düzenlenebilir",
      );
    }
    if (existing.status === "OPEN") {
      const submittedCount = await this.prisma.listingBid.count({
        where: { listingId, status: "SUBMITTED" },
      });
      if (submittedCount > 0) {
        throw new BadRequestException(
          "Bu ihaleye teklif verilmiş; düzenleme yapılamaz",
        );
      }
    }
    this.validateListingDates(dto);

    // Tür değişmez — mevcut türe göre format/fiyat doğrula (create ile aynı).
    const type = existing.type;
    let format: ListingFormat | null = null;
    let minPrice: number | null = null;
    let buyNowPrice: number | null = null;
    if (type === "ALIM") {
      if (!dto.format) {
        throw new BadRequestException(
          "Alım ilanı için format seçin (RFQ / İngiliz Usulü)",
        );
      }
      format = dto.format as ListingFormat;
    } else {
      if (!dto.minPrice || dto.minPrice <= 0) {
        throw new BadRequestException("Satış ilanı için taban fiyat girin");
      }
      minPrice = dto.minPrice;
      if (dto.buyNowPrice != null) {
        if (dto.buyNowPrice < dto.minPrice) {
          throw new BadRequestException(
            "Hemen-al fiyatı taban fiyattan düşük olamaz",
          );
        }
        buyNowPrice = dto.buyNowPrice;
      }
    }

    // Davet edilecek firmaları çöz (create ile aynı kural).
    let inviteCompanyIds: string[] = [];
    if (dto.invitations?.length) {
      const connectedIds = await this.connectedCompanyIds(user.companyId);
      const codes = dto.invitations
        .map((c) => normalizeShortCode(c))
        .filter((c) => validateShortCode(c));
      const targets = await this.prisma.company.findMany({
        where: { supkeysId: { in: codes } },
        select: { id: true },
      });
      inviteCompanyIds = targets
        .map((t) => t.id)
        .filter((id) => id !== user.companyId && connectedIds.includes(id));
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const l = await tx.listing.update({
        where: { id: listingId },
        data: {
          isInternational: dto.isInternational ?? false,
          // Hedef ülkeler yalnızca uluslararası ilanda anlamlı; aksi halde boş.
          // Firmanın kendi ülkesi hedefe eklenmez (yurtiçi kapsam zaten görür).
          targetCountries: dto.isInternational
            ? (dto.targetCountries ?? []).filter((c) => c !== user.country)
            : [],
          deliveryAddressId: dto.deliveryAddressId ?? null,
          billingAddressId: dto.billingAddressId ?? null,
          format,
          minPrice,
          buyNowPrice,
          visibility: (dto.visibility as ListingVisibility) ?? "CONNECTIONS",
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
          categoryIds: dto.categoryIds ?? [],
          keywords: dto.keywords ?? [],
          terms: dto.terms?.trim() || null,
          internalNotes: dto.internalNotes?.trim() || null,
          requireAllItems: dto.requireAllItems ?? false,
          requireBidDocument: dto.requireBidDocument ?? false,
          primaryCurrency: (dto.primaryCurrency as Currency) ?? "TRY",
          allowedCurrencies: (dto.allowedCurrencies as Currency[]) ?? [],
          bidsOpenAt: dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null,
          isSealedBid: dto.isSealedBid ?? true,
          isLogistics: dto.isLogistics ?? false,
          logistics: dto.logistics
            ? (dto.logistics as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          deliveryTerm: (dto.deliveryTerm as ListingDeliveryTerm) ?? null,
          paymentTerm: (dto.paymentTerm as ListingPaymentTerm) ?? "CASH",
          paymentDays: dto.paymentDays ?? null,
          paymentTiming:
            (dto.paymentTiming as ListingPaymentTiming) ?? "AFTER_DELIVERY",
          bidVisibility:
            (dto.bidVisibility as ListingBidVisibility) ?? "OWN_ONLY",
          priceDecrementType:
            (dto.priceDecrementType as ListingDecrementType) ?? null,
          priceDecrementValue: dto.priceDecrementValue ?? null,
          priceDecrementBasis:
            (dto.priceDecrementBasis as ListingDecrementBasis) ?? null,
          decimalPlaces: dto.decimalPlaces ?? 2,
          sendClosingReminder: dto.sendClosingReminder ?? false,
          reminderMinutesBefore: dto.reminderMinutesBefore ?? null,
          autoExtendOnLateBid: dto.autoExtendOnLateBid ?? false,
          autoExtendThresholdMin: dto.autoExtendThresholdMin ?? null,
          autoExtendByMinutes: dto.autoExtendByMinutes ?? null,
        },
      });

      // Kalemleri tamamen yeniden yaz. ListingBidItem/ListingItemQuestion
      // FK'leri Cascade → eski (geri-çekilmiş) teklif kalemleri de temizlenir.
      await tx.listingItem.deleteMany({ where: { listingId } });
      if (dto.items?.length) {
        for (let i = 0; i < dto.items.length; i++) {
          const it = dto.items[i]!;
          const item = await tx.listingItem.create({
            data: {
              listingId,
              lineNo: i + 1,
              name: it.name.trim(),
              description: it.description?.trim() || null,
              quantity: it.quantity,
              unit: it.unit.trim(),
              targetPrice: it.targetPrice ?? null,
              materialCode: it.materialCode?.trim() || null,
              requiredByDate: it.requiredByDate
                ? new Date(it.requiredByDate)
                : null,
            },
          });
          if (it.questions?.length) {
            await tx.listingItemQuestion.createMany({
              data: it.questions.map((q) => ({
                itemId: item.id,
                text: q.text.trim(),
                answerType: q.answerType as ListingQuestionAnswerType,
                required: q.required ?? false,
              })),
            });
          }
        }
      }

      // Davetleri yeniden yaz.
      await tx.listingInvitation.deleteMany({ where: { listingId } });
      if (inviteCompanyIds.length) {
        await tx.listingInvitation.createMany({
          data: inviteCompanyIds.map((cid) => ({
            listingId,
            invitedCompanyId: cid,
            invitedById: user.userId,
          })),
          skipDuplicates: true,
        });
      }
      return l;
    });
    return this.serialize(updated);
  }

  /** Taslak ilanı sil — yalnızca SAHİP + DRAFT (yayınlanmış silinemez). */
  async deleteListing(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, status: true },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    if (listing.status !== "DRAFT") {
      throw new BadRequestException(
        "Yalnızca taslak ilan silinebilir; yayınlanmış ilan iptal edilir",
      );
    }
    await this.prisma.listing.delete({ where: { id: listingId } });
    return { ok: true };
  }

  /**
   * Taslağı yayınla. Yalnızca SAHİP + DRAFT. Eşleşen aktif bir LISTING_PUBLISH
   * onay akışı varsa IN_APPROVAL'a geçer (onay sonrası event ile OPEN olur);
   * yoksa doğrudan OPEN.
   */
  async publishListing(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        status: true,
        type: true,
        minPrice: true,
        primaryCurrency: true,
      },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    if (listing.status !== "DRAFT") {
      throw new BadRequestException("Yalnızca taslak ilan yayınlanabilir");
    }

    const amount = await this.estimateListingAmount(listing);
    const res = await this.approvals.requestApproval(user, {
      listingId,
      type: "LISTING_PUBLISH",
      listingType: listing.type,
      amount,
      currency: listing.primaryCurrency,
    });
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: res.approved
        ? { status: "OPEN", publishedAt: new Date() }
        : { status: "IN_APPROVAL" },
    });
    if (res.approved) {
      void this.notifyListingInvitees(listingId, "invitation");
      void this.notifyCategoryMatchedSellers(listingId);
    }
    return this.serialize(updated);
  }

  /** Onay isteği için tahmini bütçe — ALIM: hedef fiyatlar toplamı; SATIS: taban. */
  private async estimateListingAmount(listing: {
    id: string;
    type: ListingType;
    minPrice: { toString(): string } | null;
  }): Promise<number> {
    if (listing.type === "SATIS") {
      return listing.minPrice ? Number(listing.minPrice) : 0;
    }
    const items = await this.prisma.listingItem.findMany({
      where: { listingId: listing.id },
      select: { quantity: true, targetPrice: true },
    });
    // Decimal aritmetiği (kayan nokta birikimli hata olmadan).
    const total = items.reduce(
      (sum, it) =>
        sum.plus(new Prisma.Decimal(it.targetPrice ?? 0).mul(it.quantity)),
      new Prisma.Decimal(0),
    );
    return total.toNumber();
  }

  /** Yayın onayı onaylandı → ilanı OPEN yap. */
  @OnEvent("listing.publish.approved")
  async onPublishApproved(payload: { listingId: string }) {
    await this.prisma.listing.update({
      where: { id: payload.listingId },
      data: { status: "OPEN", publishedAt: new Date() },
    });
    void this.notifyListingInvitees(payload.listingId, "invitation");
    void this.notifyCategoryMatchedSellers(payload.listingId);
  }

  /** Yayın onayı reddedildi → ilan taslağa geri döner. */
  @OnEvent("listing.publish.rejected")
  async onPublishRejected(payload: { listingId: string }) {
    await this.prisma.listing.update({
      where: { id: payload.listingId },
      data: { status: "DRAFT" },
    });
  }

  /**
   * Sistem-genelinde benzersiz ilan numarası — global Postgres sequence'tan
   * atomik (race-safe). ROT-NNNNNN; sıra büyüdükçe hane artar.
   */
  private async nextListingNumber(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT nextval('listing_number_seq') AS n
    `;
    return `ROT-${String(rows[0].n).padStart(6, "0")}`;
  }

  /** Firmanın kendi ilanları (açtıkları). */
  async listMine(companyId: string) {
    const rows = await this.prisma.listing.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((r) => this.serialize(r));
  }

  /**
   * Firmanın başka firmaların ilanlarına verdiği TÜM teklifler — Tekliflerim
   * ekranı. İlan özeti (başlık/no/tür/durum/kapanış) ile birlikte döner.
   */
  async listMyBids(companyId: string) {
    const bids = await this.prisma.listingBid.findMany({
      where: { bidderCompanyId: companyId },
      include: {
        listing: {
          select: {
            id: true,
            number: true,
            title: true,
            type: true,
            status: true,
            closesAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return bids.map((b) => ({
      id: b.id,
      amount: b.amount.toString(),
      currency: b.currency,
      status: b.status,
      round: b.round,
      isBuyNow: b.isBuyNow,
      createdAt: b.createdAt,
      listing: {
        id: b.listing.id,
        number: b.listing.number,
        title: b.listing.title,
        type: b.listing.type,
        status: b.listing.status,
        closesAt: b.listing.closesAt,
      },
    }));
  }

  /**
   * İhalelerim listesi (ALIM) — zengin: açan kişi + davetli/teklif sayısı +
   * kategoriler. Eski tenders-table'ın ihtiyaç duyduğu alanlar. Filtre/sıralama
   * frontend'de (client-side) yapılır.
   */
  async listTenders(companyId: string) {
    const rows = await this.prisma.listing.findMany({
      where: { companyId, type: "ALIM" },
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        format: true,
        status: true,
        isInternational: true,
        categoryIds: true,
        createdById: true,
        createdAt: true,
        closesAt: true,
        _count: { select: { invitations: true, bids: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const userIds = [...new Set(rows.map((r) => r.createdById))];
    const users = await this.prisma.companyUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const umap = new Map(users.map((u) => [u.id, u]));

    return rows.map((r) => {
      const u = umap.get(r.createdById);
      return {
        id: r.id,
        tenderNumber: r.number ?? "—",
        title: r.title,
        type: r.type,
        format: r.format,
        status: r.status,
        isInternational: r.isInternational,
        categoryIds: r.categoryIds,
        createdById: r.createdById,
        createdBy: {
          firstName: u?.firstName ?? "—",
          lastName: u?.lastName ?? "",
        },
        invitationCount: r._count.invitations,
        bidCount: r._count.bids,
        publishedAt: r.createdAt,
        bidsCloseAt: r.closesAt,
        createdAt: r.createdAt,
      };
    });
  }

  /**
   * Bana açık ilanlar (başka firmaların): PUBLIC + bağlantılı firmaların
   * CONNECTIONS ilanları. PUBLIC ilanı bağlı olmayan STANDART MASKELİ görür
   * (firma gizli, teklif veremez); premium tam görür.
   */
  async browse(
    user: AuthenticatedCompanyUser,
    scope: "domestic" | "international" = "domestic",
  ) {
    // Bağımsız sorgular paralel; izleyenin ülkesi token'dan (ekstra sorgu yok).
    const [connectedIds, blockedIds] = await Promise.all([
      this.connectedCompanyIds(user.companyId),
      this.blocks.blockedCompanyIds(user.companyId),
    ]);
    const isPremium = user.tier === "PAKET";
    const myCountry = user.country;

    // Yurtiçi: SADECE yurtiçi ilanlar (isInternational=false) + aynı ülke.
    // Uluslararası: ilan sınır ötesine açılmış (isInternational=true), sahibi
    // BAŞKA ülkede VE hedef ülke listesi beni kapsıyor. Uluslararası ilan
    // yurtiçi kapsamda GÖRÜNMEZ (adı üstünde — yurtiçi tedarikçi görmez).
    const scopeWhere =
      scope === "international"
        ? {
            isInternational: true,
            company: { country: { not: myCountry } },
            // Hedef ülke filtresi: liste boş = tüm ülkeler; dolu = ülkem dahil mi?
            AND: [
              {
                OR: [
                  { targetCountries: { isEmpty: true } },
                  { targetCountries: { has: myCountry } },
                ],
              },
            ],
          }
        : { isInternational: false, company: { country: myCountry } };

    // STANDARD (premium değil) public ilanları GÖREMEZ — yalnızca bağlantılı
    // (referans) firmalarının açık ilanlarını görür. PAKET hepsini görür.
    const visibilityOr = isPremium
      ? [
          { visibility: "PUBLIC" as const },
          {
            visibility: "CONNECTIONS" as const,
            companyId: { in: connectedIds },
          },
        ]
      : [
          {
            visibility: "CONNECTIONS" as const,
            companyId: { in: connectedIds },
          },
        ];

    const rows = await this.prisma.listing.findMany({
      where: {
        status: "OPEN",
        companyId: { notIn: [user.companyId, ...blockedIds] },
        ...scopeWhere,
        OR: visibilityOr,
      },
      include: { company: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return rows.map((l) => {
      const connected = connectedIds.includes(l.companyId);
      const masked = l.visibility === "PUBLIC" && !connected && !isPremium;
      const canBid = connected || (l.visibility === "PUBLIC" && isPremium);
      return {
        id: l.id,
        number: l.number,
        type: l.type,
        visibility: l.visibility,
        title: l.title,
        description: masked ? null : l.description,
        status: l.status,
        createdAt: l.createdAt,
        owner: masked ? null : { name: l.company.name },
        masked,
        canBid,
      };
    });
  }

  /**
   * İlan detayı. Sahip → ilan + gelen TÜM teklifler (sıralı). Sahip değil →
   * görünürlük kontrolü (yoksa 404), maskeleme + kendi teklifi (myBid) + canBid.
   * Kapalı zarf: sahip olmayan başkalarının tekliflerini GÖREMEZ.
   */
  async getOne(user: AuthenticatedCompanyUser, id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { company: { select: { name: true, country: true } } },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");

    const isOwner = listing.companyId === user.companyId;

    // Birbirinden bağımsız okumalar tek turda (sahip detayı 4 sn'de bir
    // poll'lanabildiğinden seri tur sayısı önemli — P1 perf).
    const addrIds = [listing.deliveryAddressId, listing.billingAddressId].filter(
      (x): x is string => !!x,
    );
    const [addrRows, englishAgg, items, connectedIds] = await Promise.all([
      addrIds.length
        ? this.prisma.companyAddress.findMany({
            // Yalnızca ilan sahibinin adresleri — başka firmanın PII'si sızmaz.
            where: { id: { in: addrIds }, companyId: listing.companyId },
          })
        : Promise.resolve([] as Awaited<
            ReturnType<typeof this.prisma.companyAddress.findMany>
          >),
      listing.format === "ENGLISH_AUCTION"
        ? this.prisma.listingBid.aggregate({
            where: { listingId: id, status: "SUBMITTED" },
            _min: { amount: true },
            _count: true,
          })
        : Promise.resolve(null),
      this.prisma.listingItem.findMany({
        where: { listingId: id },
        orderBy: { lineNo: "asc" },
        include: { questions: true },
      }),
      // Sahip bağlantı bilgisine ihtiyaç duymaz → sahipte sorgu atlanır.
      isOwner
        ? Promise.resolve([] as string[])
        : this.connectedCompanyIds(user.companyId),
    ]);

    const serializeAddr = (a: (typeof addrRows)[number] | undefined) =>
      a
        ? {
            title: a.title,
            addressLine: a.addressLine,
            district: a.district,
            city: a.city,
            postalCode: a.postalCode,
            country: a.country,
            contactName: a.contactName,
            phone: a.phone,
            taxOffice: a.taxOffice,
            taxNumber: a.taxNumber,
          }
        : null;
    const deliveryAddress = serializeAddr(
      addrRows.find((a) => a.id === listing.deliveryAddressId),
    );
    const billingAddress = serializeAddr(
      addrRows.find((a) => a.id === listing.billingAddressId),
    );

    // İngiliz Usulü açık eksiltme: güncel en düşük teklif herkese görünür.
    const english:
      | {
          isEnglishAuction: true;
          currentBest: string | null;
          bidCount: number;
          currentRound: number;
        }
      | null = englishAgg
      ? {
          isEnglishAuction: true,
          currentBest: englishAgg._min.amount
            ? englishAgg._min.amount.toString()
            : null,
          bidCount: englishAgg._count,
          currentRound: listing.currentRound,
        }
      : null;

    const connected = connectedIds.includes(listing.companyId);
    const isPremium = user.tier === "PAKET";

    // Kalemler (herkese görünür — teklif vermek için gerekli).
    const itemsOut = items.map((it) => ({
      id: it.id,
      lineNo: it.lineNo,
      name: it.name,
      description: it.description,
      quantity: it.quantity.toString(),
      unit: it.unit,
      targetPrice: it.targetPrice?.toString() ?? null,
      materialCode: it.materialCode,
      requiredByDate: it.requiredByDate ? it.requiredByDate.toISOString() : null,
      questions: it.questions.map((q) => ({
        id: q.id,
        text: q.text,
        answerType: q.answerType,
        required: q.required,
      })),
    }));

    if (isOwner) {
      // Bağımsız sorgular paralel (sahip detayı 4sn'de bir poll'lanabilir).
      const needsApproval =
        listing.status === "IN_APPROVAL" ||
        listing.status === "IN_AWARD_APPROVAL";
      const [bids, invitations, pendingApprovalId] = await Promise.all([
        this.prisma.listingBid.findMany({
          where: { listingId: id, status: { in: ["SUBMITTED", "WON", "LOST"] } },
          include: {
            bidderCompany: { select: { name: true } },
            items: true,
          },
        }),
        this.prisma.listingInvitation.findMany({
          where: { listingId: id },
          include: {
            invitedCompany: { select: { name: true, supkeysId: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        needsApproval
          ? this.approvals.pendingForListing(user.companyId, id)
          : Promise.resolve(null),
      ]);
      bids.sort((a, b) =>
        listing.type === "ALIM"
          ? Number(a.amount) - Number(b.amount) // ALIM: düşük iyi
          : Number(b.amount) - Number(a.amount), // SATIS: yüksek iyi
      );
      const submittedCount = bids.filter(
        (b) => b.status === "SUBMITTED",
      ).length;
      return {
        ...this.detail(listing, false),
        isOwner: true,
        // Düzenlenebilir: TASLAK her zaman, AÇIK ise teklif gelmemişken.
        canEdit:
          listing.status === "DRAFT" ||
          (listing.status === "OPEN" && submittedCount === 0),
        // Yayınlanabilir: yalnızca taslakken.
        canPublish: listing.status === "DRAFT",
        // Bekleyen onay isteği (iptal için).
        pendingApprovalId,
        english,
        internalNotes: listing.internalNotes,
        deliveryAddressId: listing.deliveryAddressId,
        billingAddressId: listing.billingAddressId,
        deliveryAddress,
        billingAddress,
        items: itemsOut,
        invitations: invitations.map((iv) => ({
          companyName: iv.invitedCompany.name,
          supkeysId: iv.invitedCompany.supkeysId,
          createdAt: iv.createdAt,
        })),
        bids: bids.map((b) => ({
          id: b.id,
          bidderName: b.bidderCompany.name,
          bidderCompanyId: b.bidderCompanyId,
          amount: b.amount.toString(),
          currency: b.currency,
          version: b.version,
          // TRY dışı tekliflerde TCMB kuru + TRY karşılığı (kur gösterimi).
          exchangeRateSnapshot: b.exchangeRateSnapshot
            ? b.exchangeRateSnapshot.toString()
            : null,
          amountTry: b.exchangeRateSnapshot
            ? new Prisma.Decimal(b.amount)
                .mul(b.exchangeRateSnapshot)
                .toFixed(2)
            : null,
          note: b.note,
          isBuyNow: b.isBuyNow,
          status: b.status,
          round: b.round,
          createdAt: b.createdAt,
          items: b.items.map((bi) => ({
            itemId: bi.itemId,
            unitPrice: bi.unitPrice.toString(),
          })),
        })),
      };
    }

    // Bağımsız non-owner okumaları tek turda (görünürlük/blok kapısı sonuçlar
    // gelince değerlendirilir; over-fetch ucuz, seri tur sayısı düşer — P1).
    const [invitedCount, blockedIds, myBid, auctionView] = await Promise.all([
      listing.visibility === "PRIVATE"
        ? this.prisma.listingInvitation.count({
            where: { listingId: id, invitedCompanyId: user.companyId },
          })
        : Promise.resolve(0),
      this.blocks.blockedCompanyIds(listing.companyId),
      this.prisma.listingBid.findUnique({
        where: {
          listingId_bidderCompanyId: {
            listingId: id,
            bidderCompanyId: user.companyId,
          },
        },
        include: { items: true },
      }),
      // Açık eksiltme görünürlüğü (bidVisibility) — kapalı zarf korunur, sadece
      // ayara göre en iyi fiyat / kendi sıra / tüm sıralar açılır.
      listing.format === "ENGLISH_AUCTION"
        ? this.computeAuctionView(id, user.companyId, listing.bidVisibility)
        : Promise.resolve(null),
    ]);

    const isInvited = invitedCount > 0;
    const visible =
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PRIVATE" && isInvited);
    if (!visible) throw new NotFoundException("İlan bulunamadı");

    // Engelli firma ilanı göremez.
    if (blockedIds.includes(user.companyId)) {
      throw new NotFoundException("İlan bulunamadı");
    }
    // Ülke kapsamı: uluslararası ilan yurtiçi tedarikçiye, yurtiçi ilan yabancıya
    // görünmez (getOne ile aynı kural).
    if (
      !this.isCountryEligible(
        user.country,
        listing.company.country,
        listing.isInternational,
        listing.targetCountries,
      )
    ) {
      throw new NotFoundException("İlan bulunamadı");
    }

    const masked = listing.visibility === "PUBLIC" && !connected && !isPremium;
    const canBid =
      (listing.visibility === "PRIVATE" && isInvited) ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PUBLIC" && (connected || isPremium));
    // Bidder'a dönen `english` bloğu görünürlükle sınırlanır.
    const englishForBidder = english
      ? {
          ...english,
          currentBest: auctionView?.bestTotal ?? null,
          bidCount: auctionView?.participantCount ?? 0,
        }
      : null;
    return {
      ...this.detail(listing, masked),
      isOwner: false,
      masked,
      canBid,
      english: englishForBidder,
      auctionView,
      // Teslimat adresi davetli tedarikçiye de görünür (fatura adresi sahibe özel).
      deliveryAddress: masked ? null : deliveryAddress,
      items: masked ? [] : itemsOut,
      myBid: myBid
        ? {
            amount: myBid.amount.toString(),
            note: myBid.note,
            status: myBid.status,
            deliveryDate: myBid.deliveryDate
              ? myBid.deliveryDate.toISOString()
              : null,
            validityDays: myBid.validityDays,
            currency: myBid.currency,
            items: myBid.items.map((bi) => ({
              itemId: bi.itemId,
              unitPrice: bi.unitPrice.toString(),
            })),
          }
        : null,
    };
  }

  /**
   * Açık eksiltme görünürlük hesabı (eski computeAuctionView ile aynı mantık).
   * OWN_ONLY → null (hiçbir rakip bilgisi). Aksi halde bidVisibility'ye göre
   * en iyi fiyat / kendi sıra / katılımcı sayısı / tüm sıralar döner.
   * Kapalı zarf korunur: teklif sahibi kimlikleri ALL modunda bile gizli.
   */
  private async computeAuctionView(
    listingId: string,
    companyId: string,
    visibility: ListingBidVisibility,
  ): Promise<{
    bestTotal: string | null;
    myRank: number | null;
    participantCount: number | null;
    allBids: { rank: number; total: string; isMine: boolean }[] | null;
  } | null> {
    if (visibility === "OWN_ONLY") return null;

    const bids = await this.prisma.listingBid.findMany({
      where: { listingId, status: "SUBMITTED" },
      select: { bidderCompanyId: true, amount: true },
      orderBy: { amount: "asc" }, // açık eksiltme = ters ihale, düşük en iyi
    });
    const wantsBest =
      visibility === "BEST_PRICE" ||
      visibility === "BEST_AND_OWN_RANK" ||
      visibility === "ALL";
    const wantsRank =
      visibility === "OWN_RANK" ||
      visibility === "BEST_AND_OWN_RANK" ||
      visibility === "ALL";

    if (bids.length === 0) {
      return {
        bestTotal: null,
        myRank: null,
        participantCount: wantsBest || wantsRank ? 0 : null,
        allBids: visibility === "ALL" ? [] : null,
      };
    }

    const myIdx = bids.findIndex((b) => b.bidderCompanyId === companyId);
    return {
      bestTotal: wantsBest ? bids[0]!.amount.toString() : null,
      myRank: wantsRank && myIdx >= 0 ? myIdx + 1 : null,
      participantCount: wantsBest || wantsRank ? bids.length : null,
      allBids:
        visibility === "ALL"
          ? bids.map((b, i) => ({
              rank: i + 1,
              total: b.amount.toString(),
              isMine: b.bidderCompanyId === companyId,
            }))
          : null,
    };
  }

  /** Görülebilen bir ilana teklif ver/güncelle (firma başına tek teklif). */
  async placeBid(user: AuthenticatedCompanyUser, id: string, dto: PlaceBidDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        type: true,
        format: true,
        visibility: true,
        status: true,
        requireAllItems: true,
        currentRound: true,
        primaryCurrency: true,
        allowedCurrencies: true,
        closesAt: true,
        bidsOpenAt: true,
        isInternational: true,
        targetCountries: true,
        priceDecrementType: true,
        priceDecrementValue: true,
        priceDecrementBasis: true,
        autoExtendOnLateBid: true,
        autoExtendThresholdMin: true,
        autoExtendByMinutes: true,
        company: { select: { country: true } },
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId === user.companyId) {
      throw new BadRequestException("Kendi ilanınıza teklif veremezsiniz");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException("İlan teklife kapalı");
    }
    // Açılış saati gelmemişse teklif alınmaz (mühürlü açılış embargosu).
    if (listing.bidsOpenAt && Date.now() < listing.bidsOpenAt.getTime()) {
      throw new BadRequestException(
        "Teklif verme henüz başlamadı (açılış saatini bekleyin)",
      );
    }
    // Kapanış zamanı geçmişse teklif alınmaz (cron'u beklemeden — geç teklif
    // bütünlüğü). Scheduler ilanı ~1 dk içinde CLOSED'a çeker.
    if (listing.closesAt && Date.now() > listing.closesAt.getTime()) {
      throw new BadRequestException("Teklif süresi doldu");
    }
    // Ülke kapsamı: okuma (getOne) ile aynı kural teklif vermede de geçerli.
    if (
      !this.isCountryEligible(
        user.country,
        listing.company.country,
        listing.isInternational,
        listing.targetCountries,
      )
    ) {
      throw new NotFoundException("İlan bulunamadı");
    }
    // Engellenen firma teklif veremez (iki yön de).
    const blockedIds = await this.blocks.blockedCompanyIds(listing.companyId);
    if (blockedIds.includes(user.companyId)) {
      throw new NotFoundException("İlan bulunamadı");
    }

    const isDraft = dto.asDraft === true;
    // Para birimi: ilan izin veriyorsa seçilebilir; varsayılan ilanın birimi.
    const currency = (dto.currency as Currency) ?? listing.primaryCurrency;
    if (
      listing.allowedCurrencies.length > 0 &&
      !listing.allowedCurrencies.includes(currency)
    ) {
      throw new BadRequestException("Bu ilan için geçersiz para birimi");
    }
    // Gönderimde teslim tarihi + geçerlilik zorunlu (taslakta opsiyonel).
    if (!isDraft && (!dto.deliveryDate || !dto.validityDays)) {
      throw new BadRequestException(
        "Teklif göndermek için teslim tarihi ve geçerlilik süresi zorunlu",
      );
    }

    const connectedIds = await this.connectedCompanyIds(user.companyId);
    const connected = connectedIds.includes(listing.companyId);
    const isPremium = user.tier === "PAKET";
    const isInvited =
      listing.visibility === "PRIVATE"
        ? (await this.prisma.listingInvitation.count({
            where: { listingId: id, invitedCompanyId: user.companyId },
          })) > 0
        : false;
    const visible =
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PRIVATE" && isInvited);
    if (!visible) throw new NotFoundException("İlan bulunamadı");

    const canBid =
      (listing.visibility === "PRIVATE" && isInvited) ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PUBLIC" && (connected || isPremium));
    if (!canBid) {
      throw new ForbiddenException(
        listing.visibility === "PRIVATE"
          ? "Bu özel ihaleye yalnızca davetli firmalar teklif verebilir"
          : "Bu ilana teklif vermek için premium üyelik gerekir",
      );
    }

    // Rol (işleme göre): ALIM ilanı → teklifçi SATAR → Satışçı; SATIS → ALIR → Satın Almacı.
    const neededRole =
      listing.type === "ALIM" ? CompanyRole.SATISCI : CompanyRole.SATIN_ALMACI;
    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException(
        listing.type === "ALIM"
          ? "Alım ilanına teklif (satış) için Satışçı rolü gerekir"
          : "Satış ilanına teklif (alım) için Satın Almacı rolü gerekir",
      );
    }

    // Kalem-bazlı vs tek-tutar teklif. İhalede kalem varsa kalem teklifi zorunlu;
    // toplam = Σ(birim fiyat × kalem miktarı).
    const listingItems = await this.prisma.listingItem.findMany({
      where: { listingId: id },
      select: { id: true, quantity: true },
    });

    // Para tutarları Decimal ile hesaplanır (kayan nokta birikimi yok — F7).
    let amount: Prisma.Decimal;
    let bidItemsData: { itemId: string; unitPrice: number }[] = [];

    if (listingItems.length > 0) {
      if (!dto.items || dto.items.length === 0) {
        throw new BadRequestException(
          "Bu ihale kalem-bazlı; en az bir kaleme birim fiyat girin",
        );
      }
      const qtyById = new Map(
        listingItems.map((i) => [i.id, i.quantity] as const),
      );
      const provided = dto.items.filter((bi) => qtyById.has(bi.itemId));
      if (provided.length === 0) {
        throw new BadRequestException("Geçerli kalem teklifi yok");
      }
      // Aynı kalem iki kez gönderilirse toplam yanlış hesaplanır (DB unique
      // ihlali öncesi) — baştan reddet (F6).
      if (new Set(provided.map((bi) => bi.itemId)).size !== provided.length) {
        throw new BadRequestException("Aynı kalem birden fazla kez girilemez");
      }
      if (
        listing.requireAllItems &&
        provided.length < listingItems.length
      ) {
        throw new BadRequestException(
          "Bu ihalede tüm kalemlere teklif vermelisiniz",
        );
      }
      amount = provided.reduce(
        (sum, bi) =>
          sum.plus(
            new Prisma.Decimal(bi.unitPrice).mul(
              qtyById.get(bi.itemId) ?? 0,
            ),
          ),
        new Prisma.Decimal(0),
      );
      // Gönderilen (taslak olmayan) teklif sıfır toplam olamaz; tüm birim
      // fiyatlar 0 ise "kazanan sıfır teklif" oluşmasın (F6).
      if (!isDraft && amount.lte(0)) {
        throw new BadRequestException("Teklif toplamı sıfırdan büyük olmalı");
      }
      bidItemsData = provided.map((bi) => ({
        itemId: bi.itemId,
        unitPrice: bi.unitPrice,
      }));
    } else {
      if (dto.amount == null || dto.amount <= 0) {
        throw new BadRequestException("Geçerli bir tutar girin");
      }
      amount = new Prisma.Decimal(dto.amount);
    }

    // İngiliz Usulü (açık eksiltme): GÖNDERİLEN teklif, düşürme kuralına göre
    // referansın (en düşük teklif veya kendi son teklifi) yeterince ALTINDA
    // olmalı. Taslakta serbest.
    if (!isDraft && listing.format === "ENGLISH_AUCTION") {
      const [bestAgg, own] = await Promise.all([
        this.prisma.listingBid.aggregate({
          where: {
            listingId: id,
            status: "SUBMITTED",
            bidderCompanyId: { not: user.companyId },
          },
          _min: { amount: true },
        }),
        this.prisma.listingBid.findUnique({
          where: {
            listingId_bidderCompanyId: {
              listingId: id,
              bidderCompanyId: user.companyId,
            },
          },
          select: { amount: true, status: true },
        }),
      ]);
      const best: Prisma.Decimal | null = bestAgg._min.amount ?? null;
      const ownLast: Prisma.Decimal | null =
        own && own.status === "SUBMITTED" ? own.amount : null;
      const ref =
        listing.priceDecrementBasis === "OWN_LAST_BID" ? ownLast ?? best : best;
      if (ref != null) {
        const dv =
          listing.priceDecrementValue != null
            ? new Prisma.Decimal(listing.priceDecrementValue)
            : new Prisma.Decimal(0);
        const step = dv.gt(0)
          ? listing.priceDecrementType === "PERCENT"
            ? ref.mul(dv).div(100)
            : dv
          : new Prisma.Decimal(0);
        const maxAllowed = ref.minus(step);
        // Decimal kesin aritmetik — epsilon toleransına gerek yok.
        if (amount.gt(maxAllowed)) {
          const fmt = (d: Prisma.Decimal) =>
            d.toNumber().toLocaleString("tr-TR");
          throw new BadRequestException(
            step.gt(0)
              ? `İngiliz usulü: teklifiniz en fazla ${fmt(maxAllowed)} ₺ olabilir (referansı en az ${fmt(step)} azaltmalısınız)`
              : `İngiliz usulü: teklifiniz ${fmt(ref)} ₺'nin altında olmalı`,
          );
        }
      }
    }

    // TRY dışı teklifte güncel TCMB kuru anlık snapshot'lanır (karşılaştırma için).
    let exchangeRateSnapshot: number | null = null;
    if (currency !== "TRY") {
      exchangeRateSnapshot = await this.exchangeRates
        .getCurrentRate(currency)
        .catch((err) => {
          // Kur alınamazsa teklif yine kabul edilir ama TRY karşılığı boş kalır;
          // sessiz kalmasın diye logla (gözlemlenebilirlik).
          this.logger.warn(
            `TCMB kuru alınamadı (${currency}); teklif TRY karşılığı olmadan kaydedilecek: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return null;
        });
    }

    const status = isDraft ? "DRAFT" : "SUBMITTED";
    const deliveryDate = dto.deliveryDate ? new Date(dto.deliveryDate) : null;
    const validityDays = dto.validityDays ?? null;

    const bid = await this.prisma.$transaction(async (tx) => {
      const b = await tx.listingBid.upsert({
        where: {
          listingId_bidderCompanyId: {
            listingId: id,
            bidderCompanyId: user.companyId,
          },
        },
        create: {
          listingId: id,
          bidderCompanyId: user.companyId,
          amount,
          currency,
          exchangeRateSnapshot,
          deliveryDate,
          validityDays,
          note: dto.note?.trim() || null,
          createdById: user.userId,
          status,
          submittedAt: isDraft ? null : new Date(),
          round: listing.currentRound,
        },
        update: {
          amount,
          currency,
          exchangeRateSnapshot,
          deliveryDate,
          validityDays,
          note: dto.note?.trim() || null,
          status,
          version: { increment: 1 },
          ...(isDraft ? {} : { submittedAt: new Date() }),
          round: listing.currentRound,
        },
      });
      if (listingItems.length > 0) {
        // Kalem tekliflerini yenile (eskileri sil → yeniden yaz).
        await tx.listingBidItem.deleteMany({ where: { bidId: b.id } });
        await tx.listingBidItem.createMany({
          data: bidItemsData.map((bi) => ({
            bidId: b.id,
            itemId: bi.itemId,
            unitPrice: bi.unitPrice,
          })),
        });
      }
      return b;
    });

    // Auto-extend: açık eksiltmede son dakikada gelen teklif kapanışı uzatır.
    if (
      !isDraft &&
      listing.format === "ENGLISH_AUCTION" &&
      listing.autoExtendOnLateBid &&
      listing.closesAt &&
      listing.autoExtendThresholdMin &&
      listing.autoExtendByMinutes
    ) {
      const msLeft = listing.closesAt.getTime() - Date.now();
      const thresholdMs = listing.autoExtendThresholdMin * 60_000;
      if (msLeft > 0 && msLeft <= thresholdMs) {
        await this.prisma.listing.update({
          where: { id },
          data: {
            closesAt: new Date(
              listing.closesAt.getTime() +
                listing.autoExtendByMinutes * 60_000,
            ),
            closingReminderSentAt: null, // hatırlatma yeniden gönderilebilsin
          },
        });
      }
    }

    return { id: bid.id, amount: bid.amount.toString(), status: bid.status };
  }

  /**
   * Hemen-Al — SATIS ilanında tavan (buyNow) fiyattan teklif oluşturur.
   * DİREKT SİPARİŞ DEĞİL: sahip yine onaylar (kazandırır). isBuyNow=true bayraklı.
   */
  async buyNow(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        visibility: true,
        status: true,
        buyNowPrice: true,
        closesAt: true,
        bidsOpenAt: true,
        isInternational: true,
        targetCountries: true,
        company: { select: { country: true } },
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.type !== "SATIS" || !listing.buyNowPrice) {
      throw new BadRequestException("Bu ilanda hemen-al seçeneği yok");
    }
    if (listing.companyId === user.companyId) {
      throw new BadRequestException("Kendi ilanınız");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException("İlan teklife kapalı");
    }
    if (listing.bidsOpenAt && Date.now() < listing.bidsOpenAt.getTime()) {
      throw new BadRequestException(
        "Teklif verme henüz başlamadı (açılış saatini bekleyin)",
      );
    }
    if (listing.closesAt && Date.now() > listing.closesAt.getTime()) {
      throw new BadRequestException("Teklif süresi doldu");
    }
    if (
      !this.isCountryEligible(
        user.country,
        listing.company.country,
        listing.isInternational,
        listing.targetCountries,
      )
    ) {
      throw new NotFoundException("İlan bulunamadı");
    }
    const blockedIds = await this.blocks.blockedCompanyIds(listing.companyId);
    if (blockedIds.includes(user.companyId)) {
      throw new NotFoundException("İlan bulunamadı");
    }

    const connectedIds = await this.connectedCompanyIds(user.companyId);
    const connected = connectedIds.includes(listing.companyId);
    const isPremium = user.tier === "PAKET";
    const visible =
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PRIVATE" &&
        (await this.prisma.listingInvitation.count({
          where: { listingId, invitedCompanyId: user.companyId },
        })) > 0);
    if (!visible) throw new NotFoundException("İlan bulunamadı");
    const canBid =
      connected || (listing.visibility === "PUBLIC" && isPremium);
    if (!canBid) {
      throw new ForbiddenException("Bu ilana teklif için premium gerekir");
    }
    if (!user.roles.includes(CompanyRole.SATIN_ALMACI)) {
      throw new ForbiddenException("Hemen-Al için Satın Almacı rolü gerekir");
    }

    const bid = await this.prisma.listingBid.upsert({
      where: {
        listingId_bidderCompanyId: {
          listingId,
          bidderCompanyId: user.companyId,
        },
      },
      create: {
        listingId,
        bidderCompanyId: user.companyId,
        amount: listing.buyNowPrice,
        isBuyNow: true,
        createdById: user.userId,
        status: "SUBMITTED",
      },
      update: {
        amount: listing.buyNowPrice,
        isBuyNow: true,
        status: "SUBMITTED",
      },
    });
    return { id: bid.id, amount: bid.amount.toString(), isBuyNow: true };
  }

  /**
   * Kazandır — ilan sahibi bir teklifi seçer → Sipariş oluşur (satıcı→alıcı
   * normalleşir), ilan AWARDED, kazanan WON, diğerleri LOST.
   * ALIM ilanı: satıcı=kazanan teklifçi, alıcı=ilan sahibi.
   * SATIS ilanı: satıcı=ilan sahibi, alıcı=kazanan teklifçi.
   */
  async award(user: AuthenticatedCompanyUser, listingId: string, bidId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        status: true,
        requireBidDocument: true,
        primaryCurrency: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi kazandırabilir");
    }
    if (listing.status !== "OPEN" && listing.status !== "CLOSED") {
      throw new BadRequestException("İlan zaten kazandırılmış veya iptal");
    }
    const neededRole =
      listing.type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;
    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException("Kazandırma için yetkiniz yok");
    }

    const bid = await this.prisma.listingBid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        listingId: true,
        bidderCompanyId: true,
        amount: true,
        status: true,
        items: { select: { itemId: true, unitPrice: true } },
      },
    });
    if (!bid || bid.listingId !== listingId || bid.status !== "SUBMITTED") {
      throw new BadRequestException("Geçersiz teklif");
    }

    if (listing.requireBidDocument) {
      const docCount = await this.prisma.listingBidDocument.count({
        where: { bidId },
      });
      if (docCount === 0) {
        throw new BadRequestException(
          "Bu ihale teklif belgesi zorunlu kılıyor; kazanan teklifin belgesi yok",
        );
      }
    }

    // Onay akışı varsa kazandırmayı askıya al (IN_AWARD_APPROVAL); yoksa uygula.
    const res = await this.approvals.requestApproval(user, {
      listingId,
      type: "LISTING_AWARD",
      listingType: listing.type,
      amount: Number(bid.amount),
      currency: listing.primaryCurrency,
      payload: { kind: "full", bidId },
    });
    if (!res.approved) {
      await this.prisma.listing.update({
        where: { id: listingId },
        data: { status: "IN_AWARD_APPROVAL" },
      });
      return { pendingApproval: true as const };
    }
    return this.runFullAward(listingId, bidId);
  }

  /** Tam kazandırmayı uygula — sipariş oluştur, WON/LOST, AWARDED. */
  private async runFullAward(listingId: string, bidId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, type: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    const bid = await this.prisma.listingBid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        bidderCompanyId: true,
        amount: true,
        items: { select: { itemId: true, unitPrice: true } },
      },
    });
    if (!bid) throw new BadRequestException("Geçersiz teklif");

    const listingItems = await this.prisma.listingItem.findMany({
      where: { listingId },
      select: { id: true, name: true, quantity: true, unit: true },
    });
    const orderItems = listingItems
      .map((li) => {
        const bi = bid.items.find((x) => x.itemId === li.id);
        return bi
          ? {
              name: li.name,
              quantity: li.quantity,
              unit: li.unit,
              unitPrice: bi.unitPrice,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const sellerCompanyId =
      listing.type === "ALIM" ? bid.bidderCompanyId : listing.companyId;
    const buyerCompanyId =
      listing.type === "ALIM" ? listing.companyId : bid.bidderCompanyId;

    const number = await this.nextOrderNumber();
    const order = await this.prisma.$transaction(async (tx) => {
      // Atomik durum geçişi: yalnızca OPEN|CLOSED iken AWARDED'a geç. Eşzamanlı
      // ikinci kazandırma (ya da tekrar gönderilen onay-event'i) burada count=0
      // alır ve iptal edilir — çift sipariş oluşmaz (F1/F5).
      const transition = await tx.listing.updateMany({
        where: {
          id: listingId,
          status: { in: ["OPEN", "CLOSED", "IN_AWARD_APPROVAL"] },
        },
        data: { status: "AWARDED", awardedAt: new Date() },
      });
      if (transition.count !== 1) {
        throw new BadRequestException("İlan zaten kazandırılmış");
      }
      await tx.listingBid.update({
        where: { id: bidId },
        data: { status: "WON" },
      });
      await tx.listingBid.updateMany({
        where: { listingId, id: { not: bidId }, status: "SUBMITTED" },
        data: { status: "LOST" },
      });
      const o = await tx.companyOrder.create({
        data: {
          number,
          listingId,
          sellerCompanyId,
          buyerCompanyId,
          amount: bid.amount,
          status: "PENDING", // satıcı onayı bekler (accept/reject)
        },
      });
      if (orderItems.length > 0) {
        await tx.companyOrderItem.createMany({
          data: orderItems.map((it) => ({ orderId: o.id, ...it })),
        });
      }
      return o;
      // Sipariş oluşturma birden çok yazma içerir; yüksek DB gecikmesinde
      // varsayılan 5sn interactive-transaction limiti aşılabilir.
    }, { timeout: 20000 });

    const recipient = await this.companyRecipient(bid.bidderCompanyId);
    if (recipient) {
      this.notify(
        recipient,
        {
          subject: "Tebrikler — teklifiniz kazandı",
          heading: "Teklifiniz kazandı 🎉",
          paragraphs: [
            "Merhaba,",
            `Bir ihalede teklifiniz kazandı ve ${order.number} numaralı sipariş oluştu. Sipariş detaylarını ve sonraki adımları Rothern'den takip edebilirsiniz.`,
          ],
          ctaLabel: "Siparişi Gör",
          ctaUrl: `${this.webUrl()}/company/siparis/${order.id}`,
        },
        { type: "bid_awarded", id: order.id },
      );
    }
    return { orderId: order.id, number: order.number };
  }

  /**
   * Kalem-bazlı kazandırma — her kalem ayrı teklife verilir; kazanan tedarikçi
   * başına bir sipariş oluşur. Yalnızca ALIM + kalemli ihale.
   */
  async awardByItem(
    user: AuthenticatedCompanyUser,
    listingId: string,
    itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[],
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        status: true,
        primaryCurrency: true,
        requireBidDocument: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi kazandırabilir");
    }
    if (listing.status !== "OPEN" && listing.status !== "CLOSED") {
      throw new BadRequestException("İlan zaten kazandırılmış veya iptal");
    }
    if (listing.type !== "ALIM") {
      throw new BadRequestException(
        "Kalem-bazlı kazandırma yalnızca alım ihalelerinde",
      );
    }
    if (!user.roles.includes(CompanyRole.SATIN_ALMACI)) {
      throw new ForbiddenException("Kazandırma için yetkiniz yok");
    }

    // Belge zorunluysa her kazanan teklifin en az 1 belgesi olmalı (tam-kazandırma
    // ile aynı kural — item-award baypasını kapatır).
    if (listing.requireBidDocument) {
      const winningBidIds = [...new Set(itemAwards.map((a) => a.bidId))];
      for (const bidId of winningBidIds) {
        const docCount = await this.prisma.listingBidDocument.count({
          where: { bidId },
        });
        if (docCount === 0) {
          throw new BadRequestException(
            "Belge zorunlu — kazanan teklifin yüklü belgesi yok",
          );
        }
      }
    }

    const total = await this.itemAwardTotal(listingId, itemAwards);

    const res = await this.approvals.requestApproval(user, {
      listingId,
      type: "LISTING_AWARD",
      listingType: listing.type,
      amount: total,
      currency: listing.primaryCurrency,
      payload: { kind: "by-item", itemAwards },
    });
    if (!res.approved) {
      await this.prisma.listing.update({
        where: { id: listingId },
        data: { status: "IN_AWARD_APPROVAL" },
      });
      return { pendingApproval: true as const };
    }
    return this.runItemAward(listingId, itemAwards);
  }

  /**
   * Kalem-bazlı kazandırma planını kur (kazanan firma → sipariş kalemleri +
   * tutar). Kısmi miktar (awardedQuantity) desteklenir.
   */
  private async buildItemGroups(
    listingId: string,
    itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[],
  ) {
    const items = await this.prisma.listingItem.findMany({
      where: { listingId },
      select: { id: true, name: true, quantity: true, unit: true },
    });
    if (items.length === 0) {
      throw new BadRequestException("Bu ihalede kalem yok");
    }
    const itemMap = new Map(items.map((i) => [i.id, i]));
    // Kısmi kapsam: yalnızca kazanan seçilen kalemler kazandırılır; teklif
    // almamış/seçilmemiş kalemler atlanır (eski sistemle aynı). En az 1 gerekir.
    if (itemAwards.length === 0) {
      throw new BadRequestException("En az bir kalem için kazanan seçin");
    }
    // Bir kalem yalnızca tek kazanana verilebilir. Aynı itemId iki kez gelirse
    // awardedQuantity sessizce ezilirdi (F8) — baştan reddet.
    if (
      new Set(itemAwards.map((a) => a.itemId)).size !== itemAwards.length
    ) {
      throw new BadRequestException(
        "Bir kalem birden fazla kazanana verilemez",
      );
    }
    const bidIds = [...new Set(itemAwards.map((a) => a.bidId))];
    const bids = await this.prisma.listingBid.findMany({
      where: { id: { in: bidIds }, listingId, status: "SUBMITTED" },
      select: {
        id: true,
        bidderCompanyId: true,
        items: { select: { itemId: true, unitPrice: true } },
      },
    });
    const bidMap = new Map(bids.map((b) => [b.id, b]));

    const groups = new Map<
      string,
      {
        orderItems: {
          name: string;
          quantity: number;
          unit: string;
          unitPrice: number;
        }[];
        amount: Prisma.Decimal; // sipariş tutarı — Decimal (F7)
        bidIds: Set<string>;
      }
    >();
    const itemQty = new Map<string, number>(); // kalem → verilen miktar (kısmi)
    for (const a of itemAwards) {
      const bid = bidMap.get(a.bidId);
      const li = itemMap.get(a.itemId);
      if (!bid || !li) throw new BadRequestException("Geçersiz kalem/teklif");
      const bi = bid.items.find((x) => x.itemId === a.itemId);
      if (!bi) {
        throw new BadRequestException(
          `Seçilen teklifin "${li.name}" kalemi için fiyatı yok`,
        );
      }
      const fullQty = Number(li.quantity);
      const qty =
        a.awardedQuantity != null && a.awardedQuantity > 0
          ? Math.min(a.awardedQuantity, fullQty)
          : fullQty;
      itemQty.set(a.itemId, qty);
      let g = groups.get(bid.bidderCompanyId);
      if (!g) {
        g = { orderItems: [], amount: new Prisma.Decimal(0), bidIds: new Set() };
        groups.set(bid.bidderCompanyId, g);
      }
      g.bidIds.add(bid.id);
      g.orderItems.push({
        name: li.name,
        quantity: qty,
        unit: li.unit,
        unitPrice: Number(bi.unitPrice),
      });
      g.amount = g.amount.plus(new Prisma.Decimal(bi.unitPrice).mul(qty));
    }
    return { groups, itemQty };
  }

  private async itemAwardTotal(
    listingId: string,
    itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[],
  ): Promise<number> {
    const { groups } = await this.buildItemGroups(listingId, itemAwards);
    return [...groups.values()]
      .reduce((s, g) => s.plus(g.amount), new Prisma.Decimal(0))
      .toNumber();
  }

  /** Kalem-bazlı kazandırmayı uygula — kazanan firma başına sipariş. */
  private async runItemAward(
    listingId: string,
    itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[],
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    const { groups, itemQty } = await this.buildItemGroups(
      listingId,
      itemAwards,
    );
    const groupArr = [...groups.entries()];
    const numbers = await this.nextOrderNumbers(groupArr.length);
    const winningBidIds = [...new Set(itemAwards.map((a) => a.bidId))];

    const created = await this.prisma.$transaction(async (tx) => {
      // Atomik durum geçişi (çift kazandırma koruması — F1/F5).
      const transition = await tx.listing.updateMany({
        where: {
          id: listingId,
          status: { in: ["OPEN", "CLOSED", "IN_AWARD_APPROVAL"] },
        },
        data: { status: "AWARDED", awardedAt: new Date() },
      });
      if (transition.count !== 1) {
        throw new BadRequestException("İlan zaten kazandırılmış");
      }
      await tx.listingBid.updateMany({
        where: { listingId, id: { in: winningBidIds }, status: "SUBMITTED" },
        data: { status: "WON" },
      });
      await tx.listingBid.updateMany({
        where: { listingId, id: { notIn: winningBidIds }, status: "SUBMITTED" },
        data: { status: "LOST" },
      });
      for (const [itemId, qty] of itemQty) {
        await tx.listingItem.update({
          where: { id: itemId },
          data: { awardedQuantity: qty },
        });
      }
      const orders: { id: string; number: string | null }[] = [];
      for (let i = 0; i < groupArr.length; i++) {
        const [sellerCompanyId, g] = groupArr[i]!;
        const o = await tx.companyOrder.create({
          data: {
            number: numbers[i],
            listingId,
            sellerCompanyId,
            buyerCompanyId: listing.companyId,
            amount: g.amount,
            status: "PENDING", // satıcı onayı bekler (accept/reject)
            items: {
              create: g.orderItems.map((it) => ({
                name: it.name,
                quantity: it.quantity,
                unit: it.unit,
                unitPrice: it.unitPrice,
              })),
            },
          },
        });
        orders.push({ id: o.id, number: o.number });
      }
      return orders;
      // Satıcı başına sipariş + kalemler → çok sayıda yazma; gecikmede 5sn
      // varsayılanı yetmeyebilir.
    }, { timeout: 20000 });

    // Kazanan her firmaya bildirim — alıcıları tek seferde topla (N+1 yerine).
    const recipients = await this.companyRecipients(
      groupArr.map(([sellerCompanyId]) => sellerCompanyId),
    );
    for (let i = 0; i < groupArr.length; i++) {
      const [sellerCompanyId] = groupArr[i]!;
      const o = created[i];
      const recipient = recipients.get(sellerCompanyId);
      if (recipient && o) {
        this.notify(
          recipient,
          {
            subject: "Tebrikler — teklifiniz kazandı",
            heading: "Teklifiniz kazandı 🎉",
            paragraphs: [
              "Merhaba,",
              `Bir ihalede teklifiniz kazandı ve ${o.number} numaralı sipariş oluştu.`,
            ],
            ctaLabel: "Siparişi Gör",
            ctaUrl: `${this.webUrl()}/company/siparis/${o.id}`,
          },
          { type: "bid_awarded", id: o.id },
        );
      }
    }
    return { orders: created, count: created.length };
  }

  /** Kazandırma onayı onaylandı → saklanan plana göre uygula. */
  @OnEvent("listing.award.approved")
  async onAwardApproved(payload: { listingId: string; payload: unknown }) {
    const p = payload.payload as
      | { kind: "full"; bidId: string }
      | {
          kind: "by-item";
          itemAwards: {
            itemId: string;
            bidId: string;
            awardedQuantity?: number;
          }[];
        }
      | null;
    if (!p) return;
    if (p.kind === "full") {
      await this.runFullAward(payload.listingId, p.bidId);
    } else if (p.kind === "by-item") {
      await this.runItemAward(payload.listingId, p.itemAwards);
    }
  }

  /** Kazandırma onayı reddedildi → ilan teklife kapalı (CLOSED) durumuna döner. */
  @OnEvent("listing.award.rejected")
  async onAwardRejected(payload: { listingId: string }) {
    await this.prisma.listing.update({
      where: { id: payload.listingId },
      data: { status: "CLOSED" },
    });
  }

  /**
   * Yeni Tur Oluştur — tek akış (eski sistemle birebir). Aynı ilan üzerinde
   * in-place ilerler: mevcut turu snapshot'lar, tipi (RFQ/İngiliz) ve
   * parametreleri uygular (tip değişimi = RFQ↔İngiliz "aktarma"), teklifleri
   * taşıma moduna göre düzenler (AUTO/LAZY→taslak taşı, NONE→sıfırla), opsiyonel
   * teklif-vermeyeni eler, yeni açılış/kapanışla yeniden açar.
   */
  async createNextRound(
    user: AuthenticatedCompanyUser,
    listingId: string,
    dto: NextRoundDto,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        status: true,
        currentRound: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi yeni tur açabilir");
    }
    if (listing.type !== "ALIM") {
      throw new BadRequestException("Yeni tur yalnızca alım ilanında açılabilir");
    }
    if (!["OPEN", "CLOSED", "CLOSED_NO_AWARD"].includes(listing.status)) {
      throw new BadRequestException(
        "Yeni tur yalnızca açık veya kapanmış ilanda açılabilir",
      );
    }
    const isAuction = dto.type === "ENGLISH_AUCTION";
    if (isAuction && !((dto.priceDecrementValue ?? 0) > 0)) {
      throw new BadRequestException(
        "Açık eksiltme için fiyat azaltma değeri zorunlu",
      );
    }
    if (
      isAuction &&
      dto.priceDecrementType === "PERCENT" &&
      (dto.priceDecrementValue ?? 0) >= 100
    ) {
      throw new BadRequestException("Yüzde azaltma 100'den küçük olmalı");
    }
    const closesAt = new Date(dto.closesAt);
    if (Number.isNaN(closesAt.getTime()) || closesAt.getTime() <= Date.now()) {
      throw new BadRequestException("Kapanış tarihi gelecekte olmalı");
    }
    const bidsOpenAt = dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null;
    if (bidsOpenAt && bidsOpenAt.getTime() >= closesAt.getTime()) {
      throw new BadRequestException("Açılış tarihi kapanıştan önce olmalı");
    }

    // Mevcut turun teklifleri (gönderilmiş + elenmiş/kazansız). CLOSED_NO_AWARD'da
    // teklifler LOST olduğundan da taşınabilsin diye LOST dahil.
    const bids = await this.prisma.listingBid.findMany({
      where: {
        listingId,
        round: listing.currentRound,
        status: { in: ["SUBMITTED", "LOST"] as ListingBidStatus[] },
      },
      include: { bidderCompany: { select: { name: true } } },
    });
    const bidderCompanyIds = [...new Set(bids.map((b) => b.bidderCompanyId))];
    const priorWhere = {
      listingId,
      round: listing.currentRound,
      status: { in: ["SUBMITTED", "LOST"] as ListingBidStatus[] },
    };

    await this.prisma.$transaction(async (tx) => {
      if (bids.length > 0) {
        await tx.listingRoundSnapshot.createMany({
          data: bids.map((b) => ({
            listingId,
            round: listing.currentRound,
            bidderName: b.bidderCompany.name,
            amount: b.amount,
          })),
        });
      }
      // Teklif taşıma: AUTO → canlı taşı (SUBMITTED kalır, owner hemen görür);
      // LAZY → taslağa çek (tedarikçi yeniden gönderir); NONE → LOST (sıfırdan).
      if (dto.carryBids === "AUTO") {
        await tx.listingBid.updateMany({
          where: priorWhere,
          data: { status: "SUBMITTED" },
        });
      } else if (dto.carryBids === "LAZY") {
        await tx.listingBid.updateMany({
          where: priorWhere,
          data: { status: "DRAFT" },
        });
      } else {
        await tx.listingBid.updateMany({
          where: priorWhere,
          data: { status: "LOST" },
        });
      }
      // Teklif vermeyeni ele: yalnızca önceki turda teklif verenlerin daveti kalır.
      if (dto.eliminateNonBidders && bidderCompanyIds.length > 0) {
        await tx.listingInvitation.deleteMany({
          where: { listingId, invitedCompanyId: { notIn: bidderCompanyIds } },
        });
      }
      await tx.listing.update({
        where: { id: listingId },
        data: {
          format: dto.type as ListingFormat,
          status: "OPEN",
          closesAt,
          bidsOpenAt,
          publishedAt: new Date(),
          closingReminderSentAt: null,
          currentRound: { increment: 1 },
          isSealedBid: isAuction,
          bidVisibility: isAuction
            ? (dto.bidVisibility as ListingBidVisibility)
            : "OWN_ONLY",
          priceDecrementType: isAuction ? dto.priceDecrementType : null,
          priceDecrementValue: isAuction ? dto.priceDecrementValue : null,
          priceDecrementBasis: isAuction ? dto.priceDecrementBasis : null,
          autoExtendOnLateBid: isAuction ? (dto.autoExtendOnLateBid ?? true) : false,
          autoExtendThresholdMin: isAuction
            ? (dto.autoExtendThresholdMin ?? 2)
            : null,
          autoExtendByMinutes: isAuction
            ? (dto.autoExtendByMinutes ?? 2)
            : null,
        },
      });
    });

    void this.notifyListingInvitees(listingId, "reminder");
    return { ok: true, round: listing.currentRound + 1 };
  }

  /**
   * Yayın sonrası tedarikçi daveti — DRAFT/OPEN ilana bağlı firma ekler.
   * İngiliz Usulü + OPEN + kapanışa <2 dk kala eklenemez (eski sistemle aynı).
   * OPEN ilanda yeni davetlilere anında davet e-postası gider.
   */
  async addInvitations(
    user: AuthenticatedCompanyUser,
    listingId: string,
    supkeysIds: string[],
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        status: true,
        format: true,
        closesAt: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi davet ekleyebilir");
    }
    if (listing.status !== "DRAFT" && listing.status !== "OPEN") {
      throw new BadRequestException("Bu ilana artık davet eklenemez");
    }
    if (
      listing.format === "ENGLISH_AUCTION" &&
      listing.status === "OPEN" &&
      listing.closesAt &&
      listing.closesAt.getTime() - Date.now() < 2 * 60_000
    ) {
      throw new BadRequestException(
        "Kapanışa 2 dakikadan az kala İngiliz Usulü ihaleye tedarikçi eklenemez",
      );
    }

    const connectedIds = await this.connectedCompanyIds(user.companyId);
    const codes = (supkeysIds ?? [])
      .map((c) => normalizeShortCode(c))
      .filter((c) => validateShortCode(c));
    const targets = await this.prisma.company.findMany({
      where: { supkeysId: { in: codes } },
      select: { id: true },
    });
    const wanted = targets
      .map((t) => t.id)
      .filter((id) => id !== user.companyId && connectedIds.includes(id));

    const existing = await this.prisma.listingInvitation.findMany({
      where: { listingId, invitedCompanyId: { in: wanted } },
      select: { invitedCompanyId: true },
    });
    const already = new Set(existing.map((e) => e.invitedCompanyId));
    const toAdd = wanted.filter((id) => !already.has(id));

    if (toAdd.length > 0) {
      await this.prisma.listingInvitation.createMany({
        data: toAdd.map((cid) => ({
          listingId,
          invitedCompanyId: cid,
          invitedById: user.userId,
        })),
        skipDuplicates: true,
      });
      // OPEN ilanda yeni davetlilere anında davet e-postası.
      if (listing.status === "OPEN") {
        const title = await this.prisma.listing.findUnique({
          where: { id: listingId },
          select: { title: true, number: true },
        });
        const url = `${this.webUrl()}/company/ilan/${listingId}`;
        const addRecipients = await this.companyRecipients(toAdd);
        for (const cid of toAdd) {
          const r = addRecipients.get(cid);
          if (!r) continue;
          this.notify(
            r,
            {
              subject: "Bir ihaleye davet edildiniz",
              heading: "İhale daveti",
              paragraphs: [
                "Merhaba,",
                `"${title?.title ?? "İhale"}" (${title?.number ?? "—"}) ihalesine davet edildiniz. Detayları görmek ve teklif vermek için giriş yapın.`,
              ],
              ctaLabel: "İhaleyi Gör",
              ctaUrl: url,
            },
            { type: "listing_invitation", id: listingId },
          );
        }
      }
    }
    return { added: toAdd.length, skipped: wanted.length - toAdd.length };
  }

  /** İngiliz Usulü tur geçmişi — sahip görür. Tur → teklifler (artan). */
  async roundHistory(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    const snaps = await this.prisma.listingRoundSnapshot.findMany({
      where: { listingId },
      orderBy: [{ round: "desc" }, { amount: "asc" }],
    });
    const byRound = new Map<
      number,
      Array<{ bidderName: string; amount: string }>
    >();
    for (const s of snaps) {
      const arr = byRound.get(s.round) ?? [];
      arr.push({ bidderName: s.bidderName, amount: s.amount.toString() });
      byRound.set(s.round, arr);
    }
    return [...byRound.entries()].map(([round, bids]) => ({ round, bids }));
  }

  /**
   * Eleme — ilan sahibi tek bir SUBMITTED teklifi LOST yapar (kazandırmadan).
   * Elenen tedarikçi yeniden teklif verebilir (placeBid SUBMITTED'a döndürür).
   */
  async eliminate(
    user: AuthenticatedCompanyUser,
    listingId: string,
    bidId: string,
    reason?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, status: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi eleme yapabilir");
    }
    // Karar aşaması: açık VEYA kapanmış ilanda eleme yapılabilir (award ile aynı).
    if (listing.status !== "OPEN" && listing.status !== "CLOSED") {
      throw new BadRequestException("Bu durumda eleme yapılamaz");
    }
    const bid = await this.prisma.listingBid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        listingId: true,
        status: true,
        bidderCompanyId: true,
      },
    });
    if (!bid || bid.listingId !== listingId || bid.status !== "SUBMITTED") {
      throw new BadRequestException("Geçersiz teklif");
    }
    await this.prisma.listingBid.update({
      where: { id: bidId },
      data: {
        status: "LOST",
        eliminationReason: reason?.trim() || null,
        eliminatedAt: new Date(),
      },
    });

    // Tedarikçiye eleme bildirimi (gerekçe paylaşılmaz — eski sistem davranışı).
    const [recipient, info] = await Promise.all([
      this.companyRecipient(bid.bidderCompanyId),
      this.prisma.listing.findUnique({
        where: { id: listingId },
        select: { title: true, number: true },
      }),
    ]);
    if (recipient) {
      this.notify(
        recipient,
        {
          subject: "Teklifiniz hakkında güncelleme",
          heading: "Teklifiniz değerlendirme dışı kaldı",
          paragraphs: [
            "Merhaba,",
            `"${info?.title ?? "İhale"}" (${info?.number ?? "—"}) ihalesinde teklifiniz bu turda elendi. Dilerseniz güncelleyip yeniden teklif verebilirsiniz.`,
          ],
          ctaLabel: "İhaleyi Gör",
          ctaUrl: `${this.webUrl()}/company/ilan/${listingId}`,
        },
        { type: "bid_eliminated", id: bidId },
      );
    }
    return { ok: true };
  }

  /** İlan sahibi açık ilanı iptal eder (kazandırmadan kapatır). */
  async cancel(
    user: AuthenticatedCompanyUser,
    listingId: string,
    reason?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, status: true },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi iptal edebilir");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException("Sadece açık ilan iptal edilebilir");
    }
    await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id: listingId },
        data: { status: "CANCELLED", cancelReason: reason?.trim() || null },
      }),
      this.prisma.listingBid.updateMany({
        where: { listingId, status: "SUBMITTED" },
        data: { status: "LOST" },
      }),
    ]);
    return { ok: true };
  }

  /** Sahip ihaleyi belirtilen kapanışından önce erken kapatır (OPEN → CLOSED). */
  async closeBiddingEarly(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.ownerOpenListing(user, listingId);
    await this.prisma.listing.update({
      where: { id: listing.id },
      data: { status: "CLOSED", closesAt: new Date() },
    });
    void this.notifyListingClosed(listing.id);
    return { ok: true, status: "CLOSED" };
  }

  /** Sahip kapanış zamanını değiştirir (ileri/geri). OPEN ilanlarda. */
  async changeClosingTime(
    user: AuthenticatedCompanyUser,
    listingId: string,
    closesAt: string,
  ) {
    const listing = await this.ownerOpenListing(user, listingId);
    const date = new Date(closesAt);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Geçersiz tarih");
    }
    await this.prisma.listing.update({
      where: { id: listing.id },
      data: { closesAt: date },
    });
    return { ok: true };
  }

  /** Sahip şirket-içi notları günceller. */
  async updateInternalNotes(
    user: AuthenticatedCompanyUser,
    listingId: string,
    notes: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    await this.prisma.listing.update({
      where: { id: listing.id },
      data: { internalNotes: notes.trim() || null },
    });
    return { ok: true };
  }

  /** Sahip ihaleyi kazanan olmadan kapatır (CLOSED_NO_AWARD). */
  async closeNoAward(
    user: AuthenticatedCompanyUser,
    listingId: string,
    reason?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, status: true },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    if (listing.status !== "OPEN" && listing.status !== "CLOSED") {
      throw new BadRequestException("Bu ilan kapatılamaz");
    }
    await this.prisma.$transaction([
      this.prisma.listing.update({
        where: { id: listing.id },
        data: { status: "CLOSED_NO_AWARD", cancelReason: reason?.trim() || null },
      }),
      this.prisma.listingBid.updateMany({
        where: { listingId, status: "SUBMITTED" },
        data: { status: "LOST" },
      }),
    ]);
    return { ok: true };
  }

  private async ownerOpenListing(
    user: AuthenticatedCompanyUser,
    listingId: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, status: true },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException("Sadece açık ilanda yapılabilir");
    }
    return listing;
  }

  /** Teklif veren kendi teklifini geri çeker. */
  async withdrawBid(user: AuthenticatedCompanyUser, listingId: string) {
    const bid = await this.prisma.listingBid.findUnique({
      where: {
        listingId_bidderCompanyId: {
          listingId,
          bidderCompanyId: user.companyId,
        },
      },
      select: { id: true, status: true },
    });
    if (!bid || bid.status !== "SUBMITTED") {
      throw new BadRequestException("Geri çekilebilir teklif yok");
    }
    await this.prisma.listingBid.update({
      where: { id: bid.id },
      data: { status: "WITHDRAWN" },
    });
    return { ok: true };
  }

  private async nextOrderNumber(): Promise<string> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT nextval('order_number_seq') AS n
    `;
    return `ROT-ORD-${String(rows[0].n).padStart(6, "0")}`;
  }

  /** N sıra numarasını tek sorguda al (kalem-bazlı kazandırmada seri sorgu yerine). */
  private async nextOrderNumbers(count: number): Promise<string[]> {
    if (count <= 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT nextval('order_number_seq') AS n
      FROM generate_series(1, ${count})
    `;
    return rows.map((r) => `ROT-ORD-${String(r.n).padStart(6, "0")}`);
  }

  private detail(
    l: {
      id: string;
      number: string | null;
      type: ListingType;
      isInternational: boolean;
      targetCountries: string[];
      format: ListingFormat | null;
      minPrice: { toString(): string } | null;
      buyNowPrice: { toString(): string } | null;
      visibility: ListingVisibility;
      title: string;
      description: string | null;
      status: string;
      closesAt: Date | null;
      cancelReason: string | null;
      createdAt: Date;
      company: { name: string };
      categoryIds: string[];
      keywords: string[];
      terms: string | null;
      requireAllItems: boolean;
      requireBidDocument: boolean;
      primaryCurrency: Currency;
      allowedCurrencies: Currency[];
      // Wizard zenginleştirme
      bidsOpenAt: Date | null;
      isSealedBid: boolean;
      isLogistics: boolean;
      logistics: unknown;
      deliveryTerm: string | null;
      paymentTerm: string;
      paymentDays: number | null;
      paymentTiming: string;
      bidVisibility: string;
      priceDecrementType: string | null;
      priceDecrementValue: { toString(): string } | null;
      priceDecrementBasis: string | null;
      decimalPlaces: number;
      sendClosingReminder: boolean;
      reminderMinutesBefore: number | null;
      autoExtendOnLateBid: boolean;
      autoExtendThresholdMin: number | null;
      autoExtendByMinutes: number | null;
    },
    masked: boolean,
  ) {
    return {
      id: l.id,
      number: l.number,
      type: l.type,
      isInternational: l.isInternational,
      targetCountries: l.targetCountries,
      format: l.format,
      minPrice: l.minPrice?.toString() ?? null,
      buyNowPrice: l.buyNowPrice?.toString() ?? null,
      visibility: l.visibility,
      title: l.title,
      description: masked ? null : l.description,
      status: l.status,
      closesAt: l.closesAt,
      cancelReason: l.cancelReason,
      createdAt: l.createdAt,
      owner: masked ? null : { name: l.company.name },
      categoryIds: l.categoryIds,
      keywords: l.keywords,
      terms: masked ? null : l.terms,
      requireAllItems: l.requireAllItems,
      requireBidDocument: l.requireBidDocument,
      primaryCurrency: l.primaryCurrency,
      allowedCurrencies: l.allowedCurrencies,
      // Wizard zenginleştirme (Genel Bilgi sekmesi)
      bidsOpenAt: l.bidsOpenAt,
      isSealedBid: l.isSealedBid,
      isLogistics: l.isLogistics,
      logistics: masked ? null : (l.logistics ?? null),
      deliveryTerm: l.deliveryTerm,
      paymentTerm: l.paymentTerm,
      paymentDays: l.paymentDays,
      paymentTiming: l.paymentTiming,
      bidVisibility: l.bidVisibility,
      priceDecrementType: l.priceDecrementType,
      priceDecrementValue: l.priceDecrementValue?.toString() ?? null,
      priceDecrementBasis: l.priceDecrementBasis,
      decimalPlaces: l.decimalPlaces,
      sendClosingReminder: l.sendClosingReminder,
      reminderMinutesBefore: l.reminderMinutesBefore,
      autoExtendOnLateBid: l.autoExtendOnLateBid,
      autoExtendThresholdMin: l.autoExtendThresholdMin,
      autoExtendByMinutes: l.autoExtendByMinutes,
    };
  }

  /**
   * Aktif bağlantılı firma id'leri (her iki yön).
   * PREMIUM-origin bağlantı yalnızca İKİ taraf da PAKET iken sayılır
   * (premium bitince pasif). INVITE/ADMIN her zaman geçerli.
   */
  /**
   * Ülke kapsamı uygunluğu (getOne ile aynı kural — tek kaynak). Uluslararası
   * ilan: farklı ülke + (hedef ülkeler boş ya da izleyeni içeriyor). Yurtiçi
   * ilan: aynı ülke. Sahip her zaman uygun (çağıran ayrıca kontrol eder).
   */
  private isCountryEligible(
    viewerCountry: string,
    ownerCountry: string,
    isInternational: boolean,
    targetCountries: string[],
  ): boolean {
    return isInternational
      ? viewerCountry !== ownerCountry &&
          (targetCountries.length === 0 ||
            targetCountries.includes(viewerCountry))
      : viewerCountry === ownerCountry;
  }

  private async connectedCompanyIds(companyId: string): Promise<string[]> {
    const rows = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { inviterCompanyId: companyId },
          { inviteeCompanyId: companyId },
        ],
      },
      select: {
        inviterCompanyId: true,
        inviteeCompanyId: true,
        origin: true,
        inviter: { select: { tier: true } },
      },
    });
    return rows
      .filter(
        // PREMIUM bağlantı, onu kuran (daima PAKET olan) davet eden taraf PAKET
        // kaldığı sürece geçerli. Tedarikçi STANDARD olabilir.
        (r) => r.origin !== "PREMIUM" || r.inviter.tier === "PAKET",
      )
      .map((r) =>
        r.inviterCompanyId === companyId
          ? r.inviteeCompanyId
          : r.inviterCompanyId,
      );
  }

  private serialize(l: {
    id: string;
    number: string | null;
    type: ListingType;
    isInternational: boolean;
    format: ListingFormat | null;
    minPrice: { toString(): string } | null;
    buyNowPrice: { toString(): string } | null;
    visibility: ListingVisibility;
    title: string;
    description: string | null;
    status: string;
    closesAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: l.id,
      number: l.number,
      type: l.type,
      isInternational: l.isInternational,
      format: l.format,
      minPrice: l.minPrice?.toString() ?? null,
      buyNowPrice: l.buyNowPrice?.toString() ?? null,
      visibility: l.visibility,
      title: l.title,
      description: l.description,
      status: l.status,
      closesAt: l.closesAt,
      createdAt: l.createdAt,
    };
  }
}
