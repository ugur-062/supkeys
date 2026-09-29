"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/catalyst/badge";

/** Teklif kaleminin muadil beyanı (ListingBidItemRow'un ilgili alt kümesi). */
export interface AlternativeBidItem {
  isAlternative?: boolean;
  offeredBrand?: string | null;
  offeredMpn?: string | null;
}

/** Alıcının kalemde istediği marka/parça no (ListingItemRow alt kümesi). */
export interface AlternativeRequestedItem {
  brand?: string | null;
  mpn?: string | null;
}

const joinParts = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" · ");

/**
 * Faz 3 — tedarikçinin MUADİL beyanını ALICIYA gösterir (derin denetim Y-16).
 * API sahip dalında `isAlternative/offeredBrand/offeredMpn` döndürüyordu ama
 * web hiçbir alıcı ekranında çizmiyordu → alıcı istediği markanın teklif
 * edildiğini sanıp kazandırabiliyordu. Tek kaynak: teklif detayı kalem
 * tablosu + ilan detayı kalem karşılaştırması.
 *
 * `compact`: karşılaştırma hücresi — rozet + tek satır teklif edilen (dar
 * sütun, ayrıntı `title`da); tam görünümde istenen marka da yazılır.
 */
export function AlternativeOfferNote({
  bidItem,
  item,
  compact = false,
}: {
  bidItem?: AlternativeBidItem | null;
  item?: AlternativeRequestedItem | null;
  compact?: boolean;
}) {
  const t = useTranslations("web.panel.requests.page");
  if (!bidItem?.isAlternative) return null;
  const offered = joinParts(bidItem.offeredBrand, bidItem.offeredMpn);
  const requested = joinParts(item?.brand, item?.mpn);
  const offeredText = offered
    ? t("muadilTeklifEdilen", { value: offered })
    : t("muadilMarkaBelirtilmedi");
  return (
    <span
      className="mt-1 block text-xs text-amber-800"
      data-testid="alternative-offer"
    >
      <Badge color="amber" title={t("muadilRozetAciklama")}>
        {t("muadilRozet")}
      </Badge>
      <span
        className={
          compact
            ? "ml-1 inline-block max-w-[12rem] truncate align-middle font-medium"
            : "ml-1.5 font-medium"
        }
        title={compact ? offeredText : undefined}
      >
        {offeredText}
      </span>
      {!compact && requested ? (
        <span className="block text-zinc-500">
          {t("istenen", { join: requested })}
        </span>
      ) : null}
    </span>
  );
}
