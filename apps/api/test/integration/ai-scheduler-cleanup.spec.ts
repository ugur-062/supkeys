/**
 * AiScheduler temizlik işleri (canlı öncesi sağlamlaştırma H5). İkisi de SİLME
 * işi: önek ya da kesim tarihi hatası yanlış dosyayı / yanlış sohbeti siler.
 *
 *  - cleanupExtractFiles: private kovada YALNIZ `ai-extract/` altındaki ve
 *    24 saatten ESKİ nesneler silinir (depolama taklidi).
 *  - cleanupChatSessions: 90 gün dokunulmamış sohbet (lastMessageAt) mesajlarıyla
 *    silinir; 89 günlük kalır (gerçek test DB'si — cascade dahil).
 */
import { AiScheduler } from "../../src/modules/ai/ai.scheduler";
import { AI_EXTRACT_KEY_PREFIX } from "../../src/modules/ai/tender-extract/ai-extract-keys";
import { CronRegistryService } from "../../src/common/cron/cron-registry.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser } from "./factories";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-07T12:00:00.000Z");

interface Obj {
  key: string;
  lastModified?: Date;
}

function storageMock(objects: Obj[], failKeys: string[] = []) {
  return {
    listObjects: jest.fn(async (_bucket: string, _prefix: string) => objects),
    deleteObject: jest.fn(async (_bucket: string, key: string) => {
      if (failKeys.includes(key)) throw new Error("R2 down");
    }),
  };
}

const ago = (ms: number) => new Date(NOW.getTime() - ms);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("AiScheduler.cleanupExtractFiles — 24 saat TTL, yalnız ai-extract/", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    jest.setSystemTime(NOW);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("önek tam olarak 'ai-extract/' ve kova 'private'", async () => {
    expect(AI_EXTRACT_KEY_PREFIX).toBe("ai-extract/");
    const storage = storageMock([]);
    await new AiScheduler(prisma as never, undefined, storage as never).cleanupExtractFiles();
    expect(storage.listObjects).toHaveBeenCalledTimes(1);
    expect(storage.listObjects).toHaveBeenCalledWith("private", "ai-extract/");
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("23 saatlik nesne KALIR, 25 saatlik silinir (sınırın iki yanı)", async () => {
    const storage = storageMock([
      { key: "ai-extract/c1/yeni.pdf", lastModified: ago(23 * HOUR) },
      { key: "ai-extract/c1/eski.pdf", lastModified: ago(25 * HOUR) },
      { key: "ai-extract/c2/cok-eski.xlsx", lastModified: ago(40 * DAY) },
      { key: "ai-extract/c2/az-once.png", lastModified: ago(60 * 1000) },
    ]);
    await new AiScheduler(prisma as never, undefined, storage as never).cleanupExtractFiles();

    const deleted = storage.deleteObject.mock.calls.map((c) => c[1]).sort();
    expect(deleted).toEqual([
      "ai-extract/c1/eski.pdf",
      "ai-extract/c2/cok-eski.xlsx",
    ]);
    for (const call of storage.deleteObject.mock.calls) {
      expect(call[0]).toBe("private");
    }
  });

  it("tam 24 saatlik nesne silinmez (kesin 'daha eski'), 24 saat + 1 ms silinir", async () => {
    const storage = storageMock([
      { key: "ai-extract/c1/tam.pdf", lastModified: ago(24 * HOUR) },
      { key: "ai-extract/c1/gecmis.pdf", lastModified: ago(24 * HOUR + 1) },
    ]);
    await new AiScheduler(prisma as never, undefined, storage as never).cleanupExtractFiles();
    expect(storage.deleteObject.mock.calls.map((c) => c[1])).toEqual([
      "ai-extract/c1/gecmis.pdf",
    ]);
  });

  it("lastModified'ı olmayan nesne silinmez (yaşı bilinmiyor → fail-safe)", async () => {
    const storage = storageMock([{ key: "ai-extract/c1/tarihsiz.pdf" }]);
    await new AiScheduler(prisma as never, undefined, storage as never).cleanupExtractFiles();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it("liste önek DIŞI anahtar döndürse bile (kalıcı firma belgesi) SİLİNMEZ", async () => {
    const storage = storageMock([
      { key: "prod/company-docs/c1/vergi-levhasi.pdf", lastModified: ago(400 * DAY) },
      { key: "ai-extract-yedek/c1/a.pdf", lastModified: ago(400 * DAY) },
      { key: "prod/ai-extract/c1/a.pdf", lastModified: ago(400 * DAY) },
      { key: "ai-extract/c1/eski.pdf", lastModified: ago(48 * HOUR) },
    ]);
    await new AiScheduler(prisma as never, undefined, storage as never).cleanupExtractFiles();
    expect(storage.deleteObject.mock.calls.map((c) => c[1])).toEqual([
      "ai-extract/c1/eski.pdf",
    ]);
  });

  it("bir silme hata verirse diğerleri yine silinir ve iş başarılı sayılır (best-effort)", async () => {
    const storage = storageMock(
      [
        { key: "ai-extract/c1/a.pdf", lastModified: ago(30 * HOUR) },
        { key: "ai-extract/c1/b.pdf", lastModified: ago(30 * HOUR) },
        { key: "ai-extract/c1/c.pdf", lastModified: ago(30 * HOUR) },
      ],
      ["ai-extract/c1/b.pdf"],
    );
    const registry = new CronRegistryService();
    const scheduler = new AiScheduler(prisma as never, registry, storage as never);
    registry.register("ai.cleanupExtractFiles", "t", "t");

    await expect(scheduler.cleanupExtractFiles()).resolves.toBeUndefined();
    expect(storage.deleteObject).toHaveBeenCalledTimes(3);
  });

  it("depolama servisi yoksa no-op (DI dışı kurulum)", async () => {
    await expect(
      new AiScheduler(prisma as never).cleanupExtractFiles(),
    ).resolves.toBeUndefined();
  });
});

describe("AiScheduler.cleanupChatSessions — 90 gün TTL (lastMessageAt)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  async function session(
    companyId: string,
    userId: string,
    lastMessageAgoMs: number,
    over: { createdAgoMs?: number; archived?: boolean; messages?: number } = {},
  ) {
    const now = Date.now();
    return prisma.aiChatSession.create({
      data: {
        companyId,
        userId,
        title: "s",
        lastMessageAt: new Date(now - lastMessageAgoMs),
        createdAt: new Date(now - (over.createdAgoMs ?? lastMessageAgoMs)),
        ...(over.archived ? { archivedAt: new Date(now - lastMessageAgoMs) } : {}),
        messages: {
          create: Array.from({ length: over.messages ?? 2 }, (_, i) => ({
            seq: i + 1,
            role: i % 2 === 0 ? ("USER" as const) : ("ASSISTANT" as const),
            content: `m${i}`,
          })),
        },
      },
    });
  }

  it("91 günlük sohbet mesajlarıyla silinir, 89 günlük kalır", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    const fresh = await session(company.id, user.id, 89 * DAY);
    const stale = await session(company.id, user.id, 91 * DAY, { messages: 3 });

    await new AiScheduler(prisma as never).cleanupChatSessions();

    const left = await prisma.aiChatSession.findMany({ select: { id: true } });
    expect(left.map((s) => s.id)).toEqual([fresh.id]);
    // Cascade: silinen sohbetin mesajı kalmaz, kalanınki durur.
    expect(
      await prisma.aiChatMessage.count({ where: { sessionId: stale.id } }),
    ).toBe(0);
    expect(
      await prisma.aiChatMessage.count({ where: { sessionId: fresh.id } }),
    ).toBe(2);
  });

  it("ölçüt SON MESAJ zamanı: 200 gün önce açılmış ama 10 gün önce yazılmış sohbet kalır", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    const active = await session(company.id, user.id, 10 * DAY, {
      createdAgoMs: 200 * DAY,
    });
    await new AiScheduler(prisma as never).cleanupChatSessions();
    expect(
      await prisma.aiChatSession.count({ where: { id: active.id } }),
    ).toBe(1);
  });

  it("arşivlenmiş eski sohbet de silinir; başka firmanın taze sohbeti etkilenmez", async () => {
    const a = await makeCompanyWithUser(prisma, {});
    const b = await makeCompanyWithUser(prisma, {});
    const archivedOld = await session(a.company.id, a.user.id, 120 * DAY, {
      archived: true,
    });
    const otherFresh = await session(b.company.id, b.user.id, 1 * DAY);
    const otherOld = await session(b.company.id, b.user.id, 365 * DAY);

    await new AiScheduler(prisma as never).cleanupChatSessions();

    const ids = (
      await prisma.aiChatSession.findMany({ select: { id: true } })
    ).map((s) => s.id);
    expect(ids).toEqual([otherFresh.id]);
    expect(ids).not.toContain(archivedOld.id);
    expect(ids).not.toContain(otherOld.id);
  });

  it("silinecek sohbet yoksa hiçbir şey silinmez (idempotent, ikinci koşu zararsız)", async () => {
    const { company, user } = await makeCompanyWithUser(prisma, {});
    await session(company.id, user.id, 5 * DAY);
    const scheduler = new AiScheduler(prisma as never);
    await scheduler.cleanupChatSessions();
    await scheduler.cleanupChatSessions();
    expect(await prisma.aiChatSession.count()).toBe(1);
    expect(await prisma.aiChatMessage.count()).toBe(2);
  });
});
