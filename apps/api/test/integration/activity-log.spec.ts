/**
 * Faz O — firma-yüzü aktivite logu: yalnız kendi tenant'ının company.* eylem
 * kayıtları; K+Y görür (rol kapısı), tier kapısı controller guard'ında
 * (Silver+ — metadata testli); sanitize projeksiyon (ip/userAgent yok).
 */
import "reflect-metadata";
import { CompanyRole } from "@rothern/db";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyActivityService } from "../../src/modules/company-activity/company-activity.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeUser } from "./factories";

function service() {
  return new CompanyActivityService(new AuditService(prisma as never));
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
    isOwner: false,
    country: "TR",
    tier: "GOLD",
  } as never;
}

async function seedLog(tenantId: string, action: string, extra: object = {}) {
  return prisma.auditLog.create({
    data: {
      action,
      actorType: "company",
      actorEmail: "actor@x.com",
      tenantId,
      entityType: "listing",
      entityId: "e1",
      ip: "10.0.0.1",
      userAgent: "test-agent",
      metadata: { kind: "test" },
      ...extra,
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

describe("Faz O — aktivite logu", () => {
  it("K+Y görür; SA-only ve ONAYLAYICI-only 403", async () => {
    const svc = service();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await seedLog(co.company.id, "company.listing.published");

    // Kurucu (isOwner) görür.
    const out = await svc.list(co.auth, {});
    expect(out.items).toHaveLength(1);

    // YONETICI görür.
    const manager = await makeUser(prisma, co.company.id, [
      CompanyRole.YONETICI,
    ]);
    await expect(
      svc.list(authFor(manager, co.company.id, [CompanyRole.YONETICI]), {}),
    ).resolves.toBeTruthy();

    // İşlem rolleri ve onaylayıcı GÖREMEZ.
    for (const roles of [
      [CompanyRole.SATIN_ALMACI],
      [CompanyRole.ONAYLAYICI],
    ]) {
      const u = await makeUser(prisma, co.company.id, roles);
      await expect(
        svc.list(authFor(u, co.company.id, roles), {}),
      ).rejects.toThrow(/yönetim yetkisi/);
    }
  });

  it("cross-tenant sızıntı yok + yalnız company.* + sanitize (ip/userAgent yok)", async () => {
    const svc = service();
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await seedLog(a.company.id, "company.bank_account.updated", {
      metadata: { ibanMasked: "TR**1326", changedFields: ["iban"] },
    });
    await seedLog(b.company.id, "company.listing.published");
    // admin.* kaydı aynı tenant'ta olsa bile firma penceresine girmez.
    await seedLog(a.company.id, "admin.company.tier_set");

    const out = await svc.list(a.auth, {});
    expect(out.items).toHaveLength(1); // yalnız A'nın company.* kaydı
    const row = out.items[0]! as Record<string, unknown>;
    expect(row.action).toBe("company.bank_account.updated");
    expect(row.metadata).toMatchObject({ ibanMasked: "TR**1326" });
    expect(row).not.toHaveProperty("ip");
    expect(row).not.toHaveProperty("userAgent");
    expect(row).not.toHaveProperty("tenantId");
  });

  it("kullanıcı yönetimi kaydı hedef kişinin adını taşır; başka firmanın kişisi çözülmez (arayüz testi api2-01)", async () => {
    const svc = service();
    const a = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const b = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const member = await makeUser(prisma, a.company.id, [CompanyRole.SATISCI]);
    await prisma.companyUser.update({
      where: { id: member.id },
      data: { firstName: "Ayse", lastName: "Yilmaz" },
    });
    await seedLog(a.company.id, "company.user.permissions_changed", {
      entityType: "company_user",
      entityId: member.id,
    });
    // A'nın günlüğüne B'nin kullanıcısını gösteren (bozuk/eski) kayıt: ad sızmaz.
    await seedLog(a.company.id, "company.user.removed", {
      entityType: "company_user",
      entityId: b.user.id,
    });
    await seedLog(a.company.id, "company.listing.published");

    const out = await svc.list(a.auth, {});
    const byAction = new Map(
      out.items.map((i) => [(i as { action: string }).action, i as Record<string, unknown>]),
    );
    expect(byAction.get("company.user.permissions_changed")!.entityLabel).toBe("Ayse Yilmaz");
    expect(byAction.get("company.user.removed")!.entityLabel).toBeNull();
    expect(byAction.get("company.listing.published")!.entityLabel).toBeNull();
  });

  it("module filtresi + sayfalama", async () => {
    const svc = service();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await seedLog(co.company.id, "company.listing.published");
    await seedLog(co.company.id, "company.user.roles_changed");
    await seedLog(co.company.id, "company.user.removed");

    const users = await svc.list(co.auth, { module: "user" });
    expect(users.items).toHaveLength(2);
    const paged = await svc.list(co.auth, { page: 1, pageSize: 2 });
    expect(paged.items).toHaveLength(2);
    expect(paged.pagination.total).toBe(3);
  });

  it("modül filtresi alt-tür eylemlerini de kapsar (approval_flow, listing_document, bid_document, signup) — benzer adlı modül sızmaz (derin denetim S017)", async () => {
    const svc = service();
    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    await seedLog(co.company.id, "company.approval.approved");
    await seedLog(co.company.id, "company.approval_flow.deleted");
    await seedLog(co.company.id, "company.listing.published");
    await seedLog(co.company.id, "company.listing_document.added");
    await seedLog(co.company.id, "company.bid_document.removed");
    await seedLog(co.company.id, "company.signup");
    await seedLog(co.company.id, "company.signup_email_changed");
    await seedLog(co.company.id, "company.ownership.transferred");

    const actions = async (module: string) =>
      (await svc.list(co.auth, { module })).items.map((i) => (i as { action: string }).action).sort();
    expect(await actions("approval")).toEqual(["company.approval.approved", "company.approval_flow.deleted"]);
    expect(await actions("listing")).toEqual(["company.listing.published", "company.listing_document.added"]);
    expect(await actions("bid")).toEqual(["company.bid_document.removed"]);
    expect(await actions("signup")).toEqual(["company.signup", "company.signup_email_changed"]);
    expect(await actions("user")).toEqual(["company.ownership.transferred"]);
    const all = await svc.list(co.auth, { module: "approval" });
    expect(all.pagination.total).toBe(2);
  });

  it("tier kapısı: controller CompanyPaidTierGuard (Silver+) taşır", async () => {
    const { CompanyActivityController } = await import(
      "../../src/modules/company-activity/company-activity.controller"
    );
    const { CompanyPaidTierGuard } = await import(
      "../../src/modules/company-auth/guards/company-paid-tier.guard"
    );
    const guards = (Reflect.getMetadata(
      "__guards__",
      CompanyActivityController,
    ) ?? []) as unknown[];
    expect(guards).toContain(CompanyPaidTierGuard);
  });
});
