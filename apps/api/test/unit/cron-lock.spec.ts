import { CronLockService } from "../../src/common/cron/cron-lock.service";
import { trackCronRun } from "../../src/common/cron/cron-registry.service";

/**
 * Kilit SÖZLEŞMESİ: kilidi alan koşar, alamayan ATLAR, altyapı bozuksa
 * FAIL-OPEN (iş yine koşar). Son madde kritik: aksi hâlde tek bir yapılandırma
 * hatası tüm zamanlanmış işleri sessizce durdurur.
 */
describe("CronLockService", () => {
  const makeLock = (locked: boolean) => {
    const svc = new CronLockService();
    // Özel alanlara test kancası: gerçek bağlantı açmadan davranışı sına.
    (svc as unknown as { client: unknown }).client = {
      $queryRaw: jest.fn(async () => [{ locked }]),
    };
    return svc;
  };

  it("kilidi alırsa işi koşar", async () => {
    const fn = jest.fn(async () => undefined);
    const ok = await makeLock(true).runExclusive("iş.a", fn);
    expect(ok).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("kilit başkasındaysa işi ATLAR", async () => {
    const fn = jest.fn(async () => undefined);
    const ok = await makeLock(false).runExclusive("iş.a", fn);
    expect(ok).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it("kilit sorgusu patlarsa FAIL-OPEN (iş koşar)", async () => {
    const svc = new CronLockService();
    (svc as unknown as { client: unknown }).client = {
      $queryRaw: jest.fn(async () => {
        throw new Error("bağlantı yok");
      }),
    };
    const fn = jest.fn(async () => undefined);
    await expect(svc.runExclusive("iş.b", fn)).resolves.toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("aynı süreçte önceki koşu bitmeden gelen tetik ATLANIR (advisory lock oturumda yeniden alınabilir)", async () => {
    // Gerçek Postgres gibi: aynı oturumda pg_try_advisory_lock her seferinde true.
    const svc = makeLock(true);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const first = jest.fn(() => gate);
    const second = jest.fn(async () => undefined);
    const other = jest.fn(async () => undefined);
    const p1 = svc.runExclusive("emailPrograms.tick", first);
    await new Promise((r) => setImmediate(r));
    await expect(svc.runExclusive("emailPrograms.tick", second)).resolves.toBe(false);
    expect(second).not.toHaveBeenCalled();
    // Başka iş etkilenmez.
    await expect(svc.runExclusive("iş.başka", other)).resolves.toBe(true);
    release();
    await expect(p1).resolves.toBe(true);
    // Koşu bitince iş yeniden koşabilir.
    await expect(svc.runExclusive("emailPrograms.tick", second)).resolves.toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("süreç içi koruma fail-open yolunda da geçerli; hata koruma kaydını bırakır", async () => {
    const svc = new CronLockService();
    (svc as unknown as { disabled: boolean }).disabled = true;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p1 = svc.runExclusive("iş.e", () => gate);
    const dup = jest.fn(async () => undefined);
    await expect(svc.runExclusive("iş.e", dup)).resolves.toBe(false);
    expect(dup).not.toHaveBeenCalled();
    release();
    await p1;
    await expect(
      svc.runExclusive("iş.e", async () => {
        throw new Error("patladı");
      }),
    ).rejects.toThrow("patladı");
    await expect(svc.runExclusive("iş.e", dup)).resolves.toBe(true);
  });

  it("kilit servisi hiç yoksa davranış eskisiyle aynı", async () => {
    const fn = jest.fn(async () => undefined);
    await trackCronRun(undefined, "iş.c", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("trackCronRun kilidi kayıt servisinden okur", async () => {
    const fn = jest.fn(async () => undefined);
    const lock = { runExclusive: jest.fn(async () => false) };
    await trackCronRun(undefined, "iş.d", fn, lock);
    expect(lock.runExclusive).toHaveBeenCalledWith("iş.d", fn);
    expect(fn).not.toHaveBeenCalled();
  });
});
