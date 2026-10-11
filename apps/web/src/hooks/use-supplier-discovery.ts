"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { Locale } from "@rothern/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";

export interface DiscoveryCandidate {
  companyId: string;
  name: string;
  city: string | null;
  /** Firmanın ülkesi (ISO-2). */
  country?: string | null;
  rothernId: string | null;
  /** Talepten açılışta: bu talebe zaten davetli. */
  alreadyInvited?: boolean;
  matchedCategories: string[];
  strongMatch: boolean;
  /** Vitrindeki ürünü kalem adıyla eşleşen kalemler (1'den sıra no). */
  matchedItems?: number[];
  connectionStatus: "NONE" | "PENDING";
}

/**
 * Aday durumu (API `CandidateStatus`, 2026-09-27) — "AI ile tedarikçi bul"
 * penceresinin web araması bunu okur: zaten davetli, kayıtlı üye (e-posta
 * değil DOĞRUDAN TALEBE davet edilir) ve önceden onay isteyen ülkedeki aday
 * listeye girmez. Yayın sonrası turda aday satırı ayrıca `invite` (davet
 * sonucu) taşır; orada ham durum yalnız eski yanıt için geri düşüştür.
 */
export type CandidateStatus = "SUGGESTED" | "ALREADY_INVITED" | "MEMBER" | "CONSENT_REQUIRED" | "INVITED";

/**
 * Yayın sonrası turun adayına ne oldu (API `candidateInvite`, 2026-10-08) —
 * tur bulduğunu kendisi davet eder, ekran yalnız durumu gösterir:
 * INVITED (üye talebe davetli / e-posta gönderildi) · QUEUED (e-posta sırada,
 * alıcının ülkesinde mesai saatinde gider) · ALREADY_INVITED (tur bulduğunda
 * zaten davetliydi) · NOT_SENT (+ `inviteReason`) · WAITING (tur sürüyor).
 */
export type CandidateInviteState = "INVITED" | "QUEUED" | "ALREADY_INVITED" | "NOT_SENT" | "WAITING";

export interface ExternalCandidate {
  name: string;
  city: string | null;
  /** Firmanın ülkesi (ISO-2) — AI web araması bulduysa; davet dilinin varsayılanı buradan. */
  country?: string | null;
  website: string | null;
  email: string | null;
  reason: string;
  /** Tedarik edebileceği kalemler — talepteki sıra no (1'den). */
  matchedItems?: number[];
  /** LOCAL = alıcının ülkesi, ABROAD = yurt dışı. */
  scope?: "LOCAL" | "ABROAD" | null;
  status?: CandidateStatus;
  /** Son 7 günde başka alıcıdan davet aldı — davet özet e-postayla gider. */
  recentlyInvited?: boolean;
  /** Adres ya da web sitesi kayıtlı bir firmayla eşleşti (MEMBER). */
  memberCompanyId?: string | null;
}

/** Web aramasının geçişi: LOCAL = alıcının ülkesi, ABROAD = yurt dışı. */
export type DiscoveryScope = "LOCAL" | "ABROAD";

/**
 * Bir geçişin neden yanıt vermediği (API `PassFailureReason`): TIMEOUT = süre
 * yetmedi, PROVIDER = arama hizmeti yanıt vermedi / yanıtı okunamadı (ikisinde
 * yeniden aramak işe yarar), BUDGET = firmanın AI bütçesi çağrıyı reddetti
 * (yeniden aramak sonucu değiştirmez).
 */
export type DiscoveryIncompleteReason = "TIMEOUT" | "PROVIDER" | "BUDGET";

export interface ExternalDiscoveryInput {
  type: "ALIM";
  /** Kategori ZORUNLU DEĞİL (2026-09-27) — kalem adlarıyla da aranır. */
  categoryIds?: string[];
  itemNames?: string[];
  region?: string;
  /** Kayıtlı talep — arama konumu talebin görünürlük ülkelerinden (sunucu okur). */
  listingId?: string;
  /** Yayın öncesi form — görünürlük ülkeleri (boş = yurt içi + yurt dışı). */
  targetCountries?: string[];
  /**
   * YALNIZ bu geçişler aranır (kısmi sonucun eksik kalanı) — yanıt vermiş geçiş
   * ikinci kez aranmaz ve ödenmez. Verilmezse bütün geçişler. Alanı tanımayan
   * eski API gövdeyi 400 ile reddeder: yalnız `supportsScopes` diyen yanıttan
   * sonra gönderilir.
   */
  scopes?: DiscoveryScope[];
}

/**
 * Etkileşimli web aramasının yanıtı (`POST company/ai/supplier-discovery/external`).
 * `incompleteScopes` (2026-10-09): geçişlerden biri hata verdiyse ya da zaman
 * aşımına uğradıysa uç 5xx DÖNMEZ — yanıt veren geçişin adaylarını döner ve
 * yanıt vermeyen geçişi burada listeler (hepsi yanıt verdiyse boş). Yalnız
 * BÜTÜN geçişler düşerse hata döner. Alanı tanımayan eski API'de boş sayılır.
 *
 * Eksik geçişin NEDENİ (aynı gün): `incompleteReasons[geçiş]` ve — yalnız bütçe
 * reddinde — sunucunun istek dilindeki metni `incompleteMessages[geçiş]`.
 * İkisi de yalnız `incompleteScopes`taki geçişler için okunur; tanınmayan neden
 * ve boş metin düşer. `supportsScopes`: yanıt nedenleri TAŞIYORSA uç istekteki
 * `scopes` alanını da tanır (ikisi aynı sürümde geldi) — eski API'de false,
 * nedenler ve metinler boş.
 */
export interface ExternalDiscoveryResult {
  companies: ExternalCandidate[];
  incompleteScopes: DiscoveryScope[];
  incompleteReasons: Partial<Record<DiscoveryScope, DiscoveryIncompleteReason>>;
  incompleteMessages: Partial<Record<DiscoveryScope, string>>;
  supportsScopes: boolean;
}

const DISCOVERY_SCOPES: readonly DiscoveryScope[] = ["LOCAL", "ABROAD"];
const INCOMPLETE_REASONS: readonly DiscoveryIncompleteReason[] = ["TIMEOUT", "PROVIDER", "BUDGET"];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const EXTERNAL_SEARCH_PATH = "/company/ai/supplier-discovery/external";

/** Süren arama bu aralıkla yoklanır. */
export const EXTERNAL_SEARCH_POLL_MS = 3_000;
/**
 * İstemcinin bekleme TAVANI (aramanın başladığı andan). Arama genellikle bir-iki
 * dakika sürer; tavan dolunca yoklama bırakılır ve pencere "yeniden arayın" der.
 */
export const EXTERNAL_SEARCH_MAX_MS = 8 * 60_000;

/**
 * BAŞLAMIŞ bir aramanın sonuçsuz bitişi (HTTP hata yanıtı DEĞİL — o olduğu gibi
 * axios hatası olarak gider):
 *  - FAILED       arama sunucuda düştü; `statusCode` / `code` / `serverMessage`
 *                 eş zamanlı ucun hata gövdesindeki alanlarla aynı anlamdadır
 *                 (metin, aramayı BAŞLATAN isteğin dilinde)
 *  - INTERRUPTED  arama kimliği artık bilinmiyor (404): API yeniden başladı ya
 *                 da kayıt süresini doldurdu
 *  - TIMED_OUT    `EXTERNAL_SEARCH_MAX_MS` doldu
 *  - ABANDONED    çağıran `shouldStop` ile bıraktı (oturum silindi) — kullanıcıya
 *                 gösterilecek bir şey yok
 */
export type ExternalSearchFailureKind = "FAILED" | "INTERRUPTED" | "TIMED_OUT" | "ABANDONED";

export class ExternalSearchError extends Error {
  readonly kind: ExternalSearchFailureKind;
  readonly statusCode: number | null;
  readonly code: string | null;
  /** Sunucunun kullanıcı metni; yoksa null (pencere kendi metnini yazar). */
  readonly serverMessage: string | null;

  constructor(
    kind: ExternalSearchFailureKind,
    detail: { statusCode?: number | null; code?: string | null; serverMessage?: string | null } = {},
  ) {
    super(`supplier web search ${kind.toLowerCase()}`);
    this.name = "ExternalSearchError";
    this.kind = kind;
    this.statusCode = detail.statusCode ?? null;
    this.code = detail.code ?? null;
    this.serverMessage = detail.serverMessage ?? null;
  }
}

export interface ExternalSearchOptions {
  /** Aramanın başladığı an (ms) — bekleme tavanı buradan sayılır; verilmezse çağrı anı. */
  since?: number;
  /** `true` dönerse yoklama sessizce bırakılır (oturum silindi / hesap değişti). */
  shouldStop?: () => boolean;
  /**
   * Sunucu aramayı kabul etti ve kimliğini verdi. Çağıran kimliği saklar:
   * yeniden bağlanan pencere / sayfa AYNI aramayı `resumeExternalSupplierSearch`
   * ile izler (ikinci ücretli arama başlamaz).
   */
  onStarted?: (searchId: string) => void;
  /**
   * Aramanın sunucuda BAŞLADIĞI an, BU TARAYICININ saatiyle (ms) — arama sürerken,
   * arama başına en çok bir kez. Aynı aramaya SONRADAN katılan sekme (başlatma
   * süren aramanın kimliğini döner) sayacını kendi tıklama anından değil buradan
   * sürdürür (canlı doğrulama AS-4).
   *
   * Değer yoklama yanıtının `elapsedMs` alanından türer (sunucunun KENDİ saatiyle
   * ölçtüğü geçen süre): `şimdi − elapsedMs`. Yanıttaki `startedAt` KULLANILMAZ
   * (gözden geçirme): o sunucu saatinde bir andır; tarayıcı saati 30 sn ileriyse
   * aramayı başlatan sekmenin sayacı 3. saniyede "33 sn" diyor, gerideyse katılan
   * sekme yine sıfırdan sayıyordu. Süre ortak saat gerektirmez. Çağıran değeri
   * kendi bildiği başlangıçla (aynı saat) karşılaştırıp kullanır.
   *
   * BAŞLATMA yanıtı da aynı alanı taşır (kapanış kontrolü DISC-N2: yeni aramada
   * 0, süren aramaya katılana aramanın yaşı): varsa bildirim ilk yoklamayı (3 sn)
   * BEKLEMEDEN, `onStarted`dan hemen sonra gelir — katılan sekme o üç saniye
   * boyunca "0 sn" demez. Alanı taşımayan (eski) API'de ilk bildirim eskisi gibi
   * yoklamadan gelir.
   */
  onStartedAt?: (startedAt: number) => void;
  /** Başlatma ucu yok (eski API, 404): arama eş zamanlı uca düştü — çağıran bunu hatırlar. */
  onSyncFallback?: () => void;
  /** Başlatma ucunu DENEME, doğrudan eş zamanlı uç (eski API olduğu bu oturumda öğrenildi). */
  sync?: boolean;
}

type ExternalSearchBody = Omit<ExternalDiscoveryInput, "scopes"> & { scopes?: DiscoveryScope[] };

/**
 * İstek gövdesi — iki uç da aynı DTO'yu okur. `scopes` yalnız geçerli ve dolu
 * ise girer (boş dizi sunucuda "bütün geçişler" demektir; eski API ise alanın
 * kendisini reddeder).
 */
function externalSearchBody(input: ExternalDiscoveryInput): ExternalSearchBody {
  const { scopes, ...rest } = input;
  const wanted = DISCOVERY_SCOPES.filter((s) => scopes?.includes(s));
  return wanted.length > 0 ? { ...rest, scopes: wanted } : rest;
}

/** Arama yanıtının gövdesi (eş zamanlı ucun yanıtı = biten aramanın `result` alanı). */
function readExternalResult(raw: unknown): ExternalDiscoveryResult {
  const data = asRecord(raw) ?? {};
  const incomplete: unknown[] = Array.isArray(data.incompleteScopes) ? data.incompleteScopes : [];
  const incompleteScopes = DISCOVERY_SCOPES.filter((s) => incomplete.includes(s));
  const reasons = asRecord(data.incompleteReasons);
  const messages = asRecord(data.incompleteMessages);
  const incompleteReasons: ExternalDiscoveryResult["incompleteReasons"] = {};
  const incompleteMessages: ExternalDiscoveryResult["incompleteMessages"] = {};
  for (const scope of incompleteScopes) {
    const reason = INCOMPLETE_REASONS.find((r) => r === reasons?.[scope]);
    if (reason) incompleteReasons[scope] = reason;
    const message = messages?.[scope];
    if (typeof message === "string" && message.trim()) incompleteMessages[scope] = message.trim();
  }
  return {
    companies: Array.isArray(data.companies) ? (data.companies as ExternalCandidate[]) : [],
    incompleteScopes,
    incompleteReasons,
    incompleteMessages,
    supportsScopes: reasons !== null,
  };
}

/**
 * Eş zamanlı uç (eski istemciler ve eski API için durur): yanıt arama bitince
 * gelir. Zaman aşımı sunucunun en uzun aramasından bilerek UZUN — ücretli bir
 * aramayı yanıt yoldayken istemcinin kesmesi sonucu boşa harcatır.
 */
async function searchSynchronously(body: ExternalSearchBody): Promise<ExternalDiscoveryResult> {
  const { data } = await companyApi.post<unknown>(EXTERNAL_SEARCH_PATH, body, {
    timeout: 150_000,
    skipErrorToast: true,
  });
  return readExternalResult(data);
}

/**
 * Başlatma ucu bu API'de YOK mu? Bilinmeyen rota Nest'in ham 404'üdür (katalog
 * anahtarı / kod taşımaz); API'nin kendi yazdığı bir 404 "uç yok" sayılmaz.
 */
function isStartRouteMissing(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 404) return false;
  const body = asRecord(err.response.data);
  return typeof body?.i18nKey !== "string" && typeof body?.code !== "string";
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sunucunun KENDİ saatiyle ölçtüğü geçen süre (`elapsedMs`) → aramanın başladığı
 * an, BU tarayıcının saatiyle (yanıtın geldiği an eksi süre). Başlatma ve yoklama
 * yanıtı aynı kuralla okunur; alan yoksa / sayı değilse / eksiyse `null`.
 */
function startedAtFromElapsed(elapsedMs: unknown): number | null {
  return typeof elapsedMs === "number" && Number.isFinite(elapsedMs) && elapsedMs >= 0 ? Date.now() - elapsedMs : null;
}

const externalSearchUrl = (searchId: string) => `${EXTERNAL_SEARCH_PATH}/searches/${encodeURIComponent(searchId)}`;

/**
 * Başlamış aramayı SONUCA KADAR yoklar (`EXTERNAL_SEARCH_POLL_MS`).
 *  - DONE → sonuç; FAILED / 404 / tavan → `ExternalSearchError`.
 *  - Tek bir yoklamanın düşmesi (ağ, 5xx, 429) aramayı DÜŞÜRMEZ: arama sunucuda
 *    sürüyor, ücretli sonucu bir bağlantı kesintisi yüzünden atılmaz — tavana
 *    kadar yoklanır. Diğer 4xx (yetki kalktı…) olduğu gibi çağırana gider.
 *  - Genel hata toast'ı kapalı (`skipErrorToast`): durumu pencere söyler.
 */
async function pollExternalSearch(
  searchId: string,
  since: number,
  shouldStop: (() => boolean) | undefined,
  onStartedAt?: (startedAt: number) => void,
  startAlreadyTold = false,
): Promise<ExternalDiscoveryResult> {
  const url = externalSearchUrl(searchId);
  let startToldOnce = startAlreadyTold;
  for (;;) {
    await wait(EXTERNAL_SEARCH_POLL_MS);
    if (shouldStop?.()) throw new ExternalSearchError("ABANDONED");
    let state: Record<string, unknown> | null = null;
    try {
      const { data } = await companyApi.get<unknown>(url, { skipErrorToast: true, timeout: 20_000 });
      state = asRecord(data);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 404) throw new ExternalSearchError("INTERRUPTED", { statusCode: 404 });
      if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) throw err;
    }
    if (state?.status === "RUNNING" && !startToldOnce && onStartedAt) {
      // Sunucunun ölçtüğü SÜRE, bu tarayıcının saatine çevrilir (yanıtın geldiği an
      // eksi süre). Alanı taşımayan (eski) API'de bildirim yoktur: sayaç eskisi
      // gibi bu sekmenin bildiği andan sürer.
      const startedAt = startedAtFromElapsed(state.elapsedMs);
      if (startedAt !== null) {
        startToldOnce = true;
        onStartedAt(startedAt);
      }
    }
    if (state?.status === "DONE") {
      // Sonuç gövdesi olmayan "bitti" yanıtı boş arama DEĞİLDİR ("bulunamadı" yazdırmaz).
      if (asRecord(state.result) === null) throw new ExternalSearchError("FAILED");
      return readExternalResult(state.result);
    }
    if (state?.status === "FAILED") {
      const error = asRecord(state.error);
      throw new ExternalSearchError("FAILED", {
        statusCode: typeof error?.statusCode === "number" ? error.statusCode : null,
        code: typeof error?.code === "string" && error.code ? error.code : null,
        serverMessage: typeof error?.message === "string" && error.message.trim() ? error.message.trim() : null,
      });
    }
    if (Date.now() - since >= EXTERNAL_SEARCH_MAX_MS) throw new ExternalSearchError("TIMED_OUT");
  }
}

/**
 * Faz B — AI web araması (Google Search grounding; AI bütçesinden).
 *
 * ZAMAN UYUMSUZ (2026-10-09, canlı yeniden doğrulama N1): arama gündüz 70-90 sn
 * sürüyor ve tek HTTP isteğine sığmıyordu (vekilin 100 sn sınırı) — bitmiş
 * ücretli araştırma 503 ile atılıyordu. Artık `POST …/external/start` aramayı
 * sunucuda başlatıp hemen `{ searchId }` döner, sonuç `GET …/external/searches/:id`
 * ile yoklanır (`RUNNING` → `DONE` + sonuç | `FAILED` + hata).
 *
 *  - Arama başlamadan bilinen retler (doğrulama 400, yetki / firma doğrulaması
 *    403, bütçe reddi) başlatma isteğinin KENDİ hatasıdır: axios hatası olarak
 *    gider, çağıran eskisi gibi okur.
 *  - Başlatma ucu yoksa (eski API, 404) arama bir kez eş zamanlı uca düşer ve
 *    `onSyncFallback` çağrılır; çağıran sonraki aramalarda `sync: true` verir.
 *  - Genel hata toast'ı kapalı (`skipErrorToast`): hatayı pencere kendi
 *    gövdesinde, tek mesajla gösterir.
 */
export async function searchExternalSuppliers(
  input: ExternalDiscoveryInput,
  options: ExternalSearchOptions = {},
): Promise<ExternalDiscoveryResult> {
  const body = externalSearchBody(input);
  if (options.sync) return searchSynchronously(body);
  const since = options.since ?? Date.now();
  let searchId: string;
  let startedAt: number | null;
  try {
    // Yanıt hemen gelir; zaman aşımı yine de cömert (uyuyan API ~30 sn'de kalkar):
    // sunucu aramayı başlatmışken istemcinin isteği kesmesi, "Yeniden ara" ile
    // İKİNCİ ücretli aramayı başlatırdı.
    const { data } = await companyApi.post<unknown>(`${EXTERNAL_SEARCH_PATH}/start`, body, {
      timeout: 60_000,
      skipErrorToast: true,
    });
    const started = asRecord(data);
    const id = started?.searchId;
    // Kimliksiz "başladı" yanıtı izlenemez: genel arama hatası.
    if (typeof id !== "string" || !id) throw new ExternalSearchError("FAILED");
    searchId = id;
    // DISC-N2 — süren aramaya KATILAN sekmeye başlatma yanıtı aramanın yaşını söyler.
    startedAt = startedAtFromElapsed(started?.elapsedMs);
  } catch (err) {
    if (!isStartRouteMissing(err)) throw err;
    options.onSyncFallback?.();
    return searchSynchronously(body);
  }
  options.onStarted?.(searchId);
  // Kimlikten SONRA: çağıran başlangıcı kimliğin kaydına da yazar.
  const startTold = startedAt !== null && !!options.onStartedAt;
  if (startedAt !== null) options.onStartedAt?.(startedAt);
  return pollExternalSearch(searchId, since, options.shouldStop, options.onStartedAt, startTold);
}

/**
 * Daha önce başlatılmış aramayı izlemeyi sürdürür (kimlik pencerenin oturumunda
 * saklıdır). Yeni arama BAŞLATMAZ; sonuç / hata `searchExternalSuppliers` ile aynı.
 */
export function resumeExternalSupplierSearch(
  searchId: string,
  options: Pick<ExternalSearchOptions, "since" | "shouldStop" | "onStartedAt"> = {},
): Promise<ExternalDiscoveryResult> {
  return pollExternalSearch(searchId, options.since ?? Date.now(), options.shouldStop, options.onStartedAt);
}

/**
 * BİTMİŞ aramanın sonucunu TEK istekle geri okur (canlı doğrulama AS-1): sunucu
 * biten aramanın sonucunu 15 dakika saklar; sayfa yenilenince pencerenin elinde
 * yalnız kimlik kalır. Yoklama DEĞİLDİR — beklemez, yinelemez, yeni arama başlatmaz.
 *  - DONE + sonuç gövdesi → sonuç;
 *  - kimlik artık bilinmiyor (404), yetki kalktı (diğer 4xx), arama DONE değil ya
 *    da gövdesi yok → `null`: gösterilecek sonuç yok (çağıran boş durumu çizer,
 *    hata kutusu DEĞİL — kullanıcı bir şey başlatmadı);
 *  - yanıt yok / 5xx / 408 / 429 → hata olduğu gibi gider: geçicidir, çağıran
 *    kimliği SAKLAR (sonraki açılış yeniden sorar).
 * Genel hata toast'ı kapalı (`skipErrorToast`).
 */
export async function readFinishedExternalSearch(searchId: string): Promise<ExternalDiscoveryResult | null> {
  let state: Record<string, unknown> | null = null;
  try {
    const { data } = await companyApi.get<unknown>(externalSearchUrl(searchId), { skipErrorToast: true, timeout: 20_000 });
    state = asRecord(data);
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) return null;
    throw err;
  }
  if (state?.status !== "DONE" || asRecord(state.result) === null) return null;
  return readExternalResult(state.result);
}

/**
 * SÜREN ARAMANIN SAYFA YENİLEMEYİ AŞAN KAYDI (gözden geçirme R6-02).
 *
 * Aramanın sunucudaki kimliği yalnız bellekteydi (pencerenin React Query
 * oturumu): sayfa yenilenince / sekme kapatılıp geri açılınca kimlik de onu
 * izleyen döngü de birlikte ölüyor, arama sunucuda sürdüğü ve sonucu 15 dakika
 * saklandığı hâlde istemcinin onu soracak kimliği kalmıyordu — pencere "aranıyor"
 * demiyor, "Web'de Ara" açık duruyor, ikinci tıklama ikinci ücretli aramayı
 * başlatıp ilkinin sonucunu atıyordu.
 *
 * Kimlik sunucudan geldiği AN bağlam başına buraya yazılır; pencere bağlanırken
 * önbellekte süren arama yoksa buradan okur ve aynı aramayı
 * `resumeExternalSupplierSearch` ile izlemeyi sürdürür. Arama SONUÇSUZ bitince
 * silinir (sunucuda düştü, kimlik bilinmiyor, süre doldu).
 *
 * SONUÇLA BİTEN ARAMANIN KAYDI DURUR (canlı doğrulama AS-1): `finished: true`
 * olarak işaretlenir ve süresi dolana, aynı bağlamda yeni arama başlayana ya da
 * sekme / oturum kapanana dek kalır. Eskiden sonuç gelince siliniyordu: sunucu
 * sonucu 15 dakika sakladığı hâlde F5 sonrası pencere boş açılıyor, alıcının
 * önünde yalnız İKİNCİ ücretli arama kalıyordu. Yeniden bağlanan sayfa bitmiş
 * kaydın sonucunu `readFinishedExternalSearch` ile TEK istekle geri okur.
 *  · depo `sessionStorage` — sekmeyle birlikte biter;
 *  · anahtar `quick-request…` ailesindendir (`quick-request-member-invites:<talep>`
 *    gibi): önek `lib/company-auth/tenant-storage.ts` `TENANT_SESSION_PREFIXES`te
 *    KAYITLI → çıkışta ve aynı sekmede başka kullanıcı girince silinir. Anahtar
 *    bu önekle başlamayacak biçimde değiştirilirse önek oraya eklenmelidir
 *    (kayıt kalem adlarını ve bölgeyi taşır — firma verisi);
 *  · okumak SİLMEZ (ikinci yenileme de aynı aramayı bulur); bozuk kayıt,
 *    tanınmayan sürüm ve süresi geçmiş kayıt okunmaz ve silinir;
 *  · depo kapalıysa (gizli sekme) sessizce yok sayılır — arama yenilemeyi aşmaz,
 *    akış çalışır.
 */
export const PENDING_EXTERNAL_SEARCH_KEY = "quick-request-supplier-search";

/** Saklanan biçim değişince ARTIRILIR; tanınmayan sürümün kaydı okunmaz ve silinir. */
export const PENDING_EXTERNAL_SEARCH_VERSION = 1;

/**
 * Kayıt aramanın BAŞLADIĞI andan bu kadar sonra okunmaz: sunucu biten aramanın
 * sonucunu 15 dakika saklar (`ASYNC_SEARCH_LIMITS.keepFinishedMs`) — başlangıçtan
 * saymak güvenli taraftır. Daha eski kimlik sorulmaz (sonuç ya unutulmuştur ya
 * unutulmak üzeredir; kullanıcıya dakikalar sonra "yarıda kesildi" denmez).
 */
export const PENDING_EXTERNAL_SEARCH_KEEP_MS = 15 * 60_000;

/** Süren bir aramayı yeniden bağlanan sayfanın izleyebilmesi için gerekenler. */
export interface PendingExternalSearch {
  /** Aramanın sunucudaki kimliği. */
  searchId: string;
  /** Aramanın başladığı an (ms) — sayaç ve bekleme tavanı buradan sürer. */
  since: number;
  /** `merge`: kısmi sonucun üstüne ekleyen arama. */
  mode: "replace" | "merge";
  /** Yalnız bu geçişler arandı (null = hepsi). */
  scopes: DiscoveryScope[] | null;
  /** Aramaya giden kalem adları — "karşıladığı kalemler" sonuç gelince buna göre çözülür. */
  items: string[];
  /** Aramaya giden bölge metni (alan yeniden açılışta neyin arandığını göstersin). */
  region: string;
  /**
   * Arama SONUÇLA bitti; sonucu sunucuda duruyor (AS-1). Yoksa arama sürüyordur.
   * Yalnız `true` yazılır (alan yoksa kayıt eski biçimle aynıdır — sürüm artmaz).
   */
  finished?: boolean;
}

function parsePendingSearch(raw: unknown, now: number): PendingExternalSearch | null {
  const p = asRecord(raw);
  if (!p) return null;
  const { searchId, since, mode, scopes, items, region, finished } = p;
  if (typeof searchId !== "string" || !searchId) return null;
  if (typeof since !== "number" || !Number.isFinite(since) || now - since >= PENDING_EXTERNAL_SEARCH_KEEP_MS) return null;
  if (mode !== "replace" && mode !== "merge") return null;
  if (scopes !== null && !(Array.isArray(scopes) && scopes.every((s) => DISCOVERY_SCOPES.includes(s as DiscoveryScope)))) {
    return null;
  }
  if (!Array.isArray(items) || !items.every((i) => typeof i === "string")) return null;
  if (typeof region !== "string") return null;
  return {
    searchId,
    since,
    mode,
    scopes: scopes === null ? null : (scopes as DiscoveryScope[]),
    items: items as string[],
    region,
    ...(finished === true ? { finished: true } : {}),
  };
}

/** Depodaki GEÇERLİ kayıtlar (bağlam → arama); bozuk / süresi geçmiş olan düşer. */
function readPendingSearches(now: number): Record<string, PendingExternalSearch> {
  const raw = sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY);
  if (!raw) return {};
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const root = asRecord(parsed);
  const searches = root?.v === PENDING_EXTERNAL_SEARCH_VERSION ? asRecord(root.searches) : null;
  const out: Record<string, PendingExternalSearch> = {};
  for (const [context, value] of Object.entries(searches ?? {})) {
    const search = parsePendingSearch(value, now);
    if (search) out[context] = search;
  }
  return out;
}

/** Depoyu verilen kayıtlara eşitler; `current` (depodaki metin) zaten aynıysa yazmaz. */
function writePendingSearches(searches: Record<string, PendingExternalSearch>, current?: string | null): void {
  if (Object.keys(searches).length === 0) {
    sessionStorage.removeItem(PENDING_EXTERNAL_SEARCH_KEY);
    return;
  }
  const next = JSON.stringify({ v: PENDING_EXTERNAL_SEARCH_VERSION, searches });
  if (next !== current) sessionStorage.setItem(PENDING_EXTERNAL_SEARCH_KEY, next);
}

/** Bağlamın aramasını (süren ya da `finished`) yazar — bağlam başına TEK kayıt; süresi geçmiş kayıtlar bu arada atılır. */
export function savePendingExternalSearch(context: string, search: PendingExternalSearch): void {
  if (!context || !search.searchId) return;
  try {
    writePendingSearches({ ...readPendingSearches(Date.now()), [context]: search });
  } catch {
    // depo kapalı / dolu — arama sayfa yenilemeyi aşmaz, akış çalışır
  }
}

/** Bağlamın aramasını (süren ya da `finished`) okur (silmez). Kayıt yoksa, bozuksa ya da süresi geçtiyse `null`. */
export function readPendingExternalSearch(context: string): PendingExternalSearch | null {
  if (!context) return null;
  try {
    const raw = sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY);
    if (!raw) return null;
    const searches = readPendingSearches(Date.now());
    // Okunamayan / süresi geçen kayıt depoda da kalmaz (bir daha okunmasın).
    writePendingSearches(searches, raw);
    return searches[context] ?? null;
  } catch {
    return null;
  }
}

/** Bağlamın kaydı silinir: arama sonuçsuz bitti ya da saklanan sonuç artık geri okunamıyor. */
export function clearPendingExternalSearch(context: string): void {
  if (!context) return;
  try {
    if (!sessionStorage.getItem(PENDING_EXTERNAL_SEARCH_KEY)) return;
    const searches = readPendingSearches(Date.now());
    delete searches[context];
    writePendingSearches(searches);
  } catch {
    // yok say
  }
}

/**
 * Adres başına GERÇEK sonuç (2026-09-27) — API `ExternalInviteStatus` aynası.
 * Eskiden yalnız SENT/SKIPPED vardı ve SENT gönderimden önce yazılıyordu.
 */
export type ExternalInviteStatus =
  | "QUEUED"
  | "SENT"
  | "FAILED"
  | "SUPPRESSED"
  | "SKIPPED_REGISTERED"
  | "ALREADY_INVITED"
  | "OPTED_OUT"
  | "DAILY_LIMIT"
  | "CONSENT_REQUIRED"
  | "COUNTRY_BLOCKED"
  | "INVALID";

export interface ExternalInviteResult {
  email: string;
  status: ExternalInviteStatus;
  reason?: string;
  /**
   * QUEUED: e-postanın GERÇEKTEN çıkabileceği an (alıcının mesai saati; adres 7
   * günlük frendeyse frenin bittiği pencere) — talep sayfasındaki "E-postayla
   * davet edilenler" bölümünün gösterdiği saatle aynı. Mektup gidemeyecekse yok
   * (`notSentReason`).
   */
  sendAfter?: string;
  /**
   * QUEUED ama mektup talep kapanmadan GİDEMEYECEK: bölümün aynı satır için
   * yazdığı neden kodu (`FREQUENCY`, `PAUSED`, `CLOSES_FIRST` — etiketleri
   * `ai-suppliers/invite-outcome.tsx`). Satır kuyrukta kalır (adres davetlidir,
   * yeniden gönderilemez); ekranda "sıraya alındı" DENMEZ.
   */
  notSentReason?: string;
}


/**
 * Dış davet alıcısı (2026-09-27): adres + davet e-postasının DİLİ (satırdaki
 * seçici; varsayılanı `recipientLocale` — ülke → uzantı → arayüz dili) +
 * AI keşfinin bulduğu ülke. Keşif modalı → hızlı talep taslağı → yayın
 * paneli → API boyunca aynı nesne taşınır.
 */
export interface ExternalInviteTarget {
  email: string;
  locale: Locale;
  country?: string | null;
}

/**
 * Talebin e-posta davetleri listesinin sorgu anahtarı ÖNEKİ (talep sayfası bu
 * önekle başlayan anahtarla okur). Davet gönderimi başarılı olunca düşürülür:
 * pencerede gönderilen davet sayfadaki listede hemen görünsün.
 */
export const LISTING_EMAIL_INVITES_KEY = ["company", "listing-email-invites"] as const;

/**
 * Davet gönderen mutasyonların çağıran başına seçeneği (canlı doğrulama AS-2).
 * `skipErrorToast`: hatayı çağıran KENDİ metniyle tek toast olarak söyler —
 * `companyApi`nin genel hata toast'ı ("Sunucu hatası…") basılmaz. Vermeyen
 * çağıran (hızlı talep yayını, bekleyen davetler) eskisi gibi genel toast'a
 * güvenir.
 */
export interface InviteMutationOptions {
  skipErrorToast?: boolean;
}

/** Faz C — dış davet e-postası (limitli; frenler backend'de). */
export function useExternalTenderInvite(options: InviteMutationOptions = {}) {
  const skipErrorToast = options.skipErrorToast === true;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      listingId: string;
      invites: ExternalInviteTarget[];
      /** Adres elle mi yazıldı yoksa AI keşfinden mi (kuyruk kuralları farklı). */
      source?: "MANUAL" | "AI_FORM" | "AI_AUTO";
    }) => {
      // Davetler KUYRUĞA alınır (2026-09-27): yanıt hızlıdır, e-postalar
      // alıcının ülkesinde mesai saatinde gider.
      const { data } = await companyApi.post<{ results: ExternalInviteResult[] }>(
        "/company/connections/external-tender-invite",
        {
          listingId: input.listingId,
          invites: input.invites.map((i) => ({
            email: i.email,
            locale: i.locale,
            ...(i.country ? { country: i.country } : {}),
          })),
          ...(input.source ? { source: input.source } : {}),
        },
        { timeout: 60_000, ...(skipErrorToast ? { skipErrorToast } : {}) },
      );
      return data.results;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LISTING_EMAIL_INVITES_KEY });
    },
  });
}

/** Faz A — dizinden kategori-eşleşmeli, bağlantısız tedarikçi adayları. */
export function useSupplierDiscovery() {
  return useMutation({
    mutationFn: async (input: {
      type: "ALIM";
      categoryIds?: string[];
      /** Vitrindeki ürünlerde kalem adıyla da aranır (2026-09-27). */
      itemNames?: string[];
      listingId?: string;
      targetCountries?: string[];
    }) => {
      const { data } = await companyApi.post<{ candidates: DiscoveryCandidate[] }>(
        "/company/ai/supplier-discovery",
        input,
      );
      return data.candidates;
    },
  });
}

/** Kayıtlı talebin AI keşif turu adayı (yayın sonrası otomatik arama + davet). */
export interface RunCandidate extends Omit<ExternalCandidate, "status"> {
  id: string;
  /** Ham durum (`CandidateStatus`); davet aşamasından sonra neden kodu da taşıyabilir (DAILY_LIMIT…). */
  status: string;
  reason: string;
  /** Davet sonucu — ekranın okuduğu alan (eski API yanıtında yok). */
  invite?: CandidateInviteState;
  /** NOT_SENT nedeni (DAILY_LIMIT, CONSENT_REQUIRED, OPTED_OUT, ALLOWLIST…); yoksa null. */
  inviteReason?: string | null;
  /** QUEUED: e-postanın en erken gideceği an (ISO). */
  sendAfter?: string | null;
  /** Üyenin eşleştiği kategori adları (gerekçe). */
  matchedCategories?: string[];
  /** PLATFORM (üye dizini) | WEB (web araması) | BOTH. */
  source?: "PLATFORM" | "WEB" | "BOTH" | null;
}

export interface DiscoveryRun {
  id: string;
  trigger: "FORM" | "PUBLISH" | "SECOND_ROUND" | "MANUAL";
  state: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  createdAt: string;
  finishedAt: string | null;
  dismissedAt: string | null;
  candidates: RunCandidate[];
}

export interface ListingDiscovery {
  aiDiscovery: boolean;
  listingStatus: string;
  /** Embargolu talebin açılış anı (ISO) — tur açılışta yazılır; açıksa/eski API'de yok. */
  startsAt?: string | null;
  runs: DiscoveryRun[];
}

/**
 * Tur henüz yazılmamışken (yayın/düzenleme anı) yoklama TAVANI: 5 sn × 36 ≈ 3 dk.
 * Tur normalde saniyeler içinde yazılır; tavan, hiç gelmeyecek tur için sekmenin
 * süresiz yoklamasını keser (derin denetim 2026-09-29 S090).
 */
export const EMPTY_RUN_POLL_MAX = 36;

/** Tur bekleniyor mu (otomatik arama açık, talep açık, embargo yok, tur yok)? */
export function awaitingFirstRun(d: ListingDiscovery): boolean {
  return d.aiDiscovery && d.runs.length === 0 && d.listingStatus === "OPEN" && !d.startsAt;
}

const listingDiscoveryKey = (listingId: string) => ["listing-discovery", listingId] as const;

/**
 * Yayın sonrası AI keşfinin DURUMU (2026-09-27, Faz 1; 2026-10-08: tur
 * bulduğunu kendisi davet eder) — tur sürerken 5 sn'de bir yoklanır (web
 * araması ~1 dk), bitince durur.
 */
export function useListingDiscovery(listingId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: listingDiscoveryKey(listingId ?? ""),
    enabled: !!listingId && enabled,
    queryFn: async () => {
      const { data } = await companyApi.get<ListingDiscovery>(`/company/ai/supplier-discovery/listings/${listingId}`);
      return data;
    },
    // Tur sürerken ya da yayın anındaki tur henüz yazılmamışken (otomatik
    // arama açık, talep açık, embargo yok) 5 sn'de bir yoklanır — ikincisi
    // `EMPTY_RUN_POLL_MAX` tavanlı; embargoda yoklanmaz; arka plandaki sekmede durur.
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      if (d.runs.some((r) => r.state === "PENDING" || r.state === "RUNNING")) return 5_000;
      return awaitingFirstRun(d) && q.state.dataUpdateCount < EMPTY_RUN_POLL_MAX ? 5_000 : false;
    },
  });
  // Tavan doldu ve tur hâlâ yok → ekran "aranıyor" demeyi bırakır.
  const updates = qc.getQueryState(listingDiscoveryKey(listingId ?? ""))?.dataUpdateCount ?? 0;
  const emptyPollExhausted = !!query.data && awaitingFirstRun(query.data) && updates >= EMPTY_RUN_POLL_MAX;
  // Sonuç nesnesi YAYILMAZ: TanStack izleme vekilinde `promise` okunursa
  // (experimental_prefetchInRender kapalı) bekleyen thenable reddedilir.
  // `dataUpdatedAt` okunur ki veri aynı kalsa da her yoklamada yeniden çizilsin
  // (tavan dolduğu an görünsün).
  return {
    data: query.data,
    dataUpdatedAt: query.dataUpdatedAt,
    isLoading: query.isLoading,
    isError: query.isError,
    emptyPollExhausted,
  };
}

/** Üyeye doğrudan talep daveti sonucu (API `inviteDiscoveredMembers`). */
export type MemberInviteStatus = "INVITED" | "ALREADY_INVITED" | "DAILY_LIMIT" | "NOT_ELIGIBLE";
export interface MemberInviteResult {
  companyId: string;
  status: MemberInviteStatus;
}

/** Formda seçilen üye — yayında talebe doğrudan davet edilir. */
export interface MemberInviteTarget {
  companyId: string;
  name: string;
}

/**
 * AI'ın bulduğu ROTHERN ÜYELERİNİ doğrudan talebe davet (2026-09-28; bağlantı
 * şartı yok, günlük tavan e-posta davetleriyle ortak). "AI ile tedarikçi bul"
 * penceresi ve (eski taslaktan kalan seçimler için) form yayını kullanır.
 */
export function useInviteDiscoveredMembers(options: InviteMutationOptions = {}) {
  const skipErrorToast = options.skipErrorToast === true;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { listingId: string; companyIds: string[] }) => {
      const url = `/company/ai/supplier-discovery/listings/${input.listingId}/invite-members`;
      const body = { companyIds: input.companyIds.slice(0, 60) };
      // Seçenek verilmediyse istek ayarı HİÇ geçmez (öteki çağıranların isteği aynen kalır).
      const { data } = skipErrorToast
        ? await companyApi.post<{ results: MemberInviteResult[] }>(url, body, { skipErrorToast })
        : await companyApi.post<{ results: MemberInviteResult[] }>(url, body);
      return data.results;
    },
    onSuccess: (_d, input) => {
      void qc.invalidateQueries({ queryKey: listingDiscoveryKey(input.listingId) });
      void qc.invalidateQueries({ queryKey: ["company-listings", "detail", input.listingId] });
    },
  });
}

export function useDismissListingDiscovery(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await companyApi.post(`/company/ai/supplier-discovery/listings/${listingId}/dismiss`, {});
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: listingDiscoveryKey(listingId) }),
  });
}
