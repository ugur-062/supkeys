"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

/**
 * TALEBE E-POSTAYLA DAVET EDİLENLER (2026-10-09, canlı doğrulama D3 / AI-UI-1).
 *
 * Kayıtsız adrese giden talep davetleri (`external_listing_invites`) eskiden
 * alıcıya yalnız otomatik turun durum bandında görünüyordu: elle pencereden
 * yapılan davet hiçbir yerde, "Gizle" denmiş turun davetleri de bir daha
 * görünmüyordu. Bu uç talebin TÜM e-posta davetlerini (elle + AI) verir.
 *
 * `invite` / `reason` sözlüğü API `candidateInvite()` ile AYNI (durum bandıyla
 * tek etiket kaynağı: `components/tenders/ai-suppliers/invite-outcome.tsx`):
 * INVITED = e-posta gönderildi · QUEUED + `sendAfter` · NOT_SENT + neden kodu.
 */
export type ListingEmailInviteSource = "MANUAL" | "AI_FORM" | "AI_AUTO";
export type ListingEmailInviteState = "INVITED" | "QUEUED" | "NOT_SENT";

export interface ListingEmailInvite {
  id: string;
  email: string;
  /** Adresin firma adı (talebin keşif adaylarından biliniyorsa), yoksa null. */
  name: string | null;
  /** ISO-2; bilinmiyorsa null. */
  country: string | null;
  locale: string;
  source: ListingEmailInviteSource;
  invite: ListingEmailInviteState;
  /** NOT_SENT nedeni (FREQUENCY, PAUSED, OPTED_OUT, REGISTERED, LISTING_CLOSED, ALLOWLIST, CANCELLED, FAILED…). */
  reason: string | null;
  /** QUEUED: planlanan gönderim anı (ISO). */
  sendAfter: string | null;
  sentAt: string | null;
  createdAt: string;
}

/** Web sorgu anahtarı — davet gönderen her yol bunu tazeler. */
export const listingEmailInvitesKey = (listingId: string) => ["company", "listing-email-invites", listingId] as const;

/**
 * Sırada bekleyen davet varken durum kendiliğinden değişir (dağıtıcı dakikada
 * bir çalışır) → dakikada bir yoklanır; bekleyen yoksa yoklama durur.
 */
export const QUEUED_POLL_MS = 60_000;
export function emailInvitesPollMs(items: ReadonlyArray<Pick<ListingEmailInvite, "invite">> | undefined): number | false {
  return items?.some((i) => i.invite === "QUEUED") ? QUEUED_POLL_MS : false;
}

export function useListingEmailInvites(listingId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: listingEmailInvitesKey(listingId ?? ""),
    enabled: !!listingId && enabled,
    queryFn: async () => {
      const { data } = await companyApi.get<{ items: ListingEmailInvite[] }>(
        "/company/connections/external-tender-invites",
        // Hata bölümün kendi satırında gösterilir (çift toast olmasın).
        { params: { listingId }, skipErrorToast: true },
      );
      // En yeni önce gelir (sunucu sırası korunur).
      return Array.isArray(data?.items) ? data.items : [];
    },
    // Sayfa her açılışta ve sekmeye dönüşte güncel durumu okur (sırada → gönderildi).
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => emailInvitesPollMs(q.state.data),
  });
}
