import { i18nMessage } from "../../common/i18n/http-i18n";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma, type CompanyOrderStatus } from "@rothern/db";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RealtimeService } from "../realtime/realtime.service";
import { AdminCompaniesService } from "./admin-companies.service";

/**
 * Admin inceleme + müdahale (Faz 5) — "satın alma talebimde ne oldu / siparişim takıldı"
 * destek çağrıları. Admin platform sahibidir: kapalı-zarf kuralı TARAFLAR
 * arasında geçerlidir, admin tüm teklifleri tutarlarıyla görür. Müdahaleler
 * gerekçeli + audit'li + ilgili taraflara bildirimli.
 */
@Injectable()
export class AdminInspectionService {
  private readonly logger = new Logger(AdminInspectionService.name);

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly audit: AuditService,
    private readonly companies: AdminCompaniesService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  // ── İLANLAR ────────────────────────────────────────────────

  async listListings(companyId: string) {
    const rows = await this.prisma.listing.findMany({
      where: { companyId },
      select: {
        id: true,
        number: true,
        title: true,
        type: true,
        format: true,
        status: true,
        visibility: true,
        closesAt: true,
        primaryCurrency: true,
        createdAt: true,
        _count: { select: { bids: true, invitations: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((l) => ({
      id: l.id,
      number: l.number,
      title: l.title,
      type: l.type,
      format: l.format,
      status: l.status,
      visibility: l.visibility,
      closesAt: l.closesAt,
      primaryCurrency: l.primaryCurrency,
      bidCount: l._count.bids,
      invitationCount: l._count.invitations,
      createdAt: l.createdAt,
    }));
  }

  /** Tam ilan görünümü — kalemler, davetliler, TÜM teklifler, siparişler. */
  // Not: dönüş tipi bilinçli gevşek — Prisma Decimal iç tipleri TS2742
  // (taşınabilirlik) hatası veriyor; sözleşme FE interface'lerinde.
  async listingDetail(id: string): Promise<Record<string, unknown>> {
    // Bu uç bilinçli olarak SUPPORT dahil TÜM admin rollerine açık
    // (admin-route-authz-wiring.spec sözleşmesi) → payload MİNİMUM tutulur.
    // Denetim 2026-08-26 Parça 9 #16: burada eskiden ham `include` vardı, yani
    // ilanın TÜM kolonları dönüyordu — `internalNotes` (şemada "yalnızca açan
    // firma görür") ve `logistics` Json'ındaki adres/iletişim dahil, üstelik
    // ileride eklenecek her kolon otomatik sızacak şekilde. Kardeş uç
    // `orderDetail` Parça 3 #3'te aynı gerekçeyle açık `select`e çevrilmişti;
    // bu metot atlanmıştı.
    const l = await this.prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        companyId: true,
        title: true,
        description: true,
        type: true,
        format: true,
        status: true,
        visibility: true,
        isInternational: true,
        closesAt: true,
        bidsOpenAt: true,
        publishedAt: true,
        awardedAt: true,
        cancelReason: true,
        currentRound: true,
        primaryCurrency: true,
        allowedCurrencies: true,
        requireAllItems: true,
        requireBidDocument: true,
        isSealedBid: true,
        deliveryTerm: true,
        paymentCategory: true,
        paymentTiming: true,
        advancePercent: true,
        paymentDays: true,
        lcType: true,
        lcConfirmed: true,
        requireGuaranteeLetter: true,
        createdAt: true,
        updatedAt: true,
        company: { select: { id: true, name: true, rothernId: true } },
        items: {
          select: {
            id: true,
            lineNo: true,
            name: true,
            quantity: true,
            unit: true,
          },
          orderBy: { lineNo: "asc" },
        },
        invitations: {
          select: {
            id: true,
            createdAt: true,
            invitedCompany: {
              select: { id: true, name: true, rothernId: true },
            },
          },
        },
        bids: {
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            version: true,
            round: true,
            submittedAt: true,
            deliveryDate: true,
            eliminationReason: true,
            eliminatedAt: true,
            createdAt: true,
            bidderCompany: {
              select: { id: true, name: true, rothernId: true },
            },
          },
          orderBy: { amount: "asc" },
        },
        orders: {
          select: {
            id: true,
            number: true,
            status: true,
            amount: true,
            currency: true,
            sellerCompanyId: true,
            buyerCompanyId: true,
          },
        },
      },
    });
    if (!l) throw new NotFoundException(i18nMessage("api.adminCompanies.ilanBulunamadi"));
    return l;
  }

  /**
   * Moderasyon kapatması — uygunsuz/şikayetli ilan teklife kapatılır.
   * Yalnız OPEN ilan; atomik CAS (cron/sahip kapanışıyla yarışmaz).
   * NOT: CLOSED durumu 2026-07-13'ten beri YALNIZ bu moderasyon kapatmasında
   * yazılır (normal kapanış doğrudan IN_AWARD); çözüm sonrası reopen ile açılır.
   */
  async closeListing(id: string, reason: string, adminId: string) {
    const l = await this.requireListing(id);
    const done = await this.prisma.listing.updateMany({
      where: { id, status: "OPEN" },
      data: { status: "CLOSED", cancelReason: reason.trim() },
    });
    if (done.count !== 1) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.yalnizAcikIlanKapatilabilir"));
    }
    await this.audit.log({
      action: "admin.listing.closed",
      actorType: "admin",
      actorId: adminId,
      entityType: "listing",
      entityId: id,
      metadata: { reason },
    });
    this.realtime?.pingListing(id, [l.companyId]);
    void this.companies.notifyCompany(l.companyId, {
      type: "admin_listing_closed",
      subjectKey: "api.notifications.adminInspection.ilanKapatildiBaslik",
      paragraphKeys: [
        "api.notifications.adminInspection.ilanKapatildiGovde",
      ],
      params: { baslik: l.title, gerekce: reason.trim() },
    });
    return { ok: true };
  }

  /**
   * Süre düzeltme — "kapanış tarihini yanlış girdim" çağrısı. YALNIZ UZATMA:
   * teklif almış ilanda süre kısaltmak adil değildir (geç teklifçiler elenir).
   * Uzatınca kapanış hatırlatması yeniden kurulur.
   */
  async extendListing(id: string, closesAtRaw: string, adminId: string) {
    const l = await this.requireListing(id);
    if (l.status !== "OPEN") {
      throw new BadRequestException(i18nMessage("api.adminCompanies.yalnizAcikIlaninSuresiUzatilabilir"));
    }
    const closesAt = new Date(closesAtRaw);
    if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.kapanisGelecekteOlmali"));
    }
    if (l.closesAt && closesAt <= l.closesAt) {
      throw new BadRequestException(
        i18nMessage("api.adminCompanies.yalnizUzatmaYapilabilirKisaltmaTeklifVerenlere"),
      );
    }
    await this.prisma.listing.update({
      where: { id },
      data: { closesAt, closingReminderSentAt: null },
    });
    await this.audit.log({
      action: "admin.listing.extended",
      actorType: "admin",
      actorId: adminId,
      entityType: "listing",
      entityId: id,
      metadata: { from: l.closesAt, to: closesAt },
    });
    this.realtime?.pingListing(id, [l.companyId]);
    void this.companies.notifyCompany(l.companyId, {
      type: "admin_listing_extended",
      subjectKey: "api.notifications.adminInspection.ilanUzatildiBaslik",
      paragraphKeys: [
        "api.notifications.adminInspection.ilanUzatildiGovde",
      ],
      params: { baslik: l.title, tarih: closesAt.toLocaleString("tr-TR") },
    });
    return { ok: true, closesAt };
  }

  /**
   * İlanı yeniden teklife aç — moderasyon kapatması (CLOSED) veya yanlışlıkla
   * değerlendirmeye alınmış (IN_AWARD, "Değerlendirmeye Al" geri alınamaz —
   * destek kanalı burası) ilan için; kazandırma başlamamışken (award
   * süreci/siparişe dokunmayız). Yeni kapanış şart; sahip bilgilendirilir,
   * audit'e düşer.
   */
  async reopenListing(id: string, closesAtRaw: string, adminId: string) {
    const l = await this.prisma.listing.findUnique({
      where: { id },
      select: {
        companyId: true,
        title: true,
        status: true,
        awardedAt: true,
        _count: { select: { orders: true } },
      },
    });
    if (!l) throw new NotFoundException(i18nMessage("api.adminCompanies.ilanBulunamadi"));
    if (l.awardedAt || l._count.orders > 0) {
      throw new BadRequestException(
        i18nMessage("api.adminCompanies.kazandirmaYapilmisIlanYenidenAcilamaz"),
      );
    }
    const closesAt = new Date(closesAtRaw);
    if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
      throw new BadRequestException(i18nMessage("api.adminCompanies.kapanisGelecekteOlmali"));
    }
    const done = await this.prisma.listing.updateMany({
      where: { id, status: { in: ["CLOSED", "IN_AWARD"] } },
      data: { status: "OPEN", closesAt, closingReminderSentAt: null },
    });
    if (done.count !== 1) {
      throw new BadRequestException(
        i18nMessage("api.adminCompanies.yalnizKapaliDegerlendirmedekiKazandirilmamisIlan"),
      );
    }
    await this.audit.log({
      action: "admin.listing.reopened",
      actorType: "admin",
      actorId: adminId,
      entityType: "listing",
      entityId: id,
      metadata: { closesAt },
    });
    this.realtime?.pingListing(id, [l.companyId]);
    void this.companies.notifyCompany(l.companyId, {
      type: "admin_listing_reopened",
      subjectKey: "api.notifications.adminInspection.ilanYenidenAcildiBaslik",
      paragraphKeys: [
        "api.notifications.adminInspection.ilanYenidenAcildiGovde",
      ],
      params: { baslik: l.title, tarih: closesAt.toLocaleString("tr-TR") },
    });
    return { ok: true, closesAt };
  }

  // ── SİPARİŞLER ─────────────────────────────────────────────

  async listOrders(companyId: string) {
    const rows = await this.prisma.companyOrder.findMany({
      where: {
        OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }],
      },
      select: {
        id: true,
        number: true,
        status: true,
        amount: true,
        currency: true,
        createdAt: true,
        buyerCompanyId: true,
        deliveryTerm: true,
        buyer: { select: { name: true } },
        seller: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      amount: Number(o.amount),
      currency: o.currency,
      createdAt: o.createdAt,
      /** İncelenen firmanın rolü — destek bağlamı. */
      role: o.buyerCompanyId === companyId ? "buyer" : "seller",
      buyerName: o.buyer.name,
      sellerName: o.seller.name,
      // Durum etiketi teslim şekline göre ("Gönderildi"/"Teslime Hazır").
      deliveryTerm: o.deliveryTerm,
    }));
  }

  /** Tam sipariş görünümü — kalemler + ödemeler + belgeler + zaman çizgisi. */
  // Dönüş tipi gevşek — bkz. listingDetail notu.
  async orderDetail(id: string): Promise<Record<string, unknown>> {
    // Bu uç bilinçli olarak SUPPORT dahil TÜM admin rollerine açık (controller
    // yorumu + admin-route-authz-wiring.spec sözleşmesi) → payload MİNİMUM
    // tutulur: `...o` spread'i ile dönen banka IBAN'ı (bankIban/
    // bankAccountHolder) ve teslimat adresi PII'si (contactName/phone/
    // addressLine) DIŞARIDA — kardeş uç admin-company-users da aynı gerekçeyle
    // `phone`u projeksiyondan çıkarıyor (denetim 2026-08-23 Parça 3 #3).
    const o = await this.prisma.companyOrder.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        amount: true,
        currency: true,
        listingId: true,
        buyerCompanyId: true,
        sellerCompanyId: true,
        paymentTiming: true,
        paymentCategory: true,
        advancePercent: true,
        paymentDays: true,
        lcType: true,
        lcConfirmed: true,
        paymentNote: true,
        deliveryTerm: true,
        requireGuaranteeLetter: true,
        acceptedNote: true,
        expectedDeliveryDate: true,
        invoiceNumber: true,
        deliveryNote: true,
        completedNote: true,
        cancelReason: true,
        rejectedReason: true,
        rejectedAt: true,
        cancelRequestedAt: true,
        cancelRequestReason: true,
        disputedAt: true,
        defectNotifiedAt: true,
        defectReason: true,
        lcOpenedAt: true,
        lcAcceptedAt: true,
        lcPaidAt: true,
        acceptedAt: true,
        deliveryStartedAt: true,
        deliveredAt: true,
        completedAt: true,
        cancelledAt: true,
        createdAt: true,
        updatedAt: true,
        buyer: { select: { id: true, name: true, rothernId: true } },
        seller: { select: { id: true, name: true, rothernId: true } },
        listing: { select: { id: true, title: true, number: true } },
        items: {
          select: {
            id: true,
            name: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            deliveryDate: true,
            note: true,
          },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            rejectReason: true,
            confirmedAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!o) throw new NotFoundException(i18nMessage("api.adminCompanies.siparisBulunamadi"));
    // F5 (X7 frontend kardeşi): onaylı ödeme toplamı DECIMAL ile burada hesaplanır
    // (INV-MONEY-1) → admin sayfası float `reduce` ile yeniden toplamasın; kuruş
    // sapması olmadan "Onaylı: X" ve iptal-uyarısı bu değeri kullanır.
    const paymentConfirmed = o.payments
      .filter((p) => p.status === "CONFIRMED")
      .reduce((s, p) => s.plus(p.amount), new Prisma.Decimal(0))
      .toFixed(2);
    // Decimal → number (JSON temiz + TS2742 taşınabilirlik).
    return {
      ...o,
      amount: Number(o.amount),
      paymentConfirmed,
      items: o.items.map((i) => ({
        ...i,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
      })),
      payments: o.payments.map((p) => ({ ...p, amount: Number(p.amount) })),
    };
  }

  /**
   * Takılmış siparişi iptal — para-yolu guard'larına saygılı: onaylı ödeme
   * varsa İPTAL EDİLEMEZ (para el değiştirdi, iade süreci ayrı iş).
   * FOR UPDATE + CAS: taraf aksiyonlarıyla (accept/ödeme onayı) serileşir.
   */
  async cancelOrder(id: string, reason: string, adminId: string) {
    const order = await this.prisma.companyOrder.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        listingId: true,
        buyerCompanyId: true,
        sellerCompanyId: true,
      },
    });
    if (!order) throw new NotFoundException(i18nMessage("api.adminCompanies.siparisBulunamadi"));
    // Admin, taraflardan farklı olarak IN_DELIVERY'deki takılmış siparişi de
    // iptal edebilir (destek müdahalesi); DELIVERED/COMPLETED dokunulmaz.
    const CANCELABLE: CompanyOrderStatus[] = [
      "PENDING",
      "ACCEPTED",
      "CREATED",
      "IN_DELIVERY",
    ];
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ status: CompanyOrderStatus }[]>`
        SELECT "status" FROM "company_orders" WHERE "id" = ${id} FOR UPDATE`;
      const status = rows[0]?.status;
      if (!status || !CANCELABLE.includes(status)) {
        throw new BadRequestException(
          i18nMessage("api.adminCompanies.siparisBuDurumdaIptalEdilemezTeslim"),
        );
      }
      const confirmedPayments = await tx.companyOrderPayment.count({
        where: { orderId: id, status: "CONFIRMED" },
      });
      if (confirmedPayments > 0) {
        throw new BadRequestException(
          i18nMessage("api.adminCompanies.onayliOdemesiOlanSiparisIptalEdilemez"),
        );
      }
      const done = await tx.companyOrder.updateMany({
        where: { id, status: { in: CANCELABLE } },
        data: {
          status: "CANCELLED",
          cancelReason: `[Yönetici] ${reason.trim()}`,
          cancelledAt: new Date(),
        },
      });
      if (done.count !== 1) {
        throw new BadRequestException(i18nMessage("api.adminCompanies.siparisDurumuAzOnceDegisti"));
      }
    });
    // Dalga B (denetim 2026-08-26 Parça 9): iptal İLANA dokunmaz — kazandırma
    // geri alma (un-award) bilinçli olarak YOK. Bunun pratik sonucu, ilanın
    // son canlı siparişi iptal edilince AWARDED ama siparişsiz kalmasıdır ve
    // alıcının ürün içinde kurtarma yolu bulunmaz. Ürün kararını burada
    // DEĞİŞTİRMİYORUZ; durumu GÖRÜNÜR kılıyoruz: audit'e yazılır ve taraflara
    // bunun ne anlama geldiği söylenir.
    const stranded = order.listingId
      ? (await this.prisma.companyOrder.count({
          where: {
            listingId: order.listingId,
            status: { notIn: ["CANCELLED", "REJECTED"] },
          },
        })) === 0
      : false;
    await this.audit.log({
      action: "admin.order.cancelled",
      actorType: "admin",
      actorId: adminId,
      entityType: "order",
      entityId: id,
      metadata: {
        reason,
        listingId: order.listingId ?? null,
        // "Bu iptalle ilan canlı siparişsiz kaldı" — destek/uyum izi.
        listingLeftWithoutLiveOrder: stranded,
      },
      critical: true,
    });
    this.realtime?.pingOrder(id, [
      order.buyerCompanyId,
      order.sellerCompanyId,
    ]);
    // Sipariş numarası varsa "N numaralı sipariş", yoksa "İlgili sipariş":
    // cümlenin ÖZNESİ değiştiği için iki ayrı anahtar (çeviride sözcük sırası
    // değişebilir, parça birleştirmek yanlış olurdu).
    const numarali = !!order.number;
    for (const companyId of [order.buyerCompanyId, order.sellerCompanyId]) {
      void this.companies.notifyCompany(companyId, {
        type: "admin_order_cancelled",
        subjectKey: "api.notifications.adminInspection.siparisIptalBaslik",
        bodyKey: stranded
          ? numarali
            ? "api.notifications.adminInspection.siparisIptalGovdeNumaraliSahipsiz"
            : "api.notifications.adminInspection.siparisIptalGovdeSahipsiz"
          : numarali
            ? "api.notifications.adminInspection.siparisIptalNumarali"
            : "api.notifications.adminInspection.siparisIptalGenel",
        paragraphKeys: [
          numarali
            ? "api.notifications.adminInspection.siparisIptalNumarali"
            : "api.notifications.adminInspection.siparisIptalGenel",
          stranded && "api.notifications.adminInspection.siparisIptalSahipsizTalep",
        ],
        params: { numara: order.number ?? "", gerekce: reason.trim() },
      });
    }
    return { ok: true };
  }

  // ── BAĞLANTILAR + DAVETLER ─────────────────────────────────

  async listConnections(companyId: string) {
    const [connections, referrals] = await Promise.all([
      this.prisma.companyConnection.findMany({
        where: {
          OR: [
            { inviterCompanyId: companyId },
            { inviteeCompanyId: companyId },
          ],
        },
        select: {
          id: true,
          status: true,
          origin: true,
          createdAt: true,
          decidedAt: true,
          inviterCompanyId: true,
          inviter: { select: { id: true, name: true, rothernId: true } },
          invitee: { select: { id: true, name: true, rothernId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      this.prisma.companyReferralInvite.findMany({
        where: { inviterCompanyId: companyId },
        select: {
          id: true,
          email: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return {
      connections: connections.map((c) => ({
        id: c.id,
        status: c.status,
        origin: c.origin,
        createdAt: c.createdAt,
        decidedAt: c.decidedAt,
        direction: c.inviterCompanyId === companyId ? "outgoing" : "incoming",
        other:
          c.inviterCompanyId === companyId ? c.invitee : c.inviter,
      })),
      referralInvites: referrals,
    };
  }

  /** Bekleyen bağlantı davetini iptal et (ACTIVE bağlantıya dokunulmaz). */
  async revokeConnectionInvite(id: string, adminId: string) {
    const done = await this.prisma.companyConnection.deleteMany({
      where: { id, status: "PENDING" },
    });
    if (done.count !== 1) {
      throw new BadRequestException(
        i18nMessage("api.adminCompanies.yalnizBekleyenBaglantiDavetiIptalEdilebilir"),
      );
    }
    await this.audit.log({
      action: "admin.connection_invite.revoked",
      actorType: "admin",
      actorId: adminId,
      entityType: "connection",
      entityId: id,
    });
    return { ok: true };
  }

  /** Bekleyen referans (e-posta) davetini iptal et. */
  async revokeReferralInvite(id: string, adminId: string) {
    const done = await this.prisma.companyReferralInvite.deleteMany({
      where: { id, status: "PENDING" },
    });
    if (done.count !== 1) {
      throw new BadRequestException(
        i18nMessage("api.adminCompanies.yalnizBekleyenReferansDavetiIptalEdilebilir"),
      );
    }
    await this.audit.log({
      action: "admin.referral_invite.revoked",
      actorType: "admin",
      actorId: adminId,
      entityType: "referral_invite",
      entityId: id,
    });
    return { ok: true };
  }

  private async requireListing(id: string) {
    const l = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, companyId: true, title: true, status: true, closesAt: true },
    });
    if (!l) throw new NotFoundException(i18nMessage("api.adminCompanies.ilanBulunamadi"));
    return l;
  }
}
