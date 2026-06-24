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
