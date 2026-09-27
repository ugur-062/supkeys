"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { Locale } from "@rothern/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface DiscoveryCandidate {
  companyId: string;
  name: string;
  city: string | null;
  rothernId: string | null;
  matchedCategories: string[];
  strongMatch: boolean;
  /** Vitrindeki ürünü kalem adıyla eşleşen kalemler (1'den sıra no). */
  matchedItems?: number[];
  connectionStatus: "NONE" | "PENDING";
}

/**
 * Aday durumu (API `CandidateStatus`, 2026-09-27): listede hepsi seçili gelir,
 * bunlar HARİÇ — zaten davetli, kayıtlı üye (platform yolu), önceden onay
 * isteyen ülke (AI'ın bulduğu adrese davet gitmez). INVITED yalnız kayıtlı
 * talep turlarında (bu ekrandan davet edildi).
 */
export type CandidateStatus = "SUGGESTED" | "ALREADY_INVITED" | "MEMBER" | "CONSENT_REQUIRED" | "INVITED";

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
}

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
}

/** Faz B — AI web araması (Google Search grounding; AI bütçesinden). */
export function useExternalSupplierDiscovery() {
  return useMutation({
    mutationFn: async (input: ExternalDiscoveryInput) => {
      const { data } = await companyApi.post<{ companies: ExternalCandidate[] }>(
        "/company/ai/supplier-discovery/external",
        input,
        { timeout: 120_000 },
      );
      return data.companies;
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

/** Faz C — dış davet e-postası (limitli; frenler backend'de). */
export function useExternalTenderInvite() {
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

/** Kayıtlı talebin AI keşif turu adayı (yayın sonrası otomatik arama). */
export interface RunCandidate extends ExternalCandidate {
  id: string;
  status: CandidateStatus;
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
  runs: DiscoveryRun[];
}

const listingDiscoveryKey = (listingId: string) => ["listing-discovery", listingId] as const;

/**
 * Yayın sonrası AI önerileri (2026-09-27, Faz 1) — tur sürerken 5 sn'de bir
 * yoklanır (web araması ~1 dk), bitince durur.
 */
export function useListingDiscovery(listingId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: listingDiscoveryKey(listingId ?? ""),
    enabled: !!listingId && enabled,
    queryFn: async () => {
      const { data } = await companyApi.get<ListingDiscovery>(`/company/ai/supplier-discovery/listings/${listingId}`);
      return data;
    },
    // Tur sürerken ya da yayın anındaki tur henüz yazılmamışken (otomatik
    // arama açık, talep açık) 5 sn'de bir yoklanır; arka plandaki sekmede durur.
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      if (d.runs.some((r) => r.state === "PENDING" || r.state === "RUNNING")) return 5_000;
      return d.aiDiscovery && d.runs.length === 0 && d.listingStatus === "OPEN" ? 5_000 : false;
    },
  });
}

export function useInviteDiscoveryCandidates(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidateIds: string[]) => {
      const { data } = await companyApi.post<{ results: ExternalInviteResult[] }>(
        `/company/ai/supplier-discovery/listings/${listingId}/invite`,
        { candidateIds },
      );
      return data.results;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: listingDiscoveryKey(listingId) }),
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
