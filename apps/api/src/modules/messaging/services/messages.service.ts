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

    // DIRECT context için canonical contextRefId = supplierId. URL'de
    // hangi taraf gelirse gelsin aynı thread'i bul (tek konuşma kanalı).
    const effectiveContextRefId =
      context === "DIRECT" ? supplierId : contextRefId;

    const existing = await this.prisma.messageThread.findUnique({
      where: {
        context_contextRefId_tenantId_supplierId: {
          context,
          contextRefId: effectiveContextRefId,
          tenantId,
          supplierId,
        },
      },
    });
    if (existing) return existing;

    return this.prisma.messageThread.create({
      data: {
        context,
        contextRefId: effectiveContextRefId,
        tenantId,
        supplierId,
      },
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

    // V2-4 — preview: header dropdown + thread listesinde cache'lenmiş gösterim.
    const preview = content
      ? content.substring(0, 200)
      : `📎 ${attIds.length} dosya`;

    await this.prisma.messageThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: message.sentAt,
        lastMessagePreview: preview,
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
   * V2-4 düzeltme — Header dropdown + /mesajlar sayfası için tüm thread'leri
   * (sipariş + ihale karışık) son mesaj zamanına göre sıralayarak döndürür.
   * Bağlam metadata'sı (orderNumber/tenderNumber) batch fetch ile zenginleştirilir.
   */
  async listAllThreadsForUser(actor: MessageActor) {
    const where =
      actor.kind === "tenant"
        ? { tenantId: actor.tenantId, lastMessageAt: { not: null } }
        : { supplierId: actor.supplierId, lastMessageAt: { not: null } };

    const threads = await this.prisma.messageThread.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      include: {
        tenant: { select: { id: true, name: true } },
        supplier: { select: { id: true, companyName: true } },
      },
      take: 50,
    });

    const orderIds = threads
      .filter((t) => t.context === "ORDER")
      .map((t) => t.contextRefId);
    const tenderIds = threads
      .filter((t) => t.context === "TENDER")
      .map((t) => t.contextRefId);

    const [orders, tenders] = await Promise.all([
      orderIds.length
        ? this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        : Promise.resolve([]),
      tenderIds.length
        ? this.prisma.tender.findMany({
            where: { id: { in: tenderIds } },
            select: { id: true, tenderNumber: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    return threads.map((t) => {
      const isTenantSide = actor.kind === "tenant";
      const otherPartyId = isTenantSide ? t.supplier.id : t.tenant.id;
      const otherPartyName = isTenantSide ? t.supplier.companyName : t.tenant.name;

      let contextLabel: "Sipariş" | "İhale";
      let contextNumber: string;
      let contextTitle: string | null = null;
      if (t.context === "ORDER") {
        const o = orders.find((x) => x.id === t.contextRefId);
        contextLabel = "Sipariş";
        contextNumber = o?.orderNumber ?? "—";
      } else {
        const tender = tenders.find((x) => x.id === t.contextRefId);
        contextLabel = "İhale";
        contextNumber = tender?.tenderNumber ?? "—";
        contextTitle = tender?.title ?? null;
      }

      const lastReadAt = isTenantSide
        ? t.tenantLastReadAt
        : t.supplierLastReadAt;
      const unread =
        !!t.lastMessageAt && (!lastReadAt || lastReadAt < t.lastMessageAt);

      return {
        threadId: t.id,
        context: t.context,
        contextRefId: t.contextRefId,
        contextLabel,
        contextNumber,
        contextTitle,
        otherPartyId,
        otherPartyName,
        lastMessagePreview: t.lastMessagePreview,
        lastMessageAt: t.lastMessageAt,
        unread,
      };
    });
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

  /**
   * V2-4.1 — Tüm aktif bağlantılar (relations) + DIRECT thread özeti.
   * Hiç mesajlaşmamış olanlar dahil, lastMessageAt desc; null'lar en altta.
   * Mesajlar sayfasının kontak listesi için.
   */
  async listContactsForUser(actor: MessageActor) {
    if (actor.kind === "tenant") {
      const relations = await this.prisma.supplierTenantRelation.findMany({
        where: { tenantId: actor.tenantId, status: "ACTIVE" },
        include: {
          supplier: { select: { id: true, companyName: true } },
        },
      });
      const supplierIds = relations.map((r) => r.supplierId);
      if (supplierIds.length === 0) return [];

      const threads = await this.prisma.messageThread.findMany({
        where: {
          tenantId: actor.tenantId,
          context: "DIRECT",
          supplierId: { in: supplierIds },
        },
        select: {
          supplierId: true,
          lastMessageAt: true,
          lastMessagePreview: true,
          tenantLastReadAt: true,
        },
      });
      const threadMap = new Map(threads.map((t) => [t.supplierId, t]));

      const rows = relations.map((r) => {
        const t = threadMap.get(r.supplierId);
        const lastMessageAt = t?.lastMessageAt ?? null;
        const unread =
          !!lastMessageAt &&
          (!t?.tenantLastReadAt || t.tenantLastReadAt < lastMessageAt);
        return {
          otherPartyId: r.supplier.id,
          otherPartyName: r.supplier.companyName,
          lastMessageAt: lastMessageAt ? lastMessageAt.toISOString() : null,
          lastMessagePreview: t?.lastMessagePreview ?? null,
          unread,
        };
      });
      return this.sortContacts(rows);
    }

    // supplier
    const relations = await this.prisma.supplierTenantRelation.findMany({
      where: { supplierId: actor.supplierId, status: "ACTIVE" },
      include: { tenant: { select: { id: true, name: true } } },
    });
    const tenantIds = relations.map((r) => r.tenantId);
    if (tenantIds.length === 0) return [];

    const threads = await this.prisma.messageThread.findMany({
      where: {
        supplierId: actor.supplierId,
        context: "DIRECT",
        tenantId: { in: tenantIds },
      },
      select: {
        tenantId: true,
        lastMessageAt: true,
        lastMessagePreview: true,
        supplierLastReadAt: true,
      },
    });
    const threadMap = new Map(threads.map((t) => [t.tenantId, t]));

    const rows = relations.map((r) => {
      const t = threadMap.get(r.tenantId);
      const lastMessageAt = t?.lastMessageAt ?? null;
      const unread =
        !!lastMessageAt &&
        (!t?.supplierLastReadAt || t.supplierLastReadAt < lastMessageAt);
      return {
        otherPartyId: r.tenant.id,
        otherPartyName: r.tenant.name,
        lastMessageAt: lastMessageAt ? lastMessageAt.toISOString() : null,
        lastMessagePreview: t?.lastMessagePreview ?? null,
        unread,
      };
    });
    return this.sortContacts(rows);
  }

  private sortContacts<
    T extends { lastMessageAt: string | null; otherPartyName: string },
  >(rows: T[]): T[] {
    return rows.sort((a, b) => {
      // En son mesajlaşılan üstte; mesajsızlar isim alfabetik en altta.
      if (a.lastMessageAt && b.lastMessageAt) {
        return b.lastMessageAt.localeCompare(a.lastMessageAt);
      }
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.otherPartyName.localeCompare(b.otherPartyName, "tr");
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
    if (context === "DIRECT") {
      // DIRECT context: tenant ↔ supplier şirket-bazlı sohbet. Bağlantı
      // ACTIVE olmalı. Convention: contextRefId = supplierId (taraf
      // önemli değil, sadece thread uniqueness için placeholder).
      const supplierId =
        actor.kind === "tenant"
          ? (targetSupplierId ?? contextRefId)
          : actor.supplierId;
      const tenantId =
        actor.kind === "tenant" ? actor.tenantId : contextRefId;
      const relation = await this.prisma.supplierTenantRelation.findUnique({
        where: {
          supplierId_tenantId: { supplierId, tenantId },
        },
        select: { status: true },
      });
      if (!relation || relation.status !== "ACTIVE") {
        throw new ForbiddenException(
          "Bu firmayla aktif bir bağlantınız yok",
        );
      }
      return { tenantId, supplierId };
    }

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
