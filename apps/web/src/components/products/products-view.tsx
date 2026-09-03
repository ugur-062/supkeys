"use client";

import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { ImportDialog } from "./import-dialog";
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
import { EmptyState } from "@/components/list";
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
} from "@heroicons/react/20/solid";
import { Package } from "lucide-react";
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
/** Boş vitrin kaydı — "yeni ürün" formunun başlangıç değeri. */
const EMPTY_PRODUCT: ProductShowcase = {
  id: "",
  name: "",
  slug: null,
  isPublic: false,
  publishedAt: null,
  categoryId: null,
  description: null,
  images: [],
  videoUrl: null,
  externalUrl: null,
  documents: null,
  keywords: [],
  attributes: null,
  priceMode: "ON_REQUEST",
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  completion: { score: 0, missing: [] },
  publishBlockers: [],
  attributeDefs: [],
};

export function ProductsView() {
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  /** Yeni ürün: AYNI tek-sayfa form, boş kayıtla. */
  const [creating, setCreating] = useState(false);
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

  if (creating) {
    return (
      <PageContainer>
        <button
          type="button"
          onClick={() => setCreating(false)}
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Ürünlere dön
        </button>
        <PageHeader
          title="Yeni ürün"
          description="Tek sayfa: adı, kategorisi, açıklaması, görselleri ve fiyatı. Kaydedince taslak olarak durur; yayımlamak ayrı bir adım."
        />
        <div className="mt-8">
          <ProductShowcaseForm
            mode="new"
            product={EMPTY_PRODUCT}
            unit="adet"
            onClose={() => setCreating(false)}
            onCreated={(created) => {
              // Kayıt oluştu → düzenleme moduna geç: kullanıcı aynı formda
              // kalır, ikinci kaydetme artık güncelleme olur.
              setCreating(false);
              setEditing({
                item: {
                  id: created.id,
                  name: created.name,
                  unit: "adet",
                } as CatalogItem,
                showcase: created,
              });
            }}
          />
        </div>
      </PageContainer>
    );
  }

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
        // "Arama motorlarında görünür" SÖZÜ pazar yeri anahtarına bağlı:
        // ürün sayfası anahtar kapalıyken de AÇIK (görünürlük ≠ indekslenme,
        // 2026-09-03) ama `noindex` alır ve sitemap'e girmez. Anahtar kapalıyken
        // o cümle yalan olur — kullanıcı ürününü Google'da arar, bulamaz.
        description={
          MARKETPLACE_LIVE
            ? "Firmanızın herkese açık vitrini. Ürünleriniz firma profilinizde ve arama motorlarında görünür."
            : "Firmanızın herkese açık vitrini. Ürünleriniz firma profilinizde görünür; arama motorlarına açılma pazar yeri yayınıyla başlar."
        }
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Toplu ekle
            </button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Yeni ürün
            </button>
          </div>
        }
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />


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
        /* Ortak EmptyState (1d): ikon + başlık + tek satır + TEK eylem.
           "Toplu ekle" başlıkta zaten var; burada ikinci kez sunulmaz. */
        <EmptyState
          icon={Package}
          title={q ? "Eşleşen ürün yok." : "Henüz ürün yok."}
          description={
            q
              ? "Aramayı değiştirip tekrar deneyin."
              : "Vitrininize eklediğiniz ürünler firma sayfanızda görünür ve açık talep eşleşmesini besler."
          }
          variant={q ? "no-results" : "no-data"}
          className="mt-4"
          action={
            q ? undefined : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Yeni ürün ekle
              </button>
            )
          }
        />
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
