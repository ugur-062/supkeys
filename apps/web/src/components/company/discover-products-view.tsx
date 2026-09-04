"use client";

import { FacetGroup, FilterChip } from "@/components/marketplace/facets";
import { ProductCard } from "@/components/marketplace/product-card";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import { useDiscoverProductFacets, useDiscoverSearch } from "@/hooks/use-portal-discovery";
import type { ProductListParams } from "@/lib/public/marketplace-api";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { companyActivityLabel, isCompanyActivity } from "@rothern/shared";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * PANEL "ÜRÜN ARA" — herkese açık `/urunler` ile AYNI süzgeç kümesi, sıralama
 * ve kart (2026-09-04 tutarlılık turu). Eskiden yalnız arama kutusu vardı;
 * üye, ziyaretçiden daha az süzgeç görüyordu. Durum URL'de (`?q=&kategori=
 * &il=&faaliyet=&dogrulanmis=&fiyat=&sirala=&sayfa=`) — paylaşılabilir, pano
 * şeridi `?q=` ile devreder. Veri: `company/items/discover/search` (kendi
 * ürünler hariç, aynı `product-index.ts` tek kaynağı).
 */
const SORT: Record<string, ProductListParams["sort"]> = { yeni: "newest", fiyat: "price" };
const PRICE: Record<string, ProductListParams["price"]> = { var: "has", teklif: "request" };

export function DiscoverProductsView() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string) => sp?.get(k) ?? undefined;
  const [q, setQ] = useState(get("q") ?? "");
  useEffect(() => setQ(get("q") ?? ""), [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const category = get("kategori") && /^\d{8}$/.test(get("kategori")!) ? get("kategori") : undefined;
  const city = get("il");
  const activity = get("faaliyet") && isCompanyActivity(get("faaliyet")!) ? get("faaliyet") : undefined;
  const verified = get("dogrulanmis") === "1";
  const price = get("fiyat") && PRICE[get("fiyat")!] ? get("fiyat") : undefined;
  const sortKey = get("sirala") && SORT[get("sirala")!] ? get("sirala") : undefined;
  const pageNo = Number(get("sayfa"));
  const page = Number.isFinite(pageNo) && pageNo > 1 ? Math.trunc(pageNo) : 1;

  const params: ProductListParams & { page?: number } = {
    q: get("q")?.trim() || undefined,
    category,
    city,
    activity,
    verified,
    price: price ? PRICE[price] : undefined,
    sort: sortKey ? SORT[sortKey] : undefined,
    page,
  };
  const result = useDiscoverSearch(params);
  const facets = useDiscoverProductFacets();
  const data = result.data;
  const hasFilter = !!(params.q || category || city || activity || verified || price);

  /** Süzgeç bağlantısı — mevcut durumu korur, sayfayı 1'e döndürür. */
  const href = (patch: Record<string, string | undefined>) => {
    const next: Record<string, string | undefined> = {
      q: get("q"), kategori: category, il: city, faaliyet: activity,
      dogrulanmis: verified ? "1" : undefined, fiyat: price, sirala: sortKey,
      ...patch,
    };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) usp.set(k, v);
    const s = usp.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const toggle = (key: string, value: string, active: boolean) => href({ [key]: active ? undefined : value });

  const chips = [
    ...(params.q ? [{ key: "q", label: `"${params.q}"`, href: href({ q: undefined }) }] : []),
    ...(category ? [{ key: "kategori", label: facets.data?.categories.find((c) => c.id === category)?.name ?? category, href: href({ kategori: undefined }) }] : []),
    ...(city ? [{ key: "il", label: city, href: href({ il: undefined }) }] : []),
    ...(activity ? [{ key: "faaliyet", label: companyActivityLabel(activity), href: href({ faaliyet: undefined }) }] : []),
    ...(verified ? [{ key: "dogrulanmis", label: "Doğrulanmış", href: href({ dogrulanmis: undefined }) }] : []),
    ...(price ? [{ key: "fiyat", label: price === "var" ? "Fiyatı yazılı" : "Teklifle", href: href({ fiyat: undefined }) }] : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Ürün Ara"
        description="Tedarikçi firmaların vitrinlerindeki ürünler. Kategori, şehir ve faaliyet tipine göre süzün; beğendiğiniz ürünün firmasından bilgi isteyin."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(href({ q: q.trim() || undefined }));
        }}
        role="search"
        className="relative mt-6 max-w-md"
      >
        <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ürün, marka veya parça numarası"
          aria-label="Ürün ara"
          className="w-full rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </form>

      {chips.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-500">Süzgeçler:</span>
          {chips.map((c) => (
            <FilterChip key={c.key} href={c.href} label={c.label} />
          ))}
          <Link href={pathname} className="text-sm font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-600">
            Tümünü temizle
          </Link>
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[15rem_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <FacetGroup
            heading="Kategori"
            items={(facets.data?.categories ?? []).slice(0, 12).map((c) => ({
              key: c.id, label: c.name, count: c.count,
              href: toggle("kategori", c.id, category === c.id), active: category === c.id,
            }))}
          />
          <FacetGroup
            heading="Firma profili"
            items={[{ key: "v", label: "Doğrulanmış", count: data?.total ?? 0, href: toggle("dogrulanmis", "1", verified), active: verified }]}
          />
          <FacetGroup
            heading="Faaliyet tipi"
            items={(facets.data?.activities ?? []).map((a) => ({
              key: a.activity, label: companyActivityLabel(a.activity), count: a.count,
              href: toggle("faaliyet", a.activity, activity === a.activity), active: activity === a.activity,
            }))}
          />
          <FacetGroup
            heading="Şehir"
            items={(facets.data?.cities ?? []).slice(0, 12).map((c) => ({
              key: c.city, label: c.city, count: c.count,
              href: toggle("il", c.city, city === c.city), active: city === c.city,
            }))}
          />
          <FacetGroup
            heading="Fiyat"
            items={[
              { key: "var", label: "Fiyatı yazılı", count: data?.total ?? 0, href: toggle("fiyat", "var", price === "var"), active: price === "var" },
              { key: "teklif", label: "Teklifle", count: data?.total ?? 0, href: toggle("fiyat", "teklif", price === "teklif"), active: price === "teklif" },
            ]}
          />
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
            <span>{data && data.total > 0 ? `${data.total.toLocaleString("tr-TR")} ürün` : ""}</span>
            <span className="flex items-center gap-1 text-xs">
              <span className="text-zinc-500">Sırala:</span>
              {[{ k: undefined, l: "Uygunluk" }, { k: "yeni", l: "En yeni" }, { k: "fiyat", l: "Fiyat" }].map((o) => (
                <Link
                  key={o.l}
                  href={href({ sirala: o.k })}
                  aria-current={sortKey === o.k ? "true" : undefined}
                  className={`rounded-full px-2.5 py-1 font-medium transition ${sortKey === o.k ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
                >
                  {o.l}
                </Link>
              ))}
            </span>
          </div>

          {result.isLoading ? (
            <p className="text-sm text-zinc-500">Yükleniyor…</p>
          ) : !data || data.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-12 text-center">
              <p className="text-base font-semibold text-zinc-900">Ürün bulunamadı.</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
                <Link
                  href={`/company/satinalma/taleplerim/yeni${params.q ? `?q=${encodeURIComponent(params.q)}` : ""}`}
                  className="rounded-full bg-zinc-950 px-4 py-2 font-semibold text-white transition hover:bg-zinc-800"
                >
                  {params.q ? `"${params.q}" için talep aç` : "Bu ürün için talep aç"}
                </Link>
                {hasFilter ? (
                  <Link href={pathname} className="rounded-full border border-zinc-300 px-4 py-2 font-semibold text-zinc-900 transition hover:bg-white">
                    Filtreleri temizle
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((p) => (
                <ProductCard
                  key={`${p.company.slug}/${p.slug}`}
                  product={p}
                  company={p.company}
                  // PANEL rotası — herkese açık `/firma/...` sayfası DEĞİL.
                  href={`/company/satinalma/urunler/${p.company.slug}/${p.slug}`}
                  cta="Bilgi iste"
                />
              ))}
            </div>
          )}

          {data && data.total > data.pageSize ? (
            <nav aria-label="Sayfalama" className="mt-8 flex items-center justify-between text-sm">
              <Link
                href={href({ sayfa: page > 2 ? String(page - 1) : undefined })}
                aria-disabled={page <= 1}
                className={`rounded-full border border-zinc-300 px-4 py-1.5 font-medium ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-zinc-50"}`}
              >
                Önceki
              </Link>
              <span className="text-zinc-500">
                Sayfa {page} / {Math.ceil(data.total / data.pageSize)}
              </span>
              <Link
                href={href({ sayfa: String(page + 1) })}
                aria-disabled={page * data.pageSize >= data.total}
                className={`rounded-full border border-zinc-300 px-4 py-1.5 font-medium ${page * data.pageSize >= data.total ? "pointer-events-none opacity-40" : "hover:bg-zinc-50"}`}
              >
                Sonraki
              </Link>
            </nav>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
