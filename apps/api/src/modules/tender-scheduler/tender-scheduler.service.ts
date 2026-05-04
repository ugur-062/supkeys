import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EmailQueue } from "../email/email.queue";

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
    private readonly emailQueue: EmailQueue,
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
        this.emailQueue.enqueue({
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
        this.emailQueue.enqueue({
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
