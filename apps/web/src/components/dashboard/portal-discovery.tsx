"use client";

import { EmptyState } from "@/components/list";
import { ProductCard } from "@/components/marketplace/product-card";
import {
  useDiscoverProducts,
  type DiscoverProduct,
} from "@/hooks/use-portal-discovery";
import { ArrowRight, Package } from "lucide-react";
import Link from "next/link";

/**
 * SATINALMA PANOSU — "SİZE UYGUN" SEÇKİSİ (v2 denetimi, 2026-09-03).
 *
 * "Anasayfa özet, alt sayfa liste": eski keşif kartı Ürün Ara sayfasının
 * kopyasıydı (arama kutusu, sekmeler, sektör kutuları, ikinci "Talep aç").
 * Şimdi tek küçük blok: "Size uygun ürünler" — en fazla 3 ürün (ProductCard,
 * görselli), tek çıkış ("Tüm ürünler →"). Arama, sekme, süzgeç ve CTA yok;
 * kullanıcı aramak isterse alt sayfaya gider.
 *
 * Satış ilanı özelliği kaldırıldığından (2026-09-04) satınalma panosunda
 * ilan şeridi YOK: karşı tarafın "fırsat" olarak sunduğu tek şey ürün
 * vitrini. Veri panelin KENDİ auth'lu ucundan; pazar yerinin herkese açık
 * uçları burada kullanılmaz. Satış panosunun karşılığı
 * `matched-requests-widget.tsx`.
 */
export const DISCOVERY_LIMIT = 4;

const PRODUCTS_HREF = "/company/satinalma/urunler";

export function PortalDiscovery() {
  const products = useDiscoverProducts({ limit: DISCOVERY_LIMIT }, true);

  return (
    <Block
      title="Size uygun ürünler"
      allHref={PRODUCTS_HREF}
      allLabel="Tüm ürünler"
      loading={products.isLoading}
      count={products.data?.length ?? 0}
      empty={
        <EmptyState
          icon={Package}
          title="Eşleşen ürün yok."
          description="Tedarikçiler ürünlerini yayımladıkça burada görünür."
          className="py-8"
          action={
            <Link
              href={PRODUCTS_HREF}
              className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Ürün Ara
            </Link>
          }
        />
      }
    >
      <div className={`grid grid-cols-1 gap-4 ${gridCols(products.data?.length ?? 0)}`}>
        {(products.data ?? []).map((p: DiscoverProduct) => (
          <ProductCard
            key={`${p.company.slug}/${p.slug}`}
            product={p}
            company={p.company}
            // PANEL rotası — herkese açık `/firma/...` sayfası DEĞİL: public
            // layout oturumu okumaz, giriş yapmış kullanıcı duvara çarpardı.
            href={`${PRODUCTS_HREF}/${p.company.slug}/${p.slug}`}
          />
        ))}
      </div>
    </Block>
  );
}

/* ------------------------------------------------------------------ */

function Block({
  title,
  allHref,
  allLabel,
  loading,
  count,
  empty,
  children,
}: {
  title: string;
  allHref: string;
  allLabel: string;
  loading: boolean;
  count: number;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // Kutusuz bölüm — kategori vitrini ve tedarikçi bloğuyla AYNI ritim
    // (başlık solda, çıkış bağlantısı sağda, altında ızgara).
    <section aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">Satış kategorilerinize göre eşleşen vitrin ürünleri.</p>
        </div>
        <Link
          href={allHref}
          className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
        >
          {allLabel}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <div className="mt-4">{loading ? <StripSkeleton /> : count === 0 ? empty : children}</div>
    </section>
  );
}

function StripSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: DISCOVERY_LIMIT }).map((_, i) => (
        <div key={i} className="h-40 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}

/** Envanter azken hayalet ızgara çizme — pazar yerindeki kararın aynısı. */
function gridCols(n: number): string {
  if (n >= 4) return "sm:grid-cols-2 lg:grid-cols-4";
  if (n === 3) return "sm:grid-cols-3";
  if (n === 2) return "sm:grid-cols-2";
  return "sm:max-w-sm";
}
