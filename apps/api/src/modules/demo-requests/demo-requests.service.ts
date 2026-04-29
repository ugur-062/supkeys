import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateDemoRequestDto } from "./dto/create-demo-request.dto";
import { ListDemoRequestsDto } from "./dto/list-demo-requests.dto";
import { UpdateDemoRequestDto } from "./dto/update-demo-request.dto";

@Injectable()
export class DemoRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- PUBLIC ----------

  async create(dto: CreateDemoRequestDto, ipAddress?: string) {
    const created = await this.prisma.demoRequest.create({
      data: {
        companyName: dto.companyName.trim(),
        contactName: dto.contactName.trim(),
        email: dto.email.toLowerCase().trim(),
        phone: dto.phone?.trim(),
        jobTitle: dto.jobTitle?.trim(),
        companySize: dto.companySize?.trim(),
        message: dto.message?.trim(),
        source: dto.source ?? "landing_page",
        status: "NEW",
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    // ipAddress audit log için ileride kullanılacak
    void ipAddress;

    return {
      id: created.id,
      message: "Talebiniz alındı, ekibimiz en kısa sürede dönüş yapacak.",
      submittedAt: created.createdAt,
    };
  }

  // ---------- ADMIN ----------

  async list(query: ListDemoRequestsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DemoRequestWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { companyName: { contains: term, mode: "insensitive" } },
        { contactName: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.demoRequest.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.demoRequest.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const demoRequest = await this.prisma.demoRequest.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!demoRequest) {
      throw new NotFoundException("Talep bulunamadı");
    }

    return demoRequest;
  }

  async update(id: string, dto: UpdateDemoRequestDto) {
    const existing = await this.prisma.demoRequest.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Talep bulunamadı");
    }

    const data: Prisma.DemoRequestUpdateInput = {};

    if (dto.status !== undefined) {
      data.status = dto.status;

      // Status side-effects
      if (dto.status === "CONTACTED" && !existing.contactedAt) {
        data.contactedAt = new Date();
      }

      const closedStatuses = ["WON", "LOST", "SPAM"];
      if (closedStatuses.includes(dto.status) && !existing.closedAt) {
        data.closedAt = new Date();
      }
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    if (dto.closedReason !== undefined) {
      data.closedReason = dto.closedReason;
    }

    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.demoRequest.update({
      where: { id },
      data,
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return updated;
  }

  async stats() {
    const grouped = await this.prisma.demoRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    });

    const total = await this.prisma.demoRequest.count();
    const byStatus = grouped.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );

    return { total, byStatus };
  }
}
