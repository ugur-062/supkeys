import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  CompanyRole,
  ListingPriceScope,
  ListingType,
  Prisma,
  type Currency,
  type ListingBidStatus,
  type ListingBidVisibility,
  type ListingDecrementBasis,
  type ListingDecrementType,
  type ListingDeliveryTerm,
  type ListingFormat,
  type ListingPaymentTerm,
  type ListingPaymentTiming,
  type ListingQuestionAnswerType,
  type ListingVisibility,
} from "@rothern/db";
import { OnEvent } from "@nestjs/event-emitter";
import {
  isValidCountryCode,
  normalizeShortCode,
  validateShortCode,
} from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CompanyApprovalsService } from "../../company-approvals/company-approvals.service";
import { CompanyBlocksService } from "../../company-blocks/company-blocks.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { ConfigService } from "@nestjs/config";
import { ExchangeRateService } from "../../currency/services/exchange-rate.service";
import { EmailService } from "../../email/email.service";
import {
  NotificationService,
  rolesForPortal,
  type NotificationPortal,
} from "../../notifications/notification.service";
import { RealtimeService } from "../../realtime/realtime.service";
import { deriveCategoryMatchCandidates } from "../../../common/helpers/tender-category-match.helper";
import { isNotificationEnabled } from "../../../common/notifications/notification-prefs";
import { CreateListingDto } from "../dto/create-listing.dto";
import { NextRoundDto } from "../dto/next-round.dto";
import { BuyNowDto, PlaceBidDto } from "../dto/place-bid.dto";

/** Bildirim alıcısı — e-posta/isim + (varsa) kullanıcı bildirim tercihleri. */
type Recipient = {
  email: string;
  name: string;
  prefs?: Record<string, boolean> | null;
};

/**
 * Kapanış hatırlatması artık her ilanda otomatik — kullanıcıya sorulmaz.
 * Kapanışa bu kadar dk kala, teklif vermemiş davetlilere e-posta gider.
 */
const CLOSING_REMINDER_MINUTES = 60;

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
    private readonly notifications: NotificationService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  private webUrl(): string {
    return this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
  }

  /**
   * Firmanın bildirim alıcısı — fatura e-postası veya PORTALA ERİŞİMLİ ilk aktif
   * kullanıcı. `portal` verilirse (satis/satinalma) kullanıcı fallback'i o
   * portalın rolüne göre süzülür: satış maili saf satın almacıya düşmez.
   */
  private async companyRecipient(
    companyId: string,
    portal?: NotificationPortal,
  ): Promise<Recipient | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, billingEmail: true },
    });
    if (!company) return null;
    if (company.billingEmail) {
      // Firma-seviyesi fatura adresi → kullanıcı tercihi yok (tümü gider).
      return { email: company.billingEmail, name: company.name, prefs: null };
    }
    const user = await this.prisma.companyUser.findFirst({
      where: {
        companyId,
        isActive: true,
        deletedAt: null,
        ...(portal ? { roles: { hasSome: rolesForPortal(portal) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        notificationPrefs: true,
      },
    });
    if (!user) return null;
    return {
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      prefs: user.notificationPrefs as Record<string, boolean> | null,
    };
  }

  /**
   * Çok sayıda firmanın bildirim alıcısını TEK seferde çözer (N+1 yerine 2 sorgu):
   * billingEmail olanlar doğrudan; olmayanlar için tek toplu kullanıcı sorgusu.
   * `portal` verilirse kullanıcı fallback'i o portala erişimli rollerle süzülür.
   */
  private async companyRecipients(
    companyIds: string[],
    portal?: NotificationPortal,
  ): Promise<Map<string, Recipient>> {
    const ids = [...new Set(companyIds)];
    const out = new Map<string, Recipient>();
    if (ids.length === 0) return out;
    const companies = await this.prisma.company.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, billingEmail: true },
    });
    const needUser: string[] = [];
    for (const c of companies) {
      if (c.billingEmail)
        out.set(c.id, { email: c.billingEmail, name: c.name, prefs: null });
      else needUser.push(c.id);
    }
    if (needUser.length > 0) {
      const users = await this.prisma.companyUser.findMany({
        where: {
          companyId: { in: needUser },
          isActive: true,
          deletedAt: null,
          ...(portal ? { roles: { hasSome: rolesForPortal(portal) } } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: {
          companyId: true,
          email: true,
          firstName: true,
          lastName: true,
          notificationPrefs: true,
        },
      });
      for (const u of users) {
        if (out.has(u.companyId)) continue; // ilk aktif (portala erişimli) kullanıcı
        out.set(u.companyId, {
          email: u.email,
          prefs: u.notificationPrefs as Record<string, boolean> | null,
          name: `${u.firstName} ${u.lastName}`,
        });
      }
    }
    return out;
  }

  /**
   * İlan tipine göre portal eşlemesi:
   *  - SAHİP tarafı: ALIM ilanı → satınalma, SATIS ilanı → satış
   *  - TEKLİFÇİ tarafı: TERS (ALIM'a satıcılar teklif verir → satış, vb.)
   */
  private ownerPortal(type: ListingType): NotificationPortal {
    return type === "ALIM" ? "satinalma" : "satis";
  }
  private bidderPortal(type: ListingType): NotificationPortal {
    return type === "ALIM" ? "satis" : "satinalma";
  }

  /** Bildirim e-postası gönder (fire-and-forget). */
  private notify(
    to: Recipient,
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
    // Alıcının bildirim tercihi bu tipi kapatmışsa gönderme (transactional
    // tipler her zaman gider). billingEmail alıcılarında tercih yok → gider.
    if (context && !isNotificationEnabled(to.prefs, context.type)) return;
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
      select: {
        id: true,
        title: true,
        number: true,
        companyId: true,
        type: true,
      },
    });
    if (!listing) return;
    const label = `"${listing.title}" (${listing.number ?? "—"})`;
    const ownerPortal = this.ownerPortal(listing.type);
    const bidderPortal = this.bidderPortal(listing.type);

    // Davetlilere kapanış bildirimi (teklifçi tarafı).
    const invs = await this.prisma.listingInvitation.findMany({
      where: { listingId },
      select: { invitedCompanyId: true },
    });
    const bidUrl = `${this.webUrl()}/company/ilan/${listingId}`;
    const closeRecipients = await this.companyRecipients(
      invs.map((iv) => iv.invitedCompanyId),
      bidderPortal,
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
    // In-app: davetlilere kapanış.
    await this.notifications.pushToCompanies(
      invs.map((iv) => iv.invitedCompanyId),
      {
        type: "listing_closed",
        portal: bidderPortal,
        title: "İhale kapandı",
        body: `${label} ihalesi teklife kapandı. Sonuç açıklandığında bilgilendirileceksiniz.`,
        ctaLabel: "İhaleyi Gör",
        ctaUrl: bidUrl,
        listingId,
      },
    );

    // Sahibe "karar zamanı" bildirimi.
    const owner = await this.companyRecipient(listing.companyId, ownerPortal);
    // Sahip detay sayfası: kanonik /company/ilan/[id] (owner branch teklifleri +
    // kazandırmayı gösterir). ihalelerim/[id] · ilanlarim/[id] detay page.tsx'i
    // YOK (yalnız .../duzenle var) — oraya yönlendirmek 404 veriyordu.
    const ownerUrl = `${this.webUrl()}/company/ilan/${listingId}`;
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
          ctaUrl: ownerUrl,
        },
        { type: "listing_closed_owner", id: listingId },
      );
    }
    // In-app: sahibe karar zamanı.
    await this.notifications.pushToCompany(listing.companyId, {
      type: "listing_closed_owner",
      portal: ownerPortal,
      title: "Kazandırma kararı zamanı",
      body: `${label} ihaleniz teklife kapandı. Teklifleri inceleyip kazandırma kararınızı verebilirsiniz.`,
      ctaLabel: "Teklifleri İncele",
      ctaUrl: ownerUrl,
      listingId,
    });
  }

  /**
   * PUBLIC ilan yayına çıkınca kategori eşleşen firmalara bildirim + e-posta
   * gönderir. İKİ YÖN:
   *  - ALIM ilanı → SATICI'ları uyarır (sellerCategoryIds/sellerSubCategoryIds,
   *    PAKET + aktif SATISCI). CTA: Satış portalı açık ihaleler.
   *  - SATIS ilanı → ALICI'ları uyarır (buyerCategoryIds/buyerSubCategoryIds,
   *    PAKET + aktif SATIN_ALMACI). CTA: Satınalma portalı satış ilanları.
   * Alıcılar `companyRecipients` ile çözülür → billingEmail yoksa firmanın ilk
   * aktif kullanıcısına düşer (hiçbir eşleşen firma sessizce atlanmaz).
   */
  async notifyCategoryMatchedCompanies(listingId: string) {
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
      },
    });
    if (
      !listing ||
      listing.visibility !== "PUBLIC" ||
      listing.categoryIds.length === 0
    ) {
      return [];
    }
    // Sahip firmanın ülkesi — AYRI, korumalı sorgu. Zorunlu nested `company`
    // include'u, firma satırı kaybolmuşsa (teardown/cascade yarışı) Prisma'da
    // "required relation returned null" fırlatıyordu; ayrı findUnique null'ı
    // düzgünce döner ve en-iyi-çaba akışını sessizce sonlandırır.
    const owner = await this.prisma.company.findUnique({
      where: { id: listing.companyId },
      select: { country: true },
    });
    if (!owner) return [];
    // Ülke kapsamı: yurtiçi ilan → yalnızca sahip ülkesi; uluslararası →
    // YALNIZCA yabancı hedef ülkeler (sahip ülkesi HARİÇ — yurtiçi görmez).
    const ownerCountry = owner.country;
    const countryWhere = !listing.isInternational
      ? { country: ownerCountry }
      : listing.targetCountries.length === 0
        ? { country: { not: ownerCountry } }
        : { country: { in: listing.targetCountries } };
    const { segmentIds, subCandidates } = deriveCategoryMatchCandidates(
      listing.categoryIds,
    );
    if (segmentIds.length === 0 && subCandidates.length === 0) return [];

    // Yön'e göre eşleşme alanları + hedef rol + kullanıcı-yüzü metin/CTA.
    const isBuyDemand = listing.type === "ALIM";
    const matchRole = isBuyDemand ? "SATISCI" : "SATIN_ALMACI";
    const catOr = isBuyDemand
      ? [
          { sellerCategoryIds: { hasSome: segmentIds } },
          { sellerSubCategoryIds: { hasSome: subCandidates } },
        ]
      : [
          { buyerCategoryIds: { hasSome: segmentIds } },
          { buyerSubCategoryIds: { hasSome: subCandidates } },
        ];

    const blocked = await this.blocks.blockedCompanyIds(listing.companyId);
    const candidates = await this.prisma.company.findMany({
      where: {
        id: { notIn: [listing.companyId, ...blocked] },
        tier: "PAKET",
        isActive: true,
        ...countryWhere,
        users: {
          // Kurucu (SAHIP) tam yetkilidir → op-rol taşımasa da eşleşen ilandan
          // haberdar edilir.
          some: {
            roles: { hasSome: [matchRole, CompanyRole.SAHIP] },
            deletedAt: null,
            isActive: true,
          },
        },
        OR: catOr,
      },
      select: { id: true },
      take: 300, // flood-guard
    });
    if (candidates.length === 0) return [];

    // Teklifçi portalı (ALIM→satış, SATIS→satınalma) — e-posta fallback'i de
    // bu portalın rolüne göre süzülür.
    const matchPortal = this.bidderPortal(listing.type);
    const recipients = await this.companyRecipients(
      candidates.map((c) => c.id),
      matchPortal,
    );
    const url = `${this.webUrl()}${
      isBuyDemand ? "/company/satis/acik-ihaleler" : "/company/satinalma/satin-al"
    }`;
    const label = isBuyDemand ? "ihale" : "satış ilanı";
    const verb = isBuyDemand ? "Sattığınız" : "Aldığınız";
    const action = isBuyDemand ? "teklif vermek" : "satın almak";
    let sent = 0;
    for (const c of candidates) {
      const to = recipients.get(c.id);
      if (!to) continue;
      this.notify(
        to,
        {
          subject: `Size uygun yeni bir ${label} yayınlandı`,
          heading: `Kategorinize uygun yeni ${label}`,
          paragraphs: [
            "Merhaba,",
            `${verb} kategorilerle eşleşen yeni bir ${label} yayınlandı: "${listing.title ?? "İlan"}" (${listing.number ?? "—"}). İncelemek ve ${action} için Rothern'e giriş yapın.`,
          ],
          ctaLabel: isBuyDemand ? "Açık İhaleleri Gör" : "Satış İlanlarını Gör",
          ctaUrl: url,
          footerNote: "Bu bildirimi kategori tercihlerinize göre alıyorsunuz.",
        },
        { type: "listing_category_match", id: listingId },
      );
      sent++;
    }
    // In-app kanal (e-postaya paralel) — eşleşen firmaların YALNIZCA teklifçi
    // portalındaki (ALIM→satış, SATIS→satınalma) aktif kullanıcılarına. Portal
    // verilmezse bildirim iki panelde de görünürdü (ör. satın almacıya "sattığınız
    // kategoriye uygun ihale" düşerdi) — matchPortal ile doğru panele sınırlanır.
    await this.notifications.pushToCompanies(
      candidates.map((c) => c.id),
      {
        type: "listing_category_match",
        title: `Kategorinize uygun yeni ${label}`,
        body: `${verb} kategorilerle eşleşen yeni bir ${label}: "${listing.title ?? "İlan"}" (${listing.number ?? "—"}).`,
        ctaUrl: url,
        ctaLabel: isBuyDemand ? "Açık İhaleleri Gör" : "Satış İlanlarını Gör",
        listingId: listing.id,
        portal: matchPortal,
      },
    );
    this.logger.log(
      `Kategori eşleşmesi (${listing.number}): ${sent} firmaya bildirim (${
        isBuyDemand ? "satıcı" : "alıcı"
      })`,
    );
    return candidates;
  }

  /** Davetli firmalara ihale daveti / kapanış hatırlatması e-postası. */
  async notifyListingInvitees(
    listingId: string,
    mode: "invitation" | "reminder" | "newRound",
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, number: true, type: true },
    });
    if (!listing) return;
    // Davetliler teklifçidir → teklifçi portalı (ALIM→satış, SATIS→satınalma).
    const invitePortal = this.bidderPortal(listing.type);
    const invs = await this.prisma.listingInvitation.findMany({
      where: { listingId },
      select: { invitedCompanyId: true },
    });
    // Hatırlatma yalnızca HENÜZ TEKLİF VERMEMİŞ davetlilere gider (davet ise
    // herkese). Teklif vermiş firmaları çıkar.
    let targets = invs.map((iv) => iv.invitedCompanyId);
    if (mode === "reminder" || mode === "newRound") {
      const bidders = await this.prisma.listingBid.findMany({
        where: { listingId, status: "SUBMITTED" },
        select: { bidderCompanyId: true },
      });
      const bidderSet = new Set(bidders.map((b) => b.bidderCompanyId));
      targets = targets.filter((id) => !bidderSet.has(id));
    }
    const url = `${this.webUrl()}/company/ilan/${listingId}`;
    const t = listing.title;
    const no = listing.number ?? "—";
    // Mod'a göre metin + tip. Yeni tur (`listing_new_round`) tercihte
    // listelenmez → transactional (kapatılamaz): açılan yeni tur mutlaka duyulmalı.
    const content = {
      invitation: {
        type: "listing_invitation" as const,
        subject: "Bir ihaleye davet edildiniz",
        heading: "İhale daveti",
        paragraph: `"${t}" (${no}) ihalesine davet edildiniz. Detayları görmek ve teklif vermek için giriş yapın.`,
        inAppTitle: "İhale daveti",
        inAppBody: `"${t}" (${no}) ihalesine davet edildiniz.`,
        ctaLabel: "İhaleyi Gör",
      },
      reminder: {
        type: "listing_reminder" as const,
        subject: "İhale kapanışı yaklaşıyor",
        heading: "Kapanış hatırlatması",
        paragraph: `"${t}" (${no}) ihalesinin kapanışı yaklaşıyor. Teklif vermek için son şansınız.`,
        inAppTitle: "Kapanış hatırlatması",
        inAppBody: `"${t}" (${no}) ihalesinin kapanışı yaklaşıyor. Teklif vermek için son şansınız.`,
        ctaLabel: "Teklif Ver",
      },
      newRound: {
        type: "listing_new_round" as const,
        subject: "İhalede yeni tur başladı",
        heading: "Yeni tur açıldı",
        paragraph: `"${t}" (${no}) ihalesinde yeni bir tur açıldı. Güncel teklifinizi vermek için giriş yapın.`,
        inAppTitle: "Yeni tur açıldı",
        inAppBody: `"${t}" (${no}) ihalesinde yeni tur açıldı — güncel teklifinizi verin.`,
        ctaLabel: "Teklif Ver",
      },
    }[mode];

    const recipients = await this.companyRecipients(targets, invitePortal);
    for (const invitedCompanyId of targets) {
      const r = recipients.get(invitedCompanyId);
      if (!r) continue;
      this.notify(
        r,
        {
          subject: content.subject,
          heading: content.heading,
          paragraphs: ["Merhaba,", content.paragraph],
          ctaLabel: content.ctaLabel,
          ctaUrl: url,
        },
        { type: content.type, id: listingId },
      );
    }
    // In-app kanal — davet/hatırlatma/yeni-tur hedeflerine (teklifçi portalı).
    await this.notifications.pushToCompanies(targets, {
      type: content.type,
      portal: invitePortal,
      title: content.inAppTitle,
      body: content.inAppBody,
      ctaLabel: content.ctaLabel,
      ctaUrl: url,
      listingId,
    });
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

  /**
   * SATIS fiyatlandırma doğrulaması (create + update ortak).
   * TOPLU: ilan geneli taban zorunlu, hemen-al ≥ taban.
   * KALEM: her kalemin taban BİRİM fiyatı zorunlu; kalem hemen-al ≥ kalem taban;
   *        ilan geneli minPrice/buyNowPrice KULLANILMAZ (null yazılır).
   */
  private validateSatisPricing(dto: CreateListingDto): {
    priceScope: ListingPriceScope;
    minPrice: number | null;
    buyNowPrice: number | null;
  } {
    const priceScope = (dto.priceScope ?? "TOPLU") as ListingPriceScope;
    if (priceScope === "KALEM") {
      if (!dto.items?.length) {
        throw new BadRequestException(
          "Kalem bazlı fiyatlandırma için en az bir kalem girin",
        );
      }
      for (const it of dto.items) {
        if (!it.minUnitPrice || it.minUnitPrice <= 0) {
          throw new BadRequestException(
            `"${it.name}" kalemi için taban birim fiyat girin`,
          );
        }
        // KESİN büyük: eşitlikte taban ≤ teklif < hemen-al aralığı boş kalır
        // ve hiçbir normal teklif verilemezdi (yalnız Hemen-Al mümkün olurdu).
        if (
          it.buyNowUnitPrice != null &&
          it.buyNowUnitPrice <= it.minUnitPrice
        ) {
          throw new BadRequestException(
            `"${it.name}" kaleminde hemen-al fiyatı taban fiyattan büyük olmalı`,
          );
        }
      }
      return { priceScope, minPrice: null, buyNowPrice: null };
    }
    // TOPLU
    if (!dto.minPrice || dto.minPrice <= 0) {
      throw new BadRequestException("Satış ilanı için taban fiyat girin");
    }
    // KESİN büyük — eşitlikte normal teklif aralığı boş kalır (yukarıdaki
    // kalem kuralıyla aynı gerekçe).
    if (dto.buyNowPrice != null && dto.buyNowPrice <= dto.minPrice) {
      throw new BadRequestException(
        "Hemen-al fiyatı taban fiyattan büyük olmalı",
      );
    }
    return {
      priceScope,
      minPrice: dto.minPrice,
      buyNowPrice: dto.buyNowPrice ?? null,
    };
  }

  /**
   * İş kuralı doğrulamaları (create + update ortak — createNextRound ile
   * tutarlı): açık eksiltme parametreleri, para birimi seti, hedef ülkeler,
   * kategori kodları, PRIVATE davet zorunluluğu.
   */
  private async validateListingBusinessRules(
    dto: CreateListingDto,
    opts: { format: ListingFormat | null; inviteCount: number },
  ) {
    const isAuction = opts.format === "ENGLISH_AUCTION";
    const isSatis = dto.type === "SATIS";
    if (isAuction) {
      if (!((dto.priceDecrementValue ?? 0) > 0)) {
        throw new BadRequestException(
          isSatis
            ? "Açık artırma için fiyat artış adımı zorunlu"
            : "Açık eksiltme için fiyat azaltma değeri zorunlu",
        );
      }
      if (
        dto.priceDecrementType === "PERCENT" &&
        (dto.priceDecrementValue ?? 0) >= 100
      ) {
        throw new BadRequestException(
          isSatis
            ? "Yüzde artış 100'den küçük olmalı"
            : "Yüzde azaltma 100'den küçük olmalı",
        );
      }
      // Çoklu para birimi adım kıyasını bozar (100 USD vs 200 TRY) —
      // açık artırma/eksiltme tek birimle yürür.
      if ((dto.allowedCurrencies?.length ?? 0) > 1) {
        throw new BadRequestException(
          isSatis
            ? "Açık artırmada tek para birimi kullanılabilir"
            : "Açık eksiltmede tek para birimi kullanılabilir",
        );
      }
    }
    // İzinli birim seti ilanın ana birimini içermeli (teklif formu fallback'i).
    const primary = (dto.primaryCurrency ?? "TRY") as string;
    if (
      (dto.allowedCurrencies?.length ?? 0) > 0 &&
      !(dto.allowedCurrencies as string[]).includes(primary)
    ) {
      throw new BadRequestException(
        "İzin verilen para birimleri ilanın ana birimini içermeli",
      );
    }
    // Teslim şekli kapsamla uyumlu olmalı (yurtiçi ↔ DOMESTIC_*, uluslararası
    // ↔ Incoterms) — frontend filtreliyor ama backend otorite; kapsam
    // değişen update'te bayat terim de burada yakalanır.
    if (dto.deliveryTerm) {
      const isDomesticTerm = String(dto.deliveryTerm).startsWith("DOMESTIC_");
      if ((dto.isInternational ?? false) && isDomesticTerm) {
        throw new BadRequestException(
          "Uluslararası ilanda yurtiçi teslim şekli seçilemez — Incoterm seçin",
        );
      }
      if (!(dto.isInternational ?? false) && !isDomesticTerm) {
        throw new BadRequestException(
          "Yurtiçi ilanda Incoterm seçilemez — yurtiçi teslim şekli seçin",
        );
      }
    }
    // Hedef ülkeler gerçek ülke kodu olmalı ("XX" değil).
    for (const c of dto.targetCountries ?? []) {
      if (!isValidCountryCode(c)) {
        throw new BadRequestException(`Geçersiz hedef ülke kodu: ${c}`);
      }
    }
    // Kategori kodları taksonomide var olmalı (ihale için level ≥ 3).
    if (dto.categoryIds?.length) {
      const found = await this.prisma.category.count({
        where: {
          code: { in: dto.categoryIds },
          level: { gte: 3 },
          isActive: true,
        },
      });
      if (found !== new Set(dto.categoryIds).size) {
        throw new BadRequestException("Geçersiz kategori seçimi");
      }
    }
    // Kimsenin göremeyeceği ilan: PRIVATE + davetsiz yayına çıkamaz.
    if (
      dto.visibility === "PRIVATE" &&
      dto.asDraft !== true &&
      opts.inviteCount === 0
    ) {
      throw new BadRequestException(
        "Özel (davetli) ilan en az bir davetli firma ile yayınlanabilir",
      );
    }
  }

  /**
   * YENİ premium ilan işi başlatma (yayınla / yeni tur / yeni tedarikçi daveti)
   * PAKET ister. Askıdaki ihaleyi settle etmek (kazandır/eleme/kapat) STANDARD'a
   * SERBESTTİR — downgrade olmuş firma başlattığı ihaleyi bitirebilsin, teklif
   * vermiş tedarikçiler mağdur olmasın.
   */
  private assertPaidForNewListingWork(
    user: AuthenticatedCompanyUser,
    action: string,
  ) {
    if (user.tier !== "PAKET") {
      throw new ForbiddenException(
        `${action} için premium (PAKET) üyelik gerekir. Standart üyeler mevcut ihalelerini tamamlayabilir ancak yeni ilan işi başlatamaz.`,
      );
    }
  }

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

    // Kurucu (SAHIP) tam yetkilidir — her rolü kapsar.
    if (
      !user.roles.includes(CompanyRole.SAHIP) &&
      !user.roles.includes(neededRole)
    ) {
      throw new ForbiddenException(
        type === "ALIM"
          ? "Alım ilanı açmak için Satın Almacı rolü gerekir"
          : "Satış ilanı açmak için Satışçı rolü gerekir",
      );
    }

    // Tipe göre format / fiyat doğrulama. Format her iki yönde de zorunlu:
    // ALIM'da İngiliz usulü DÜŞEN eksiltme, SATIS'ta YÜKSELEN artırma.
    let format: ListingFormat | null = null;
    let minPrice: number | null = null;
    let buyNowPrice: number | null = null;
    let priceScope: ListingPriceScope | null = null;

    if (!dto.format) {
      throw new BadRequestException(
        type === "ALIM"
          ? "Alım ilanı için format seçin (RFQ / İngiliz Usulü)"
          : "Satış ilanı için format seçin (Teklif Toplama / Açık Artırma)",
      );
    }
    format = dto.format as ListingFormat;
    if (type === "SATIS") {
      const pricing = this.validateSatisPricing(dto);
      priceScope = pricing.priceScope;
      minPrice = pricing.minPrice;
      buyNowPrice = pricing.buyNowPrice;
    }

    const number = await this.nextListingNumber();

    // Davet edilecek firmaları çöz: rothernId → companyId, bağlı olmalı.
    let inviteCompanyIds: string[] = [];
    if (dto.invitations?.length) {
      const connectedIds = await this.connectedCompanyIds(user.companyId);
      const codes = dto.invitations
        .map((c) => normalizeShortCode(c))
        .filter((c) => validateShortCode(c));
      const targets = await this.prisma.company.findMany({
        where: { rothernId: { in: codes } },
        select: { id: true },
      });
      inviteCompanyIds = targets
        .map((t) => t.id)
        .filter((id) => id !== user.companyId && connectedIds.includes(id));
    }

    await this.validateListingBusinessRules(dto, {
      format,
      inviteCount: inviteCompanyIds.length,
    });
    await this.assertListingAddressesOwned(
      user.companyId,
      dto.deliveryAddressId,
      dto.billingAddressId,
    );

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
          priceScope,
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
          // Auction'da best/adım/monotonluk kıyasları ham tutarla yapılır —
          // tek para birimi ZORUNLU; boş dizi "her birim serbest" açığıydı.
          allowedCurrencies:
            format === "ENGLISH_AUCTION"
              ? [(dto.primaryCurrency as Currency) ?? "TRY"]
              : ((dto.allowedCurrencies as Currency[]) ?? []),
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
          sendClosingReminder: true,
          reminderMinutesBefore: CLOSING_REMINDER_MINUTES,
          autoExtendOnLateBid: dto.autoExtendOnLateBid ?? false,
          // Bayrak açıkken eşik/dakika boşsa sessizce devre dışı kalıyordu —
          // yeni-tur (createNextRound) ile aynı 2dk/2dk default uygulanır.
          autoExtendThresholdMin: dto.autoExtendOnLateBid
            ? (dto.autoExtendThresholdMin ?? 2)
            : (dto.autoExtendThresholdMin ?? null),
          autoExtendByMinutes: dto.autoExtendOnLateBid
            ? (dto.autoExtendByMinutes ?? 2)
            : (dto.autoExtendByMinutes ?? null),
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
              minUnitPrice:
                priceScope === "KALEM" ? (it.minUnitPrice ?? null) : null,
              buyNowUnitPrice:
                priceScope === "KALEM" ? (it.buyNowUnitPrice ?? null) : null,
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
      void this.notifyCategoryMatchedCompanies(listing.id).catch((err) =>
        this.logger.warn(
          `Kategori eşleşme bildirimi başarısız (${listing.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
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
      // HERHANGİ bir teklif kaydı (elenen/geri çekilen/taslak dahil) düzenlemeyi
      // kilitler: kalemler sil-ve-yeniden-yaz olduğundan cascade, mevcut teklif
      // kalemlerini siler — "tümünü ele → yeniden yaz" ile katılım almış ihale
      // sessizce değiştirilemesin.
      const bidCount = await this.prisma.listingBid.count({
        where: { listingId },
      });
      if (bidCount > 0) {
        throw new BadRequestException(
          "Bu ihaleye teklif verilmiş; düzenleme yapılamaz",
        );
      }
    }
    // OPEN ilanda tarih doğrulaması asDraft bayrağıyla ATLANAMAZ (yayındaki
    // ilanın kapanışı geçmişe/boşa çekilemez).
    this.validateListingDates(
      existing.status === "OPEN" ? { ...dto, asDraft: false } : dto,
    );

    // Tür değişmez — mevcut türe göre format/fiyat doğrula (create ile aynı).
    const type = existing.type;
    let format: ListingFormat | null = null;
    let minPrice: number | null = null;
    let buyNowPrice: number | null = null;
    if (!dto.format) {
      throw new BadRequestException(
        type === "ALIM"
          ? "Alım ilanı için format seçin (RFQ / İngiliz Usulü)"
          : "Satış ilanı için format seçin (Teklif Toplama / Açık Artırma)",
      );
    }
    format = dto.format as ListingFormat;
    let priceScope: ListingPriceScope | null = null;
    if (type === "SATIS") {
      const pricing = this.validateSatisPricing(dto);
      priceScope = pricing.priceScope;
      minPrice = pricing.minPrice;
      buyNowPrice = pricing.buyNowPrice;
    }

    // Davet edilecek firmaları çöz (create ile aynı kural).
    let inviteCompanyIds: string[] = [];
    if (dto.invitations?.length) {
      const connectedIds = await this.connectedCompanyIds(user.companyId);
      const codes = dto.invitations
        .map((c) => normalizeShortCode(c))
        .filter((c) => validateShortCode(c));
      const targets = await this.prisma.company.findMany({
        where: { rothernId: { in: codes } },
        select: { id: true },
      });
      inviteCompanyIds = targets
        .map((t) => t.id)
        .filter((id) => id !== user.companyId && connectedIds.includes(id));
    }

    await this.validateListingBusinessRules(dto, {
      format,
      inviteCount: inviteCompanyIds.length,
    });
    await this.assertListingAddressesOwned(
      user.companyId,
      dto.deliveryAddressId,
      dto.billingAddressId,
    );

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
          priceScope,
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
          // Auction'da best/adım/monotonluk kıyasları ham tutarla yapılır —
          // tek para birimi ZORUNLU; boş dizi "her birim serbest" açığıydı.
          allowedCurrencies:
            format === "ENGLISH_AUCTION"
              ? [(dto.primaryCurrency as Currency) ?? "TRY"]
              : ((dto.allowedCurrencies as Currency[]) ?? []),
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
          sendClosingReminder: true,
          reminderMinutesBefore: CLOSING_REMINDER_MINUTES,
          autoExtendOnLateBid: dto.autoExtendOnLateBid ?? false,
          // Bayrak açıkken eşik/dakika boşsa sessizce devre dışı kalıyordu —
          // yeni-tur (createNextRound) ile aynı 2dk/2dk default uygulanır.
          autoExtendThresholdMin: dto.autoExtendOnLateBid
            ? (dto.autoExtendThresholdMin ?? 2)
            : (dto.autoExtendThresholdMin ?? null),
          autoExtendByMinutes: dto.autoExtendOnLateBid
            ? (dto.autoExtendByMinutes ?? 2)
            : (dto.autoExtendByMinutes ?? null),
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
              minUnitPrice:
                priceScope === "KALEM" ? (it.minUnitPrice ?? null) : null,
              buyNowUnitPrice:
                priceScope === "KALEM" ? (it.buyNowUnitPrice ?? null) : null,
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
   * Taslağı yayınla. Yalnızca SAHİP + DRAFT → doğrudan OPEN.
   * (Yayın onayı KALDIRILDI — onay akışı yalnız KAZANDIRMADA devreye girer.)
   */
  async publishListing(user: AuthenticatedCompanyUser, listingId: string) {
    this.assertPaidForNewListingWork(user, "İlan yayınlamak");
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        status: true,
        closesAt: true,
        visibility: true,
      },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    if (listing.status !== "DRAFT") {
      throw new BadRequestException("Yalnızca taslak ilan yayınlanabilir");
    }
    // Taslak, tarih/davet kontrolünü atlayarak kaydedilebildiğinden yayında
    // yeniden doğrula (create'in non-draft yoluyla aynı kurallar):
    // (a) kapanış tarihi zorunlu + gelecekte — yoksa cron kapatamaz / anında
    //     kapanır; (b) PRIVATE ilan en az 1 davetli olmadan yayınlanamaz
    //     (kimsenin göremeyeceği açık ilan olmasın).
    if (!listing.closesAt || listing.closesAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        "Yayın için geçerli bir kapanış tarihi (gelecekte) gerekli",
      );
    }
    if (listing.visibility === "PRIVATE") {
      const inviteCount = await this.prisma.listingInvitation.count({
        where: { listingId },
      });
      if (inviteCount === 0) {
        throw new BadRequestException(
          "Özel (davetli) ilan yayınlamak için en az bir firma davet edilmeli",
        );
      }
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: "OPEN", publishedAt: new Date() },
    });
    void this.notifyListingInvitees(listingId, "invitation");
    void this.notifyCategoryMatchedCompanies(listingId).catch((err) =>
      this.logger.warn(
        `Kategori eşleşme bildirimi başarısız (${listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    this.realtime?.pingListing(listingId);
    return this.serialize(updated);
  }

  /**
   * (Geriye uyum) Eski LISTING_PUBLISH onayı onaylanırsa ilanı OPEN yap —
   * artık yeni akış üretilmez ama bekleyen eski istekler tamamlanabilsin.
   */
  @OnEvent("listing.publish.approved")
  async onPublishApproved(payload: { listingId: string }) {
    await this.prisma.listing.update({
      where: { id: payload.listingId },
      data: { status: "OPEN", publishedAt: new Date() },
    });
    void this.notifyListingInvitees(payload.listingId, "invitation");
    void this.notifyCategoryMatchedCompanies(payload.listingId).catch((err) =>
      this.logger.warn(
        `Kategori eşleşme bildirimi başarısız (${payload.listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    this.realtime?.pingListing(payload.listingId);
  }

  /** (Geriye uyum) Eski yayın onayı reddedilirse ilan taslağa geri döner. */
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
            company: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Kazanan tekliflerin siparişleri — karttan "Siparişe Git" için.
    // ALIM'da satıcıyım, SATIS'ta alıcıyım; her iki rolü tek sorguda kapsar.
    const wonListingIds = bids
      .filter((b) => b.status === "WON" || b.status === "AWARDED_PARTIAL")
      .map((b) => b.listingId);
    const orders =
      wonListingIds.length > 0
        ? await this.prisma.companyOrder.findMany({
            where: {
              listingId: { in: wonListingIds },
              OR: [
                { sellerCompanyId: companyId },
                { buyerCompanyId: companyId },
              ],
            },
            select: { id: true, listingId: true },
          })
        : [];
    const orderByListing = new Map(orders.map((o) => [o.listingId, o.id]));

    return bids.map((b) => ({
      id: b.id,
      amount: b.amount.toString(),
      currency: b.currency,
      // TRY karşılığı — çoklu para biriminde adil sıralama/kıyas için
      // (sahip görünümündeki amountTry ile aynı hesap).
      amountTry: b.exchangeRateSnapshot
        ? new Prisma.Decimal(b.amount).mul(b.exchangeRateSnapshot).toFixed(2)
        : b.currency === "TRY"
          ? b.amount.toString()
          : null,
      status: b.status,
      round: b.round,
      version: b.version,
      isBuyNow: b.isBuyNow,
      createdAt: b.createdAt,
      // ALIM: taahhüt edilen teslim; SATIS: istenen teslim (yön etiketi UI'da).
      deliveryDate: b.deliveryDate ? b.deliveryDate.toISOString() : null,
      orderId: orderByListing.get(b.listingId) ?? null,
      listing: {
        id: b.listing.id,
        number: b.listing.number,
        title: b.listing.title,
        type: b.listing.type,
        status: b.listing.status,
        closesAt: b.listing.closesAt,
        ownerName: b.listing.company.name,
      },
    }));
  }

  /**
   * İhalelerim listesi (ALIM) — zengin: açan kişi + davetli/teklif sayısı +
   * kategoriler. Eski tenders-table'ın ihtiyaç duyduğu alanlar. Filtre/sıralama
   * frontend'de (client-side) yapılır.
   */
  async listTenders(companyId: string, type: ListingType = "ALIM") {
    const rows = await this.prisma.listing.findMany({
      where: { companyId, type },
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
        publishedAt: true,
        _count: {
          select: {
            invitations: true,
            // Taslak/geri-çekilmiş teklif sayılmaz (kapalı zarf: taslağın
            // varlığı bile ima edilmemeli).
            bids: {
              where: { status: { in: ["SUBMITTED", "WON", "AWARDED_PARTIAL", "LOST"] } },
            },
          },
        },
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
        publishedAt: r.publishedAt ?? r.createdAt,
        bidsCloseAt: r.closesAt,
        createdAt: r.createdAt,
      };
    });
  }

  // NOT: eski browse() endpoint'i kaldırıldı (2026-07-03) — frontend'de
  // tüketicisi yoktu ve kuralları sellerTenders'tan sapmıştı (STANDARD'a
  // PUBLIC maskeli önizleme + davetli PRIVATE göstermiyordu). Tek liste
  // kaynağı sellerTenders'tır.

  /**
   * Satıcı İhaleler listesi (eski tedarikçi paneli paritesi) — teklif
   * verilebilir AÇIK ALIM ilanları + geçmiş (davetli olduğum / teklif verdiğim
   * kapanmış) ilanlar, teklif durumu + davet + kategori eşleşmesiyle zengin.
   * ÖNEMLİ: davetli olunan ilan (PRIVATE dahil) görünürlük/ülke kapsamından
   * bağımsız listeye girer — browse()'daki "davetli PRIVATE görünmez" boşluğunu
   * kapatır.
   */
  async sellerTenders(user: AuthenticatedCompanyUser, type: ListingType = "ALIM") {
    const companyId = user.companyId;
    const [connectedIds, blockedIds, myCompany] = await Promise.all([
      this.connectedCompanyIds(companyId),
      this.blocks.blockedCompanyIds(companyId),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          sellerCategoryIds: true,
          sellerSubCategoryIds: true,
          buyerCategoryIds: true,
          buyerSubCategoryIds: true,
        },
      }),
    ]);
    const isPremium = user.tier === "PAKET";
    const myCountry = user.country;

    const baseWhere = {
      type,
      companyId: { notIn: [companyId, ...blockedIds] },
    };
    const invitedClause = {
      invitations: { some: { invitedCompanyId: companyId } },
    };
    // Ülke kapsamı (yurtiçi VEYA bana açık uluslararası) — davetliler hariç.
    const countryOr = [
      { isInternational: false, company: { country: myCountry } },
      {
        isInternational: true,
        company: { country: { not: myCountry } },
        AND: [
          {
            OR: [
              { targetCountries: { isEmpty: true } },
              { targetCountries: { has: myCountry } },
            ],
          },
        ],
      },
    ];
    // PUBLIC ilanlar STANDARD üyeye de listelenir (MASKELİ önizleme — premium
    // başvurusuna yönlendirme için); teklif/detay hakları masked/canBid ile
    // sınırlanır. CONNECTIONS yalnız bağlantılılara.
    const visibilityOr = [
      { visibility: "PUBLIC" as const },
      { visibility: "CONNECTIONS" as const, companyId: { in: connectedIds } },
    ];

    const select = {
      id: true,
      number: true,
      title: true,
      status: true,
      visibility: true,
      format: true,
      primaryCurrency: true,
      categoryIds: true,
      isInternational: true,
      closesAt: true,
      createdAt: true,
      companyId: true,
      priceScope: true,
      minPrice: true,
      buyNowPrice: true,
      company: { select: { name: true } },
      _count: { select: { items: true } },
    };

    const [openRows, pastRows] = await Promise.all([
      this.prisma.listing.findMany({
        where: {
          ...baseWhere,
          status: "OPEN",
          OR: [
            invitedClause,
            { AND: [{ OR: countryOr }, { OR: visibilityOr }] },
          ],
        },
        select,
        orderBy: { closesAt: "asc" },
        take: 300,
      }),
      // Geçmiş: yalnız KATILDIĞIM (davet/teklif) kapanmış ilanlar. Başkasının
      // kapanmış ilanı "açık ihaleler" listesinde görünmez (kullanıcı kararı):
      // katılmadığın bir ilan kapandıysa listeden düşer; onu ancak teklif
      // verdiysen (tekliflerim/geçmiş) ya da sipariş çıktıysa (siparişlerim)
      // görürsün. Kendi ilanlarını (kapanmış dahil) ownerTenders gösterir.
      this.prisma.listing.findMany({
        where: {
          ...baseWhere,
          status: { notIn: ["OPEN", "DRAFT", "IN_APPROVAL"] },
          OR: [
            invitedClause,
            { bids: { some: { bidderCompanyId: companyId } } },
          ],
        },
        select,
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
    ]);
    const byId = new Map(
      [...openRows, ...pastRows].map((l) => [l.id, l] as const),
    );
    const all = [...byId.values()];
    const ids = all.map((l) => l.id);
    if (ids.length === 0) return [];

    const [myBids, myInvites, categories] = await Promise.all([
      this.prisma.listingBid.findMany({
        where: { listingId: { in: ids }, bidderCompanyId: companyId },
        select: { listingId: true, status: true, version: true },
      }),
      this.prisma.listingInvitation.findMany({
        where: { listingId: { in: ids }, invitedCompanyId: companyId },
        select: { listingId: true },
      }),
      this.prisma.category.findMany({
        where: {
          code: { in: [...new Set(all.flatMap((l) => l.categoryIds.slice(0, 2)))] },
        },
        select: { code: true, nameTr: true },
      }),
    ]);
    const bidByListing = new Map(myBids.map((b) => [b.listingId, b] as const));
    const invitedSet = new Set(myInvites.map((iv) => iv.listingId));
    const catName = new Map(categories.map((c) => [c.code, c.nameTr] as const));

    // Kategori eşleşmesi: ilan kodları → segment/alt adayları, benim İLGİLİ
    // yön kategorilerimle kesişiyor mu (bildirim eşleştiricisiyle aynı mantık):
    // ALIM ilanına teklif veren SATICI → satış kategorileri; SATIS ilanına
    // teklif veren ALICI → alım kategorileri.
    const mySegs = new Set(
      (type === "ALIM"
        ? myCompany?.sellerCategoryIds
        : myCompany?.buyerCategoryIds) ?? [],
    );
    const mySubs = new Set(
      (type === "ALIM"
        ? myCompany?.sellerSubCategoryIds
        : myCompany?.buyerSubCategoryIds) ?? [],
    );
    const matchesMyCategories = (codes: string[]): boolean => {
      if (mySegs.size === 0 && mySubs.size === 0) return false;
      const { segmentIds, subCandidates } = deriveCategoryMatchCandidates(codes);
      return (
        segmentIds.some((c) => mySegs.has(c)) ||
        subCandidates.some((c) => mySubs.has(c))
      );
    };

    const rows = all.map((l) => {
      const connected = connectedIds.includes(l.companyId);
      const invited = invitedSet.has(l.id);
      const bid = bidByListing.get(l.id);
      const masked =
        l.visibility === "PUBLIC" && !connected && !invited && !isPremium;
      const canBid =
        invited || connected || (l.visibility === "PUBLIC" && isPremium);
      return {
        _open: l.status === "OPEN",
        id: l.id,
        number: l.number,
        title: l.title,
        status: l.status,
        visibility: l.visibility,
        format: l.format,
        currency: l.primaryCurrency,
        isInternational: l.isInternational,
        closesAt: l.closesAt,
        createdAt: l.createdAt,
        itemCount: l._count.items,
        // id: liste "Müşteri/Satıcı" filtresi companyId'ye göre gruplar
        // (browse ile aynı shape; maskelide kimlik sızdırılmaz).
        owner: masked ? null : { id: l.companyId, name: l.company.name },
        masked,
        canBid,
        invited,
        // Bağlantılı firma ihalesi (aktif iş ilişkisi) — sıralamada davetlinin
        // altında, kategori eşleşenin üstünde önceliklenir.
        connected,
        myBidStatus: bid?.status ?? null,
        myBidVersion: bid?.version ?? null,
        // SATIS: taban + hemen-al (maskelide fiyat sızdırılmaz).
        priceScope: l.priceScope,
        minPrice: masked ? null : (l.minPrice?.toString() ?? null),
        buyNowPrice: masked ? null : (l.buyNowPrice?.toString() ?? null),
        categoryMatch: matchesMyCategories(l.categoryIds),
        categories: l.categoryIds
          .slice(0, 2)
          .map((code) => ({ code, name: catName.get(code) ?? code })),
        extraCategoryCount: Math.max(0, l.categoryIds.length - 2),
      };
    });

    // Öncelik sıralaması (stable — aynı kademede mevcut düzen korunur:
    // açıkta yakın kapanış, geçmişte yeni önce):
    //   1) Açık ilanlar üstte
    //   2) DAVET EDİLENLER (beni özel çağıran — en güçlü sinyal)
    //   3) BAĞLANTILI firma ihaleleri (iş ilişkim olan firma)
    //   4) Kategori eşleşenler (sektörüme uygun herkese açık)
    //   5) gerisi
    rows.sort(
      (a, b) =>
        Number(b._open) - Number(a._open) ||
        Number(b.invited) - Number(a.invited) ||
        Number(b.connected) - Number(a.connected) ||
        Number(b.categoryMatch) - Number(a.categoryMatch) ||
        0,
    );
    // Yardımcı alan dışarı sızmasın.
    return rows.map(({ _open, ...r }) => r);
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
            _max: { amount: true },
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

    // İngiliz Usulü: güncel EN İYİ teklif herkese görünür — ALIM'da en düşük
    // (ters eksiltme), SATIS'ta en yüksek (açık artırma).
    const englishBest =
      listing.type === "SATIS"
        ? englishAgg?._max.amount
        : englishAgg?._min.amount;
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
          currentBest: englishBest ? englishBest.toString() : null,
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
      // SATIS + KALEM fiyatlandırma (maskeli görünümde items zaten boş).
      minUnitPrice: it.minUnitPrice?.toString() ?? null,
      buyNowUnitPrice: it.buyNowUnitPrice?.toString() ?? null,
      materialCode: it.materialCode,
      requiredByDate: it.requiredByDate ? it.requiredByDate.toISOString() : null,
      questions: it.questions.map((q) => ({
        id: q.id,
        text: q.text,
        answerType: q.answerType,
        required: q.required,
      })),
    }));
    // Maskeli görünüm için teaser: NE alınıyor belli olsun (isim/miktar/birim)
    // ama fiyat/malzeme kodu/teslim tarihi/açıklama/sorular GİZLİ. Standart üye
    // görüp teklif vermeye özenir; rekabet-hassas veri sızmaz.
    const teaserItems = items.map((it) => ({
      id: it.id,
      lineNo: it.lineNo,
      name: it.name,
      quantity: it.quantity.toString(),
      unit: it.unit,
      description: null,
      targetPrice: null,
      minUnitPrice: null,
      buyNowUnitPrice: null,
      materialCode: null,
      requiredByDate: null,
      questions: [] as { id: string; text: string; answerType: string; required: boolean }[],
    }));

    if (isOwner) {
      // Bağımsız sorgular paralel (sahip detayı 4sn'de bir poll'lanabilir).
      const needsApproval =
        listing.status === "IN_APPROVAL" ||
        listing.status === "IN_AWARD_APPROVAL";
      const [bids, invitations, pendingApprovalId, totalBidCount] =
        await Promise.all([
        this.prisma.listingBid.findMany({
          where: {
            listingId: id,
            // AWARDED_PARTIAL dahil — kalem-bazlı kısmi kazanan sahibin
            // listesinden kaybolmasın (yalnız WITHDRAWN/DRAFT gizli).
            status: { in: ["SUBMITTED", "WON", "AWARDED_PARTIAL", "LOST"] },
          },
          include: {
            bidderCompany: { select: { name: true } },
            items: true,
            answers: true,
            // SATIS: alıcının teslimat adresi (satıcı görür — nereye teslim).
            deliveryAddress: {
              select: {
                title: true,
                contactName: true,
                phone: true,
                country: true,
                city: true,
                district: true,
                addressLine: true,
                postalCode: true,
              },
            },
          },
        }),
        this.prisma.listingInvitation.findMany({
          where: { listingId: id },
          include: {
            invitedCompany: { select: { name: true, rothernId: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        needsApproval
          ? this.approvals.pendingForListing(user.companyId, id)
          : Promise.resolve(null),
        // canEdit için TÜM teklif kayıtları sayılır (WITHDRAWN/DRAFT dahil) —
        // updateListing kilidiyle birebir aynı kural.
        this.prisma.listingBid.count({ where: { listingId: id } }),
      ]);
      bids.sort((a, b) =>
        listing.type === "ALIM"
          ? Number(a.amount) - Number(b.amount) // ALIM: düşük iyi
          : Number(b.amount) - Number(a.amount), // SATIS: yüksek iyi
      );
      return {
        ...this.detail(listing, false),
        isOwner: true,
        // Düzenlenebilir: TASLAK her zaman, AÇIK ise HİÇ teklif kaydı yokken
        // (elenen/geri çekilen dahil — updateListing kilidiyle aynı).
        canEdit:
          listing.status === "DRAFT" ||
          (listing.status === "OPEN" && totalBidCount === 0),
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
          rothernId: iv.invitedCompany.rothernId,
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
          // ALIM: satıcının taahhüdü; SATIS: alıcının istediği teslim tarihi.
          deliveryDate: b.deliveryDate ? b.deliveryDate.toISOString() : null,
          validityDays: b.validityDays,
          deliveryAddress: b.deliveryAddress,
          items: b.items.map((bi) => ({
            itemId: bi.itemId,
            unitPrice: bi.unitPrice.toString(),
            deliveryDate: bi.deliveryDate
              ? bi.deliveryDate.toISOString()
              : null,
          })),
          answers: b.answers.map((a) => ({
            questionId: a.questionId,
            value: a.value,
          })),
        })),
      };
    }

    // Bağımsız non-owner okumaları tek turda (görünürlük/blok kapısı sonuçlar
    // gelince değerlendirilir; over-fetch ucuz, seri tur sayısı düşer — P1).
    const [invitedCount, blockedIds, myBid, auctionView] = await Promise.all([
      // Davet durumu her görünürlükte döner (satıcı "Davet Edildi" rozeti);
      // PRIVATE erişim kontrolü de aynı sayıyı kullanır.
      this.prisma.listingInvitation.count({
        where: { listingId: id, invitedCompanyId: user.companyId },
      }),
      this.blocks.blockedCompanyIds(listing.companyId),
      this.prisma.listingBid.findUnique({
        where: {
          listingId_bidderCompanyId: {
            listingId: id,
            bidderCompanyId: user.companyId,
          },
        },
        include: { items: true, answers: true },
      }),
      // Açık eksiltme görünürlüğü (bidVisibility) — kapalı zarf korunur, sadece
      // ayara göre en iyi fiyat / kendi sıra / tüm sıralar açılır.
      listing.format === "ENGLISH_AUCTION"
        ? this.computeAuctionView(
            id,
            user.companyId,
            listing.bidVisibility,
            listing.type,
          )
        : Promise.resolve(null),
    ]);

    const isInvited = invitedCount > 0;
    // Davet HER görünürlüğü açar ve ülke kapsamını aşar — liste (sellerTenders)
    // ve teklif (placeBid) ile aynı kural; davetlinin teklif verebildiği ilanın
    // detayı 404 olmamalı (eligibility drift fix).
    const visible =
      isInvited ||
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected);
    if (!visible) throw new NotFoundException("İlan bulunamadı");

    // Yayınlanmamış (DRAFT) ilan sahip dışında kimseye görünmez — davetli/
    // bağlantılı firma dahi id ile taslağı açamaz (owner dalı yukarıda döner).
    if (listing.status === "DRAFT") {
      throw new NotFoundException("İlan bulunamadı");
    }

    // Engelli firma ilanı göremez.
    if (blockedIds.includes(user.companyId)) {
      throw new NotFoundException("İlan bulunamadı");
    }
    // Ülke kapsamı (davetli hariç): uluslararası ilan yurtiçi tedarikçiye,
    // yurtiçi ilan yabancıya görünmez.
    if (
      !isInvited &&
      !this.isCountryEligible(
        user.country,
        listing.company.country,
        listing.isInternational,
        listing.targetCountries,
      )
    ) {
      throw new NotFoundException("İlan bulunamadı");
    }

    // Davetli firma her görünürlükte maskesiz görür ve teklif verebilir
    // (alıcı onu açıkça seçti) — sellerTenders ile aynı kural.
    const masked =
      listing.visibility === "PUBLIC" &&
      !connected &&
      !isPremium &&
      !isInvited;
    const canBid =
      isInvited ||
      (listing.visibility === "CONNECTIONS" && connected) ||
      (listing.visibility === "PUBLIC" && (connected || isPremium));
    // Rol kapısı UI'a da yansısın: placeBid ALIM'da SATISCI, SATIS'ta
    // SATIN_ALMACI ister — kullanıcı formu doldurup 403 yemesin.
    const roleAllowsBid =
      user.roles.includes(CompanyRole.SAHIP) ||
      user.roles.includes(
        listing.type === "ALIM" ? CompanyRole.SATISCI : CompanyRole.SATIN_ALMACI,
      );
    // Bidder'a dönen `english` bloğu görünürlükle sınırlanır; MASKELİ izleyici
    // canlı fiyat/katılımcı verisi almaz (önizleme sızıntısı yok).
    const englishForBidder =
      english && !masked
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
      roleAllowsBid,
      invited: isInvited,
      english: englishForBidder,
      auctionView: masked ? null : auctionView,
      // Teslimat adresi (PII: ad/telefon) yalnız teklif verebilenlere —
      // maskeli/premium-kilitli izleyici görmez.
      deliveryAddress: canBid ? deliveryAddress : null,
      // Maskeli üye teaser görür (isim/miktar/birim); fiyat/detay gizli.
      items: masked ? teaserItems : itemsOut,
      itemCount: itemsOut.length,
      myBid: myBid
        ? {
            amount: myBid.amount.toString(),
            note: myBid.note,
            status: myBid.status,
            isBuyNow: myBid.isBuyNow,
            version: myBid.version,
            submittedAt: myBid.submittedAt
              ? myBid.submittedAt.toISOString()
              : null,
            eliminationReason: myBid.eliminationReason,
            eliminatedAt: myBid.eliminatedAt
              ? myBid.eliminatedAt.toISOString()
              : null,
            updatedAt: myBid.updatedAt.toISOString(),
            deliveryDate: myBid.deliveryDate
              ? myBid.deliveryDate.toISOString()
              : null,
            validityDays: myBid.validityDays,
            deliveryAddressId: myBid.deliveryAddressId,
            currency: myBid.currency,
            items: myBid.items.map((bi) => ({
              itemId: bi.itemId,
              unitPrice: bi.unitPrice.toString(),
              deliveryDate: bi.deliveryDate
                ? bi.deliveryDate.toISOString()
                : null,
            })),
            answers: myBid.answers.map((a) => ({
              questionId: a.questionId,
              value: a.value,
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
    listingType: ListingType,
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
      // ALIM = ters eksiltme (düşük en iyi), SATIS = açık artırma (yüksek en iyi).
      orderBy: { amount: listingType === "SATIS" ? "desc" : "asc" },
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
  /**
   * Adrese-teslim şartları — SATIS teklifinde alıcının teslimat adresi
   * gönderimde zorunlu (satıcı nereye teslim edeceğini bilmeli).
   */
  private static readonly BUYER_ADDRESS_REQUIRED_TERMS: ReadonlySet<string> =
    new Set([
      "DOMESTIC_DELIVERED",
      "DOMESTIC_ON_VEHICLE",
      "DOMESTIC_CARRIER_COLLECT",
      "DAP",
      "DPU",
      "DDP",
    ]);

  /**
   * SATIS teklifindeki alıcı teslimat adresini doğrular; upsert'e yazılacak
   * id'yi döner. ALIM'da adres kabul edilmez (teslimat adresi ilanın kendisinde).
   */
  private async resolveBidDeliveryAddress(
    companyId: string,
    listingType: ListingType,
    deliveryTerm: string | null,
    dtoAddressId: string | undefined,
    isDraft: boolean,
  ): Promise<string | null> {
    let addressId: string | null = null;
    if (dtoAddressId) {
      if (listingType !== "SATIS") {
        throw new BadRequestException(
          "Teslimat adresi yalnız satış ilanına verilen teklifte girilir",
        );
      }
      const addr = await this.prisma.companyAddress.findUnique({
        where: { id: dtoAddressId },
        select: { companyId: true, type: true },
      });
      if (!addr || addr.companyId !== companyId || addr.type === "FATURA") {
        throw new BadRequestException("Geçersiz teslimat adresi");
      }
      addressId = dtoAddressId;
    }
    if (
      !isDraft &&
      listingType === "SATIS" &&
      deliveryTerm &&
      CompanyListingsService.BUYER_ADDRESS_REQUIRED_TERMS.has(deliveryTerm) &&
      !addressId
    ) {
      throw new BadRequestException(
        "Bu ilanda teslim şekli adrese teslim — teklif göndermek için teslimat adresi seçin",
      );
    }
    return addressId;
  }

  /**
   * İlana yazılan teslimat/fatura adres id'leri istek sahibinin KENDİ adres
   * defterinden olmalı. Aksi halde yabancı bir CompanyAddress'in id'si ilana
   * yazılıp award'da orderDeliverySnapshot ile siparişin deliveryAddress JSON'una
   * (karşı tarafın gördüğü) PII olarak kopyalanabilirdi.
   */
  private async assertListingAddressesOwned(
    companyId: string,
    deliveryAddressId?: string | null,
    billingAddressId?: string | null,
  ): Promise<void> {
    const ids = [...new Set(
      [deliveryAddressId, billingAddressId].filter((v): v is string => !!v),
    )];
    if (ids.length === 0) return;
    const owned = await this.prisma.companyAddress.count({
      where: { id: { in: ids }, companyId },
    });
    if (owned !== ids.length) {
      throw new BadRequestException("Geçersiz teslimat/fatura adresi");
    }
  }

  /**
   * Sipariş için teslimat adresi snapshot'ı (award anında çekilir — adres
   * defteri sonradan değişse/silinse de sipariş sabit kalır).
   */
  private async orderDeliverySnapshot(
    addressId: string | null,
  ): Promise<Prisma.InputJsonValue | undefined> {
    if (!addressId) return undefined;
    const a = await this.prisma.companyAddress.findUnique({
      where: { id: addressId },
      select: {
        title: true,
        contactName: true,
        phone: true,
        country: true,
        city: true,
        district: true,
        addressLine: true,
        postalCode: true,
      },
    });
    return a ? (a as Prisma.InputJsonValue) : undefined;
  }

  async placeBid(user: AuthenticatedCompanyUser, id: string, dto: PlaceBidDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        type: true,
        title: true,
        number: true,
        format: true,
        visibility: true,
        bidVisibility: true,
        status: true,
        requireAllItems: true,
        requireBidDocument: true,
        minPrice: true,
        buyNowPrice: true,
        currentRound: true,
        primaryCurrency: true,
        allowedCurrencies: true,
        deliveryTerm: true,
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
    // ── ERİŞİM kontrolleri ÖNCE (404/403) — durum/para birimi 400'leri gizli
    // ilanın varlığını/ayarlarını sızdırmasın (info-leak: davetsiz PRIVATE
    // prober geçersiz para birimiyle "geçersiz para birimi" alamamalı).
    const [blockedIds, connectedIds, invitedCount, existingBid] =
      await Promise.all([
        this.blocks.blockedCompanyIds(listing.companyId),
        this.connectedCompanyIds(user.companyId),
        this.prisma.listingInvitation.count({
          where: { listingId: id, invitedCompanyId: user.companyId },
        }),
        this.prisma.listingBid.findUnique({
          where: {
            listingId_bidderCompanyId: {
              listingId: id,
              bidderCompanyId: user.companyId,
            },
          },
          select: { status: true, amount: true },
        }),
      ]);
    if (blockedIds.includes(user.companyId)) {
      throw new NotFoundException("İlan bulunamadı");
    }
    const connected = connectedIds.includes(listing.companyId);
    const isPremium = user.tier === "PAKET";
    // Davet her görünürlükte teklif hakkı verir ve ÜLKE kapsamını da aşar
    // (alıcı firmayı açıkça seçti) — getOne/sellerTenders ile aynı kural.
    const isInvited = invitedCount > 0;
    const visible =
      isInvited ||
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected);
    if (!visible) throw new NotFoundException("İlan bulunamadı");
    if (
      !isInvited &&
      !this.isCountryEligible(
        user.country,
        listing.company.country,
        listing.isInternational,
        listing.targetCountries,
      )
    ) {
      throw new NotFoundException("İlan bulunamadı");
    }

    const canBid =
      isInvited ||
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
    // Kurucu (SAHIP) tam yetkilidir — her iki tarafta da teklif verebilir.
    const neededRole =
      listing.type === "ALIM" ? CompanyRole.SATISCI : CompanyRole.SATIN_ALMACI;
    if (
      !user.roles.includes(CompanyRole.SAHIP) &&
      !user.roles.includes(neededRole)
    ) {
      throw new ForbiddenException(
        listing.type === "ALIM"
          ? "Alım ilanına teklif (satış) için Satışçı rolü gerekir"
          : "Satış ilanına teklif (alım) için Satın Almacı rolü gerekir",
      );
    }

    // ── Durum / zaman kontrolleri ──
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

    // ── Mevcut teklif durum kuralları (SERVER-side — UI'a güvenilmez) ──
    // Gönderilmiş teklif geri çekilemez ve kapalı-zarf RFQ'da revize edilemez.
    // Değişiklik yolu: alıcıyla iletişim → alıcı eler (LOST) → yeniden teklif
    // serbest (version++). Açık eksiltmede fiyat düşürme serbest (monotonluk
    // aşağıda zorlanır). WITHDRAWN yalnız legacy kayıtlarda olabilir.
    if (existingBid?.status === "WITHDRAWN") {
      throw new BadRequestException(
        "Geri çekilen teklif yeniden verilemez",
      );
    }
    if (
      existingBid?.status === "SUBMITTED" &&
      listing.format !== "ENGLISH_AUCTION"
    ) {
      throw new BadRequestException(
        "Gönderilmiş teklif düzenlenemez — değişiklik için alıcıyla iletişime geçin; alıcı teklifinizi elerse yeniden teklif verebilirsiniz",
      );
    }

    const isDraft = dto.asDraft === true;
    // Auction'da gönderilmiş teklif TASLAĞA çekilemez: agregattan düşürür
    // ("yumuşak geri çekme" ile fiyat manipülasyonu) ve sonraki gönderimde
    // monotonluk referanssız kalırdı.
    if (
      isDraft &&
      existingBid?.status === "SUBMITTED" &&
      listing.format === "ENGLISH_AUCTION"
    ) {
      throw new BadRequestException(
        "Açık eksiltme/artırmada gönderilmiş teklif taslağa çekilemez — yeni tutarı doğrudan gönderin",
      );
    }
    // Para birimi: ilan izin veriyorsa seçilebilir; varsayılan ilanın birimi.
    const currency = (dto.currency as Currency) ?? listing.primaryCurrency;
    if (
      listing.allowedCurrencies.length > 0 &&
      !listing.allowedCurrencies.includes(currency)
    ) {
      throw new BadRequestException("Bu ilan için geçersiz para birimi");
    }
    // Gönderimde geçerlilik her zaman zorunlu (taslakta opsiyonel).
    if (!isDraft && !dto.validityDays) {
      throw new BadRequestException(
        "Teklif göndermek için geçerlilik süresi zorunlu",
      );
    }
    // Genel teslim tarihi: kalem-bazlı teklifte teklif verilen HER kalemin kendi
    // teslim tarihi varsa GEREKSİZ (tedarikçi ayrı ayrı girdi) → tekrar istenmez.
    // Aksi halde (kalemsiz teklif ya da tarihsiz kalem var) gönderimde zorunlu.
    const everyItemHasDelivery =
      !!dto.items?.length && dto.items.every((bi) => !!bi.deliveryDate);
    if (!isDraft && !everyItemHasDelivery && !dto.deliveryDate) {
      throw new BadRequestException(
        listing.type === "SATIS"
          ? "İstenen teslim tarihi zorunlu (kalem tarihi girmediğiniz kalemler için)"
          : "Teslim tarihi zorunlu (kalem tarihi girmediğiniz kalemler için)",
      );
    }
    // Gönderimde teslim tarihi geçmişte olamaz.
    if (
      !isDraft &&
      dto.deliveryDate &&
      new Date(dto.deliveryDate).getTime() < Date.now() - 86_400_000
    ) {
      throw new BadRequestException("Teslim tarihi geçmişte olamaz");
    }
    // SATIS: alıcının teslimat adresi. Verilmişse sahiplik + tip doğrulanır
    // (IDOR); adrese-teslim şartlı ilanda gönderimde zorunlu — satıcı "nakliye
    // dahil" taahhüt etti, nereye teslim edeceğini bilmeli.
    const deliveryAddressId = await this.resolveBidDeliveryAddress(
      user.companyId,
      listing.type,
      listing.deliveryTerm,
      dto.deliveryAddressId,
      isDraft,
    );
    // Gönderimde belge zorunluysa teklifin en az bir belgesi olmalı
    // (akış: taslak kaydet → belge yükle → gönder).
    if (!isDraft && listing.requireBidDocument) {
      const docCount = existingBid
        ? await this.prisma.listingBidDocument.count({
            where: {
              bid: { listingId: id, bidderCompanyId: user.companyId },
            },
          })
        : 0;
      if (docCount === 0) {
        throw new BadRequestException(
          "Bu ihalede teklif dosyası zorunlu — önce taslak kaydedip dosya ekleyin",
        );
      }
    }

    // Kalem-bazlı vs tek-tutar teklif. İhalede kalem varsa kalem teklifi zorunlu;
    // toplam = Σ(birim fiyat × kalem miktarı).
    const listingItems = await this.prisma.listingItem.findMany({
      where: { listingId: id },
      select: {
        id: true,
        name: true,
        quantity: true,
        minUnitPrice: true,
        buyNowUnitPrice: true,
        questions: { select: { id: true, required: true, text: true } },
      },
    });

    // Para tutarları Decimal ile hesaplanır (kayan nokta birikimi yok — F7).
    let amount: Prisma.Decimal;
    let bidItemsData: {
      itemId: string;
      unitPrice: number;
      deliveryDate: Date | null;
    }[] = [];
    let answersData: { questionId: string; value: string }[] = [];

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
      // requireAllItems yalnız GÖNDERİMDE zorlanır — kısmi taslak kaydedilebilsin.
      if (
        !isDraft &&
        listing.requireAllItems &&
        provided.length < listingItems.length
      ) {
        throw new BadRequestException(
          "Bu ihalede tüm kalemlere teklif vermelisiniz",
        );
      }
      // Gönderimde her fiyatlanan kalem pozitif olmalı (0₺'lik satır kazanamaz).
      if (!isDraft && provided.some((bi) => bi.unitPrice <= 0)) {
        throw new BadRequestException(
          "Fiyatlanan her kalemin birim fiyatı sıfırdan büyük olmalı",
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
        deliveryDate: bi.deliveryDate ? new Date(bi.deliveryDate) : null,
      }));

      // Kalem soruları: cevaplar yalnız FİYATLANAN kalemin sorularına verilebilir;
      // gönderimde fiyatlanan kalemlerin ZORUNLU soruları cevaplanmış olmalı.
      const pricedItemIds = new Set(provided.map((bi) => bi.itemId));
      const questionById = new Map(
        listingItems.flatMap((it) =>
          it.questions.map((q) => [q.id, { ...q, itemId: it.id }] as const),
        ),
      );
      const seen = new Set<string>();
      for (const bi of provided) {
        for (const a of bi.answers ?? []) {
          const q = questionById.get(a.questionId);
          if (!q || q.itemId !== bi.itemId) {
            throw new BadRequestException("Geçersiz soru cevabı");
          }
          if (seen.has(a.questionId)) {
            throw new BadRequestException(
              "Aynı soruya birden fazla cevap girilemez",
            );
          }
          seen.add(a.questionId);
          const value = a.value.trim();
          if (value) answersData.push({ questionId: a.questionId, value });
        }
      }
      if (!isDraft) {
        const answered = new Set(answersData.map((a) => a.questionId));
        for (const it of listingItems) {
          if (!pricedItemIds.has(it.id)) continue;
          const missing = it.questions.find(
            (q) => q.required && !answered.has(q.id),
          );
          if (missing) {
            throw new BadRequestException(
              `Zorunlu kalem sorusu cevaplanmadı: "${missing.text}"`,
            );
          }
        }
      }
    } else {
      if (dto.amount == null || dto.amount <= 0) {
        throw new BadRequestException("Geçerli bir tutar girin");
      }
      amount = new Prisma.Decimal(dto.amount);
    }

    // TRY dışı teklifte güncel TCMB kuru anlık snapshot'lanır — hem kayıt
    // (TRY karşılığı gösterimi) hem de aşağıdaki taban/hemen-al kıyası için.
    // Kur alınamazsa teklif yine kabul edilir ama TRY karşılığı boş kalır;
    // sessiz kalmasın diye loglanır (gözlemlenebilirlik).
    let exchangeRateSnapshot: number | null = null;
    if (currency !== "TRY") {
      exchangeRateSnapshot = await this.exchangeRates
        .getCurrentRate(currency)
        .catch((err) => {
          this.logger.warn(
            `TCMB kuru alınamadı (${currency}); teklif TRY karşılığı olmadan kaydedilecek: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          return null;
        });
    }

    // Taban/hemen-al kıyası İLANIN para biriminde yapılır. Teklif farklı
    // birimdeyse TCMB kuruyla çevrilir (çevrimsiz ham kıyas yanlıştı:
    // 100 USD, 3.000 TL tabanın "altında" sayılıyordu). Kur yoksa/BAYATSA ve
    // kıyas gerekiyorsa gönderim reddedilir — yanlış kıyasla teklif kabul
    // edilmez. DİKKAT: burada getCurrentRate DEĞİL getFreshRate — o sessizce
    // bayat/fallback kur döndürür (gösterim için OK, para kararı için değil).
    const curSym =
      listing.primaryCurrency === "TRY" ? "₺" : listing.primaryCurrency;
    let toListingCurrency: Prisma.Decimal | null = null;
    if (currency === listing.primaryCurrency) {
      toListingCurrency = new Prisma.Decimal(1);
    } else {
      const bidRate =
        currency === "TRY"
          ? 1
          : await this.exchangeRates.getFreshRate(currency).catch(() => null);
      const listingRate =
        listing.primaryCurrency === "TRY"
          ? 1
          : await this.exchangeRates
              .getFreshRate(listing.primaryCurrency)
              .catch(() => null);
      if (bidRate != null && listingRate != null && listingRate > 0) {
        toListingCurrency = new Prisma.Decimal(bidRate).div(listingRate);
      }
    }
    const needsFloorCheck =
      !isDraft &&
      listing.type === "SATIS" &&
      (listing.minPrice != null ||
        listing.buyNowPrice != null ||
        listingItems.some(
          (li) => li.minUnitPrice != null || li.buyNowUnitPrice != null,
        ));
    if (needsFloorCheck && toListingCurrency == null) {
      throw new BadRequestException(
        "Güncel kur bilgisi yok (TCMB) — teklifiniz taban fiyatla karşılaştırılamıyor. Lütfen daha sonra tekrar deneyin veya teklifi ilanın para biriminde verin",
      );
    }
    const inListingCur = (v: Prisma.Decimal | number): Prisma.Decimal =>
      new Prisma.Decimal(v).mul(toListingCurrency ?? 1);

    // SATIS: taban fiyatın ALTINDA gönderilmiş teklif kabul edilmez
    // (taslakta serbest — kullanıcı formda düzeltir).
    if (
      needsFloorCheck &&
      listing.minPrice != null &&
      inListingCur(amount).lt(listing.minPrice)
    ) {
      throw new BadRequestException(
        `Teklif taban fiyatın (${Number(listing.minPrice).toLocaleString("tr-TR")} ${curSym}) altında olamaz`,
      );
    }
    // SATIS + hemen-al: hemen-al fiyatı tavandır — ona eşit/üzeri teklif
    // yerine Hemen Al kullanılır (anında o fiyattan teklif oluşturur).
    if (
      needsFloorCheck &&
      listing.buyNowPrice != null &&
      inListingCur(amount).gte(listing.buyNowPrice)
    ) {
      throw new BadRequestException(
        `Teklifiniz Hemen-Al fiyatına (${Number(listing.buyNowPrice).toLocaleString("tr-TR")} ${curSym}) ulaştı — bu fiyattan almak için Hemen Al'ı kullanın`,
      );
    }
    // SATIS + KALEM fiyatlandırma: fiyatlanan her kalem kendi tabanının
    // altına inemez; kalem hemen-al fiyatına eşit/üzeri birim fiyat yerine
    // o kalem Hemen Al ile alınır. (Taslakta serbest.)
    if (needsFloorCheck && bidItemsData.length > 0) {
      const itemById = new Map(listingItems.map((li) => [li.id, li]));
      for (const bi of bidItemsData) {
        const li = itemById.get(bi.itemId);
        if (!li) continue;
        const unitPriceCmp = inListingCur(bi.unitPrice);
        if (li.minUnitPrice != null && unitPriceCmp.lt(li.minUnitPrice)) {
          throw new BadRequestException(
            `"${li.name}" kaleminde birim fiyat tabanın (${Number(li.minUnitPrice).toLocaleString("tr-TR")} ${curSym}) altında olamaz`,
          );
        }
        if (
          li.buyNowUnitPrice != null &&
          unitPriceCmp.gte(li.buyNowUnitPrice)
        ) {
          throw new BadRequestException(
            `"${li.name}" kaleminde teklif Hemen-Al fiyatına (${Number(li.buyNowUnitPrice).toLocaleString("tr-TR")} ${curSym}) ulaştı — bu kalemi Hemen Al ile alın`,
          );
        }
      }
    }

    // İngiliz Usulü: GÖNDERİLEN teklif, adım kuralına göre referanstan
    // (en iyi teklif veya kendi son teklifi) yeterince İYİ olmalı.
    // Yön ilan tipine bağlı: ALIM = ters eksiltme (fiyat DÜŞER, en düşük
    // kazanır), SATIS = açık artırma (fiyat YÜKSELİR, en yüksek kazanır).
    // Taslakta serbest.
    if (!isDraft && listing.format === "ENGLISH_AUCTION") {
      const isAscending = listing.type === "SATIS";
      const [bestAgg, own] = await Promise.all([
        this.prisma.listingBid.aggregate({
          where: {
            listingId: id,
            status: "SUBMITTED",
            bidderCompanyId: { not: user.companyId },
          },
          _min: { amount: true },
          _max: { amount: true },
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
      const best: Prisma.Decimal | null =
        (isAscending ? bestAgg._max.amount : bestAgg._min.amount) ?? null;
      const ownLast: Prisma.Decimal | null =
        own && own.status === "SUBMITTED" ? own.amount : null;
      const fmt = (d: Prisma.Decimal) => d.toNumber().toLocaleString("tr-TR");
      // MONOTONLUK: kendi fiyatın yön aleyhine ASLA değişemez — basis
      // BEST_BID olsa bile. (ALIM'da lider rakip referansına sığınıp
      // 800→950'ye çıkamaz; SATIS'ta 950→800'e inemez.)
      if (ownLast != null) {
        if (!isAscending && amount.gte(ownLast)) {
          throw new BadRequestException(
            `İngiliz usulü: yeni teklifiniz önceki teklifinizin (${fmt(ownLast)} ${curSym}) altında olmalı`,
          );
        }
        if (isAscending && amount.lte(ownLast)) {
          throw new BadRequestException(
            `Açık artırma: yeni teklifiniz önceki teklifinizin (${fmt(ownLast)} ${curSym}) üzerinde olmalı`,
          );
        }
      }
      const ref =
        // BEST_BID bazında rakip yoksa kendi son teklifi referans olur —
        // solo teklifçi 0,01'lik anlamsız adımlarla ilerleyemesin.
        listing.priceDecrementBasis === "OWN_LAST_BID"
          ? ownLast ?? best
          : best ?? ownLast;
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
        // KAPALI-ZARF SIZINTISI KORUMASI: referans RAKİBİN en iyi teklifiyse ve
        // bidVisibility en iyiyi zaten AÇIKLAMIYORSA (OWN_ONLY/OWN_RANK), hata
        // mesajı ref/tavan sayısını ECHO ETMEZ — aksi halde teklifçi geçersiz
        // teklif atıp mesajdan rakip en iyi teklifi geri hesaplardı. Referans
        // kendi son teklifiyse ya da best zaten görünürse detaylı mesaj güvenli.
        const bestDisclosed =
          listing.bidVisibility === "BEST_PRICE" ||
          listing.bidVisibility === "BEST_AND_OWN_RANK" ||
          listing.bidVisibility === "ALL";
        const refFromCompetitor = ref === best && best != null;
        const revealRef = bestDisclosed || !refFromCompetitor;
        // Decimal kesin aritmetik — epsilon toleransına gerek yok.
        if (!isAscending) {
          const maxAllowed = ref.minus(step);
          if (amount.gt(maxAllowed)) {
            throw new BadRequestException(
              !revealRef
                ? "İngiliz usulü: teklifiniz yeterince düşük değil — gerekli en az azaltma karşılanmadı."
                : step.gt(0)
                  ? `İngiliz usulü: teklifiniz en fazla ${fmt(maxAllowed)} ${curSym} olabilir (referansı en az ${fmt(step)} azaltmalısınız)`
                  : `İngiliz usulü: teklifiniz ${fmt(ref)} ${curSym}'nin altında olmalı`,
            );
          }
        } else {
          const minAllowed = ref.plus(step);
          if (amount.lt(minAllowed)) {
            throw new BadRequestException(
              !revealRef
                ? "Açık artırma: teklifiniz yeterince yüksek değil — gerekli en az artırma karşılanmadı."
                : step.gt(0)
                  ? `Açık artırma: teklifiniz en az ${fmt(minAllowed)} ${curSym} olmalı (referansı en az ${fmt(step)} artırmalısınız)`
                  : `Açık artırma: teklifiniz ${fmt(ref)} ${curSym}'nin üzerinde olmalı`,
            );
          }
        }
      }
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
          deliveryAddressId,
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
          deliveryAddressId,
          note: dto.note?.trim() || null,
          status,
          version: { increment: 1 },
          // Yeniden teklif (elenmişken tekrar SUBMITTED) → eski eleme izini temizle
          // ki myBid'de "elendi" bilgisi canlı teklifle çelişmesin.
          ...(isDraft
            ? {}
            : { submittedAt: new Date(), eliminationReason: null, eliminatedAt: null }),
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
            deliveryDate: bi.deliveryDate,
          })),
        });
        // Kalem sorusu cevaplarını yenile (aynı desen).
        await tx.listingBidAnswer.deleteMany({ where: { bidId: b.id } });
        if (answersData.length > 0) {
          await tx.listingBidAnswer.createMany({
            data: answersData.map((a) => ({ bidId: b.id, ...a })),
          });
        }
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
        // Optimistic: closesAt bu istek başladığından beri DEĞİŞMEDİYSE uzat.
        // Eşzamanlı iki geç teklifte bayat tabanla yazan taraf, diğerinin
        // uzatmasını geriye çekebilirdi (kapanış kısalırdı) — eşleşmezse
        // rakip uzatma zaten yapılmıştır, atlamak güvenli.
        await this.prisma.listing.updateMany({
          where: { id, closesAt: listing.closesAt },
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

    // WS: ilan sahibi + detay izleyicileri anında görsün (taslak hariç).
    if (!isDraft) {
      this.realtime?.pingListing(id, [listing.companyId]);
      // İlan sahibine "yeni teklif geldi" in-app bildirimi (sahip portalı).
      // E-posta yok — yüksek teklif hacminde spam olmasın; zil kaydı yeterli.
      // Best-effort: bildirim hatası (ör. teardown yarışı) teklif akışını etkilemesin.
      void this.notifications
        .pushToCompany(listing.companyId, {
          type: "bid_received",
          portal: this.ownerPortal(listing.type),
          title: "Yeni teklif geldi",
          body: `"${listing.title}" (${listing.number ?? "—"}) ilanınıza yeni bir teklif verildi.`,
          ctaLabel: "İhaleyi Gör",
          ctaUrl: `${this.webUrl()}/company/ilan/${id}`,
          listingId: id,
        })
        .catch((err) =>
          this.logger.warn(
            `Yeni teklif bildirimi yazılamadı (${id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    }
    return { id: bid.id, amount: bid.amount.toString(), status: bid.status };
  }

  /**
   * Hemen-Al — SATIS ilanında tavan (buyNow) fiyattan teklif oluşturur.
   * DİREKT SİPARİŞ DEĞİL: sahip yine onaylar (kazandırır). isBuyNow=true bayraklı.
   */
  async buyNow(user: AuthenticatedCompanyUser, listingId: string, input?: BuyNowDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        visibility: true,
        status: true,
        priceScope: true,
        buyNowPrice: true,
        requireAllItems: true,
        requireBidDocument: true,
        primaryCurrency: true,
        deliveryTerm: true,
        currentRound: true,
        closesAt: true,
        bidsOpenAt: true,
        isInternational: true,
        targetCountries: true,
        company: { select: { country: true } },
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            buyNowUnitPrice: true,
          },
        },
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    const isKalem = listing.priceScope === "KALEM";
    const buyableItems = listing.items.filter(
      (it) => it.buyNowUnitPrice != null,
    );
    if (
      listing.type !== "SATIS" ||
      (!isKalem && !listing.buyNowPrice) ||
      (isKalem && buyableItems.length === 0)
    ) {
      throw new BadRequestException("Bu ilanda hemen-al seçeneği yok");
    }
    if (listing.companyId === user.companyId) {
      throw new BadRequestException("Kendi ilanınız");
    }
    // Erişim kontrolleri (404/403) durum 400'lerinden ÖNCE — placeBid ile aynı
    // sızıntı-önleme sırası; davet her görünürlükte hak verir + ülkeyi aşar.
    const blockedIds = await this.blocks.blockedCompanyIds(listing.companyId);
    if (blockedIds.includes(user.companyId)) {
      throw new NotFoundException("İlan bulunamadı");
    }
    const [connectedIds, invitedCount] = await Promise.all([
      this.connectedCompanyIds(user.companyId),
      this.prisma.listingInvitation.count({
        where: { listingId, invitedCompanyId: user.companyId },
      }),
    ]);
    const connected = connectedIds.includes(listing.companyId);
    const isPremium = user.tier === "PAKET";
    const isInvited = invitedCount > 0;
    const visible =
      isInvited ||
      listing.visibility === "PUBLIC" ||
      (listing.visibility === "CONNECTIONS" && connected);
    if (!visible) throw new NotFoundException("İlan bulunamadı");
    if (
      !isInvited &&
      !this.isCountryEligible(
        user.country,
        listing.company.country,
        listing.isInternational,
        listing.targetCountries,
      )
    ) {
      throw new NotFoundException("İlan bulunamadı");
    }
    const canBid =
      isInvited || connected || (listing.visibility === "PUBLIC" && isPremium);
    if (!canBid) {
      throw new ForbiddenException("Bu ilana teklif için premium gerekir");
    }
    if (
      !user.roles.includes(CompanyRole.SAHIP) &&
      !user.roles.includes(CompanyRole.SATIN_ALMACI)
    ) {
      throw new ForbiddenException("Hemen-Al için Satın Almacı rolü gerekir");
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

    // Hemen-al da bir TEKLİF gönderimidir — normal gönderimle aynı detaylar
    // zorunlu (teslim tarihi + geçerlilik); teklif-ver ekranından girilir.
    // (Erişim kontrollerinden SONRA — davetsiz prober'a bilgi sızmaz.)
    if (!input?.deliveryDate || !input?.validityDays) {
      throw new BadRequestException(
        "Hemen-Al için istenen teslim tarihi ve geçerlilik süresi zorunlu",
      );
    }
    // Teslim tarihi geçmişte olamaz (placeBid ile aynı; DTO ISO8601 doğruladığı
    // için new Date güvenli — eskiden validasyonsuzdu, Invalid Date → 500).
    if (new Date(input.deliveryDate).getTime() < Date.now() - 86_400_000) {
      throw new BadRequestException("Teslim tarihi geçmişte olamaz");
    }
    // Alıcının teslimat adresi — normal teklif gönderimiyle aynı kural
    // (adrese-teslim şartlı ilanda zorunlu; sahiplik/tip doğrulanır).
    const deliveryAddressId = await this.resolveBidDeliveryAddress(
      user.companyId,
      listing.type,
      listing.deliveryTerm,
      input.deliveryAddressId,
      false,
    );

    // Mükerrer/kural koruması: gönderilmiş Hemen-Al tekrarlanamaz; geri
    // çekilen teklif Hemen-Al ile de diriltilemez (placeBid ile aynı kural).
    const existing = await this.prisma.listingBid.findUnique({
      where: {
        listingId_bidderCompanyId: {
          listingId,
          bidderCompanyId: user.companyId,
        },
      },
      select: { status: true, isBuyNow: true },
    });
    if (existing?.status === "WITHDRAWN") {
      throw new BadRequestException("Geri çekilen teklif yeniden verilemez");
    }
    // SUBMITTED teklif (normal VEYA hemen-al) kilitlidir — hemen-al ile üzerine
    // yazılıp kapsamı/tutarı değiştirilemez (kural #6: gönderilmiş teklif
    // editlenmez/geri çekilemez). Aksi halde KALEM modda itemIds alt-kümesiyle
    // kilitli teklifin kapsamı daraltılabiliyordu.
    if (existing?.status === "SUBMITTED") {
      throw new BadRequestException(
        existing.isBuyNow
          ? "Hemen-Al teklifiniz zaten gönderildi — satıcı onayı bekleniyor"
          : "Gönderilmiş teklifiniz var — Hemen-Al ile değiştirilemez",
      );
    }

    // Belge zorunlu ihalede hemen-al da belgesiz gönderilemez (normal teklifle
    // aynı kural; teklif-ver akışı: taslak → belge → hemen-al onayı).
    if (listing.requireBidDocument) {
      const docCount = existing
        ? await this.prisma.listingBidDocument.count({
            where: {
              bid: { listingId, bidderCompanyId: user.companyId },
            },
          })
        : 0;
      if (docCount === 0) {
        throw new BadRequestException(
          "Bu ihalede teklif belgesi zorunlu — önce belge yükleyin",
        );
      }
    }

    // Tutar + kalemler: KALEM modda seçilen kalemler hemen-al birim
    // fiyatlarından; TOPLU modda ilan geneli hemen-al tutarı.
    let amount: Prisma.Decimal;
    let buyItems: { itemId: string; unitPrice: number }[] = [];
    if (isKalem) {
      const buyableById = new Map(buyableItems.map((it) => [it.id, it]));
      const selectedIds =
        input.itemIds && input.itemIds.length > 0
          ? [...new Set(input.itemIds)]
          : buyableItems.map((it) => it.id);
      for (const itemId of selectedIds) {
        if (!buyableById.has(itemId)) {
          throw new BadRequestException(
            "Seçilen kalemlerden biri hemen-al ile alınamıyor",
          );
        }
      }
      if (
        listing.requireAllItems &&
        selectedIds.length < listing.items.length
      ) {
        throw new BadRequestException(
          buyableItems.length < listing.items.length
            ? "Bu ihalede tüm kalemlere teklif zorunlu; hemen-al fiyatı olmayan kalemler nedeniyle Hemen Al kullanılamaz — normal teklif verin"
            : "Bu ihalede tüm kalemlere teklif zorunlu — tüm kalemleri seçin",
        );
      }
      amount = selectedIds.reduce((sum, itemId) => {
        const it = buyableById.get(itemId)!;
        return sum.plus(
          new Prisma.Decimal(it.buyNowUnitPrice!).mul(it.quantity),
        );
      }, new Prisma.Decimal(0));
      buyItems = selectedIds.map((itemId) => ({
        itemId,
        unitPrice: Number(buyableById.get(itemId)!.buyNowUnitPrice),
      }));
    } else {
      amount = new Prisma.Decimal(listing.buyNowPrice!);
    }

    const deliveryDate = new Date(input.deliveryDate);
    // Hemen-Al teklifi HER ZAMAN ilanın ana para birimindedir; TRY dışıysa
    // TRY karşılığı gösterimi için kur snapshot'lanır (placeBid ile aynı).
    const exchangeRateSnapshot =
      listing.primaryCurrency !== "TRY"
        ? await this.exchangeRates
            .getCurrentRate(listing.primaryCurrency)
            .catch(() => null)
        : null;
    const bid = await this.prisma.$transaction(async (tx) => {
      const b = await tx.listingBid.upsert({
        where: {
          listingId_bidderCompanyId: {
            listingId,
            bidderCompanyId: user.companyId,
          },
        },
        create: {
          listingId,
          bidderCompanyId: user.companyId,
          amount,
          currency: listing.primaryCurrency,
          exchangeRateSnapshot,
          isBuyNow: true,
          createdById: user.userId,
          status: "SUBMITTED",
          submittedAt: new Date(),
          note: input.note?.trim() || null,
          deliveryDate,
          validityDays: input.validityDays ?? null,
          deliveryAddressId,
          round: listing.currentRound,
        },
        update: {
          // Eski taslak/teklifin kalıntıları (yabancı currency, bayat
          // submittedAt, eski tur damgası) hemen-al fiyatını bozmasın.
          amount,
          isBuyNow: true,
          status: "SUBMITTED",
          currency: listing.primaryCurrency,
          exchangeRateSnapshot,
          submittedAt: new Date(),
          version: { increment: 1 },
          note: input.note?.trim() || null,
          deliveryDate,
          validityDays: input.validityDays ?? null,
          deliveryAddressId,
          round: listing.currentRound,
        },
      });
      // KALEM modda kalem teklifleri hemen-al fiyatlarıyla yenilenir.
      if (isKalem) {
        await tx.listingBidItem.deleteMany({ where: { bidId: b.id } });
        await tx.listingBidItem.createMany({
          data: buyItems.map((bi) => ({
            bidId: b.id,
            itemId: bi.itemId,
            unitPrice: bi.unitPrice,
          })),
        });
      }
      return b;
    });
    this.realtime?.pingListing(listingId, [listing.companyId]);
    return { id: bid.id, amount: bid.amount.toString(), isBuyNow: true };
  }

  /**
   * Kazandır — ilan sahibi bir teklifi seçer → Sipariş oluşur (satıcı→alıcı
   * normalleşir), ilan AWARDED, kazanan WON, diğerleri LOST.
   * ALIM ilanı: satıcı=kazanan teklifçi, alıcı=ilan sahibi.
   * SATIS ilanı: satıcı=ilan sahibi, alıcı=kazanan teklifçi.
   */
  async award(
    user: AuthenticatedCompanyUser,
    listingId: string,
    bidId: string,
    approvalNote?: string,
  ) {
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
    if (
      !user.roles.includes(CompanyRole.SAHIP) &&
      !user.roles.includes(neededRole)
    ) {
      throw new ForbiddenException("Kazandırma için yetkiniz yok");
    }

    const bid = await this.prisma.listingBid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        listingId: true,
        bidderCompanyId: true,
        amount: true,
        currency: true,
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
    // Onay eşiği TRY bazında olduğundan (conditionMinAmount) tutarı TRY'ye
    // normalize et — aksi halde yabancı para teklif (ör. 50k USD) düşük ham
    // sayıyla eşiği atlayıp onay adımını baypas ederdi (awardByItem ile simetri).
    const awardAmountTry = (
      await this.toTryAmount(bid.amount, bid.currency)
    ).toNumber();
    const res = await this.approvals.requestApproval(user, {
      listingId,
      type: "LISTING_AWARD",
      listingType: listing.type,
      amount: awardAmountTry,
      currency: "TRY",
      payload: { kind: "full", bidId },
      initiatorNote: approvalNote,
    });
    if (!res.approved) {
      // Koşullu geçiş: yalnız hâlâ OPEN/CLOSED ise askıya al. Eşzamanlı başka bir
      // kazandırma bu arada AWARDED yaptıysa (count=0) üzerine yazma.
      const moved = await this.prisma.listing.updateMany({
        where: { id: listingId, status: { in: ["OPEN", "CLOSED"] } },
        data: { status: "IN_AWARD_APPROVAL" },
      });
      if (moved.count !== 1) {
        throw new ConflictException(
          "İlan durumu değişti; kazandırmayı tekrar deneyin",
        );
      }
      return { pendingApproval: true as const };
    }
    return this.runFullAward(listingId, bidId);
  }

  /** Tam kazandırmayı uygula — sipariş oluştur, WON/LOST, AWARDED. */
  private async runFullAward(listingId: string, bidId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        title: true,
        number: true,
        deliveryAddressId: true,
        paymentTiming: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    // Kaybedecek teklif sahiplerini kazandırma ÖNCESİ yakala (tx onları LOST'a
    // çevirecek) → sonuç sonrası "kazanamadınız" bildirimi için.
    const losingBidderIds = [
      ...new Set(
        (
          await this.prisma.listingBid.findMany({
            where: { listingId, status: "SUBMITTED", id: { not: bidId } },
            select: { bidderCompanyId: true },
          })
        ).map((b) => b.bidderCompanyId),
      ),
    ];
    const bid = await this.prisma.listingBid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        listingId: true,
        status: true,
        bidderCompanyId: true,
        amount: true,
        currency: true,
        deliveryAddressId: true,
        items: { select: { itemId: true, unitPrice: true } },
      },
    });
    if (!bid || bid.listingId !== listingId) {
      // Savunma derinliği: payload sunucu-üretimi ama yanlış bidId yanlış
      // taraflarla sipariş yazmasın.
      throw new BadRequestException("Geçersiz teklif");
    }
    // Onay penceresi güvencesi: kazandırma anında teklif hâlâ SUBMITTED olmalı
    // (geri çekilmiş/elenmiş teklife sipariş yazılmaz).
    if (bid.status !== "SUBMITTED") {
      throw new BadRequestException(
        "Teklif artık geçerli değil (geri çekilmiş veya elenmiş) — kazandırılamaz",
      );
    }

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
    const awardParties = [sellerCompanyId, buyerCompanyId];

    // Teslimat adresi: ALIM'da ilanın adresi (alıcı = ilan sahibi),
    // SATIS'ta kazanan teklifin adresi (alıcı = teklifçi).
    const deliveryAddress = await this.orderDeliverySnapshot(
      listing.type === "ALIM"
        ? listing.deliveryAddressId
        : bid.deliveryAddressId,
    );

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
          currency: bid.currency, // sipariş tutarı teklifin biriminde
          // Ödeme zamanlaması ilandan snapshot'lanır — aksi halde varsayılan
          // AFTER_DELIVERY olur ve teslim öncesi (BEFORE_DELIVERY) ilanlarda
          // alıcı ön ödemeyi kaydedemez, satıcıdan teminat da istenmezdi.
          paymentTiming: listing.paymentTiming,
          status: "PENDING", // satıcı onayı bekler (accept/reject)
          deliveryAddress,
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

    // C8: sipariş atomik oluştu. Bundan sonraki bildirim/realtime BEST-EFFORT —
    // hatası kazandırmayı geri almamalı. Aksi halde onay motorunun (decide)
    // fail-closed rollback'i tetiklenip, sipariş zaten dururken onayı yeniden
    // PENDING'e açar ve sonsuz "tekrar deneyin" döngüsü oluşurdu.
    try {
      const wonPortal = this.bidderPortal(listing.type);
      const recipient = await this.companyRecipient(
        bid.bidderCompanyId,
        wonPortal,
      );
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
      await this.notifications.pushToCompany(bid.bidderCompanyId, {
        type: "bid_awarded",
        portal: wonPortal,
        title: "Teklifiniz kazandı 🎉",
        body: `Bir ihalede teklifiniz kazandı ve ${order.number} numaralı sipariş oluştu.`,
        ctaLabel: "Siparişi Gör",
        ctaUrl: `${this.webUrl()}/company/siparis/${order.id}`,
      });
      // Kaybeden teklif sahiplerine "ihale sonuçlandı" bildirimi (teklifçi
      // portalı, bidElimination tercihine bağlı — eleme bildirimini kapatan
      // bunu da almaz).
      if (losingBidderIds.length > 0) {
        const lostUrl = `${this.webUrl()}/company/ilan/${listingId}`;
        const lostBody = `"${listing.title}" (${listing.number ?? "—"}) ihalesi sonuçlandı; bu turda teklifiniz kazanmadı.`;
        const lostRecipients = await this.companyRecipients(
          losingBidderIds,
          wonPortal,
        );
        for (const cid of losingBidderIds) {
          const r = lostRecipients.get(cid);
          if (!r) continue;
          this.notify(
            r,
            {
              subject: "İhale sonuçlandı",
              heading: "İhale sonuçlandı",
              paragraphs: [
                "Merhaba,",
                `${lostBody} Yeni fırsatlar için Rothern'i takip edebilirsiniz.`,
              ],
              ctaLabel: "İhaleyi Gör",
              ctaUrl: lostUrl,
            },
            { type: "bid_lost", id: listingId },
          );
        }
        await this.notifications.pushToCompanies(losingBidderIds, {
          type: "bid_lost",
          portal: wonPortal,
          title: "İhale sonuçlandı",
          body: lostBody,
          ctaLabel: "İhaleyi Gör",
          ctaUrl: lostUrl,
          listingId,
        });
      }
      this.realtime?.pingListing(listingId, awardParties);
      this.realtime?.pingOrder(order.id, awardParties);
    } catch (err) {
      this.logger.warn(
        `Kazandırma sonrası bildirim başarısız (sipariş ${order.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
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
    approvalNote?: string,
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
    // Kalem-bazlı kazandırma her iki yönde: ALIM'da kalemler farklı satıcılara,
    // SATIS'ta farklı alıcılara verilebilir (rol, tam kazandırmayla aynı).
    const neededRole =
      listing.type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;
    if (
      !user.roles.includes(CompanyRole.SAHIP) &&
      !user.roles.includes(neededRole)
    ) {
      throw new ForbiddenException("Kazandırma için yetkiniz yok");
    }

    // Belge zorunluysa her kazanan teklifin en az 1 belgesi olmalı (tam-kazandırma
    // ile aynı kural — item-award baypasını kapatır).
    if (listing.requireBidDocument) {
      const winningBidIds = [...new Set(itemAwards.map((a) => a.bidId))];
      // Belge sayımından ÖNCE tekliflerin BU ilana ait + SUBMITTED olduğunu
      // doğrula — aksi halde yabancı bidId ile "belge var/yok" 1-bit oracle
      // sızardı (buildItemGroups sonradan da doğrular; burada erken kapatılır).
      const validBids = await this.prisma.listingBid.count({
        where: { id: { in: winningBidIds }, listingId, status: "SUBMITTED" },
      });
      if (validBids !== winningBidIds.length) {
        throw new BadRequestException("Geçersiz teklif");
      }
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
      // total TRY'ye normalize edildi (itemAwardTotal) — onay eşiği TRY bazında.
      amount: total,
      currency: "TRY",
      payload: { kind: "by-item", itemAwards },
      initiatorNote: approvalNote,
    });
    if (!res.approved) {
      const moved = await this.prisma.listing.updateMany({
        where: { id: listingId, status: { in: ["OPEN", "CLOSED"] } },
        data: { status: "IN_AWARD_APPROVAL" },
      });
      if (moved.count !== 1) {
        throw new ConflictException(
          "İlan durumu değişti; kazandırmayı tekrar deneyin",
        );
      }
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
        currency: true,
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
        currency: Currency; // teklifçinin birimi (firma başına tek teklif)
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
        g = {
          orderItems: [],
          amount: new Prisma.Decimal(0),
          currency: bid.currency,
          bidIds: new Set(),
        };
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

  /** Tutarı TRY'ye çevir (onay eşiği TRY bazında kıyaslanır). Kur alınamazsa ham. */
  private async toTryAmount(
    amount: Prisma.Decimal | number,
    currency: string,
  ): Promise<Prisma.Decimal> {
    const dec = new Prisma.Decimal(amount);
    if (currency === "TRY") return dec;
    const rate = await this.exchangeRates
      .getCurrentRate(currency as never)
      .catch(() => null);
    return rate ? dec.mul(rate) : dec;
  }

  /**
   * Onay yönlendirmesi için kalem-bazlı kazandırmanın TOPLAM değeri — her grup
   * kendi biriminde olduğundan TRY'ye çevrilip toplanır (karışık para birimli
   * kazandırmada ham USD+TRY toplamı anlamsız olurdu; eşik yanlış yönlenirdi).
   */
  private async itemAwardTotal(
    listingId: string,
    itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[],
  ): Promise<number> {
    const { groups } = await this.buildItemGroups(listingId, itemAwards);
    let total = new Prisma.Decimal(0);
    for (const g of groups.values()) {
      total = total.plus(await this.toTryAmount(g.amount, g.currency));
    }
    return total.toNumber();
  }

  /** Kalem-bazlı kazandırmayı uygula — kazanan firma başına sipariş. */
  private async runItemAward(
    listingId: string,
    itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[],
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        deliveryAddressId: true,
        paymentTiming: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    const { groups, itemQty } = await this.buildItemGroups(
      listingId,
      itemAwards,
    );
    const groupArr = [...groups.entries()];
    const numbers = await this.nextOrderNumbers(groupArr.length);
    const winningBidIds = [...new Set(itemAwards.map((a) => a.bidId))];

    // Teslim adresi: ALIM'da ALICI = ilan sahibi → ilanın adresi (tek).
    // SATIS'ta ALICI = teklifçi → her grubun teklif adresi (firma başına).
    const isAlim = listing.type === "ALIM";
    const alimDelivery = isAlim
      ? await this.orderDeliverySnapshot(listing.deliveryAddressId)
      : undefined;
    // SATIS: her kazanan firmanın teslim adresi snapshot'ı (tx öncesi hazırlanır).
    const deliveryByCompany = new Map<
      string,
      Awaited<ReturnType<typeof this.orderDeliverySnapshot>>
    >();
    if (!isAlim) {
      const winBids = await this.prisma.listingBid.findMany({
        where: { id: { in: winningBidIds } },
        select: { bidderCompanyId: true, deliveryAddressId: true },
      });
      for (const wb of winBids) {
        deliveryByCompany.set(
          wb.bidderCompanyId,
          await this.orderDeliverySnapshot(wb.deliveryAddressId),
        );
      }
    }

    // Kısmi kazanım tespiti: teklifin fiyatladığı kalem sayısı > kazandığı
    // kalem sayısı ise AWARDED_PARTIAL (satıcı "Kısmen Kazandın" görür).
    const wonCountByBid = new Map<string, number>();
    for (const a of itemAwards) {
      wonCountByBid.set(a.bidId, (wonCountByBid.get(a.bidId) ?? 0) + 1);
    }
    const pricedCounts = await this.prisma.listingBidItem.groupBy({
      by: ["bidId"],
      where: { bidId: { in: winningBidIds } },
      _count: { _all: true },
    });
    const pricedByBid = new Map(
      pricedCounts.map((p) => [p.bidId, p._count._all] as const),
    );

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
      // Tam kazanan → WON; fiyatladığından azını kazanan → AWARDED_PARTIAL.
      const fullWinners = winningBidIds.filter(
        (bid) =>
          (wonCountByBid.get(bid) ?? 0) >= (pricedByBid.get(bid) ?? Infinity),
      );
      const partialWinners = winningBidIds.filter(
        (bid) => !fullWinners.includes(bid),
      );
      if (fullWinners.length > 0) {
        await tx.listingBid.updateMany({
          where: { listingId, id: { in: fullWinners }, status: "SUBMITTED" },
          data: { status: "WON" },
        });
      }
      if (partialWinners.length > 0) {
        await tx.listingBid.updateMany({
          where: { listingId, id: { in: partialWinners }, status: "SUBMITTED" },
          data: { status: "AWARDED_PARTIAL" },
        });
      }
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
        const [bidderCompanyId, g] = groupArr[i]!;
        const o = await tx.companyOrder.create({
          data: {
            number: numbers[i],
            listingId,
            // ALIM: kazanan teklifçi SATICI, ilan sahibi ALICI — SATIS'ta ters.
            sellerCompanyId: isAlim ? bidderCompanyId : listing.companyId,
            buyerCompanyId: isAlim ? listing.companyId : bidderCompanyId,
            amount: g.amount,
            currency: g.currency, // sipariş tutarı teklifin biriminde
            paymentTiming: listing.paymentTiming,
            status: "PENDING", // satıcı onayı bekler (accept/reject)
            // ALIM: ilan adresi; SATIS: bu grubun teklifçisinin adresi.
            deliveryAddress: isAlim
              ? alimDelivery
              : deliveryByCompany.get(bidderCompanyId),
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

    // C8: siparişler atomik oluştu. Sonraki bildirim/realtime BEST-EFFORT —
    // hatası kazandırmayı geri almamalı (decide rollback → sonsuz döngü riski).
    try {
      // Kazanan her firmaya (teklifçi) bildirim — tek seferde topla (N+1 yerine).
      const itemWonPortal = this.bidderPortal(listing.type);
      const recipients = await this.companyRecipients(
        groupArr.map(([bidderCompanyId]) => bidderCompanyId),
        itemWonPortal,
      );
      for (let i = 0; i < groupArr.length; i++) {
        const [bidderCompanyId] = groupArr[i]!;
        const o = created[i];
        const recipient = recipients.get(bidderCompanyId);
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
        // In-app: kazanan teklifçiye sipariş bildirimi.
        if (o) {
          await this.notifications.pushToCompany(bidderCompanyId, {
            type: "bid_awarded",
            portal: itemWonPortal,
            title: "Teklifiniz kazandı 🎉",
            body: `Bir ihalede teklifiniz kazandı ve ${o.number} numaralı sipariş oluştu.`,
            ctaLabel: "Siparişi Gör",
            ctaUrl: `${this.webUrl()}/company/siparis/${o.id}`,
          });
        }
      }
      this.realtime?.pingListing(listingId, [
        listing.companyId,
        ...groupArr.map(([bidderCompanyId]) => bidderCompanyId),
      ]);
      for (const o of created) {
        this.realtime?.pingOrder(o.id, [listing.companyId]);
      }
    } catch (err) {
      this.logger.warn(
        `Kalem-bazlı kazandırma sonrası bildirim başarısız (${listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
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
    // Yalnız hâlâ onay-bekleyen ilanı kapat. İlan bu arada başka bir istekle
    // AWARDED olduysa (sipariş var) CLOSED'a düşürme — aksi halde sahibi
    // yeniden kazandırıp ikinci sipariş üretebilirdi.
    await this.prisma.listing.updateMany({
      where: { id: payload.listingId, status: "IN_AWARD_APPROVAL" },
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
    this.assertPaidForNewListingWork(user, "Yeni tur açmak");
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        status: true,
        currentRound: true,
        primaryCurrency: true,
        autoExtendOnLateBid: true,
        autoExtendThresholdMin: true,
        autoExtendByMinutes: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi yeni tur açabilir");
    }
    if (!["OPEN", "CLOSED", "CLOSED_NO_AWARD"].includes(listing.status)) {
      throw new BadRequestException(
        "Yeni tur yalnızca açık veya kapanmış ilanda açılabilir",
      );
    }
    const isAuction = dto.type === "ENGLISH_AUCTION";
    if (isAuction && !((dto.priceDecrementValue ?? 0) > 0)) {
      throw new BadRequestException(
        listing.type === "SATIS"
          ? "Açık artırma için fiyat artış adımı zorunlu"
          : "Açık eksiltme için fiyat azaltma değeri zorunlu",
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
      // ÖNEMLİ: taşınan teklifin `round`'u YENİ tura yazılır — yoksa 3. tur
      // geçişinde önceki turların filtresi bu teklifleri ıskalar (bayat
      // SUBMITTED teklif snapshot'a girmez, NONE'da LOST'a çekilmez, hatta
      // kazanabilirdi).
      const newRound = listing.currentRound + 1;
      if (dto.carryBids === "AUTO") {
        // Açık eksiltmeye geçişte auction tüm para mantığını HAM tutarla yürütür
        // (best/monotonluk/sıralama). Primary-dışı birimdeki teklifler karışık
        // kıyası bozacağından SUBMITTED taşınmaz; taslağa çekilir (tedarikçi
        // primary birimde yeniden verir). RFQ turunda böyle bir kısıt yok.
        // Revive edilen (SUBMITTED/DRAFT) teklifin bayat eleme damgası temizlenir
        // — aksi halde önceki turda ELENEN teklif yeni turda "elendi" metadata'sıyla
        // diriliyordu (çelişki; placeBid resubmit'te de aynı temizlik yapılır).
        if (isAuction) {
          await tx.listingBid.updateMany({
            where: { ...priorWhere, currency: { not: listing.primaryCurrency } },
            data: {
              status: "DRAFT",
              round: newRound,
              eliminationReason: null,
              eliminatedAt: null,
            },
          });
          await tx.listingBid.updateMany({
            where: { ...priorWhere, currency: listing.primaryCurrency },
            data: {
              status: "SUBMITTED",
              round: newRound,
              eliminationReason: null,
              eliminatedAt: null,
            },
          });
        } else {
          await tx.listingBid.updateMany({
            where: priorWhere,
            data: {
              status: "SUBMITTED",
              round: newRound,
              eliminationReason: null,
              eliminatedAt: null,
            },
          });
        }
      } else if (dto.carryBids === "LAZY") {
        await tx.listingBid.updateMany({
          where: priorWhere,
          data: {
            status: "DRAFT",
            round: newRound,
            eliminationReason: null,
            eliminatedAt: null,
          },
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
          // Açık eksiltme tek para birimi (create/update ile aynı kural) —
          // aksi halde auction ham-tutar kıyası karışık birimle bozulurdu.
          // RFQ turunda mevcut ayar korunur (undefined = değiştirme).
          allowedCurrencies: isAuction
            ? [listing.primaryCurrency as Currency]
            : undefined,
          isSealedBid: isAuction,
          bidVisibility: isAuction
            ? (dto.bidVisibility as ListingBidVisibility)
            : "OWN_ONLY",
          priceDecrementType: isAuction ? dto.priceDecrementType : null,
          priceDecrementValue: isAuction ? dto.priceDecrementValue : null,
          priceDecrementBasis: isAuction ? dto.priceDecrementBasis : null,
          // dto boşsa ilanın MEVCUT ayarı korunur (create'te false default'ken
          // yeni turun sessizce true'ya dönmesi tutarsızdı).
          autoExtendOnLateBid: isAuction
            ? (dto.autoExtendOnLateBid ?? listing.autoExtendOnLateBid)
            : false,
          autoExtendThresholdMin: isAuction
            ? (dto.autoExtendThresholdMin ??
              listing.autoExtendThresholdMin ??
              2)
            : null,
          autoExtendByMinutes: isAuction
            ? (dto.autoExtendByMinutes ?? listing.autoExtendByMinutes ?? 2)
            : null,
        },
      });
    });

    void this.notifyListingInvitees(listingId, "newRound");
    this.realtime?.pingListing(listingId);
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
    rothernIds: string[],
  ) {
    this.assertPaidForNewListingWork(user, "İhaleye yeni tedarikçi davet etmek");
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        status: true,
        format: true,
        closesAt: true,
        type: true,
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
    const codes = (rothernIds ?? [])
      .map((c) => normalizeShortCode(c))
      .filter((c) => validateShortCode(c));
    const targets = await this.prisma.company.findMany({
      where: { rothernId: { in: codes } },
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
        const addPortal = this.bidderPortal(listing.type);
        const addRecipients = await this.companyRecipients(toAdd, addPortal);
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
        await this.notifications.pushToCompanies(toAdd, {
          type: "listing_invitation",
          portal: addPortal,
          title: "İhale daveti",
          body: `"${title?.title ?? "İhale"}" (${title?.number ?? "—"}) ihalesine davet edildiniz.`,
          ctaLabel: "İhaleyi Gör",
          ctaUrl: url,
          listingId,
        });
      }
    }
    return { added: toAdd.length, skipped: wanted.length - toAdd.length };
  }

  /**
   * İngiliz Usulü tur geçmişi — sahip görür. Tur içinde teklifler EN İYİDEN
   * kötüye: ALIM (eksiltme) artan, SATIS (artırma) azalan — UI ilk satırı
   * "en iyi" vurgular.
   */
  async roundHistory(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, companyId: true, type: true },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    const snaps = await this.prisma.listingRoundSnapshot.findMany({
      where: { listingId },
      orderBy: [
        { round: "desc" },
        { amount: listing.type === "SATIS" ? "desc" : "asc" },
      ],
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
    const info = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { title: true, number: true, type: true },
    });
    const elimPortal = info ? this.bidderPortal(info.type) : undefined;
    const recipient = await this.companyRecipient(
      bid.bidderCompanyId,
      elimPortal,
    );
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
    await this.notifications.pushToCompany(bid.bidderCompanyId, {
      type: "bid_eliminated",
      portal: elimPortal,
      title: "Teklifiniz değerlendirme dışı kaldı",
      body: `"${info?.title ?? "İhale"}" (${info?.number ?? "—"}) ihalesinde teklifiniz bu turda elendi. Dilerseniz güncelleyip yeniden teklif verebilirsiniz.`,
      ctaLabel: "İhaleyi Gör",
      ctaUrl: `${this.webUrl()}/company/ilan/${listingId}`,
      listingId,
    });
    this.realtime?.pingListing(listingId, [bid.bidderCompanyId]);
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
    // Katılımcılara haber ver (UI "gerekçe iletilir" vaadi artık gerçek).
    void this.notifyListingParticipants(listingId, {
      subject: "İhale iptal edildi",
      heading: "İhale iptal edildi",
      body: (label) =>
        `${label} ihalesi ilan sahibi tarafından iptal edildi.${
          reason?.trim() ? ` Gerekçe: ${reason.trim()}` : ""
        }`,
      type: "listing_closed",
    }).catch((err) =>
      this.logger.error(
        `İptal bildirimi gönderilemedi (${listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    return { ok: true };
  }

  /**
   * İptal / kazansız-kapatma bildirimi — davetliler + teklif verenler birleşik
   * kümesine e-posta + in-app.
   */
  private async notifyListingParticipants(
    listingId: string,
    opts: {
      subject: string;
      heading: string;
      body: (label: string) => string;
      type: string;
    },
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, number: true, type: true },
    });
    if (!listing) return;
    const label = `"${listing.title}" (${listing.number ?? "—"})`;
    const [invs, bids] = await Promise.all([
      this.prisma.listingInvitation.findMany({
        where: { listingId },
        select: { invitedCompanyId: true },
      }),
      this.prisma.listingBid.findMany({
        where: { listingId },
        select: { bidderCompanyId: true },
      }),
    ]);
    const companyIds = [
      ...new Set([
        ...invs.map((iv) => iv.invitedCompanyId),
        ...bids.map((b) => b.bidderCompanyId),
      ]),
    ];
    if (companyIds.length === 0) return;
    const url = `${this.webUrl()}/company/ilan/${listingId}`;
    // Katılımcılar teklifçidir → teklifçi portalı.
    const partPortal = this.bidderPortal(listing.type);
    const recipients = await this.companyRecipients(companyIds, partPortal);
    for (const cid of companyIds) {
      const r = recipients.get(cid);
      if (!r) continue;
      this.notify(
        r,
        {
          subject: opts.subject,
          heading: opts.heading,
          paragraphs: ["Merhaba,", opts.body(label)],
          ctaLabel: "İhaleyi Gör",
          ctaUrl: url,
        },
        { type: opts.type, id: listingId },
      );
    }
    await this.notifications.pushToCompanies(companyIds, {
      type: opts.type,
      portal: partPortal,
      title: opts.heading,
      body: opts.body(label),
      ctaLabel: "İhaleyi Gör",
      ctaUrl: url,
      listingId,
    });
  }

  /** Sahip ihaleyi belirtilen kapanışından önce erken kapatır (OPEN → CLOSED). */
  async closeBiddingEarly(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.ownerOpenListing(user, listingId);
    await this.prisma.listing.update({
      where: { id: listing.id },
      data: { status: "CLOSED", closesAt: new Date() },
    });
    void this.notifyListingClosed(listing.id).catch((err) =>
      this.logger.error(
        `Kapanış bildirimi gönderilemedi (${listing.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
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
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new BadRequestException("Kapanış tarihi gelecekte olmalı");
    }
    const extra = await this.prisma.listing.findUnique({
      where: { id: listing.id },
      select: { bidsOpenAt: true, format: true, closesAt: true },
    });
    // Kapanış açılıştan önce olamaz (yayındaki ilanın bütünlüğü).
    if (extra?.bidsOpenAt && date.getTime() <= extra.bidsOpenAt.getTime()) {
      throw new BadRequestException(
        "Kapanış tarihi açılış tarihinden sonra olmalı",
      );
    }
    // İngiliz usulünde kapanışa <2 dk kala değişiklik yok — davet ekleme
    // (addInvitations) ile aynı snipe koruması; son saniye kural değişimi
    // yarıştaki teklifçileri mağdur eder.
    if (
      extra?.format === "ENGLISH_AUCTION" &&
      extra.closesAt &&
      extra.closesAt.getTime() - Date.now() < 2 * 60_000
    ) {
      throw new BadRequestException(
        "Kapanışa 2 dakikadan az kaldı — açık eksiltme/artırmada kapanış saati artık değiştirilemez",
      );
    }
    // Uzatma (yeni kapanış daha ileri) → kapanış-hatırlatması bayrağını sıfırla
    // ki yeni pencere için tekrar gönderilebilsin (placeBid auto-extend de böyle yapar).
    const isExtension =
      extra?.closesAt != null && date.getTime() > extra.closesAt.getTime();
    await this.prisma.listing.update({
      where: { id: listing.id },
      data: {
        closesAt: date,
        ...(isExtension ? { closingReminderSentAt: null } : {}),
      },
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
    await this.prisma.$transaction(async (tx) => {
      // Koşullu: eşzamanlı runFullAward bu arada AWARDED + sipariş yazdıysa
      // (count=0) üzerine yazma — sipariş dururken "kazanansız kapandı" olmasın.
      const closed = await tx.listing.updateMany({
        where: { id: listing.id, status: { in: ["OPEN", "CLOSED"] } },
        data: { status: "CLOSED_NO_AWARD", cancelReason: reason?.trim() || null },
      });
      if (closed.count !== 1) {
        throw new ConflictException(
          "İlan durumu değişti; kazanansız kapatma uygulanamadı",
        );
      }
      await tx.listingBid.updateMany({
        where: { listingId, status: "SUBMITTED" },
        data: { status: "LOST" },
      });
    });
    void this.notifyListingParticipants(listingId, {
      subject: "İhale kazanan olmadan kapatıldı",
      heading: "İhale sonuçlanmadan kapatıldı",
      body: (label) =>
        `${label} ihalesi kazanan seçilmeden kapatıldı.${
          reason?.trim() ? ` Gerekçe: ${reason.trim()}` : ""
        }`,
      type: "listing_closed",
    }).catch((err) =>
      this.logger.error(
        `Kapatma bildirimi gönderilemedi (${listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
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
  // NOT: withdrawBid (teklif geri çekme) kaldırıldı — gönderilmiş teklif geri
  // çekilemez. Tedarikçi değişiklik isterse alıcıyla iletişime geçer; alıcı
  // teklifi elerse (LOST) tedarikçi yeniden teklif verebilir (version++).
  // WITHDRAWN enum + eski-kayıt guard'ları (yeniden verilemez / kazandırılamaz)
  // legacy kayıtlar için korunur; yeni WITHDRAWN üretilmez.

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
      priceScope: ListingPriceScope | null;
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
      priceScope: l.priceScope,
      // Maskeli önizlemede fiyat bilgisi sızmaz (taban/hemen-al).
      minPrice: masked ? null : (l.minPrice?.toString() ?? null),
      buyNowPrice: masked ? null : (l.buyNowPrice?.toString() ?? null),
      visibility: l.visibility,
      title: l.title,
      description: masked ? null : l.description,
      status: l.status,
      closesAt: l.closesAt,
      cancelReason: l.cancelReason,
      createdAt: l.createdAt,
      owner: masked ? null : { name: l.company.name },
      categoryIds: l.categoryIds,
      keywords: masked ? [] : l.keywords,
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
        // Bağlantı, onu KURAN (davet eden) taraf PAKET kaldığı sürece geçerli —
        // hem PREMIUM hem INVITE için (ADMIN hariç: platform kararı, hep açık).
        // Ödemeyi bırakınca kendi başlattığın bağlantılar düşer → bir kez premium
        // olup bol davet atarak kalıcı "bedava ihale penceresi" kurulamaz.
        (r) => r.origin === "ADMIN" || r.inviter.tier === "PAKET",
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
