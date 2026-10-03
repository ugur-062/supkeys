import { ContentTranslationService } from "../../src/modules/content-translation/content-translation.service";
import { sourceHash, type SourceFields } from "../../src/modules/content-translation/content-translation.logic";

/**
 * `ensureTranslated` — dış talep davetinden ÖNCE alıcının dilindeki çeviriyi
 * bekler (2026-09-27, kullanıcı kararı: en fazla ~60 sn, dolarsa özgün metin).
 * Sözleşme: hazırsa beklemez; kaynak dili isteniyorsa model çağırmaz; güncel
 * satır varsa `enqueue` ÇAĞRILMAZ (çift çeviri/deneme sıfırlama yok), yalnız
 * sahipsiz bekleyen satır bir kez `kick` edilir; başarısız satır beklenmez;
 * AI kapalıysa hemen `false`.
 */
const SOURCE: SourceFields = {
  title: "Çelik boru alımı",
  description: null,
  keywords: [],
  items: ["Dikişsiz boru"],
} as unknown as SourceFields;
const HASH = sourceHash("LISTING", SOURCE);

type Row = { locale: string; status: string; sourceHash: string; sourceLocale: string | null };

function rig(opts: { enabled?: boolean; snapshots: Row[][] }) {
  let call = 0;
  const findMany = jest.fn().mockImplementation(async () => {
    const snap = opts.snapshots[Math.min(call, opts.snapshots.length - 1)] ?? [];
    call += 1;
    return snap;
  });
  const prisma = { contentTranslation: { findMany } };
  const cfg = { enabled: opts.enabled ?? true, models: { premium: "m" }, pricing: {} };
  const provider = { complete: jest.fn() };
  const svc = new ContentTranslationService(prisma as never, cfg as never, provider as never);
  const s = svc as unknown as {
    loadSource: jest.Mock;
    enqueue: jest.Mock;
    kick: jest.Mock;
    guessSourceLocale: jest.Mock;
  };
  s.loadSource = jest.fn().mockResolvedValue(SOURCE);
  s.enqueue = jest.fn().mockResolvedValue(true);
  s.kick = jest.fn();
  s.guessSourceLocale = jest.fn().mockResolvedValue("tr");
  return { svc, findMany, s };
}

const row = (locale: string, status: string, sourceLocale: string | null = "tr", hash = HASH): Row => ({
  locale,
  status,
  sourceHash: hash,
  sourceLocale,
});

describe("ContentTranslationService.ensureTranslated", () => {
  it("istenen diller hazırsa beklemez, kuyruğa dokunmaz", async () => {
    const { svc, s } = rig({ snapshots: [[row("tr", "DONE"), row("en", "DONE"), row("ru", "DONE")]] });
    await expect(svc.ensureTranslated("LISTING", "l1", ["en", "ru"], 5_000, 5)).resolves.toBe(true);
    expect(s.enqueue).not.toHaveBeenCalled();
    expect(s.kick).not.toHaveBeenCalled();
  });

  it("hiç kuyruğa girmemiş kayıt + istenen dil kaynağın tahmini dili → model çağrılmaz", async () => {
    const { svc, s } = rig({ snapshots: [[]] });
    await expect(svc.ensureTranslated("LISTING", "l1", ["tr"], 5_000, 5)).resolves.toBe(true);
    expect(s.enqueue).not.toHaveBeenCalled();
  });

  it("çevrilmemiş kayıt kuyruğa BİR KEZ alınır; çeviri gelince true", async () => {
    const pending = [row("tr", "PENDING"), row("en", "PENDING"), row("ru", "PENDING")];
    const done = [row("tr", "DONE"), row("en", "DONE"), row("ru", "DONE")];
    const { svc, s } = rig({ snapshots: [[], pending, pending, done] });
    await expect(svc.ensureTranslated("LISTING", "l1", ["en"], 5_000, 5)).resolves.toBe(true);
    expect(s.enqueue).toHaveBeenCalledTimes(1);
    expect(s.kick).not.toHaveBeenCalled();
  });

  it("güncel ama bekleyen satır: enqueue YOK, bir kez kick; süre dolunca false (özgün metin)", async () => {
    const pending = [row("tr", "PENDING"), row("en", "PENDING"), row("ru", "PENDING")];
    const { svc, s } = rig({ snapshots: [pending] });
    await expect(svc.ensureTranslated("LISTING", "l1", ["en"], 30, 5)).resolves.toBe(false);
    expect(s.enqueue).not.toHaveBeenCalled();
    expect(s.kick).toHaveBeenCalledTimes(1);
  });

  it("kaynak değişmiş (eski özet) → yeniden kuyruğa alınır", async () => {
    const stale = [row("tr", "DONE", "tr", "v3:old"), row("en", "DONE", "tr", "v3:old"), row("ru", "DONE", "tr", "v3:old")];
    const { svc, s } = rig({ snapshots: [stale] });
    await expect(svc.ensureTranslated("LISTING", "l1", ["en"], 20, 5)).resolves.toBe(false);
    expect(s.enqueue).toHaveBeenCalledTimes(1);
  });

  it("başarısız çeviri beklenmez; model saptadığı kaynak dil (en) istenirse hazır sayılır", async () => {
    const failed = [row("tr", "FAILED", "und"), row("en", "FAILED", "und"), row("ru", "FAILED", "und")];
    const a = rig({ snapshots: [failed] });
    await expect(a.svc.ensureTranslated("LISTING", "l1", ["ru"], 5_000, 5)).resolves.toBe(false);
    expect(a.s.kick).not.toHaveBeenCalled();

    const english = [row("tr", "DONE", "en"), row("en", "DONE", "en"), row("ru", "PENDING", "en")];
    const b = rig({ snapshots: [english] });
    await expect(b.svc.ensureTranslated("LISTING", "l1", ["en", "tr"], 5_000, 5)).resolves.toBe(true);
  });

  it("AI kapalı → hemen false; çevrilecek metin yok → true", async () => {
    const off = rig({ enabled: false, snapshots: [[]] });
    await expect(off.svc.ensureTranslated("LISTING", "l1", ["en"], 5_000, 5)).resolves.toBe(false);
    expect(off.findMany).not.toHaveBeenCalled();

    const empty = rig({ snapshots: [[]] });
    empty.s.loadSource.mockResolvedValue({ title: "", description: null, keywords: [], items: [] });
    await expect(empty.svc.ensureTranslated("LISTING", "l1", ["en"], 5_000, 5)).resolves.toBe(true);
  });
});
