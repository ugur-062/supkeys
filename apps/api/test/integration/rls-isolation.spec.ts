/**
 * RLS Faz 2d — İZOLASYON KANITI (asıl test). Gerçek runtime yığını:
 * kısıtlı rol (rothern_app) + RLS extension (set_config) + ALS bağlamı + policy.
 * company_addresses/company_bank_accounts gerçek policy'li; listings hâlâ
 * permissive (kanıt-çifti için).
 *
 * Kanıtlar: (1) A, B'yi GÖREMEZ; (2) aynı rol+bağlam farklı policy → permissive
 * tabloda görür, gerçek policy'de görmez (engelleyen = policy); (3) bypass/owner
 * cross-tenant okur; (4) bağlam yok → BOŞ (DB) + FIRLAT (app), sessiz yanlış-
 * tenant ASLA.
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
  await restricted.$disconnect();
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
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

// Bağlam içinde extended-restricted sorgu (runtime yolu birebir). await İÇERDE
// olmalı — PrismaPromise LAZY, aksi halde sorgu ALS dışında koşar (bkz. Faz 1b).
const asCompany = <T>(companyId: string, fn: () => Promise<T>): Promise<T> =>
  runWithTenantContext({ companyId, realm: "company" }, async () => await fn());

describe("Faz 2d — RLS izolasyon (kısıtlı rol + policy)", () => {
  it("A firması YALNIZ kendi adresini görür — B'yi GÖREMEZ", async () => {
    const { a } = await seedAB();
    const rows = await asCompany(a.id, () =>
      (rls as never as PrismaClient).companyAddress.findMany(),
    );
    expect(rows.map((r) => r.title)).toEqual(["A-adres"]);
  });

  it("B bağlamı → yalnız B", async () => {
    const { b } = await seedAB();
    const rows = await asCompany(b.id, () =>
      (rls as never as PrismaClient).companyAddress.findMany(),
    );
    expect(rows.map((r) => r.title)).toEqual(["B-adres"]);
  });

  it("KANIT-ÇİFTİ: aynı rol+bağlam — permissive tabloda (listings) HEPSİNİ, gerçek-policy'de (addresses) YALNIZ kendini görür", async () => {
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
      const addrs = await (rls as never as PrismaClient).companyAddress.findMany();
      const listings = await (rls as never as PrismaClient).listing.findMany();
      // addresses: gerçek policy → yalnız A. listings: permissive → A+B.
      expect(addrs.map((r) => r.title)).toEqual(["A-adres"]);
      expect(listings.length).toBe(2);
    });
  });

  it("BYPASS/owner cross-tenant OKUR (bypass çalışıyor)", async () => {
    await seedAB();
    // owner prisma = RLS bypass (FORCE yok) → iki adresi de görür.
    const all = await prisma.companyAddress.findMany();
    expect(all.length).toBe(2);
  });

  it("BAĞLAM YOK → DB katmanı BOŞ döner (PATLAMAZ): raw kısıtlı sorgu, GUC unset", async () => {
    await seedAB();
    // Extension YOK (raw restricted) → set_config yapılmaz → policy company=NULL
    // → hiçbir satır. Sessiz yanlış-tenant DEĞİL, boş.
    const rows = await restricted.companyAddress.findMany();
    expect(rows).toEqual([]);
  });

  it("BAĞLAM YOK → app katmanı FIRLAT (company realm + companyId yok, fail-closed)", async () => {
    await seedAB();
    await expect(
      runWithTenantContext(
        { companyId: null, realm: "company" },
        async () => await (rls as never as PrismaClient).companyAddress.findMany(),
      ),
    ).rejects.toThrow(/tenant bağlamı|fail-closed/);
  });

  it("YENİ TABLO (2d-2a) izolasyon: listing_templates — A yalnız kendi şablonunu görür", async () => {
    const { a, b } = await seedAB();
    const ua = await makeUser(prisma, a.id);
    const ub = await makeUser(prisma, b.id);
    await prisma.listingTemplate.create({
      data: { companyId: a.id, name: "A-tpl", payload: {}, createdById: ua.id },
    });
    await prisma.listingTemplate.create({
      data: { companyId: b.id, name: "B-tpl", payload: {}, createdById: ub.id },
    });
    const rows = await asCompany(a.id, () =>
      (rls as never as PrismaClient).listingTemplate.findMany(),
    );
    expect(rows.map((r) => r.name)).toEqual(["A-tpl"]);
  });

  it("YAZMA izolasyonu (WITH CHECK): A bağlamında B'ye adres yazılamaz", async () => {
    const { b } = await seedAB();
    await expect(
      asCompany("some-other-company-A", () =>
        (rls as never as PrismaClient).companyAddress.create({
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
