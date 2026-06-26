import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CompanyOrderPaymentTiming,
  CompanyOrderStatus,
} from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";

@Injectable()
export class CompanyOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Satıcı siparişi onaylar: PENDING → ACCEPTED. */
  accept(user: AuthenticatedCompanyUser, id: string) {
    return this.transition(user, id, {
      side: "seller",
      from: "PENDING",
      to: "ACCEPTED",
    });
  }

  /** Satıcı siparişi reddeder: PENDING → REJECTED (+ gerekçe). */
  async reject(user: AuthenticatedCompanyUser, id: string, reason?: string) {
    const res = await this.transition(user, id, {
      side: "seller",
      from: "PENDING",
      to: "REJECTED",
    });
    if (reason) {
      await this.prisma.companyOrder.update({
        where: { id },
        data: { rejectedReason: reason },
      });
    }
    return res;
  }

  /** Satıcı kargoya verir: ACCEPTED (veya legacy CREATED) → IN_DELIVERY. */
  ship(user: AuthenticatedCompanyUser, id: string) {
    return this.transition(user, id, {
      side: "seller",
      from: ["ACCEPTED", "CREATED"],
      to: "IN_DELIVERY",
    });
  }

  /** Alıcı teslim alır: IN_DELIVERY → DELIVERED. */
  receive(user: AuthenticatedCompanyUser, id: string) {
    return this.transition(user, id, {
      side: "buyer",
      from: "IN_DELIVERY",
      to: "DELIVERED",
    });
  }

  /** Alıcı ödemeyi onaylar/tamamlar: DELIVERED → COMPLETED. */
  complete(user: AuthenticatedCompanyUser, id: string) {
    return this.transition(user, id, {
      side: "buyer",
      from: "DELIVERED",
      to: "COMPLETED",
    });
  }

  private async transition(
    user: AuthenticatedCompanyUser,
    id: string,
    rule: {
      side: "seller" | "buyer";
      from: CompanyOrderStatus | CompanyOrderStatus[];
      to: CompanyOrderStatus;
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
      data: { status: rule.to },
    });
    return { ok: true, status: rule.to };
  }

  private async loadParticipant(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.prisma.companyOrder.findUnique({
      where: { id },
      select: {
        id: true,
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
      return (
        status === "ACCEPTED" ||
        status === "IN_DELIVERY" ||
        status === "DELIVERED" ||
        status === "COMPLETED"
      );
    }
    return status === "DELIVERED" || status === "COMPLETED";
  }

  /** Alıcı ödeme kaydı oluşturur (AWAITING_CONFIRMATION). */
  async recordPayment(
    user: AuthenticatedCompanyUser,
    id: string,
    input: { amount: number; method?: string; note?: string },
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
    const payment = await this.prisma.companyOrderPayment.create({
      data: {
        orderId: id,
        amount: input.amount,
        method: input.method?.trim() || null,
        note: input.note?.trim() || null,
        recordedByCompanyId: user.companyId,
        recordedByUserId: user.userId,
      },
    });
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
