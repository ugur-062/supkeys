/**
 * Faz AI-2 — CANLI asistan duman testi (GERÇEK Gemini function-calling).
 * VARSAYILAN SKIP: yalnız `AI_LIVE_SMOKE=1` + `GEMINI_API_KEY` ile koşar.
 *   AI_LIVE_SMOKE=1 NODE_OPTIONS=--experimental-vm-modules npx jest ai-assistant-live
 *
 * Gerçek model gerçek araçları çağırır (list_my_tenders) → gerçek listings
 * servisi çalışır → asistan doğru yanıt üretir. Kapalı-zarf/kapsam bedava.
 */
import "reflect-metadata";
import { CompanyRole } from "@rothern/db";
import { AiBudgetService } from "../../src/modules/ai/ai-budget.service";
import { AiService } from "../../src/modules/ai/ai.service";
import { loadAiConfig } from "../../src/modules/ai/ai.config";
import { GeminiProvider } from "../../src/modules/ai/providers/gemini.provider";
import { TenderExtractService } from "../../src/modules/ai/tender-extract/tender-extract.service";
import { AssistantService } from "../../src/modules/ai/assistant/assistant.service";
import { prisma, truncateAll } from "./test-db";
import { makeService } from "./make-service";
import { makeCompanyWithUser, makeListing } from "./factories";

const LIVE = process.env.AI_LIVE_SMOKE === "1" && !!process.env.GEMINI_API_KEY;
const d = LIVE ? describe : describe.skip;

class FakeOrders {
  async list() { return []; }
  async getOne() { throw new Error("yok"); }
}
class FakeConnections {
  async list() { return []; }
}

d("Faz AI-2 — canlı asistan duman testi", () => {
  jest.setTimeout(120_000);
  afterAll(async () => {
    await truncateAll();
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it("gerçek model 'ihalelerim' sorusuna araç çağırıp yanıt üretir", async () => {
    const cfg = loadAiConfig({ get: (k: string) => process.env[k] });
    const provider = cfg.vertex
      ? new GeminiProvider({ vertex: cfg.vertex })
      : new GeminiProvider({ apiKey: cfg.apiKey! });
    const budget = new AiBudgetService(prisma as never, cfg);
    const ai = new AiService(cfg, provider, budget, prisma as never, undefined);
    const listings = makeService().service;
    const tenderExtract = new TenderExtractService(ai, {} as never, cfg);
    const svc = new AssistantService(
      cfg, provider, ai, budget, prisma as never,
      listings, new FakeOrders() as never, new FakeConnections() as never,
      tenderExtract,
    );

    const co = await makeCompanyWithUser(prisma, { tier: "GOLD", roles: [CompanyRole.SATIN_ALMACI] });
    await makeListing(prisma, {
      companyId: co.company.id, createdById: co.user.id,
      type: "ALIM", status: "OPEN", title: "Ofis mobilyası alımı",
    });
    const auth = {
      userId: co.user.id, companyId: co.company.id, email: co.user.email,
      roles: [CompanyRole.SATIN_ALMACI], isOwner: false, country: "TR",
      tier: "GOLD", companyVerificationStatus: "VERIFIED",
    } as never;

    const reply = await svc.message(auth, {
      message: "Açtığım alım ihalelerini listele.",
    });

    expect(reply.reply.length).toBeGreaterThan(0);
    const row = await prisma.aiUsage.findFirstOrThrow({
      where: { feature: "assistant", status: "SETTLED" },
    });
    expect(row.costUsd.toNumber()).toBeGreaterThan(0);

    // eslint-disable-next-line no-console
    console.log("CANLI ASİSTAN:", JSON.stringify({
      reply: reply.reply, toolsUsed: reply.toolsUsed, costUsd: row.costUsd.toString(),
    }, null, 2));
  });
});
