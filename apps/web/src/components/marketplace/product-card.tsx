"use client";

import { CategoryImage } from "./category-image";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Thumb } from "@/components/ui/thumb";
import { productPrice } from "@/lib/public/product-price";
import type { ProductPriceFields, PublicProductCard } from "@/lib/public/marketplace-api";
import { cn } from "@/lib/utils";
import { ChevronRightIcon, MapPinIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * ÜRÜN KARTI — TEK bileşen, üç varyant (v2 denetimi 2026-09-03; kart sistemi
 * PROMPT 5, 2026-09-06).
 *
 *  · `tile` — Europages ürün kartı anatomisi: 4:3 kapak → ad (2 satır) →
 *    3 madde öne çıkan özellik (yoksa açıklamanın ilk 2 satırı) → firma
 *    satırı (avatar + ad + Doğrulanmış + şehir) → fiyat → MOQ → tek CTA.
 *  · `compact` — ikincil bağlamlar (benzer ürünler, firmanın diğerleri):
 *    aynı iskelet, madde/CTA yok, sıkı iç boşluk.
 *  · `row` — panel liste satırı: küçük resim (Thumb) · ad · meta · rozet.
 *  · `wide` — pazar LİSTE görünümü (2026-09-07): yatay kart — 4:3 kapak ·
 *    rozetler · ad · 3 madde · firma · sağda fiyat/MOQ/CTA. Aynı bilgiyi
 *    `tile` ile aynı kaynaklardan basar; ızgara/liste geçişi yalnız düzeni
 *    değiştirir, içeriği değil (kullanıcı "aynı kart mı?" diye şüphelenmesin).
 *
 * PROMPT 5 kararları: rozetler `ui/badge` (Doğrulanmış/Gold/Yeni tek yerde
 * tanımlı), firma logosu `ui/avatar` (yoksa monogram — beyaz boşluk yok),
 * FAALİYET TİPİ kartta YOK (ürün kararında rol oynamıyor; süzgeçte duruyor).
 * Kart bir `article`; bağlantı BAŞLIKTA ve `after:inset-0` ile kartın tamamına
 * yayılır — görsel ile CTA aynı bağlantının parçası olur, ikinci sekme durağı
 * açılmaz. (Eskiden kartın kendisi `<a>`, rozet ise konumlandırılmamış bir
 * atada `absolute` idi: panel rozeti kartın dışına düşüyordu.)
 *
 * Ürünün görseli ZORUNLU (yayın kapısı); kapak = ilk görsel. Kapak yoksa
 * (taslak/eski kayıt) nötr gri zemin — ürün görselinin yokluğu bir eksikliktir,
 * tonlu kutu onu saklardı.
 */
export type ProductCardProduct = Pick<
  PublicProductCard,
  "slug" | "name" | "images" | "categoryId" | "unit" | "priceMode"
> &
  Partial<Pick<PublicProductCard, "excerpt"> & ProductPriceFields> & {
    /** "Yeni" rozeti (≤7 gün) — dizin kartında dolu, firma altı listede yok. */
    publishedAt?: string | null;
  };

export interface ProductCardCompany {
  name: string;
  city?: string | null;
  /** KYC doğrulaması tamam — "Doğrulanmış" rozeti. */
  verified?: boolean;
  /** Efektif GOLD — kapakta "Gold Üye" rozeti. */
  gold?: boolean;
  logoUrl?: string | null;
  /** Süzgeçte kullanılır; kartta GÖSTERİLMEZ (PROMPT 5). */
  activities?: string[];
}

/** Yayın tarihi ≤ 7 gün → "Yeni". */
function isNew(publishedAt?: string | null): boolean {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  return Number.isFinite(t) && Date.now() - t <= 7 * 86_400_000;
}

export function ProductCard({
  product,
  companySlug,
  companyName,
  companyCity,
  company,
  href,
  variant = "tile",
  features,
  cta,
  badge,
  meta,
  trailing,
  onClick,
  priority = false,
  className,
}: {
  product: ProductCardProduct;
  /** Herkese açık rota için (`/firma/<slug>/urun/<slug>`); `href` verilirse kullanılmaz. */
  companySlug?: string;
  /** Eski çağrı biçimi — dizinde firma adı; `company` verilmişse yok sayılır. */
  companyName?: string;
  companyCity?: string | null;
  company?: ProductCardCompany;
  /** Panel rotası gibi farklı hedef. */
  href?: string;
  variant?: "tile" | "compact" | "row" | "wide";
  /** Öne çıkan özellikler — ilk 3 madde. Yoksa `excerpt`. */
  features?: string[];
  /** Tek CTA etiketi (tile) — "Bilgi iste". Yalnız görsel; tıklama kartındır. */
  cta?: string;
  /** Tile: kapağın sol üstündeki rozet. Row: durum rozeti (Taslak/Yayında). */
  badge?: ReactNode;
  /** Row: ad altındaki meta satırı (kategori · fiyat modu · birim). */
  meta?: ReactNode;
  /** Row: sağ uç (son güncelleme vb.). */
  trailing?: ReactNode;
  /** Row: bağlantı yerine düğme (panel içi düzenleme). */
  onClick?: () => void;
  /** LCP: görünümdeki ilk kartların görseli öncelikli yüklensin. */
  priority?: boolean;
  className?: string;
}) {
  const target = href ?? (companySlug ? `/firma/${companySlug}/urun/${product.slug}` : undefined);
  const firm: ProductCardCompany | undefined =
    company ?? (companyName ? { name: companyName, city: companyCity } : undefined);

  if (variant === "row") {
    const inner = (
      <>
        <Thumb src={product.images[0]} alt="" size="md" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-950">{product.name}</span>
            {badge}
          </span>
          {meta ? (
            <span className="mt-0.5 block truncate text-xs text-zinc-500">{meta}</span>
          ) : null}
        </span>
        {trailing ? (
          <span className="hidden shrink-0 text-xs text-zinc-500 sm:block">{trailing}</span>
        ) : null}
      </>
    );
    const rowCls = cn(
      "flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-zinc-50",
      className,
    );
    if (onClick) {
      return (
        <button type="button" onClick={onClick} className={rowCls}>
          {inner}
        </button>
      );
    }
    return (
      <Link href={target ?? "#"} className={rowCls}>
        {inner}
      </Link>
    );
  }

  const price = productPrice({
    priceMode: product.priceMode,
    priceAmount: product.priceAmount ?? null,
    priceTiers: product.priceTiers ?? null,
    priceCurrency: product.priceCurrency ?? "TRY",
    unit: product.unit,
  });
  const compact = variant === "compact";
  const bullets = compact ? [] : (features ?? []).filter(Boolean).slice(0, 3);
  const fresh = isNew(product.publishedAt);

  if (variant === "wide") {
    return (
      <article
        className={cn(
          "group relative flex gap-4 overflow-hidden rounded-lg bg-white p-3 ring-1 ring-zinc-200 transition hover:shadow-md hover:ring-zinc-300 focus-within:ring-2 focus-within:ring-zinc-950 sm:gap-5 sm:p-4",
          className,
        )}
      >
        <div className="relative w-28 shrink-0 sm:w-44">
          <CategoryImage
            src={product.images[0]}
            categoryIds={product.categoryId ? [product.categoryId] : []}
            alt={product.name}
            ratio="aspect-[4/3]"
            className="overflow-hidden rounded-md ring-1 ring-zinc-950/5"
            priority={priority}
            fallback="neutral"
          />
          {badge ? <span className="pointer-events-none absolute top-1.5 left-1.5 z-10">{badge}</span> : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-1.5">
            {firm?.verified ? (
              <Badge tone="verified" size="sm">
                Doğrulanmış
              </Badge>
            ) : null}
            {firm?.gold ? (
              <Badge tone="gold" size="sm">
                Gold Üye
              </Badge>
            ) : null}
            {fresh ? (
              <Badge tone="new" size="sm">
                Yeni
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-1 line-clamp-2 text-[15px]/5 font-semibold tracking-tight text-zinc-950">
            <Link
              href={target ?? "#"}
              className="after:absolute after:inset-0 after:content-[''] hover:text-zinc-600 focus:outline-none"
            >
              {product.name}
            </Link>
          </h3>
          {bullets.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-xs/5 text-zinc-600">
              {bullets.map((f) => (
                <li key={f} className="flex gap-1.5">
                  <span aria-hidden className="text-zinc-300">
                    •
                  </span>
                  <span className="line-clamp-1">{f}</span>
                </li>
              ))}
            </ul>
          ) : product.excerpt ? (
            <p className="mt-1.5 line-clamp-2 text-xs/5 text-zinc-500">{product.excerpt}</p>
          ) : null}
          {firm ? (
            <div className="mt-auto flex min-w-0 items-center gap-1.5 pt-2 text-xs text-zinc-500">
              <Avatar name={firm.name} src={firm.logoUrl} size={24} />
              <span className="truncate font-medium text-zinc-700">{firm.name}</span>
              {firm.city ? (
                <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap">
                  <MapPinIcon aria-hidden className="size-3.5 text-zinc-400" />
                  {firm.city}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Sağ sütun: fiyat kararı bir arada. Dar ekranda gizlenmez, gövdenin
            altına akar — mobilde liste görünümü zaten tek sütun. */}
        <div className="hidden w-40 shrink-0 flex-col justify-center border-l border-zinc-100 pl-4 text-right sm:flex">
          <p className={cn("tnum text-sm font-semibold", price.hasPrice ? "text-zinc-950" : "text-zinc-500")}>
            {price.headline}
          </p>
          <p className="tnum mt-0.5 text-xs text-zinc-500">
            {product.moq ? `Min. ${Number(product.moq).toLocaleString("tr-TR")} ${product.unit}` : "\u00A0"}
          </p>
          {cta ? (
            <span className="mt-3 inline-flex items-center justify-center rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white transition group-hover:bg-zinc-800">
              {cta}
            </span>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        // Pazar bölgesi "katalog" dili: küçük yarıçap, hairline çerçeve, GÖLGE
        // YOK (yalnız hover). Panel bölgesi yumuşak gölgeli kalır.
        "group relative flex h-full flex-col overflow-hidden rounded-lg bg-white ring-1 ring-zinc-200 transition duration-200 hover:shadow-md hover:ring-zinc-300 focus-within:ring-2 focus-within:ring-zinc-950",
        className,
      )}
    >
      <div className="relative">
        <CategoryImage
          src={product.images[0]}
          categoryIds={product.categoryId ? [product.categoryId] : []}
          alt={product.name}
          ratio="aspect-[4/3]"
          className="border-b border-zinc-950/5"
          priority={priority}
          fallback="neutral"
        />
        {/* ROZET HİYERARŞİSİ (2026-09-07): kapakta yalnız çağıranın rozeti
            (ör. "Alım kategorinizle eşleşiyor") ya da SESSİZ Gold şeridi.
            Güven sinyali (Doğrulanmış) ve tazelik (Yeni) gövdenin ilk
            satırına taşındı — ticari seviye rozeti güven rozetinden daha
            çok dikkat çekiyordu. */}
        {badge ? (
          <span className="pointer-events-none absolute top-2 left-2 z-10">{badge}</span>
        ) : firm?.gold ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-zinc-950/70 to-transparent px-2.5 py-1.5">
            <span className="text-[11px] font-semibold tracking-wide text-amber-200">Gold Üye</span>
          </span>
        ) : null}
      </div>

      <div className={cn("flex flex-1 flex-col", compact ? "p-3" : "p-4")}>
        {!compact && (firm?.verified || fresh) ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {firm?.verified ? (
              <Badge tone="verified" size="sm">
                Doğrulanmış
              </Badge>
            ) : null}
            {fresh ? (
              <Badge tone="new" size="sm">
                Yeni
              </Badge>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-2">
          <h3 className={cn("line-clamp-2 font-semibold tracking-tight text-zinc-950", compact ? "text-[13px]/5" : "text-[15px]/5")}>
            {/* Yayılmış bağlantı — kartın tamamı bu hedefe gider. */}
            <Link
              href={target ?? "#"}
              className="after:absolute after:inset-0 after:content-[''] hover:text-zinc-600 focus:outline-none"
            >
              {product.name}
            </Link>
          </h3>
          {cta || compact ? null : (
            <ChevronRightIcon
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500"
            />
          )}
        </div>

        {bullets.length > 0 ? (
          <ul className="mt-1.5 space-y-0.5 text-xs/5 text-zinc-600">
            {bullets.map((f) => (
              <li key={f} className="flex gap-1.5">
                <span aria-hidden className="text-zinc-300">
                  •
                </span>
                <span className="line-clamp-1">{f}</span>
              </li>
            ))}
          </ul>
        ) : !compact && product.excerpt ? (
          <p className="mt-1.5 line-clamp-2 text-xs/5 text-zinc-500">{product.excerpt}</p>
        ) : null}

        {firm ? (
          /* Tek satır: avatar · firma · ✓ · şehir. Taşarsa ad kısalır — kart
             yüksekliği firma adının uzunluğuna göre oynamasın (B5). */
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500">
            <Avatar name={firm.name} src={firm.logoUrl} size={24} />
            <span className="truncate font-medium text-zinc-700">{firm.name}</span>
            {compact && firm.verified ? (
              <Badge tone="verified" size="sm" className="px-1">
                <span className="sr-only">Doğrulanmış firma</span>
              </Badge>
            ) : null}
            {firm.city ? (
              <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap">
                <MapPinIcon aria-hidden className="size-3.5 text-zinc-400" />
                {firm.city}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className={cn("mt-auto", compact ? "pt-2" : "pt-3")}>
          <p className={cn("tnum text-sm font-semibold", price.hasPrice ? "text-zinc-950" : "text-zinc-500")}>
            {price.headline}
          </p>
          {/* MOQ satırı MOQ yokken de yer kaplar: kartlar farklı yüksekliğe
              düşünce ızgara zıplıyordu ("teklif isteyin" ürünlerinin çoğunda
              MOQ yok). */}
          <p className="tnum mt-0.5 text-xs text-zinc-500">
            {product.moq
              ? `Min. ${Number(product.moq).toLocaleString("tr-TR")} ${product.unit}`
              : "\u00A0"}
          </p>
          {cta && !compact ? (
            /* BİRİNCİL EYLEM — tek renk, dolgulu, her ekranda aynı. */
            <span className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white transition group-hover:bg-zinc-800">
              {cta}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
