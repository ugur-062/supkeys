/**
 * Faz AI-1 — CANLI duman testi (GERÇEK Gemini çağrısı, para harcar: ~$0.001).
 *
 * VARSAYILAN SKIP: yalnız `AI_LIVE_SMOKE=1` + `GEMINI_API_KEY` set iken koşar:
 *   AI_LIVE_SMOKE=1 NODE_OPTIONS=--experimental-vm-modules npx jest ai-live-smoke
 *
 * Tüm yığından geçer: erişim kapısı → bütçe rezervasyonu (FOR UPDATE) →
 * girdi yönlendirici (gerçek PDF parse) → Gemini structured output → sanitize
 * → settle (gerçek usage ile costUsd). Ağ/model değişkenliği nedeniyle
 * assert'ler gevşek tutulur (alan-değeri değil yapı doğrulanır).
 */
import "reflect-metadata";
import { AiBudgetService } from "../../src/modules/ai/ai-budget.service";
import { AiService } from "../../src/modules/ai/ai.service";
import { loadAiConfig } from "../../src/modules/ai/ai.config";
import { GeminiProvider } from "../../src/modules/ai/providers/gemini.provider";
import { TenderExtractService } from "../../src/modules/ai/tender-extract/tender-extract.service";
import type { StorageService } from "../../src/modules/storage/storage.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";
import { makeSimplePdf } from "./pdf-fixture";

const LIVE = process.env.AI_LIVE_SMOKE === "1" && !!process.env.GEMINI_API_KEY;
const d = LIVE ? describe : describe.skip;

class FakeStorage {
  files = new Map<string, Buffer>();
  async getObject(_bucket: string, key: string): Promise<Buffer> {
    const f = this.files.get(key);
    if (!f) throw new Error("NoSuchKey");
    return f;
  }
}

const SPEC_TEXT =
  "SATIN ALMA SARTNAMESI. Konu: Celik boru tedariki. " +
  "Kalem 1: DN50 dikissiz celik boru, 500 adet, hedef birim fiyat 120 TL. " +
  "Kalem 2: DN80 dikissiz celik boru, 200 adet. " +
  "Teslimat: alici deposuna teslim (yurtici). Odeme: 60 gun vadeli. " +
  "Para birimi: TL. Fiyatlara KDV dahil degildir. ";

d("Faz AI-1 — canlı Gemini duman testi", () => {
  jest.setTimeout(120_000);

  afterAll(async () => {
    await truncateAll();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it("metinli PDF → gerçek extract: taslak dolu, usage SETTLED, gerçek maliyet > 0", async () => {
    const cfg = loadAiConfig({ get: (k: string) => process.env[k] });
    const provider = cfg.vertex ? new GeminiProvider({ vertex: cfg.vertex }) : new GeminiProvider({ apiKey: cfg.apiKey! });
    const budget = new AiBudgetService(prisma as never, cfg);
    const ai = new AiService(cfg, provider, budget, prisma as never, undefined);
    const storage = new FakeStorage();
    const svc = new TenderExtractService(
      ai,
      storage as unknown as StorageService,
      cfg,
    );

    const co = await makeCompanyWithUser(prisma, { tier: "GOLD" });
    const key = `ai-extract/${co.company.id}/live-sartname.pdf`;
    storage.files.set(key, makeSimplePdf([SPEC_TEXT]));

    const result = await svc.extract(co.auth, {
      fileKeys: [key],
      listingType: "ALIM",
    });

    // Yapısal assert'ler (model çıktısı değişken — değer değil şekil):
    expect(result.route).toBe("text");
    expect(result.draft.title).toBeTruthy();
    expect(result.draft.items.length).toBeGreaterThanOrEqual(1);
    expect(result.draft.items[0]!.name).toBeTruthy();

    const row = await prisma.aiUsage.findFirstOrThrow({
      where: { feature: "tender_extract" },
    });
    expect(row.status).toBe("SETTLED");
    expect(row.costUsd.toNumber()).toBeGreaterThan(0);
    expect(row.inputTokens).toBeGreaterThan(0);
    expect(row.metadata).toMatchObject({ route: "text" });

    // Görülebilirlik: manuel inceleme için özet (yalnız canlı koşuda).
    // eslint-disable-next-line no-console
    console.log("CANLI SONUÇ:", JSON.stringify({
      title: result.draft.title,
      items: result.draft.items.map((i) => ({
        name: i.name, quantity: i.quantity, unit: i.unit,
      })),
      deliveryTerm: result.draft.deliveryTerm,
      paymentCategory: result.draft.paymentCategory,
      paymentDays: result.draft.paymentDays,
      currency: result.draft.primaryCurrency,
      missing: result.missingRequired,
      costUsd: row.costUsd.toString(),
    }, null, 2));
  });
});
