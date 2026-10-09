/**
 * API OKUMASINDA KISA BEKLE–YENİDEN DENE (2026-10-08, staging kesintisi).
 * Sözleşme: geçici hatada bütçe içinde yeniden dener, kesin yanıtı yeniden
 * denemez, toplam süre bütçeyi aşmaz, asılı bağlantıyı zaman aşımıyla keser,
 * ana veri vazgeçtikten sonra kısa süre tek deneme yapar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CRITICAL_UPSTREAM_POLICY,
  SECONDARY_UPSTREAM_POLICY,
  UPSTREAM_COOLDOWN_MS,
  UpstreamTimeoutError,
  resetUpstreamCooldown,
  upstreamClock,
  upstreamInCooldown,
  upstreamTuning,
  withUpstreamRetry,
  type UpstreamPolicy,
} from "../upstream-retry";

/** Canlıdaki pencere (kurulum dosyası testlerde 0 yapar; burada gerçek değer sınanır). */
const SAME_FAILURE_WINDOW_MS = 1_000;

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}
const transient = (err: unknown) => !(err instanceof HttpError) || err.status >= 500;
const POLICY: UpstreamPolicy = { budgetMs: 9_000, attemptTimeoutMs: 5_000, pausesMs: [400, 1_200, 2_400] };
/** Hiç yanıt vermeyen çağrı (uyuyan API): yalnız iptal sinyaliyle biter. */
const hang = (signal: AbortSignal) =>
  new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));

beforeEach(() => {
  // Kurulum dosyası beklemeyi sıfırlar; burada GERÇEK saat sınanır. Modülün
  // saati tekdüze (`performance.now`); sahte zamanlayıcının saatine bağlanır.
  vi.restoreAllMocks();
  vi.useFakeTimers();
  vi.spyOn(upstreamClock, "now").mockImplementation(() => Date.now());
  resetUpstreamCooldown();
  upstreamTuning.sameFailureWindowMs = SAME_FAILURE_WINDOW_MS;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("withUpstreamRetry — yeniden deneme", () => {
  it("ilk denemede başarı: tek çağrı, bekleme yok", async () => {
    const attempt = vi.fn(async () => "ok");
    const sleep = vi.spyOn(upstreamClock, "sleep");
    await expect(withUpstreamRetry(attempt, { policy: POLICY, retryable: transient })).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("geçici hata (ağ / 5xx) sonra başarı: aralıklarla yeniden dener ve değeri döner", async () => {
    const attempt = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new HttpError(503))
      .mockResolvedValue("ok");
    const sleep = vi.spyOn(upstreamClock, "sleep");
    const result = withUpstreamRetry(attempt, { policy: POLICY, retryable: transient });
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([400, 1_200]);
  });

  it("kesin yanıt (4xx) yeniden denenmez", async () => {
    const attempt = vi.fn(async () => {
      throw new HttpError(400);
    });
    await expect(withUpstreamRetry(attempt, { policy: POLICY, retryable: transient })).rejects.toBeInstanceOf(HttpError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("hep hata: en çok (bekleme sayısı + 1) deneme, SON hatayı atar", async () => {
    const attempt = vi.fn(async () => {
      throw new HttpError(502);
    });
    const result = withUpstreamRetry(attempt, { policy: POLICY, retryable: transient });
    const settled = expect(result).rejects.toMatchObject({ status: 502 });
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
    expect(attempt).toHaveBeenCalledTimes(POLICY.pausesMs.length + 1);
  });

  it("ikincil politika: tek deneme", async () => {
    const attempt = vi.fn(async () => {
      throw new HttpError(503);
    });
    await expect(withUpstreamRetry(attempt, { policy: SECONDARY_UPSTREAM_POLICY, retryable: transient })).rejects.toBeInstanceOf(HttpError);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe("withUpstreamRetry — süre bütçesi", () => {
  it("asılı bağlantı: deneme zaman aşımıyla kesilir, toplam süre bütçeyi AŞMAZ", async () => {
    const signals: AbortSignal[] = [];
    const attempt = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return hang(signal);
    });
    const startedAt = Date.now();
    let finishedAt = 0;
    const result = withUpstreamRetry(attempt, { policy: POLICY, retryable: transient }).catch((err: unknown) => {
      finishedAt = Date.now();
      throw err;
    });
    const settled = expect(result).rejects.toBeInstanceOf(UpstreamTimeoutError);
    await vi.advanceTimersByTimeAsync(60_000);
    await settled;
    // 5 sn (zaman aşımı) + 0,4 sn bekleme + kalan 3,6 sn = 9 sn; üçüncü denemeye yer yok.
    // (Bu testin kendi politikası; canlı değerler aşağıdaki testte.)
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(finishedAt - startedAt).toBeLessThanOrEqual(POLICY.budgetMs);
    expect(finishedAt - startedAt).toBeGreaterThanOrEqual(POLICY.attemptTimeoutMs);
    // Asılı istekler iptal edildi (soket açık kalmaz).
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it("canlı politika: asılı API'de ana okuma en çok 8 sn, ikincil blok en çok 4 sn tutar", async () => {
    expect(CRITICAL_UPSTREAM_POLICY.budgetMs).toBeLessThanOrEqual(8_000);
    expect(CRITICAL_UPSTREAM_POLICY.attemptTimeoutMs).toBeLessThan(CRITICAL_UPSTREAM_POLICY.budgetMs);
    expect(SECONDARY_UPSTREAM_POLICY.pausesMs).toEqual([]);
    expect(SECONDARY_UPSTREAM_POLICY.budgetMs).toBeLessThanOrEqual(4_000);
    // Gerçek politikayla asılı bağlantı: bütçe dolunca biter.
    const startedAt = Date.now();
    let finishedAt = 0;
    const result = withUpstreamRetry(hang, { policy: CRITICAL_UPSTREAM_POLICY, retryable: transient }).catch((err: unknown) => {
      finishedAt = Date.now();
      throw err;
    });
    const settled = expect(result).rejects.toBeInstanceOf(UpstreamTimeoutError);
    await vi.advanceTimersByTimeAsync(60_000);
    await settled;
    expect(finishedAt - startedAt).toBeLessThanOrEqual(CRITICAL_UPSTREAM_POLICY.budgetMs);
  });

  /**
   * Modülün KENDİ saati sınanır (gözden geçirme C2-4). Eskiden bu test
   * `upstreamClock.now`u kendi sayacıyla değiştiriyordu: modülün gerçek saati
   * hiç çalışmadığı için `now` duvar saatine (`Date.now`) geri dönse de yeşil
   * kalıyordu. Burada `now` SAHTELENMEZ; sahte zamanlayıcı `performance`ı da
   * yönetir — `vi.setSystemTime` duvar saatini (`Date`) kaydırır, tekdüze saati
   * (`performance.now`) kaydırmaz, zamanlayıcıları da erkene/geçe almaz.
   *
   * Duvar saatine bağlı bir bütçe: geri adımda UZAR (ikinci deneme kalan 3,6 sn
   * yerine tam 5 sn tutar, ardından üçüncü ve dördüncü deneme gelir), ileri
   * adımda KISALIR (ikinci deneme hiç yapılmaz).
   */
  it.each([
    ["geri", -3_600_000],
    ["ileri", 3_600_000],
  ])("duvar saati bir saat %s adım atsa da bütçe değişmez (tekdüze saat)", async (_yon, stepMs) => {
    // Dosya kurulumundaki `Date.now` sahtesi kalksın: modülün gerçek `now`u çalışmalı.
    if (vi.isMockFunction(upstreamClock.now)) vi.mocked(upstreamClock.now).mockRestore();
    expect(vi.isMockFunction(upstreamClock.now)).toBe(false);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });

    const attempt = vi.fn(hang);
    let outcome: unknown = "pending";
    const result = withUpstreamRetry(attempt, { policy: POLICY, retryable: transient }).then(
      () => {
        outcome = "resolved";
      },
      (err: unknown) => {
        outcome = err;
      },
    );
    // İlk deneme sürerken duvar saati adım atar (saat eşitlemesi).
    await vi.advanceTimersByTimeAsync(2_000);
    vi.setSystemTime(Date.now() + stepMs);
    await vi.advanceTimersByTimeAsync(3_000); // 5 sn: ilk deneme zaman aşımına düştü
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(outcome).toBe("pending"); // bütçe KISALMADI: ikinci deneme hakkı duruyor
    await vi.advanceTimersByTimeAsync(400); // bekleme → ikinci deneme başlar
    expect(attempt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_599);
    expect(outcome).toBe("pending"); // ikinci deneme kalan bütçe (3,6 sn) kadar sürer
    await vi.advanceTimersByTimeAsync(1); // tam 9 sn = bütçe
    // Bütçe UZAMADI: okuma tam bütçede, iki denemeyle bitti.
    expect(outcome).toBeInstanceOf(UpstreamTimeoutError);
    expect(attempt).toHaveBeenCalledTimes(2);
    // Sonrasında yeni deneme de gelmez.
    await vi.advanceTimersByTimeAsync(60_000);
    await result;
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("zaman aşımından SONRA gelen ret sahipsiz kalmaz (unhandledRejection yok)", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const attempt = (signal: AbortSignal) => hang(signal);
    const result = withUpstreamRetry(attempt, { policy: { budgetMs: 1_000, attemptTimeoutMs: 1_000, pausesMs: [] }, retryable: transient });
    const settled = expect(result).rejects.toBeInstanceOf(UpstreamTimeoutError);
    await vi.advanceTimersByTimeAsync(2_000);
    await settled;
    await vi.advanceTimersByTimeAsync(10);
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("withUpstreamRetry — vazgeçtikten sonra tek deneme kipi", () => {
  const failing = () =>
    vi.fn(async () => {
      throw new HttpError(503);
    });
  const run = async (attempt: (signal: AbortSignal) => Promise<unknown>, trackCooldown: boolean) => {
    const result = withUpstreamRetry(attempt, { policy: POLICY, retryable: transient, trackCooldown });
    const settled = expect(result).rejects.toBeInstanceOf(HttpError);
    await vi.advanceTimersByTimeAsync(5_000);
    await settled;
  };

  it("ana veri vazgeçti → sonraki ana okuma TEK deneme; süre dolunca yeniden dener", async () => {
    const first = failing();
    await run(first, true);
    expect(first).toHaveBeenCalledTimes(4);
    expect(upstreamInCooldown()).toBe(true);

    const second = failing();
    await run(second, true);
    expect(second).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(UPSTREAM_COOLDOWN_MS + 1);
    expect(upstreamInCooldown()).toBe(false);
    const third = failing();
    await run(third, true);
    expect(third).toHaveBeenCalledTimes(4);
  });

  /**
   * KISMİ KESİNTİ (gözden geçirme C2-1). Eskiden ilk başarılı ana okuma kipi
   * kapatıyordu: API'nin yalnız bir ucu arızalıyken (ötekiler sağlıklı) araya
   * giren her sağlıklı okuma kipi sıfırlıyor, arızalı uç her sayfa çiziminde
   * yine dört istek alıyor, o çizim de yeniden deneme takvimi boyunca
   * tutuluyordu. Kip yalnız SÜREYLE biter.
   */
  const ok = () => withUpstreamRetry(async () => "ok", { policy: POLICY, retryable: transient, trackCooldown: true });

  it("başarılı ana okuma kipi KAPATMAZ — kip yalnız süreyle (son vazgeçişten 15 sn sonra) biter", async () => {
    await run(failing(), true);
    expect(upstreamInCooldown()).toBe(true);
    await expect(ok()).resolves.toBe("ok");
    expect(upstreamInCooldown()).toBe(true);
    // Sağlıklı okumadan SONRA da arızalı uç tek deneme alır.
    const again = failing();
    await run(again, true);
    expect(again).toHaveBeenCalledTimes(1);
    // Araya başarı girse de süre SON vazgeçişten sayılır. `again` hemen (tek
    // denemede) vazgeçti, `run` ardından saati 5 sn ilerletti: son vazgeçişin
    // üzerinden 5 sn geçti → sürenin dolmasına 1 ms kalana dek kip açık.
    await vi.advanceTimersByTimeAsync(UPSTREAM_COOLDOWN_MS - 5_000 - 1);
    await expect(ok()).resolves.toBe("ok");
    expect(upstreamInCooldown()).toBe(true);
    await vi.advanceTimersByTimeAsync(2);
    expect(upstreamInCooldown()).toBe(false);
    const afterWindow = failing();
    await run(afterWindow, true);
    expect(afterWindow).toHaveBeenCalledTimes(4);
  });

  it("kısmi kesinti: arızalı uç, araya sağlıklı okumalar girse de çizim başına TEK istek alır (dört kat yük yok)", async () => {
    const views = 10;
    let callsToFailingEndpoint = 0;
    const failingEndpoint = async () => {
      callsToFailingEndpoint += 1;
      throw new HttpError(503);
    };
    const sleep = vi.spyOn(upstreamClock, "sleep");
    for (let view = 0; view < views; view++) {
      // Talep sayfası (uç 503 dönüyor) …
      const page = withUpstreamRetry(failingEndpoint, { policy: POLICY, retryable: transient, trackCooldown: true, key: `c|tr|/talep?i=${view}` });
      const settled = expect(page).rejects.toBeInstanceOf(HttpError);
      await vi.advanceTimersByTimeAsync(4_000); // en uzun yeniden deneme takvimi (0,4 + 1,2 + 2,4 sn)
      await settled;
      // … ardından başka bir ziyaretçinin SAĞLIKLI ana okuması (ürün listesi, şehir sorgusu).
      await expect(ok()).resolves.toBe("ok");
      await vi.advanceTimersByTimeAsync(200); // çizimler arası 200 ms
    }
    // İlk çizim dört deneme yapıp vazgeçer; sonraki dokuzu tek deneme (toplam
    // kesintideki sayıyla aynı). Kip başarıyla kapansaydı 10 × 4 = 40 olurdu.
    expect(callsToFailingEndpoint).toBe(4 + (views - 1));
    // Yalnız ilk çizim yeniden deneme takvimini bekledi; sonrakiler hiç beklemedi.
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([400, 1_200, 2_400]);
  });

  it("ikincil blok kipi ne açar ne okur (tek uçtaki arıza ana veriyi etkilemez)", async () => {
    await run(failing(), false);
    expect(upstreamInCooldown()).toBe(false);
    // Kip açıkken de izlemeyen çağrı kendi politikasını uygular.
    await run(failing(), true);
    const untracked = failing();
    await run(untracked, false);
    expect(untracked).toHaveBeenCalledTimes(4);
  });

  it("kesin yanıtla (4xx) biten ana okuma kipi AÇMAZ", async () => {
    const attempt = vi.fn(async () => {
      throw new HttpError(400);
    });
    await expect(withUpstreamRetry(attempt, { policy: POLICY, retryable: transient, trackCooldown: true })).rejects.toBeInstanceOf(HttpError);
    expect(upstreamInCooldown()).toBe(false);
  });
});

describe("withUpstreamRetry — aynı okuma (anahtar)", () => {
  const opts = (key: string) => ({ policy: POLICY, retryable: transient, trackCooldown: true, key });

  it("aynı anda iki yerden istenen okuma TEK uçuşu paylaşır (sayfa + generateMetadata)", async () => {
    const release: ((value: string) => void)[] = [];
    const attempt = vi.fn(() => new Promise<string>((resolve) => release.push(resolve)));
    const a = withUpstreamRetry(attempt, opts("c|tr|/x"));
    const b = withUpstreamRetry(attempt, opts("c|tr|/x"));
    const other = withUpstreamRetry(attempt, opts("c|en|/x"));
    expect(attempt).toHaveBeenCalledTimes(2); // tr bir, en bir
    release[0]("tr");
    release[1]("en");
    await expect(a).resolves.toBe("tr");
    await expect(b).resolves.toBe("tr");
    await expect(other).resolves.toBe("en");
  });

  it("başarı SAKLANMAZ: bir sonraki okuma API'ye yeniden gider", async () => {
    const attempt = vi.fn(async () => "ok");
    await withUpstreamRetry(attempt, opts("k"));
    await withUpstreamRetry(attempt, opts("k"));
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("az önce başarısız biten okuma aynı anahtara HEMEN aynı hatayı verir (hata belgesi için ikinci tur fonksiyonu tutmaz)", async () => {
    const attempt = vi.fn(hang);
    const first = withUpstreamRetry(attempt, opts("c|tr|/talep"));
    const settled = expect(first).rejects.toBeInstanceOf(UpstreamTimeoutError);
    await vi.advanceTimersByTimeAsync(POLICY.budgetMs);
    await settled;
    const calls = attempt.mock.calls.length;
    // İkinci tur (Next hata belgesi için generateMetadata'yı yeniden çağırır): API'ye gitmez, beklemez.
    const before = Date.now();
    await expect(withUpstreamRetry(attempt, opts("c|tr|/talep"))).rejects.toBeInstanceOf(UpstreamTimeoutError);
    expect(Date.now() - before).toBe(0);
    expect(attempt).toHaveBeenCalledTimes(calls);
    // Başka okuma etkilenmez.
    const otherAttempt = vi.fn(async () => "ok");
    await expect(withUpstreamRetry(otherAttempt, opts("c|tr|/urun"))).resolves.toBe("ok");
  });

  it("pencere çok kısa: kullanıcının yeniden denemesi API'ye GERÇEKTEN sorar", async () => {
    const failing = vi.fn(async () => {
      throw new HttpError(503);
    });
    const first = withUpstreamRetry(failing, opts("k"));
    const settled = expect(first).rejects.toBeInstanceOf(HttpError);
    await vi.advanceTimersByTimeAsync(5_000);
    await settled;
    expect(SAME_FAILURE_WINDOW_MS).toBeLessThanOrEqual(1_000);
    await vi.advanceTimersByTimeAsync(SAME_FAILURE_WINDOW_MS);
    const recovered = vi.fn(async () => "ok");
    await expect(withUpstreamRetry(recovered, opts("k"))).resolves.toBe("ok");
    expect(recovered).toHaveBeenCalledTimes(1);
  });

  it("anahtarsız çağrı hiçbir şeyi paylaşmaz", async () => {
    const attempt = vi.fn(async () => {
      throw new HttpError(400);
    });
    await expect(withUpstreamRetry(attempt, { policy: POLICY, retryable: transient })).rejects.toBeInstanceOf(HttpError);
    await expect(withUpstreamRetry(attempt, { policy: POLICY, retryable: transient })).rejects.toBeInstanceOf(HttpError);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
