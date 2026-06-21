import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  type OrderStatus,
  PaymentMethod,
  type PaymentTiming,
  Prisma,
} from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailService } from "../../email/email.service";
import type { CreateOrderPaymentDto } from "../dto/create-order-payment.dto";

// Otomatik tamamlama e-postası için gereken alanlar.
const COMPLETION_EMAIL_INCLUDE = {
  tender: {
    select: {
      tenderNumber: true,
      title: true,
      createdBy: { select: { firstName: true, lastName: true, email: true } },
    },
  },
} as const;

/**
 * Faz 3 madde 16 — Direkt ödeme (nakit/çek) kayıtları.
 *
 * Akış: Alıcı kayıt oluşturur ("ödedim") → tedarikçi onaylar ("aldım") veya
 * reddeder ("almadım", sebep). Bir siparişte çoklu/kısmi ödeme olabilir.
 * Toplam (bekleyen + onaylı) sipariş tutarını aşamaz.
 *
 * Ödeme bölümünün açık olması ihaledeki `paymentTiming`'e bağlıdır:
 *  - BEFORE_DELIVERY: tedarikçi onayından sonra (ACCEPTED, IN_DELIVERY, COMPLETED)
 *  - AFTER_DELIVERY:  yalnızca sipariş tamamlanınca (COMPLETED)
 */
@Injectable()
export class OrderPaymentsService {
  private readonly logger = new Logger(OrderPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sipariş statüsü + ödeme zamanına göre ödeme kaydı oluşturulabilir mi?
   *  - BEFORE_DELIVERY: tedarikçi onayından sonra (ACCEPTED, IN_DELIVERY).
   *  - AFTER_DELIVERY:  alıcı teslim aldıktan sonra (DELIVERED). COMPLETED'da
   *    artık tam ödenmiş kabul edilir, yeni kayıt alınmaz.
   */
  static isPaymentOpen(timing: PaymentTiming, status: OrderStatus): boolean {
    if (timing === "BEFORE_DELIVERY") {
      return (
        status === "ACCEPTED" ||
        status === "IN_DELIVERY" ||
        status === "COMPLETED"
      );
    }
    return status === "DELIVERED"; // AFTER_DELIVERY → teslim alındıktan sonra
  }

  private async requireOrderForTenant(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        tenantId: true,
        supplierId: true,
        status: true,
        currency: true,
        totalAmount: true,
        tender: { select: { paymentTiming: true } },
      },
    });
    if (!order) throw new NotFoundException("Sipariş bulunamadı");
    if (order.tenantId !== tenantId) throw new ForbiddenException();
    return order;
  }

  private async requirePaymentForSupplier(
    supplierId: string,
    orderId: string,
    paymentId: string,
  ) {
    const payment = await this.prisma.orderPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.orderId !== orderId) {
      throw new NotFoundException("Ödeme kaydı bulunamadı");
    }
    if (payment.supplierId !== supplierId) throw new ForbiddenException();
    return payment;
  }

  /**
   * Alıcı yeni ödeme kaydı ekler ("ödedim"). Para birimi sipariş ile aynı
   * olmalı; toplam (bekleyen + onaylı) sipariş tutarını aşamaz.
   */
  async create(
    tenantId: string,
    userId: string,
    orderId: string,
    dto: CreateOrderPaymentDto,
  ) {
    const order = await this.requireOrderForTenant(tenantId, orderId);

    if (
      !OrderPaymentsService.isPaymentOpen(
        order.tender.paymentTiming,
        order.status,
      )
    ) {
      throw new BadRequestException(
        order.tender.paymentTiming === "AFTER_DELIVERY"
          ? "Ödeme kaydı yalnızca sipariş teslim alındıktan sonra eklenebilir"
          : "Ödeme kaydı tedarikçi siparişi onayladıktan sonra eklenebilir",
      );
    }

    if (dto.currency !== order.currency) {
      throw new BadRequestException(
        "Ödeme para birimi sipariş para birimi ile aynı olmalıdır",
      );
    }

    // Kalan tutar koruması — reddedilenler hariç toplam, sipariş tutarını aşamaz.
    const agg = await this.prisma.orderPayment.aggregate({
      where: {
        orderId,
        status: { in: ["AWAITING_CONFIRMATION", "CONFIRMED"] },
      },
      _sum: { amount: true },
    });
    const recorded = agg._sum.amount ?? new Prisma.Decimal(0);
    const next = recorded.add(new Prisma.Decimal(dto.amount));
    if (next.greaterThan(order.totalAmount)) {
      const remaining = new Prisma.Decimal(order.totalAmount).sub(recorded);
      throw new BadRequestException(
        `Tutar kalan ödenecek tutarı aşıyor (kalan: ${remaining.toFixed(2)})`,
      );
    }

    const isCheque = dto.method === PaymentMethod.CHEQUE;
    return this.prisma.orderPayment.create({
      data: {
        orderId,
        tenantId: order.tenantId,
        supplierId: order.supplierId,
        method: dto.method,
        amount: new Prisma.Decimal(dto.amount),
        currency: order.currency,
        chequeNo: isCheque ? (dto.chequeNo ?? null) : null,
        chequeBank: isCheque ? (dto.chequeBank ?? null) : null,
        chequeDueDate:
          isCheque && dto.chequeDueDate ? new Date(dto.chequeDueDate) : null,
        note: dto.note ?? null,
        markedPaidByUserId: userId,
      },
    });
  }

  /** Alıcı yalnızca henüz onaylanmamış (AWAITING) kaydı silebilir. */
  async remove(tenantId: string, orderId: string, paymentId: string) {
    await this.requireOrderForTenant(tenantId, orderId);
    const payment = await this.prisma.orderPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.orderId !== orderId) {
      throw new NotFoundException("Ödeme kaydı bulunamadı");
    }
    if (payment.tenantId !== tenantId) throw new ForbiddenException();
    if (payment.status !== "AWAITING_CONFIRMATION") {
      throw new BadRequestException(
        "Tedarikçi tarafından işlem görmüş ödeme kaydı silinemez",
      );
    }
    await this.prisma.orderPayment.delete({ where: { id: paymentId } });
    return { success: true };
  }

  /**
   * Tedarikçi ödemeyi/çeki aldığını onaylar. Sipariş DELIVERED (teslim alındı,
   * ödeme bekleniyor) ve onaylanan toplam sipariş tutarına ulaştıysa sipariş
   * otomatik COMPLETED olur; alıcıya "sipariş tamamlandı" e-postası gider.
   */
  async confirm(
    supplierId: string,
    supplierUserId: string,
    orderId: string,
    paymentId: string,
  ) {
    const { payment, completed } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.orderPayment.findUnique({
        where: { id: paymentId },
      });
      if (!existing || existing.orderId !== orderId) {
        throw new NotFoundException("Ödeme kaydı bulunamadı");
      }
      if (existing.supplierId !== supplierId) throw new ForbiddenException();
      if (existing.status !== "AWAITING_CONFIRMATION") {
        throw new BadRequestException("Bu ödeme kaydı zaten yanıtlanmış");
      }

      const payment = await tx.orderPayment.update({
        where: { id: paymentId },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
          confirmedBySupplierUserId: supplierUserId,
          rejectedAt: null,
          rejectReason: null,
        },
      });

      // Otomatik tamamlama: sipariş teslim alındı + onaylı toplam ≥ sipariş tutarı.
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true, totalAmount: true },
      });
      let completed: Prisma.OrderGetPayload<{
        include: typeof COMPLETION_EMAIL_INCLUDE;
      }> | null = null;
      if (order && order.status === "DELIVERED") {
        const agg = await tx.orderPayment.aggregate({
          where: { orderId, status: "CONFIRMED" },
          _sum: { amount: true },
        });
        const confirmedSum = agg._sum.amount ?? new Prisma.Decimal(0);
        if (confirmedSum.greaterThanOrEqualTo(order.totalAmount)) {
          completed = await tx.order.update({
            where: { id: orderId },
            data: { status: "COMPLETED", completedAt: new Date() },
            include: COMPLETION_EMAIL_INCLUDE,
          });
        }
      }
      return { payment, completed };
    });

    if (completed) {
      setImmediate(() =>
        this.dispatchCompletedEmailToBuyer(completed).catch((err) =>
          this.logger.error(
            `order_status_changed (COMPLETED via payment) dispatch failed for ${completed.orderNumber}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        ),
      );
    }

    return payment;
  }

  /** Tam ödeme onaylanıp sipariş tamamlanınca alıcıya bildirim. */
  private async dispatchCompletedEmailToBuyer(
    order: Prisma.OrderGetPayload<{ include: typeof COMPLETION_EMAIL_INCLUDE }>,
  ): Promise<void> {
    const buyer = order.tender.createdBy;
    if (!buyer?.email) return;
    const webUrl = (
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000"
    ).replace(/\/$/, "");

    await this.emailService.send({
      to: { email: buyer.email, name: `${buyer.firstName} ${buyer.lastName}` },
      templateData: {
        template: "order_status_changed",
        data: {
          recipientName: `${buyer.firstName} ${buyer.lastName}`,
          recipient: "buyer",
          orderNumber: order.orderNumber,
          tenderNumber: order.tender.tenderNumber,
          tenderTitle: order.tender.title,
          newStatus: "COMPLETED",
          oldStatus: "IN_DELIVERY",
          note: order.completedNote,
          orderUrl: `${webUrl}/dashboard/siparisler/${order.id}`,
        },
      },
      context: { type: "order_status", id: order.id },
    });
  }

  /** Tedarikçi ödemeyi almadığını bildirir (sebep ile). */
  async reject(
    supplierId: string,
    supplierUserId: string,
    orderId: string,
    paymentId: string,
    reason: string,
  ) {
    const payment = await this.requirePaymentForSupplier(
      supplierId,
      orderId,
      paymentId,
    );
    if (payment.status !== "AWAITING_CONFIRMATION") {
      throw new BadRequestException("Bu ödeme kaydı zaten yanıtlanmış");
    }
    return this.prisma.orderPayment.update({
      where: { id: paymentId },
      data: {
        status: "REJECTED",
        rejectedAt: new Date(),
        confirmedBySupplierUserId: supplierUserId,
        rejectReason: reason,
      },
    });
  }
}
