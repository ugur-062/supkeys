"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { Locale } from "@rothern/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

/**
 * Faz B — AI web araması (Google Search grounding; AI bütçesinden).
 *
 * - `skipErrorToast`: hatayı pencere kendi gövdesinde, tek mesajla gösterir;
 *   genel istemcinin 5xx / ağ hatası toast'ı ikinci mesaj olurdu.
 * - Zaman aşımı sunucunun en uzun aramasından bilerek UZUN: ücretli bir
 *   aramayı yanıt yoldayken istemcinin kesmesi sonucu boşa harcatır.
 * - `scopes` gövdeye yalnız geçerli ve dolu ise girer (boş dizi sunucuda
 *   "bütün geçişler" demektir; eski API ise alanın kendisini reddeder).
 */
export function useExternalSupplierDiscovery() {
  return useMutation({
    mutationFn: async (input: ExternalDiscoveryInput): Promise<ExternalDiscoveryResult> => {
      const { scopes, ...rest } = input;
      const wanted = DISCOVERY_SCOPES.filter((s) => scopes?.includes(s));
      const { data } = await companyApi.post<{
        companies?: ExternalCandidate[];
        incompleteScopes?: DiscoveryScope[];
        incompleteReasons?: unknown;
        incompleteMessages?: unknown;
      }>("/company/ai/supplier-discovery/external", wanted.length > 0 ? { ...rest, scopes: wanted } : rest, {
        timeout: 150_000,
        skipErrorToast: true,
      });
      const incomplete = Array.isArray(data.incompleteScopes) ? data.incompleteScopes : [];
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
        companies: Array.isArray(data.companies) ? data.companies : [],
        incompleteScopes,
        incompleteReasons,
        incompleteMessages,
        supportsScopes: reasons !== null,
      };
    },
  });
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
  /** QUEUED: e-postanın en erken gideceği an (alıcının mesai saati). */
  sendAfter?: string;
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

/** Faz C — dış davet e-postası (limitli; frenler backend'de). */
export function useExternalTenderInvite() {
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
        { timeout: 60_000 },
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
export function useInviteDiscoveredMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { listingId: string; companyIds: string[] }) => {
      const { data } = await companyApi.post<{ results: MemberInviteResult[] }>(
        `/company/ai/supplier-discovery/listings/${input.listingId}/invite-members`,
        { companyIds: input.companyIds.slice(0, 60) },
      );
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
