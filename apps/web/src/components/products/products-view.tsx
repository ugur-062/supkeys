"use client";

import { ProductShowcaseForm } from "./product-showcase-form";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import {
  useCatalogItems,
  useUpdateShowcase,
  type CatalogItem,
  type ProductShowcase,
} from "@/hooks/use-company-items";
import { Badge } from "@/components/catalyst/badge";
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
} from "@heroicons/react/20/solid";
import { useState } from "react";

/**
 * ÜRÜNLERİM — firmanın herkese açık vitrini.
 *
 * Kalem kataloğuyla AYNI kayıtlar: ilan açarken yazdığınız kalem, birkaç alan
 * doldurulunca vitrine çıkabilen bir ürüne dönüşür. Ayrı bir "ürün" varlığı
 * açmadık — aynı ürünü iki yerde güncelleme borcu üretirdi.
 *
 * Liste ile form aynı sayfada, tek seferde tek ürün düzenlenir: ürün formu
 * uzun (görsel, nitelik, fiyat kademeleri) ve modal içine sığmıyor.
 */
export function ProductsView() {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<{
    item: CatalogItem;
    showcase: ProductShowcase;
  } | null>(null);
  const { data, isLoading } = useCatalogItems(q);
  const save = useUpdateShowcase();

  /**
   * Vitrin alanları liste yanıtında YOK (kalem listesi dar tutuldu). Düzenlemeye
   * geçerken boş bir `showcase` PATCH'i atıp güncel durumu alıyoruz — ayrı bir
   * GET ucu açmak yerine mevcut ucu kullanmak, iki yerde aynı yansıtmayı
   * sürdürme borcunu ortadan kaldırıyor.
   */
  const openEditor = async (item: CatalogItem) => {
    try {
      const showcase = await save.mutateAsync({ id: item.id, patch: {} });
      setEditing({ item, showcase });
    } catch {
      /* hata toast'ı mutation'da */
    }
  };

  if (editing) {
    return (
      <PageContainer>
        <button
          type="button"
          onClick={() => setEditing(null)}
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Ürünlere dön
        </button>
        <PageHeader
          title={editing.item.name}
          description="Vitrin bilgilerini doldurun; tamamlanma skoru sağda canlı güncellenir."
        />
        <div className="mt-8">
          <ProductShowcaseForm
            product={editing.showcase}
            unit={editing.item.unit}
            onClose={() => setEditing(null)}
          />
        </div>
      </PageContainer>
    );
  }

  const items = data?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Ürünlerim"
        description="Firmanızın herkese açık vitrini. Ürünleriniz firma profilinizde ve arama motorlarında görünür."
      />

      <div className="relative mt-6 max-w-md">
        <MagnifyingGlassIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ürün ara"
          className="w-full rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
        />
      </div>

      {isLoading ? (
        <p className="mt-8 text-sm text-zinc-500">Yükleniyor…</p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-zinc-50 px-6 py-10 text-center ring-1 ring-zinc-950/5">
          <p className="text-sm font-semibold text-zinc-900">
            {q ? "Eşleşen ürün yok." : "Henüz ürün yok."}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Kalem kataloğunuza eklediğiniz her kalem burada ürüne
            dönüştürülebilir.
          </p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-950/5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void openEditor(item)}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-zinc-50"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                  <PhotoIcon aria-hidden className="size-5 text-zinc-400" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-950">
                    {item.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">
                    {item.code ? `${item.code} · ` : ""}
                    {item.unit}
                    {item.brand ? ` · ${item.brand}` : ""}
                  </span>
                </span>
                <Badge color="zinc">Düzenle</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      {data?.truncated ? (
        <p className="mt-4 text-xs text-zinc-500">
          Sonuçlar kırpıldı — aramayı daraltın.
        </p>
      ) : null}
    </PageContainer>
  );
}
