import {
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
import { ListOrdersDto } from "../dto/list-orders.dto";
import { StartDeliveryDto } from "../dto/start-delivery.dto";

const ORDER_DETAIL_SELECT = {
  tenant: {
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      district: true,
      users: {
        where: { isActive: true, role: "COMPANY_ADMIN" as const },
        orderBy: { createdAt: "asc" as const },
        take: 1,
        select: {
          firstName: true,
          lastName: true,
          email: true,
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

/**
 * Polish-1 — DTO whitelist'li `sort` (createdAt|totalAmount × asc|desc).
 * Geçersizse createdAt:desc fallback.
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

@Injectable()
export class SupplierOrdersService {
  private readonly logger = new Logger(SupplierOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailQueue: EmailQueue,
    private readonly config: ConfigService,
  ) {}

  // ============================================================
  // READ
  // ============================================================

  async list(supplierId: string, query: ListOrdersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {
      supplierId,
      ...(query.status ? { status: query.status as OrderStatus } : {}),
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
                tenant: {
                  name: { contains: query.search.trim(), mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          tenant: {
            select: { id: true, name: true, slug: true },
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
        orderBy: parseOrderSort(query.sort),
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

  async stats(supplierId: string) {
    const [total, pending, inDelivery, completed, cancelled] = await Promise.all([
      this.prisma.order.count({ where: { supplierId } }),
      this.prisma.order.count({ where: { supplierId, status: "PENDING" } }),
      this.prisma.order.count({ where: { supplierId, status: "IN_DELIVERY" } }),
      this.prisma.order.count({ where: { supplierId, status: "COMPLETED" } }),
      this.prisma.order.count({ where: { supplierId, status: "CANCELLED" } }),
    ]);

    return { total, pending, inDelivery, completed, cancelled };
  }

  async findOne(supplierId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_DETAIL_SELECT,
    });

    if (!order) throw new NotFoundException("Sipariş bulunamadı");
    if (order.supplierId !== supplierId)
      throw new ForbiddenException("Bu siparişe erişim yetkiniz yok");

    return order;
  }

  // ============================================================
  // V1.5 — STATE TRANSITIONS
  // ============================================================

  /**
   * Tedarikçi PENDING → IN_DELIVERY. Alıcıya `order_status_changed` e-posta.
   *
   * Not: `deliveryStartedById` tenant `users` tablosuna FK; SupplierUser
   * ayrı tabloda olduğu için NULL bırakılır. "Kim başlattı" supplier
   * tarafında implicit (tüm aktif supplier user'ları aynı şirketten).
   */
  async startDelivery(
    supplierId: string,
    orderId: string,
    _supplierUserId: string,
    dto: StartDeliveryDto,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, supplierId: true, status: true },
      });
      if (!order) throw new NotFoundException("Sipariş bulunamadı");
      if (order.supplierId !== supplierId)
        throw new ForbiddenException("Bu siparişe erişim yetkiniz yok");
      if (order.status !== "PENDING") {
        throw new ConflictException(
          `Sadece PENDING durumundaki siparişlerde teslimat başlatılabilir. Mevcut: ${order.status}`,
        );
      }

      let expectedDelivery: Date | null = null;
      if (dto.expectedDeliveryDate) {
        const parsed = new Date(dto.expectedDeliveryDate);
        if (Number.isNaN(parsed.getTime())) {
          throw new ConflictException("Geçersiz tahmini teslim tarihi");
        }
        expectedDelivery = parsed;
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "IN_DELIVERY",
          deliveryStartedAt: new Date(),
          deliveryNote: dto.deliveryNote?.trim() || null,
          expectedDeliveryDate: expectedDelivery,
        },
        include: ORDER_DETAIL_SELECT,
      });
    });

    setImmediate(() =>
      this.dispatchStatusEmailToBuyer(updated, "IN_DELIVERY").catch((err) =>
        this.logger.error(
          `order_status_changed (IN_DELIVERY) dispatch failed for ${updated.orderNumber}: ${
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

  private async dispatchStatusEmailToBuyer(
    order: Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_SELECT }>,
    newStatus: "IN_DELIVERY",
  ): Promise<void> {
    const buyerAdmin = order.tenant.users[0];
    if (!buyerAdmin) {
      this.logger.warn(
        `No active COMPANY_ADMIN for tenant of order ${order.orderNumber}; email skipped`,
      );
      return;
    }

    await this.emailQueue.enqueue({
      to: {
        email: buyerAdmin.email,
        name: `${buyerAdmin.firstName} ${buyerAdmin.lastName}`,
      },
      templateData: {
        template: "order_status_changed",
        data: {
          recipientName: `${buyerAdmin.firstName} ${buyerAdmin.lastName}`,
          recipient: "buyer",
          orderNumber: order.orderNumber,
          tenderNumber: order.tender.tenderNumber,
          tenderTitle: order.tender.title,
          newStatus,
          oldStatus: "PENDING",
          note: order.deliveryNote,
          expectedDeliveryDate: order.expectedDeliveryDate
            ? order.expectedDeliveryDate.toISOString()
            : null,
          orderUrl: `${this.webUrl()}/dashboard/siparisler/${order.id}`,
        },
      },
      context: { type: "order_status", id: order.id },
    });
  }
}
