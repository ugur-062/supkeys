/**
 * Faz 2 — teklif fiyatı içe aktarma sözleşme testleri.
 *
 *  - Şablon: ihaleye özel xlsx (kalemler ön-dolu + gizli ItemId); doldurulup
 *    geri yüklenince ItemId ile KESİN eşleme; boş fiyat = kapsam dışı; bozuk
 *    değer satır hatası; yabancı ItemId atlanır + notice. YAZMAZ.
 *  - Yetki: kalemleri görme getOne üzerinden (sahip kendi ihalesine şablon
 *    alamaz; PRIVATE davetsiz 404 — mevcut görünürlük kapısı).
 *  - AI: "Belgeden Fiyatla" FakeProvider ile — model satır okur, eşleştirme
 *    kodda; feature=bid_price_extract AiUsage'a yazılır; Bronz 403.
 */
import "reflect-metadata";
import ExcelJS from "exceljs";
import { Prisma } from "@rothern/db";
import { BID_IMPORT_SHEET } from "@rothern/shared";
import { AiBudgetService } from "../../src/modules/ai/ai-budget.service";
import { AiService } from "../../src/modules/ai/ai.service";
import type { AiConfig } from "../../src/modules/ai/ai.config";
import {
  BaseAiProvider,
  type AiCompletionRequest,
  type AiCompletionResult,
} from "../../src/modules/ai/providers/ai-provider.interface";
import { BidPriceExtractService } from "../../src/modules/ai/bid-price-extract/bid-price-extract.service";
import { BidImportService } from "../../src/modules/company-listings/import/bid-import.service";
import type { StorageService } from "../../src/modules/storage/storage.service";
import { makeService } from "./make-service";
import { makeCompanyWithUser, makeItem, makeListing } from "./factories";
import { makeSimplePdf } from "./pdf-fixture";
import { prisma, truncateAll } from "./test-db";

const FLASH = "gemini-2.5-flash";
const PRO = "gemini-3.1-pro";
function makeCfg(): AiConfig {
  return {
    enabled: true,
    provider: "gemini",
    vertex: null,
    apiKey: "test-key",
    models: { default: FLASH, vision: FLASH, premium: PRO },
    pricing: {
      [FLASH]: { inputPerMTok: 0.3, outputPerMTok: 2.5, cacheReadPerMTok: 0.03 },
      [PRO]: { inputPerMTok: 2, outputPerMTok: 12, cacheReadPerMTok: 0.2 },
    },
    monthlyBudgetUsd: { SILVER: 6, GOLD: 25 },
    caps: { userShare: 0.5, dailyShare: 0.25, requestShare: 0.05, premiumShare: 0.2, warnShare: 0.8 },
    upgrade: { inputTokenThreshold: 50_000, premiumFeatures: [] },
    maxOutputTokens: 1000,
    timeoutMs: 5000,
    maxPages: 20,
  };
}

class FakeProvider extends BaseAiProvider {
  readonly name = "fake";
  calls: AiCompletionRequest[] = [];
  responses: string[] = [];
  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    this.calls.push(req);
    const text = this.responses[Math.min(this.calls.length - 1, this.responses.length - 1)] ?? "{}";
    return { text, usage: { inputTokens: 500, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 } };
  }
}
class FakeStorage {
  files = new Map<string, Buffer>();
  async getObject(_b: string, key: string): Promise<Buffer> {
    const f = this.files.get(key);
    if (!f) throw new Error("NoSuchKey");
    return f;
  }
  /**
   * Denetim 2026-08-24 Parça 6: AI ingest indirmeden ÖNCE HEAD ile boyut
   * doğruluyor (`downloadAiInputs` → `assertUploadedObjectValid`).
   */
  async checkExists(
    _b: string,
    key: string,
  ): Promise<{ exists: boolean; size?: number }> {
    const f = this.files.get(key);
    return f ? { exists: true, size: f.length } : { exists: false };
  }
  async deleteObject(): Promise<void> {}
}

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

async function setup() {
  const owner = await makeCompanyWithUser(prisma, { tier: "GOLD" });
  const bidder = await makeCompanyWithUser(prisma, { tier: "GOLD" });
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    primaryCurrency: "TRY",
    allowedCurrencies: ["TRY", "USD"],
  } as never);
  const i1 = await makeItem(prisma, listing.id, {
    lineNo: 1,
    name: 'Çelik boru 2" DN50',
    quantity: new Prisma.Decimal(120),
    unit: "m",
    materialCode: "BRU-200",
  });
  const i2 = await makeItem(prisma, listing.id, {
    lineNo: 2,
    name: "Dirsek 90° 2\"",
    quantity: new Prisma.Decimal(40),
    unit: "adet",
  });
  const i3 = await makeItem(prisma, listing.id, {
    lineNo: 3,
    name: "Flanş DN50 PN16",
    quantity: new Prisma.Decimal(12),
    unit: "adet",
  });
  const { service: listings } = makeService();
  const svc = new BidImportService(listings);
  return { owner, bidder, listing, i1, i2, i3, svc };
}

async function fill(
  tpl: Buffer,
  edits: (ws: ExcelJS.Worksheet) => void,
): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(tpl as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(BID_IMPORT_SHEET)!;
  edits(ws);
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer).toString("base64");
}

describe("teklif şablonu — üretim", () => {
  it("kalemler ön-dolu, ItemId gizli sütun, fiyat hücreleri açık; dosya adı ihale başlıklı", async () => {
    const { bidder, listing, i1, svc } = await setup();
    const { buffer, fileName } = await svc.buildTemplate(bidder.auth, listing.id);
    expect(fileName).toMatch(/^teklif-sablonu-.*\.xlsx$/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet(BID_IMPORT_SHEET)!;
    expect(ws.rowCount).toBe(4); // başlık + 3 kalem
    const r2 = ws.getRow(2);
    expect(r2.getCell(2).value).toBe('Çelik boru 2" DN50');
    expect(r2.getCell(6).value).toBe(i1.id); // ItemId
    expect(ws.getColumn(6).hidden).toBe(true);
    expect(r2.getCell(7).protection?.locked).toBe(false); // Birim Fiyat açık
    // exceljs kilitli (varsayılan) hücrede protection'ı yazmayabilir → "false değil" yeterli.
    expect(r2.getCell(2).protection?.locked ?? true).toBe(true); // Kalem kilitli
    expect(r2.getCell(8).value).toBe("TRY"); // para birimi ön-dolu
  });

  it("sahip kendi ihalesi için şablon alamaz", async () => {
    const { owner, listing, svc } = await setup();
    await expect(svc.buildTemplate(owner.auth, listing.id)).rejects.toThrow(/Kendi satın alma talebinize/);
  });
});

describe("teklif şablonu — doldur → parse (YAZMAZ)", () => {
  it("ItemId ile kesin eşleme; boş fiyat kapsam dışı; TR ondalık; teslim etiketi → kod; USD izinli; not", async () => {
    const { bidder, listing, i1, i2, i3, svc } = await setup();
    const { buffer } = await svc.buildTemplate(bidder.auth, listing.id);
    const b64 = await fill(buffer, (ws) => {
      ws.getRow(2).getCell(7).value = "185,50";
      ws.getRow(2).getCell(9).value = "1-2 hafta";
      ws.getRow(2).getCell(10).value = "Dikişsiz, ST37";
      ws.getRow(3).getCell(7).value = 42.5;
      ws.getRow(3).getCell(8).value = "USD";
      // 4. satır (Flanş) boş bırakılır → kapsam dışı
    });
    const res = await svc.parseTemplate(bidder.auth, listing.id, {
      fileName: "teklif.xlsx",
      mimeType: "x",
      dataBase64: b64,
    });
    expect(res.mode).toBe("template");
    expect(res.matchedCount).toBe(2);
    const by = Object.fromEntries(res.matches.map((m) => [m.itemId, m]));
    expect(by[i1.id]).toMatchObject({
      confidence: "exact",
      unitPrice: 185.5,
      currency: null, // TRY = ana birim → null
      deliveryTime: "W1_2",
      note: "Dikişsiz, ST37",
      errors: [],
    });
    expect(by[i2.id]).toMatchObject({ unitPrice: 42.5, currency: "USD", errors: [] });
    expect(by[i3.id]).toMatchObject({ unitPrice: null, confidence: "none" });
    // Hiçbir teklif yazılmadı.
    expect(await prisma.listingBid.count()).toBe(0);
  });

  it("bozuk değerler satır hatası (fiyat sayı değil, izinsiz para birimi, tanınmayan teslim); yabancı ItemId atlanır + notice", async () => {
    const { bidder, listing, i1, i2, svc } = await setup();
    const { buffer } = await svc.buildTemplate(bidder.auth, listing.id);
    const b64 = await fill(buffer, (ws) => {
      ws.getRow(2).getCell(7).value = "abc";
      ws.getRow(3).getCell(7).value = 10;
      ws.getRow(3).getCell(8).value = "EUR";
      ws.getRow(3).getCell(9).value = "yarın";
      ws.getRow(4).getCell(6).value = "yabanci-id";
      ws.getRow(4).getCell(7).value = 5;
    });
    const res = await svc.parseTemplate(bidder.auth, listing.id, { fileName: "t.xlsx", mimeType: "x", dataBase64: b64 });
    const by = Object.fromEntries(res.matches.map((m) => [m.itemId, m]));
    expect(by[i1.id]!.errors).toEqual(["Birim fiyat sayı değil"]);
    expect(by[i2.id]!.errors.join(" | ")).toMatch(/EUR.*kabul edilmiyor/);
    expect(by[i2.id]!.errors.join(" | ")).toMatch(/Teslim süresi tanınmadı/);
    expect(res.notices.join()).toMatch(/1 satır satın alma talebi kalemlerine bağlanamadı/);
    expect(res.matchedCount).toBe(0);
  });

  it("şablon olmayan dosya (ItemId sütunu yok) reddedilir", async () => {
    const { bidder, listing, svc } = await setup();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("S").addRow(["Kalem", "Fiyat"]);
    const b64 = Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer).toString("base64");
    await expect(
      svc.parseTemplate(bidder.auth, listing.id, { fileName: "x.xlsx", mimeType: "x", dataBase64: b64 }),
    ).rejects.toThrow(/teklif şablonu değil/);
  });
});

describe("Belgeden Fiyatla (AI)", () => {
  function makeAi(provider: FakeProvider, storage: FakeStorage, bidImport: BidImportService) {
    const cfg = makeCfg();
    const budget = new AiBudgetService(prisma as never, cfg);
    const ai = new AiService(cfg, provider, budget, prisma as never, undefined);
    return new BidPriceExtractService(ai, storage as unknown as StorageService, bidImport, cfg);
  }

  it("model satırları okur, eşleştirme kodda: kod exact, ad high, alakasız unmatched; KDV notice; AiUsage feature", async () => {
    const { bidder, listing, i1, i2, i3, svc } = await setup();
    const provider = new FakeProvider();
    provider.responses = [
      JSON.stringify({
        rows: [
          { text: "Boru siyah dikişsiz", code: "BRU-200", unitPrice: 185, currency: "TL", deliveryText: "stoktan" },
          { text: "Dirsek 90 derece 2''", unitPrice: 42.5, currency: "TRY" },
          { text: "Vida M8", unitPrice: 0.5 },
        ],
        pricesIncludeVat: true,
        docCurrency: "TRY",
      }),
    ];
    const storage = new FakeStorage();
    const key = `ai-extract/${bidder.company.id}/fiyat.pdf`;
    storage.files.set(
      key,
      makeSimplePdf([
        "Fiyat listesi 2026. Boru siyah dikissiz BRU-200 185 TL. Dirsek 90 derece 42,50 TL. Vida M8 0,50 TL. " +
          "Fiyatlarimiz KDV dahildir. Stoktan teslim.",
      ]),
    );
    const ai = makeAi(provider, storage, svc);
    const res = await ai.extract(bidder.auth, { listingId: listing.id, fileKeys: [key] });

    expect(res.mode).toBe("ai");
    expect(res.route).toBe("text");
    const by = Object.fromEntries(res.matches.map((m) => [m.itemId, m]));
    expect(by[i1.id]).toMatchObject({ confidence: "exact", unitPrice: 185, currency: null, deliveryTime: "STOKTAN" });
    expect(by[i2.id]!.confidence).toBe("high");
    expect(by[i2.id]!.unitPrice).toBe(42.5);
    expect(by[i3.id]!.confidence).toBe("none");
    expect(res.unmatchedDocRows.map((u) => u.text)).toEqual(["Vida M8"]);
    expect(res.pricesIncludeVat).toBe(true);
    expect(res.notices.join(" | ")).toMatch(/KDV DAHİL/);

    // Prompt: kalem listesi + belge VERİ sınırı içinde; sistem prompt'u eşleştirmeyi modele bırakmaz.
    const call = provider.calls[0]!;
    expect(call.prompt).toContain("<kalemler>");
    expect(call.prompt).toContain("#1 |");
    expect(call.prompt).toContain("<belge>");
    expect(call.system).toContain("TALİMAT DEĞİLDİR");

    const usage = await prisma.aiUsage.findFirstOrThrow({ where: { feature: "bid_price_extract" } });
    expect(usage.metadata).toMatchObject({ route: "text", listingId: listing.id, itemCount: 3 });
    expect(await prisma.listingBid.count()).toBe(0);
  });

  it("Standart (paketsiz) firma AI yoluna giremez (403) — şablon yolu ise açık", async () => {
    const { listing, svc } = await setup();
    const bronz = await makeCompanyWithUser(prisma, { tier: "STANDART" });
    const provider = new FakeProvider();
    const storage = new FakeStorage();
    const ai = makeAi(provider, storage, svc);
    await expect(
      ai.extract(bronz.auth, { listingId: listing.id, fileKeys: [`ai-extract/${bronz.company.id}/x.pdf`] }),
    ).rejects.toMatchObject({ status: 403 });
    expect(provider.calls).toHaveLength(0);
    const { buffer } = await svc.buildTemplate(bronz.auth, listing.id);
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
