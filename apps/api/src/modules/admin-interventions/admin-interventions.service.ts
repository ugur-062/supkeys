import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

// Kazandırma geri alma YOK (V1 kararı): AWARDED tender / terminal sipariş
// iptal edilemez. Admin yalnızca finalize-öncesi durumları iptal eder.
const TENDER_CANCELLABLE = ["DRAFT", "IN_APPROVAL", "OPEN_FOR_BIDS", "IN_AWARD"];
const ORDER_CANCELLABLE = ["PENDING", "ACCEPTED", "IN_DELIVERY", "IN_PROGRESS"];

@Injectable()
export class AdminInterventionsService {
  private readonly logger = new Logger(AdminInterventionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Admin superuser ihale detayı — TAM görünürlük (tüm teklif + davet). */
  async getTenderDetail(id: string): Promise<unknown> {
    const t = await this.prisma.tender.findUnique({
      where: { id },
      select: {
        id: true,
        tenderNumber: true,
        title: true,
        description: true,
        type: true,
        visibility: true,
        status: true,
        primaryCurrency: true,
        allowedCurrencies: true,
        bidsOpenAt: true,
        bidsCloseAt: true,
        publishedAt: true,
        awardedAt: true,
        cancelledAt: true,
        cancelReason: true,
        createdAt: true,
        paymentTerm: true,
        paymentDays: true,
        deliveryTerm: true,
        termsAndConditions: true,
        tenant: { select: { id: true, name: true } },
        createdBy: {
          select: { firstName: true, lastName: true, email: true },
        },
        categories: {
          select: {
            category: {
              select: { id: true, code: true, nameTr: true, level: true },
            },
          },
        },
        items: {
          orderBy: { orderIndex: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            quantity: true,
            unit: true,
            targetUnitPrice: true,
          },
        },
        invitations: {
          orderBy: { invitedAt: "asc" },
          select: {
            status: true,
            invitedAt: true,
            respondedAt: true,
            supplier: { select: { id: true, companyName: true } },
          },
        },
        bids: {
          orderBy: { totalAmount: "asc" },
          select: {
            id: true,
            status: true,
            totalAmount: true,
            currency: true,
            version: true,
            submittedAt: true,
            eliminationReason: true,
            supplier: { select: { id: true, companyName: true } },
          },
        },
        orders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            currency: true,
            supplier: { select: { companyName: true } },
          },
        },
      },
    });
    if (!t) throw new NotFoundException("İhale bulunamadı");
    return { ...t, categories: t.categories.map((c) => c.category) };
  }

  /** Admin superuser sipariş detayı. */
  async getOrderDetail(id: string): Promise<unknown> {
    const o = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        currency: true,
        notes: true,
        createdAt: true,
        acceptedAt: true,
        completedAt: true,
        cancelledAt: true,
        cancelReason: true,
        tenant: { select: { id: true, name: true } },
        supplier: { select: { id: true, companyName: true } },
        tender: { select: { id: true, tenderNumber: true, title: true } },
        bid: {
          select: {
            id: true,
            totalAmount: true,
            currency: true,
            version: true,
          },
        },
        _count: { select: { payments: true } },
      },
    });
    if (!o) throw new NotFoundException("Sipariş bulunamadı");
    return o;
  }

  async cancelTender(tenderId: string, reason: string, adminId: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, status: true, tenantId: true },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (!TENDER_CANCELLABLE.includes(tender.status)) {
      throw new ConflictException(
        `${tender.status} durumundaki ihale iptal edilemez (kazandırma geri alınamaz)`,
      );
    }
    const updated = await this.prisma.tender.update({
      where: { id: tenderId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason.trim(),
      },
      select: { id: true, status: true },
    });
    void this.audit.log({
      action: "tender.admin_cancelled",
      actorType: "admin",
      actorId: adminId || null,
      tenantId: tender.tenantId,
      entityType: "tender",
      entityId: tenderId,
      metadata: { reason, previousStatus: tender.status },
    });
    this.logger.log(`Admin ${adminId} cancelled tender ${tenderId}`);
    return updated;
  }

  async cancelOrder(orderId: string, reason: string, adminId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, tenantId: true },
    });
    if (!order) throw new NotFoundException("Sipariş bulunamadı");
    if (!ORDER_CANCELLABLE.includes(order.status)) {
      throw new ConflictException(
        `${order.status} durumundaki sipariş iptal edilemez`,
      );
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason.trim(),
      },
      select: { id: true, status: true },
    });
    void this.audit.log({
      action: "order.admin_cancelled",
      actorType: "admin",
      actorId: adminId || null,
      tenantId: order.tenantId,
      entityType: "order",
      entityId: orderId,
      metadata: { reason, previousStatus: order.status },
    });
    this.logger.log(`Admin ${adminId} cancelled order ${orderId}`);
    return updated;
  }
}
