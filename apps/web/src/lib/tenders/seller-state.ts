/**
 * İlan + teklif durumunun SATICI perspektifinden okunabilir "etkin durum"
 * etiketine dönüşümü (eski tedarikçi paneli deriveSupplierTenderState portu,
 * birleşik Listing/ListingBid durumlarına uyarlandı).
 *
 *   OPEN + teklif yok + davetli   → "Davet Edildi"
 *   OPEN + teklif yok + davetsiz  → "Teklife Açık"
 *   OPEN + DRAFT                  → "Taslak Teklifim"
 *   OPEN + SUBMITTED              → "Teklif Gönderildi"
 *   IN_AWARD* + SUBMITTED         → "Değerlendiriliyor" (kapanan ihale
 *                                    doğrudan değerlendirmededir)
 *   CLOSED + SUBMITTED            → "Sonuç Bekleniyor" (CLOSED artık yalnız
 *                                    admin moderasyon kapatması, 2026-07-13)
 *   WON                           → "Kazandınız"
 *   AWARDED_PARTIAL               → "Kısmen Kazandınız"
 *   LOST                          → "Kaybettiniz"
 *   WITHDRAWN                     → "Geri Çekildi"
 *   AWARDED/CLOSED_NO_AWARD + teklifsiz → "Kapandı"
 *   CANCELLED                     → "İptal Edildi"
 */

import { differenceInCalendarDays } from "date-fns";
export interface SellerTenderState {
  label: string;
  className: string;
  tone: "neutral" | "info" | "active" | "win" | "lose" | "warn";
}

const NEUTRAL = "bg-zinc-100 text-zinc-600 border-zinc-200";

export function deriveSellerTenderState(
  listingStatus: string,
  bidStatus: string | null | undefined,
  invited: boolean,
): SellerTenderState {
  if (listingStatus === "CANCELLED") {
    return { label: "İptal Edildi", className: NEUTRAL, tone: "neutral" };
  }
  if (bidStatus === "WON") {
    return {
      label: "Kazandınız",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      tone: "win",
    };
  }
  if (bidStatus === "AWARDED_PARTIAL") {
    return {
      label: "Kısmen Kazandınız",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      tone: "win",
    };
  }
  if (bidStatus === "LOST") {
    return {
      label: "Kaybettiniz",
      className: "bg-rose-50 text-rose-700 border-rose-200",
      tone: "lose",
    };
  }
  if (bidStatus === "WITHDRAWN") {
    return { label: "Geri Çekildi", className: NEUTRAL, tone: "neutral" };
  }
  if (listingStatus === "OPEN") {
    if (bidStatus === "DRAFT") {
      return {
        label: "Taslak Teklifim",
        className: "bg-amber-50 text-amber-700 border-amber-200",
        tone: "warn",
      };
    }
    if (bidStatus === "SUBMITTED") {
      return {
        label: "Teklif Gönderildi",
        className: "bg-violet-50 text-violet-700 border-violet-200",
        tone: "active",
      };
    }
    if (invited) {
      return {
        label: "Davet Edildi",
        className: "bg-blue-50 text-blue-700 border-blue-200",
        tone: "info",
      };
    }
    return {
      label: "Teklife Açık",
      className: "bg-blue-50 text-blue-700 border-blue-200",
      tone: "info",
    };
  }
  if (
    listingStatus === "CLOSED" ||
    listingStatus === "IN_AWARD" ||
    listingStatus === "IN_AWARD_APPROVAL"
  ) {
    // Kapanan ihale doğrudan değerlendirmededir (IN_AWARD*); CLOSED yalnız
    // admin moderasyon kapatmasında görülür ve nötr "Sonuç Bekleniyor" gösterir.
    // Yalnız GÖNDERİLMİŞ teklif değerlendirmededir; gönderilmemiş taslak
    // (veya teklifsiz) kapanmış ihale "kaçırıldı" durumudur.
    if (bidStatus === "SUBMITTED") {
      if (listingStatus !== "CLOSED") {
        return {
          label: "Değerlendiriliyor",
          className: "bg-indigo-50 text-indigo-700 border-indigo-200",
          tone: "active",
        };
      }
      return {
        label: "Sonuç Bekleniyor",
        className: "bg-zinc-100 text-zinc-600 border-zinc-200",
        tone: "info",
      };
    }
    return {
      label: bidStatus === "DRAFT" ? "Kapandı (taslak gönderilmedi)" : "Kapandı",
      className: NEUTRAL,
      tone: "neutral",
    };
  }
  // AWARDED / CLOSED_NO_AWARD (teklifsiz veya sonuçsuz)
  return {
    label: bidStatus ? "Kapandı" : "Kapandı (teklif vermediniz)",
    className: NEUTRAL,
    tone: "neutral",
  };
}

/** Kapanışa kalan tam gün (negatif = geçti). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  // C11: TAKVİM günü farkı — Math.ceil saat-bazlı fark yüzünden hep +1
  // gösteriyordu (16 Ağu → 20 Ağu "5 gün" değil 4 gün).
  return differenceInCalendarDays(new Date(iso), new Date());
}

/** Aciliyet metni + rengi — eski kart footer davranışı. */
export function closingUrgency(
  listingStatus: string,
  closesAt: string | null,
): { text: string; className: string } | null {
  const days = daysUntil(closesAt);
  if (listingStatus !== "OPEN" || days === null) return null;
  const className =
    days <= 1 ? "text-rose-600" : days <= 3 ? "text-amber-600" : "text-zinc-500";
  const text =
    days > 0 ? `${days} gün kaldı` : days === 0 ? "Bugün biter" : "Süre doldu";
  return { text, className };
}
