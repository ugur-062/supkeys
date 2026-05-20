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
import { rangeToSinceDate } from "../../../common/filters/date-range";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailService } from "../../email/email.service";
import { AcceptOrderDto } from "../dto/accept-order.dto";
import { ListOrdersDto } from "../dto/list-orders.dto";
import { RejectOrderDto } from "../dto/reject-order.dto";
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
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ============================================================
  // READ
  // ============================================================

  async list(supplierId: string, query: ListOrdersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const since = rangeToSinceDate(query.range);

    const where: Prisma.OrderWhereInput = {
      supplierId,
      ...(query.status ? { status: query.status as OrderStatus } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
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
    const [total, pending, accepted, inDelivery, completed, rejected, cancelled] =
      await Promise.all([
        this.prisma.order.count({ where: { supplierId } }),
        this.prisma.order.count({ where: { supplierId, status: "PENDING" } }),
        this.prisma.order.count({ where: { supplierId, status: "ACCEPTED" } }),
        this.prisma.order.count({
          where: { supplierId, status: "IN_DELIVERY" },
        }),
        this.prisma.order.count({ where: { supplierId, status: "COMPLETED" } }),
        this.prisma.order.count({ where: { supplierId, status: "REJECTED" } }),
        this.prisma.order.count({ where: { supplierId, status: "CANCELLED" } }),
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

  /**
   * Tedarikçinin sipariş aldığı distinct alıcıları (tenant'ları) döner —
   * filtre dropdown'u için. Sipariş sayısı azalan sırada.
   */
  async counterparts(supplierId: string) {
    const groups = await this.prisma.order.groupBy({
      by: ["tenantId"],
      where: { supplierId },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const tenants = await this.prisma.tenant.findMany({
      where: { id: { in: groups.map((g) => g.tenantId) } },
      select: { id: true, name: true },
    });
    const countById = new Map(groups.map((g) => [g.tenantId, g._count._all]));
    return tenants
      .map((t) => ({
        id: t.id,
        name: t.name,
        orderCount: countById.get(t.id) ?? 0,
      }))
      .sort((a, b) => b.orderCount - a.orderCount);
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
   * Tedarikçi PENDING → ACCEPTED. Onay anında tahmini teslim tarihi
   * (zorunlu), opsiyonel not + banka/fatura bilgileri kaydedilir.
   * Alıcıya `order_status_changed` (ACCEPTED) e-posta atılır.
   */
  async acceptOrder(
    supplierId: string,
    orderId: string,
    _supplierUserId: string,
    dto: AcceptOrderDto,
  ) {
    const expected = new Date(dto.expectedDeliveryDate);
    if (Number.isNaN(expected.getTime())) {
      throw new BadRequestException("Geçersiz tahmini teslim tarihi");
    }
    if (expected.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        "Tahmini teslim tarihi geçmişte olamaz",
      );
    }

    let invoice: Date | null = null;
    if (dto.invoiceDate) {
      const parsed = new Date(dto.invoiceDate);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException("Geçersiz fatura tarihi");
      }
      invoice = parsed;
    }

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
          `Sadece bekleyen siparişler onaylanabilir. Mevcut durum: ${order.status}`,
        );
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedNote: dto.acceptedNote?.trim() || null,
          expectedDeliveryDate: expected,
          bankAccountHolder: dto.bankAccountHolder?.trim() || null,
          bankIban: dto.bankIban?.trim() || null,
          invoiceDate: invoice,
        },
        include: ORDER_DETAIL_SELECT,
      });
    });

    setImmediate(() =>
      this.dispatchStatusEmailToBuyer(updated, "ACCEPTED").catch((err) =>
        this.logger.error(
          `order_status_changed (ACCEPTED) dispatch failed for ${updated.orderNumber}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      ),
    );

    return updated;
  }

  /**
   * Tedarikçi PENDING → REJECTED. Sebep zorunlu (≥10 char, DTO validator).
   * Alıcıya `order_status_changed` (REJECTED) e-posta atılır.
   */
  async rejectOrder(
    supplierId: string,
    orderId: string,
    _supplierUserId: string,
    dto: RejectOrderDto,
  ) {
    const reason = dto.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException(
        "Red sebebi en az 10 karakter olmalıdır",
      );
    }

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
          `Sadece bekleyen siparişler reddedilebilir. Mevcut durum: ${order.status}`,
        );
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectReason: reason,
        },
        include: ORDER_DETAIL_SELECT,
      });
    });

    setImmediate(() =>
      this.dispatchStatusEmailToBuyer(updated, "REJECTED").catch((err) =>
        this.logger.error(
          `order_status_changed (REJECTED) dispatch failed for ${updated.orderNumber}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      ),
    );

    return updated;
  }

  /**
   * Tedarikçi ACCEPTED → IN_DELIVERY. Tahmini teslim tarihi onay anında
   * girildiği için bu adımda yalnızca isteğe bağlı gönderim notu vardır.
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
      if (order.status !== "ACCEPTED") {
        throw new ConflictException(
          `Sadece onaylanmış siparişlerde gönderim başlatılabilir. Mevcut: ${order.status}`,
        );
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          status: "IN_DELIVERY",
          deliveryStartedAt: new Date(),
          deliveryNote: dto.deliveryNote?.trim() || null,
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
    newStatus: "ACCEPTED" | "REJECTED" | "IN_DELIVERY",
  ): Promise<void> {
    const buyerAdmin = order.tenant.users[0];
    if (!buyerAdmin) {
      this.logger.warn(
        `No active COMPANY_ADMIN for tenant of order ${order.orderNumber}; email skipped`,
      );
      return;
    }

    const note =
      newStatus === "ACCEPTED"
        ? order.acceptedNote
        : newStatus === "REJECTED"
          ? order.rejectReason
          : order.deliveryNote;

    // Önceki statü: ACCEPTED/REJECTED'a PENDING'den geçilir,
    // IN_DELIVERY'ye ACCEPTED'dan geçilir.
    const oldStatus: "PENDING" | "ACCEPTED" =
      newStatus === "IN_DELIVERY" ? "ACCEPTED" : "PENDING";

    await this.emailService.send({
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
          oldStatus,
          note,
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
