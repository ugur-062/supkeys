/**
 * Yetki tablosu Faz 2 (2026-09-05) — onaylayıcı dar bağlamı.
 *
 * ONAYLAYICI-only (ve görüntüleme izni olmayan) üye firmasının talep
 * detayını (rakip teklifler, tedarikçi kimlikleri, adresler, iç notlar) ve
 * siparişlerini GÖRMEZ — onaya bağlı olsa da (eski Faz O istisnası KALKTI).
 * Karar bağlamı `approvals/:id` projeksiyonundan gelir (approval-detail.spec).
 * Görüntüleme izni (buy:view) olan üye daraltılmaz; roles=[] üye 404.
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

describe("Faz 2 — talep owner-detayı: onaylayıcı-only HER ZAMAN 404", () => {
  it("onay bağı olsa da (bekleyen ya da karar verilmiş) talep detayı 404; görüntüleme izni olan görür", async () => {
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
    // PENDING adım → YİNE 404 (Faz 2: rakip teklifler onaylayıcıya açılmaz).
    await seedApproval(co.company.id, l1.id, co.user.id, approver.id);
    await expect(service.getOne(approverAuth, l1.id)).rejects.toThrow(
      /bulunamadı/,
    );
    // Karar verilmiş istek (geçmiş) → 404.
    await seedApproval(co.company.id, l2.id, co.user.id, approver.id, "APPROVED");
    await expect(service.getOne(approverAuth, l2.id)).rejects.toThrow(
      /bulunamadı/,
    );
    // Tur geçmişi de kapalı.
    await expect(service.roundHistory(approverAuth, l1.id)).rejects.toThrow();

    // Görüntüleme izni olan (buy:view — açık liste) daraltılmaz; kurucu görür.
    const viewer = await makeUser(prisma, co.company.id, [], {
      permissions: ["buy:view"],
    });
    const viewerAuth = {
      ...(authFor(viewer, co.company.id, []) as object),
      permissions: ["buy:view"],
    } as never;
    await expect(service.getOne(viewerAuth, l1.id)).resolves.toBeTruthy();
    await expect(service.getOne(co.auth, l1.id)).resolves.toBeTruthy();
  });

  it("Satın Almacı ve rolsüz-Kurucu owner-detayını görür; roles=[] üye 404", async () => {
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
    // Kurucu (örtük görüntüleme) — koltuğu olmasa da okur.
    const soloOwner = { ...(co.auth as object), roles: ["SAHIP"] } as never;
    await expect(service.getOne(soloOwner, listing.id)).resolves.toBeTruthy();
    // roles=[] (seat-selection sonrası) → 404.
    const bare = await makeUser(prisma, co.company.id, []);
    await expect(
      service.getOne(authFor(bare, co.company.id, []), listing.id),
    ).rejects.toThrow(/bulunamadı/);
  });
});

describe("Faz 2 — sipariş dar-bağlam", () => {
  it("ONAYLAYICI-only: onaya bağlı olsa da sipariş 404; alım tarafını görüntüleyen görür", async () => {
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

    await expect(orders.getOne(approverAuth, linkedOrder.id)).rejects.toThrow(
      /bulunamadı/,
    );
    // Liste de boş döner (görebildiği taraf yok).
    expect(await orders.list(approverAuth)).toEqual([]);
    // Alım tarafını görüntüleyen (buy:view) alıcı siparişini görür; satış tarafı görmez.
    const buyerViewer = {
      ...(approverAuth as object),
      permissions: ["buy:view"],
    } as never;
    await expect(orders.getOne(buyerViewer, linkedOrder.id)).resolves.toBeTruthy();
    const sellerViewer = {
      ...(approverAuth as object),
      permissions: ["sell:view"],
    } as never;
    await expect(orders.getOne(sellerViewer, linkedOrder.id)).rejects.toThrow(
      /bulunamadı/,
    );
    // Kurucu her ikisini de görür.
    await expect(orders.getOne(co.auth, linkedOrder.id)).resolves.toBeTruthy();
  });
});
