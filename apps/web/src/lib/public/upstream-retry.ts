/**
 * API OKUMASINDA KISA BEKLE–YENİDEN DENE (2026-10-08, staging kesintisi).
 *
 * Staging API'si boştayken uyur (uyanması ~1 dk), canlıda da dağıtım sırasında
 * birkaç saniye yanıt vermez. Eskiden web sunucusu API'ye TEK kez soruyor,
 * zaman aşımı da yoktu: reddedilen bağlantıda ziyaretçi anında hata sayfası
 * görüyor, asılı kalan bağlantıda sunucu fonksiyonu platform kesene dek
 * bekliyordu (Node `fetch` varsayılanı 300 sn).
 *
 * Kural:
 *  - her denemenin zaman aşımı var (başlıklar + gövde birlikte);
 *  - ANA veri kısa aralıklarla yeniden denenir, ama toplam süre `budgetMs`i
 *    aşamaz (sunucu fonksiyonu uzun tutulmaz — ~1 dk'lık uyanmayı burada
 *    beklemeyiz, onu ekrandaki otomatik yeniden deneme köprüler);
 *  - İKİNCİL bloklar tek deneme yapar (sayfayı bekletmesinler);
 *  - ana veri bütçeyi tüketip vazgeçtiyse kısa bir süre (`UPSTREAM_COOLDOWN_MS`)
 *    sonraki ana okumalar TEK deneme yapar: kesinti sürerken her ziyaretçi için
 *    fonksiyonu bütçe boyunca tutmayız, toparlanan API'ye de dört kat yük
 *    bindirmeyiz. Kip YALNIZ süreyle biter — SON vazgeçişten
 *    `UPSTREAM_COOLDOWN_MS` sonra. Başarılı bir okuma kipi KAPATMAZ: API'nin
 *    yalnız bir kısmı arızalıyken (tek uç 503 dönüyor ya da zaman aşımına
 *    düşüyor, ötekiler sağlıklı) araya giren her sağlıklı okuma kipi kapatsaydı
 *    arızalı uca her sayfa çiziminde yine dört istek gider, o çizim de bütçe
 *    boyunca tutulurdu (gözden geçirme C2-1; ölçüldü: 10 çizimde 40 istek,
 *    toplam kesintide 13);
 *  - AYNI okuma (anahtar) aynı anda iki yerden istenirse tek uçuş paylaşılır,
 *    başarısız biten uçuşun hatası çok kısa bir süre (`sameFailureWindowMs`)
 *    aynı anahtara yeniden verilir — bkz. `withUpstreamRetry` `key`.
 *
 * Başarısızlık ÖNBELLEĞE GİRMEZ: bu modül yalnız dener ve sonunda hatayı
 * AYNEN geri atar; "kesinti ≠ boş veri" kararı `marketplace-api.ts`te kalır.
 * Durum süreç (örnek) başınadır — paylaşılan depo yok, gerekmiyor.
 */
export interface UpstreamPolicy {
  /** İlk denemenin başından son denemenin sonuna toplam süre tavanı (ms). */
  budgetMs: number;
  /** Tek denemenin zaman aşımı (ms) — kalan bütçe daha kısaysa o uygulanır. */
  attemptTimeoutMs: number;
  /** Denemeler arası beklemeler (ms); en çok deneme sayısı = uzunluk + 1. */
  pausesMs: readonly number[];
}

/**
 * ANA veri. Reddedilen bağlantı / hızlı 5xx: 0 · 0,4 · 1,6 · 4,0 sn'de dört
 * deneme (birkaç saniyelik yeniden başlatmayı köprüler). Asılı bağlantı:
 * 4,5 sn + 0,4 sn + kalan 3,1 sn = en çok 8 sn — sunucu fonksiyonu bundan uzun
 * tutulmaz.
 */
export const CRITICAL_UPSTREAM_POLICY: UpstreamPolicy = {
  budgetMs: 8_000,
  attemptTimeoutMs: 4_500,
  pausesMs: [400, 1_200, 2_400],
};

/** İKİNCİL blok (facet, öne çıkan, benzer…): tek deneme, kısa zaman aşımı. */
export const SECONDARY_UPSTREAM_POLICY: UpstreamPolicy = {
  budgetMs: 4_000,
  attemptTimeoutMs: 4_000,
  pausesMs: [],
};

/** SON vazgeçişten sonra tek deneme kipinin süresi (ms) — kip yalnız bu süreyle biter. */
export const UPSTREAM_COOLDOWN_MS = 15_000;

/** Kalan bütçe bundan kısaysa yeni deneme başlatılmaz (ms). */
const MIN_ATTEMPT_MS = 500;

export class UpstreamTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`upstream timeout after ${timeoutMs} ms`);
    this.name = "UpstreamTimeoutError";
  }
}

/**
 * Saat ve bekleme tek noktadan. Saat TEKDÜZE (`performance.now`): süre bütçesi
 * duvar saatine bağlanırsa saat eşitlemesinin geri/ileri adımı bütçeyi uzatır
 * ya da kısaltır (WSL'de ölçüldü: 20 sn'de −2,4 sn). Testler sahte
 * zamanlayıcıyla `now`u, `vi.spyOn(upstreamClock, "sleep")` ile beklemeyi
 * yönetir (`vitest.setup.ts` varsayılan olarak beklemeyi sıfırlar).
 */
export const upstreamClock = {
  now: (): number => performance.now(),
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Ayar: başarısız biten okumanın hatası AYNI anahtara bu süre boyunca yeniden
 * verilir (ms). Amaç tek isteğin içindeki yinelemeyi yutmak — Next, sayfa
 * hata verince hata belgesi için `generateMetadata`yı YENİDEN çağırır; asılı
 * API'de bu ikinci tur fonksiyonu bir zaman aşımı daha tutuyordu (ölçüldü:
 * 5 sn + 4,3 sn). Süre bilerek çok kısa: kullanıcının "Tekrar dene"si (yanıtın
 * tarayıcıya varması + çizim + tıklama) bu pencereye sığmaz, yani her yeniden
 * deneme API'ye gerçekten sorar. Birim testleri pencereyi kapatır
 * (`vitest.setup.ts`): aynı testte art arda gelen okumalar birbirini etkilemesin.
 */
export const upstreamTuning = { sameFailureWindowMs: 1_000 };

/** Uçuş kaydı tavanı — keyfi adreslerle (arama sorgusu) bellek büyümesin. */
const MAX_FLIGHTS = 500;

let gaveUpAt = Number.NEGATIVE_INFINITY;
const flights = new Map<string, { promise: Promise<unknown>; failedAt?: number }>();

/** Ana veri yakın zamanda bütçeyi tüketip vazgeçti mi (tek deneme kipi)? */
export function upstreamInCooldown(): boolean {
  return upstreamClock.now() - gaveUpAt < UPSTREAM_COOLDOWN_MS;
}

/** Yalnız testler için: süreç düzeyindeki durumu (tek deneme kipi + uçuşlar) sıfırlar. */
export function resetUpstreamCooldown(): void {
  gaveUpAt = Number.NEGATIVE_INFINITY;
  flights.clear();
}

/** Tek deneme: `timeoutMs` dolunca isteği iptal eder ve `UpstreamTimeoutError` atar. */
async function runAttempt<T>(attempt: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Önce zaman aşımı reddedilir, SONRA istek iptal edilir: sıra tersi
      // olsaydı iptalin kendi hatası (AbortError) yarışı kazanır, çağıran
      // "zaman aşımı" yerine anlamsız bir iptal hatası görürdü.
      reject(new UpstreamTimeoutError(timeoutMs));
      controller.abort();
    }, timeoutMs);
  });
  // Yarış: sinyali dinlemeyen bir çağrı da (sahte, akış ortasında takılan
  // gövde) süreyi aşamaz. Zaman aşımından SONRA gelen ret sahipsiz kalmasın.
  const pending = attempt(controller.signal);
  pending.catch(() => undefined);
  try {
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface UpstreamRetryOptions {
  policy: UpstreamPolicy;
  /** Bu hata geçici mi (yeniden denemeye değer mi)? 4xx gibi kesin yanıtlar değildir. */
  retryable: (error: unknown) => boolean;
  /**
   * ANA veri: vazgeçince tek deneme kipini açar (her vazgeçiş süreyi yeniden
   * başlatır) ve kip açıkken kendisi de tek deneme yapar. Başarı kipi
   * KAPATMAZ — kip yalnız `UPSTREAM_COOLDOWN_MS` dolunca biter. İkincil bloklar
   * bu durumu ne okur ne yazar (tek uçtaki kalıcı arıza ana verinin yeniden
   * denemesini kapatmasın).
   */
  trackCooldown?: boolean;
  /**
   * Okumanın kimliği (adres + dil + politika + yanıtı etkileyen her şey).
   * Verilirse: aynı anahtar için süren uçuş PAYLAŞILIR (sayfa ve
   * `generateMetadata` aynı kaydı aynı anda ister → API'ye tek istek) ve
   * başarısız biten uçuşun hatası `sameFailureWindowMs` boyunca aynı anahtara
   * yeniden verilir. Başarı saklanmaz (veri önbelleğinin işi). Değer
   * kopyalanabilir (JSON) olmalıdır: uçuşa katılan çağrı `structuredClone`
   * kopyası alır.
   *
   * Anahtar, yanıtın ÇAĞIRANA GÖRE değişebildiği her girdiyi içermelidir:
   * paylaşılan şey hata da olduğu için, çağırana özel bir ret (ziyaretçi
   * başına hız sınırı → 429) aynı anahtarı kullanan BAŞKA çağırana da verilir
   * (gözden geçirme C2-3; `marketplace-api.ts` anahtara ziyaretçi IP'sini katar).
   */
  key?: string;
}

/**
 * `attempt`i politika içinde çalıştırır. Başarıda değeri döner; yeniden
 * denenemeyen hatada ya da bütçe/deneme hakkı bitince SON hatayı aynen atar.
 */
export function withUpstreamRetry<T>(attempt: (signal: AbortSignal) => Promise<T>, options: UpstreamRetryOptions): Promise<T> {
  const { key } = options;
  if (key === undefined) return runPolicy(attempt, options);

  const known = flights.get(key);
  if (known) {
    const reusable = known.failedAt === undefined || upstreamClock.now() - known.failedAt < upstreamTuning.sameFailureWindowMs;
    // Katılan çağrı KENDİ kopyasını alır: paylaşmadan önce her çağrı ayrı bir
    // nesne alıyordu; biri veriyi yerinde değiştirirse (sıralama vb.) öteki
    // etkilenmesin. Ret aynen geçer.
    if (reusable) return (known.promise as Promise<T>).then((value) => structuredClone(value));
    flights.delete(key);
  }
  if (flights.size >= MAX_FLIGHTS) {
    // Süresi geçmiş başarısızlık kayıtlarını at; yine doluysa paylaşmadan çalış.
    const now = upstreamClock.now();
    for (const [k, f] of flights) {
      if (f.failedAt !== undefined && now - f.failedAt >= upstreamTuning.sameFailureWindowMs) flights.delete(k);
    }
    if (flights.size >= MAX_FLIGHTS) return runPolicy(attempt, options);
  }
  const entry: { promise: Promise<unknown>; failedAt?: number } = { promise: Promise.resolve() };
  entry.promise = runPolicy(attempt, options).then(
    (value) => {
      if (flights.get(key) === entry) flights.delete(key);
      return value;
    },
    (error: unknown) => {
      entry.failedAt = upstreamClock.now();
      throw error;
    },
  );
  flights.set(key, entry);
  return entry.promise as Promise<T>;
}

async function runPolicy<T>(
  attempt: (signal: AbortSignal) => Promise<T>,
  { policy, retryable, trackCooldown = false }: UpstreamRetryOptions,
): Promise<T> {
  const startedAt = upstreamClock.now();
  const elapsed = () => upstreamClock.now() - startedAt;
  const pauses = trackCooldown && upstreamInCooldown() ? [] : policy.pausesMs;
  for (let index = 0; ; index++) {
    const timeoutMs = Math.max(1, Math.round(Math.min(policy.attemptTimeoutMs, policy.budgetMs - elapsed())));
    try {
      // Başarı tek deneme kipine DOKUNMAZ (bkz. dosya başı): kip yalnız süreyle biter.
      return await runAttempt(attempt, timeoutMs);
    } catch (error) {
      const transient = retryable(error);
      const pause = pauses[index];
      const fits = pause !== undefined && elapsed() + pause + MIN_ATTEMPT_MS <= policy.budgetMs;
      if (!transient || !fits) {
        if (trackCooldown && transient) gaveUpAt = upstreamClock.now();
        throw error;
      }
      await upstreamClock.sleep(pause);
    }
  }
}
