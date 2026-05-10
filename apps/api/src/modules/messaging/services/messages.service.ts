import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { MessageContext, Prisma } from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";

/**
 * V2-4 — 1-on-1 mesajlaşma servisi.
 * Her TENANT-SUPPLIER-CONTEXT kombinasyonu için tek thread.
 * Tedarikçi A ve B birbirinin thread'ini ASLA göremez.
 */
export type MessageActor =
  | { kind: "tenant"; tenantId: string; userId: string }
  | { kind: "supplier"; supplierId: string; supplierUserId: string };

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Thread'i bul veya oluştur. Yetki + context validation.
   * `targetSupplierId` SADECE TENANT-TENDER context'inde gerekir
   * (alıcı hangi tedarikçiyle konuşuyor — davet edilmiş olmalı).
   */
  async getOrCreateThread(
    actor: MessageActor,
    context: MessageContext,
    contextRefId: string,
    targetSupplierId?: string,
  ) {
    const { tenantId, supplierId } = await this.resolveParties(
      actor,
      context,
      contextRefId,
      targetSupplierId,
    );

    const existing = await this.prisma.messageThread.findUnique({
      where: {
        context_contextRefId_tenantId_supplierId: {
          context,
          contextRefId,
          tenantId,
          supplierId,
        },
      },
    });
    if (existing) return existing;

    return this.prisma.messageThread.create({
      data: { context, contextRefId, tenantId, supplierId },
    });
  }

  async listMessages(
    actor: MessageActor,
    context: MessageContext,
    contextRefId: string,
    targetSupplierId?: string,
  ) {
    const thread = await this.getOrCreateThread(
      actor,
      context,
      contextRefId,
      targetSupplierId,
    );

    const messages = await this.prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { sentAt: "asc" },
    });

    // Sender adlarını enrich et
    const userIds = Array.from(
      new Set(messages.map((m) => m.senderUserId).filter((v): v is string => !!v)),
    );
    const supUserIds = Array.from(
      new Set(
        messages
          .map((m) => m.senderSupplierUserId)
          .filter((v): v is string => !!v),
      ),
    );

    const [users, supUsers] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      supUserIds.length
        ? this.prisma.supplierUser.findMany({
            where: { id: { in: supUserIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
    ]);

    const enriched = messages.map((m) => {
      let senderName = "—";
      if (m.senderUserId) {
        const u = users.find((x) => x.id === m.senderUserId);
        if (u) senderName = `${u.firstName} ${u.lastName}`;
      } else if (m.senderSupplierUserId) {
        const su = supUsers.find((x) => x.id === m.senderSupplierUserId);
        if (su) senderName = `${su.firstName} ${su.lastName}`;
      }
      return { ...m, senderName };
    });

    // Read marker güncelle
    await this.prisma.messageThread.update({
      where: { id: thread.id },
      data:
        actor.kind === "tenant"
          ? { tenantLastReadAt: new Date() }
          : { supplierLastReadAt: new Date() },
    });

    return {
      thread: {
        id: thread.id,
        context: thread.context,
        contextRefId: thread.contextRefId,
        tenantId: thread.tenantId,
        supplierId: thread.supplierId,
        lastMessageAt: thread.lastMessageAt,
      },
      messages: enriched,
    };
  }

  async sendMessage(
    actor: MessageActor,
    context: MessageContext,
    contextRefId: string,
    params: {
      content: string;
      attachmentIds?: string[];
      targetSupplierId?: string;
    },
  ) {
    const content = params.content?.trim() ?? "";
    const attIds = params.attachmentIds ?? [];

    if (!content && attIds.length === 0) {
      throw new BadRequestException("Mesaj boş olamaz");
    }
    if (attIds.length > 5) {
      throw new BadRequestException("En fazla 5 dosya eklenebilir");
    }

    const thread = await this.getOrCreateThread(
      actor,
      context,
      contextRefId,
      params.targetSupplierId,
    );

    const message = await this.prisma.message.create({
      data: {
        threadId: thread.id,
        senderType: actor.kind === "tenant" ? "TENANT_USER" : "SUPPLIER_USER",
        senderUserId: actor.kind === "tenant" ? actor.userId : null,
        senderSupplierUserId:
          actor.kind === "supplier" ? actor.supplierUserId : null,
        content,
        attachmentIds: attIds as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.messageThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: message.sentAt,
        ...(actor.kind === "tenant"
          ? { tenantLastReadAt: message.sentAt }
          : { supplierLastReadAt: message.sentAt }),
      },
    });

    // Email scheduler 5dk debounce ile karşı tarafa bildirim gönderir.
    this.events.emit("message.created", {
      messageId: message.id,
      threadId: thread.id,
    });

    return message;
  }

  /**
   * Sidebar badge için unread thread sayısı.
   * Kullanıcının kendi gönderdiği mesajlar sayılmaz.
   */
  async getUnreadCount(actor: MessageActor): Promise<{ count: number }> {
    const where: Prisma.MessageThreadWhereInput =
      actor.kind === "tenant"
        ? { tenantId: actor.tenantId, lastMessageAt: { not: null } }
        : { supplierId: actor.supplierId, lastMessageAt: { not: null } };

    const threads = await this.prisma.messageThread.findMany({
      where,
      select: {
        id: true,
        tenantLastReadAt: true,
        supplierLastReadAt: true,
        messages: {
          where:
            actor.kind === "tenant"
              ? { senderType: "SUPPLIER_USER" }
              : { senderType: "TENANT_USER" },
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { sentAt: true },
        },
      },
    });

    let count = 0;
    for (const t of threads) {
      const last = t.messages[0]?.sentAt;
      if (!last) continue;
      const lastReadAt =
        actor.kind === "tenant" ? t.tenantLastReadAt : t.supplierLastReadAt;
      if (!lastReadAt || lastReadAt < last) count += 1;
    }
    return { count };
  }

  /**
   * TENANT-TENDER context için davet edilen tedarikçiler listesi + thread özeti.
   * Sol-rail kullanıcı arayüzünde "hangi tedarikçiyle konuşuyor" seçimi yapılır.
   */
  async listTenderThreadsForTenant(actor: MessageActor, tenderId: string) {
    if (actor.kind !== "tenant") {
      throw new ForbiddenException();
    }

    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: {
        id: true,
        tenantId: true,
        invitations: {
          select: {
            supplier: { select: { id: true, companyName: true } },
          },
          orderBy: { invitedAt: "asc" },
        },
      },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== actor.tenantId) throw new ForbiddenException();

    const threads = await this.prisma.messageThread.findMany({
      where: { context: "TENDER", contextRefId: tenderId, tenantId: actor.tenantId },
      include: {
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
    });
    const threadBySupplier = new Map(threads.map((t) => [t.supplierId, t]));

    const result = tender.invitations.map((inv) => {
      const t = threadBySupplier.get(inv.supplier.id);
      const lastMsg = t?.messages[0];
      const unread =
        !!t &&
        !!lastMsg &&
        lastMsg.senderType === "SUPPLIER_USER" &&
        (!t.tenantLastReadAt || t.tenantLastReadAt < lastMsg.sentAt);
      return {
        supplierId: inv.supplier.id,
        supplierName: inv.supplier.companyName,
        threadId: t?.id ?? null,
        lastMessageAt: t?.lastMessageAt ?? null,
        lastMessageContent: lastMsg?.content
          ? lastMsg.content.substring(0, 80)
          : null,
        lastMessageSenderType: lastMsg?.senderType ?? null,
        unread,
      };
    });

    return result.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) {
        return (
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime()
        );
      }
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.supplierName.localeCompare(b.supplierName);
    });
  }

  // ----- private helpers -----

  /**
   * Authz + party resolution. Çıktı: { tenantId, supplierId } — thread'in
   * iki tarafının ID'leri (database literal değerleri).
   */
  private async resolveParties(
    actor: MessageActor,
    context: MessageContext,
    contextRefId: string,
    targetSupplierId?: string,
  ): Promise<{ tenantId: string; supplierId: string }> {
    if (context === "ORDER") {
      const order = await this.prisma.order.findUnique({
        where: { id: contextRefId },
        select: { id: true, tenantId: true, supplierId: true },
      });
      if (!order) throw new NotFoundException("Sipariş bulunamadı");
      if (actor.kind === "tenant" && order.tenantId !== actor.tenantId) {
        throw new ForbiddenException();
      }
      if (actor.kind === "supplier" && order.supplierId !== actor.supplierId) {
        throw new ForbiddenException();
      }
      return { tenantId: order.tenantId, supplierId: order.supplierId };
    }

    // TENDER
    const tender = await this.prisma.tender.findUnique({
      where: { id: contextRefId },
      select: { id: true, tenantId: true },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");

    if (actor.kind === "tenant") {
      if (tender.tenantId !== actor.tenantId) throw new ForbiddenException();
      if (!targetSupplierId) {
        throw new BadRequestException(
          "Hangi tedarikçi ile konuşulacağı belirtilmeli",
        );
      }
      const invited = await this.prisma.tenderInvitation.findUnique({
        where: {
          tenderId_supplierId: {
            tenderId: contextRefId,
            supplierId: targetSupplierId,
          },
        },
        select: { id: true },
      });
      if (!invited) {
        throw new BadRequestException(
          "Bu tedarikçi ihaleye davet edilmemiş",
        );
      }
      return { tenantId: tender.tenantId, supplierId: targetSupplierId };
    }

    // supplier
    const invited = await this.prisma.tenderInvitation.findUnique({
      where: {
        tenderId_supplierId: {
          tenderId: contextRefId,
          supplierId: actor.supplierId,
        },
      },
      select: { id: true },
    });
    if (!invited) throw new ForbiddenException("Bu ihaleye davetli değilsiniz");
    return { tenantId: tender.tenantId, supplierId: actor.supplierId };
  }
}
