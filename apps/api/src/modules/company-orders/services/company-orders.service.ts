import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Prisma,
  type CompanyOrderPaymentTiming,
  type CompanyOrderStatus,
} from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import type {
  AcceptOrderDto,
  OrderNoteDto,
  ShipOrderDto,
} from "../dto/order-action.dto";
import { EmailService } from "../../email/email.service";

@Injectable()
export class CompanyOrdersService {
  private readonly logger = new Logger(CompanyOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private webUrl(): string {
    return this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
  }

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

  /** Sipariş durumu değişince karşı tarafa bildirim (fire-and-forget). */
  private async notifyOrderParty(
    orderId: string,
    recipientCompanyId: string,
    subject: string,
    heading: string,
    paragraph: string,
  ): Promise<void> {
    const to = await this.companyRecipient(recipientCompanyId);
    if (!to) return;
    void this.email
      .send({
        to: { email: to.email, name: to.name },
        templateData: {
          template: "notification",
          data: {
            subject,
            heading,
            paragraphs: ["Merhaba,", paragraph],
            ctaLabel: "Siparişi Gör",
            ctaUrl: `${this.webUrl()}/company/siparis/${orderId}`,
          },
        },
        subject,
        context: { type: "order_status_changed", id: orderId },
      })
      .catch((err) =>
        this.logger.error(
          `Sipariş bildirimi gönderilemedi (${to.email}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  /** Satıcı siparişi onaylar: PENDING → ACCEPTED (+ teslim tarihi/banka/not). */
  async accept(user: AuthenticatedCompanyUser, id: string, input: AcceptOrderDto) {
    const res = await this.transition(user, id, {
      side: "seller",
      from: "PENDING",
      to: "ACCEPTED",
      data: {
        acceptedAt: new Date(),
        acceptedNote: input.acceptedNote?.trim() || null,
        bankAccountHolder: input.bankAccountHolder?.trim() || null,
        bankIban: input.bankIban?.trim() || null,
        expectedDeliveryDate: new Date(input.expectedDeliveryDate),
      },
    });
    await this.notifyOrderParty(
      id,
      res.order.buyerCompanyId,
      "Siparişiniz onaylandı",
      "Sipariş onaylandı",
      `${this.orderLabel(res.order.number)} siparişiniz satıcı tarafından onaylandı ve hazırlanıyor.`,
    );
    return { ok: res.ok, status: res.status };
  }

  /** Satıcı siparişi reddeder: PENDING → REJECTED (+ gerekçe). */
  async reject(user: AuthenticatedCompanyUser, id: string, reason?: string) {
    const res = await this.transition(user, id, {
      side: "seller",
      from: "PENDING",
      to: "REJECTED",
    });
    await this.prisma.companyOrder.update({
      where: { id },
      data: { rejectedReason: reason?.trim() || null, rejectedAt: new Date() },
    });
    await this.notifyOrderParty(
      id,
      res.order.buyerCompanyId,
      "Siparişiniz reddedildi",
      "Sipariş reddedildi",
      `${this.orderLabel(res.order.number)} siparişiniz satıcı tarafından reddedildi.${
        reason ? ` Gerekçe: ${reason}` : ""
      }`,
    );
    return { ok: res.ok, status: res.status };
  }

  /** Satıcı kargoya verir: ACCEPTED → IN_DELIVERY (+ fatura no zorunlu). */
  async ship(user: AuthenticatedCompanyUser, id: string, input: ShipOrderDto) {
    const res = await this.transition(user, id, {
      side: "seller",
      from: ["ACCEPTED", "CREATED"],
      to: "IN_DELIVERY",
      data: {
        invoiceNumber: input.invoiceNumber.trim(),
        deliveryNote: input.deliveryNote?.trim() || null,
        deliveryStartedAt: new Date(),
      },
    });
    await this.notifyOrderParty(
      id,
      res.order.buyerCompanyId,
      "Siparişiniz kargoya verildi",
      "Sipariş yolda",
      `${this.orderLabel(res.order.number)} siparişiniz kargoya verildi (Fatura no: ${input.invoiceNumber.trim()}).`,
    );
    return { ok: res.ok, status: res.status };
  }

  /**
   * Alıcı teslim alır. AFTER_DELIVERY → DELIVERED (ödeme adımı açılır);
   * BEFORE_DELIVERY → doğrudan COMPLETED (ödeme zaten alınmış). Eski "Teslim
   * Aldım" davranışıyla aynı.
   */
  async receive(user: AuthenticatedCompanyUser, id: string, input: OrderNoteDto) {
    const order = await this.loadParticipant(user, id);
    const toCompleted = order.paymentTiming === "BEFORE_DELIVERY";
    const res = await this.transition(user, id, {
      side: "buyer",
      from: "IN_DELIVERY",
      to: toCompleted ? "COMPLETED" : "DELIVERED",
      data: toCompleted
        ? {
            deliveredAt: new Date(),
            completedAt: new Date(),
            completedNote: input.note?.trim() || null,
          }
        : { deliveredAt: new Date(), completedNote: input.note?.trim() || null },
    });
    await this.notifyOrderParty(
      id,
      res.order.sellerCompanyId,
      toCompleted ? "Sipariş tamamlandı" : "Sipariş teslim alındı",
      toCompleted ? "Sipariş tamamlandı" : "Teslim alındı",
      `${this.orderLabel(res.order.number)} siparişi alıcı tarafından teslim alındı${
        toCompleted ? " ve tamamlandı" : ""
      }.`,
    );
    return { ok: res.ok, status: res.status };
  }

  /** Alıcı siparişi tamamlar: DELIVERED → COMPLETED (+ not). */
  async complete(user: AuthenticatedCompanyUser, id: string, input: OrderNoteDto) {
    const res = await this.transition(user, id, {
      side: "buyer",
      from: "DELIVERED",
      to: "COMPLETED",
      data: { completedAt: new Date(), completedNote: input.note?.trim() || null },
    });
    await this.notifyOrderParty(
      id,
      res.order.sellerCompanyId,
      "Sipariş tamamlandı",
      "Sipariş tamamlandı",
      `${this.orderLabel(res.order.number)} siparişi tamamlandı.`,
    );
    return { ok: res.ok, status: res.status };
  }

  /** Alıcı siparişi iptal eder (teslimat öncesi): PENDING/ACCEPTED → CANCELLED. */
  async cancel(user: AuthenticatedCompanyUser, id: string, reason?: string) {
    const res = await this.transition(user, id, {
      side: "buyer",
      from: ["PENDING", "ACCEPTED", "CREATED"],
      to: "CANCELLED",
      data: { cancelReason: reason?.trim() || null, cancelledAt: new Date() },
    });
    await this.notifyOrderParty(
      id,
      res.order.sellerCompanyId,
      "Sipariş iptal edildi",
      "Sipariş iptal edildi",
      `${this.orderLabel(res.order.number)} siparişi alıcı tarafından iptal edildi.${
        reason ? ` Gerekçe: ${reason}` : ""
      }`,
    );
    return { ok: res.ok, status: res.status };
  }

  private orderLabel(number: string | null): string {
    return number ? `${number} numaralı` : "İlgili";
  }

  private async transition(
    user: AuthenticatedCompanyUser,
    id: string,
    rule: {
      side: "seller" | "buyer";
      from: CompanyOrderStatus | CompanyOrderStatus[];
      to: CompanyOrderStatus;
      data?: Prisma.CompanyOrderUpdateInput;
    },
  ) {
    const order = await this.loadParticipant(user, id);
    const isSeller = order.sellerCompanyId === user.companyId;
    const allowed = rule.side === "seller" ? isSeller : !isSeller;
    if (!allowed) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    const fromList = Array.isArray(rule.from) ? rule.from : [rule.from];
    if (!fromList.includes(order.status)) {
      throw new BadRequestException("Sipariş bu durumda bu işleme uygun değil");
    }
    await this.prisma.companyOrder.update({
      where: { id },
      data: { status: rule.to, ...rule.data },
    });
    return { ok: true, status: rule.to, order };
  }

  private async loadParticipant(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.prisma.companyOrder.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        paymentTiming: true,
        sellerCompanyId: true,
        buyerCompanyId: true,
      },
    });
    if (
      !order ||
      (order.sellerCompanyId !== user.companyId &&
        order.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    return order;
  }

  // ---- Ödeme kayıtları (alıcı kaydeder, satıcı onaylar/reddeder) ----

  /**
   * Ödeme açık mı? (eski OrderPaymentsService.isPaymentOpen ile aynı mantık)
   *  - BEFORE_DELIVERY: satıcı onayından sonra (ACCEPTED, IN_DELIVERY, COMPLETED)
   *  - AFTER_DELIVERY:  alıcı teslim aldıktan sonra (DELIVERED, COMPLETED)
   */
  private isPaymentOpen(
    timing: CompanyOrderPaymentTiming,
    status: CompanyOrderStatus,
  ): boolean {
    if (timing === "BEFORE_DELIVERY") {
      // Satıcı onayından sonra, teslim alınmadan önce ödenir.
      return (
        status === "ACCEPTED" ||
        status === "IN_DELIVERY" ||
        status === "COMPLETED"
      );
    }
    // AFTER_DELIVERY: yalnızca teslim alındıktan sonra (COMPLETED'da kapanır).
    return status === "DELIVERED";
  }

  /** Alıcı ödeme kaydı oluşturur (AWAITING_CONFIRMATION). */
  async recordPayment(
    user: AuthenticatedCompanyUser,
    id: string,
    input: {
      amount: number;
      method?: string;
      note?: string;
      chequeNo?: string;
      chequeBank?: string;
      chequeDueDate?: string;
    },
  ) {
    const order = await this.loadParticipant(user, id);
    if (order.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Ödemeyi yalnızca alıcı kaydedebilir");
    }
    if (!this.isPaymentOpen(order.paymentTiming, order.status)) {
      throw new BadRequestException(
        "Bu sipariş şu an ödeme kaydına uygun değil",
      );
    }
    if (!(input.amount > 0)) {
      throw new BadRequestException("Tutar 0'dan büyük olmalı");
    }
    // Kalan tutar koruması — AWAITING + CONFIRMED toplamı sipariş tutarını aşamaz.
    const [orderAmt, existing] = await Promise.all([
      this.prisma.companyOrder.findUnique({
        where: { id },
        select: { amount: true },
      }),
      this.prisma.companyOrderPayment.findMany({
        where: {
          orderId: id,
          status: { in: ["AWAITING_CONFIRMATION", "CONFIRMED"] },
        },
        select: { amount: true },
      }),
    ]);
    const cap = orderAmt ? Number(orderAmt.amount) : 0;
    const recorded = existing.reduce((s, p) => s + Number(p.amount), 0);
    if (recorded + input.amount > cap + 0.01) {
      const remaining = Math.max(0, cap - recorded);
      throw new BadRequestException(
        `Kalan ödeme ${remaining.toLocaleString("tr-TR")} ₺ — bu tutarı aşan ödeme kaydedilemez`,
      );
    }
    const isCheque = input.method?.trim() === "Çek";
    const payment = await this.prisma.companyOrderPayment.create({
      data: {
        orderId: id,
        amount: input.amount,
        method: input.method?.trim() || null,
        note: input.note?.trim() || null,
        recordedByCompanyId: user.companyId,
        recordedByUserId: user.userId,
        chequeNo: isCheque ? input.chequeNo?.trim() || null : null,
        chequeBank: isCheque ? input.chequeBank?.trim() || null : null,
        chequeDueDate:
          isCheque && input.chequeDueDate
            ? new Date(input.chequeDueDate)
            : null,
      },
    });
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Yeni ödeme kaydı — onayınız bekleniyor",
      "Ödeme kaydedildi",
      `${this.orderLabel(order.number)} sipariş için ${input.amount.toLocaleString("tr-TR")} ₺ tutarında ödeme kaydedildi. Onaylamanız bekleniyor.`,
    );
    return this.serializePayment(payment);
  }

  /** Satıcı ödemeyi onaylar: AWAITING_CONFIRMATION → CONFIRMED. */
  confirmPayment(
    user: AuthenticatedCompanyUser,
    id: string,
    paymentId: string,
  ) {
    return this.paymentDecision(user, id, paymentId, "CONFIRMED");
  }

  /** Satıcı ödemeyi reddeder: AWAITING_CONFIRMATION → REJECTED (+ gerekçe). */
  rejectPayment(
    user: AuthenticatedCompanyUser,
    id: string,
    paymentId: string,
    reason?: string,
  ) {
    return this.paymentDecision(user, id, paymentId, "REJECTED", reason);
  }

  private async paymentDecision(
    user: AuthenticatedCompanyUser,
    id: string,
    paymentId: string,
    decision: "CONFIRMED" | "REJECTED",
    reason?: string,
  ) {
    const order = await this.loadParticipant(user, id);
    if (order.sellerCompanyId !== user.companyId) {
      throw new ForbiddenException("Ödemeyi yalnızca satıcı onaylayabilir");
    }
    const payment = await this.prisma.companyOrderPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.orderId !== id) {
      throw new NotFoundException("Ödeme kaydı bulunamadı");
    }
    if (payment.status !== "AWAITING_CONFIRMATION") {
      throw new BadRequestException("Bu ödeme zaten sonuçlanmış");
    }
    const updated = await this.prisma.companyOrderPayment.update({
      where: { id: paymentId },
      data: {
        status: decision,
        confirmedAt: decision === "CONFIRMED" ? new Date() : null,
        rejectReason: decision === "REJECTED" ? reason?.trim() || null : null,
      },
    });

    // Ödeme kararı bildirimi alıcıya.
    await this.notifyOrderParty(
      id,
      order.buyerCompanyId,
      decision === "CONFIRMED" ? "Ödemeniz onaylandı" : "Ödemeniz reddedildi",
      decision === "CONFIRMED" ? "Ödeme onaylandı" : "Ödeme reddedildi",
      decision === "CONFIRMED"
        ? `${this.orderLabel(order.number)} sipariş için ödemeniz satıcı tarafından onaylandı.`
        : `${this.orderLabel(order.number)} sipariş için ödemeniz reddedildi.${
            reason ? ` Gerekçe: ${reason}` : ""
          }`,
    );

    // Otomatik tamamlama (eski sistemle aynı): sipariş teslim alındı (DELIVERED)
    // ve onaylı ödemeler toplamı sipariş tutarına ulaştıysa → COMPLETED.
    if (decision === "CONFIRMED" && order.status === "DELIVERED") {
      const [orderAmt, agg] = await Promise.all([
        this.prisma.companyOrder.findUnique({
          where: { id },
          select: { amount: true },
        }),
        this.prisma.companyOrderPayment.aggregate({
          where: { orderId: id, status: "CONFIRMED" },
          _sum: { amount: true },
        }),
      ]);
      const total = orderAmt ? Number(orderAmt.amount) : 0;
      const confirmedSum = agg._sum.amount ? Number(agg._sum.amount) : 0;
      if (total > 0 && confirmedSum + 0.01 >= total) {
        await this.prisma.companyOrder.update({
          where: { id },
          data: { status: "COMPLETED" },
        });
        // Tam ödeme ile otomatik tamamlandı → her iki tarafa bilgi.
        await this.notifyOrderParty(
          id,
          order.buyerCompanyId,
          "Sipariş tamamlandı",
          "Sipariş tamamlandı",
          `${this.orderLabel(order.number)} sipariş tam ödeme ile tamamlandı.`,
        );
      }
    }

    return this.serializePayment(updated);
  }

  private serializePayment(p: {
    id: string;
    amount: { toString(): string };
    method: string | null;
    note: string | null;
    status: string;
    rejectReason: string | null;
    recordedByCompanyId: string;
    confirmedAt: Date | null;
    createdAt: Date;
    chequeNo?: string | null;
    chequeBank?: string | null;
    chequeDueDate?: Date | null;
  }) {
    return {
      id: p.id,
      amount: p.amount.toString(),
      method: p.method,
      note: p.note,
      status: p.status,
      rejectReason: p.rejectReason,
      recordedByCompanyId: p.recordedByCompanyId,
      confirmedAt: p.confirmedAt,
      createdAt: p.createdAt,
      chequeNo: p.chequeNo ?? null,
      chequeBank: p.chequeBank ?? null,
      chequeDueDate: p.chequeDueDate ?? null,
    };
  }

  /** Firmanın siparişleri — hem satıcı hem alıcı olduğu, role etiketli. */
  async list(companyId: string) {
    const rows = await this.prisma.companyOrder.findMany({
      where: {
        OR: [{ sellerCompanyId: companyId }, { buyerCompanyId: companyId }],
      },
      include: {
        seller: { select: { name: true } },
        buyer: { select: { name: true } },
        listing: { select: { title: true, type: true, number: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((o) => this.serialize(o, companyId));
  }

  async getOne(user: AuthenticatedCompanyUser, id: string) {
    const o = await this.prisma.companyOrder.findUnique({
      where: { id },
      include: {
        seller: { select: { name: true } },
        buyer: { select: { name: true } },
        listing: { select: { title: true, type: true, number: true } },
        items: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (
      !o ||
      (o.sellerCompanyId !== user.companyId &&
        o.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }

    let confirmed = 0;
    let pending = 0;
    for (const p of o.payments) {
      const amt = Number(p.amount);
      if (p.status === "CONFIRMED") confirmed += amt;
      else if (p.status === "AWAITING_CONFIRMATION") pending += amt;
    }
    const total = Number(o.amount);
    const remaining = Math.max(0, total - confirmed - pending);

    return {
      ...this.serialize(o, user.companyId),
      paymentTiming: o.paymentTiming,
      paymentOpen: this.isPaymentOpen(o.paymentTiming, o.status),
      paymentTotals: {
        confirmed: confirmed.toFixed(2),
        pending: pending.toFixed(2),
        remaining: remaining.toFixed(2),
      },
      // Adım verileri + timeline (eski sistemle birebir).
      acceptedAt: o.acceptedAt,
      acceptedNote: o.acceptedNote,
      bankAccountHolder: o.bankAccountHolder,
      bankIban: o.bankIban,
      expectedDeliveryDate: o.expectedDeliveryDate,
      invoiceNumber: o.invoiceNumber,
      deliveryStartedAt: o.deliveryStartedAt,
      deliveryNote: o.deliveryNote,
      deliveredAt: o.deliveredAt,
      completedAt: o.completedAt,
      completedNote: o.completedNote,
      rejectedAt: o.rejectedAt,
      rejectedReason: o.rejectedReason,
      cancelledAt: o.cancelledAt,
      cancelReason: o.cancelReason,
      payments: o.payments.map((p) => this.serializePayment(p)),
      items: o.items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity.toString(),
        unit: it.unit,
        unitPrice: it.unitPrice.toString(),
      })),
    };
  }

  private serialize(
    o: {
      id: string;
      number: string | null;
      amount: { toString(): string };
      status: string;
      sellerCompanyId: string;
      seller: { name: string };
      buyer: { name: string };
      listing: { title: string; number: string | null } | null;
      createdAt: Date;
    },
    companyId: string,
  ) {
    const iAmSeller = o.sellerCompanyId === companyId;
    return {
      id: o.id,
      number: o.number,
      amount: o.amount.toString(),
      status: o.status,
      role: iAmSeller ? ("seller" as const) : ("buyer" as const),
      counterparty: iAmSeller ? o.buyer.name : o.seller.name,
      listingTitle: o.listing?.title ?? null,
      listingNumber: o.listing?.number ?? null,
      createdAt: o.createdAt,
    };
  }
}
