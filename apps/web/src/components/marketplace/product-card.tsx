"use client";

import { CategoryImage } from "./category-image";
import { Thumb } from "@/components/ui/thumb";
import { productPrice } from "@/lib/public/product-price";
import type { ProductPriceFields, PublicProductCard } from "@/lib/public/marketplace-api";
import { cn } from "@/lib/utils";
import { CheckBadgeIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { companyActivityLabel } from "@rothern/shared";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * ÜRÜN KARTI — TEK bileşen, iki varyant (v2 denetimi, 2026-09-03).
 *
 * Eskiden aynı ürün dört yerde dört kartla çiziliyordu (pazar yeri, Ürün Ara,
 * pano şeridi, Ürünlerim satırı) ve görseli her biri farklı ele alıyordu
 * (kategori ampulü / bomboş beyaz / gri kutu). Şimdi:
 *
 *  · `tile` — Europages ürün kartı anatomisi: 4:3 kapak → ad → 3 madde öne
 *    çıkan özellik (yoksa açıklamanın ilk 2 satırı) → firma + Doğrulanmış
 *    rozeti + faaliyet tipi → fiyat ("teklif isteyin" de bir fiyattır) →
 *    MOQ → tek CTA.
 *  · `row` — liste satırı: küçük resim (Thumb) · ad · meta · rozet · sağ metin.
 *
 * Ürünün görseli ZORUNLU (yayın kapısı); kapak = ilk görsel. Kapak yoksa
 * (taslak/eski kayıt) kategori görseline düşülür — beyaz boşluk kalmaz.
 * Sunucu bileşenlerinden de çağrılır (pazar yeri) — prop'lar serileştirilebilir
 * kalmalı; `onClick` yalnız panel satırında.
 */
export type ProductCardProduct = Pick<
  PublicProductCard,
  "slug" | "name" | "images" | "categoryId" | "unit" | "priceMode"
> &
  Partial<Pick<PublicProductCard, "excerpt"> & ProductPriceFields>;

export interface ProductCardCompany {
  name: string;
  city?: string | null;
  /** KYC doğrulaması tamam — "Doğrulanmış" rozeti. */
  verified?: boolean;
  /** Faaliyet tipi kodları (CompanyActivity) — ilk ikisi gösterilir. */
  activities?: string[];
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
  variant?: "tile" | "row";
  /** Öne çıkan özellikler — ilk 3 madde. Yoksa `excerpt`. */
  features?: string[];
  /** Tek CTA etiketi (tile) — "Bilgi iste". Yalnız görsel; tıklama kartındır. */
  cta?: string;
  /** Row: durum rozeti (Taslak/Yayında). */
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
  const bullets = (features ?? []).filter(Boolean).slice(0, 3);
  const activities = (firm?.activities ?? []).slice(0, 2);

  return (
    <Link
      href={target ?? "#"}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950",
        className,
      )}
    >
      <CategoryImage
        src={product.images[0]}
        categoryIds={product.categoryId ? [product.categoryId] : []}
        alt={product.name}
        ratio="aspect-[4/3]"
        className="border-b border-zinc-950/5"
        priority={priority}
        fallback="neutral"
      />
      {/* Rozet (ör. "Alım kategorinizle eşleşiyor") görselin üstünde, sol üst. */}
      {badge ? <span className="pointer-events-none absolute top-3 left-3 z-10">{badge}</span> : null}

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm/5 font-semibold tracking-tight text-zinc-950">
            {product.name}
          </h3>
          {cta ? null : (
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
        ) : product.excerpt ? (
          <p className="mt-1.5 line-clamp-2 text-xs/5 text-zinc-500">{product.excerpt}</p>
        ) : null}

        {firm ? (
          <div className="mt-2 min-w-0 text-xs text-zinc-500">
            {/* Tek satır: firma · şehir; taşarsa ÜÇ NOKTA — kart yüksekliği
                firma adının uzunluğuna göre oynamasın (B5). */}
            <p className="flex min-w-0 items-center gap-1">
              <span className="truncate font-medium text-zinc-700">{firm.name}</span>
              {firm.verified ? (
                <CheckBadgeIcon
                  aria-label="Doğrulanmış firma"
                  className="size-3.5 shrink-0 text-emerald-600"
                />
              ) : null}
              {firm.city ? <span className="shrink-0 whitespace-nowrap">· {firm.city}</span> : null}
            </p>
            {activities.length > 0 ? (
              <p className="mt-1 flex gap-1 overflow-hidden whitespace-nowrap">
                {activities.map((a) => (
                  <span
                    key={a}
                    className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600"
                  >
                    {companyActivityLabel(a)}
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto pt-3">
          <p
            className={`text-sm font-semibold tabular-nums ${price.hasPrice ? "text-zinc-950" : "text-zinc-500"}`}
          >
            {price.headline}
          </p>
          {product.moq ? (
            <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">
              Min. {Number(product.moq).toLocaleString("tr-TR")} {product.unit}
            </p>
          ) : null}
          {cta ? (
            <span className="mt-3 inline-flex w-full items-center justify-center rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-800 transition group-hover:bg-zinc-950 group-hover:text-white">
              {cta}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
