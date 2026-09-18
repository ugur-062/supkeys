"use client";

import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { useSearchParams } from "next/navigation";

import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { ProductShowcaseForm } from "./product-showcase-form";
import { ProductPreview } from "./product-preview";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import {
  fetchProductShowcase,
  useCatalogItems,
  type CatalogItem,
  type ProductShowcase,
} from "@/hooks/use-company-items";
import { extractErrorMessage } from "@/lib/tenders/error";
import { toast } from "sonner";
import { Badge } from "@/components/catalyst/badge";
import { EmptyState } from "@/components/list";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { formatDate } from "@/lib/format-date";
import { PRODUCT_STATUS, productStatusKey } from "@/lib/company/product-status";
import { ArrowLeftIcon, EllipsisVerticalIcon, EyeIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { Thumb } from "@/components/ui/thumb";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

/** Fiyat modu → kısa etiket (form seçenekleriyle aynı sözcükler). */
const PRICE_MODE_LABEL: Record<CatalogItem["priceMode"], string> = {
  FIXED: "Sabit fiyat",
  TIERED: "Kademeli",
  ON_REQUEST: "Teklif isteyin",
};

/** Seçili durum hapı — rozet renkleriyle aynı sözlük (dolgulu). */
const PILL_ON: Record<"zinc" | "amber" | "emerald" | "red" | "blue", string> = {
  zinc: "bg-zinc-700 text-white",
  amber: "bg-amber-500 text-white",
  emerald: "bg-emerald-600 text-white",
  red: "bg-red-600 text-white",
  blue: "bg-blue-600 text-white",
};

type ProductTab = "all" | "published" | "pending" | "rejected" | "draft";
const TAB_KEYS: ProductTab[] = ["all", "published", "pending", "rejected", "draft"];

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
  reviewStatus: "DRAFT",
  submittedAt: null,
  reviewedAt: null,
  rejectReason: null,
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
  unit: "adet",
  unitCode: "PCE",
  completion: { score: 0, missing: [] },
  publishBlockers: [],
  attributeDefs: [],
};

export function ProductsView() {
  const [q, setQ] = useState("");
  // `?sekme=rejected` — "düzeltme istendi" e-postasındaki CTA doğrudan o sekmeye açar.
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get("sekme") as ProductTab | null;
  const [tab, setTab] = useState<ProductTab>(initialTab && TAB_KEYS.includes(initialTab) ? initialTab : "all");
  // Ürün ekleme/yayın = "Ürün ve vitrin yönetimi" işlem izni (API aynası).
  const canManage = useHasCompanyPermission("sell:product:manage");
  /**
   * Yeni ürün: AYNI tek-sayfa form, boş kayıtla. `?yeni=1` ile açılır —
   * kayıt niyeti "Vitrin aç" ve pano CTA'sı buraya düşer.
   */
  const [creating, setCreating] = useState(searchParams?.get("yeni") === "1");
  const [editing, setEditing] = useState<{
    item: CatalogItem;
    showcase: ProductShowcase;
  } | null>(null);
  const { data, isLoading } = useCatalogItems(q);
  const items = useMemo(() => data?.items ?? [], [data]);
  // Sekme süzgeci istemcide (liste zaten geldi); SAYAÇLAR sunucudan ve firma
  // geneli — arama daraltınca sekme sayısı değişmez, panoyla aynı sayı.
  // Hook'lar erken dönüşlerden (yeni/düzenle görünümleri) ÖNCE.
  const visible = useMemo(
    () =>
      tab === "all"
        ? items
        : items.filter((i) => {
            const k = productStatusKey(i);
            // MECE (2026-09-10, kullanıcı: "Tümü 1 · Yayında 1 · Onay bekliyor 1"
            // tutmuyordu): yayındayken yeniden incelenen ürün YALNIZ Yayında'da
            // (rozeti "Yayında · incelemede"); Onay bekliyor = henüz vitrine
            // çıkmamış olanlar. Sekme sayaçları toplamı = Tümü.
            if (tab === "published") return k === "published" || k === "published_pending";
            if (tab === "pending") return k === "pending";
            if (tab === "rejected") return k === "rejected";
            return k === "draft";
          }),
    [items, tab],
  );

  /**
   * Vitrin alanları liste yanıtında YOK (kalem listesi dar tutuldu); açılışta
   * `GET :id/showcase` okunur (aynı projeksiyon). Eskiden boş PATCH atılıyordu —
   * sunucu boş yamayı "hepsini sil" diye yorumluyordu (görsel/etiket/fiyat her
   * açılışta sıfırlanıyordu) ve inceleme kilidi PATCH'i zaten reddeder.
   *
   * İNCELEMEDEKİ (PENDING) ürün FORMLA AÇILMAZ — salt-okunur önizleme
   * (`ProductPreview`); tek çıkış admin kararı.
   */
  const openEditor = async (item: CatalogItem) => {
    try {
      const showcase = await fetchProductShowcase(item.id);
      setEditing({ item, showcase });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Ürün açılamadı"));
    }
  };

  // Ücretsiz paket YAYINDA ürün tavanı (API `productLimit`, `PRODUCT_LIMITS`
  // aynası): sayaç "N/10", form "Kaydet ve yayınla"yı kilitler. null = limitsiz.
  const productLimit = data?.productLimit ?? null;
  const publishedCount = data?.counts.published ?? 0;
  // Tavan yayında + (yayında olmayan) onay bekleyen — API ile aynı sayım:
  // kuyruktakiler de yer tutar; yayındayken yeniden incelenen iki kez sayılmaz.
  const pendingPublished = items.filter((i) => i.isPublic && i.reviewStatus === "PENDING").length;
  const occupied = publishedCount + Math.max(0, (data?.counts.pending ?? 0) - pendingPublished);
  const publishLimitReached = productLimit != null && occupied >= productLimit;
  // Vitrin kapısı profil yayınına bağlı (`publicProductWhere`): profil yayında
  // değilse yayımlanan ürün dizinde ve firma sayfasında GÖRÜNMEZ. Kullanıcı 10
  // ürün yayımlayıp kimsenin görmediğini fark etmesin — açıkça söyle.
  const profile = useCompanyProfile();
  const profileHidden = profile.data ? !profile.data.publicEnabled : false;

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
          description="Tek sayfa: adı, kategorisi, açıklaması, görselleri ve fiyatı. Kaydedince taslak olarak durur; onaya gönderdiğinizde ekibimiz inceler ve vitrine alır."
        />
        <div className="mt-8">
          <ProductShowcaseForm
            mode="new"
            product={EMPTY_PRODUCT}
            unit="adet"
            publishLimitReached={publishLimitReached}
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
    const inReview = editing.showcase.reviewStatus === "PENDING";
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
          description={
            inReview
              ? "Ürün incelemede — ekibimiz karar verene kadar yalnız önizlenir."
              : "Vitrin bilgilerini doldurun; durum, tamamlanma ve arama görünürlüğü sağda canlı güncellenir."
          }
        />
        <div className="mt-8">
          {inReview ? (
            <ProductPreview product={editing.showcase} item={editing.item} onClose={() => setEditing(null)} />
          ) : (
            <ProductShowcaseForm
              product={editing.showcase}
              unit={editing.item.unit}
              publishLimitReached={publishLimitReached}
              onClose={() => setEditing(null)}
              // Kaydın sunucu hâli ekrana işlenir: incelemeye düştüyse
              // yukarıdaki `inReview` dalı hemen önizlemeyi çizer.
              onSaved={(saved) =>
                setEditing((cur) =>
                  cur ? { item: { ...cur.item, name: saved.name }, showcase: saved } : cur,
                )
              }
            />
          )}
        </div>
      </PageContainer>
    );
  }

  const counts = data?.counts;
  // Sunucunun `pending`i yayında olup yeniden incelenenleri DE sayar (kuyruk
  // ölçüsü); sekmede o ürünler Yayında'da olduğundan düşülür → sekmeler MECE,
  // Tümü = toplam.
  const pendingOnly = counts ? Math.max(0, counts.pending - pendingPublished) : undefined;
  const tabs: { key: ProductTab; label: string; count?: number }[] = [
    { key: "all", label: "Tümü", count: counts && pendingOnly != null ? counts.published + counts.draft + counts.rejected + pendingOnly : undefined },
    { key: "published", label: PRODUCT_STATUS.published.label, count: counts?.published },
    { key: "pending", label: PRODUCT_STATUS.pending.label, count: pendingOnly },
    { key: "rejected", label: PRODUCT_STATUS.rejected.label, count: counts?.rejected },
    { key: "draft", label: PRODUCT_STATUS.draft.label, count: counts?.draft },
  ];

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
            ? "Firmanızın herkese açık vitrini. Onaya gönderdiğiniz ürünler ekibimizce incelenir; onaylananlar firma profilinizde ve arama motorlarında görünür."
            : "Firmanızın herkese açık vitrini. Onaya gönderdiğiniz ürünler ekibimizce incelenir; onaylananlar firma profilinizde görünür, arama motorlarına açılma pazar yeri yayınıyla başlar."
        }
        action={
          // TOPLU EKLEME KALDIRILDI (2026-09-15, kullanıcı kararı): Excel
          // şablonu görselsiz ürün üretiyordu, 200-300 sayfalık katalogdan AI
          // çıkarımı pratikte çalışmıyordu. Ürün TEK TEK, görseliyle eklenir.
          !canManage ? undefined : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Yeni ürün
            </button>
          )
        }
      />


      {/* DURUM HAPLARI + ARAMA tek satırda (2026-09-18, kullanıcı: "üstteki
          büyük kutuları kaldır"). Hap = süzgeç; seçili olan durum renginde
          (Tümü mavi), sayaç rozeti içinde. Sayaçlar firma geneli, MECE. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Ürün durumu">
          {tabs.map((t) => {
            const active = tab === t.key;
            const color = t.key === "all" ? "blue" : PRODUCT_STATUS[t.key].color;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  active ? PILL_ON[color] : "bg-white text-zinc-600 ring-1 ring-zinc-950/10 hover:ring-zinc-950/30",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "tabular-nums rounded-full px-1.5 py-0.5 text-xs",
                    active ? "bg-white/25 text-white" : t.count === 0 ? "bg-zinc-100 text-zinc-400" : "bg-zinc-100 text-zinc-700",
                  )}
                >
                  {t.count == null ? "—" : t.key === "published" && productLimit != null ? `${t.count}/${productLimit}` : t.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-72">
          <MagnifyingGlassIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ürünlerde ara…"
            className="w-full rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
          />
        </div>
      </div>

      {profileHidden ? (
        <p className="mt-3 max-w-2xl rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/20">
          Firma profiliniz henüz herkese açık değil: ürünleriniz profil yayınlanana kadar dizinde ve
          firma sayfanızda görünmez.{" "}
          <a href="/company/sirketim/profil" className="font-medium underline">
            Profili yayınla
          </a>
          .
        </p>
      ) : null}

      {productLimit != null ? (
        <p
          className={`mt-3 max-w-2xl rounded-lg px-3 py-2 text-sm ${
            publishLimitReached ? "bg-amber-50 text-amber-900 ring-1 ring-amber-600/20" : "bg-zinc-50 text-zinc-600"
          }`}
        >
          Ücretsiz pakette en fazla {productLimit} ürün yayında ya da onayda olabilir ({occupied}/{productLimit}
          {" "}kullanıldı). Taslak sınırsız.{" "}
          <a href="/nasil-calisir#fiyatlar" className="font-medium text-zinc-900 underline">
            Silver ile sınırsız ürün, belge ve video
          </a>
          .
        </p>
      ) : null}

      {isLoading ? (
        <p className="mt-8 text-sm text-zinc-500">Yükleniyor…</p>
      ) : visible.length === 0 ? (
        /* Ortak EmptyState (1d): ikon + başlık + tek satır + TEK eylem. */
        <EmptyState
          icon={Package}
          title={
            q
              ? "Eşleşen ürün yok."
              : tab === "published"
                ? "Yayında ürün yok."
                : tab === "pending"
                  ? "Onay bekleyen ürün yok."
                  : tab === "rejected"
                    ? "Düzeltme istenen ürün yok."
                    : tab === "draft"
                      ? "Taslak ürün yok."
                      : "Henüz ürün yok."
          }
          description={
            q
              ? "Aramayı değiştirip tekrar deneyin."
              : tab === "published"
                ? "Taslak ürünleri düzenleyip 'Onaya gönder' ile inceleme kuyruğuna alın; onaylananlar burada görünür."
                : tab === "pending"
                  ? "Onaya gönderdiğiniz ürünler inceleme boyunca burada durur; yayındayken yeniden incelenenler Yayında sekmesinde kalır."
                  : tab === "rejected"
                    ? "Düzeltme istenen ürün gerekçesiyle burada listelenir; düzenleyip yeniden gönderebilirsiniz."
                    : "Vitrininize eklediğiniz ürünler firma sayfanızda görünür ve açık talep eşleşmesini besler."
          }
          variant={q || tab !== "all" ? "no-results" : "no-data"}
          className="mt-4"
          action={
            q || tab !== "all" || !canManage ? undefined : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Yeni ürün ekle
              </button>
            )
          }
        />
      ) : (
        <ProductRows items={visible} onOpen={(item) => void openEditor(item)} />
      )}

      {data?.truncated ? (
        <p className="mt-4 text-xs text-zinc-500">
          Sonuçlar kırpıldı — aramayı daraltın.
        </p>
      ) : null}
    </PageContainer>
  );
}

/**
 * TABLO (2026-09-18, kullanıcı mockup'ı): Ürün (görsel + ad + kategori) ·
 * Durum · Kategori · Fiyat · Stok/Min. sipariş · Görüntülenme · Eklenme ·
 * İşlemler. Satır tıklanır (düzenleyici/önizleme). Düzeltme gerekçesi ad
 * altında. Mobilde yatay kaydırma (tablo kendi kapsayıcısında).
 */
function ProductRows({
  items,
  onOpen,
}: {
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  const ids = useMemo(
    () => [...new Set(items.map((i) => i.categoryId).filter((c): c is string => !!c))],
    [items],
  );
  const cats = useCategoriesByIds(ids);
  const catName = (id: string | null) =>
    id ? (cats.data?.find((c) => c.id === id)?.nameTr ?? null) : null;
  const price = (it: CatalogItem) =>
    it.priceMode === "ON_REQUEST" || it.priceAmount == null
      ? PRICE_MODE_LABEL[it.priceMode] ?? it.priceMode
      : `${Number(it.priceAmount).toLocaleString("tr-TR")} ${(CURRENCY_SYMBOL as Record<string, string>)[it.priceCurrency ?? "TRY"] ?? it.priceCurrency ?? ""} / ${it.unit}${it.priceMode === "TIERED" ? " (kademeli)" : ""}`;
  const th = "px-3 py-3 text-left text-xs font-semibold tracking-wide text-zinc-500";
  return (
    <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="border-b border-zinc-950/5">
          <tr>
            <th scope="col" className={th}>Ürün</th>
            <th scope="col" className={th}>Durum</th>
            <th scope="col" className={cn(th, "hidden 2xl:table-cell")}>Kategori</th>
            <th scope="col" className={th}>Fiyat</th>
            <th scope="col" className={th}>Min. sipariş</th>
            <th scope="col" className={th}>Görüntülenme</th>
            <th scope="col" className={th}>Eklenme</th>
            <th scope="col" className={cn(th, "text-right")}>
              <span className="sr-only">İşlemler</span>
            </th>
          </tr>
        </thead>
        <tbody role="list" className="divide-y divide-zinc-950/5">
          {items.map((item) => {
            const st = PRODUCT_STATUS[productStatusKey(item)];
            return (
              <tr
                key={item.id}
                role="listitem"
                onClick={() => onOpen(item)}
                className="cursor-pointer transition hover:bg-zinc-50"
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb src={item.thumbnailUrl} size="md" className="shrink-0" />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(item);
                        }}
                        className="block max-w-[16rem] truncate text-left font-semibold text-zinc-950 hover:underline"
                      >
                        {item.name}
                      </button>
                      <div className="max-w-[16rem] truncate text-xs text-zinc-500">
                        {catName(item.categoryId) ?? "Kategori seçilmedi"} · {PRICE_MODE_LABEL[item.priceMode] ?? item.priceMode} · {item.unit}
                        {item.reviewStatus === "REJECTED" && item.rejectReason ? ` · Düzeltme: ${item.rejectReason}` : ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Badge color={st.color}>{st.label}</Badge>
                </td>
                <td className="hidden max-w-[12rem] truncate px-3 py-3 text-zinc-700 2xl:table-cell">{catName(item.categoryId) ?? "—"}</td>
                <td className="px-3 py-3 whitespace-nowrap tabular-nums text-zinc-700">{price(item)}</td>
                <td className="px-3 py-3 whitespace-nowrap tabular-nums text-zinc-700">
                  {item.moq != null ? `Min. ${Number(item.moq).toLocaleString("tr-TR")} ${item.unit}` : "—"}
                </td>
                <td className="px-3 py-3 whitespace-nowrap tabular-nums text-zinc-700">
                  {item.viewCount != null ? (
                    <span className="inline-flex items-center gap-1.5"><EyeIcon className="size-4 text-zinc-400" />{item.viewCount.toLocaleString("tr-TR")}</span>
                  ) : "—"}
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-zinc-700">
                  {formatDate(item.createdAt ?? item.updatedAt, "short")}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    aria-label={`${item.name} — aç`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(item);
                    }}
                    className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <EllipsisVerticalIcon className="size-5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
