import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OrderStatus, Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ListOrdersDto } from "../dto/list-orders.dto";

@Injectable()
export class SupplierOrdersService {
  constructor(private readonly prisma: PrismaService) {}

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
        orderBy: { createdAt: "desc" },
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
    const [total, pending, accepted, inProgress, delivered, completed, cancelled] =
      await Promise.all([
        this.prisma.order.count({ where: { supplierId } }),
        this.prisma.order.count({ where: { supplierId, status: "PENDING" } }),
        this.prisma.order.count({ where: { supplierId, status: "ACCEPTED" } }),
        this.prisma.order.count({ where: { supplierId, status: "IN_PROGRESS" } }),
        this.prisma.order.count({ where: { supplierId, status: "DELIVERED" } }),
        this.prisma.order.count({ where: { supplierId, status: "COMPLETED" } }),
        this.prisma.order.count({ where: { supplierId, status: "CANCELLED" } }),
      ]);

    return { total, pending, accepted, inProgress, delivered, completed, cancelled };
  }

  async findOne(supplierId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            district: true,
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
              orderBy: { orderIndex: "asc" },
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
              orderBy: { tenderItem: { orderIndex: "asc" } },
            },
            attachments: { orderBy: { uploadedAt: "asc" } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException("Sipariş bulunamadı");
    if (order.supplierId !== supplierId)
      throw new ForbiddenException("Bu siparişe erişim yetkiniz yok");

    return order;
  }
}
