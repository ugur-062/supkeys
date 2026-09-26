import { daysUntil } from "@/lib/tenders/seller-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { listingHref, publicState } from "@/lib/public/marketplace";
import type { PublicListingCard } from "@/lib/public/marketplace-api";
import { signupHref } from "@/lib/public/visibility";
import { ClockIcon, GlobeAltIcon, LockClosedIcon, MapPinIcon } from "@heroicons/react/20/solid";
import { useActivityLabel, useCityLabel, useScopeLabel, useUnitLabel } from "@/i18n/domain";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * ALIM TALEBİ TEASER KARTI (görünürlük v2) — "gizli ama cezbedici".
 *
 * Ölçek ve aciliyet ÖNDE: büyük miktar YALNIZ birimiyle ("1.200 adet");
 * birim yoksa büyük sayı basılmaz — "3" tek başına ne olduğu belirsiz bir
 * rakamdı (B4). Kalem sayısı her zaman meta satırında. "N gün kaldı": ≤3 gün
 * kırmızı, ≤7 amber. Tüm kart tıklanır (başlık bağlantısı karta yayılır);
 * "Teklif ver" ayrı hedef, üstte. Alıcı adı, kalem adları, hedef fiyat YOK.
 */
/* Saat bazlı `Math.ceil` yerine TAKVİM günü (2026-09-22): sunucu ile istemci
   arasındaki saniyeler sınırda farklı sayı üretip hidrasyonu bozuyordu;
   takvim günü ürün saat diliminde sayılır (`daysUntil`). */
function daysLeft(iso: string | null): number | null {
  return daysUntil(iso);
}

/** Aciliyet = ton: ≤3 gün kırmızı, ≤7 gün amber, ötesi nötr (kart sistemi). */
function leftTone(left: number): "danger" | "gold" | "neutral" {
  if (left <= 3) return "danger";
  if (left <= 7) return "gold";
  return "neutral";
}

export function ListingTeaserCard({ listing: l }: { listing: PublicListingCard }) {
  const t = useTranslations("web.marketplace.card");
  const unitLabel = useUnitLabel();
  const fmt = useFormatter();
  const activityLabel = useActivityLabel();
  const cityLabel = useCityLabel();
  const scopeLabel = useScopeLabel();
  const href = listingHref(l);
  const open = publicState(l.status) === "open";
  const left = open ? daysLeft(l.closesAt) : null;
  const activity = l.company.activities[0];
  const who = [activity ? activityLabel(activity) : null, cityLabel(l.company.city)].filter(Boolean).join(" · ");
  const primaryCategory = l.categories.find((c) => c.level >= 3) ?? l.categories[0];
  const qty = l.itemSummary.totalQuantity && l.itemSummary.unit ? Number(l.itemSummary.totalQuantity) : null;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-zinc-950/10 focus-within:ring-2 focus-within:ring-zinc-950">
      {/* Üst satır: kategori + kalan süre — kategori GÖRSELİ YOK (2026-09-18,
          kullanıcı kararı: taleplerde hiçbir yerde kategori görseli olmasın). */}
      <div>
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          {primaryCategory ? (
            <Badge tone="neutral" size="sm" className="min-w-0 shrink bg-white/90 font-medium text-zinc-700 ring-1 ring-inset ring-zinc-950/5">
              <span className="truncate">{primaryCategory.name}</span>
            </Badge>
          ) : <span />}
          {left != null ? (
            <Badge tone={leftTone(left)} size="sm" icon={false} className="tnum bg-white/90">
              <ClockIcon aria-hidden className="size-3" />
              {left <= 0 ? t("closesToday") : t("daysLeft", { n: left })}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 text-base/6 font-semibold text-zinc-950">
          {/* Yayılmış bağlantı — kartın tamamı bu hedefe gider. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:text-zinc-600 focus:outline-none">
            {l.title}
          </Link>
        </h3>

        {/* Ölçek — kartın en büyük yazısı; yalnız birimli miktar */}
        {qty ? (
          <p className="mt-3 tnum text-2xl font-semibold tracking-tight text-zinc-950">
            {fmt.number(qty)}
            <span className="ml-1 text-base font-medium text-zinc-500">{unitLabel(l.itemSummary.unit)}</span>
          </p>
        ) : null}
        <p className={`text-xs text-zinc-500 tnum ${qty ? "mt-0.5" : "mt-3"}`}>
          {t("itemsCountMembers", { count: l.itemSummary.count })}
        </p>

        <dl className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
          {l.company.verified ? (
            <div className="flex items-center">
              <dt className="sr-only">{t("buyerVerification")}</dt>
              <dd>
                <Badge tone="verified" size="sm">{t("verifiedBuyer")}</Badge>
              </dd>
            </div>
          ) : null}
          {who ? (
            <div className="flex items-center gap-1">
              <dt className="sr-only">{t("buyer")}</dt>
              <dd className="flex items-center gap-1"><MapPinIcon aria-hidden className="size-3.5 text-zinc-300" />{who}</dd>
            </div>
          ) : null}
          <div className="flex items-center gap-1">
            <dt className="sr-only">{t("visibility")}</dt>
            <dd className="flex items-center gap-1"><GlobeAltIcon aria-hidden className="size-3.5 text-zinc-300" />{scopeLabel(l.targetCountries ?? [])}</dd>
          </div>
          <div className="flex items-center gap-1">
            {/* Kapalı zarf bir KURAL — ipucu neyin gizli kaldığını söyler.
                İpucu sarmalayıcısı <dd>'nin İÇİNDE: dışarıda olunca <dl>'nin
                doğrudan çocuğu <span> oluyordu (a11y: definition-list + dlitem,
                2026-09-12 taraması). */}
            <dt className="sr-only">{t("bidPrivacy")}</dt>
            <dd>
              <Tooltip label={t("sealedTooltip")}>
                <span className="flex items-center gap-1">
                  <LockClosedIcon aria-hidden className="size-3.5 text-zinc-300" />
                  {t("sealedBid")}
                </span>
              </Tooltip>
            </dd>
          </div>
        </dl>

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="tnum text-xs font-medium text-zinc-500">{l.number}</span>
          <Button href={signupHref("teklif", href)} className="relative z-10">
            {t("quote")}
          </Button>
        </div>
      </div>
    </article>
  );
}
