"use client";

import { CategoryImage } from "@/components/marketplace/category-image";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import { useDiscoverProducts } from "@/hooks/use-portal-discovery";
import { productPrice } from "@/lib/public/product-price";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Panel içi ürün keşfi — tedarikçilerin vitrinleri.
 *
 * Arama/kategori URL'DEN okunur: pano keşif bloğundaki arama kutusu buraya
 * `?q=` ile devrediyor ve sayfa paylaşılabilir kalıyor.
 */
export function DiscoverProductsView() {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp?.get("q") ?? "");
  const [applied, setApplied] = useState(sp?.get("q") ?? "");
  const category = sp?.get("kategori") ?? undefined;

  // URL değişirse (pano şeridinden gelen yeni terim) alan da güncellensin.
  useEffect(() => {
    const term = sp?.get("q") ?? "";
    setQ(term);
    setApplied(term);
  }, [sp]);

  const products = useDiscoverProducts({
    q: applied || undefined,
    category: category && /^\d{8}$/.test(category) ? category : undefined,
    limit: 48,
  });
  const rows = products.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Ürünler"
        description="Tedarikçi firmaların vitrinlerindeki ürünler. Beğendiğiniz ürünün firmasıyla doğrudan iletişime geçin."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(q.trim());
        }}
        role="search"
        className="relative mt-6 max-w-md"
      >
        <MagnifyingGlassIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ürün, marka veya parça numarası"
          aria-label="Ürün ara"
          className="w-full rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </form>

      {products.isLoading ? (
        <p className="mt-8 text-sm text-zinc-500">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-zinc-50 px-6 py-10 text-center ring-1 ring-zinc-950/5">
          <p className="text-sm font-semibold text-zinc-900">
            {applied ? "Eşleşen ürün yok." : "Vitrine çıkmış ürün yok."}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {applied
              ? "Aramayı sadeleştirip yeniden deneyin."
              : "Firmalar ürünlerini yayımladıkça burada görünür."}
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((p) => {
            const price = productPrice(p);
            return (
              <Link
                key={`${p.company.slug}/${p.slug}`}
                href={`/firma/${p.company.slug}/urun/${p.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <CategoryImage
                  src={p.images[0]}
                  categoryIds={p.categoryId ? [p.categoryId] : []}
                  alt={p.name}
                  ratio="aspect-[4/3]"
                  className="border-b border-zinc-950/5"
                />
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-2 text-sm/5 font-semibold text-zinc-950">
                    {p.name}
                  </h3>
                  <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                    {p.company.name}
                    {p.company.city ? ` · ${p.company.city}` : ""}
                  </p>
                  {p.excerpt ? (
                    <p className="mt-1.5 line-clamp-2 text-xs/5 text-zinc-500">
                      {p.excerpt}
                    </p>
                  ) : null}
                  <p
                    className={`mt-auto pt-3 text-sm font-semibold ${
                      price.hasPrice ? "text-zinc-950" : "text-zinc-500"
                    }`}
                  >
                    {price.headline}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
