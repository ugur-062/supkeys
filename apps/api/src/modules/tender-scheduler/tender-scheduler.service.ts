import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../common/prisma/prisma.service";
import { deriveCategoryMatchCandidates } from "../../common/helpers/tender-category-match.helper";
import { EmailService } from "../email/email.service";

interface ExpiredTenderPayload {
  id: string;
  tenderNumber: string;
  title: string;
  tenant: { name: string };
  createdBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  };
  invitations: Array<{
    id: string;
    supplierId: string;
    supplier: {
      id: string;
      companyName: string;
      users: Array<{
        email: string;
        firstName: string;
        lastName: string;
      }>;
    };
  }>;
  bids: Array<{ id: string; supplierId: string }>;
}

@Injectable()
export class TenderSchedulerService {
  private readonly logger = new Logger(TenderSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Her dakika başında: süresi dolmuş `OPEN_FOR_BIDS` ihaleleri
   * `IN_AWARD`'a çevirir, açık `PENDING` davetlerini `EXPIRED`'a düşürür ve
   * 2 grup bilgilendirme e-postası gönderir (davetli tedarikçiler +
   * ihaleyi açan kullanıcı).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpiredTenders() {
    const now = new Date();
    const expired = await this.prisma.tender.findMany({
      where: {
        status: "OPEN_FOR_BIDS",
        bidsCloseAt: { lte: now },
      },
      include: {
        tenant: { select: { name: true } },
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
          },
        },
        invitations: {
          include: {
            supplier: {
              select: {
                id: true,
                companyName: true,
                users: {
                  where: { isActive: true },
                  orderBy: { createdAt: "asc" },
                  take: 1,
                  select: { email: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
        bids: {
          where: { status: "SUBMITTED" },
          select: { id: true, supplierId: true },
        },
      },
    });

    if (expired.length === 0) return;

    this.logger.log(`Closing ${expired.length} expired tender(s)`);

    for (const tender of expired) {
      try {
        await this.closeTender(tender);
      } catch (err) {
        this.logger.error(
          `Failed to close tender ${tender.tenderNumber}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * Kapanışa X dk kala davetli tedarikçilere hatırlatma e-postası gönderir.
   * RFQ (teklif toplama) + İngiliz Usulü her ikisinde de çalışır. Her dakika
   * tarar, idempotent (closingReminderSentAt set edilen tender tekrar gönderilmez).
   * RFQ'da zaten teklif vermiş tedarikçiye hatırlatma gitmez; açık eksiltmede
   * herkese gider (sürekli iyileştirme mümkün).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendClosingReminders() {
    const now = new Date();
    const candidates = await this.prisma.tender.findMany({
      where: {
        status: "OPEN_FOR_BIDS",
        sendClosingReminder: true,
        closingReminderSentAt: null,
        bidsCloseAt: { gt: now },
      },
      select: {
        id: true,
        tenderNumber: true,
        title: true,
        type: true,
        visibility: true,
        bidsCloseAt: true,
        reminderMinutesBefore: true,
        tenant: { select: { name: true } },
        // PUBLIC ihalede kategori-eşleşen tedarikçileri bulmak için.
        categories: { select: { categoryId: true } },
        // Zaten teklif vermiş tedarikçileri elemek için.
        bids: {
          where: { status: "SUBMITTED" },
          select: { supplierId: true },
        },
        invitations: {
          where: { status: { in: ["PENDING", "ACCEPTED"] } },
          select: {
            id: true,
            supplier: {
              select: {
                id: true,
                companyName: true,
                users: {
                  where: { isActive: true },
                  orderBy: { createdAt: "asc" },
                  take: 1,
                  select: { email: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });

    if (candidates.length === 0) return;

    const webUrl = (
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000"
    ).replace(/\/$/, "");

    for (const tender of candidates) {
      const msLeft = tender.bidsCloseAt.getTime() - now.getTime();
      const triggerMs = tender.reminderMinutesBefore * 60_000;
      if (msLeft > triggerMs) continue; // henüz vakti gelmedi

      try {
        // Idempotency — bir başka dakika tekrar göndermesin
        const claim = await this.prisma.tender.updateMany({
          where: { id: tender.id, closingReminderSentAt: null },
          data: { closingReminderSentAt: new Date() },
        });
        if (claim.count === 0) continue;

        const isAuction = tender.type === "ENGLISH_AUCTION";
        // Zaten teklif vermiş tedarikçilere hatırlatma gönderme (açık eksiltme
        // hariç — orada sürekli iyileştirme mümkün).
        const alreadyBid = new Set(tender.bids.map((b) => b.supplierId));

        // supplierId → primary user. Davetli (teklif vermemiş) ile başla.
        const recipients = new Map<
          string,
          { email: string; firstName: string; lastName: string }
        >();
        for (const inv of tender.invitations) {
          if (!isAuction && alreadyBid.has(inv.supplier.id)) continue;
          const p = inv.supplier.users[0];
          if (p) recipients.set(inv.supplier.id, p);
        }

        // PUBLIC ihale: davetlilere ek olarak İLGİLİ KATEGORİDEKİ (teklif
        // vermemiş) tedarikçilere de hatırlat — herkese değil, sadece eşleşen.
        if (tender.visibility === "PUBLIC") {
          const { segmentIds, subCandidates } = deriveCategoryMatchCandidates(
            tender.categories.map((c) => c.categoryId),
          );
          if (segmentIds.length > 0 || subCandidates.length > 0) {
            const matched = await this.prisma.supplier.findMany({
              where: {
                isActive: true,
                isBlocked: false,
                ...(alreadyBid.size > 0
                  ? { id: { notIn: [...alreadyBid] } }
                  : {}),
                OR: [
                  { sectorCategoryIds: { hasSome: segmentIds } },
                  { subCategoryIds: { hasSome: subCandidates } },
                ],
              },
              take: 300,
              select: {
                id: true,
                users: {
                  where: { isActive: true },
                  orderBy: { createdAt: "asc" },
                  take: 1,
                  select: { email: true, firstName: true, lastName: true },
                },
              },
            });
            for (const s of matched) {
              if (recipients.has(s.id)) continue;
              const p = s.users[0];
              if (p) recipients.set(s.id, p);
            }
          }
        }

        const tasks: Promise<unknown>[] = [];
        for (const [supplierId, p] of recipients) {
          tasks.push(
            this.emailService.send({
              to: {
                email: p.email,
                name: `${p.firstName} ${p.lastName}`,
              },
              templateData: {
                template: "auction_closing_reminder",
                data: {
                  supplierUserName: `${p.firstName} ${p.lastName}`,
                  tenantName: tender.tenant.name,
                  tenderNumber: tender.tenderNumber,
                  tenderTitle: tender.title,
                  minutesLeft: Math.max(1, Math.round(msLeft / 60_000)),
                  closesAt: tender.bidsCloseAt.toISOString(),
                  tenderUrl: `${webUrl}/supplier/ihaleler/${tender.id}`,
                  isAuction,
                },
              },
              context: {
                type: "auction_closing_reminder",
                id: `${tender.id}:${supplierId}`,
              },
              subject: `⏰ ${isAuction ? "Açık eksiltme" : "İhale"} yakında kapanıyor: ${tender.title} — Supkeys`,
            }),
          );
        }
        const sent = recipients.size;
        await Promise.allSettled(tasks);
        this.logger.log(
          `Sent closing reminder for ${tender.tenderNumber} to ${sent} supplier(s)`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to send closing reminder for ${tender.tenderNumber}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * Manuel erken kapatma — alıcı IN_AWARD'a geçmek istediğinde
   * cron'u beklemeden çağrılır. Tender'ı aynı şekilde yükler, state
   * kontrolü yapar ve mevcut closeTender + email akışını çalıştırır.
   *
   * Tenant scope check'i caller'ın sorumluluğundadır (TenantTendersService
   * üzerinden çağrılır).
   */
  async closeOpenBidding(tenderId: string): Promise<void> {
    const tender = await this.prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        tenant: { select: { name: true } },
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isActive: true,
          },
        },
        invitations: {
          include: {
            supplier: {
              select: {
                id: true,
                companyName: true,
                users: {
                  where: { isActive: true },
                  orderBy: { createdAt: "asc" },
                  take: 1,
                  select: { email: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
        bids: {
          where: { status: "SUBMITTED" },
          select: { id: true, supplierId: true },
        },
      },
    });

    if (!tender) throw new NotFoundException("İhale bulunamadı");
    if (tender.status !== "OPEN_FOR_BIDS") {
      throw new ConflictException(
        `Sadece OPEN_FOR_BIDS durumundaki ihale erken kapatılabilir. Mevcut: ${tender.status}`,
      );
    }

    await this.closeTender(tender);
  }

  private async closeTender(tender: ExpiredTenderPayload) {
    const submittedSupplierIds = new Set(
      tender.bids.map((b) => b.supplierId),
    );

    await this.prisma.$transaction([
      this.prisma.tender.update({
        where: { id: tender.id },
        data: { status: "IN_AWARD" },
      }),
      this.prisma.tenderInvitation.updateMany({
        where: { tenderId: tender.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      }),
    ]);

    this.logger.log(
      `Closed tender ${tender.tenderNumber} (${tender.bids.length} submitted bid(s))`,
    );

    // Bilgilendirme e-postaları (fire-and-forget)
    this.dispatchClosureEmails(tender, submittedSupplierIds).catch((err) => {
      this.logger.error(
        `dispatchClosureEmails failed for ${tender.tenderNumber}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
  }

  private async dispatchClosureEmails(
    tender: {
      id: string;
      tenderNumber: string;
      title: string;
      tenant: { name: string };
      createdBy: {
        email: string;
        firstName: string;
        lastName: string;
        isActive: boolean;
      };
      invitations: Array<{
        id: string;
        supplierId: string;
        supplier: {
          companyName: string;
          users: Array<{
            email: string;
            firstName: string;
            lastName: string;
          }>;
        };
      }>;
      bids: Array<{ supplierId: string }>;
    },
    submittedSupplierIds: Set<string>,
  ) {
    const webUrl = (
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000"
    ).replace(/\/$/, "");

    const tasks: Promise<unknown>[] = [];

    // Davetli tedarikçilere
    for (const inv of tender.invitations) {
      const primary = inv.supplier.users[0];
      if (!primary) continue;
      const hasBid = submittedSupplierIds.has(inv.supplierId);
      tasks.push(
        this.emailService.send({
          to: {
            email: primary.email,
            name: `${primary.firstName} ${primary.lastName}`,
          },
          templateData: {
            template: "tender_closed_supplier",
            data: {
              supplierUserName: `${primary.firstName} ${primary.lastName}`,
              tenantName: tender.tenant.name,
              tenderNumber: tender.tenderNumber,
              tenderTitle: tender.title,
              hasBid,
              tenderUrl: `${webUrl}/supplier/ihaleler/${tender.id}`,
            },
          },
          context: { type: "tender_closed_supplier", id: inv.id },
          subject: `📋 İhale kapandı: ${tender.title} — Supkeys`,
        }),
      );
    }

    // İhaleyi açan kullanıcıya
    if (tender.createdBy.isActive) {
      tasks.push(
        this.emailService.send({
          to: {
            email: tender.createdBy.email,
            name: `${tender.createdBy.firstName} ${tender.createdBy.lastName}`,
          },
          templateData: {
            template: "tender_closed_buyer",
            data: {
              buyerFirstName: tender.createdBy.firstName,
              tenderNumber: tender.tenderNumber,
              tenderTitle: tender.title,
              bidCount: tender.bids.length,
              invitedCount: tender.invitations.length,
              tenderUrl: `${webUrl}/dashboard/ihaleler/${tender.id}`,
            },
          },
          context: { type: "tender_closed_buyer", id: tender.id },
          subject: `🎯 İhaleniz kapandı, kazandırma zamanı: ${tender.title} — Supkeys`,
        }),
      );
    }

    await Promise.allSettled(tasks);
  }
}
