import { CronRegistryService } from "../../src/common/cron/cron-registry.service";
import { appDayKey } from "../../src/common/time/app-calendar";
import { ContentTranslationController } from "../../src/modules/content-translation/content-translation.controller";
import { ContentTranslationScheduler } from "../../src/modules/content-translation/content-translation.scheduler";
import { dailySeries } from "../../src/modules/company-views/company-views.service";

/** Derin denetim LU-17 (DÜŞÜK) — çeviri süpürücüsü kaydı, backfill audit'i, İstanbul günü. */

describe("ContentTranslationScheduler — cron kaydı", () => {
  it("contentTranslation.sweep kayıtlıdır; hatalı koşum Sistem Sağlığı'na yansır", async () => {
    const registry = new CronRegistryService();
    const translations = {
      enabled: false,
      rebuildAllSearchTexts: jest.fn().mockResolvedValue({ entities: 0 }),
      processPending: jest.fn().mockRejectedValue(new Error("db down")),
    };
    const s = new ContentTranslationScheduler(translations as never, registry);
    s.onModuleInit();
    await expect(s.sweep()).rejects.toThrow("db down");
    const row = registry.snapshot().find((r) => r.key === "contentTranslation.sweep");
    expect(row).toBeDefined();
    expect(row?.lastRunAt).toBeInstanceOf(Date);
    expect(String(row?.lastError)).toContain("db down");
  });
});

describe("ContentTranslationController — ücretli toplu işler audit'e yazılır", () => {
  const admin = { id: "adm-1" } as never;
  function rig() {
    const translations = {
      enabled: true,
      enqueueAllPublic: jest.fn().mockResolvedValue({ products: 3, listings: 1, companies: 2 }),
      sweepAll: jest.fn(),
      rebuildAllSearchTexts: jest.fn().mockResolvedValue({ entities: 7 }),
    };
    const categories = {
      start: jest.fn().mockReturnValue({ started: true }),
      startAttributes: jest.fn().mockReturnValue({ started: false, reason: "running" }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const c = new ContentTranslationController(translations as never, categories as never, audit as never);
    return { c, audit };
  }

  it("dört POST ucu kim/ne zaman izini bırakır", async () => {
    const { c, audit } = rig();
    await c.backfill(admin);
    await c.rebuildSearchText(admin);
    await c.categoryBackfill(admin);
    await c.attributeBackfill(admin);
    const calls = audit.log.mock.calls.map((a) => a[0] as { action: string; actorId: string; metadata: unknown });
    expect(calls.map((x) => x.action)).toEqual([
      "admin.system.translation_backfill",
      "admin.system.search_text_rebuilt",
      "admin.system.category_translation_backfill",
      "admin.system.attribute_translation_backfill",
    ]);
    expect(calls.every((x) => x.actorId === "adm-1")).toBe(true);
    expect(calls[0]!.metadata).toMatchObject({ enqueued: { products: 3, listings: 1, companies: 2 } });
    expect(calls[1]!.metadata).toEqual({ entities: 7 });
  });
});

describe("İstanbul takvim günü (company-views)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("appDayKey UTC değil İstanbul gününü verir", () => {
    // TR 01:30 (30 Eylül) = UTC 22:30 (29 Eylül).
    expect(appDayKey(new Date("2026-09-29T22:30:00Z"))).toBe("2026-09-30");
    expect(appDayKey(new Date("2026-09-30T20:59:59Z"))).toBe("2026-09-30");
    expect(appDayKey(new Date("2026-09-30T21:00:00Z"))).toBe("2026-10-01");
  });

  it("dailySeries TR 00:00-03:00 görüntülemesini o günün çubuğuna yazar", () => {
    jest.spyOn(Date, "now").mockReturnValue(new Date("2026-09-30T09:00:00Z").getTime());
    const s = dailySeries([new Date("2026-09-29T22:30:00Z"), new Date("2026-09-30T08:00:00Z")], 2);
    expect(s).toEqual([
      { date: "2026-09-29", views: 0 },
      { date: "2026-09-30", views: 2 },
    ]);
  });
});
