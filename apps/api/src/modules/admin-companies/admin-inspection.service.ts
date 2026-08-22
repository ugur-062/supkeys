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
 * Admin inceleme + müdahale (Faz 5) — "ihalemde ne oldu / siparişim takıldı"
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
    const l = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, rothernId: true } },
        items: {
          select: {
            id: true,
            lineNo: true,
            name: true,
            quantity: true,
            unit: true,
            minUnitPrice: true,
            buyNowUnitPrice: true,
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
            isBuyNow: true,
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
    if (!l) throw new NotFoundException("İlan bulunamadı");
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
      throw new BadRequestException("Yalnız AÇIK ilan kapatılabilir");
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
    void this.companies.notifyCompany(
      l.companyId,
      "İlanınız yönetici tarafından kapatıldı",
      [
        "Merhaba,",
        `"${l.title}" ilanınız platform yöneticisi tarafından teklife kapatıldı. Gerekçe: ${reason.trim()}`,
      ],
      "admin_listing_closed",
    );
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
      throw new BadRequestException("Yalnız AÇIK ilanın süresi uzatılabilir");
    }
    const closesAt = new Date(closesAtRaw);
    if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
      throw new BadRequestException("Kapanış gelecekte olmalı");
    }
    if (l.closesAt && closesAt <= l.closesAt) {
      throw new BadRequestException(
        "Yalnız uzatma yapılabilir — kısaltma teklif verenlere haksızlık olur",
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
    void this.companies.notifyCompany(
      l.companyId,
      "İlan kapanış süresi uzatıldı",
      [
        "Merhaba,",
        `"${l.title}" ilanınızın kapanış tarihi destek talebiniz üzerine ${closesAt.toLocaleString("tr-TR")} olarak güncellendi.`,
      ],
      "admin_listing_extended",
    );
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
    if (!l) throw new NotFoundException("İlan bulunamadı");
    if (l.awardedAt || l._count.orders > 0) {
      throw new BadRequestException(
        "Kazandırma yapılmış ilan yeniden açılamaz",
      );
    }
    const closesAt = new Date(closesAtRaw);
    if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
      throw new BadRequestException("Kapanış gelecekte olmalı");
    }
    const done = await this.prisma.listing.updateMany({
      where: { id, status: { in: ["CLOSED", "IN_AWARD"] } },
      data: { status: "OPEN", closesAt, closingReminderSentAt: null },
    });
    if (done.count !== 1) {
      throw new BadRequestException(
        "Yalnız kapalı/değerlendirmedeki (kazandırılmamış) ilan yeniden açılabilir",
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
    void this.companies.notifyCompany(
      l.companyId,
      "İlanınız yeniden açıldı",
      [
        "Merhaba,",
        `"${l.title}" ilanınız destek talebiniz üzerine yeniden teklife açıldı. Yeni kapanış: ${closesAt.toLocaleString("tr-TR")}.`,
      ],
      "admin_listing_reopened",
    );
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
    const o = await this.prisma.companyOrder.findUnique({
      where: { id },
      include: {
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
    if (!o) throw new NotFoundException("Sipariş bulunamadı");
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
        buyerCompanyId: true,
        sellerCompanyId: true,
      },
    });
    if (!order) throw new NotFoundException("Sipariş bulunamadı");
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
          "Sipariş bu durumda iptal edilemez (teslim/tamamlanmış olabilir)",
        );
      }
      const confirmedPayments = await tx.companyOrderPayment.count({
        where: { orderId: id, status: "CONFIRMED" },
      });
      if (confirmedPayments > 0) {
        throw new BadRequestException(
          "Onaylı ödemesi olan sipariş iptal edilemez — önce iade süreci",
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
        throw new BadRequestException("Sipariş durumu az önce değişti");
      }
    });
    await this.audit.log({
      action: "admin.order.cancelled",
      actorType: "admin",
      actorId: adminId,
      entityType: "order",
      entityId: id,
      metadata: { reason },
    });
    this.realtime?.pingOrder(id, [
      order.buyerCompanyId,
      order.sellerCompanyId,
    ]);
    const label = order.number ? `${order.number} numaralı` : "İlgili";
    for (const companyId of [order.buyerCompanyId, order.sellerCompanyId]) {
      void this.companies.notifyCompany(
        companyId,
        "Sipariş yönetici tarafından iptal edildi",
        [
          "Merhaba,",
          `${label} sipariş platform yöneticisi tarafından iptal edildi. Gerekçe: ${reason.trim()}`,
        ],
        "admin_order_cancelled",
      );
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
        "Yalnız BEKLEYEN bağlantı daveti iptal edilebilir",
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
        "Yalnız BEKLEYEN referans daveti iptal edilebilir",
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
    if (!l) throw new NotFoundException("İlan bulunamadı");
    return l;
  }
}
