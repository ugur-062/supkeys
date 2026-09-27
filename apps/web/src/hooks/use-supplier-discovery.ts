"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { Locale } from "@rothern/i18n";
import { useMutation } from "@tanstack/react-query";

export interface DiscoveryCandidate {
  companyId: string;
  name: string;
  city: string | null;
  rothernId: string | null;
  matchedCategories: string[];
  strongMatch: boolean;
  connectionStatus: "NONE" | "PENDING";
}

export interface ExternalCandidate {
  name: string;
  city: string | null;
  /** Firmanın ülkesi (ISO-2) — AI web araması bulduysa; davet dilinin varsayılanı buradan. */
  country?: string | null;
  website: string | null;
  email: string | null;
  reason: string;
}

/** Faz B — AI web araması (Google Search grounding; AI bütçesinden). */
export function useExternalSupplierDiscovery() {
  return useMutation({
    mutationFn: async (input: {
      type: "ALIM";
      categoryIds: string[];
      itemNames?: string[];
      region?: string;
      /** Kayıtlı talep — arama konumu talebin görünürlük ülkelerinden (sunucu okur). */
      listingId?: string;
      /** Yayın öncesi form — görünürlük ülkeleri (boş = tüm ülkeler). */
      targetCountries?: string[];
    }) => {
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
  | "SENT"
  | "FAILED"
  | "SUPPRESSED"
  | "SKIPPED_REGISTERED"
  | "ALREADY_INVITED"
  | "OPTED_OUT"
  | "DAILY_LIMIT"
  | "INVALID";

export interface ExternalInviteResult {
  email: string;
  status: ExternalInviteStatus;
  reason?: string;
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
    mutationFn: async (input: { listingId: string; invites: ExternalInviteTarget[] }) => {
      // Gönderim artık BEKLENİR (adres başına gerçek sonuç) ve talep çevirisi
      // alıcının dilinde hazır değilse sunucu ~60 sn bekler — 20 adreste
      // varsayılan 45 sn yetmez.
      const { data } = await companyApi.post<{ results: ExternalInviteResult[] }>(
        "/company/connections/external-tender-invite",
        {
          listingId: input.listingId,
          invites: input.invites.map((i) => ({
            email: i.email,
            locale: i.locale,
            ...(i.country ? { country: i.country } : {}),
          })),
        },
        { timeout: 180_000 },
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
      categoryIds: string[];
    }) => {
      const { data } = await companyApi.post<{ candidates: DiscoveryCandidate[] }>(
        "/company/ai/supplier-discovery",
        input,
      );
      return data.candidates;
    },
  });
}
