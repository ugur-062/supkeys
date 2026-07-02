/**
 * İlan + teklif durumunun SATICI perspektifinden okunabilir "etkin durum"
 * etiketine dönüşümü (eski tedarikçi paneli deriveSupplierTenderState portu,
 * birleşik Listing/ListingBid durumlarına uyarlandı).
 *
 *   OPEN + teklif yok + davetli   → "Davet Edildi"
 *   OPEN + teklif yok + davetsiz  → "Teklife Açık"
 *   OPEN + DRAFT                  → "Taslak Teklifim"
 *   OPEN + SUBMITTED              → "Teklif Gönderildi"
 *   CLOSED / IN_AWARD*            → "Değerlendiriliyor"
 *   WON                           → "Kazandın"
 *   AWARDED_PARTIAL               → "Kısmen Kazandın"
 *   LOST                          → "Kaybettin"
 *   WITHDRAWN                     → "Geri Çekildi"
 *   AWARDED/CLOSED_NO_AWARD + teklifsiz → "Kapandı"
 *   CANCELLED                     → "İptal Edildi"
 */
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
      label: "Kazandın",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      tone: "win",
    };
  }
  if (bidStatus === "AWARDED_PARTIAL") {
    return {
      label: "Kısmen Kazandın",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      tone: "win",
    };
  }
  if (bidStatus === "LOST") {
    return {
      label: "Kaybettin",
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
    return {
      label: "Değerlendiriliyor",
      className: "bg-indigo-50 text-indigo-700 border-indigo-200",
      tone: "active",
    };
  }
  // AWARDED / CLOSED_NO_AWARD (teklifsiz veya sonuçsuz)
  return {
    label: bidStatus ? "Kapandı" : "Kapandı (teklif vermedin)",
    className: NEUTRAL,
    tone: "neutral",
  };
}

/** Kapanışa kalan tam gün (negatif = geçti). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
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
