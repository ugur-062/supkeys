"use client";

import { ListingCard, type ListingCardData } from "@/components/marketplace/listing-card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format-date";
import { listingHref, publicState } from "@/lib/public/marketplace";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import { signupHref } from "@/lib/public/visibility";
import { daysUntil } from "@/lib/tenders/seller-state";
import { useActivityLabel, useCityLabel, useClosingUrgency, useUnitLabel } from "@/i18n/domain";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ScopeChip } from "@/components/tenders/scope-chip";

const STATE_CLASS: Record<ReturnType<typeof publicState>, string> = {
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
  evaluating: "border-amber-200 bg-amber-50 text-amber-700",
  closed: "border-slate-200 bg-slate-50 text-slate-600",
};

/**
 * ALIM TALEBİ TEASER SATIRI — herkese açık anasayfa (2026-09-10, kullanıcı
 * kararı: "fotoğraf/ikon olmasın, alt alta, giriş yaptıktan sonraki satış
 * anasayfası gibi"). Satış panelindeki `BrowseTenderRow` ile AYNI kart
 * (`ListingCard variant="row"`, kind "talep" → asla görsel) ve aynı sütun
 * kümesi: Alıcı · Kalem · Kapsam · Kapanış · Kategori; sağda "Teklif ver".
 *
 * Kapalı zarf kuralı KORUNUR: alıcı adı, kalem adları, hedef fiyat YOK —
 * Alıcı sütunu yalnız faaliyet tipi · şehir + doğrulama rozeti. Panele özgü
 * uygunluk rozetleri (davet/bağlantı/eşleşme) ve genişletme paneli anonimde
 * hesaplanamaz, çizilmez. Teaser KARTI (`ListingTeaserCard`) dizin ve
 * ilan detayında yaşamaya devam eder.
 */
export function ListingTeaserRow({ listing: l }: { listing: PublicListingCard }) {
  const t = useTranslations("web.marketplace.card");
  const unitLabel = useUnitLabel();
  const ts = useTranslations("web.marketplace.state");
  const locale = useLocale();
  const fmt = useFormatter();
  const activityLabel = useActivityLabel();
  const cityLabel = useCityLabel();
  const closingUrgency = useClosingUrgency();
  const href = listingHref(l);
  const state = publicState(l.status);
  const urgency = closingUrgency(l.status, l.closesAt);
  const days = daysUntil(l.closesAt) ?? 99;
  const activity = l.company.activities[0];
  const who = [activity ? activityLabel(activity) : null, cityLabel(l.company.city)].filter(Boolean).join(" · ");
  const primary = l.categories.find((c) => c.level >= 3) ?? l.categories[0];

  const data: ListingCardData = {
    id: l.number,
    href,
    number: l.number,
    title: l.title,
    kind: "talep",
    categoryIds: l.categories.map((c) => c.id),
    status: { label: ts(state), className: STATE_CLASS[state] },
    strip: state === "open" ? "border-l-emerald-500" : "border-l-slate-400",
    facts: [
      {
        label: t("buyer"),
        icon: "company",
        value: (
          <span className="flex min-w-0 flex-col items-start gap-1">
            <span className="truncate text-slate-800">{who || "—"}</span>
            {l.company.verified ? (
              <Badge tone="verified" size="sm" icon={false}>
                {t("verifiedBuyer")}
              </Badge>
            ) : null}
          </span>
        ),
      },
      {
        label: t("items"),
        icon: "items",
        value: (
          <span className="flex flex-col items-start">
            <span className="flex items-baseline gap-1">
              <span className="font-semibold tabular-nums text-slate-900">{l.itemSummary.count}</span>
              <span className="text-[11px] text-slate-500">{t("itemNoun")}</span>
              {l.itemSummary.totalQuantity && l.itemSummary.unit ? (
                <span className="ml-1 tabular-nums text-slate-600">
                  {fmt.number(Number(l.itemSummary.totalQuantity))} {unitLabel(l.itemSummary.unit)}
                </span>
              ) : null}
            </span>
            <span className="text-[11px] leading-tight text-slate-500">{t("specsMembers")}</span>
          </span>
        ),
      },
      {
        label: t("visibility"),
        icon: "scope",
        value: (
          <span className="flex flex-col items-start gap-1">
            <ScopeChip targetCountries={l.targetCountries} />
            <span className="text-[11px] leading-tight text-slate-500">{t("sealedBid")}</span>
          </span>
        ),
      },
      {
        label: t("closing"),
        icon: "closing",
        value: (
          <span title={formatDate(l.closesAt, "datetime", locale)}>
            <span className={cn("font-semibold", urgency && days <= 3 ? urgency.className : "text-slate-900")}>
              {formatDate(l.closesAt, "short", locale) || "—"}
            </span>
            {/* Kalan süre ALT SATIRDA (2026-09-13, kullanıcı kararı): rozet
                `inline-flex` olduğu için tarihin yanına yapışıyor ve
                "15 Eyl 20262 gün kaldı" diye okunuyordu. Satış panelindeki
                `BrowseTenderRow` ile aynı çözüm: BLOK sarmalayıcı. */}
            {urgency ? (
              <span className="mt-1 block">
                <span
                  className={cn(
                    "inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1",
                    days <= 1 ? "bg-rose-50 text-rose-700 ring-rose-200" : days <= 3 ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-50 text-slate-600 ring-slate-200",
                  )}
                >
                  {urgency.text}
                </span>
              </span>
            ) : null}
          </span>
        ),
      },
      {
        label: t("category"),
        icon: "category",
        value: primary ? (
          <span title={l.categories.map((c) => c.name).join(", ")}>
            <span className="block truncate font-medium text-slate-700">{primary.name}</span>
            {l.categories.length > 1 ? (
              <span className="block text-[11px] leading-tight text-slate-500">{t("moreCategories", { n: l.categories.length - 1 })}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-slate-500">—</span>
        ),
      },
    ],
    action: state === "open" ? { label: t("quote"), href: signupHref("teklif", href) } : null,
  };

  return <ListingCard variant="row" data={data} />;
}
