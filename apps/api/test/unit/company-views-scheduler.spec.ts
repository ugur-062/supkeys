import { CronRegistryService } from "../../src/common/cron/cron-registry.service";
import { CompanyViewsScheduler } from "../../src/modules/company-views/company-views.scheduler";

/**
 * Yayın denetimi 2026-09-28 B0-4: görüntülenme temizliği ve yanıt süresi
 * hesabı ortak sarmalayıcıdan (`trackCronRun`) geçmiyordu → kilitsiz, cron
 * kaydında/uyarılarda görünmez.
 */
describe("CompanyViewsScheduler — cron kaydı", () => {
  it("iki iş kayıtlıdır; başarılı ve hatalı koşum kayda yansır", async () => {
    const registry = new CronRegistryService();
    const views = {
      purgeExpired: jest.fn().mockResolvedValue(3),
      recomputeReplyTimes: jest.fn().mockRejectedValue(new Error("db down")),
    };
    const s = new CompanyViewsScheduler(views as never, registry);
    s.onModuleInit();

    await s.purge();
    await expect(s.replyTimes()).rejects.toThrow("db down");

    const byKey = Object.fromEntries(registry.snapshot().map((r) => [r.key, r]));
    expect(byKey["views.purge"]?.lastRunAt).toBeInstanceOf(Date);
    expect(byKey["views.purge"]?.lastError ?? null).toBeNull();
    expect(String(byKey["views.replyTimes"]?.lastError)).toContain("db down");
  });
});
