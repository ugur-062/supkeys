/**
 * İlan + teklif durumunun SATICI perspektifinden "etkin durum" ANAHTARINA
 * dönüşümü (eski tedarikçi paneli deriveSupplierTenderState portu, birleşik
 * Listing/ListingBid durumlarına uyarlandı).
 *
 * i18n Faz 2: metin katalogda (`web.domain.sellerState.<anahtar>`), çizim
 * `useSellerStateLabel()`; burada yalnız anahtar + rozet sınıfı üretilir.
 * Aşağıdaki karşılıklar okuma kolaylığı içindir (kaynak: katalog).
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

import { calendarDaysBetween } from "@/lib/time-zone";
export interface SellerTenderState {
  /** Katalog anahtarı (`web.domain.sellerState.*`) — metni `useSellerStateLabel()(key)` basar. */
  key: string;
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
    return { key: "cancelled", className: NEUTRAL, tone: "neutral" };
  }
  if (bidStatus === "WON") {
    return {
      key: "won",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      tone: "win",
    };
  }
  if (bidStatus === "AWARDED_PARTIAL") {
    return {
      key: "wonPartial",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
      tone: "win",
    };
  }
  if (bidStatus === "LOST") {
    return {
      key: "lost",
      className: "bg-rose-50 text-rose-700 border-rose-200",
      tone: "lose",
    };
  }
  if (bidStatus === "WITHDRAWN") {
    return { key: "withdrawn", className: NEUTRAL, tone: "neutral" };
  }
  if (listingStatus === "OPEN") {
    if (bidStatus === "DRAFT") {
      return {
        key: "draftMine",
        className: "bg-amber-50 text-amber-700 border-amber-200",
        tone: "warn",
      };
    }
    if (bidStatus === "SUBMITTED") {
      return {
        key: "submitted",
        className: "bg-violet-50 text-violet-700 border-violet-200",
        tone: "active",
      };
    }
    if (invited) {
      return {
        key: "invited",
        className: "bg-blue-50 text-blue-700 border-blue-200",
        tone: "info",
      };
    }
    return {
      key: "open",
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
          key: "evaluating",
          className: "bg-indigo-50 text-indigo-700 border-indigo-200",
          tone: "active",
        };
      }
      return {
        key: "awaitingResult",
        className: "bg-zinc-100 text-zinc-600 border-zinc-200",
        tone: "info",
      };
    }
    return {
      key: bidStatus === "DRAFT" ? "closedDraftNotSent" : "closed",
      className: NEUTRAL,
      tone: "neutral",
    };
  }
  // AWARDED / CLOSED_NO_AWARD (teklifsiz veya sonuçsuz)
  return {
    key: bidStatus ? "closed" : "closedNoBid",
    className: NEUTRAL,
    tone: "neutral",
  };
}

/** Kapanışa kalan tam gün (negatif = geçti). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  // C11: TAKVİM günü farkı — Math.ceil saat-bazlı fark yüzünden hep +1
  // gösteriyordu (16 Ağu → 20 Ağu "5 gün" değil 4 gün).
  // Gün ÜRÜN SAAT DİLİMİNDE sayılır (2026-09-22): yerel saatle sunucu (UTC)
  // ve Türkiye'deki tarayıcı gece 00:00–03:00 arasında farklı gün görüyor,
  // "3 gün kaldı"/"2 gün kaldı" hidrasyon #418 üretiyordu.
  return calendarDaysBetween(new Date(), new Date(iso));
}

/**
 * Aciliyet RENGİ — eski kart footer davranışı. Metin katalogdan gelir
 * (`web.domain.closing.*`); tek okuma yolu `@/i18n/domain` `useClosingUrgency`,
 * eşikler burada kalır ki renk ve metin ayrışmasın.
 */
export function closingUrgency(
  listingStatus: string,
  closesAt: string | null,
): { className: string } | null {
  const days = daysUntil(closesAt);
  if (listingStatus !== "OPEN" || days === null) return null;
  /* amber-600 (#e17100) beyaz zeminde 3,20:1 — AA sınırı 4,5. axe bunu
     `/alim-talepleri` taramasında yakaladı; amber-700 5,03:1 ile geçiyor.
     rose-600 (4,53) ve zinc-500 (4,83) zaten sınırın üstünde. */
  const className =
    days <= 1 ? "text-rose-600" : days <= 3 ? "text-amber-700" : "text-zinc-500";
  return { className };
}
