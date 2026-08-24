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
  type BidDeliveryTime,
  type ListingDeliveryTerm,
  type ListingFormat,
  type ListingPaymentCategory,
  type ListingPaymentTiming,
  type LcType,
  type ListingQuestionAnswerType,
  type ListingVisibility,
} from "@rothern/db";
import { OnEvent } from "@nestjs/event-emitter";
import { derivePaymentTiming, DOMESTIC_ONLY_PAYMENT_CATEGORIES, INTERNATIONAL_ONLY_PAYMENT_CATEGORIES, isValidCountryCode, normalizeShortCode, tierAtLeast, validateShortCode } from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { bidderOpRole } from "../bidder-op-role";
import {
  LISTING_MANAGE_DENY_MESSAGE,
  listingManageDenial,
} from "../listing-manage-access";
import { runTenantTx } from "../../../common/prisma/tenant-tx";
import {
  MAX_MONEY,
  MAX_LISTING_HORIZON_MS,
} from "../../../common/constants/money";
import {
  effectiveTier,
  anyPackageWhere,
} from "../../../common/company/effective-tier";
import {
  isListingVisibleToViewer,
  listingBidEligibility,
} from "../../../common/company/listing-visibility";
import {
  PRICED_ITEM_WHERE,
  bidCoversAllItems,
  lineTotal,
  sumLineTotals,
  OWNER_VISIBLE_BID_STATUSES,
  roundMoney,
  sumLineTotalsInBase,
} from "../../../common/company/bid-items";
import {
  isListingClosedAt,
  bidValidUntilMs,
} from "../../../common/company/listing-timing";
import { AuditService } from "../../audit/audit.service";
import { CompanyApprovalsService } from "../../company-approvals/company-approvals.service";
import { CompanyBlocksService } from "../../company-blocks/company-blocks.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { hasCompanyPermission } from "../../company-auth/permissions/company-permissions.constants";
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
import { resolveWebUrl } from "../../../common/config/web-url";
import { hasFullReadContext } from "../../../common/company/full-read-context";
import { reportToSentry } from "../../../instrument";
import {
  getTenantStore,
  runWithTenantContext,
} from "../../../common/tenant/tenant-context";

/** Bildirim alıcısı — e-posta/isim + (varsa) kullanıcı bildirim tercihleri. */
type Recipient = {
  email: string;
  name: string;
  prefs?: Record<string, boolean> | null;
};

/**
 * Kazandırma audit'i aktörü. Doğrudan yolda (award/awardByItem) actorId = çağıran;
 * onay-yolunda (onAwardApproved) actorId = kazandırmayı BAŞLATAN (initiator),
 * approverUserId = son adımı ONAYLAYAN — insider incelemesi için ikisi ayrılır.
 */
type AwardActor = {
  actorId: string | null;
  actorEmail?: string | null;
  viaApproval: boolean;
  approverUserId?: string | null;
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
    private readonly audit: AuditService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}


  private webUrl(): string {
    return resolveWebUrl(this.config);
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
  async notifyListingClosed(listingId: string, opts?: { skipOwner?: boolean }) {
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

    // Davetliler + teklif verenler (PUBLIC ilanda davetsiz teklifçi olabilir)
    // birleşik kümesine kapanış bildirimi.
    const [invs, bids] = await this.inOwnerContext(listing.companyId, () =>
      Promise.all([
        this.prisma.listingInvitation.findMany({
          where: { listingId },
          select: { invitedCompanyId: true },
        }),
        this.prisma.listingBid.findMany({
          where: { listingId },
          select: { bidderCompanyId: true },
        }),
      ]),
    );
    const participantIds = [
      ...new Set([
        ...invs.map((iv) => iv.invitedCompanyId),
        ...bids.map((b) => b.bidderCompanyId),
      ]),
    ];
    const bidUrl = `${this.webUrl()}/company/ilan/${listingId}`;
    const closeRecipients = await this.companyRecipients(
      participantIds,
      bidderPortal,
    );
    for (const cid of participantIds) {
      const r = closeRecipients.get(cid);
      if (!r) continue;
      this.notify(
        r,
        {
          subject: "İhalede teklif alımı kapandı",
          heading: "İhale değerlendirme aşamasında",
          paragraphs: [
            "Merhaba,",
            `${label} ihalesinde teklif alımı kapandı; ihale değerlendirme aşamasına geçti. Sonuç açıklandığında bilgilendirileceksiniz.`,
          ],
          ctaLabel: "İhaleyi Gör",
          ctaUrl: bidUrl,
        },
        { type: "listing_closed", id: listingId },
      );
    }
    // In-app: davetli + teklifçilere kapanış.
    await this.notifications.pushToCompanies(
      participantIds,
      {
        type: "listing_closed",
        portal: bidderPortal,
        title: "İhale değerlendirme aşamasında",
        body: `${label} ihalesinde teklif alımı kapandı; ihale değerlendirme aşamasına geçti. Sonuç açıklandığında bilgilendirileceksiniz.`,
        ctaLabel: "İhaleyi Gör",
        ctaUrl: bidUrl,
        listingId,
      },
    );

    // Sahibe "karar zamanı" bildirimi — sahip kapanışı kendisi tetiklediyse
    // (Değerlendirmeye Al) gereksiz, atlanır.
    if (opts?.skipOwner) return;
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
        // INV-TIER-1: efektif PAKET (süresi-dolmuş lazy PAKET'e duyuru gitmesin).
        ...anyPackageWhere(),
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
  /**
   * Yayın duyurusu — İDEMPOTENT + embargo-farkında. Açılış tarihi (bidsOpenAt)
   * gelecekteyse HİÇBİR ŞEY yapmaz (openNotifiedAt null kalır; açılış cron'u
   * tam açılışta yeniden çağırır). Değilse davetli bildirimleri + (ilk turda)
   * kategori duyurusunu gönderir ve openNotifiedAt damgalar — ikinci çağrı
   * sessizce döner, çift bildirim gitmez.
   */
  async announceListingOpen(
    listingId: string,
    kind: "invitation" | "newRound",
  ) {
    // Atomik claim (closeExpired/reminder ile aynı desen): koşulları sağlayan
    // İLK çağrı damgayı basar ve duyuruyu atar; yarışan ikinci çağrı (cron
    // overlap / publish+cron) count=0 alıp sessizce döner — çift bildirim yok.
    // Embargo (bidsOpenAt gelecekte) koşulu sağlamaz → damga basılmaz, cron
    // açılış anında yeniden dener.
    const claimed = await this.prisma.listing.updateMany({
      where: {
        id: listingId,
        status: "OPEN",
        openNotifiedAt: null,
        OR: [{ bidsOpenAt: null }, { bidsOpenAt: { lte: new Date() } }],
      },
      data: { openNotifiedAt: new Date() },
    });
    if (claimed.count !== 1) return;
    // Açık eksiltme kur damgası AÇILIŞ GÜNÜ kuruyla tazelenir — embargolu
    // (gelecek açılışlı) turu cron tam açılışta buradan geçirir; anında açılan
    // turda yayın günü zaten açılış günüdür (aynı gün → aynı kur, zararsız).
    // Kur alınamazsa açılış ENGELLENMEZ: tur oluşturulurkenki damga geçerli kalır.
    try {
      const l = await this.prisma.listing.findUnique({
        where: { id: listingId },
        select: {
          format: true,
          primaryCurrency: true,
          allowedCurrencies: true,
        },
      });
      if (l?.format === "ENGLISH_AUCTION") {
        const snap = await this.buildAuctionRateSnapshot(
          l.allowedCurrencies as Currency[],
          l.primaryCurrency as Currency,
        );
        await this.prisma.listing.update({
          where: { id: listingId },
          data: { auctionRateSnapshot: snap },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Açılış günü kur damgası tazelenemedi (${listingId}) — mevcut damga geçerli: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    // Fire-and-forget: reddi (DB flake vb.) UNHANDLED rejection'a düşmesin →
    // prod'da süreç çökme riski (kardeşi 563 gibi .catch — notifyListingInvitees
    // iç try/catch taşımaz, çağıran korur).
    void this.notifyListingInvitees(listingId, kind).catch((err) =>
      this.logger.warn(
        `İlan katılımcı bildirimi başarısız (${listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    if (kind === "invitation") {
      void this.notifyCategoryMatchedCompanies(listingId).catch((err) =>
        this.logger.warn(
          `Kategori eşleşme bildirimi başarısız (${listingId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    }
    // Embargolu ilan açılış anında görünür OLUR — listeler tazelensin.
    this.realtime?.pingListing(listingId);
  }

  async notifyListingInvitees(
    listingId: string,
    mode: "invitation" | "reminder" | "newRound",
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        title: true,
        number: true,
        type: true,
        companyId: true,
      },
    });
    if (!listing) return;
    // Davetliler teklifçidir → teklifçi portalı (ALIM→satış, SATIS→satınalma).
    const invitePortal = this.bidderPortal(listing.type);
    const invs = await this.inOwnerContext(listing.companyId, () =>
      this.prisma.listingInvitation.findMany({
        where: { listingId },
        select: { invitedCompanyId: true },
      }),
    );
    // Hatırlatma yalnızca HENÜZ TEKLİF VERMEMİŞ davetlilere gider (davet ise
    // herkese). Teklif vermiş firmaları çıkar.
    let targets = invs.map((iv) => iv.invitedCompanyId);
    if (mode === "reminder" || mode === "newRound") {
      const bidders = await this.inOwnerContext(listing.companyId, () =>
        this.prisma.listingBid.findMany({
          where: { listingId, status: "SUBMITTED" },
          select: { bidderCompanyId: true },
        }),
      );
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
      // Madde 23: SATIS ilanı SÜRESİZ açılabilir (kapanışsız). Cron
      // `closesAt <= now` filtresi null'ı hiç yakalamaz, isListingClosedAt
      // null'da "hiç kapanmaz" der — yaşam döngüsü sahibin manuel
      // kapatması/kazandırmasıyla biter. ALIM'da kapanış zorunlu kalır.
      if (dto.type === "SATIS") return;
      throw new BadRequestException("Kapanış tarihi zorunlu");
    }
    const close = new Date(dto.closesAt);
    if (Number.isNaN(close.getTime()) || close.getTime() <= Date.now()) {
      throw new BadRequestException("Kapanış tarihi gelecekte olmalı");
    }
    // Üst sınır: closesAt=9999 → auto-close cron hiç tetiklenmez (yaşam döngüsü
    // kırılır). En fazla now + 2 yıl. bidsOpenAt < closesAt zorunlu → transitif kapalı.
    if (close.getTime() > Date.now() + MAX_LISTING_HORIZON_MS) {
      throw new BadRequestException("Kapanış tarihi çok ileri (en fazla 2 yıl)");
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
   * Ödeme planını doğrula + normalize et (create/update ortak, Faz 2).
   * Zamanlama kullanıcıdan ALINMAZ — plandan türetilir (derivePaymentTiming).
   * Kategoriye ait olmayan alanlar sessizce sıfırlanır (bayat değer sızmasın).
   */
  private buildPaymentPlan(dto: CreateListingDto): {
    paymentCategory: ListingPaymentCategory;
    advancePercent: number | null;
    paymentDays: number | null;
    lcType: LcType | null;
    lcConfirmed: boolean;
    paymentNote: string | null;
    paymentTiming: ListingPaymentTiming;
    requireGuaranteeLetter: boolean;
  } {
    const category =
      (dto.paymentCategory as ListingPaymentCategory) ?? "OPEN_ACCOUNT";
    const note = dto.paymentNote?.trim() || null;
    const isInternational = dto.isInternational ?? false;

    // Dış-ticaret ödeme şekilleri (akreditif/vesaik/mal mukabili) yurtiçi
    // ilanda seçilemez — teslim-şekli kapısıyla simetrik (frontend filtreler,
    // backend otorite; kapsamı değişen update'te bayat kategori de yakalanır).
    if (
      !isInternational &&
      INTERNATIONAL_ONLY_PAYMENT_CATEGORIES.includes(category)
    ) {
      throw new BadRequestException(
        "Bu ödeme şekli yalnız uluslararası ilanlarda seçilebilir — yurtiçi ilanda peşin, vadeli, açık hesap, çek, senet veya özel kullanın",
      );
    }
    // Simetrik kapı (madde 20): açık hesap/çek/senet yalnız YURTİÇİ —
    // uluslararası ilanda peşin, vadeli, mal mukabili, akreditif, vesaik
    // mukabili veya özel kullanılır.
    if (
      isInternational &&
      DOMESTIC_ONLY_PAYMENT_CATEGORIES.includes(category)
    ) {
      throw new BadRequestException(
        "Bu ödeme şekli yalnız yurtiçi ilanlarda seçilebilir — uluslararası ilanda peşin, vadeli, mal mukabili, akreditif, vesaik mukabili veya özel kullanın",
      );
    }

    let advancePercent: number | null = null;
    let paymentDays: number | null = null;
    let lcType: LcType | null = null;

    switch (category) {
      case "ADVANCE": {
        // advancePercent ZORUNLU — eski `?? 100` sessiz tam-peşin varsayımı
        // kaldırıldı (yazma kapısı sıkı; kullanıcı yüzdeyi açıkça seçer). DTO
        // ayrıca 1-100 sınırlar. NOT: shared `advancePercentFor` runtime `?? 100`
        // backstop'u KORUNUR (fail-closed — stray/legacy null en katı kapıya düşer).
        if (dto.advancePercent == null) {
          throw new BadRequestException(
            "Peşin ödemede peşin yüzdesi (%1-100) zorunlu",
          );
        }
        advancePercent = dto.advancePercent;
        if (advancePercent < 100 && isInternational) {
          throw new BadRequestException(
            "Kısmi peşin ödeme yalnız yurtiçi ilanlarda seçilebilir",
          );
        }
        // Kısmi peşinde kalan tutarın vadesi OPSİYONEL (boş = teslimde/açık).
        paymentDays = advancePercent < 100 ? (dto.paymentDays ?? null) : null;
        break;
      }
      case "DEFERRED":
      case "CHEQUE":
      case "SENET": {
        if (!dto.paymentDays) {
          throw new BadRequestException(
            category === "CHEQUE"
              ? "Çek için vade gün sayısı zorunlu"
              : category === "SENET"
                ? "Senet için vade gün sayısı zorunlu"
                : "Vadeli ödeme için gün sayısı zorunlu",
          );
        }
        paymentDays = dto.paymentDays;
        break;
      }
      case "LETTER_OF_CREDIT": {
        lcType = (dto.lcType as LcType) ?? null;
        if (!lcType) {
          throw new BadRequestException(
            "Akreditif için alt tip (Sight/Usance) seçin",
          );
        }
        if (lcType === "USANCE") {
          if (!dto.paymentDays) {
            throw new BadRequestException(
              "Vadeli (Usance) akreditif için vade gün sayısı zorunlu",
            );
          }
          paymentDays = dto.paymentDays;
        }
        break;
      }
      case "CUSTOM": {
        if (!note) {
          throw new BadRequestException(
            "Özel ödeme şeklinde ödeme koşulu notu zorunlu",
          );
        }
        break;
      }
      case "MAL_MUKABILI": {
        // Mal mukabili: teslim alınca öde (AFTER_DELIVERY). Vade OPSİYONEL —
        // girilirse teslim+gün vade takibi (DUE_DATE_CATEGORIES), boşsa teslimde
        // muaccel (kısmi-peşin kalanı deseniyle aynı, opsiyonel gün).
        paymentDays = dto.paymentDays ?? null;
        break;
      }
      case "OPEN_ACCOUNT":
      case "CASH_AGAINST_DOCS":
        // Açık hesap / vesaik mukabili: ek zorunlu alan yok; banka/belge detayı
        // paymentNote'a. (Vesaik = belge karşılığı, teslim ÖNCESİ; mal mukabili
        // ile karıştırma.)
        break;
    }

    return {
      paymentCategory: category,
      advancePercent,
      paymentDays,
      lcType,
      lcConfirmed: category === "LETTER_OF_CREDIT" && (dto.lcConfirmed ?? false),
      paymentNote: note,
      paymentTiming: derivePaymentTiming(category),
      // Teminat şartı yalnız ALIM + PEŞİN'de anlamlı (LC'de garanti zaten
      // bankada; SATIS'ta kaldırıldı — madde 22). Diğer kombinasyonlarda
      // sessizce false'a normalize (bayat bayrak sızmasın).
      requireGuaranteeLetter:
        category === "ADVANCE" &&
        dto.type !== "SATIS" &&
        (dto.requireGuaranteeLetter ?? false),
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
    // Pazarlıkta minimum azaltma payı YOK (2026-07-13'te kaldırıldı — çıpa
    // etkisi; turda-tek-teklif kuralı sembolik indirimi zaten caydırıyor).
    // Çoklu para birimi DESTEKLİ: birimler-arası gösterim/sıralama açılış
    // günü TCMB kur damgasıyla (auctionRateSnapshot) yapılır — damga tur
    // açılışında buildAuctionRateSnapshot ile yazılır.
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
    if (!tierAtLeast(user.tier, "SILVER")) {
      throw new ForbiddenException(
        `${action} için Silver veya üzeri paket gerekir. Mevcut ihalelerinizi tamamlayabilirsiniz ancak yeni ilan işi başlatamazsınız.`,
      );
    }
  }

  /**
   * INV-KYC-1: para-taahhüdü doğuran aksiyonlar (teklif SUBMIT / kazandırma /
   * ilan yayınlama) firma KYC doğrulaması (VERIFIED) ister — belge incelemesi
   * yapılmamış firma bağlayıcı teklif/sipariş doğuramaz. Gezinme, keşif, davet
   * kabul, TASLAK kaydetme SERBEST (funnel kırılmaz). PENDING (belge yüklü ama
   * admin onayı bekliyor) YETMEZ: teklif bağlayıcı (INV-SM-2), PENDING teklifçi
   * kazanıp REJECTED olursa reddedilmiş karşı taraflı canlı sipariş kalırdı.
   * `assertPaidForNewListingWork` simetriği (ikisi de user objesinden okur).
   */
  private assertVerified(user: AuthenticatedCompanyUser, action: string) {
    if (user.companyVerificationStatus !== "VERIFIED") {
      throw new ForbiddenException(
        `Firma doğrulamanız tamamlanmadan ${action} — belgelerinizi Ayarlar → Doğrulama'dan yükleyip onaya gönderin.`,
      );
    }
  }

  async create(user: AuthenticatedCompanyUser, dto: CreateListingDto) {
    const type = dto.type as ListingType;
    this.validateListingDates(dto);

    if (!tierAtLeast(user.tier, "SILVER")) {
      throw new ForbiddenException(
        "İlan/ihale açmak için Silver veya üzeri paket gerekir.",
      );
    }
    // BK-A (kör-nokta denetimi): asDraft:false doğrudan status:OPEN üretir =
    // publishListing'in ürettiği aynı terminal durum → aynı KYC kapısı uygulanmalı.
    // Aksi halde doğrulanmamış PAKET firma create(asDraft:false) ile publishListing'in
    // assertVerified'ını atlayarak ilan yayınlar. Taslak SERBEST (INV-KYC-1 funnel).
    if (!dto.asDraft) {
      this.assertVerified(user, "ilan yayınlayamazsınız");
    }

    const neededRole =
      type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;

    // Faz R: SAHIP etikettir, işlem-rol muafiyeti YOK — Kurucu ilan açmak için
    // kendine SATIN_ALMACI/SATISCI rolü ekler.
    if (!user.roles.includes(neededRole)) {
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
          ? "Alım ilanı için format seçin (Teklif Toplama / Pazarlık)"
          : "Satış ilanı için format seçin (Teklif Toplama / Açık Artırma)",
      );
    }
    // İngiliz usulü doğrudan AÇILAMAZ — tek yol RFQ turu kapanınca "Yeni Tur"
    // ile aktarma (createNextRound): taban fiyat + katılımcılar RFQ'dan gelir,
    // soğuk-başlangıç eksiltme/artırma olmaz.
    if (dto.format === "ENGLISH_AUCTION") {
      throw new BadRequestException(
        type === "ALIM"
          ? "Pazarlık doğrudan açılamaz — ilanı teklif toplama olarak açın, 'Pazarlığa Geç' ile açık eksiltme turuna aktarın"
          : "Açık artırma doğrudan açılamaz — ilanı teklif toplama olarak açın, tur kapanınca 'Yeni Tur Oluştur' ile açık artırmaya aktarın",
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

    const listing = await runTenantTx(this.prisma, async (tx) => {
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
          showTargetToSuppliers: dto.showTargetToSuppliers ?? false,
          primaryCurrency: (dto.primaryCurrency as Currency) ?? "TRY",
          // Çoklu birim auction'da da serbest (kıyaslar açılış günü kur
          // damgasıyla çevrilir) — zaten doğrudan auction create kapalı.
          allowedCurrencies: (dto.allowedCurrencies as Currency[]) ?? [],
          // ── Wizard zenginleştirme ──
          bidsOpenAt: dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null,
          isSealedBid: dto.isSealedBid ?? true,
          isLogistics: dto.isLogistics ?? false,
          logistics: dto.logistics
            ? (dto.logistics as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          deliveryTerm: (dto.deliveryTerm as ListingDeliveryTerm) ?? null,
          // Ödeme planı — doğrulanmış + normalize; zamanlama plandan türetilir.
          ...this.buildPaymentPlan(dto),
          bidVisibility:
            (dto.bidVisibility as ListingBidVisibility) ?? "OWN_ONLY",
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
    // Doğrudan yayınlandıysa: davet + kategori duyurusu (embargo-farkında —
    // açılış gelecekteyse cron açılışta gönderir).
    if (!dto.asDraft) {
      void this.announceListingOpen(listing.id, "invitation").catch((err) =>
        this.logger.warn(
          `Yayın duyurusu başarısız (${listing.id}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    }
    return this.serialize(listing);
  }

  /**
   * İlanı düzenle (eski sistemdeki updateDraft kuralı): ilanı açan doğru-taraf
   * operatörü (ALIM→Satın Almacı, SATIS→Satışçı) veya firma sahibi; ilan
   * AÇIK/TASLAK ve henüz SUBMITTED teklif gelmemişken. İlk teklif gelince
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
      select: {
        id: true,
        companyId: true,
        status: true,
        type: true,
        format: true,
        createdById: true,
      },
    });
    if (!existing || existing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    this.assertListingManageRole(user, existing);
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
          ? "Alım ilanı için format seçin (Teklif Toplama / Pazarlık)"
          : "Satış ilanı için format seçin (Teklif Toplama / Açık Artırma)",
      );
    }
    // Düzenlemeyle İngiliz usulüne GEÇİLEMEZ (RFQ taslağı açıp edit'le
    // eksiltmeye çevirme = doğrudan-açma yasağının arka kapısı olurdu).
    // Tek dönüşüm yolu "Yeni Tur" (createNextRound). Ters yön (İngiliz→RFQ)
    // serbest — eski doğrudan-açılmış eksiltme taslakları kurtarılabilsin.
    if (
      dto.format === "ENGLISH_AUCTION" &&
      existing.format !== "ENGLISH_AUCTION"
    ) {
      throw new BadRequestException(
        "İhale formatı düzenlemeyle pazarlığa çevrilemez — 'Pazarlığa Geç' ile aktarın",
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

    // Açık eksiltme (legacy taslak) düzenleniyorsa kur damgası tazelenir —
    // izinli birimler değişmiş olabilir; kuru olmayan birim burada reddedilir.
    const updatedRateSnapshot =
      format === "ENGLISH_AUCTION"
        ? await this.buildAuctionRateSnapshot(
            (dto.allowedCurrencies as Currency[]) ?? [],
            (dto.primaryCurrency as Currency) ?? "TRY",
          )
        : null;

    const updated = await runTenantTx(this.prisma, async (tx) => {
      // Denetim 2026-08-23 P2 #6 (TOCTOU): ilan satırını kilitle ve teklif
      // kontrolünü TX İÇİNDE yinele — eşzamanlı placeBid (aynı kilidi bekler)
      // kalemleri cascade ile silinmiş bir teklif bırakamasın.
      await tx.$queryRaw`SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`;
      if (existing.status === "OPEN") {
        const liveBids = await tx.listingBid.count({ where: { listingId } });
        if (liveBids > 0) {
          throw new ConflictException(
            "Bu ihaleye az önce teklif verildi; düzenleme yapılamaz",
          );
        }
      }
      const l = await tx.listing.update({
        where: { id: listingId },
        data: {
          ...(format === "ENGLISH_AUCTION"
            ? { auctionRateSnapshot: updatedRateSnapshot ?? undefined }
            : {}),
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
          showTargetToSuppliers: dto.showTargetToSuppliers ?? false,
          primaryCurrency: (dto.primaryCurrency as Currency) ?? "TRY",
          // Çoklu birim auction'da da serbest — kıyaslar açılış günü kur
          // damgasıyla (yukarıda tazelenen auctionRateSnapshot) çevrilir.
          allowedCurrencies: (dto.allowedCurrencies as Currency[]) ?? [],
          bidsOpenAt: dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null,
          isSealedBid: dto.isSealedBid ?? true,
          isLogistics: dto.isLogistics ?? false,
          logistics: dto.logistics
            ? (dto.logistics as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          deliveryTerm: (dto.deliveryTerm as ListingDeliveryTerm) ?? null,
          // Ödeme planı — doğrulanmış + normalize; zamanlama plandan türetilir.
          ...this.buildPaymentPlan(dto),
          bidVisibility:
            (dto.bidVisibility as ListingBidVisibility) ?? "OWN_ONLY",
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
    // Açılış tarihi düzenlemeyle geçmişe/boşa çekilmiş olabilir — duyuru henüz
    // yapılmadıysa şimdi yapılır (idempotent; embargo sürüyorsa yine ertelenir).
    if (existing.status === "OPEN") {
      void this.announceListingOpen(listingId, "invitation").catch((err) =>
        this.logger.warn(
          `Yayın duyurusu başarısız (${listingId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    }
    return this.serialize(updated);
  }

  /**
   * Taslak ilanı sil — ilanı açan doğru-taraf operatörü veya firma sahibi;
   * yalnız DRAFT (yayınlanmış silinemez, iptal edilir).
   */
  async deleteListing(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        status: true,
        type: true,
        createdById: true,
      },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    this.assertListingManageRole(user, listing);
    if (listing.status !== "DRAFT") {
      throw new BadRequestException(
        "Yalnızca taslak ilan silinebilir; yayınlanmış ilan iptal edilir",
      );
    }
    await this.prisma.listing.delete({ where: { id: listingId } });
    return { ok: true };
  }

  /**
   * Taslağı yayınla. İlanı açan doğru-taraf operatörü veya firma sahibi;
   * DRAFT → doğrudan OPEN.
   * (Yayın onayı KALDIRILDI — onay akışı yalnız KAZANDIRMADA devreye girer.)
   */
  async publishListing(user: AuthenticatedCompanyUser, listingId: string) {
    this.assertPaidForNewListingWork(user, "İlan yayınlamak");
    this.assertVerified(user, "ilan yayınlayamazsınız");
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        status: true,
        closesAt: true,
        visibility: true,
        type: true,
        createdById: true,
        // X-CF-2: açık eksiltmede açılış kur damgası yayında SENKRON kurulur.
        format: true,
        allowedCurrencies: true,
        primaryCurrency: true,
      },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    this.assertListingManageRole(user, listing);
    if (listing.status !== "DRAFT") {
      throw new BadRequestException("Yalnızca taslak ilan yayınlanabilir");
    }
    // Taslak, tarih/davet kontrolünü atlayarak kaydedilebildiğinden yayında
    // yeniden doğrula (create'in non-draft yoluyla aynı kurallar):
    // (a) kapanış tarihi zorunlu + gelecekte — yoksa cron kapatamaz / anında
    //     kapanır; (b) PRIVATE ilan en az 1 davetli olmadan yayınlanamaz
    //     (kimsenin göremeyeceği açık ilan olmasın).
    // Madde 23: SATIS ilanı kapanışsız (süresiz) yayınlanabilir.
    if (listing.closesAt && listing.closesAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        "Yayın için geçerli bir kapanış tarihi (gelecekte) gerekli",
      );
    }
    if (!listing.closesAt && listing.type !== "SATIS") {
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

    // X-CF-2 FAIL-CLOSED: açık eksiltmenin AÇILIŞ kur damgasını BURADA (senkron)
    // kur → taze TCMB kuru yoksa 400 (ilan DRAFT kalır). announceListingOpen'daki
    // re-stamp yutuluyor + void çağrılıyor → orada fail-OPEN olurdu (snapshot'sız
    // açılır, per-bid'e düşer). Gerçek "kur yoksa açma" gate'i budur.
    const auctionSnapshot =
      listing.format === "ENGLISH_AUCTION"
        ? await this.buildAuctionRateSnapshot(
            listing.allowedCurrencies as Currency[],
            listing.primaryCurrency as Currency,
          )
        : undefined;

    // GUARD (closeNoAward/award simetrisi): yalnız DRAFT iken yayınla —
    // eşzamanlı çift-publish'te ikinci çağrı count=0 alır → announceListingOpen
    // yalnız kazanan çağrıda çalışır, tek duyuru (Tur-3 denetimi #11, INV-SM-1).
    const published = await this.prisma.listing.updateMany({
      where: { id: listingId, status: "DRAFT" },
      data: {
        status: "OPEN",
        publishedAt: new Date(),
        ...(auctionSnapshot ? { auctionRateSnapshot: auctionSnapshot } : {}),
      },
    });
    if (published.count !== 1) {
      throw new ConflictException(
        "İlan durumu değişti; yalnızca taslak yayınlanabilir",
      );
    }
    const updated = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });
    if (!updated) throw new NotFoundException("İlan bulunamadı");
    // INV-AUDIT-1: durum geçişi (yayınlama) — commit SONRASI, duyurudan önce.
    await this.audit.log({
      action: "company.listing.published",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing",
      entityId: listingId,
      critical: true,
      metadata: {
        listingType: listing.type,
        from: "DRAFT",
        to: "OPEN",
        visibility: listing.visibility,
      },
    });
    // Embargo-farkında duyuru: açılış gelecekteyse cron açılışta gönderir.
    void this.announceListingOpen(listingId, "invitation").catch((err) =>
      this.logger.warn(
        `Yayın duyurusu başarısız (${listingId}): ${
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
  // suppressErrors:false ZORUNLU — @nestjs/event-emitter varsayılanı TRUE'dur
  // (dist/event-subscribers.loader.js: wrapFunctionInTryCatchBlocks, options?.
  // suppressErrors ?? true) yani dinleyicideki hata YUTULUR ve emitAsync başarı
  // döner. Onay servisi buna güvenip fail-closed geri alma yapıyor; yutulan
  // hatada "onay APPROVED ama ilan/sipariş yok" sessiz tutarsızlığı oluşuyordu
  // (denetim 2026-08-23 Parça 4, HIGH).
  @OnEvent("listing.publish.approved", { suppressErrors: false })
  async onPublishApproved(payload: { listingId: string }) {
    await this.prisma.listing.update({
      where: { id: payload.listingId },
      data: { status: "OPEN", publishedAt: new Date() },
    });
    void this.announceListingOpen(payload.listingId, "invitation").catch((err) =>
      this.logger.warn(
        `Yayın duyurusu başarısız (${payload.listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    this.realtime?.pingListing(payload.listingId);
  }

  /** (Geriye uyum) Eski yayın onayı reddedilirse ilan taslağa geri döner. */
  @OnEvent("listing.publish.rejected")
  async onPublishRejected(payload: { listingId: string }) {
    // `*.rejected` olayları `emit` ile (beklenmeden) ateşlenir → burada
    // suppressErrors:false yalnız unhandledRejection üretirdi. Bunun yerine
    // hatayı KENDİMİZ yakalayıp Sentry'e taşıyoruz: sessiz durum-driftı yok
    // (denetim 2026-08-23 Parça 4).
    try {
      await this.prisma.listing.update({
        where: { id: payload.listingId },
        data: { status: "DRAFT" },
      });
    } catch (err) {
      this.logger.error(
        `Yayın reddi uygulanamadı (${payload.listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      reportToSentry("listing.publish.rejected uygulanamadı", "error", {
        tags: { area: "listings" },
        extra: { listingId: payload.listingId },
      });
    }
  }


  /**
   * RLS aktivasyon hazırlığı (denetim 2026-08-23 Parça 4): cron/sistem
   * yollarından çağrılan bildirim toplayıcıları `listing_invitations` ve
   * `listing_bids` gibi POLİCY'Lİ tabloları okur. Cron'da tenant bağlamı YOK →
   * RLS açıldığında bu okumalar 0 satır döner ve kapanış/hatırlatma/yeni-tur
   * bildirimleri SESSİZCE kimseye gitmez. Okumaları ilanın SAHİBİ bağlamında
   * koşarız (owner kolu her iki policy'de de davetli/teklif kümesini açar);
   * istek bağlamı zaten varsa (kullanıcı yolu) dokunmayız.
   */
  private inOwnerContext<T>(
    ownerCompanyId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const store = getTenantStore();
    if (store?.companyId) return fn();
    return runWithTenantContext(
      { companyId: ownerCompanyId, realm: "company" },
      fn,
    );
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
            // INV-FX-1: amountTry tek-baz (açılış damgası → teklif damgası).
            auctionRateSnapshot: true,
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
      // TRY karşılığı — INV-FX-1 TEK BAZ (sahip sıralaması/amountTry ile aynı
      // hesap): açılış damgası → teklif damgası. TRY teklif ham gösterilir.
      amountTry:
        b.currency === "TRY"
          ? b.amount.toString()
          : this.auctionTryValue(
                b.amount,
                b.currency,
                b.exchangeRateSnapshot,
                b.listing.auctionRateSnapshot,
              )
              ?.toFixed(2) ?? null,
      status: b.status,
      round: b.round,
      version: b.version,
      isBuyNow: b.isBuyNow,
      createdAt: b.createdAt,
      // ALIM: taahhüt edilen teslim; SATIS: istenen teslim (yön etiketi UI'da).
      deliveryDate: b.deliveryDate ? b.deliveryDate.toISOString() : null,
      deliveryTime: b.deliveryTime,
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
              where: { status: { in: [...OWNER_VISIBLE_BID_STATUSES] } },
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

    // Kategori ADLARI (liste satırındaki Kategori kolonu, 2026-08-04) —
    // sellerTenders ile aynı desen: ilk 2 ad + kalan sayaç.
    const catIds = [...new Set(rows.flatMap((r) => r.categoryIds))];
    const cats = catIds.length
      ? await this.prisma.category.findMany({
          where: { id: { in: catIds } },
          select: { id: true, nameTr: true },
        })
      : [];
    const cmap = new Map(cats.map((c) => [c.id, c.nameTr]));

    return rows.map((r) => {
      const u = umap.get(r.createdById);
      return {
        categories: r.categoryIds.slice(0, 2).map((id) => ({
          code: id,
          name: cmap.get(id) ?? id,
        })),
        extraCategoryCount: Math.max(0, r.categoryIds.length - 2),
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
          AND: [
            // Açılış embargosu: açılış tarihi GELECEKTE olan ilan, sahibi
            // dışında kimseye listelenmez (davetli dahil) — açılışta cron
            // duyurusuyla görünür olur. NOT(gt) KULLANMA: SQL'de NULL > x
            // NULL döner ve NOT(NULL) satırı eler — açılışsız ilan kaybolur.
            // İSTİSNA: ilanda TEKLİFİ olan firma (önceki turun katılımcısı)
            // embargoda da görür — "yeni fiyat hazırla ya da geçerliliği uzat"
            // bildirimi açılıştan önce gider; ilanı açamayan uzatamazdı.
            // Teklif verme yine açılışa kadar kapalıdır (placeBid embargosu).
            {
              OR: [
                { bidsOpenAt: null },
                { bidsOpenAt: { lte: new Date() } },
                { bids: { some: { bidderCompanyId: companyId } } },
              ],
            },
            {
              OR: [
                invitedClause,
                { AND: [{ OR: countryOr }, { OR: visibilityOr }] },
              ],
            },
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
        listingBidEligibility(l.visibility, {
          isInvited: invited,
          connectedToOwner: connected,
          viewerTier: user.tier,
        }).masked;
      const { canBid } = listingBidEligibility(l.visibility, {
        isInvited: invited,
        connectedToOwner: connected,
        viewerTier: user.tier,
      });
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
        ? this.prisma.listingBid.findMany({
            where: { listingId: id, status: "SUBMITTED" },
            select: {
              // INV-FX-1 (X6): id + submittedAt tie-break için (rankAuctionBids).
              id: true,
              submittedAt: true,
              amount: true,
              currency: true,
              exchangeRateSnapshot: true,
              // Kapsam kontrolü: fiyatlanmış kalem sayısı (aşağıda tam
              // kapsam filtresi için) — kalem detayı sızdırılmaz.
              items: {
                where: { ...PRICED_ITEM_WHERE },
                select: { itemId: true },
              },
            },
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
    // (ters eksiltme), SATIS'ta en yüksek (açık artırma). Çoklu birimde kıyas
    // açılış günü kur damgasıyla TRY-normalize; tutar KENDİ birimiyle döner.
    // Kalemli ilanda kıyasa yalnız TAM kapsamlı (tüm kalemleri fiyatlamış)
    // teklifler girer — kısmi teklifin düşük toplamı "en iyi" değildir
    // (elma-armut); bidCount da kıyaslanabilir teklif sayısıdır.
    const englishComparable = englishAgg
      ? englishAgg.filter((b) => bidCoversAllItems(b.items.length, items.length))
      : null;
    const englishRanked = englishComparable
      ? this.rankAuctionBids(
          englishComparable,
          listing.auctionRateSnapshot,
          listing.type === "SATIS",
        )
      : null;
    const englishBest = englishRanked?.[0] ?? null;
    const english:
      | {
          isEnglishAuction: true;
          currentBest: string | null;
          currentBestCurrency: string | null;
          bidCount: number;
          currentRound: number;
          rateSnapshot: Record<string, number> | null;
        }
      | null = englishRanked
      ? {
          isEnglishAuction: true,
          currentBest: englishBest ? englishBest.amount.toString() : null,
          currentBestCurrency: englishBest ? englishBest.currency : null,
          bidCount: englishRanked.length,
          currentRound: listing.currentRound,
          // Açılış günü TCMB damgası — UI adımı/en iyiyi teklifçinin birimine
          // bununla çevirir (kamusal kur verisi; zarf sızıntısı değil).
          rateSnapshot: this.rateSnapshotToNumbers(listing.auctionRateSnapshot),
        }
      : null;

    const connected = connectedIds.includes(listing.companyId);

    // Kalemler (herkese görünür — teklif vermek için gerekli).
    const itemsOut = items.map((it) => ({
      id: it.id,
      lineNo: it.lineNo,
      name: it.name,
      description: it.description,
      quantity: it.quantity.toString(),
      unit: it.unit,
      // CC-1: hedef/istenen fiyat non-owner'a YALNIZCA sahip opt-in ettiyse
      // gösterilir (varsayılan gizli — çıpalama riski). Sahip yolu (detail) ayrı,
      // hep görür. minUnitPrice/buyNowUnitPrice (SATIS tabanı) bilerek açık kalır.
      targetPrice: listing.showTargetToSuppliers
        ? (it.targetPrice?.toString() ?? null)
        : null,
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
      // Faz O — dar-bağlam okuma kapısı: ONAYLAYICI-only (ve rolsüz) üye,
      // owner-detayını (rakip teklifler + iç notlar) yalnız kendisine düşmüş
      // onay bağlamında görebilir.
      await this.assertOwnerReadContext(user, listing.id);
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
            status: { in: [...OWNER_VISIBLE_BID_STATUSES] },
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
      // A2 fix: sahip-detay teklif sıralaması TEK KAYNAK — yetkili karşılaştırıcı
      // (rankAuctionBids: Decimal + TRY-normalize). Eski ham `Number(a.amount)-
      // Number(b.amount)` karışık kurda kur normalize ETMEDEN sıralıyordu → 100 USD
      // (~3000 TRY) 3000 TRY'nin altında görünüp sahip yanlış firmaya kazandırırdı.
      const rankedBids = this.rankAuctionBids(
        bids,
        listing.auctionRateSnapshot,
        listing.type === "SATIS",
      );
      return {
        ...this.detail(listing, false),
        isOwner: true,
        // F7: buton izin-kapısı için — kazandır/ele assertListingManageRole
        // (createdById===userId VEYA SAHİP) ister; UI aynı kapıyı uygular.
        createdById: listing.createdById,
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
        bids: rankedBids.map((b) => ({
          id: b.id,
          bidderName: b.bidderCompany.name,
          bidderCompanyId: b.bidderCompanyId,
          amount: b.amount.toString(),
          currency: b.currency,
          version: b.version,
          // TRY dışı tekliflerde teklif-anı TCMB kuru (audit; kur gösterimi).
          exchangeRateSnapshot: b.exchangeRateSnapshot
            ? b.exchangeRateSnapshot.toString()
            : null,
          // amountTry: INV-FX-1 TEK BAZ — sıralama (rankedBids) ile AYNI kaynak
          // (açılış damgası → teklif damgası). Eski "yalnız per-bid damga"
          // sıralamayla ıraksıyordu. TRY teklifte gereksiz → null (eski davranış).
          amountTry:
            b.currency !== "TRY"
              ? this.auctionTryValue(
                    b.amount,
                    b.currency,
                    b.exchangeRateSnapshot,
                    listing.auctionRateSnapshot,
                  )
                  ?.toFixed(2) ?? null
              : null,
          note: b.note,
          isBuyNow: b.isBuyNow,
          status: b.status,
          round: b.round,
          createdAt: b.createdAt,
          // ALIM: satıcının taahhüdü; SATIS: alıcının istediği teslim.
          deliveryDate: b.deliveryDate ? b.deliveryDate.toISOString() : null,
          deliveryTime: b.deliveryTime,
          validityDays: b.validityDays,
          // Geçerlilik rozeti için: son geçerlilik = submittedAt + validityDays.
          submittedAt: b.submittedAt ? b.submittedAt.toISOString() : null,
          deliveryAddress: b.deliveryAddress,
          items: b.items.map((bi) => ({
            itemId: bi.itemId,
            unitPrice: bi.unitPrice.toString(),
            deliveryDate: bi.deliveryDate
              ? bi.deliveryDate.toISOString()
              : null,
            deliveryTime: bi.deliveryTime,
            // Madde 9 — kalem para birimi (null = teklifin ana birimi).
            currency: bi.currency,
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
    const [invitedCount, blockedIds, myBid, auctionView, myOrder] =
      await Promise.all([
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
            listing.auctionRateSnapshot,
            items.length,
          )
        : Promise.resolve(null),
      // Kazanan teklifçinin bu ilandan doğan siparişi (OrderStatusStrip):
      // görünürlük kapısı GEREKMEZ — where zaten çağıranın taraf olduğu
      // siparişle sınırlı (kendi verisi). Kaybeden/teklifsiz için null.
      this.prisma.companyOrder.findFirst({
        where: {
          listingId: id,
          OR: [
            { sellerCompanyId: user.companyId },
            { buyerCompanyId: user.companyId },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, number: true, status: true },
      }),
    ]);

    const isInvited = invitedCount > 0;
    // Davet HER görünürlüğü açar ve ülke kapsamını aşar — liste (sellerTenders)
    // ve teklif (placeBid) ile aynı kural; davetlinin teklif verebildiği ilanın
    // detayı 404 olmamalı (eligibility drift fix).
    const visible = isListingVisibleToViewer(listing.visibility, {
      isInvited,
      connectedToOwner: connected,
    });
    if (!visible) throw new NotFoundException("İlan bulunamadı");

    // Yayınlanmamış (DRAFT) ilan sahip dışında kimseye görünmez — davetli/
    // bağlantılı firma dahi id ile taslağı açamaz (owner dalı yukarıda döner).
    if (listing.status === "DRAFT") {
      throw new NotFoundException("İlan bulunamadı");
    }

    // Açılış embargosu: açılış tarihi GELECEKTEyse ilan sahibi dışında kimse
    // (davetli dahil) göremez — sellerTenders listesiyle aynı kural; ihale
    // ancak açılış anında görünür olur. İSTİSNA: ilanda TEKLİFİ olan firma
    // (önceki turun katılımcısı) görür — "geçerliliği uzat / yeni fiyat
    // hazırla" bildirimi açılıştan önce gider; ilanı açamayan uzatamazdı.
    // Teklif verme yine açılışa kadar kapalıdır (placeBid embargosu).
    if (
      listing.bidsOpenAt &&
      listing.bidsOpenAt.getTime() > Date.now() &&
      !myBid
    ) {
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
      listingBidEligibility(listing.visibility, {
        isInvited,
        connectedToOwner: connected,
        viewerTier: user.tier,
      }).masked;
    const { canBid } = listingBidEligibility(listing.visibility, {
      isInvited,
      connectedToOwner: connected,
      viewerTier: user.tier,
    });
    // Rol kapısı UI'a da yansısın: placeBid ALIM'da SATISCI, SATIS'ta
    // SATIN_ALMACI ister — kullanıcı formu doldurup 403 yemesin.
    // Faz R: SAHIP muafiyeti kaldırıldı — UI bayrağı placeBid kapısıyla birebir.
    const roleAllowsBid = user.roles.includes(
      listing.type === "ALIM" ? CompanyRole.SATISCI : CompanyRole.SATIN_ALMACI,
    );
    // Pazarlık durumu — teklifçinin TUR HAKKI + kendi önceki toplamı.
    // Minimum azaltma payı KALDIRILDI (2026-07-13): tek kural "kendi önceki
    // teklifinden kesin daha iyi" (placeBid ile aynı). Rakip verisi İÇERMEZ —
    // görünürlük auctionView'da ayrıca yönetilir; sızıntı yüzeyi yok.
    let nextBidConstraint: {
      direction: "DOWN" | "UP";
      currencyLocked: boolean;
      ownCurrency: string | null;
      ownLastTotal: string | null;
      /** Turda tek aktif gönderim hakkı — taşınan (carry-over) teklif yakmaz. */
      canBidThisRound: boolean;
    } | null = null;
    if (
      listing.format === "ENGLISH_AUCTION" &&
      listing.status === "OPEN" &&
      !masked &&
      canBid
    ) {
      const ownLast =
        myBid && myBid.status === "SUBMITTED" ? myBid.amount : null;
      nextBidConstraint = {
        direction: listing.type === "SATIS" ? "UP" : "DOWN",
        currencyLocked: ownLast != null,
        ownCurrency: ownLast != null ? myBid!.currency : null,
        ownLastTotal: ownLast?.toString() ?? null,
        canBidThisRound: !(
          myBid?.status === "SUBMITTED" &&
          myBid.activeBidRound === listing.currentRound
        ),
      };
    }
    // Bidder'a dönen `english` bloğu görünürlükle sınırlanır; MASKELİ izleyici
    // canlı fiyat/katılımcı verisi almaz (önizleme sızıntısı yok).
    const englishForBidder =
      english && !masked
        ? {
            ...english,
            currentBest: auctionView?.bestTotal ?? null,
            currentBestCurrency: auctionView?.bestCurrency ?? null,
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
      nextBidConstraint,
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
            deliveryTime: myBid.deliveryTime,
            validityDays: myBid.validityDays,
            deliveryAddressId: myBid.deliveryAddressId,
            currency: myBid.currency,
            items: myBid.items.map((bi) => ({
              itemId: bi.itemId,
              unitPrice: bi.unitPrice.toString(),
              deliveryDate: bi.deliveryDate
                ? bi.deliveryDate.toISOString()
                : null,
              deliveryTime: bi.deliveryTime,
              currency: bi.currency,
            })),
            answers: myBid.answers.map((a) => ({
              questionId: a.questionId,
              value: a.value,
            })),
          }
        : null,
      // Bu ilandan doğan, çağıranın taraf olduğu sipariş (kazanan teklifçi).
      myOrder: myOrder
        ? { id: myOrder.id, number: myOrder.number, status: myOrder.status }
        : null,
    };
  }

  /**
   * Açık eksiltme kur damgası — izinli her birim için günün TCMB kuru (birim
   * başına TRY, TRY=1). Kuru olmayan birimle açık eksiltme/artırma AÇILAMAZ:
   * sessiz yanlış kıyas yerine açık hata.
   */
  private async buildAuctionRateSnapshot(
    currencies: Currency[],
    primary: Currency,
  ): Promise<Record<string, string>> {
    const set = [...new Set<Currency>([...(currencies ?? []), primary])];
    // INV-MONEY-1 / INV-FX-1: kurlar Decimal-STRING saklanır (eski: JSON float).
    // JSON number tek-baz kuru için lossy'di (auctionTryValue her okumada float→
    // Decimal); string saklamak kaynağı sabit tutar, tekrarlı float round-trip'i
    // keser. auctionTryValue reader hem string (yeni) hem number (legacy) kabul.
    const out: Record<string, string> = { TRY: "1" };
    for (const cur of set) {
      if (cur === "TRY") continue;
      // X-CF-2: getFreshRate (strict null-on-stale) — getCurrentRate DEĞİL. Baz
      // para kararı olduğundan (sıralama/taban/onay eşiği), getCurrentRate'in
      // sessiz POZİTİF hardcoded fallback'i "tek yetkili bazı" fail-OPEN
      // tohumluyordu (INV-FX-1 ihlali; taban bacağı zaten getFreshRate). Taze kur
      // yoksa → throw → publish fail-closed (bkz. publishListing).
      const rate = await this.exchangeRates.getFreshRate(cur).catch(() => null);
      if (rate == null || rate <= 0) {
        throw new BadRequestException(
          `${cur} için güncel TCMB kuru bulunamadı — bu para birimiyle açık eksiltme/artırma açılamaz`,
        );
      }
      out[cur] = new Prisma.Decimal(rate).toString();
    }
    return out;
  }

  /**
   * Teklifin TRY karşılığı — kur önceliği: ilanın AÇILIŞ günü damgası (adil,
   * ihale boyunca sabit) → teklifin kendi kur snapshot'ı (legacy) → TRY=1.
   * Hiçbiri yoksa null (kıyasta en sona düşer).
   */
  /**
   * Açılış damgasından bir para biriminin kurunu Decimal olarak okur (INV-FX-1
   * TEK KAYNAK — auctionTryValue + taban kontrolü aynı parser'ı kullanır).
   * Snapshot artık kuru Decimal-STRING saklıyor (yeni); eski turlarda JSON FLOAT
   * (number) kalabilir → iki tipi de kabul. Yoksa/≤0 → null. TRY → 1.
   */
  private snapRateDecimal(
    listingSnap: unknown,
    currency: string,
  ): Prisma.Decimal | null {
    if (currency === "TRY") return new Prisma.Decimal(1);
    const s = (listingSnap as Record<string, unknown> | null)?.[currency];
    if (typeof s === "string" && s.length > 0) {
      const r = new Prisma.Decimal(s);
      if (r.isPositive() && !r.isZero()) return r;
    }
    if (typeof s === "number" && s > 0) return new Prisma.Decimal(s);
    return null;
  }

  private auctionTryValue(
    amount: Prisma.Decimal,
    currency: string,
    bidSnapshot: Prisma.Decimal | null,
    listingSnap: unknown,
  ): Prisma.Decimal | null {
    if (currency === "TRY") return amount;
    // INV-FX-1: açılış damgası (adil, tur boyu sabit) → teklif damgası (legacy).
    const r = this.snapRateDecimal(listingSnap, currency);
    if (r) return amount.mul(r);
    if (bidSnapshot) return amount.mul(bidSnapshot);
    return null;
  }

  /**
   * Snapshot kur haritasını EKRAN sınırında number'a indirger. Storage artık
   * Decimal-string (INV-FX-1) ama API sözleşmesi `rateSnapshot: number` kalır
   * (frontend JS math). Grup 2 deseni: karar=Decimal/string kesin, gösterim=
   * mevcut şekil. Legacy number + yeni string değerlerin ikisini de kabul eder.
   */
  private rateSnapshotToNumbers(
    snap: unknown,
  ): Record<string, number> | null {
    if (snap == null || typeof snap !== "object") return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(snap as Record<string, unknown>)) {
      const n =
        typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  }

  /**
   * Açık eksiltme tekliflerini EN İYİ önce sıralar — birimler arası kıyas
   * TRY-normalize (açılış damgası) yapılır. Tüm teklifler aynı birimdeyse kur
   * gerekmez (ham tutar sıralaması birebir eşdeğer — legacy turlar). Kur'suz
   * karışık-birim satırlar kıyaslanamaz → listenin sonuna.
   *
   * INV-FX-1 (X6) TIE-BREAK: fiyat EŞİTSE en erken `submittedAt` kazanır (yön
   * bağımsız — eşit fiyatta önce gelen hep üstte, ALIM/SATIS fark etmez); submittedAt
   * de eşitse `id` ile deterministik kırılır. Eski `? 0` keyfi DB/array sırasına
   * bırakıyordu (aynı veri farklı sıralanabilir, en-iyi belirsizdi).
   */
  private rankAuctionBids<
    T extends {
      amount: Prisma.Decimal;
      currency: string;
      exchangeRateSnapshot: Prisma.Decimal | null;
      submittedAt: Date | null;
      id: string;
    },
  >(bids: T[], listingSnap: unknown, isAscending: boolean): T[] {
    const sameCur = bids.every((b) => b.currency === bids[0]?.currency);
    const key = (b: T): Prisma.Decimal | null =>
      this.auctionTryValue(
        b.amount,
        b.currency,
        b.exchangeRateSnapshot,
        listingSnap,
      ) ?? (sameCur ? b.amount : null);
    // Eşitlik/çevrilemez durumlarda deterministik kırıcı (yön bağımsız).
    const tieBreak = (a: T, b: T): number => {
      const ta = a.submittedAt ? a.submittedAt.getTime() : Infinity;
      const tb = b.submittedAt ? b.submittedAt.getTime() : Infinity;
      if (ta !== tb) return ta - tb; // erken submittedAt önce
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // sonra id
    };
    return [...bids].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka == null && kb == null) return tieBreak(a, b);
      if (ka == null) return 1;
      if (kb == null) return -1;
      if (ka.eq(kb)) return tieBreak(a, b);
      const cmp = ka.minus(kb).isNegative() ? -1 : 1;
      return isAscending ? -cmp : cmp;
    });
  }

  /**
   * Açık eksiltme görünürlük hesabı (eski computeAuctionView ile aynı mantık).
   * OWN_ONLY → null (hiçbir rakip bilgisi). Aksi halde bidVisibility'ye göre
   * en iyi fiyat / kendi sıra / katılımcı sayısı / tüm sıralar döner.
   * Kapalı zarf korunur: teklif sahibi kimlikleri ALL modunda bile gizli.
   * Çoklu birimde sıralama TRY-normalize; tutarlar KENDİ birimiyle döner.
   */
  private async computeAuctionView(
    listingId: string,
    companyId: string,
    visibility: ListingBidVisibility,
    listingType: ListingType,
    listingRateSnapshot: unknown,
    listingItemCount: number,
  ): Promise<{
    bestTotal: string | null;
    bestCurrency: string | null;
    myRank: number | null;
    participantCount: number | null;
    allBids:
      | { rank: number; total: string; currency: string; isMine: boolean }[]
      | null;
  } | null> {
    if (visibility === "OWN_ONLY") return null;

    const rows = await this.prisma.listingBid.findMany({
      where: { listingId, status: "SUBMITTED" },
      select: {
        // INV-FX-1 (X6): id + submittedAt tie-break için (rankAuctionBids).
        id: true,
        submittedAt: true,
        bidderCompanyId: true,
        amount: true,
        currency: true,
        exchangeRateSnapshot: true,
        // Kapsam kontrolü — fiyatlanmış kalem sayısı (detay sızdırılmaz).
        items: {
          where: { ...PRICED_ITEM_WHERE },
          select: { itemId: true },
        },
      },
    });
    // Kalemli ilanda sıralama/en-iyi yalnız TAM kapsamlı teklifler arasında —
    // kısmi teklifin düşük toplamı diğerleriyle kıyaslanamaz (elma-armut);
    // kısmi teklif sahibi sıra alamaz (myRank null), katılımcı sayısı da
    // kıyaslanabilir teklif sayısıdır (x/y tutarlı kalsın).
    const comparable = rows.filter((b) =>
      bidCoversAllItems(b.items.length, listingItemCount),
    );
    // ALIM = ters eksiltme (düşük en iyi), SATIS = açık artırma (yüksek en iyi).
    const bids = this.rankAuctionBids(
      comparable,
      listingRateSnapshot,
      listingType === "SATIS",
    );
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
        bestCurrency: null,
        myRank: null,
        participantCount: wantsBest || wantsRank ? 0 : null,
        allBids: visibility === "ALL" ? [] : null,
      };
    }

    const myIdx = bids.findIndex((b) => b.bidderCompanyId === companyId);
    return {
      bestTotal: wantsBest ? bids[0]!.amount.toString() : null,
      bestCurrency: wantsBest ? bids[0]!.currency : null,
      myRank: wantsRank && myIdx >= 0 ? myIdx + 1 : null,
      participantCount: wantsBest || wantsRank ? bids.length : null,
      allBids:
        visibility === "ALL"
          ? bids.map((b, i) => ({
              rank: i + 1,
              total: b.amount.toString(),
              currency: b.currency,
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
  private static readonly ADDRESS_SNAPSHOT_SELECT = {
    title: true,
    contactName: true,
    phone: true,
    country: true,
    city: true,
    district: true,
    addressLine: true,
    postalCode: true,
  } as const;

  private async orderDeliverySnapshot(
    addressId: string | null,
  ): Promise<Prisma.InputJsonValue | undefined> {
    if (!addressId) return undefined;
    const a = await this.prisma.companyAddress.findUnique({
      where: { id: addressId },
      select: CompanyListingsService.ADDRESS_SNAPSHOT_SELECT,
    });
    return a ? (a as Prisma.InputJsonValue) : undefined;
  }

  /**
   * Perf (N+1): birden çok teslim adresinin snapshot'ını TEK sorguda çözer
   * (kalem-bazlı SATIS kazandırmasında per-kazanan findUnique yerine). Dönen
   * Map addressId → snapshot; null/silinmiş adres Map'te yer almaz.
   */
  private async orderDeliverySnapshots(
    addressIds: (string | null)[],
  ): Promise<Map<string, Prisma.InputJsonValue>> {
    const ids = [...new Set(addressIds.filter((x): x is string => !!x))];
    const out = new Map<string, Prisma.InputJsonValue>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.companyAddress.findMany({
      where: { id: { in: ids } },
      select: { id: true, ...CompanyListingsService.ADDRESS_SNAPSHOT_SELECT },
    });
    for (const r of rows) {
      const { id, ...snap } = r;
      out.set(id, snap as Prisma.InputJsonValue);
    }
    return out;
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
        auctionRateSnapshot: true,
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
          select: {
            status: true,
            amount: true,
            currency: true,
            activeBidRound: true,
            // Pazarlık rebid'inde teslim bilgisi taşınan tekliften KORUNUR
            // (madde 14) — yeniden sorulmaz, gönderilmezse eski değer kalır.
            deliveryTime: true,
            deliveryDate: true,
            validityDays: true,
            // Monotonluk kıyası AYNI KALEMLER bazında — önceki teklifte
            // fiyatlanmış kalemler (kapsam genişletme serbest, bırakma yasak).
            items: {
              where: { ...PRICED_ITEM_WHERE },
              select: { itemId: true, deliveryTime: true, deliveryDate: true },
            },
          },
        }),
      ]);
    if (blockedIds.includes(user.companyId)) {
      throw new NotFoundException("İlan bulunamadı");
    }
    const connected = connectedIds.includes(listing.companyId);
    // Davet her görünürlükte teklif hakkı verir ve ÜLKE kapsamını da aşar
    // (alıcı firmayı açıkça seçti) — getOne/sellerTenders ile aynı kural.
    const isInvited = invitedCount > 0;
    const visible = isListingVisibleToViewer(listing.visibility, {
      isInvited,
      connectedToOwner: connected,
    });
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

    const { canBid } = listingBidEligibility(listing.visibility, {
      isInvited,
      connectedToOwner: connected,
      viewerTier: user.tier,
    });
    if (!canBid) {
      throw new ForbiddenException(
        listing.visibility === "PRIVATE"
          ? "Bu özel ihaleye yalnızca davetli firmalar teklif verebilir"
          : "Bu ilana teklif vermek için premium üyelik gerekir",
      );
    }

    // Rol (işleme göre): ALIM ilanı → teklifçi SATAR → Satışçı; SATIS → ALIR → Satın Almacı.
    // Faz R: SAHIP muafiyeti yok — Kurucu teklif için op-rol taşımalı.
    const neededRole = bidderOpRole(listing.type);
    if (!user.roles.includes(neededRole)) {
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
    if (isListingClosedAt(listing.closesAt)) {
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
    // INV-KYC-1: teklif SUBMIT para-taahhüdüdür (bağlayıcı) → VERIFIED ister.
    // TASLAK kaydetme SERBEST (funnel kırılmaz).
    if (!isDraft) this.assertVerified(user, "teklif veremezsiniz");
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
    // İngiliz usulünde para birimi İLK gönderilmiş teklifle KİLİTLENİR —
    // tur içinde birim değiştirip kur yuvarlamasıyla adım kuralı oynanamaz;
    // monotonluk ve adım kıyası hep teklifçinin tek biriminde kalır.
    if (
      listing.format === "ENGLISH_AUCTION" &&
      existingBid?.status === "SUBMITTED" &&
      existingBid.currency !== currency
    ) {
      throw new BadRequestException(
        `Açık eksiltme/artırmada para birimi değiştirilemez — teklifinizi ${existingBid.currency} olarak verin`,
      );
    }
    // TURDA TEK AKTİF GÖNDERİM (2026-07-13): pazarlıkta her firma tur başına
    // BİR kez fiyat gönderir. Taşınan (carry-over) teklif hak YAKMAZ —
    // activeBidRound taşımada güncellenmez, eski turda kalır. Elenen (LOST)
    // tedarikçi guard'a girmez: alıcının elemesi hakkı bilinçli sıfırlar
    // (aynı tur içindeki düzeltme yolu korunur). Taslak da girmez — SUBMITTED
    // teklif zaten taslağa çekilemiyor, teklifsizken taslak serbest.
    if (
      !isDraft &&
      listing.format === "ENGLISH_AUCTION" &&
      existingBid?.status === "SUBMITTED" &&
      existingBid.activeBidRound === listing.currentRound
    ) {
      throw new BadRequestException(
        "Bu turdaki teklifinizi verdiniz — ilan sahibi yeni tur açarsa güncelleyebilirsiniz",
      );
    }
    // Gönderimde geçerlilik zorunlu (taslakta opsiyonel). PAZARLIK İSTİSNASI
    // (madde 13/15): açık eksiltmede geçerlilik SORULMAZ — pazarlık teklifi
    // süresizdir (validityDays=null yazılır).
    const isAuctionFormat = listing.format === "ENGLISH_AUCTION";
    if (!isDraft && !isAuctionFormat && !dto.validityDays) {
      throw new BadRequestException(
        "Teklif göndermek için geçerlilik süresi zorunlu",
      );
    }
    // Genel teslim SÜRESİ (2026-08-02; tarih yerine süre merdiveni): teklif
    // verilen HER kalemin kendi süresi (veya legacy tarihi) varsa GEREKSİZ →
    // tekrar istenmez. Aksi halde gönderimde zorunlu. Legacy deliveryDate
    // API geriye-uyumluluk için kabul edilmeye devam eder.
    const everyItemHasDelivery =
      !!dto.items?.length &&
      dto.items.every((bi) => !!bi.deliveryTime || !!bi.deliveryDate);
    // Madde 14: pazarlıkta taşınan teklifin teslim bilgisi KORUNUR — form
    // yeniden sormaz; mevcut teklifte (genel ya da kalem) teslim varsa
    // gönderimde tekrar istenmez.
    const carriedHasDelivery =
      !!existingBid &&
      (!!existingBid.deliveryTime ||
        !!existingBid.deliveryDate ||
        existingBid.items.some((bi) => bi.deliveryTime || bi.deliveryDate));
    if (
      !isDraft &&
      !everyItemHasDelivery &&
      !dto.deliveryTime &&
      !dto.deliveryDate &&
      !(isAuctionFormat && carriedHasDelivery)
    ) {
      throw new BadRequestException(
        listing.type === "SATIS"
          ? "İstenen teslim süresi zorunlu (süre girmediğiniz kalemler için)"
          : "Teslim süresi zorunlu (süre girmediğiniz kalemler için)",
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
      deliveryTime: BidDeliveryTime | null;
      currency: Currency | null;
      fxToBase: Prisma.Decimal | null;
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
      // Madde 9 (2026-08-02) — kalem bazlı para birimi: kalem, ilanın izin
      // verdiği birimlerden, teklifin ana biriminden FARKLI bir birim
      // taşıyabilir. Yalnız kapalı zarf ALIM ihalesinde (SATIS taban kıyası ve
      // açık eksiltmenin tek-birim kilidi bozulmaz). Çevrim damgası (fxToBase)
      // submit anında TCMB çaprazından yazılır; bid.amount ana birimde Σ olur
      // ve award nöbetçisi AYNI damgayla yeniden hesaplar (fail-closed).
      const itemCurrencyOf = (bi: (typeof provided)[number]): Currency =>
        ((bi.currency as Currency | undefined) ?? currency);
      const hasForeignItems = provided.some(
        (bi) => itemCurrencyOf(bi) !== currency,
      );
      const fxByCurrency = new Map<Currency, Prisma.Decimal>([
        [currency, new Prisma.Decimal(1)],
      ]);
      if (hasForeignItems) {
        if (listing.type !== "ALIM" || listing.format === "ENGLISH_AUCTION") {
          throw new BadRequestException(
            "Kalem bazında farklı para birimi yalnız kapalı zarf alım ihalelerinde kullanılabilir",
          );
        }
        for (const bi of provided) {
          const c = itemCurrencyOf(bi);
          if (
            listing.allowedCurrencies.length > 0 &&
            !listing.allowedCurrencies.includes(c)
          ) {
            throw new BadRequestException(
              `Bu ilan için geçersiz kalem para birimi: ${c}`,
            );
          }
        }
        // TRY-baz çapraz kur — TAZE (getFreshRate): para kararında bayat/
        // fallback kur kabul edilmez; kur yoksa fail-closed reddedilir.
        const rateTry = async (c: Currency): Promise<Prisma.Decimal> => {
          if (c === "TRY") return new Prisma.Decimal(1);
          const r = await this.exchangeRates.getFreshRate(c).catch(() => null);
          if (r == null || r <= 0) {
            throw new BadRequestException(
              `Güncel kur bilgisi yok (TCMB ${c}) — kalem bazlı farklı para birimi şu an kullanılamıyor; teklifi tek birimde verin veya daha sonra tekrar deneyin`,
            );
          }
          return new Prisma.Decimal(r);
        };
        const baseRate = await rateTry(currency);
        for (const c of [...new Set(provided.map(itemCurrencyOf))]) {
          if (fxByCurrency.has(c)) continue;
          fxByCurrency.set(
            c,
            (await rateTry(c))
              .div(baseRate)
              .toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP),
          );
        }
      }
      // S5: miktar HER ZAMAN listing'den (qtyById) — teklif DTO'sunda quantity
      // yok. bid.amount = Σ(unitPrice × listingQty) ANA BİRİMDE — tek-kaynak
      // sumLineTotalsInBase (tek-birimde klasik sumLineTotals ile birebir).
      amount = sumLineTotalsInBase(
        provided.map((bi) => ({
          unitPrice: bi.unitPrice,
          quantity: qtyById.get(bi.itemId) ?? 0,
          fxToBase:
            itemCurrencyOf(bi) !== currency
              ? (fxByCurrency.get(itemCurrencyOf(bi)) ?? null)
              : null,
        })),
      );
      // Gönderilen (taslak olmayan) teklif sıfır toplam olamaz; tüm birim
      // fiyatlar 0 ise "kazanan sıfır teklif" oluşmasın (F6).
      if (!isDraft && amount.lte(0)) {
        throw new BadRequestException("Teklif toplamı sıfırdan büyük olmalı");
      }
      // Madde 14: pazarlık rebid'inde kalem teslim bilgisi taşınan tekliften
      // korunur (dto göndermezse eski değer yazılır — sessiz silme yok).
      const prevItemDelivery = new Map(
        (existingBid?.items ?? []).map((i) => [i.itemId, i] as const),
      );
      bidItemsData = provided.map((bi) => {
        const c = itemCurrencyOf(bi);
        const prev = isAuctionFormat ? prevItemDelivery.get(bi.itemId) : null;
        return {
          itemId: bi.itemId,
          unitPrice: bi.unitPrice,
          deliveryDate: bi.deliveryDate
            ? new Date(bi.deliveryDate)
            : (prev?.deliveryDate ?? null),
          deliveryTime:
            (bi.deliveryTime as BidDeliveryTime | undefined) ??
            prev?.deliveryTime ??
            null,
          currency: c !== currency ? c : null,
          fxToBase: c !== currency ? (fxByCurrency.get(c) ?? null) : null,
        };
      });

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

    // Taşma koruması: birim fiyat × miktar ÇARPIMI (ve satır toplamlarının
    // TOPLAMI) tekil @Max'larla bağlanamaz; Decimal(18,2) kolonu ~1e16'da
    // taşar → aksi halde Postgres 500. MAX_MONEY tavanı → temiz 400.
    if (amount.gt(MAX_MONEY)) {
      throw new BadRequestException("Teklif toplamı çok büyük");
    }

    // TRY dışı teklifte güncel TCMB kuru anlık snapshot'lanır — hem kayıt
    // (TRY karşılığı gösterimi) hem de aşağıdaki taban/hemen-al kıyası için.
    // Kur alınamazsa teklif yine kabul edilir ama TRY karşılığı boş kalır;
    // sessiz kalmasın diye loglanır (gözlemlenebilirlik).
    // Denetim 2026-08-23 P2 #10: damga TAZE kurdan (getFreshRate; bayat/sabit
    // fallback YOK) — RFQ'da bu damga sıralama + kazandırma onay eşiğinin tek
    // bazı; bayat kurla onay sessizce atlanabiliyordu. Kur yoksa damga null.
    // ENGLISH_AUCTION'da AÇILIŞ damgası varsa teklif damgası da ondan (INV-FX-1
    // TEK BAZ: taban/sıralama/eşik ile aynı kaynak; taze kur sorulmaz).
    let exchangeRateSnapshot: number | null = null;
    const openingStamp =
      currency !== "TRY"
        ? this.snapRateDecimal(listing.auctionRateSnapshot, currency)
        : null;
    if (openingStamp) {
      exchangeRateSnapshot = openingStamp.toNumber();
    } else if (currency !== "TRY") {
      exchangeRateSnapshot = await this.exchangeRates
        .getFreshRate(currency)
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
    // birimdeyse kurla çevrilir (çevrimsiz ham kıyas yanlıştı: 100 USD, 3.000 TL
    // tabanın "altında" sayılıyordu). Kur yoksa ve kıyas gerekiyorsa gönderim
    // reddedilir — yanlış kıyasla teklif kabul edilmez (fail-closed).
    //
    // INV-FX-1 TEK BAZ: ENGLISH_AUCTION'da kur AÇILIŞ damgasından alınır
    // (sıralama/eşik ile AYNI kaynak — taban da tur boyu sabit adil bazla
    // kıyaslanır). Damgada olmayan birim veya RFQ (damga yok) → getFreshRate
    // (strict; sessizce bayat/fallback dönmez — gösterim için OK, para kararı
    // için değil). Her iki bacak da aynı politikayı izler (tutarlı oran).
    const curSym =
      listing.primaryCurrency === "TRY" ? "₺" : listing.primaryCurrency;
    const floorRate = async (
      cur: string,
    ): Promise<Prisma.Decimal | null> => {
      if (cur === "TRY") return new Prisma.Decimal(1);
      const fromSnap = this.snapRateDecimal(listing.auctionRateSnapshot, cur);
      if (fromSnap) return fromSnap; // açılış bazı (auction)
      const fresh = await this.exchangeRates
        .getFreshRate(cur as Currency)
        .catch(() => null);
      return fresh != null && fresh > 0 ? new Prisma.Decimal(fresh) : null;
    };
    let toListingCurrency: Prisma.Decimal | null = null;
    if (currency === listing.primaryCurrency) {
      toListingCurrency = new Prisma.Decimal(1);
    } else {
      const bidRate = await floorRate(currency);
      const listingRate = await floorRate(listing.primaryCurrency);
      if (bidRate != null && listingRate != null && listingRate.gt(0)) {
        toListingCurrency = bidRate.div(listingRate);
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

    // Pazarlık: GÖNDERİLEN teklif kendi önceki teklifinden KESİN daha iyi
    // olmalı (ALIM'da düşük, SATIS'ta yüksek; eşitlik yok) — başka sınır YOK.
    // Minimum azaltma payı KALDIRILDI (2026-07-13): zorunlu pay çıpa etkisi
    // yaratıyordu (herkes tam %X iner, fazlasını vermez); turda-tek-teklif
    // kuralı sembolik indirimi zaten caydırır. Rakip referansı da yok —
    // kazandırma manuel olduğundan "en iyiyi geçme" şartı gereksizdi (ve
    // gizli görünürlükte sızıntı riski taşıyordu). Birim kilidi sayesinde
    // kıyas hep teklifçinin kendi biriminde; kur çevirisi gerekmez.
    if (!isDraft && listing.format === "ENGLISH_AUCTION") {
      const isAscending = listing.type === "SATIS";
      const ownLast: Prisma.Decimal | null =
        existingBid?.status === "SUBMITTED" ? existingBid.amount : null;
      if (ownLast != null) {
        const fmt = (d: Prisma.Decimal) =>
          d.toNumber().toLocaleString("tr-TR", { maximumFractionDigits: 2 });
        // Mesajlar teklifçinin KENDİ biriminde konuşur (ilanın değil).
        const bidSym = currency === "TRY" ? "₺" : currency;
        // KIYAS AYNI KALEMLER BAZINDA: önceki teklif kısmi olabilir — yeni
        // teklif kapsam GENİŞLETEBİLİR (yeni kalem ilk-teklif muamelesi,
        // toplam artabilir). Kural: (a) önceden fiyatlanmış kalem
        // BIRAKILAMAZ (pahalı kalemi silip "toplam düştü" oyunu kapanır),
        // (b) o kalemlerin YENİ ara toplamı öncekinden kesin iyi olmalı —
        // önceki toplam da yalnız o kalemleri kapsıyordu, kıyas elma-elma.
        // Kalemsiz ilanda ara toplam = toplam (davranış değişmez).
        const prevIds = new Set(
          (existingBid?.items ?? []).map((x) => x.itemId),
        );
        let comparable = amount;
        let scopeExpanded = false;
        if (listingItems.length > 0 && prevIds.size > 0) {
          const qtyById = new Map(
            listingItems.map((i) => [i.id, i.quantity] as const),
          );
          const newPrice = new Map(
            bidItemsData.map((bi) => [bi.itemId, bi.unitPrice] as const),
          );
          let sub = new Prisma.Decimal(0);
          for (const pid of prevIds) {
            const up = newPrice.get(pid);
            if (up == null || up <= 0) {
              const name =
                listingItems.find((li) => li.id === pid)?.name ?? "kalem";
              throw new BadRequestException(
                `Pazarlıkta önceden fiyatladığınız kalem bırakılamaz — "${name}" için fiyat girin`,
              );
            }
            sub = sub.plus(
              new Prisma.Decimal(up).mul(qtyById.get(pid) ?? 0),
            );
          }
          comparable = sub;
          scopeExpanded = bidItemsData.length > prevIds.size;
        }
        const scopeNote = scopeExpanded
          ? "önceden fiyatladığınız kalemlerin toplamı"
          : "yeni teklifiniz";
        if (!isAscending && comparable.gte(ownLast)) {
          throw new BadRequestException(
            `Pazarlık: ${scopeNote} önceki teklifinizin (${fmt(ownLast)} ${bidSym}) altında olmalı`,
          );
        }
        if (isAscending && comparable.lte(ownLast)) {
          throw new BadRequestException(
            `Açık artırma: ${scopeNote} önceki teklifinizin (${fmt(ownLast)} ${bidSym}) üzerinde olmalı`,
          );
        }
      }
    }

    const status = isDraft ? "DRAFT" : "SUBMITTED";
    // Madde 13/14/15 — pazarlıkta: teslim bilgisi taşınan tekliften korunur
    // (dto göndermezse eski değer), geçerlilik SÜRESİZ (null) yazılır.
    const deliveryDate = dto.deliveryDate
      ? new Date(dto.deliveryDate)
      : isAuctionFormat
        ? (existingBid?.deliveryDate ?? null)
        : null;
    const deliveryTime =
      (dto.deliveryTime as BidDeliveryTime | undefined) ??
      (isAuctionFormat ? (existingBid?.deliveryTime ?? null) : null);
    const validityDays = isAuctionFormat ? null : (dto.validityDays ?? null);

    const bid = await runTenantTx(this.prisma, async (tx) => {
      // Denetim 2026-08-23 P2 #6/#13: ilan satırında kilit + canlı durum/tur
      // yeniden doğrulama (updateListing/createNextRound/cancel ile yarış) ve
      // kalemlerin hâlâ var olduğu teyidi (sil-yaz cascade'ine karşı).
      const live = await tx.$queryRaw<{ status: string; currentRound: number }[]>`SELECT status, "currentRound" FROM listings WHERE id = ${id} FOR UPDATE`;
      const row = live[0];
      if (!row || row.status !== "OPEN" || row.currentRound !== listing.currentRound) {
        throw new ConflictException(
          "İlan bu sırada güncellendi (durum/tur değişti) — sayfayı yenileyip teklifi tekrar gönderin",
        );
      }
      if (listingItems.length > 0) {
        const stillThere = await tx.listingItem.count({
          where: { id: { in: listingItems.map((li) => li.id) } },
        });
        if (stillThere !== listingItems.length) {
          throw new ConflictException(
            "İlan kalemleri bu sırada değişti — sayfayı yenileyip teklifi tekrar gönderin",
          );
        }
      }
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
          deliveryTime,
          validityDays,
          deliveryAddressId,
          note: dto.note?.trim() || null,
          createdById: user.userId,
          status,
          submittedAt: isDraft ? null : new Date(),
          round: listing.currentRound,
          // Pazarlıkta gönderim tur hakkını kullanır (taslak kullanmaz).
          activeBidRound:
            !isDraft && listing.format === "ENGLISH_AUCTION"
              ? listing.currentRound
              : null,
        },
        update: {
          amount,
          currency,
          exchangeRateSnapshot,
          deliveryDate,
          deliveryTime,
          validityDays,
          deliveryAddressId,
          note: dto.note?.trim() || null,
          status,
          version: { increment: 1 },
          // Yeniden teklif (elenmişken tekrar SUBMITTED) → eski eleme izini temizle
          // ki myBid'de "elendi" bilgisi canlı teklifle çelişmesin.
          // Denetim 2026-08-23 P2 #2: taslak güncellemesi eski gönderim damgasını
          // TAŞIMAZ (submittedAt null) — aksi halde extendBidValidity "revive"
          // yolu içeriği değişmiş taslağı gönderim kapılarını atlayarak
          // SUBMITTED'a çeviriyordu.
          ...(isDraft
            ? { submittedAt: null }
            : { submittedAt: new Date(), eliminationReason: null, eliminatedAt: null }),
          round: listing.currentRound,
          // Tur hakkı yalnız GÖNDERİMDE işlenir; taslak güncellemesi mevcut
          // hakkı (varsa) silmez.
          ...(!isDraft && listing.format === "ENGLISH_AUCTION"
            ? { activeBidRound: listing.currentRound }
            : {}),
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
            deliveryTime: bi.deliveryTime,
            currency: bi.currency,
            fxToBase: bi.fxToBase,
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

    // INV-AUDIT-1 (dalga 3): teklif gönderimi = finansal taahhüt → uyuşmazlıkta
    // delil. Commit SONRASI, bildirimden önce. Taslak loglanmaz (taahhüt değil).
    if (!isDraft) {
      await this.audit.log({
        action: "company.bid.submitted",
        actorType: "company",
        actorId: user.userId,
        actorEmail: user.email,
        tenantId: user.companyId,
        entityType: "listing_bid",
        entityId: bid.id,
        critical: true,
        metadata: {
          listingId: id,
          listingType: listing.type,
          listingNumber: listing.number ?? null,
          amount: Number(bid.amount),
          currency: bid.currency,
          round: listing.currentRound,
          version: bid.version,
          // version>1 → elenmiş/önceki teklifin üzerine yeniden gönderim.
          resubmission: bid.version > 1,
        },
      });
    }

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
    const isInvited = invitedCount > 0;
    const visible = isListingVisibleToViewer(listing.visibility, {
      isInvited,
      connectedToOwner: connected,
    });
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
    const { canBid } = listingBidEligibility(listing.visibility, {
      isInvited,
      connectedToOwner: connected,
      viewerTier: user.tier,
    });
    if (!canBid) {
      throw new ForbiddenException("Bu ilana teklif için premium gerekir");
    }
    if (!user.roles.includes(CompanyRole.SATIN_ALMACI)) {
      throw new ForbiddenException("Hemen-Al için Satın Almacı rolü gerekir");
    }
    // INV-KYC-1: Hemen-Al da bağlayıcı SUBMITTED tekliftir (placeBid kardeşi) —
    // denetim 2026-08-23 P2 #3 (erişim kapılarından SONRA, durum 400'lerinden önce).
    this.assertVerified(user, "teklif veremezsiniz");

    if (listing.status !== "OPEN") {
      throw new BadRequestException("İlan teklife kapalı");
    }
    if (listing.bidsOpenAt && Date.now() < listing.bidsOpenAt.getTime()) {
      throw new BadRequestException(
        "Teklif verme henüz başlamadı (açılış saatini bekleyin)",
      );
    }
    if (isListingClosedAt(listing.closesAt)) {
      throw new BadRequestException("Teklif süresi doldu");
    }

    // Hemen-al da bir TEKLİF gönderimidir — normal gönderimle aynı detaylar
    // zorunlu (teslim SÜRESİ + geçerlilik); teklif-ver ekranından girilir.
    // Legacy deliveryDate de kabul edilir (API geriye-uyumlu).
    // (Erişim kontrollerinden SONRA — davetsiz prober'a bilgi sızmaz.)
    if ((!input?.deliveryTime && !input?.deliveryDate) || !input?.validityDays) {
      throw new BadRequestException(
        "Hemen-Al için istenen teslim süresi ve geçerlilik süresi zorunlu",
      );
    }
    // Teslim tarihi (legacy) geçmişte olamaz (placeBid ile aynı; DTO ISO8601
    // doğruladığı için new Date güvenli).
    if (
      input.deliveryDate &&
      new Date(input.deliveryDate).getTime() < Date.now() - 86_400_000
    ) {
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

    // Taşma koruması (placeBid ile aynı) — kalem hemen-al birim fiyatları ×
    // miktar toplamı Decimal(18,2) kolonunu aşmasın.
    if (amount.gt(MAX_MONEY)) {
      throw new BadRequestException("Toplam tutar çok büyük");
    }

    const deliveryDate = input.deliveryDate ? new Date(input.deliveryDate) : null;
    const deliveryTime =
      (input.deliveryTime as BidDeliveryTime | undefined) ?? null;
    // Hemen-Al teklifi HER ZAMAN ilanın ana para birimindedir; TRY dışıysa
    // TRY karşılığı gösterimi için kur snapshot'lanır (placeBid ile aynı).
    const exchangeRateSnapshot =
      listing.primaryCurrency !== "TRY"
        ? await this.exchangeRates
            .getFreshRate(listing.primaryCurrency) // taze kur (P2 #10)
            .catch(() => null)
        : null;
    const bid = await runTenantTx(this.prisma, async (tx) => {
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
          deliveryTime,
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
          deliveryTime,
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
    // INV-AUDIT-1: Hemen-Al gönderimi de finansal taahhüt → delil (placeBid ile simetri).
    await this.audit.log({
      action: "company.bid.submitted",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing_bid",
      entityId: bid.id,
      critical: true,
      metadata: {
        listingId,
        listingType: listing.type,
        amount: Number(bid.amount),
        currency: bid.currency,
        round: listing.currentRound,
        isBuyNow: true,
      },
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
        createdById: true,
        // INV-FX-1: onay eşiği tek-baz — açılış damgasıyla TRY'ye çevir.
        auctionRateSnapshot: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi kazandırabilir");
    }
    if (!["OPEN", "IN_AWARD"].includes(listing.status)) {
      throw new BadRequestException("İlan zaten kazandırılmış veya iptal");
    }
    const neededRole =
      listing.type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;
    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException("Kazandırma için yetkiniz yok");
    }
    // 11 yönetim aksiyonuyla simetri: kazandırmayı yalnız ilanı açan doğru-taraf
    // operatörü veya firma sahibi başlatabilir (yönetim kapısını başlatan aktöre
    // uygular — onay zinciri/onAwardApproved bundan etkilenmez).
    this.assertListingManageRole(user, listing);
    // INV-KYC-1: kazandırma sipariş (para-taahhüdü) doğurur → VERIFIED ister.
    this.assertVerified(user, "kazandıramazsınız");

    const bid = await this.prisma.listingBid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        listingId: true,
        bidderCompanyId: true,
        amount: true,
        currency: true,
        exchangeRateSnapshot: true,
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
    // INV-MONEY-1: onay eşiğine DECIMAL girer (.toNumber() kaldırıldı — float
    // sapması yok). INV-FX-1: TEK BAZ (açılış damgası → teklif damgası). Baz
    // bilinmiyorsa (X3) tryVal null → ham yabancı tutar + kendi birimiyle sakla
    // ve forceRequireApproval ile eşiği ATLA(t)MA — onay zorunlu, sessiz baypas yok.
    const awardTry = this.toTryAmount(
      bid.amount,
      bid.currency,
      bid.exchangeRateSnapshot,
      listing.auctionRateSnapshot,
    );
    const res = await this.approvals.requestApproval(user, {
      listingId,
      type: "LISTING_AWARD",
      listingType: listing.type,
      amount: awardTry ?? new Prisma.Decimal(bid.amount),
      currency: awardTry ? "TRY" : bid.currency,
      forceRequireApproval: awardTry == null,
      payload: { kind: "full", bidId },
      initiatorNote: approvalNote,
    });
    if (!res.approved) {
      // Koşullu geçiş: yalnız hâlâ OPEN/CLOSED ise askıya al. Eşzamanlı başka bir
      // kazandırma bu arada AWARDED yaptıysa (count=0) üzerine yazma.
      const moved = await this.prisma.listing.updateMany({
        where: { id: listingId, status: { in: ["OPEN", "IN_AWARD"] } },
        data: { status: "IN_AWARD_APPROVAL" },
      });
      if (moved.count !== 1) {
        throw new ConflictException(
          "İlan durumu değişti; kazandırmayı tekrar deneyin",
        );
      }
      return { pendingApproval: true as const };
    }
    return this.runFullAward(listingId, bidId, {
      actorId: user.userId,
      actorEmail: user.email,
      viaApproval: false,
    });
  }

  /** Tam kazandırmayı uygula — sipariş oluştur, WON/LOST, AWARDED. */
  private async runFullAward(
    listingId: string,
    bidId: string,
    actor: AwardActor,
  ) {
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
        requireGuaranteeLetter: true,
        paymentCategory: true,
        advancePercent: true,
        paymentDays: true,
        lcType: true,
        lcConfirmed: true,
        paymentNote: true,
        deliveryTerm: true,
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
        deliveryTime: true,
        items: {
          select: {
            itemId: true,
            unitPrice: true,
            deliveryDate: true,
            deliveryTime: true,
            currency: true,
            fxToBase: true,
            note: true,
          },
        },
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
              // Kalem teslim tarihi/süresi + not teklifin kalem satırından
              // snapshot; kalem süresi yoksa teklifin genel süresi geçerli.
              deliveryDate: bi.deliveryDate,
              deliveryTime: bi.deliveryTime ?? bid.deliveryTime,
              note: bi.note,
              // Madde 9 — kalem para birimi (null = teklifin ana birimi) +
              // ana birime çevrim damgası (nöbetçi yeniden hesaplaması için).
              currency: (bi.currency ?? bid.currency) as Currency,
              fxToBase: bi.fxToBase,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // S5 NÖBETÇİSİ: order.amount'lar teklif kalemlerinden türetilir; bid.amount
    // (güvenilen stored) yalnız "bid.amount ≡ ANA BİRİMDE Σ" invariant'ı
    // geçerliyken doğrudur (placeBid sumLineTotalsInBase ile böyle hesaplar +
    // bidCount kilidi listing miktarını dondurur; çok-birimli teklifte kayıtlı
    // fxToBase damgaları kullanılır → determinizm). Invariant kırılırsa burada
    // fail-closed: yanlış tutarlı sipariş YAZILMAZ (tx öncesi).
    // Denetim 2026-08-23 P2 #1: nöbetçi yalnız teklifte KALEM SATIRI varken
    // anlamlı — TOPLU Hemen-Al (kalem satırı yazılmaz) ve kalemsiz ilan
    // tekliflerinde Σ(boş)=0 ≠ amount hep 400 veriyordu (Hemen-Al kazandırılamaz,
    // ilan IN_AWARD'da takılı). Kalemsiz → aşağıdaki tek-tutar sipariş dalı.
    if (orderItems.length > 0) {
      const recomputed = sumLineTotalsInBase(orderItems);
      if (!recomputed.equals(bid.amount)) {
        throw new BadRequestException(
          "Sipariş tutarı tutarsızlığı — kazandırma güvenlik nedeniyle durduruldu (destek ekibiyle iletişime geçin)",
        );
      }
    }

    // Madde 9 — para birimi başına AYRI sipariş: siparişler/ödemeler tek birim
    // kalır. Tek birimli teklifte tek grup = eski davranış (amount ≡ bid.amount).
    const currencyGroups = new Map<Currency, typeof orderItems>();
    for (const it of orderItems) {
      const g = currencyGroups.get(it.currency) ?? [];
      g.push(it);
      currencyGroups.set(it.currency, g);
    }
    // Kalemsiz ilan (tek-tutar teklif): tek grup, teklifin ana birimi.
    if (currencyGroups.size === 0) {
      currencyGroups.set(bid.currency as Currency, []);
    }
    // Grup tutarı KENDİ biriminde ve ÇEVRİMSİZ kesin toplamdır; tek grupta
    // (ana birim) bid.amount ile birebir (yukarıdaki nöbetçi bunu garanti eder).
    const orderPlans = [...currencyGroups.entries()].map(([cur, items]) => ({
      currency: cur,
      items,
      amount: items.length > 0 ? sumLineTotals(items) : bid.amount,
    }));

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

    const numbers = await this.nextOrderNumbers(orderPlans.length);
    const orders = await runTenantTx(this.prisma, async (tx) => {
      // Atomik durum geçişi: yalnızca OPEN|CLOSED iken AWARDED'a geç. Eşzamanlı
      // ikinci kazandırma (ya da tekrar gönderilen onay-event'i) burada count=0
      // alır ve iptal edilir — çift sipariş oluşmaz (F1/F5).
      const transition = await tx.listing.updateMany({
        where: {
          id: listingId,
          status: { in: ["OPEN", "IN_AWARD", "IN_AWARD_APPROVAL"] },
        },
        data: { status: "AWARDED", awardedAt: new Date() },
      });
      if (transition.count !== 1) {
        throw new BadRequestException("İlan zaten kazandırılmış");
      }
      // B1: koşullu-atomik winner (runItemAward:4626 simetrisi). 4026 ön-okuması
      // ile bu tx arasındaki pencerede bid elenirse (SUBMITTED→LOST) `where
      // status:SUBMITTED` 0 satır alır → throw → tx ROLLBACK: elenmiş/çekilmiş
      // teklife sipariş yazılmaz (LOST↔sipariş tutarlılığı korunur).
      const won = await tx.listingBid.updateMany({
        where: { id: bidId, status: "SUBMITTED" },
        data: { status: "WON" },
      });
      if (won.count !== 1) {
        throw new ConflictException(
          "Teklif artık geçerli değil (elenmiş veya çekilmiş) — kazandırılamaz",
        );
      }
      await tx.listingBid.updateMany({
        where: { listingId, id: { not: bidId }, status: "SUBMITTED" },
        data: { status: "LOST" },
      });
      // Madde 9: para birimi başına bir sipariş (tek birimde tek sipariş =
      // eski davranış). Grup tutarı kendi biriminde kesin Σ; nöbetçi yukarıda
      // bid.amount eşitliğini (ana birimde) zaten doğruladı.
      const createdOrders: { id: string; number: string | null }[] = [];
      for (let i = 0; i < orderPlans.length; i++) {
        const plan = orderPlans[i]!;
        const o = await tx.companyOrder.create({
          data: {
            number: numbers[i],
            listingId,
            sellerCompanyId,
            buyerCompanyId,
            amount: plan.amount,
            currency: plan.currency, // sipariş tutarı KENDİ biriminde
            // Ödeme zamanlaması ilandan snapshot'lanır — aksi halde varsayılan
            // AFTER_DELIVERY olur ve teslim öncesi (BEFORE_DELIVERY) ilanlarda
            // alıcı ön ödemeyi kaydedemez, satıcıdan teminat da istenmezdi.
            paymentTiming: listing.paymentTiming,
            // Teminat şartı da snapshot — accept guard'ı siparişten okur.
            requireGuaranteeLetter: listing.requireGuaranteeLetter,
            // Ödeme planı + teslim şekli snapshot'ı (S2) — ilan silinse de
            // (SetNull) sipariş kendi şartlarını bilir; Faz 3 motoru buradan okur.
            paymentCategory: listing.paymentCategory,
            advancePercent: listing.advancePercent,
            paymentDays: listing.paymentDays,
            lcType: listing.lcType,
            lcConfirmed: listing.lcConfirmed,
            paymentNote: listing.paymentNote,
            deliveryTerm: listing.deliveryTerm,
            status: "PENDING", // satıcı onayı bekler (accept/reject)
            deliveryAddress,
          },
        });
        if (plan.items.length > 0) {
          await tx.companyOrderItem.createMany({
            // currency/fxToBase teklif-tarafı alanlar — sipariş kalemi taşımaz
            // (siparişin kendisi tek birimlidir).
            data: plan.items.map((it) => ({
              orderId: o.id,
              name: it.name,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              deliveryDate: it.deliveryDate,
              deliveryTime: it.deliveryTime,
              note: it.note,
            })),
          });
        }
        createdOrders.push({ id: o.id, number: o.number });
      }
      return createdOrders;
      // Sipariş oluşturma birden çok yazma içerir; yüksek DB gecikmesinde
      // varsayılan 5sn interactive-transaction limiti aşılabilir.
    }, { timeout: 20000 });
    const order = orders[0]!;

    // INV-AUDIT-1: parasal taahhüt atomik oluştu → commit SONRASI, sipariş
    // BAŞINA iz (madde 9: çok-birimli teklif birden çok sipariş üretebilir).
    // Bildirim best-effort bloğundan ÖNCE ve bağımsız; log() throw etmez.
    for (let i = 0; i < orders.length; i++) {
      const o = orders[i]!;
      const plan = orderPlans[i]!;
      await this.audit.log({
        action: "company.listing.awarded",
        actorType: "company",
        actorId: actor.actorId,
        actorEmail: actor.actorEmail ?? null,
        tenantId: listing.companyId,
        entityType: "company_order",
        entityId: o.id,
        critical: true,
        metadata: {
          listingId,
          listingType: listing.type,
          orderNumber: o.number,
          bidId: bid.id,
          bidderCompanyId: bid.bidderCompanyId,
          sellerCompanyId,
          buyerCompanyId,
          amount: Number(plan.amount),
          currency: plan.currency,
          // Çok-birimli teklifte ana birimdeki toplam bağlam olarak taşınır.
          bidAmount: Number(bid.amount),
          bidCurrency: bid.currency,
          previousBidStatus: "SUBMITTED",
          newBidStatus: "WON",
          viaApproval: actor.viaApproval,
          approverUserId: actor.approverUserId ?? null,
        },
      });
    }

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
      // Madde 9: çok-birimli teklifte birden çok sipariş — hepsi sayılır.
      const orderNumbersLabel = orders
        .map((o) => o.number)
        .filter(Boolean)
        .join(", ");
      if (recipient) {
        this.notify(
          recipient,
          {
            subject: "Tebrikler — teklifiniz kazandı",
            heading: "Teklifiniz kazandı",
            paragraphs: [
              "Merhaba,",
              `Bir ihalede teklifiniz kazandı ve ${orderNumbersLabel} numaralı sipariş${orders.length > 1 ? "ler" : ""} oluştu. Sipariş detaylarını ve sonraki adımları Rothern'den takip edebilirsiniz.`,
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
        title: "Teklifiniz kazandı",
        body: `Bir ihalede teklifiniz kazandı ve ${orderNumbersLabel} numaralı sipariş${orders.length > 1 ? "ler" : ""} oluştu.`,
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
      for (const o of orders) this.realtime?.pingOrder(o.id, awardParties);
    } catch (err) {
      this.logger.warn(
        `Kazandırma sonrası bildirim başarısız (sipariş ${order.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    // Geriye-uyumluluk: tekil orderId/number ilk siparişi işaret eder;
    // çok-birimli teklifte tüm siparişler `orders` ile döner.
    return { orderId: order.id, number: order.number, orders };
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
        createdById: true,
        // INV-FX-1: kalem-award onay eşiği tek-baz (açılış damgası).
        auctionRateSnapshot: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi kazandırabilir");
    }
    if (!["OPEN", "IN_AWARD"].includes(listing.status)) {
      throw new BadRequestException("İlan zaten kazandırılmış veya iptal");
    }
    // Kalem-bazlı kazandırma her iki yönde: ALIM'da kalemler farklı satıcılara,
    // SATIS'ta farklı alıcılara verilebilir (rol, tam kazandırmayla aynı).
    const neededRole =
      listing.type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;
    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException("Kazandırma için yetkiniz yok");
    }
    // 11 yönetim aksiyonuyla simetri: kazandırmayı yalnız ilanı açan doğru-taraf
    // operatörü veya firma sahibi başlatabilir (award ile aynı kapı).
    this.assertListingManageRole(user, listing);
    // INV-KYC-1: kalem-bazlı kazandırma da sipariş doğurur → VERIFIED ister.
    this.assertVerified(user, "kazandıramazsınız");

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
      // Perf (N+1): per-bid count yerine TEK groupBy — belgesi olan bidId kümesi.
      const docCounts = await this.prisma.listingBidDocument.groupBy({
        by: ["bidId"],
        where: { bidId: { in: winningBidIds } },
        _count: { _all: true },
      });
      const bidsWithDoc = new Set(
        docCounts.filter((d) => d._count._all > 0).map((d) => d.bidId),
      );
      if (winningBidIds.some((id) => !bidsWithDoc.has(id))) {
        throw new BadRequestException(
          "Belge zorunlu — kazanan teklifin yüklü belgesi yok",
        );
      }
    }

    const total = await this.itemAwardTotal(
      listingId,
      itemAwards,
      listing.auctionRateSnapshot,
    );

    const res = await this.approvals.requestApproval(user, {
      listingId,
      type: "LISTING_AWARD",
      listingType: listing.type,
      // total TRY'ye normalize edildi (itemAwardTotal) — onay eşiği TRY bazında.
      // X-CF-1: açılış damgası → teklif damgası önceliğiyle çevrilir (tam-award ile
      // AYNI); yabancı-para teklif artık gerçek TRY tutarını gösterir. INV-FX-1 (X3):
      // baz gerçekten bilinmiyorsa (damga yok + teklif damgası yok) total null →
      // eşiği ATLA(t)MA (forceRequireApproval), onay zorunlu (sessiz fallback yok).
      amount: total ?? new Prisma.Decimal(0),
      currency: "TRY",
      forceRequireApproval: total == null,
      payload: { kind: "by-item", itemAwards },
      initiatorNote: approvalNote,
    });
    if (!res.approved) {
      const moved = await this.prisma.listing.updateMany({
        where: { id: listingId, status: { in: ["OPEN", "IN_AWARD"] } },
        data: { status: "IN_AWARD_APPROVAL" },
      });
      if (moved.count !== 1) {
        throw new ConflictException(
          "İlan durumu değişti; kazandırmayı tekrar deneyin",
        );
      }
      return { pendingApproval: true as const };
    }
    return this.runItemAward(listingId, itemAwards, {
      actorId: user.userId,
      actorEmail: user.email,
      viaApproval: false,
    });
  }

  /**
   * Ön kontrol (tıklama-anı): bu teklifi kazandırmak onay akışına takılır mı?
   * "Onaya Gönder" UI'ı YALNIZ bu true dönerse gösterilir. Kritik: preview ile
   * gerçek award-anı kararı AYNI tutarı (toTryAmount) ve AYNI eleme mantığını
   * (approvals.wouldRequireApproval → buildApprovalPlan, TEK KAYNAK) kullanır —
   * eşik-altı tutar için doğrudan kazandırılır, yanıltıcı onay dialogu çıkmaz.
   * Salt-okunur: sipariş/onay isteği OLUŞMAZ. assertListingManageRole burada
   * çağrılmaz (denial audit yan etkisi olmasın); gerçek award() commit-anında
   * tam yetki kapısını uygular.
   */
  async awardPreview(
    user: AuthenticatedCompanyUser,
    listingId: string,
    bidId: string,
  ): Promise<{ requiresApproval: boolean }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        status: true,
        auctionRateSnapshot: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi kazandırabilir");
    }
    if (!["OPEN", "IN_AWARD"].includes(listing.status)) {
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
        listingId: true,
        amount: true,
        currency: true,
        exchangeRateSnapshot: true,
      },
    });
    if (!bid || bid.listingId !== listingId) {
      throw new BadRequestException("Geçersiz teklif");
    }
    // award() ile BİREBİR aynı tutar hesabı: INV-FX-1 tek-baz (açılış → teklif
    // damgası); baz yoksa null → onay ZORUNLU (forceRequireApproval).
    const awardTry = this.toTryAmount(
      bid.amount,
      bid.currency,
      bid.exchangeRateSnapshot,
      listing.auctionRateSnapshot,
    );
    const requiresApproval = await this.approvals.wouldRequireApproval(user, {
      type: "LISTING_AWARD",
      listingType: listing.type,
      amount: awardTry ?? new Prisma.Decimal(bid.amount),
      forceRequireApproval: awardTry == null,
    });
    return { requiresApproval };
  }

  /**
   * Ön kontrol (tıklama-anı): kalem-bazlı kazandırma onay akışına takılır mı?
   * awardByItem() ile AYNI TRY toplamı (itemAwardTotal) + AYNI eleme mantığı.
   * itemAwardTotal → buildItemGroups seçimi de doğrular (geçersiz seçim → hata,
   * frontend fail-closed yakalar). Salt-okunur.
   */
  async awardByItemPreview(
    user: AuthenticatedCompanyUser,
    listingId: string,
    itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[],
  ): Promise<{ requiresApproval: boolean }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        type: true,
        status: true,
        auctionRateSnapshot: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi kazandırabilir");
    }
    if (!["OPEN", "IN_AWARD"].includes(listing.status)) {
      throw new BadRequestException("İlan zaten kazandırılmış veya iptal");
    }
    const neededRole =
      listing.type === "ALIM" ? CompanyRole.SATIN_ALMACI : CompanyRole.SATISCI;
    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException("Kazandırma için yetkiniz yok");
    }

    const total = await this.itemAwardTotal(
      listingId,
      itemAwards,
      listing.auctionRateSnapshot,
    );
    const requiresApproval = await this.approvals.wouldRequireApproval(user, {
      type: "LISTING_AWARD",
      listingType: listing.type,
      amount: total ?? new Prisma.Decimal(0),
      forceRequireApproval: total == null,
    });
    return { requiresApproval };
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
        // X-CF-1: teklifin kur damgası — onay eşiği TRY çevriminde `award` ile
        // AYNI INV-FX-1 önceliği (açılış damgası → teklif damgası) kullanılsın.
        exchangeRateSnapshot: true,
        deliveryTime: true,
        items: {
          select: {
            itemId: true,
            unitPrice: true,
            deliveryDate: true,
            deliveryTime: true,
            currency: true,
            fxToBase: true,
            note: true,
          },
        },
      },
    });
    const bidMap = new Map(bids.map((b) => [b.id, b]));

    const groups = new Map<
      string,
      {
        // Madde 9: grup anahtarı firma+PARA BİRİMİ — çok-birimli tekliften
        // kazanan kalemler birim başına AYRI siparişe düşer (sipariş tek birim).
        bidderCompanyId: string;
        orderItems: {
          name: string;
          // S8: order kalem precision — ham Prisma.Decimal (runFullAward
          // orderItems ile AYNI temsil; eskiden Number() → MAX_MONEY-ölçek
          // fiyatta fidelity farkı vardı).
          quantity: Prisma.Decimal;
          unit: string;
          unitPrice: Prisma.Decimal;
          deliveryDate: Date | null;
          deliveryTime: BidDeliveryTime | null;
          note: string | null;
        }[];
        amount: Prisma.Decimal; // sipariş tutarı — Decimal (F7), KENDİ biriminde
        currency: Currency; // bu grubun (siparişin) birimi
        exchangeRateSnapshot: Prisma.Decimal | null; // birim→TRY damgası (X-CF-1)
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
      const itemCurrency = (bi.currency ?? bid.currency) as Currency;
      const groupKey = `${bid.bidderCompanyId}::${itemCurrency}`;
      let g = groups.get(groupKey);
      if (!g) {
        g = {
          bidderCompanyId: bid.bidderCompanyId,
          orderItems: [],
          amount: new Prisma.Decimal(0),
          currency: itemCurrency,
          // Birim→TRY damgası: ana birimde teklifin damgası; kalem-birimi
          // farklıysa çapraz damga = fxToBase × (anaBirim→TRY). İkisinden biri
          // yoksa null (X-CF-1 fail-closed: onay eşiği çevrilemezse onay
          // ZORUNLU kılınır, sessiz atlama yok).
          // Denetim 2026-08-23 P2 #11: TRY teklifte anaBirim→TRY = 1 (damga
          // null olsa da) — aksi halde TRY teklif + yabancı kalem grubu null
          // kalıp onay isteği "0 TRY" ile zorunlu onaya düşüyordu.
          exchangeRateSnapshot: (() => {
            const baseToTry =
              bid.currency === "TRY"
                ? new Prisma.Decimal(1)
                : bid.exchangeRateSnapshot != null
                  ? new Prisma.Decimal(bid.exchangeRateSnapshot)
                  : null;
            if (itemCurrency === bid.currency) return baseToTry;
            if (itemCurrency === "TRY") return new Prisma.Decimal(1);
            return baseToTry != null && bi.fxToBase != null
              ? new Prisma.Decimal(bi.fxToBase).mul(baseToTry)
              : null;
          })(),
          bidIds: new Set(),
        };
        groups.set(groupKey, g);
      }
      g.bidIds.add(bid.id);
      g.orderItems.push({
        name: li.name,
        quantity: new Prisma.Decimal(qty),
        unit: li.unit,
        unitPrice: bi.unitPrice,
        deliveryDate: bi.deliveryDate,
        // Kalem süresi yoksa teklifin genel süresi snapshot'lanır.
        deliveryTime: bi.deliveryTime ?? bid.deliveryTime,
        note: bi.note,
      });
      g.amount = g.amount.plus(lineTotal(bi.unitPrice, qty)); // S5 tek-kaynak
    }
    // Grup tutarı sipariş/onay-eşiği tarafında Decimal(18,2) olarak yaşar —
    // kesirli miktarda (ör. 1.5 × 10.33) 2 basamağı aşan ara toplam DB'de
    // yuvarlanıp hesapla ıraksıyordu; tek kaynak `roundMoney` ile hizalanır
    // (denetim 2026-08-23).
    for (const g of groups.values()) g.amount = roundMoney(g.amount);
    return { groups, itemQty };
  }

  /**
   * Tutarı onay eşiği için TRY'ye çevir — TEK YETKİLİ BAZ (INV-FX-1): ilanın
   * AÇILIŞ damgası (auctionRateSnapshot) → teklifin kendi damgası → TRY=1.
   * Sıralama/ekran ile AYNI kaynak (auctionTryValue) — eski `getCurrentRate`
   * (kazandırma-günü canlı/fallback kuru) ıraksaması kapatıldı.
   *
   * X3 fail-closed: baz bilinmiyorsa (yabancı para + damga yok + teklif-damgası
   * yok) null döner — çağıran onayı ATLAMAZ, ZORUNLU kılar. Eski ham-tutar
   * fallback'i (sessizce eşiği atlatan) KALDIRILDI.
   */
  private toTryAmount(
    amount: Prisma.Decimal | number,
    currency: string,
    bidSnapshot: Prisma.Decimal | null,
    listingSnap: unknown,
  ): Prisma.Decimal | null {
    return this.auctionTryValue(
      new Prisma.Decimal(amount),
      currency,
      bidSnapshot,
      listingSnap,
    );
  }

  /**
   * Onay yönlendirmesi için kalem-bazlı kazandırmanın TOPLAM değeri — her grup
   * kendi biriminde olduğundan TRY'ye çevrilip toplanır (karışık para birimli
   * kazandırmada ham USD+TRY toplamı anlamsız olurdu; eşik yanlış yönlenirdi).
   * X-CF-1: `award` ile AYNI INV-FX-1 önceliği — açılış damgası (auctionSnap) →
   * grubun teklif damgası (g.exchangeRateSnapshot) → null. Bir grup bile
   * çevrilemezse null → onay ZORUNLU (X3 fail-closed). (Eskiden bidSnapshot
   * hardcode null'dı → düz RFQ yabancı-para grubu HER ZAMAN null döner, tam-award
   * ile ıraksardı ve onaylayıcıya 0 TRY gösterirdi.)
   */
  private async itemAwardTotal(
    listingId: string,
    itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[],
    auctionSnap: unknown,
  ): Promise<Prisma.Decimal | null> {
    const { groups } = await this.buildItemGroups(listingId, itemAwards);
    let total = new Prisma.Decimal(0);
    for (const g of groups.values()) {
      const tv = this.toTryAmount(
        g.amount,
        g.currency,
        g.exchangeRateSnapshot,
        auctionSnap,
      );
      if (tv == null) return null; // kur bilinmiyor → eşik değerlendirilemez
      total = total.plus(tv);
    }
    // INV-MONEY-1: onay eşiğine DECIMAL girer (.toNumber() kaldırıldı).
    return total;
  }

  /** Kalem-bazlı kazandırmayı uygula — kazanan firma başına sipariş. */
  private async runItemAward(
    listingId: string,
    itemAwards: { itemId: string; bidId: string; awardedQuantity?: number }[],
    actor: AwardActor,
  ) {
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
        requireGuaranteeLetter: true,
        paymentCategory: true,
        advancePercent: true,
        paymentDays: true,
        lcType: true,
        lcConfirmed: true,
        paymentNote: true,
        deliveryTerm: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    const { groups, itemQty } = await this.buildItemGroups(
      listingId,
      itemAwards,
    );
    // Madde 9: grup = (firma, para birimi) — groupArr artık grup nesneleri
    // (bidderCompanyId grup içinde taşınır).
    const groupArr = [...groups.values()];
    const numbers = await this.nextOrderNumbers(groupArr.length);
    const winningBidIds = [...new Set(itemAwards.map((a) => a.bidId))];
    // Denetim 2026-08-23 P2 #12: kaybedenleri tx ÖNCESİ yakala (tx içinde LOST
    // olurlar) → runFullAward ile aynı "ihale sonuçlandı" bildirimi.
    const losingBidderIds = [
      ...new Set(
        (
          await this.prisma.listingBid.findMany({
            where: { listingId, status: "SUBMITTED", id: { notIn: winningBidIds } },
            select: { bidderCompanyId: true },
          })
        ).map((b) => b.bidderCompanyId),
      ),
    ];

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
      // Perf (N+1): tüm kazanan adreslerinin snapshot'ı TEK sorguda, sonra
      // bellekte eşle (eski per-kazanan findUnique yerine).
      const snaps = await this.orderDeliverySnapshots(
        winBids.map((w) => w.deliveryAddressId),
      );
      for (const wb of winBids) {
        deliveryByCompany.set(
          wb.bidderCompanyId,
          wb.deliveryAddressId
            ? snaps.get(wb.deliveryAddressId)
            : undefined,
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
      // X5: "fiyatlı kalem" = unitPrice>0 — sıralama/kapsam tarafıyla AYNI tanım
      // (L:1977/2521). Eskiden filtresiz `_count._all` idi → 0-fiyatlı kalem satırı
      // olan TAM kazanan yanlışlıkla AWARDED_PARTIAL damgalanıyordu.
      where: { bidId: { in: winningBidIds }, ...PRICED_ITEM_WHERE },
      _count: { _all: true },
    });
    const pricedByBid = new Map(
      pricedCounts.map((p) => [p.bidId, p._count._all] as const),
    );

    const created = await runTenantTx(this.prisma, async (tx) => {
      // Atomik durum geçişi (çift kazandırma koruması — F1/F5).
      const transition = await tx.listing.updateMany({
        where: {
          id: listingId,
          status: { in: ["OPEN", "IN_AWARD", "IN_AWARD_APPROVAL"] },
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
      // B1: koşullu winner + count guard (runFullAward:4082 simetrisi). Ön-kontrol
      // (awardByItem:4296) ile bu tx arasındaki pencerede kazanan bir teklif
      // elenirse `where status:SUBMITTED` o satırı atlar → güncellenen kazanan
      // sayısı düşer → throw → tx ROLLBACK: aşağıdaki sipariş döngüsü (groupArr)
      // elenmiş teklife sipariş YAZMAZ (WON'suz sipariş sızıntısı kapanır).
      let awardedWinners = 0;
      if (fullWinners.length > 0) {
        const r = await tx.listingBid.updateMany({
          where: { listingId, id: { in: fullWinners }, status: "SUBMITTED" },
          data: { status: "WON" },
        });
        awardedWinners += r.count;
      }
      if (partialWinners.length > 0) {
        const r = await tx.listingBid.updateMany({
          where: { listingId, id: { in: partialWinners }, status: "SUBMITTED" },
          data: { status: "AWARDED_PARTIAL" },
        });
        awardedWinners += r.count;
      }
      if (awardedWinners !== winningBidIds.length) {
        throw new ConflictException(
          "Kazanan tekliflerden biri artık geçerli değil (elenmiş veya çekilmiş) — kazandırma uygulanamadı",
        );
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
        const g = groupArr[i]!;
        const bidderCompanyId = g.bidderCompanyId;
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
            requireGuaranteeLetter: listing.requireGuaranteeLetter,
            // Ödeme planı + teslim şekli snapshot'ı (S2) — runFullAward ile aynı.
            paymentCategory: listing.paymentCategory,
            advancePercent: listing.advancePercent,
            paymentDays: listing.paymentDays,
            lcType: listing.lcType,
            lcConfirmed: listing.lcConfirmed,
            paymentNote: listing.paymentNote,
            deliveryTerm: listing.deliveryTerm,
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
                deliveryDate: it.deliveryDate,
                deliveryTime: it.deliveryTime,
                note: it.note,
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

    // INV-AUDIT-1: her parasal taahhüt (sipariş başına) için ayrı iz — commit
    // SONRASI, bildirimden ÖNCE. Sipariş başına kayıt = kalem-bazlı dağılımda
    // her tedarikçiye giden taahhüt tekil izlenebilir.
    for (let i = 0; i < groupArr.length; i++) {
      const g = groupArr[i]!;
      const bidderCompanyId = g.bidderCompanyId;
      const o = created[i];
      if (!o) continue;
      await this.audit.log({
        action: "company.listing.awarded",
        actorType: "company",
        actorId: actor.actorId,
        actorEmail: actor.actorEmail ?? null,
        tenantId: listing.companyId,
        entityType: "company_order",
        entityId: o.id,
        critical: true,
        metadata: {
          listingId,
          listingType: listing.type,
          orderNumber: o.number,
          byItem: true,
          bidderCompanyId,
          sellerCompanyId: isAlim ? bidderCompanyId : listing.companyId,
          buyerCompanyId: isAlim ? listing.companyId : bidderCompanyId,
          amount: Number(g.amount),
          currency: g.currency,
          viaApproval: actor.viaApproval,
          approverUserId: actor.approverUserId ?? null,
        },
      });
    }

    // C8: siparişler atomik oluştu. Sonraki bildirim/realtime BEST-EFFORT —
    // hatası kazandırmayı geri almamalı (decide rollback → sonsuz döngü riski).
    try {
      // Kazanan her firmaya (teklifçi) bildirim — tek seferde topla (N+1 yerine).
      const itemWonPortal = this.bidderPortal(listing.type);
      const recipients = await this.companyRecipients(
        [...new Set(groupArr.map((g) => g.bidderCompanyId))],
        itemWonPortal,
      );
      for (let i = 0; i < groupArr.length; i++) {
        const bidderCompanyId = groupArr[i]!.bidderCompanyId;
        const o = created[i];
        const recipient = recipients.get(bidderCompanyId);
        if (recipient && o) {
          this.notify(
            recipient,
            {
              subject: "Tebrikler — teklifiniz kazandı",
              heading: "Teklifiniz kazandı",
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
            title: "Teklifiniz kazandı",
            body: `Bir ihalede teklifiniz kazandı ve ${o.number} numaralı sipariş oluştu.`,
            ctaLabel: "Siparişi Gör",
            ctaUrl: `${this.webUrl()}/company/siparis/${o.id}`,
          });
        }
      }
      // Kaybedenler (hiç kalem kazanamayan SUBMITTED teklifçiler) — runFullAward simetrisi.
      if (losingBidderIds.length > 0) {
        const lostUrl = `${this.webUrl()}/company/ilan/${listingId}`;
        const lostBody = `"${listing.title}" (${listing.number ?? "—"}) ihalesi sonuçlandı; bu turda teklifiniz kazanmadı.`;
        const lostRecipients = await this.companyRecipients(losingBidderIds, itemWonPortal);
        for (const cid of losingBidderIds) {
          const r = lostRecipients.get(cid);
          if (!r) continue;
          this.notify(
            r,
            {
              subject: "İhale sonuçlandı",
              heading: "İhale sonuçlandı",
              paragraphs: ["Merhaba,", `${lostBody} Yeni fırsatlar için Rothern'i takip edebilirsiniz.`],
              ctaLabel: "İhaleyi Gör",
              ctaUrl: lostUrl,
            },
            { type: "bid_lost", id: listingId },
          );
        }
        await this.notifications.pushToCompanies(losingBidderIds, {
          type: "bid_lost",
          portal: itemWonPortal,
          title: "İhale sonuçlandı",
          body: lostBody,
          ctaLabel: "İhaleyi Gör",
          ctaUrl: lostUrl,
          listingId,
        });
      }
      this.realtime?.pingListing(listingId, [
        listing.companyId,
        ...new Set(groupArr.map((g) => g.bidderCompanyId)),
        ...losingBidderIds,
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
  // Bkz. yukarıdaki not: suppressErrors:false olmadan company-approvals'ın
  // emitAsync + rollback sözleşmesi (fail-closed) HİÇ çalışmaz.
  @OnEvent("listing.award.approved", { suppressErrors: false })
  async onAwardApproved(payload: {
    listingId: string;
    payload: unknown;
    initiatorUserId?: string | null;
    approverUserId?: string | null;
  }) {
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
    // Onay-yolu: actorId = kazandırmayı BAŞLATAN (initiator), approverUserId =
    // son adımı onaylayan. E-posta event'te taşınmaz (opsiyonel).
    const actor: AwardActor = {
      actorId: payload.initiatorUserId ?? null,
      viaApproval: true,
      approverUserId: payload.approverUserId ?? null,
    };
    if (p.kind === "full") {
      await this.runFullAward(payload.listingId, p.bidId, actor);
    } else if (p.kind === "by-item") {
      await this.runItemAward(payload.listingId, p.itemAwards, actor);
    }
  }

  /** Kazandırma onayı reddedildi → ilan değerlendirmeye (IN_AWARD) döner. */
  @OnEvent("listing.award.rejected")
  async onAwardRejected(payload: { listingId: string }) {
    // Yalnız hâlâ onay-bekleyen ilanı kapat. İlan bu arada başka bir istekle
    // AWARDED olduysa (sipariş var) CLOSED'a düşürme — aksi halde sahibi
    // yeniden kazandırıp ikinci sipariş üretebilirdi.
    // `emit` ile ateşlenir (beklenmez) → hatayı kendimiz yakalayıp Sentry'e
    // taşırız; aksi halde ilan IN_AWARD_APPROVAL'da sessizce donardı.
    try {
      await this.prisma.listing.updateMany({
        where: { id: payload.listingId, status: "IN_AWARD_APPROVAL" },
        // Red → değerlendirme SÜRÜYOR (IN_AWARD): kazandırma denemesi yapan
        // alıcı zaten değerlendirme aşamasındaydı; tedarikçi sinyali kaybolmasın.
        data: { status: "IN_AWARD" },
      });
    } catch (err) {
      this.logger.error(
        `Kazandırma reddi uygulanamadı (${payload.listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      reportToSentry("listing.award.rejected uygulanamadı", "error", {
        tags: { area: "listings" },
        extra: { listingId: payload.listingId },
      });
    }
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
        createdById: true,
        status: true,
        currentRound: true,
        primaryCurrency: true,
        allowedCurrencies: true,
        autoExtendOnLateBid: true,
        autoExtendThresholdMin: true,
        autoExtendByMinutes: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi yeni tur açabilir");
    }
    this.assertListingManageRole(user, listing);
    // Denetim 2026-08-23 P2 #5: CLOSED = YALNIZ admin moderasyon kapatması —
    // sahip yeni turla yeniden açamaz, kazandıramaz, eleyemez (tek çıkış admin reopen).
    if (listing.status === "CLOSED") {
      throw new BadRequestException(
        "Bu ilan yönetici tarafından teklife kapatıldı — yeni tur açılamaz, destek ile iletişime geçin",
      );
    }
    if (!["OPEN", "IN_AWARD", "CLOSED_NO_AWARD"].includes(listing.status)) {
      throw new BadRequestException(
        "Yeni tur yalnızca açık veya kapanmış ilanda açılabilir",
      );
    }
    const isAuction = dto.type === "ENGLISH_AUCTION";
    // Minimum azaltma payı yok (2026-07-13) — pazarlık turunda tek kural
    // "kendi öncekinden kesin iyi" + turda tek aktif gönderim.
    const closesAt = new Date(dto.closesAt);
    if (Number.isNaN(closesAt.getTime()) || closesAt.getTime() <= Date.now()) {
      throw new BadRequestException("Kapanış tarihi gelecekte olmalı");
    }
    // Üst sınır (create ile aynı): en fazla now + 2 yıl — auto-close kırılmasın.
    if (closesAt.getTime() > Date.now() + MAX_LISTING_HORIZON_MS) {
      throw new BadRequestException("Kapanış tarihi çok ileri (en fazla 2 yıl)");
    }
    const bidsOpenAt = dto.bidsOpenAt ? new Date(dto.bidsOpenAt) : null;
    if (bidsOpenAt && bidsOpenAt.getTime() >= closesAt.getTime()) {
      throw new BadRequestException("Açılış tarihi kapanıştan önce olmalı");
    }

    // Açık eksiltme kur damgası — izinli her birimin günün TCMB kuru (kuru
    // olmayan birim burada reddedilir). Embargolu (gelecek açılışlı) turda
    // açılış cron'u announceListingOpen üzerinden AÇILIŞ GÜNÜ kuruyla tazeler.
    const rateSnapshot = isAuction
      ? await this.buildAuctionRateSnapshot(
          listing.allowedCurrencies as Currency[],
          listing.primaryCurrency as Currency,
        )
      : null;

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
    // Madde 13 (2026-08-02): teklifler HER ZAMAN otomatik ve CANLI taşınır;
    // pazarlığa geçildikten sonra geçerlilik SÜRESİZ olur (validityDays=null
    // zaten "süresiz" semantiği taşıyor — bidValidUntilMs null döner).
    // Geçerlilik-farkında eleme/taslağa-düşürme KALDIRILDI: süresi dolmuş
    // teklif de fiyatı korunarak canlı taşınır; sahibi turda güncelleyebilir.

    await runTenantTx(this.prisma, async (tx) => {
      const newRound = listing.currentRound + 1;
      // GUARD-FIRST (award/closeNoAward simetrisi): durum geçişini koşullu
      // atomik yaz — yalnız kaynak durum HÂLÂ geçerli VE tur değişmemişken.
      // Eşzamanlı award (AWARDED/IN_AWARD_APPROVAL sette YOK) veya çift-tur
      // (currentRound eşitliği) count=0 alır → rollback: ne çift sipariş ne
      // de bekleyen kazandırma onayının ezilmesi (Tur-3 denetimi #1, INV-SM-1).
      const transition = await tx.listing.updateMany({
        where: {
          id: listingId,
          status: { in: ["OPEN", "IN_AWARD", "CLOSED_NO_AWARD"] },
          currentRound: listing.currentRound,
        },
        data: {
          format: dto.type as ListingFormat,
          status: "OPEN",
          closesAt,
          bidsOpenAt,
          publishedAt: new Date(),
          // Yeni turun duyurusu yeniden yapılır — embargolu (gelecek açılışlı)
          // turda cron açılış anında gönderir.
          openNotifiedAt: null,
          closingReminderSentAt: null,
          // {increment:1} DEĞİL — sabit newRound: çift-tur self-race'inde
          // ikinci çağrı currentRound guard'ıyla zaten count=0 alır.
          currentRound: newRound,
          // Çoklu para birimi auction'da da serbest — izinli set KORUNUR;
          // kıyaslar açılış günü kur damgasıyla çevrilir.
          ...(isAuction ? { auctionRateSnapshot: rateSnapshot ?? undefined } : {}),
          isSealedBid: isAuction,
          bidVisibility: isAuction
            ? (dto.bidVisibility as ListingBidVisibility)
            : "OWN_ONLY",
          // Madde 13: son-dakika oto-uzatma seçeneği pazarlık ayarlarından
          // KALDIRILDI — dto açıkça göndermezse KAPALI (ilan mirası yok).
          autoExtendOnLateBid: isAuction
            ? (dto.autoExtendOnLateBid ?? false)
            : false,
          autoExtendThresholdMin:
            isAuction && (dto.autoExtendOnLateBid ?? false)
              ? (dto.autoExtendThresholdMin ?? 2)
              : null,
          autoExtendByMinutes:
            isAuction && (dto.autoExtendOnLateBid ?? false)
              ? (dto.autoExtendByMinutes ?? 2)
              : null,
        },
      });
      if (transition.count !== 1) {
        throw new ConflictException("İlan durumu değişti; yeni tur açılamadı");
      }
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
      // kazanabilirdi). `newRound` guard bloğunda hesaplandı.
      if (dto.carryBids === "AUTO") {
        // Primary-dışı birimdeki teklifler de CANLI taşınır: auction kıyasları
        // açılış günü kur damgasıyla birimler arası çevrilerek yapılıyor.
        // Revive edilen teklifin bayat eleme damgası temizlenir. Madde 13:
        // taşınan tekliflerin geçerliliği SÜRESİZE çekilir (validityDays=null)
        // — pazarlık boyunca teklif "dolmaz", geçerlilik yeniden sorulmaz.
        if (bids.length > 0) {
          await tx.listingBid.updateMany({
            where: { id: { in: bids.map((b) => b.id) } },
            data: {
              status: "SUBMITTED",
              round: newRound,
              eliminationReason: null,
              eliminatedAt: null,
              validityDays: null,
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
    });

    // INV-AUDIT-1: durum geçişi (yeni tur açma) — commit SONRASI, duyurudan önce.
    await this.audit.log({
      action: "company.listing.next_round_created",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing",
      entityId: listingId,
      critical: true,
      metadata: {
        listingType: listing.type,
        fromRound: listing.currentRound,
        toRound: listing.currentRound + 1,
        newFormat: dto.type,
        carryBids: dto.carryBids,
        eliminateNonBidders: dto.eliminateNonBidders ?? false,
      },
    });
    void this.announceListingOpen(listingId, "newRound").catch((err) =>
      this.logger.warn(
        `Yeni tur duyurusu başarısız (${listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    // AUTO taşımada teklif sahipleri HEMEN bilgilendirilir (embargolu açılışta
    // bile — açılıştan önce hazırlanma süresi): geçerli teklifi taşınanlara
    // "taşındı", süresi dolanlara "yeni fiyat ver ya da geçerliliği uzat".
    if (dto.carryBids === "AUTO" && bids.length > 0) {
      void this.notifyNextRoundCarry(
        listingId,
        bids.map((b) => ({
          companyId: b.bidderCompanyId,
          amount: b.amount.toString(),
          currency: b.currency,
        })),
        // Madde 13: geçerlilik süresize çekildiği için "dolmuş" küme yok.
        [],
        bidsOpenAt,
      ).catch((err) =>
        this.logger.warn(
          `Taşıma bildirimi gönderilemedi (${listingId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    }
    this.realtime?.pingListing(listingId);
    return { ok: true, round: listing.currentRound + 1 };
  }

  /**
   * Yeni tur AUTO taşıma bildirimi — geçerli teklifi taşınanlara "taşındı",
   * süresi dolanlara "yeni fiyat ver ya da geçerliliği uzat". Tur oluşturulur
   * oluşturulmaz gönderilir; embargolu açılışta tedarikçi açılıştan ÖNCE
   * haberdar olur. Tip transactional (listing_new_round) — kapatılamaz.
   */
  private async notifyNextRoundCarry(
    listingId: string,
    carried: { companyId: string; amount: string; currency: string }[],
    expiredCompanyIds: string[],
    opensAt: Date | null,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, number: true, type: true, format: true },
    });
    if (!listing) return;
    const label = `"${listing.title}" (${listing.number ?? "—"})`;
    const portal = this.bidderPortal(listing.type);
    const url = `${this.webUrl()}/company/ilan/${listingId}`;
    const isSatis = listing.type === "SATIS";
    const roundName =
      listing.format === "ENGLISH_AUCTION"
        ? isSatis
          ? "açık artırma turu"
          : "açık eksiltme turu"
        : "yeni tur";
    const opensInFuture = opensAt != null && opensAt.getTime() > Date.now();
    const opensText = opensInFuture
      ? `Açılışa (${opensAt.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}) kadar`
      : "Devam etmek için";

    const sym = (c: string) => (c === "TRY" ? "₺" : c);
    // Perf (N+1): tüm carried+expired bidder alıcıları TEK batch'te çözülür
    // (eski per-bidder companyRecipient yerine — 630/5373'teki doğru desen).
    const recipients = await this.companyRecipients(
      [...carried.map((c) => c.companyId), ...expiredCompanyIds],
      portal,
    );
    for (const c of carried) {
      const recipient = recipients.get(c.companyId) ?? null;
      const body = `${label} ihalesinde ${roundName} açıldı. ${Number(c.amount).toLocaleString("tr-TR")} ${sym(c.currency)} teklifiniz geçerlilik süresi devam ettiği için aynen taşındı — dilerseniz fiyatınızı ${isSatis ? "artırabilirsiniz" : "düşürebilirsiniz"}.`;
      if (recipient) {
        this.notify(
          recipient,
          {
            subject: "Yeni tur açıldı — teklifiniz taşındı",
            heading: "Teklifiniz yeni tura taşındı",
            paragraphs: ["Merhaba,", body],
            ctaLabel: "İhaleyi Gör",
            ctaUrl: url,
          },
          { type: "listing_new_round", id: listingId },
        );
      }
      await this.notifications.pushToCompany(c.companyId, {
        type: "listing_new_round",
        portal,
        title: "Yeni tur — teklifiniz taşındı",
        body,
        ctaLabel: "İhaleyi Gör",
        ctaUrl: url,
        listingId,
      });
    }
    for (const companyId of expiredCompanyIds) {
      const recipient = recipients.get(companyId) ?? null;
      const body = `${label} ihalesinde ${roundName} açıldı ancak önceki teklifinizin geçerlilik süresi dolduğu için teklifiniz taşınamadı. ${opensText} yeni fiyat verin ya da mevcut teklifinizin geçerlilik süresini uzatın.`;
      if (recipient) {
        this.notify(
          recipient,
          {
            subject: "Teklifinizin geçerlilik süresi doldu — işlem gerekli",
            heading: "Teklifinizin geçerliliği doldu",
            paragraphs: ["Merhaba,", body],
            ctaLabel: "İhaleyi Gör",
            ctaUrl: url,
          },
          { type: "listing_new_round", id: listingId },
        );
      }
      await this.notifications.pushToCompany(companyId, {
        type: "listing_new_round",
        portal,
        title: "Teklifinizin geçerliliği doldu",
        body,
        ctaLabel: "İhaleyi Gör",
        ctaUrl: url,
        listingId,
      });
    }
  }

  /**
   * Teklif geçerlilik süresini UZAT — fiyat değişmeden. İki durum:
   *  - SUBMITTED teklif: validityDays artırılır (alıcı beklerken süre dolmasın).
   *  - Taşıma sırasında süresi dolduğu için TASLAĞA düşmüş teklif: uzatma
   *    teklifin son geçerlilik gününü bugünün ilerisine taşıyorsa AYNI fiyatla
   *    yeniden CANLIYA döner (adım kuralı aranmaz — taşınan teklifler gibi
   *    "miras" fiyattır, yeni bir iyileştirme hamlesi değildir).
   */
  async extendBidValidity(
    user: AuthenticatedCompanyUser,
    listingId: string,
    additionalDays: number,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        type: true,
        number: true,
        status: true,
        closesAt: true,
        currentRound: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    // Uzatma sonuçlanmamış her aşamada serbest — değerlendirme uzarken
    // (IN_AWARD*) teklifin dolmaması tam da bu akışın amacı. OPEN'da
    // kapanış saati geçmişse cron'u beklemeden reddedilir. CLOSED = yönetici
    // moderasyonu (Denetim P2 #5): sahip/teklifçi aksiyonu yok, tek çıkış
    // admin reopen.
    const extendable = ["OPEN", "IN_AWARD", "IN_AWARD_APPROVAL"];
    if (listing.status === "CLOSED") {
      throw new BadRequestException(
        "Bu ilan yönetici tarafından teklife kapatıldı — geçerlilik süresi uzatılamaz",
      );
    }
    if (
      !extendable.includes(listing.status) ||
      (listing.status === "OPEN" &&
        listing.closesAt &&
        listing.closesAt.getTime() <= Date.now())
    ) {
      throw new BadRequestException(
        "İhale sonuçlandı — geçerlilik süresi uzatılamaz",
      );
    }
    const bid = await this.prisma.listingBid.findUnique({
      where: {
        listingId_bidderCompanyId: {
          listingId,
          bidderCompanyId: user.companyId,
        },
      },
      select: {
        id: true,
        status: true,
        round: true,
        amount: true,
        submittedAt: true,
        validityDays: true,
      },
    });
    if (!bid) throw new NotFoundException("Bu ilanda teklifiniz yok");
    // Teklif-yanı op-rol kapısı — placeBid ile AYNI (Faz R: SAHIP muafiyeti
    // yok; Kurucu ihalede salt-gözlemcidir). Uzatma bağlayıcı taahhüdü
    // sürdürür, DRAFT-canlandırma fiilen yeniden gönderimdir.
    const neededRole = bidderOpRole(listing.type);
    if (!user.roles.includes(neededRole)) {
      throw new ForbiddenException(
        listing.type === "ALIM"
          ? "Teklif geçerliliğini uzatmak için Satışçı rolü gerekir"
          : "Teklif geçerliliğini uzatmak için Satın Almacı rolü gerekir",
      );
    }
    if (bid.status !== "SUBMITTED" && bid.status !== "DRAFT") {
      throw new BadRequestException(
        "Bu teklifin geçerlilik süresi uzatılamaz",
      );
    }
    // Hiç gönderilmemiş (ham) taslak uzatılamaz — uzatma yalnız daha önce
    // GÖNDERİLMİŞ bir fiyatın süresini yeniler; yeni fiyat = teklif-ver akışı.
    if (!bid.submittedAt || !bid.validityDays || bid.amount.lte(0)) {
      throw new BadRequestException(
        "Uzatılacak gönderilmiş bir teklif yok — teklif verme ekranını kullanın",
      );
    }
    // Taslağa düşmüş teklif yalnız GÜNCEL turda canlandırılabilir (taşınan
    // teklif); eski tur artığı için yeni teklif verilmeli.
    if (bid.status === "DRAFT" && bid.round !== listing.currentRound) {
      throw new BadRequestException(
        "Bu teklif güncel tura ait değil — lütfen yeni teklif verin",
      );
    }
    const newValidityDays = bid.validityDays + additionalDays;
    const validUntilMs = bidValidUntilMs(bid.submittedAt, newValidityDays);
    if (validUntilMs == null || validUntilMs <= Date.now()) {
      throw new BadRequestException(
        "Uzatma yetersiz — teklifin son geçerlilik günü hâlâ geçmişte kalıyor, daha uzun bir süre girin",
      );
    }
    const validUntil = new Date(validUntilMs);
    const revived = bid.status === "DRAFT";
    // Denetim 2026-08-23 P2 #2: canlandırma = yeniden GÖNDERİM; en azından KYC
    // kapısı placeBid ile aynı (içerik kapıları: placeBid taslak güncellemesi
    // artık submittedAt'ı sıfırlar → yalnız taşınan, içeriği değişmemiş taslak
    // buraya gelebilir).
    if (revived) this.assertVerified(user, "teklif veremezsiniz");
    await this.prisma.listingBid.update({
      where: { id: bid.id },
      data: {
        validityDays: newValidityDays,
        ...(revived ? { status: "SUBMITTED" } : {}),
      },
    });
    // INV-AUDIT-1: bağlayıcı teklifin ömrünü uzatan ticari işlem iz bırakır;
    // canlandırma SUBMITTED durum geçişidir → critical.
    await this.audit.log({
      action: "company.bid.validity_extended",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing_bid",
      entityId: bid.id,
      critical: revived,
      metadata: {
        listingId,
        listingNumber: listing.number ?? null,
        additionalDays,
        validityDays: newValidityDays,
        validUntil: validUntil.toISOString(),
        revived,
      },
    });
    this.realtime?.pingListing(listingId);
    return {
      ok: true,
      validityDays: newValidityDays,
      validUntil: validUntil.toISOString(),
      revived,
    };
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
        bidsOpenAt: true,
        type: true,
        createdById: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi davet ekleyebilir");
    }
    this.assertListingManageRole(user, listing);
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
        "Kapanışa 2 dakikadan az kala pazarlık ihalesine tedarikçi eklenemez",
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
      // OPEN ilanda yeni davetlilere anında davet e-postası — embargo (açılış
      // gelecekte) sürüyorsa GÖNDERİLMEZ: ilan henüz görünmez, link 404 olurdu;
      // açılış cron'u duyuruyu tüm davetlilere yapar.
      const embargoed =
        listing.bidsOpenAt && listing.bidsOpenAt.getTime() > Date.now();
      if (listing.status === "OPEN" && !embargoed) {
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
    // Faz O dar-bağlam (denetim 2026-08-23 P2 #8): ONAYLAYICI-only/rolsüz üye
    // teklifçi adı+tutar geçmişini yalnız onay bağı varsa görür (getOne ile aynı).
    await this.assertOwnerReadContext(user, listingId);
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
      select: {
        id: true,
        companyId: true,
        status: true,
        type: true,
        createdById: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi eleme yapabilir");
    }
    this.assertListingManageRole(user, listing);
    // Karar aşaması: açık VEYA kapanmış ilanda eleme yapılabilir (award ile aynı).
    if (!["OPEN", "IN_AWARD"].includes(listing.status)) {
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
    // B1: koşullu-atomik (kardeşler cancel:5556 / closeNoAward:5916 /
    // startEvaluation:5702 ile simetri). Eşzamanlı award bu bid'i WON/
    // AWARDED_PARTIAL yaptıysa `where status:SUBMITTED` 0 satır alır → eleme
    // reddedilir: WON EZİLMEZ ve aşağıdaki "elendiniz" bildirimi TETİKLENMEZ
    // (throw). Eski koşulsuz update, award-then-eliminate yarışında kazananı
    // LOST'a çevirip yanıltıcı bildirim gönderiyordu.
    const eliminated = await this.prisma.listingBid.updateMany({
      where: { id: bidId, status: "SUBMITTED" },
      data: {
        status: "LOST",
        eliminationReason: reason?.trim() || null,
        eliminatedAt: new Date(),
      },
    });
    if (eliminated.count !== 1) {
      throw new ConflictException("Teklif durumu değişti; eleme uygulanamadı");
    }

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
      select: {
        id: true,
        companyId: true,
        status: true,
        type: true,
        createdById: true,
      },
    });
    if (!listing) throw new NotFoundException("İlan bulunamadı");
    if (listing.companyId !== user.companyId) {
      throw new ForbiddenException("Sadece ilan sahibi iptal edebilir");
    }
    this.assertListingManageRole(user, listing);
    if (listing.status !== "OPEN") {
      throw new BadRequestException("Sadece açık ilan iptal edilebilir");
    }
    await runTenantTx(this.prisma, async (tx) => {
      // GUARD-FIRST (closeNoAward simetrisi): yalnız OPEN iken iptal et.
      // award ile yarışta AWARDED yazıldıysa count=0 → rollback: CANCELLED
      // ama canlı siparişli ilan oluşmaz, aşağıdaki iptal bildirimi de hiç
      // gönderilmez (throw yukarı fırlar) — Tur-3 denetimi #5, INV-SM-1.
      const cancelled = await tx.listing.updateMany({
        where: { id: listingId, status: "OPEN" },
        data: { status: "CANCELLED", cancelReason: reason?.trim() || null },
      });
      if (cancelled.count !== 1) {
        throw new ConflictException("İlan durumu değişti; iptal uygulanamadı");
      }
      await tx.listingBid.updateMany({
        where: { listingId, status: "SUBMITTED" },
        data: { status: "LOST" },
      });
    });
    // INV-AUDIT-1: durum geçişi (ilan iptali) — commit SONRASI, bildirimden önce.
    await this.audit.log({
      action: "company.listing.cancelled",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing",
      entityId: listingId,
      critical: true,
      metadata: {
        listingType: listing.type,
        from: "OPEN",
        to: "CANCELLED",
        reason: reason?.trim() || null,
      },
    });
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
      select: {
        id: true,
        title: true,
        number: true,
        type: true,
        companyId: true,
      },
    });
    if (!listing) return;
    const label = `"${listing.title}" (${listing.number ?? "—"})`;
    const [invs, bids] = await this.inOwnerContext(listing.companyId, () =>
      Promise.all([
        this.prisma.listingInvitation.findMany({
          where: { listingId },
          select: { invitedCompanyId: true },
        }),
        this.prisma.listingBid.findMany({
          where: { listingId },
          select: { bidderCompanyId: true },
        }),
      ]),
    );
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

  /**
   * Değerlendirmeye Al — kapanış zamanı beklenmeden teklif alımını durdurur ve
   * ihaleyi değerlendirme aşamasına (IN_AWARD) geçirir. Süre dolunca cron da
   * aynı geçişi yapar; ayrı bir "Kapandı" ara durumu YOKTUR. Geri alınamaz —
   * yeniden teklif almanın yolu Yeni Tur'dur. Davetliler bilgilendirilir
   * (cron kapanışıyla aynı mesaj); sahibe bildirim atlanır (kendisi tetikledi).
   */
  async startEvaluation(user: AuthenticatedCompanyUser, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        status: true,
        type: true,
        createdById: true,
      },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    this.assertListingManageRole(user, listing);
    if (listing.status === "IN_AWARD") {
      throw new BadRequestException("İhale zaten değerlendirmede");
    }
    if (listing.status !== "OPEN") {
      throw new BadRequestException(
        "Yalnızca açık ihale değerlendirmeye alınabilir",
      );
    }
    // Koşullu geçiş: eşzamanlı kapanış cron'u / kazandırma yarışında durum
    // değiştiyse üzerine yazma (cron kazandıysa bildirim de ondan gitti).
    const updated = await this.prisma.listing.updateMany({
      where: { id: listingId, status: "OPEN" },
      data: {
        status: "IN_AWARD",
        // Teklif alımı ŞİMDİ durur.
        closesAt: new Date(),
        // Yeni değerlendirme penceresi → geçerlilik hatırlatması yeniden kurulur.
        evaluationReminderSentAt: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException("İlan durumu değişti — sayfayı yenileyin");
    }
    // INV-AUDIT-1: durum geçişi (değerlendirmeye alma) — commit SONRASI.
    await this.audit.log({
      action: "company.listing.evaluation_started",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing",
      entityId: listingId,
      critical: true,
      metadata: {
        listingType: listing.type,
        from: "OPEN",
        to: "IN_AWARD",
      },
    });
    void this.notifyListingClosed(listingId, { skipOwner: true }).catch((err) =>
      this.logger.error(
        `Kapanış bildirimi gönderilemedi (${listingId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    this.realtime?.pingListing(listingId);
    return { ok: true, status: "IN_AWARD" };
  }

  /**
   * Değerlendirme uzarken SAHİBE hatırlatma (cron çağırır): geçerliliği
   * dolmak üzere/dolmuş SUBMITTED teklif sayısıyla "karar verin ya da
   * tedarikçilerden uzatma isteyin".
   */
  async notifyEvaluationValidityReminder(
    listingId: string,
    expiringCount: number,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, number: true, type: true, companyId: true },
    });
    if (!listing) return;
    const label = `"${listing.title}" (${listing.number ?? "—"})`;
    const portal = this.ownerPortal(listing.type);
    const url = `${this.webUrl()}/company/ilan/${listingId}`;
    const body = `${label} ihalesi değerlendirmede ve ${expiringCount} teklifin geçerlilik süresi dolmak üzere (ya da doldu). Kararınızı verin ya da ${listing.type === "SATIS" ? "alıcılardan" : "tedarikçilerden"} geçerlilik uzatması isteyin.`;
    const recipient = await this.companyRecipient(listing.companyId, portal);
    if (recipient) {
      this.notify(
        recipient,
        {
          subject: "Değerlendirmedeki ihalede teklif geçerlilikleri doluyor",
          heading: "Teklif geçerlilikleri dolmak üzere",
          paragraphs: ["Merhaba,", body],
          ctaLabel: "İhaleyi Gör",
          ctaUrl: url,
        },
        { type: "listing_evaluation_reminder", id: listingId },
      );
    }
    await this.notifications.pushToCompany(listing.companyId, {
      type: "listing_evaluation_reminder",
      portal,
      title: "Teklif geçerlilikleri dolmak üzere",
      body,
      ctaLabel: "İhaleyi Gör",
      ctaUrl: url,
      listingId,
    });
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
    // Üst sınır (create/next-round ile aynı) — bu endpoint'ten de closesAt=9999
    // ile auto-close kırılmasın.
    if (date.getTime() > Date.now() + MAX_LISTING_HORIZON_MS) {
      throw new BadRequestException("Kapanış tarihi çok ileri (en fazla 2 yıl)");
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
    // F2 (INV-SM-1 kardeş simetrisi): ownerOpenListing OPEN okur ama yazım
    // koşulsuzdu → eşzamanlı cron auto-close / startEvaluation / award ilanı
    // OPEN'dan çıkarırsa closesAt artık-OPEN-olmayan ilana yazılıyordu. Bugün
    // kozmetik (closesAt status değil; placeBid/cron status-filtreli) AMA
    // kardeşleri (cancel/publish/createNextRound/startEvaluation/closeNoAward)
    // koşullu-atomik; simetriyi koru — yarın kozmetik kalacağı garanti değil.
    const changed = await this.prisma.listing.updateMany({
      where: { id: listing.id, status: "OPEN" },
      data: {
        closesAt: date,
        ...(isExtension ? { closingReminderSentAt: null } : {}),
      },
    });
    if (changed.count !== 1) {
      throw new ConflictException(
        "İlan durumu değişti; kapanış zamanı güncellenemedi",
      );
    }
    // Kural değişikliği davetlilere/teklifçilere bildirilir — özellikle öne
    // çekme "son gün veririm" diye plan yapan teklifçi için tuzak olmasın.
    const direction =
      extra?.closesAt == null
        ? "güncellendi"
        : date.getTime() > extra.closesAt.getTime()
          ? "uzatıldı"
          : "öne çekildi";
    const newClosingLabel = date.toLocaleString("tr-TR", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "Europe/Istanbul",
    });
    void this.notifyListingParticipants(listing.id, {
      subject: "İhale kapanış zamanı değişti",
      heading: "Kapanış zamanı değişti",
      body: (label) =>
        `${label} ihalesinin kapanış zamanı ${direction}. Yeni kapanış: ${newClosingLabel}.`,
      type: "listing_closing_changed",
    }).catch((err) =>
      this.logger.error(
        `Kapanış değişikliği bildirimi gönderilemedi (${listing.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      ),
    );
    this.realtime?.pingListing(listing.id);
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
      select: {
        id: true,
        companyId: true,
        type: true,
        createdById: true,
      },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    this.assertListingManageRole(user, listing);
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
      select: {
        id: true,
        companyId: true,
        status: true,
        type: true,
        createdById: true,
      },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    this.assertListingManageRole(user, listing);
    if (!["OPEN", "IN_AWARD"].includes(listing.status)) {
      throw new BadRequestException("Bu ilan kapatılamaz");
    }
    await runTenantTx(this.prisma, async (tx) => {
      // Koşullu: eşzamanlı runFullAward bu arada AWARDED + sipariş yazdıysa
      // (count=0) üzerine yazma — sipariş dururken "kazanansız kapandı" olmasın.
      const closed = await tx.listing.updateMany({
        where: { id: listing.id, status: { in: ["OPEN", "IN_AWARD"] } },
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
    // INV-AUDIT-1: durum geçişi (kazanansız kapatma) — commit SONRASI.
    await this.audit.log({
      action: "company.listing.closed_no_award",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing",
      entityId: listingId,
      critical: true,
      metadata: {
        listingType: listing.type,
        from: listing.status,
        to: "CLOSED_NO_AWARD",
        reason: reason?.trim() || null,
      },
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

  /**
   * İlan YÖNETİM aksiyonları için yetki kapısı — firma-sahipliği kapısının
   * (companyId) ÜSTÜNE eklenir; onun yerine geçmez. `assertOrderRole`
   * (company-orders) ve create/award desenlerinin simetriği.
   *
   * İzin verilir ancak ve ancak:
   *  (a) ilanın tarafına göre buy:listing:manage (ALIM) VEYA sell:listing:manage
   *      (SATIS) izni VAR, VE
   *  (b) ilanı bu kişi açmış (createdById === userId).
   * SAHİP İSTİSNASI YOK: Kurucu ihaleler üzerinde salt-gözlemcidir (ürün
   * kararı, 2026-07-23); op-rol taşısa bile yalnız KENDİ açtığı ilanı yönetir.
   * Oluşturanı ayrılan ilan için destek kanalı (admin) devreye girer.
   */
  /**
   * Faz O — owner-dal OKUMA kapısı (INV-VIS ailesi): FULL_READ (etiketler +
   * işlem rolleri) tam görür; ONAYLAYICI-only ve rolsüz kişiler yalnız
   * kendilerine düşmüş (bekleyen VEYA karar verilmiş) onaya bağlı ihaleyi
   * görür — onay kararı bağlam ister, erişim kesilmez DARALTILIR. Aksi 404
   * (varlık sızdırmaz). Sipariş tarafındaki kardeşi: assertOrderReadContext.
   */
  private async assertOwnerReadContext(
    user: AuthenticatedCompanyUser,
    listingId: string,
  ): Promise<void> {
    if (hasFullReadContext(user)) return; // Faz O tek kaynak
    const linked = await this.prisma.approvalRequest.findFirst({
      where: {
        listingId,
        companyId: user.companyId,
        steps: { some: { approverUserId: user.userId } },
      },
      select: { id: true },
    });
    if (!linked) throw new NotFoundException("İlan bulunamadı");
  }

  private assertListingManageRole(
    user: AuthenticatedCompanyUser,
    listing: { id: string; type: ListingType; createdById: string },
  ): void {
    // Kural TEK KAYNAK: listing-manage-access.ts (belge servisi de aynı
    // karardan okur — drift imkânsız).
    const denial = listingManageDenial(user, listing);
    if (denial) {
      // INV-AUDIT-1 (denial): engellenmiş ilan-yönetim denemesi iz bırakır —
      // insider'ın DENEDİĞİ, başardığı kadar değerli. State değişmez → sinyal.
      // Guard sync + 13 çağrı yeri → bilinçli await'siz (log() fail-safe).
      // critical:FALSE — denial seli Sentry'i doldurmasın (yalnız state-geçişi
      // audit'leri critical:true). PII yok, yalnız id'ler.
      void this.audit.log({
        action: "company.listing.manage_denied",
        actorType: "company",
        actorId: user.userId,
        actorEmail: user.email,
        tenantId: user.companyId,
        entityType: "listing",
        entityId: listing.id,
        critical: false,
        metadata: {
          needed: denial.needed,
          listingType: listing.type,
          reason: denial.reason,
        },
      });
      throw new ForbiddenException(LISTING_MANAGE_DENY_MESSAGE);
    }
  }

  private async ownerOpenListing(
    user: AuthenticatedCompanyUser,
    listingId: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        companyId: true,
        status: true,
        type: true,
        createdById: true,
      },
    });
    if (!listing || listing.companyId !== user.companyId) {
      throw new NotFoundException("İlan bulunamadı");
    }
    this.assertListingManageRole(user, listing);
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
      currentRound: number;
      closesAt: Date | null;
      cancelReason: string | null;
      createdAt: Date;
      company: { name: string };
      categoryIds: string[];
      keywords: string[];
      terms: string | null;
      requireAllItems: boolean;
      requireBidDocument: boolean;
      showTargetToSuppliers: boolean;
      primaryCurrency: Currency;
      allowedCurrencies: Currency[];
      // Wizard zenginleştirme
      bidsOpenAt: Date | null;
      isSealedBid: boolean;
      isLogistics: boolean;
      logistics: unknown;
      deliveryTerm: string | null;
      paymentCategory: string;
      advancePercent: number | null;
      paymentDays: number | null;
      lcType: string | null;
      lcConfirmed: boolean;
      paymentNote: string | null;
      paymentTiming: string;
      requireGuaranteeLetter: boolean;
      bidVisibility: string;
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
      // Tur sayacı — "Yeni Tur" diyaloğu mevcut turun taşınabilir teklif
      // sayısını bununla hesaplar (teklifsiz aktarma uyarısı).
      currentRound: l.currentRound,
      closesAt: l.closesAt,
      cancelReason: l.cancelReason,
      createdAt: l.createdAt,
      owner: masked ? null : { name: l.company.name },
      categoryIds: l.categoryIds,
      keywords: masked ? [] : l.keywords,
      terms: masked ? null : l.terms,
      requireAllItems: l.requireAllItems,
      requireBidDocument: l.requireBidDocument,
      showTargetToSuppliers: l.showTargetToSuppliers,
      primaryCurrency: l.primaryCurrency,
      allowedCurrencies: l.allowedCurrencies,
      // Wizard zenginleştirme (Genel Bilgi sekmesi)
      bidsOpenAt: l.bidsOpenAt,
      isSealedBid: l.isSealedBid,
      isLogistics: l.isLogistics,
      logistics: masked ? null : (l.logistics ?? null),
      deliveryTerm: l.deliveryTerm,
      paymentCategory: l.paymentCategory,
      advancePercent: l.advancePercent,
      paymentDays: l.paymentDays,
      lcType: l.lcType,
      lcConfirmed: l.lcConfirmed,
      // BK-B (kör-nokta denetimi): serbest-metin → maskeli PUBLIC teaser'da gizle
      // (description/terms/minPrice ile tutarlı; sahip IBAN/iletişim yazarsa
      // bağlantısız/davetsiz izleyiciye sızmasın).
      paymentNote: masked ? null : l.paymentNote,
      paymentTiming: l.paymentTiming,
      // Teslim-öncesi ödemede teminat şartı — teklifçi teklif vermeden görsün.
      requireGuaranteeLetter: l.requireGuaranteeLetter,
      bidVisibility: l.bidVisibility,
      decimalPlaces: l.decimalPlaces,
      sendClosingReminder: l.sendClosingReminder,
      reminderMinutesBefore: l.reminderMinutesBefore,
      autoExtendOnLateBid: l.autoExtendOnLateBid,
      autoExtendThresholdMin: l.autoExtendThresholdMin,
      autoExtendByMinutes: l.autoExtendByMinutes,
    };
  }

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
        inviter: { select: { tier: true, membershipEndAt: true } },
      },
    });
    return rows
      .filter(
        // Bağlantı, onu KURAN (davet eden) taraf PAKET kaldığı sürece geçerli —
        // hem PREMIUM hem INVITE için (ADMIN hariç: platform kararı, hep açık).
        // Ödemeyi bırakınca kendi başlattığın bağlantılar düşer → bir kez premium
        // olup bol davet atarak kalıcı "bedava ihale penceresi" kurulamaz.
        // INV-TIER-1: EFEKTİF tier (ham değil) — süre-dolma penceresinde bayat
        // PAKET bağlantıyı canlı tutmasın (cron'u beklemeden).
        (r) =>
          r.origin === "ADMIN" ||
          tierAtLeast(effectiveTier(r.inviter.tier, r.inviter.membershipEndAt), "BRONZ"),
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
