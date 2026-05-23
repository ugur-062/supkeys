/**
 * V2-7 İngiliz Usulü Açık Eksiltme — kapsamlı entegrasyon testi.
 *
 * Test edilen özellikler:
 *  1. 5 görünürlük modu (OWN_ONLY, BEST_PRICE, OWN_RANK, BEST_AND_OWN_RANK, ALL)
 *  2. Decrement kuralı (AMOUNT + PERCENT)
 *  3. Auto-extend (son dakika teklif → kapanış uzar)
 *  4. Closing reminder ayarı persistence
 *  5. Round zinciri (previousTenderId)
 *  6. Decimal places
 *
 * Yöntem: Prisma ile setup + HTTP ile supplier login + bid + visibility verify.
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

const API = "http://localhost:4000/api";
const prisma = new PrismaClient();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

interface TestSupplier {
  id: string;
  companyName: string;
  userId: string;
  email: string;
  password: string;
  token?: string;
}

let testsRun = 0;
let testsPassed = 0;
const failures: string[] = [];

function assert(cond: boolean, label: string, detail?: string) {
  testsRun++;
  if (cond) {
    testsPassed++;
    console.log(`  ✅ ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function http(method: string, path: string, token?: string, body?: unknown) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _raw: text };
  }
  return { status: r.status, data };
}

async function findOrCreateAuthUser(email: string, password: string) {
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
  if (existing) {
    await supabase.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const r = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (r.error || !r.data.user) throw new Error(`Supabase createUser: ${r.error?.message}`);
  return r.data.user.id;
}

async function ensureSupplier(
  spec: { companyName: string; taxNumber: string; email: string; password: string },
  tenantId: string,
): Promise<TestSupplier> {
  const authId = await findOrCreateAuthUser(spec.email, spec.password);

  let supplier = await prisma.supplier.findUnique({ where: { taxNumber: spec.taxNumber } });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        companyName: spec.companyName,
        companyType: "JOINT_STOCK",
        taxNumber: spec.taxNumber,
        taxOffice: "Test V.D.",
        taxCertUrl: "data:application/pdf;base64,JVBERi0xLjQK",
        city: "İstanbul",
        district: "Beşiktaş",
        addressLine: "Test Mah. No:1",
        membership: "STANDARD",
      },
    });
  }

  const existingUser = await prisma.supplierUser.findUnique({ where: { email: spec.email } });
  let userId: string;
  if (existingUser) {
    await prisma.supplierUser.update({
      where: { id: existingUser.id },
      data: { authId, passwordHash: null, isActive: true, supplierId: supplier.id },
    });
    userId = existingUser.id;
  } else {
    const u = await prisma.supplierUser.create({
      data: {
        email: spec.email,
        authId,
        passwordHash: null,
        firstName: spec.companyName.split(" ")[0],
        lastName: "Yetkili",
        supplierId: supplier.id,
        isActive: true,
      },
    });
    userId = u.id;
  }

  await prisma.supplierTenantRelation.upsert({
    where: { supplierId_tenantId: { supplierId: supplier.id, tenantId } },
    update: { status: "ACTIVE" },
    create: { supplierId: supplier.id, tenantId, status: "ACTIVE" },
  });

  return {
    id: supplier.id,
    companyName: supplier.companyName,
    userId,
    email: spec.email,
    password: spec.password,
  };
}

async function loginSupplier(s: TestSupplier): Promise<string> {
  const r = await http("POST", "/supplier-auth/login", undefined, {
    email: s.email,
    password: s.password,
  });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error(`Supplier login failed (${s.email}): ${JSON.stringify(r.data)}`);
  }
  return r.data.token;
}

async function createAuction(opts: {
  tenantUserId: string;
  tenantId: string;
  title: string;
  bidVisibility: string;
  decrementType?: "AMOUNT" | "PERCENT";
  decrementValue?: number;
  bidsCloseInMin: number;
  autoExtendOnLateBid?: boolean;
  autoExtendThresholdMin?: number;
  autoExtendByMinutes?: number;
  decimalPlaces?: number;
  sendClosingReminder?: boolean;
  reminderMinutesBefore?: number;
  supplierIds: string[];
}) {
  // Tender oluştur (PUBLISHED + IN_BIDDING state — direct Prisma)
  const tenderNumber = `TEST-AUC-${Date.now().toString(36)}`;
  const tender = await prisma.tender.create({
    data: {
      tenantId: opts.tenantId,
      tenderNumber,
      type: "ENGLISH_AUCTION",
      title: opts.title,
      primaryCurrency: "TRY",
      paymentTerm: "CASH",
      isSealedBid: false,
      requireAllItems: true,
      requireBidDocument: false,
      bidVisibility: opts.bidVisibility as any,
      priceDecrementType: opts.decrementType ?? null,
      priceDecrementValue: opts.decrementValue ?? null,
      priceDecrementBasis: opts.decrementType ? "OWN_LAST_BID" : null,
      decimalPlaces: opts.decimalPlaces ?? 2,
      sendClosingReminder: opts.sendClosingReminder ?? false,
      reminderMinutesBefore: opts.reminderMinutesBefore ?? 60,
      autoExtendOnLateBid: opts.autoExtendOnLateBid ?? false,
      autoExtendThresholdMin: opts.autoExtendThresholdMin ?? 2,
      autoExtendByMinutes: opts.autoExtendByMinutes ?? 2,
      bidsCloseAt: new Date(Date.now() + opts.bidsCloseInMin * 60_000),
      publishedAt: new Date(),
      bidsOpenAt: new Date(),
      status: "OPEN_FOR_BIDS",
      createdById: opts.tenantUserId,
      items: {
        create: [
          { orderIndex: 0, name: "Test Kalem 1", unit: "ADET", quantity: 10, targetUnitPrice: 100 },
          { orderIndex: 1, name: "Test Kalem 2", unit: "ADET", quantity: 5, targetUnitPrice: 200 },
        ],
      },
      invitations: {
        create: opts.supplierIds.map((sid) => ({
          supplierId: sid,
          status: "PENDING" as const,
          emailSentAt: new Date(),
        })),
      },
    },
    include: { items: true },
  });
  return tender;
}

async function submitBid(token: string, tenderId: string, items: { tenderItemId: string; unitPrice: number }[]) {
  // 1) Save draft
  const save = await http("POST", `/supplier/tenders/${tenderId}/bid`, token, {
    items,
  });
  if (save.status !== 200 && save.status !== 201) return save;
  // 2) Submit
  return http("POST", `/supplier/tenders/${tenderId}/bid/submit`, token);
}

async function getTenderAsSupplier(token: string, tenderId: string) {
  return http("GET", `/supplier/tenders/${tenderId}`, token);
}

async function cleanup() {
  // Test'ler bittiğinde TEST-AUC- ile başlayan ihaleleri sil
  await prisma.bid.deleteMany({ where: { tender: { tenderNumber: { startsWith: "TEST-AUC-" } } } });
  await prisma.tenderInvitation.deleteMany({ where: { tender: { tenderNumber: { startsWith: "TEST-AUC-" } } } });
  await prisma.tenderItem.deleteMany({ where: { tender: { tenderNumber: { startsWith: "TEST-AUC-" } } } });
  await prisma.tender.deleteMany({ where: { tenderNumber: { startsWith: "TEST-AUC-" } } });
}

async function main() {
  console.log("🧪 V2-7 İngiliz Usulü kapsamlı test\n");

  // ---- SETUP ----
  console.log("📦 Setup: tenant + 3 supplier hazırlanıyor...");
  const tenant = await prisma.tenant.findUnique({ where: { slug: "demo" } });
  if (!tenant) throw new Error("Demo tenant yok");
  // V2-6.5: COMPANY_ADMIN'de tender:edit FORBIDDEN. Test için BUYER user lazım.
  const tenantUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "BUYER", isActive: true, deletedAt: null },
  });
  if (!tenantUser) throw new Error("BUYER user yok — önce `pnpm --filter @supkeys/db create-test-user TEST_USER_EMAIL=buyer@demo.com TEST_USER_ROLE=BUYER` çalıştır");

  const suppliers: TestSupplier[] = [];
  suppliers.push(await ensureSupplier(
    { companyName: "AuctionTest A.Ş.", taxNumber: "9999000001", email: "auction-a@test.local", password: "Auction1234" },
    tenant.id,
  ));
  suppliers.push(await ensureSupplier(
    { companyName: "AuctionTest B.Ş.", taxNumber: "9999000002", email: "auction-b@test.local", password: "Auction1234" },
    tenant.id,
  ));
  suppliers.push(await ensureSupplier(
    { companyName: "AuctionTest C.Ş.", taxNumber: "9999000003", email: "auction-c@test.local", password: "Auction1234" },
    tenant.id,
  ));
  for (const s of suppliers) s.token = await loginSupplier(s);
  console.log(`✓ 3 supplier hazır (auction-a/b/c@test.local)\n`);

  await cleanup();

  // ============================================================================
  // TEST 1: 5 görünürlük modu
  // ============================================================================
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 1: 5 Görünürlük Modu");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const visibilityModes = ["OWN_ONLY", "BEST_PRICE", "OWN_RANK", "BEST_AND_OWN_RANK", "ALL"];

  for (const mode of visibilityModes) {
    console.log(`\n— Mode: ${mode}`);
    const tender = await createAuction({
      tenantUserId: tenantUser.id,
      tenantId: tenant.id,
      title: `Görünürlük testi: ${mode}`,
      bidVisibility: mode,
      bidsCloseInMin: 60,
      supplierIds: suppliers.map((s) => s.id),
    });

    // 3 supplier farklı fiyatlarda teklif veriyor
    // A: en düşük (1500), B: orta (1700), C: en yüksek (1900)
    // Item 1: 10 adet, Item 2: 5 adet
    // A: 10*100 + 5*100 = 1500
    // B: 10*120 + 5*100 = 1700
    // C: 10*140 + 5*100 = 1900
    await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 100 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    await submitBid(suppliers[1]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 120 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    await submitBid(suppliers[2]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 140 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);

    // 3 tedarikçinin de perspektifini topla
    const views = await Promise.all(
      suppliers.map((s) => getTenderAsSupplier(s.token!, tender.id)),
    );
    const [aView, bView, cView] = views;
    const aRanking = aView!.data?.auctionView;
    const bRanking = bView!.data?.auctionView;
    const cRanking = cView!.data?.auctionView;

    // Anonimlik kontrolü: hangi modda olursa olsun, response gövdesinde
    // DİĞER tedarikçilerin firma adı/ID'si geçmemeli.
    // Test stratejisi: A perspektifinden cevap içinde B'nin veya C'nin
    // şirket adı arıyoruz.
    const aBody = JSON.stringify(aView!.data ?? {});
    assert(
      !aBody.includes("AuctionTest B.Ş.") && !aBody.includes("AuctionTest C.Ş."),
      `${mode} anonimlik: A görüntüsü diğer firma adlarını içermez`,
      `body içinde diğer şirket adı saptandı`,
    );
    // Diğer supplierId'leri de saptama
    const aBodyHasOtherId =
      aBody.includes(suppliers[1]!.id) || aBody.includes(suppliers[2]!.id);
    assert(
      !aBodyHasOtherId,
      `${mode} anonimlik: A görüntüsü diğer supplierId'leri içermez`,
    );

    if (mode === "OWN_ONLY") {
      assert(aRanking === null, "OWN_ONLY A: auctionView null");
      assert(bRanking === null, "OWN_ONLY B: auctionView null");
      assert(cRanking === null, "OWN_ONLY C: auctionView null");
    } else if (mode === "BEST_PRICE") {
      for (const [label, r] of [["A", aRanking], ["B", bRanking], ["C", cRanking]] as const) {
        assert(r?.bestTotal === 1500, `BEST_PRICE ${label}: bestTotal=1500`, `got: ${r?.bestTotal}`);
        assert(r?.myRank === null, `BEST_PRICE ${label}: myRank null`, `got: ${r?.myRank}`);
        assert(r?.allBids === null, `BEST_PRICE ${label}: allBids null`);
      }
    } else if (mode === "OWN_RANK") {
      assert(aRanking?.myRank === 1, "OWN_RANK A: myRank=1 (en düşük)", `got: ${aRanking?.myRank}`);
      assert(bRanking?.myRank === 2, "OWN_RANK B: myRank=2 (ortada)", `got: ${bRanking?.myRank}`);
      assert(cRanking?.myRank === 3, "OWN_RANK C: myRank=3 (en yüksek)", `got: ${cRanking?.myRank}`);
      for (const [label, r] of [["A", aRanking], ["B", bRanking], ["C", cRanking]] as const) {
        assert(r?.bestTotal === null, `OWN_RANK ${label}: bestTotal null (görünmez)`, `got: ${r?.bestTotal}`);
        assert(r?.participantCount === 3, `OWN_RANK ${label}: participantCount=3`, `got: ${r?.participantCount}`);
      }
    } else if (mode === "BEST_AND_OWN_RANK") {
      for (const [label, r] of [["A", aRanking], ["B", bRanking], ["C", cRanking]] as const) {
        assert(r?.bestTotal === 1500, `BEST_AND_OWN_RANK ${label}: bestTotal=1500`, `got: ${r?.bestTotal}`);
        assert(r?.allBids === null, `BEST_AND_OWN_RANK ${label}: allBids null`);
      }
      assert(aRanking?.myRank === 1, "BEST_AND_OWN_RANK A: myRank=1");
      assert(bRanking?.myRank === 2, "BEST_AND_OWN_RANK B: myRank=2");
      assert(cRanking?.myRank === 3, "BEST_AND_OWN_RANK C: myRank=3");
    } else if (mode === "ALL") {
      // Her supplier 3 bid görmeli ve sadece KENDİ bid'inde isMine=true olmalı
      for (const [label, r, expectedMyIdx] of [
        ["A", aRanking, 0],
        ["B", bRanking, 1],
        ["C", cRanking, 2],
      ] as const) {
        assert(Array.isArray(r?.allBids), `ALL ${label}: allBids array`);
        assert(r?.allBids?.length === 3, `ALL ${label}: 3 bid`, `got: ${r?.allBids?.length}`);
        // Rank sıralaması: 1500/1700/1900
        assert(r?.allBids?.[0]?.total === 1500, `ALL ${label}: rank1=1500`);
        assert(r?.allBids?.[1]?.total === 1700, `ALL ${label}: rank2=1700`);
        assert(r?.allBids?.[2]?.total === 1900, `ALL ${label}: rank3=1900`);
        // isMine flag: sadece KENDİ bid'inde true
        const mineCount = r?.allBids?.filter((b) => b.isMine).length ?? -1;
        assert(mineCount === 1, `ALL ${label}: sadece 1 satırda isMine=true`, `got: ${mineCount}`);
        assert(
          r?.allBids?.[expectedMyIdx]?.isMine === true,
          `ALL ${label}: kendi rank=${expectedMyIdx + 1} isMine=true`,
        );
        // Anonimlik: allBids içinde supplierName/supplierId yok
        const allBidsJson = JSON.stringify(r?.allBids ?? []);
        assert(
          !allBidsJson.includes("AuctionTest"),
          `ALL ${label}: allBids içinde firma adı yok (anonim)`,
        );
      }
    }
  }

  // ============================================================================
  // TEST 1.5: Bid değişikliği sonrası sıralama canlı güncelleniyor mu?
  // ============================================================================
  console.log("\n— Bonus: Bid güncellemesi sonrası ranking değişimi");
  {
    const tender = await createAuction({
      tenantUserId: tenantUser.id,
      tenantId: tenant.id,
      title: "Ranking refresh testi",
      bidVisibility: "ALL",
      bidsCloseInMin: 60,
      decrementType: "AMOUNT",
      decrementValue: 1,
      supplierIds: suppliers.map((s) => s.id),
    });
    // Başlangıç: A=1500, B=1700, C=1900 (A en düşük)
    await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 100 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    await submitBid(suppliers[1]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 120 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    await submitBid(suppliers[2]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 140 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);

    // C indirim yapıp en düşüğe geçsin: 1900 → 1000 (item1: 100, item2: 0 yerine 1)
    // Yeni total: 10*90 + 5*100 = 1400 (B=1700, C=1400 → C 1.)
    // Aslında 10*90+5*20 = 900+100=1000
    await submitBid(suppliers[2]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 90 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 20 },
    ]);

    // Yeni sıralama: C=1000 (1.), A=1500 (2.), B=1700 (3.)
    const aView2 = await getTenderAsSupplier(suppliers[0]!.token!, tender.id);
    const cView2 = await getTenderAsSupplier(suppliers[2]!.token!, tender.id);
    assert(
      aView2.data?.auctionView?.allBids?.[0]?.total === 1000,
      "Sıralama refresh: yeni rank1=1000 (C)",
      `got: ${aView2.data?.auctionView?.allBids?.[0]?.total}`,
    );
    assert(
      aView2.data?.auctionView?.allBids?.[1]?.total === 1500,
      "Sıralama refresh: yeni rank2=1500 (A)",
      `got: ${aView2.data?.auctionView?.allBids?.[1]?.total}`,
    );
    assert(
      cView2.data?.auctionView?.allBids?.[0]?.isMine === true,
      "Sıralama refresh: C şimdi en başta (isMine=true)",
    );
    assert(
      aView2.data?.auctionView?.allBids?.[1]?.isMine === true,
      "Sıralama refresh: A şimdi 2. (isMine=true)",
    );
  }

  // ============================================================================
  // TEST 2: Decrement kuralı (AMOUNT)
  // ============================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 2: Decrement Kuralı (AMOUNT)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  {
    const tender = await createAuction({
      tenantUserId: tenantUser.id,
      tenantId: tenant.id,
      title: "Decrement AMOUNT testi",
      bidVisibility: "ALL",
      decrementType: "AMOUNT",
      decrementValue: 50,
      bidsCloseInMin: 60,
      supplierIds: [suppliers[0]!.id],
    });
    // İlk teklif (decrement kontrol etmez — önceki yok)
    const first = await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 100 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    assert(first.status === 200 || first.status === 201, "İlk teklif kabul (1500)", `status=${first.status} body=${JSON.stringify(first.data).slice(0,200)}`);

    // Aynı fiyat — reddedilmeli
    const sameBid = await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 100 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    assert(sameBid.status === 400, "Aynı fiyat reddedildi", `status=${sameBid.status}`);

    // 30 TL düşük (yetersiz) — reddedilmeli
    const tooSmall = await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 97 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    assert(tooSmall.status === 400, "Yetersiz düşüş (30 TL) reddedildi", `status=${tooSmall.status}`);

    // 60 TL düşük (yeterli) — kabul edilmeli
    const ok = await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 94 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    assert(ok.status === 200 || ok.status === 201, "Yeterli düşüş (60 TL) kabul", `status=${ok.status} body=${JSON.stringify(ok.data).slice(0,200)}`);
  }

  // ============================================================================
  // TEST 3: Decrement kuralı (PERCENT)
  // ============================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 3: Decrement Kuralı (PERCENT)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  {
    const tender = await createAuction({
      tenantUserId: tenantUser.id,
      tenantId: tenant.id,
      title: "Decrement PERCENT testi",
      bidVisibility: "ALL",
      decrementType: "PERCENT",
      decrementValue: 5, // %5
      bidsCloseInMin: 60,
      supplierIds: [suppliers[0]!.id],
    });
    // İlk teklif: 1500
    await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 100 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    // %3 düşük (1455) — yetersiz
    const tooSmall = await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 95.5 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    assert(tooSmall.status === 400, "PERCENT: %3 düşüş reddedildi", `status=${tooSmall.status}`);

    // %10 düşük (1350) — yeterli
    const ok = await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 85 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    assert(ok.status === 200 || ok.status === 201, "PERCENT: %10 düşüş kabul", `status=${ok.status} body=${JSON.stringify(ok.data).slice(0,200)}`);
  }

  // ============================================================================
  // TEST 4: Auto-extend (son dakika teklif → kapanış uzar)
  // ============================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 4: Auto-Extend (son dakika)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  {
    // İhale 90 saniye sonra kapanır; threshold 2 dk; uzatma 5 dk
    const tender = await createAuction({
      tenantUserId: tenantUser.id,
      tenantId: tenant.id,
      title: "Auto-extend testi",
      bidVisibility: "ALL",
      autoExtendOnLateBid: true,
      autoExtendThresholdMin: 2,
      autoExtendByMinutes: 5,
      bidsCloseInMin: 1.5, // 90 saniye
      supplierIds: [suppliers[0]!.id],
    });

    const before = await prisma.tender.findUnique({
      where: { id: tender.id },
      select: { bidsCloseAt: true },
    });
    const originalCloseAt = before!.bidsCloseAt!;

    // Threshold (2dk) içindeyiz çünkü kalan 90sn → bid extend etmeli
    const r = await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 100 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    assert(r.status === 200 || r.status === 201, "Son dakika teklif kabul", `status=${r.status}`);

    const after = await prisma.tender.findUnique({
      where: { id: tender.id },
      select: { bidsCloseAt: true },
    });
    const newCloseAt = after!.bidsCloseAt!;
    const diffMs = newCloseAt.getTime() - originalCloseAt.getTime();
    const diffMin = diffMs / 60_000;
    assert(
      diffMin >= 4.9 && diffMin <= 5.1,
      `Auto-extend: kapanış ~5dk uzadı (gerçek: ${diffMin.toFixed(2)}dk)`,
      `before=${originalCloseAt.toISOString()} after=${newCloseAt.toISOString()}`,
    );
  }

  // ============================================================================
  // TEST 5: Auto-extend kapalıyken uzatma OLMAMALI
  // ============================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 5: Auto-Extend OFF → uzatma yok");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  {
    const tender = await createAuction({
      tenantUserId: tenantUser.id,
      tenantId: tenant.id,
      title: "Auto-extend OFF testi",
      bidVisibility: "ALL",
      autoExtendOnLateBid: false,
      bidsCloseInMin: 1.5,
      supplierIds: [suppliers[0]!.id],
    });
    const before = (await prisma.tender.findUnique({ where: { id: tender.id }, select: { bidsCloseAt: true } }))!.bidsCloseAt!;
    await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 100 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    const after = (await prisma.tender.findUnique({ where: { id: tender.id }, select: { bidsCloseAt: true } }))!.bidsCloseAt!;
    assert(
      after.getTime() === before.getTime(),
      "Auto-extend OFF: kapanış sabit kaldı",
      `diff=${(after.getTime() - before.getTime()) / 1000}sn`,
    );
  }

  // ============================================================================
  // TEST 6: Closing reminder ayarı persistence
  // ============================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 6: Closing Reminder Ayarı");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  {
    const tender = await createAuction({
      tenantUserId: tenantUser.id,
      tenantId: tenant.id,
      title: "Closing reminder testi",
      bidVisibility: "ALL",
      sendClosingReminder: true,
      reminderMinutesBefore: 30,
      bidsCloseInMin: 60,
      supplierIds: [suppliers[0]!.id],
    });
    const row = await prisma.tender.findUnique({
      where: { id: tender.id },
      select: { sendClosingReminder: true, reminderMinutesBefore: true, closingReminderSentAt: true },
    });
    assert(row?.sendClosingReminder === true, "sendClosingReminder=true persist", `got: ${row?.sendClosingReminder}`);
    assert(row?.reminderMinutesBefore === 30, "reminderMinutesBefore=30 persist", `got: ${row?.reminderMinutesBefore}`);
    assert(row?.closingReminderSentAt === null, "closingReminderSentAt başlangıçta null", `got: ${row?.closingReminderSentAt}`);
  }

  // ============================================================================
  // TEST 7: Decimal places ayarı
  // ============================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 7: Decimal Places");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  {
    const tender = await createAuction({
      tenantUserId: tenantUser.id,
      tenantId: tenant.id,
      title: "Decimal places testi",
      bidVisibility: "ALL",
      decimalPlaces: 4,
      bidsCloseInMin: 60,
      supplierIds: [suppliers[0]!.id],
    });
    const row = await prisma.tender.findUnique({
      where: { id: tender.id },
      select: { decimalPlaces: true },
    });
    assert(row?.decimalPlaces === 4, "decimalPlaces=4 persist", `got: ${row?.decimalPlaces}`);

    // Tedarikçi 4 hane ile teklif verir
    const r = await submitBid(suppliers[0]!.token!, tender.id, [
      { tenderItemId: tender.items[0]!.id, unitPrice: 99.1234 },
      { tenderItemId: tender.items[1]!.id, unitPrice: 100 },
    ]);
    assert(r.status === 200 || r.status === 201, "4 ondalık fiyat kabul", `status=${r.status}`);
  }

  // ============================================================================
  // TEST 8: Round zinciri (previousTenderId)
  // ============================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("TEST 8: Round Zinciri");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  {
    const round1 = await createAuction({
      tenantUserId: tenantUser.id,
      tenantId: tenant.id,
      title: "Round 1",
      bidVisibility: "ALL",
      bidsCloseInMin: 60,
      supplierIds: [suppliers[0]!.id, suppliers[1]!.id],
    });
    // Round 1'i kapatıp Round 2 oluşturalım — bunun için Round 1 IN_AWARD veya CLOSED olmalı
    await prisma.tender.update({
      where: { id: round1.id },
      data: { status: "IN_AWARD" },
    });

    // Token al + BUYER olarak login (COMPANY_ADMIN tender:edit yapamaz)
    const loginR = await http("POST", "/auth/login", undefined, {
      email: "buyer@demo.com",
      password: "Buyer1234",
    });
    const tenantToken = loginR.data?.token;
    if (!tenantToken) throw new Error(`Tenant login failed: ${JSON.stringify(loginR.data)}`);

    // Yeni tur oluştur — CreateNextRoundDto'nun tüm zorunlu alanları
    const newRoundR = await http("POST", `/tenants/me/tenders/${round1.id}/next-round`, tenantToken, {
      type: "ENGLISH_AUCTION",
      carryBids: "NONE",
      eliminateNonBidders: false,
      openImmediately: true,
      bidsCloseAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    });
    assert(
      newRoundR.status === 200 || newRoundR.status === 201,
      "Yeni tur oluşturma 200/201",
      `status=${newRoundR.status} body=${JSON.stringify(newRoundR.data).slice(0,200)}`,
    );

    const newId = newRoundR.data?.id;
    if (newId) {
      const round2 = await prisma.tender.findUnique({
        where: { id: newId },
        select: { previousTenderId: true, roundNumber: true, status: true },
      });
      assert(round2?.previousTenderId === round1.id, "Round 2 previousTenderId = Round 1.id", `got: ${round2?.previousTenderId}`);
      assert(round2?.roundNumber === 2, "Round 2 roundNumber=2", `got: ${round2?.roundNumber}`);
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================
  console.log("\n🧹 Cleanup: test ihaleleri siliniyor...");
  await cleanup();

  // ============================================================================
  // RESULT
  // ============================================================================
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📊 SONUÇ: ${testsPassed}/${testsRun} test geçti`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  if (failures.length > 0) {
    console.log("\n❌ Hatalı testler:");
    for (const f of failures) console.log(`  • ${f}`);
    process.exit(1);
  } else {
    console.log("\n🎉 Tüm testler başarılı!");
  }
}

main()
  .catch((e) => {
    console.error("💥", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
