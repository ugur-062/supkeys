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
 * V2-4.2 — Unified 1-on-1 mesajlaşma servisi.
 *
 * Bir tenant ↔ supplier çifti için TEK MessageThread. Mesaj seviyesinde
 * `context` tag (TENDER/ORDER/DIRECT) ile hangi sipariş veya ihaleden
 * gelen mesaj olduğu işaretlenir. Tedarikçi A ve B birbirinin thread'ini
 * ASLA göremez (thread tenant-supplier scope'unda).
 */
export type MessageActor =
  | { kind: "tenant"; tenantId: string; userId: string }
  | { kind: "supplier"; supplierId: string; supplierUserId: string };

interface SendMessageParams {
  content: string;
  attachmentIds?: string[];
  /** Hangi context'ten geldiğinin etiketi. Boşsa DIRECT (genel sohbet). */
  context?: MessageContext;
  /** TENDER için tenderId, ORDER için orderId. DIRECT'te yok. */
  contextRefId?: string;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ============================================================================
  // Thread CRUD
  // ============================================================================

  /**
   * (tenant, supplier) çifti için thread'i bul veya oluştur. ACTIVE relation
   * zorunlu — relation yoksa ForbiddenException.
   */
  async getOrCreateThread(actor: MessageActor, otherPartyId: string) {
    const { tenantId, supplierId } = await this.resolveParties(
      actor,
      otherPartyId,
    );

    const existing = await this.prisma.messageThread.findUnique({
      where: { tenantId_supplierId: { tenantId, supplierId } },
    });
    if (existing) return existing;

    return this.prisma.messageThread.create({
      data: { tenantId, supplierId },
    });
  }

  /**
   * Unified thread'in tüm mesajlarını döndürür (kronolojik), her balona
   * context bilgisi enrich edilir. Read marker güncellenir.
   */
  async listMessages(actor: MessageActor, otherPartyId: string) {
    const thread = await this.getOrCreateThread(actor, otherPartyId);

    const messages = await this.prisma.message.findMany({
      where: { threadId: thread.id },
      orderBy: { sentAt: "asc" },
    });

    // Sender isimlerini enrich et
    const userIds = Array.from(
      new Set(
        messages
          .map((m) => m.senderUserId)
          .filter((v): v is string => !!v),
      ),
    );
    const supUserIds = Array.from(
      new Set(
        messages
          .map((m) => m.senderSupplierUserId)
          .filter((v): v is string => !!v),
      ),
    );

    // Context label lookup için tender ve order ID'leri topla
    const tenderRefIds = Array.from(
      new Set(
        messages
          .filter((m) => m.context === "TENDER" && m.contextRefId)
          .map((m) => m.contextRefId as string),
      ),
    );
    const orderRefIds = Array.from(
      new Set(
        messages
          .filter((m) => m.context === "ORDER" && m.contextRefId)
          .map((m) => m.contextRefId as string),
      ),
    );

    const [users, supUsers, tenders, orders] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve(
            [] as Array<{ id: string; firstName: string; lastName: string }>,
          ),
      supUserIds.length
        ? this.prisma.supplierUser.findMany({
            where: { id: { in: supUserIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve(
            [] as Array<{ id: string; firstName: string; lastName: string }>,
          ),
      tenderRefIds.length
        ? this.prisma.tender.findMany({
            where: { id: { in: tenderRefIds } },
            select: { id: true, tenderNumber: true, title: true },
          })
        : Promise.resolve(
            [] as Array<{ id: string; tenderNumber: string; title: string }>,
          ),
      orderRefIds.length
        ? this.prisma.order.findMany({
            where: { id: { in: orderRefIds } },
            select: { id: true, orderNumber: true },
          })
        : Promise.resolve(
            [] as Array<{ id: string; orderNumber: string }>,
          ),
    ]);

    const tenderMap = new Map(tenders.map((t) => [t.id, t]));
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    const enriched = messages.map((m) => {
      let senderName = "—";
      if (m.senderUserId) {
        const u = users.find((x) => x.id === m.senderUserId);
        if (u) senderName = `${u.firstName} ${u.lastName}`;
      } else if (m.senderSupplierUserId) {
        const su = supUsers.find((x) => x.id === m.senderSupplierUserId);
        if (su) senderName = `${su.firstName} ${su.lastName}`;
      }

      let contextLabel: string | null = null;
      if (m.context === "TENDER" && m.contextRefId) {
        const t = tenderMap.get(m.contextRefId);
        contextLabel = t ? `İhale ${t.tenderNumber}` : "İhale";
      } else if (m.context === "ORDER" && m.contextRefId) {
        const o = orderMap.get(m.contextRefId);
        contextLabel = o ? `Sipariş ${o.orderNumber}` : "Sipariş";
      }

      return { ...m, senderName, contextLabel };
    });

    // Read marker
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
        tenantId: thread.tenantId,
        supplierId: thread.supplierId,
        lastMessageAt: thread.lastMessageAt,
      },
      messages: enriched,
    };
  }

  async sendMessage(
    actor: MessageActor,
    otherPartyId: string,
    params: SendMessageParams,
  ) {
    const content = params.content?.trim() ?? "";
    const attIds = params.attachmentIds ?? [];

    if (!content && attIds.length === 0) {
      throw new BadRequestException("Mesaj boş olamaz");
    }
    if (attIds.length > 5) {
      throw new BadRequestException("En fazla 5 dosya eklenebilir");
    }

    const context = params.context ?? "DIRECT";
    const contextRefId =
      context === "DIRECT" ? null : (params.contextRefId ?? null);

    if ((context === "TENDER" || context === "ORDER") && !contextRefId) {
      throw new BadRequestException(
        `${context} context için contextRefId zorunlu`,
      );
    }

    // Context-spesifik authz
    await this.validateContextAuthz(actor, context, contextRefId, otherPartyId);

    const thread = await this.getOrCreateThread(actor, otherPartyId);

    const message = await this.prisma.message.create({
      data: {
        threadId: thread.id,
        senderType: actor.kind === "tenant" ? "TENANT_USER" : "SUPPLIER_USER",
        senderUserId: actor.kind === "tenant" ? actor.userId : null,
        senderSupplierUserId:
          actor.kind === "supplier" ? actor.supplierUserId : null,
        content,
        context,
        contextRefId,
        attachmentIds: attIds as unknown as Prisma.InputJsonValue,
      },
    });

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
      const readAt =
        actor.kind === "tenant" ? t.tenantLastReadAt : t.supplierLastReadAt;
      if (!readAt || readAt < last) count++;
    }
    return { count };
  }

  // ============================================================================
  // List endpoints
  // ============================================================================

  /**
   * Header dropdown için kullanıcının tüm thread özetleri (en yeni mesaja
   * göre desc). Bir tedarikçi için tek satır gelir (unified).
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

    return threads.map((t) => {
      const isTenantSide = actor.kind === "tenant";
      const otherPartyId = isTenantSide ? t.supplier.id : t.tenant.id;
      const otherPartyName = isTenantSide
        ? t.supplier.companyName
        : t.tenant.name;

      const lastReadAt = isTenantSide
        ? t.tenantLastReadAt
        : t.supplierLastReadAt;
      const unread =
        !!t.lastMessageAt && (!lastReadAt || lastReadAt < t.lastMessageAt);

      return {
        threadId: t.id,
        otherPartyId,
        otherPartyName,
        lastMessagePreview: t.lastMessagePreview,
        lastMessageAt: t.lastMessageAt,
        unread,
      };
    });
  }

  /**
   * V2-4.1 — Tüm aktif bağlantılar (relations) + unified thread özeti.
   * Hiç mesajlaşmamış olanlar dahil; lastMessageAt desc, null'lar en altta.
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

  /**
   * Tender detayında "Mesajlaş" dropdown'u için davetli tedarikçiler + her
   * birinin unified thread'inin özeti. Tedarikçi ile mesajlaşmamış olsa
   * dahi davetliyse listede yer alır.
   */
  async listTenderThreadsForTenant(actor: MessageActor, tenderId: string) {
    if (actor.kind !== "tenant") {
      throw new ForbiddenException();
    }

    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      select: { id: true, tenantId: true },
    });
    if (!tender || tender.tenantId !== actor.tenantId) {
      throw new NotFoundException("İhale bulunamadı");
    }

    const invitations = await this.prisma.tenderInvitation.findMany({
      where: { tenderId },
      include: { supplier: { select: { id: true, companyName: true } } },
    });

    const supplierIds = invitations.map((i) => i.supplierId);
    if (supplierIds.length === 0) return [];

    const threads = await this.prisma.messageThread.findMany({
      where: {
        tenantId: actor.tenantId,
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

    return invitations.map((inv) => {
      const t = threadMap.get(inv.supplierId);
      const lastMessageAt = t?.lastMessageAt ?? null;
      const unread =
        !!lastMessageAt &&
        (!t?.tenantLastReadAt || t.tenantLastReadAt < lastMessageAt);
      return {
        supplierId: inv.supplier.id,
        supplierName: inv.supplier.companyName,
        lastMessageAt: lastMessageAt ? lastMessageAt.toISOString() : null,
        lastMessageContent: t?.lastMessagePreview ?? null,
        lastMessageSenderType: null as null,
        unread,
      };
    });
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private sortContacts<
    T extends { lastMessageAt: string | null; otherPartyName: string },
  >(rows: T[]): T[] {
    return rows.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) {
        return b.lastMessageAt.localeCompare(a.lastMessageAt);
      }
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.otherPartyName.localeCompare(b.otherPartyName, "tr");
    });
  }

  /**
   * Authz + party resolution. Thread (tenant, supplier) çifti olduğu için
   * otherPartyId interpreted by actor type: tenant verirse supplierId,
   * supplier verirse tenantId. ACTIVE relation zorunlu.
   */
  private async resolveParties(
    actor: MessageActor,
    otherPartyId: string,
  ): Promise<{ tenantId: string; supplierId: string }> {
    const tenantId = actor.kind === "tenant" ? actor.tenantId : otherPartyId;
    const supplierId =
      actor.kind === "tenant" ? otherPartyId : actor.supplierId;

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

  /**
   * Context'e özgü authz: TENDER için davet doğrulaması, ORDER için
   * sipariş sahipliği doğrulaması. DIRECT için ek kontrol yok
   * (resolveParties'in ACTIVE relation kontrolü yeterli).
   */
  private async validateContextAuthz(
    actor: MessageActor,
    context: MessageContext,
    contextRefId: string | null,
    otherPartyId: string,
  ): Promise<void> {
    if (context === "DIRECT" || !contextRefId) return;

    const { tenantId, supplierId } = await this.resolveParties(
      actor,
      otherPartyId,
    );

    if (context === "ORDER") {
      const order = await this.prisma.order.findUnique({
        where: { id: contextRefId },
        select: { tenantId: true, supplierId: true },
      });
      if (!order) throw new NotFoundException("Sipariş bulunamadı");
      if (order.tenantId !== tenantId || order.supplierId !== supplierId) {
        throw new ForbiddenException(
          "Bu sipariş bu iki firma arasında değil",
        );
      }
      return;
    }

    // TENDER
    const tender = await this.prisma.tender.findUnique({
      where: { id: contextRefId },
      select: { tenantId: true },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.tenantId !== tenantId) {
      throw new ForbiddenException("Bu ihale bu alıcıya ait değil");
    }
    const invited = await this.prisma.tenderInvitation.findUnique({
      where: { tenderId_supplierId: { tenderId: contextRefId, supplierId } },
      select: { id: true },
    });
    if (!invited) {
      throw new BadRequestException(
        "Tedarikçi bu ihaleye davet edilmemiş",
      );
    }
  }
}
