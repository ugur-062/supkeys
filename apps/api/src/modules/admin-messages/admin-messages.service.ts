import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AdminMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async listThreads(query: {
    search?: string;
    page?: string;
    pageSize?: string;
  }) {
    const page = Math.max(1, query.page ? Number(query.page) : 1);
    const pageSize = Math.min(50, query.pageSize ? Number(query.pageSize) : 30);

    const where: Prisma.MessageThreadWhereInput = {};
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { tenant: { name: { contains: term, mode: "insensitive" } } },
        { supplier: { companyName: { contains: term, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.messageThread.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          lastMessageAt: true,
          tenant: { select: { id: true, name: true } },
          supplier: { select: { id: true, companyName: true } },
          _count: { select: { messages: true } },
          messages: {
            orderBy: { sentAt: "desc" },
            take: 1,
            select: { content: true, senderType: true, sentAt: true },
          },
        },
      }),
      this.prisma.messageThread.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        lastMessageAt: t.lastMessageAt,
        tenant: t.tenant,
        supplier: t.supplier,
        messageCount: t._count.messages,
        lastMessage: t.messages[0]
          ? {
              preview: t.messages[0].content.slice(0, 120),
              senderType: t.messages[0].senderType,
              sentAt: t.messages[0].sentAt,
            }
          : null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async getThread(threadId: string) {
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        tenant: { select: { id: true, name: true } },
        supplier: { select: { id: true, companyName: true } },
        messages: {
          orderBy: { sentAt: "asc" },
          select: {
            id: true,
            content: true,
            senderType: true,
            senderUserId: true,
            senderSupplierUserId: true,
            context: true,
            contextRefId: true,
            sentAt: true,
          },
        },
      },
    });
    if (!thread) throw new NotFoundException("Konuşma bulunamadı");

    // Sender adlarını çöz.
    const userIds = thread.messages
      .map((m) => m.senderUserId)
      .filter((x): x is string => !!x);
    const supUserIds = thread.messages
      .map((m) => m.senderSupplierUserId)
      .filter((x): x is string => !!x);
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
    const uMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
    const sMap = new Map(
      supUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );

    return {
      id: thread.id,
      tenant: thread.tenant,
      supplier: thread.supplier,
      messages: thread.messages.map((m) => ({
        id: m.id,
        content: m.content,
        senderType: m.senderType,
        senderName:
          (m.senderUserId ? uMap.get(m.senderUserId) : null) ??
          (m.senderSupplierUserId ? sMap.get(m.senderSupplierUserId) : null) ??
          "—",
        context: m.context,
        contextRefId: m.contextRefId,
        sentAt: m.sentAt,
      })),
    };
  }
}
