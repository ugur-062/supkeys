/**
 * Faz O — Onaylayıcı dar-bağlam: ONAYLAYICI-only (ve rolsüz) üye, firmasının
 * owner-detayını (rakip teklifler + iç notlar) ve siparişlerini yalnız
 * KENDİSİNE DÜŞMÜŞ (bekleyen veya karar verilmiş) onaya bağlı ise görür;
 * aksi 404. FULL_READ (etiket/işlem rolleri) daraltılmaz.
 */
import { CompanyRole } from "@rothern/db";
import { CompanyOrdersService } from "../../src/modules/company-orders/services/company-orders.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { makeService } from "./make-service";

function ordersService() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  return new CompanyOrdersService(
    prisma as never,
    email as never,
    config as never,
    new NotificationService(prisma as never),
    new AuditService(prisma as never),
    prisma as never,
  );
}

function authFor(
  u: { id: string; email: string },
  companyId: string,
  roles: CompanyRole[],
) {
  return {
    userId: u.id,
    companyId,
    email: u.email,
    roles,
    country: "TR",
    tier: "GOLD",
    isOwner: false,
    companyVerificationStatus: "VERIFIED",
  } as never;
}

/** listingId'ye bağlı, verilen onaycıya adım içeren onay isteği. */
async function seedApproval(
  companyId: string,
  listingId: string,
  createdById: string,
  approverUserId: string,
  stepStatus: "PENDING" | "APPROVED" = "PENDING",
) {
  return prisma.approvalRequest.create({
    data: {
      companyId,
      listingId,
      type: "LISTING_AWARD",
      status: stepStatus === "APPROVED" ? "APPROVED" : "PENDING",
      amount: 1000,
      currency: "TRY",
      createdById,
      steps: {
        create: [{ approverUserId, order: 1, status: stepStatus }],
      },
    },
  });
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

describe("Faz O — ihale owner-detayı dar-bağlam", () => {
  it("ONAYLAYICI-only: onay bağı yoksa 404; PENDING adımı varsa TAM detay; karar verdiği (geçmiş) de erişilir", async () => {
    const { service } = makeService();
    const co = await makeCompanyWithUser(prisma, { country: "TR" });
    const approver = await makeUser(prisma, co.company.id, [
      CompanyRole.ONAYLAYICI,
    ]);
    const approverAuth = authFor(approver, co.company.id, [
      CompanyRole.ONAYLAYICI,
    ]);
    const l1 = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "OPEN",
    });
    const l2 = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "OPEN",
    });

    // Bağ yok → 404 (varlık sızdırmaz).
    await expect(service.getOne(approverAuth, l1.id)).rejects.toThrow(
      /bulunamadı/,
    );

    // PENDING adım → tam owner-detayı (isOwner görünümü, bids alanı mevcut).
    await seedApproval(co.company.id, l1.id, co.user.id, approver.id);
    const detail = (await service.getOne(approverAuth, l1.id)) as {
      isOwner: boolean;
    };
    expect(detail.isOwner).toBe(true);

    // Kararını VERMİŞ olduğu istek (geçmiş) → hâlâ erişilir.
    await seedApproval(co.company.id, l2.id, co.user.id, approver.id, "APPROVED");
    await expect(service.getOne(approverAuth, l2.id)).resolves.toBeTruthy();
  });

  it("FULL_READ daraltılmaz: SA-rollü üye ve rolsüz-Kurucu her owner-detayı görür; roles=[] üye 404", async () => {
    const { service } = makeService();
    const co = await makeCompanyWithUser(prisma, { country: "TR" });
    const listing = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "OPEN",
    });

    const buyer = await makeUser(prisma, co.company.id, [
      CompanyRole.SATIN_ALMACI,
    ]);
    await expect(
      service.getOne(
        authFor(buyer, co.company.id, [CompanyRole.SATIN_ALMACI]),
        listing.id,
      ),
    ).resolves.toBeTruthy();

    // roles=[] (seat-selection sonrası) → onay bağı yoksa 404.
    const bare = await makeUser(prisma, co.company.id, []);
    await expect(
      service.getOne(authFor(bare, co.company.id, []), listing.id),
    ).rejects.toThrow(/bulunamadı/);
  });
});

describe("Faz O — sipariş dar-bağlam", () => {
  it("ONAYLAYICI-only: onaya bağlı ihalenin siparişini görür; bağsız siparişe 404; SA-rollü tam görür", async () => {
    const orders = ordersService();
    const co = await makeCompanyWithUser(prisma, { country: "TR" });
    const other = await makeCompanyWithUser(prisma, { country: "TR" });
    const approver = await makeUser(prisma, co.company.id, [
      CompanyRole.ONAYLAYICI,
    ]);
    const approverAuth = authFor(approver, co.company.id, [
      CompanyRole.ONAYLAYICI,
    ]);

    const listing = await makeListing(prisma, {
      companyId: co.company.id,
      createdById: co.user.id,
      status: "AWARDED",
    });
    await seedApproval(co.company.id, listing.id, co.user.id, approver.id, "APPROVED");
    const linkedOrder = await prisma.companyOrder.create({
      data: {
        listingId: listing.id,
        buyerCompanyId: co.company.id,
        sellerCompanyId: other.company.id,
        amount: 1000,
        status: "PENDING",
      },
    });
    const bareOrder = await prisma.companyOrder.create({
      data: {
        buyerCompanyId: co.company.id,
        sellerCompanyId: other.company.id,
        amount: 500,
        status: "PENDING",
      },
    });

    await expect(
      orders.getOne(approverAuth, linkedOrder.id),
    ).resolves.toBeTruthy();
    await expect(orders.getOne(approverAuth, bareOrder.id)).rejects.toThrow(
      /bulunamadı/,
    );
    // FULL_READ (kurucu auth'u) her ikisini de görür.
    await expect(orders.getOne(co.auth, bareOrder.id)).resolves.toBeTruthy();
  });
});
