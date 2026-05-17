import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ApprovalFlowStatus,
  ApprovalFlowType,
  Prisma,
} from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  ApprovalFlowStepInputDto,
  CreateApprovalFlowDto,
} from "../dto/create-approval-flow.dto";
import { ListApprovalFlowsDto } from "../dto/list-approval-flows.dto";
import { UpdateApprovalFlowDto } from "../dto/update-approval-flow.dto";

const FLOW_NUMBER_START = 10000; // İlk akış 10001

const FLOW_INCLUDE = {
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  initiators: {
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
    },
  },
  steps: {
    include: {
      approver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: { orderIndex: "asc" as const },
  },
} as const;

@Injectable()
export class TenantApprovalFlowsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- READ ----------

  async list(tenantId: string, query: ListApprovalFlowsDto) {
    const where: Prisma.ApprovalFlowWhereInput = { tenantId };
    if (query.type) where.type = query.type as ApprovalFlowType;
    if (query.status) where.status = query.status as ApprovalFlowStatus;

    return this.prisma.approvalFlow.findMany({
      where,
      include: FLOW_INCLUDE,
      orderBy: { flowNumber: "desc" },
    });
  }

  async getOne(tenantId: string, id: string) {
    const flow = await this.prisma.approvalFlow.findUnique({
      where: { id },
      include: FLOW_INCLUDE,
    });
    if (!flow) throw new NotFoundException("Onay akışı bulunamadı");
    if (flow.tenantId !== tenantId)
      throw new ForbiddenException("Bu akışa erişim yetkiniz yok");
    return flow;
  }

  // ---------- CREATE ----------

  async create(
    tenantId: string,
    createdById: string,
    dto: CreateApprovalFlowDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.validateFlowConfig(tx, tenantId, {
        type: dto.type as ApprovalFlowType,
        initiatorUserIds: dto.initiatorUserIds,
        steps: dto.steps,
      });

      // Tenant-wide flowNumber counter
      const last = await tx.approvalFlow.findFirst({
        where: { tenantId },
        orderBy: { flowNumber: "desc" },
        select: { flowNumber: true },
      });
      const flowNumber = (last?.flowNumber ?? FLOW_NUMBER_START) + 1;

      const desiredStatus = (dto.status ?? "DRAFT") as ApprovalFlowStatus;

      // 1-active-per-type: Yeni ACTIVE oluşturulurken eski ACTIVE'leri PASSIVE'e çek
      if (desiredStatus === "ACTIVE") {
        await tx.approvalFlow.updateMany({
          where: {
            tenantId,
            type: dto.type as ApprovalFlowType,
            status: "ACTIVE",
          },
          data: { status: "PASSIVE" },
        });
      }

      const flow = await tx.approvalFlow.create({
        data: {
          tenantId,
          flowNumber,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          type: dto.type as ApprovalFlowType,
          status: desiredStatus,
          createdById,
          initiators: {
            create: dto.initiatorUserIds.map((userId) => ({ userId })),
          },
          steps: {
            create: dto.steps.map((s) => ({
              orderIndex: s.orderIndex,
              approverUserId: s.approverUserId,
              conditionMinAmount: s.conditionMinAmount ?? null,
              conditionCurrency: s.conditionCurrency ?? "TRY",
              displayLabel: s.displayLabel?.trim() || null,
            })),
          },
        },
        include: FLOW_INCLUDE,
      });

      return flow;
    });
  }

  // ---------- UPDATE ----------

  async update(tenantId: string, id: string, dto: UpdateApprovalFlowDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.approvalFlow.findUnique({
        where: { id },
        include: { initiators: true, steps: true },
      });
      if (!existing) throw new NotFoundException("Onay akışı bulunamadı");
      if (existing.tenantId !== tenantId)
        throw new ForbiddenException("Bu akışa erişim yetkiniz yok");

      const newType = (dto.type ?? existing.type) as ApprovalFlowType;
      const newInitiatorIds =
        dto.initiatorUserIds ?? existing.initiators.map((i) => i.userId);
      const newSteps: ApprovalFlowStepInputDto[] =
        dto.steps ??
        existing.steps.map((s) => ({
          orderIndex: s.orderIndex,
          approverUserId: s.approverUserId,
          conditionMinAmount: s.conditionMinAmount
            ? Number(s.conditionMinAmount)
            : undefined,
          conditionCurrency: s.conditionCurrency ?? "TRY",
          displayLabel: s.displayLabel ?? undefined,
        }));

      await this.validateFlowConfig(tx, tenantId, {
        type: newType,
        initiatorUserIds: newInitiatorIds,
        steps: newSteps,
      });

      const newStatus = (dto.status ?? existing.status) as ApprovalFlowStatus;

      // 1-active-per-type — başka ACTIVE'leri PASSIVE'e çek
      if (newStatus === "ACTIVE" && existing.status !== "ACTIVE") {
        await tx.approvalFlow.updateMany({
          where: {
            tenantId,
            type: newType,
            status: "ACTIVE",
            id: { not: id },
          },
          data: { status: "PASSIVE" },
        });
      }

      // Ana update
      await tx.approvalFlow.update({
        where: { id },
        data: {
          name: dto.name?.trim() ?? existing.name,
          description:
            dto.description !== undefined
              ? dto.description?.trim() || null
              : existing.description,
          type: newType,
          status: newStatus,
        },
      });

      // Initiators full-replace (eğer dto'da gönderildiyse veya step değişiyorsa
      // tutarlı olsun diye yine yeniden yaz)
      if (dto.initiatorUserIds) {
        await tx.approvalFlowInitiator.deleteMany({ where: { flowId: id } });
        await tx.approvalFlowInitiator.createMany({
          data: newInitiatorIds.map((userId) => ({ flowId: id, userId })),
        });
      }

      // Steps full-replace (eğer dto'da gönderildiyse)
      if (dto.steps) {
        await tx.approvalFlowStep.deleteMany({ where: { flowId: id } });
        await tx.approvalFlowStep.createMany({
          data: newSteps.map((s) => ({
            flowId: id,
            orderIndex: s.orderIndex,
            approverUserId: s.approverUserId,
            conditionMinAmount: s.conditionMinAmount ?? null,
            conditionCurrency: s.conditionCurrency ?? "TRY",
            displayLabel: s.displayLabel?.trim() || null,
          })),
        });
      }

      return tx.approvalFlow.findUnique({
        where: { id },
        include: FLOW_INCLUDE,
      });
    });
  }

  // ---------- STATUS ----------

  async changeStatus(
    tenantId: string,
    id: string,
    status: ApprovalFlowStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.approvalFlow.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException("Onay akışı bulunamadı");
      if (existing.tenantId !== tenantId)
        throw new ForbiddenException("Bu akışa erişim yetkiniz yok");

      if (status === existing.status) {
        return tx.approvalFlow.findUnique({
          where: { id },
          include: FLOW_INCLUDE,
        });
      }

      if (status === "ACTIVE") {
        await tx.approvalFlow.updateMany({
          where: {
            tenantId,
            type: existing.type,
            status: "ACTIVE",
            id: { not: id },
          },
          data: { status: "PASSIVE" },
        });
      }

      await tx.approvalFlow.update({
        where: { id },
        data: { status },
      });

      return tx.approvalFlow.findUnique({
        where: { id },
        include: FLOW_INCLUDE,
      });
    });
  }

  // ---------- DUPLICATE ----------

  async duplicate(tenantId: string, createdById: string, sourceId: string) {
    const source = await this.getOne(tenantId, sourceId);
    return this.create(tenantId, createdById, {
      name: `${source.name} (Kopya)`,
      description: source.description ?? undefined,
      type: source.type as never,
      status: "DRAFT" as never,
      initiatorUserIds: source.initiators.map((i) => i.userId),
      steps: source.steps.map((s) => ({
        orderIndex: s.orderIndex,
        approverUserId: s.approverUserId,
        conditionMinAmount: s.conditionMinAmount
          ? Number(s.conditionMinAmount)
          : undefined,
        conditionCurrency: s.conditionCurrency ?? "TRY",
        displayLabel: s.displayLabel ?? undefined,
      })),
    });
  }

  // ---------- DELETE ----------

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.approvalFlow.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException("Onay akışı bulunamadı");
    if (existing.tenantId !== tenantId)
      throw new ForbiddenException("Bu akışa erişim yetkiniz yok");

    // V1: hard delete (E.7.D'de ApprovalRequest count check eklenecek).
    await this.prisma.approvalFlow.delete({ where: { id } });
    return { success: true };
  }

  // ---------- VALIDATION ----------

  private async validateFlowConfig(
    tx: Prisma.TransactionClient,
    tenantId: string,
    cfg: {
      type: ApprovalFlowType;
      initiatorUserIds: string[];
      steps: ApprovalFlowStepInputDto[];
    },
  ) {
    // 1) initiators
    if (cfg.initiatorUserIds.length === 0) {
      throw new BadRequestException("En az 1 süreç başlatıcı seçin");
    }
    const dedupedInits = [...new Set(cfg.initiatorUserIds)];
    if (dedupedInits.length !== cfg.initiatorUserIds.length) {
      throw new BadRequestException("Süreç başlatıcı listesinde tekrar var");
    }
    const initUsers = await tx.user.findMany({
      where: { id: { in: dedupedInits }, tenantId, isActive: true },
      select: { id: true, role: true },
    });
    if (initUsers.length !== dedupedInits.length) {
      throw new BadRequestException(
        "Süreç başlatıcılardan bazıları geçersiz veya pasif",
      );
    }
    const badInits = initUsers.filter((u) => u.role === "APPROVER");
    if (badInits.length > 0) {
      throw new BadRequestException(
        "Onaylayıcı (APPROVER) rolündeki kullanıcılar süreç başlatıcı olamaz",
      );
    }

    // 2) steps
    if (cfg.steps.length === 0) {
      throw new BadRequestException("En az 1 onay adımı ekleyin");
    }

    const orderIndexes = cfg.steps.map((s) => s.orderIndex);
    if (new Set(orderIndexes).size !== orderIndexes.length) {
      throw new BadRequestException("Adım sıraları benzersiz olmalı");
    }
    const sortedIndexes = [...orderIndexes].sort((a, b) => a - b);
    for (let i = 0; i < sortedIndexes.length; i++) {
      if (sortedIndexes[i] !== i + 1) {
        throw new BadRequestException(
          "Adım sıraları 1, 2, 3 şeklinde sıralı olmalı",
        );
      }
    }

    const approverIds = [...new Set(cfg.steps.map((s) => s.approverUserId))];
    const approverUsers = await tx.user.findMany({
      where: { id: { in: approverIds }, tenantId, isActive: true },
      select: { id: true, role: true },
    });
    if (approverUsers.length !== approverIds.length) {
      throw new BadRequestException(
        "Onaylayıcılardan bazıları geçersiz veya pasif",
      );
    }
    const badApprovers = approverUsers.filter((u) => u.role === "BUYER");
    if (badApprovers.length > 0) {
      throw new BadRequestException(
        "Satın Almacı (BUYER) rolündeki kullanıcılar onaylayıcı olamaz. Onaylayıcı veya Yönetici olmalı.",
      );
    }

    // 3) conditionMinAmount monoton artan (orderIndex sırasında)
    const sortedSteps = [...cfg.steps].sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    let lastMin = -1;
    for (const step of sortedSteps) {
      if (
        step.conditionMinAmount !== undefined &&
        step.conditionMinAmount !== null
      ) {
        if (step.conditionMinAmount <= lastMin) {
          throw new BadRequestException(
            `Adım ${step.orderIndex} eşiği (${step.conditionMinAmount}) önceki adımdan büyük olmalı (önceki: ${lastMin})`,
          );
        }
        lastMin = step.conditionMinAmount;
      }
    }
  }
}
