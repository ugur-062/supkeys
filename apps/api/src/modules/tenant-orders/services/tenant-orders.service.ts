import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { OrderStatus, Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailQueue } from "../../email/email.queue";
import { CancelOrderDto } from "../dto/cancel-order.dto";
import { CompleteOrderDto } from "../dto/complete-order.dto";
import { ListOrdersDto } from "../dto/list-orders.dto";

/**
 * Polish-1 — DTO'da `sort` zaten whitelist'li (createdAt:desc / asc /
 * totalAmount:desc / asc). Parse + Prisma orderBy çevirir. Geçersizse
 * createdAt:desc fallback.
 */
function parseOrderSort(
  sort: string | undefined,
): Prisma.OrderOrderByWithRelationInput {
  const parts = (sort ?? "createdAt:desc").split(":");
  const field = parts[0];
  const dir: Prisma.SortOrder = parts[1] === "asc" ? "asc" : "desc";
  if (field === "totalAmount") return { totalAmount: dir };
  return { createdAt: dir };
}

const ORDER_DETAIL_SELECT = {
  supplier: {
    select: {
      id: true,
      companyName: true,
      taxNumber: true,
      taxOffice: true,
      companyType: true,
      city: true,
      district: true,
      addressLine: true,
      industry: true,
      membership: true,
      users: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" as const },
        take: 1,
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
    },
  },
  tender: {
    select: {
      id: true,
      tenderNumber: true,
      title: true,
      status: true,
      primaryCurrency: true,
      deliveryTerm: true,
      deliveryAddress: true,
      paymentTerm: true,
      paymentDays: true,
      items: {
        select: {
          id: true,
          orderIndex: true,
          name: true,
          description: true,
          quantity: true,
          unit: true,
          materialCode: true,
        },
        orderBy: { orderIndex: "asc" as const },
      },
    },
  },
  bid: {
    include: {
      items: {
        where: { isWinner: true },
        include: {
          tenderItem: {
            select: {
              id: true,
              orderIndex: true,
              name: true,
              description: true,
              quantity: true,
              unit: true,
              materialCode: true,
            },
          },
        },
        orderBy: { tenderItem: { orderIndex: "asc" as const } },
      },
      attachments: { orderBy: { uploadedAt: "asc" as const } },
      submittedBy: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
  deliveryStartedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  completedBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  cancelledBy: {
    select: { id: true, firstName: true, lastName: true },
  },
} as const;

@Injectable()
export class TenantOrdersService {
  private readonly logger = new Logger(TenantOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  // ============================================================
  // READ
  // ============================================================

  async list(tenantId: string, query: ListOrdersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status as OrderStatus } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.search?.trim()
        ? {
            OR: [
              { orderNumber: { contains: query.search.trim(), mode: "insensitive" } },
              {
                tender: {
                  OR: [
                    { tenderNumber: { contains: query.search.trim(), mode: "insensitive" } },
                    { title: { contains: query.search.trim(), mode: "insensitive" } },
                  ],
                },
              },
              {
                supplier: {
                  companyName: { contains: query.search.trim(), mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy = parseOrderSort(query.sort);

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              companyName: true,
              taxNumber: true,
              city: true,
              membership: true,
            },
          },
          tender: {
            select: {
              id: true,
              tenderNumber: true,
              title: true,
            },
          },
          bid: {
            select: {
              id: true,
              version: true,
              status: true,
              _count: { select: { items: true } },
            },
          },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async stats(tenantId: string) {
    const [total, pending, accepted, inDelivery, completed, rejected, cancelled] =
      await Promise.all([
        this.prisma.order.count({ where: { tenantId } }),
        this.prisma.order.count({ where: { tenantId, status: "PENDING" } }),
        this.prisma.order.count({ where: { tenantId, status: "ACCEPTED" } }),
        this.prisma.order.count({
          where: { tenantId, status: "IN_DELIVERY" },
        }),
        this.prisma.order.count({ where: { tenantId, status: "COMPLETED" } }),
        this.prisma.order.count({ where: { tenantId, status: "REJECTED" } }),
        this.prisma.order.count({ where: { tenantId, status: "CANCELLED" } }),
      ]);

    return {
      total,
      pending,
      accepted,
      inDelivery,
      completed,
      rejected,
      cancelled,
    };
  }

  async findOne(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_DETAIL_SELECT,
    });

    if (!order) throw new NotFoundException("Sipariş bulunamadı");
    if (order.tenantId !== tenantId)
      throw new ForbiddenException("Bu siparişe erişim yetkiniz yok");

    return order;
  }

  // ============================================================
  // V1.5 — STATE TRANSITIONS
  // ============================================================

  /**
   * Alıcı IN_DELIVERY → COMPLETED. Tedarikçiye `order_status_changed` e-posta.
   */
  async completeOrder(
    tenantId: string,
    orderId: string,
    userId: string,
    dto: CompleteOrderDto,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, tenantId: true, status: true },
      });
      if (!order) throw new NotFoundException("Sipariş bulunamadı");
      if (order.tenantId !== tenantId)
        throw new ForbiddenException("Bu siparişe erişim yetkiniz yok");
      if (order.status !== "IN_DELIVERY") {
        throw new ConflictException(
          `Sadece IN_DELIVERY durumundaki siparişler tamamlanabilir. Mevcut durum: ${order.status}`,
        );
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          completedById: userId,
          completedNote: dto.completedNote?.trim() || null,
        },
        include: ORDER_DETAIL_SELECT,
      });
    });

    setImmediate(() =>
      this.dispatchStatusEmailToSupplier(updated, "COMPLETED").catch((err) =>
        this.logger.error(
          `order_status_changed (COMPLETED) dispatch failed for ${updated.orderNumber}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      ),
    );

    return updated;
  }

  /**
   * Alıcı PENDING/IN_DELIVERY → CANCELLED. Sebep zorunlu (≥10 char).
   */
  async cancelOrder(
    tenantId: string,
    orderId: string,
    userId: string,
    dto: CancelOrderDto,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException(
        "İptal sebebi en az 10 karakter olmalıdır",
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, tenantId: true, status: true },
      });
      if (!order) throw new NotFoundException("Sipariş bulunamadı");
      if (order.tenantId !== tenantId)
        throw new ForbiddenException("Bu siparişe erişim yetkiniz yok");
      if (
        order.status !== "PENDING" &&
        order.status !== "ACCEPTED" &&
        order.status !== "IN_DELIVERY"
      ) {
        throw new ConflictException(
          `${order.status} durumundaki sipariş iptal edilemez`,
        );
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelReason: reason,
        },
        include: ORDER_DETAIL_SELECT,
      });
    });

    setImmediate(() =>
      this.dispatchStatusEmailToSupplier(updated, "CANCELLED").catch((err) =>
        this.logger.error(
          `order_status_changed (CANCELLED) dispatch failed for ${updated.orderNumber}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      ),
    );

    return updated;
  }

  // ============================================================
  // EMAIL
  // ============================================================

  private webUrl(): string {
    return (this.config.get<string>("WEB_URL") ?? "http://localhost:3000")
      .replace(/\/$/, "");
  }

  private async dispatchStatusEmailToSupplier(
    order: Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_SELECT }>,
    newStatus: "COMPLETED" | "CANCELLED",
  ): Promise<void> {
    const supplierUser = order.supplier.users[0];
    if (!supplierUser) {
      this.logger.warn(
        `No active supplier user for order ${order.orderNumber}; email skipped`,
      );
      return;
    }

    const note =
      newStatus === "COMPLETED" ? order.completedNote : order.cancelReason;

    // Eski statü: COMPLETED'a daima IN_DELIVERY'den; CANCELLED'a
    // önce gönderildiyse IN_DELIVERY, onaylandıysa ACCEPTED, aksi PENDING.
    const previous: "PENDING" | "ACCEPTED" | "IN_DELIVERY" =
      newStatus === "COMPLETED"
        ? "IN_DELIVERY"
        : order.deliveryStartedAt
          ? "IN_DELIVERY"
          : order.acceptedAt
            ? "ACCEPTED"
            : "PENDING";

    await this.emailQueue.enqueue({
      to: {
        email: supplierUser.email,
        name: `${supplierUser.firstName} ${supplierUser.lastName}`,
      },
      templateData: {
        template: "order_status_changed",
        data: {
          recipientName: `${supplierUser.firstName} ${supplierUser.lastName}`,
          recipient: "supplier",
          orderNumber: order.orderNumber,
          tenderNumber: order.tender.tenderNumber,
          tenderTitle: order.tender.title,
          newStatus,
          oldStatus: previous,
          note,
          orderUrl: `${this.webUrl()}/supplier/siparisler/${order.id}`,
        },
      },
      context: { type: "order_status", id: order.id },
    });
  }
}
