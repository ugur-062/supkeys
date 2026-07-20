/**
 * RLS Faz 2d/5 — İZOLASYON KANITI (asıl test). Gerçek runtime yığını: kısıtlı rol
 * (rothern_app) + RLS extension (set_config) + ALS bağlamı + policy.
 *
 * ROBUST DESEN (deadlock-immune): beforeEach truncateAll YOK. RLS bağlamı
 * companyId'ye göre DOĞAL izole eder (her test benzersiz firma yaratır → context=A
 * yalnız A'nın satırlarını görür); owner/permissive sorgular testin kendi
 * firma-id'lerine scope'lanır. Böylece TRUNCATE (AccessExclusiveLock) ↔ kısıtlı-
 * bağlantı ters-kilit yarışı ORTADAN KALKAR (bkz. rls-db.ts + CLAUDE.md deadlock).
 */
import { PrismaClient } from "@rothern/db";
import { prisma, truncateAll } from "./test-db";
import { makeCompany, makeUser } from "./factories";
import { ensureRestrictedRolePassword, makeRestrictedPrisma } from "./rls-db";
import { createRlsExtension } from "../../src/common/prisma/rls-extension";
import { runWithTenantContext } from "../../src/common/tenant/tenant-context";

let restricted: PrismaClient;
let rls: ReturnType<PrismaClient["$extends"]>;
const prevFlag = process.env.RLS_ENABLED;

beforeAll(async () => {
  process.env.RLS_ENABLED = "true";
  await ensureRestrictedRolePassword(prisma as never);
  restricted = makeRestrictedPrisma();
  await restricted.$connect();
  rls = restricted.$extends(createRlsExtension());
});
afterAll(async () => {
  if (prevFlag === undefined) delete process.env.RLS_ENABLED;
  else process.env.RLS_ENABLED = prevFlag;
  // Kısıtlı client ÖNCE kapatılır → truncate (owner) onunla yarışmaz.
  await restricted.$disconnect();
  await truncateAll();
  await prisma.$disconnect();
});

const addr = (companyId: string, title: string) =>
  prisma.companyAddress.create({
    data: { companyId, title, type: "TESLIMAT", addressLine: "X", country: "TR" },
  });

async function seedAB() {
  const a = await makeCompany(prisma, { name: "A" });
  const b = await makeCompany(prisma, { name: "B" });
  await addr(a.id, "A-adres");
  await addr(b.id, "B-adres");
  return { a, b };
}

const R = () => rls as never as PrismaClient;
// Bağlam içinde extended-restricted sorgu (runtime yolu birebir). await İÇERDE
// olmalı — PrismaPromise LAZY, aksi halde sorgu ALS dışında koşar (bkz. Faz 1b).
const asCompany = <T>(companyId: string, fn: () => Promise<T>): Promise<T> =>
  runWithTenantContext({ companyId, realm: "company" }, async () => await fn());

describe("Faz 2d/5 — RLS izolasyon (kısıtlı rol + policy)", () => {
  it("A firması YALNIZ kendi adresini görür — B'yi GÖREMEZ", async () => {
    const { a } = await seedAB();
    // RLS context=a → yalnız companyId=a satırları (a benzersiz → sadece bu testin A'sı).
    const rows = await asCompany(a.id, () => R().companyAddress.findMany());
    expect(rows.map((r) => r.title)).toEqual(["A-adres"]);
  });

  it("B bağlamı → yalnız B", async () => {
    const { b } = await seedAB();
    const rows = await asCompany(b.id, () => R().companyAddress.findMany());
    expect(rows.map((r) => r.title)).toEqual(["B-adres"]);
  });

  it("KANIT-ÇİFTİ: aynı rol+bağlam — permissive tabloda (listings) HER İKİ firmayı, gerçek-policy'de (addresses) YALNIZ kendini görür", async () => {
    const { a, b } = await seedAB();
    const ua = await makeUser(prisma, a.id);
    const ub = await makeUser(prisma, b.id);
    await prisma.listing.create({
      data: { companyId: a.id, type: "ALIM", title: "A-ilan", createdById: ua.id },
    });
    await prisma.listing.create({
      data: { companyId: b.id, type: "ALIM", title: "B-ilan", createdById: ub.id },
    });
    await asCompany(a.id, async () => {
      const addrs = await R().companyAddress.findMany();
      // listings permissive → cross-tenant görür; bu testin a+b ilanlarına scope.
      const listings = await R().listing.findMany({
        where: { companyId: { in: [a.id, b.id] } },
      });
      expect(addrs.map((r) => r.title)).toEqual(["A-adres"]); // gerçek policy
      expect(listings.length).toBe(2); // permissive → A+B
    });
  });

  it("BYPASS/owner cross-tenant OKUR (bypass çalışıyor)", async () => {
    const { a, b } = await seedAB();
    const all = await prisma.companyAddress.findMany({
      where: { companyId: { in: [a.id, b.id] } },
    });
    expect(all.length).toBe(2);
  });

  it("BAĞLAM YOK → DB katmanı BOŞ döner (PATLAMAZ): raw kısıtlı sorgu, GUC unset", async () => {
    await seedAB();
    // Extension YOK (raw restricted) → set_config yok → policy companyId=NULL →
    // HİÇBİR satır (var olan tüm veriye rağmen). Sessiz yanlış-tenant DEĞİL, boş.
    const rows = await restricted.companyAddress.findMany();
    expect(rows).toEqual([]);
  });

  it("BAĞLAM YOK → app katmanı FIRLAT (company realm + companyId yok, fail-closed)", async () => {
    await expect(
      runWithTenantContext(
        { companyId: null, realm: "company" },
        async () => await R().companyAddress.findMany(),
      ),
    ).rejects.toThrow(/tenant bağlamı|fail-closed/);
  });

  it("YENİ TABLO (2d-2a) izolasyon: listing_templates — A yalnız kendi şablonunu görür", async () => {
    const { a, b } = await seedAB();
    const ua = await makeUser(prisma, a.id);
    const ub = await makeUser(prisma, b.id);
    const at = await prisma.listingTemplate.create({
      data: { companyId: a.id, name: "A-tpl", payload: {}, createdById: ua.id },
    });
    await prisma.listingTemplate.create({
      data: { companyId: b.id, name: "B-tpl", payload: {}, createdById: ub.id },
    });
    const rows = await asCompany(a.id, () => R().listingTemplate.findMany());
    expect(rows.map((r) => r.id)).toEqual([at.id]);
  });

  it("TRANSİTİF (Faz 5a) izolasyon: approval_flow_steps — A yalnız kendi step'ini görür (EXISTS parent)", async () => {
    const { a, b } = await seedAB();
    const ua = await makeUser(prisma, a.id);
    const ub = await makeUser(prisma, b.id);
    const fa = await prisma.approvalFlow.create({
      data: {
        companyId: a.id,
        name: "A-flow",
        type: "LISTING_AWARD",
        createdById: ua.id,
        steps: { create: [{ approverUserId: ua.id, order: 1 }] },
      },
      include: { steps: true },
    });
    await prisma.approvalFlow.create({
      data: {
        companyId: b.id,
        name: "B-flow",
        type: "LISTING_AWARD",
        createdById: ub.id,
        steps: { create: [{ approverUserId: ub.id, order: 1 }] },
      },
    });
    const steps = await asCompany(a.id, () => R().approvalFlowStep.findMany());
    // EXISTS parent: yalnız ebeveyni A'ya ait step (bu testin A-flow step'i).
    expect(steps.map((s) => s.id)).toEqual([fa.steps[0]!.id]);
  });

  it("İKİ-TARAFLI (Faz 6a): connection A↔B — HER İKİ taraf görür, üçüncü firma C GÖREMEZ", async () => {
    const { a, b } = await seedAB();
    const c = await makeCompany(prisma, { name: "C" });
    const ua = await makeUser(prisma, a.id);
    const conn = await prisma.companyConnection.create({
      data: {
        inviterCompanyId: a.id,
        inviteeCompanyId: b.id,
        invitedById: ua.id,
        status: "ACTIVE",
        origin: "INVITE",
      },
    });
    const seesIt = async (companyId: string) =>
      (
        await asCompany(companyId, () => R().companyConnection.findMany())
      ).some((x) => x.id === conn.id);
    expect(await seesIt(a.id)).toBe(true); // inviter
    expect(await seesIt(b.id)).toBe(true); // invitee
    expect(await seesIt(c.id)).toBe(false); // üçüncü taraf — GÖREMEZ
  });

  it("İKİ-TARAFLI (Faz 6b): referral invite — inviter görür, üçüncü firma GÖREMEZ", async () => {
    const { a } = await seedAB();
    const c = await makeCompany(prisma, { name: "C" });
    const ua = await makeUser(prisma, a.id);
    const inv = await prisma.companyReferralInvite.create({
      data: {
        inviterCompanyId: a.id,
        email: `ref-${ua.id}@x.com`,
        invitedById: ua.id,
      },
    });
    const asInviter = await asCompany(a.id, () =>
      R().companyReferralInvite.findMany(),
    );
    const asC = await asCompany(c.id, () =>
      R().companyReferralInvite.findMany(),
    );
    expect(asInviter.some((x) => x.id === inv.id)).toBe(true);
    expect(asC.some((x) => x.id === inv.id)).toBe(false);
  });

  it("İKİ-TARAFLI (Faz 6c): message thread A↔B + mesaj — HER İKİ taraf görür, üçüncü GÖREMEZ (EXISTS parent)", async () => {
    const { a, b } = await seedAB();
    const c = await makeCompany(prisma, { name: "C" });
    const thread = await prisma.messageThread.create({
      data: { buyerCompanyId: a.id, sellerCompanyId: b.id },
    });
    const msg = await prisma.message.create({
      data: {
        threadId: thread.id,
        senderCompanyId: a.id,
        senderName: "A User",
        body: "merhaba",
      },
    });
    const seesMsg = async (cid: string) =>
      (await asCompany(cid, () => R().message.findMany())).some(
        (x) => x.id === msg.id,
      );
    expect(await seesMsg(a.id)).toBe(true); // buyer
    expect(await seesMsg(b.id)).toBe(true); // seller
    expect(await seesMsg(c.id)).toBe(false); // üçüncü — GÖREMEZ
  });

  it("YAZMA izolasyonu (WITH CHECK): A bağlamında B'ye adres yazılamaz", async () => {
    const { b } = await seedAB();
    await expect(
      asCompany("baska-firma-A", () =>
        R().companyAddress.create({
          data: {
            companyId: b.id, // bağlam A ama satır B → WITH CHECK reddeder
            title: "sızma",
            type: "TESLIMAT",
            addressLine: "X",
            country: "TR",
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
