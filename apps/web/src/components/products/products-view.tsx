"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useQuantityLabel, useUnitLabel } from "@/i18n/domain";
import { formatNumber } from "@/i18n/format";
import { useProductStatusMeta } from "./product-status-label";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { defaultCurrencyForCountry } from "@rothern/shared";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { useSearchParams } from "next/navigation";

import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { VERIFY_HREF } from "@/components/company/verification-gate";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from "@/components/catalyst/dropdown";
import { FAB_CLEARANCE_SM_CLASS } from "@/components/company-shell/assistant/fab-clearance";
import { useProductArchive } from "./use-product-archive";
import { ProductShowcaseForm } from "./product-showcase-form";
import { ProductPreview } from "./product-preview";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import {
  fetchProductShowcase,
  useShowcaseItems,
  type CatalogItem,
  type ProductShowcase,
} from "@/hooks/use-company-items";
import { extractErrorMessage } from "@/lib/tenders/error";
import { toast } from "sonner";
import { Badge } from "@/components/catalyst/badge";
import { EmptyState } from "@/components/list";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { formatDate } from "@/lib/format-date";
import { productStatusKey } from "@/lib/company/product-status";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { ArrowLeftIcon, EllipsisVerticalIcon, EyeIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { Thumb } from "@/components/ui/thumb";
import { affixCurrency } from "@/lib/tenders/labels";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type ProductTab = "all" | "published" | "pending" | "rejected" | "draft" | "archived";
const TAB_KEYS: ProductTab[] = ["all", "published", "pending", "rejected", "draft", "archived"];

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
/**
 * Boş vitrin kaydı — "yeni ürün" formunun başlangıç değeri. Para birimi
 * burada yalnız yer tutucu: çizimde FİRMANIN ülkesinden gelir (API de
 * gönderilmeyen birimi aynı kuralla doldurur).
 */
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
  brand: null,
  mpn: null,
  specification: null,
  completion: { score: 0, missing: [] },
  publishBlockers: [],
  attributeDefs: [],
};

export function ProductsView() {
  const tr = useTranslations("web.panel.trade.productsView");
  // Yeni ürün firmanın ülkesinin para birimiyle doğar (2026-09-27; eskiden
  // her ürün TRY ile başlıyordu — Alman satıcı her seferinde elle EUR seçiyordu).
  const { company } = useCompanyAuth();
  const newProduct = useMemo(
    () => ({ ...EMPTY_PRODUCT, priceCurrency: defaultCurrencyForCountry(company?.country) }),
    [company?.country],
  );
  const statusMeta = useProductStatusMeta();
  const [q, setQ] = useState("");
  // `?sekme=rejected` — "düzeltme istendi" e-postasındaki CTA doğrudan o sekmeye açar.
  const searchParams = useSearchParams();
  const initialTab = searchParams?.get("sekme") as ProductTab | null;
  const [tab, setTabState] = useState<ProductTab>(initialTab && TAB_KEYS.includes(initialTab) ? initialTab : "all");
  // Sekme URL'de (`?sekme=`) — yenileme/Geri sonrası aynı sekme (arayüz testi D-131).
  const setTab = (next: ProductTab) => {
    setTabState(next);
    const u = new URL(window.location.href);
    if (next === "all") u.searchParams.delete("sekme");
    else u.searchParams.set("sekme", next);
    window.history.replaceState(null, "", u.toString());
  };
  // Ürün ekleme/yayın = "Ürün ve vitrin yönetimi" işlem izni (API aynası).
  const canManage = useHasCompanyPermission("sell:product:manage");
  /**
   * Yeni ürün: AYNI tek-sayfa form, boş kayıtla. `?yeni=1` ile açılır —
   * kayıt niyeti "Vitrin aç" ve pano CTA'sı buraya düşer. YALNIZ yönetim
   * izniyle (arayüz testi O-099): salt-okur kullanıcıya `?yeni=1` boş,
   * düzenlenebilir form açıyordu; istek izin gelene dek bekler, izinsizde liste.
   */
  const [createRequested, setCreating] = useState(searchParams?.get("yeni") === "1");
  const creating = createRequested && canManage;
  const [editing, setEditing] = useState<{
    item: CatalogItem;
    showcase: ProductShowcase;
  } | null>(null);
  // Sekme süzgeci ve "en yeni üstte" SUNUCUDA, 50'şer sayfa (yayın denetimi
  // 2026-09-28 Bölüm 6); sayaçlar ilk sayfada ve firma geneli.
  // Arama GECİKMELİ (arayüz testi D-286): her tuş ayrı istek atıyordu.
  const debouncedQ = useDebouncedValue(q.trim(), 300);
  const showcase = useShowcaseItems(debouncedQ, tab);
  // "Yükleniyor" `isPending`e bağlı, `isLoading`e değil (gözden geçirme REV-2):
  // çevrimdışı cihazda sorgu DURAKLAR (istek yok, hata yok, veri yok) ve
  // `isLoading` false kalır — "Henüz ürün yok." + "Yeni ürün ekle" çiziliyordu.
  // Arama / sekme değişiminde önceki liste yer tutucudur: pending değil.
  const { isPending } = showcase;
  const data = showcase.data?.pages[0];
  const items = useMemo(() => showcase.data?.pages.flatMap((p) => p.items) ?? [], [showcase.data]);
  // Sekme süzgeci istemcide (liste zaten geldi); SAYAÇLAR sunucudan ve firma
  // geneli — arama daraltınca sekme sayısı değişmez, panoyla aynı sayı.
  // Hook'lar erken dönüşlerden (yeni/düzenle görünümleri) ÖNCE.
  // Sekme SUNUCUDA süzülür; MECE kuralı API'de (yayındayken yeniden incelenen
  // yalnız "Yayında"da — `SHOWCASE_STATUS_WHERE`, web `productStatusKey` aynası).
  const visible = items;

  /**
   * Vitrin alanları liste yanıtında YOK (kalem listesi dar tutuldu); açılışta
   * `GET :id/showcase` okunur (aynı projeksiyon). Eskiden boş PATCH atılıyordu —
   * sunucu boş yamayı "hepsini sil" diye yorumluyordu (görsel/etiket/fiyat her
   * açılışta sıfırlanıyordu) ve inceleme kilidi PATCH'i zaten reddeder.
   *
   * İNCELEMEDEKİ (PENDING) ürün FORMLA AÇILMAZ — salt-okunur önizleme
   * (`ProductPreview`); tek çıkış admin kararı.
   */
  // Yayındaki ürün ÖNCE önizlemeyle açılır, "Düzenle" forma geçirir (2026-09-19).
  const [editorOpen, setEditorOpen] = useState(false);
  /**
   * KAYDEDİLMEMİŞ DEĞİŞİKLİK (arayüz testi O-098): bayrak formdan gelir; sekme
   * kapatma, kenar çubuğu/üst çubuk bağlantıları ve "Ürünlere dön" aynı onayı
   * sorar. Eskiden yalnız sekme kapatma uyarıyordu, veri sessizce kayboluyordu.
   */
  const [formDirty, setFormDirty] = useState(false);
  const { confirmLeave } = useUnsavedChangesGuard(formDirty);
  const backTo = (close: () => void) => async () => {
    if (await confirmLeave()) close();
  };
  const productArchive = useProductArchive();

  /**
   * AÇIK ÜRÜN URL'DE (`?urun=<id>`, arayüz testi D-131): ürün açılınca adres
   * değişmiyordu — tarayıcının Geri'si Ürünlerim'den tamamen çıkarıyor, bilgi
   * talebinden ürüne derin bağlantı verilemiyordu. Açılış `pushState` (Geri
   * listeye döner), kapanış bizim eklediğimiz kaydı geri alır; doğrudan
   * `?urun=` ile gelindiyse adres yerinde temizlenir.
   */
  const pushedUrlRef = useRef(false);
  const setUrlParam = (key: "urun" | "yeni", value: string | null, push = false) => {
    const u = new URL(window.location.href);
    if (value) u.searchParams.set(key, value);
    else u.searchParams.delete(key);
    if (u.toString() === window.location.href) return;
    if (push) {
      window.history.pushState(null, "", u.toString());
      pushedUrlRef.current = true;
    } else {
      window.history.replaceState(null, "", u.toString());
    }
  };
  const closeProduct = () => {
    setEditing(null);
    if (pushedUrlRef.current) {
      pushedUrlRef.current = false;
      window.history.back();
    } else {
      setUrlParam("urun", null);
    }
  };
  const openEditor = async (item: CatalogItem) => {
    try {
      const showcase = await fetchProductShowcase(item.id);
      setEditorOpen(false);
      setEditing({ item, showcase });
      setUrlParam("urun", item.id, true);
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("urunAcilamadi")));
    }
  };

  // Adresteki ürün DEĞİŞİNCE (derin bağlantı, Geri/İleri) görünüm izler.
  // Yalnız URL değişimine tepki verir: açılışta durum adresten önce güncellenir.
  const urlProductId = searchParams?.get("urun") ?? null;
  const lastUrlProductId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastUrlProductId.current === urlProductId) return;
    const previous = lastUrlProductId.current;
    lastUrlProductId.current = urlProductId;
    if (!urlProductId) {
      // İlk çizim ya da kapanışı biz yaptık (`closeProduct` durumu önce temizler).
      if (previous === undefined || !editing) return;
      pushedUrlRef.current = false;
      // Geri'ye basıldı: kaydedilmemiş değişiklik varsa önce sor; kalırsa
      // adres geri yazılır.
      void confirmLeave().then((leave) => {
        if (leave) {
          setFormDirty(false);
          setEditing(null);
        } else if (previous) {
          setUrlParam("urun", previous, true);
        }
      });
      return;
    }
    if (editing?.item.id === urlProductId) return;
    let cancelled = false;
    fetchProductShowcase(urlProductId)
      .then((sc) => {
        if (cancelled) return;
        setEditorOpen(false);
        setEditing({ item: { id: sc.id, name: sc.name, unit: sc.unit } as CatalogItem, showcase: sc });
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(extractErrorMessage(err, tr("urunAcilamadi")));
        setUrlParam("urun", null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız adres değişimi
  }, [urlProductId]);

  // Ücretsiz paket YAYINDA ürün tavanı (API `productLimit`, `PRODUCT_LIMITS`
  // aynası): sayaç "N/10", form "Kaydet ve yayınla"yı kilitler. null = limitsiz.
  const productLimit = data?.productLimit ?? null;
  const publishedCount = data?.counts.published ?? 0;
  // Tavan yayında + (yayında olmayan) onay bekleyen — API ile aynı sayım:
  // kuyruktakiler de yer tutar; yayındayken yeniden incelenen iki kez sayılmaz.
  const pendingPublished = data?.counts.publishedInReview ?? 0;
  const occupied = publishedCount + Math.max(0, (data?.counts.pending ?? 0) - pendingPublished);
  const publishLimitReached = productLimit != null && occupied >= productLimit;
  // Liste yanıtı gelmeden tavan BİLİNMİYOR → form "Onaya gönder"i kilitli tutar
  // (arayüz testi D-287; `?yeni=1` doğrudan açılışta etkin geliyordu).
  const limitPending = !data && !showcase.isError;
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
          onClick={backTo(() => {
            setCreating(false);
            setUrlParam("yeni", null);
          })}
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {tr("urunlereDon")}
        </button>
        {/* Başlık eylem çubuğunda (ad + durum + Kaydet) — ayrı sayfa başlığı yok. */}
        <div className="mt-2">
          <ProductShowcaseForm
            mode="new"
            product={newProduct}
            unit="adet"
            publishLimitReached={publishLimitReached}
            limitPending={limitPending}
            onDirtyChange={setFormDirty}
            onClose={() => {
              setCreating(false);
              setUrlParam("yeni", null);
            }}
            onCreated={(created) => {
              // Kayıt oluştu → düzenleme moduna geç: kullanıcı aynı formda
              // kalır, ikinci kaydetme artık güncelleme olur. Adres de ürünün
              // kendisine döner (`?yeni=1` → `?urun=<id>`).
              setCreating(false);
              setUrlParam("yeni", null);
              setUrlParam("urun", created.id);
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
    const publishedPreview = !inReview && editing.showcase.isPublic && !editorOpen;
    return (
      <PageContainer>
        <button
          type="button"
          onClick={backTo(closeProduct)}
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          {tr("urunlereDon")}
        </button>
        {inReview ? (
          <PageHeader title={editing.item.name} description={tr("urunIncelemedeEkibimizKararVerene")} />
        ) : null}
        <div className={inReview ? "mt-8" : "mt-2"}>
          {inReview ? (
            <ProductPreview product={editing.showcase} onClose={closeProduct} />
          ) : publishedPreview ? (
            <ProductPreview
              variant="published"
              product={editing.showcase}
              onClose={closeProduct}
              onEdit={() => setEditorOpen(true)}
            />
          ) : (
            <ProductShowcaseForm
              product={editing.showcase}
              unit={editing.item.unit}
              publishLimitReached={publishLimitReached}
              limitPending={limitPending}
              onDirtyChange={setFormDirty}
              onClose={closeProduct}
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
    { key: "all", label: tr("tumu"), count: counts && pendingOnly != null ? counts.published + counts.draft + counts.rejected + pendingOnly : undefined },
    { key: "published", label: statusMeta("published").label, count: counts?.published },
    { key: "pending", label: statusMeta("pending").label, count: pendingOnly },
    { key: "rejected", label: statusMeta("rejected").label, count: counts?.rejected },
    { key: "draft", label: statusMeta("draft").label, count: counts?.draft },
    // Arşiv (arayüz testi O-039): firma geneli sayaç yok — rozet çizilmez.
    { key: "archived", label: tr("arsiv") },
  ];

  return (
    <PageContainer>
      <PageHeader
        title={tr("urunlerim")}
        // "Arama motorlarında görünür" SÖZÜ pazar yeri anahtarına bağlı:
        // ürün sayfası anahtar kapalıyken de AÇIK (görünürlük ≠ indekslenme,
        // 2026-09-03) ama `noindex` alır ve sitemap'e girmez. Anahtar kapalıyken
        // o cümle yalan olur — kullanıcı ürününü Google'da arar, bulamaz.
        description={
          MARKETPLACE_LIVE
            ? tr("firmanizinHerkeseAcikVitriniOnaya")
            : tr("firmanizinHerkeseAcikVitriniOnaya2")
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
              {tr("yeniUrun")}
            </button>
          )
        }
      />


      {/* DURUM HAPLARI + ARAMA tek satırda (2026-09-18, kullanıcı: "üstteki
          büyük kutuları kaldır"). Hap = süzgeç; seçili olan portal renginde
          (emerald), sayaç rozeti içinde. Sayaçlar firma geneli, MECE. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={tr("urunDurumu")}>
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                  // Satış portalı: seçili ve hover YEŞİL (2026-09-19, kullanıcı:
                  // "üstüne gelince mavi ama yeşil olmalı"); durum rengi rozette kalır.
                  active
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-emerald-50 hover:text-emerald-800 hover:ring-emerald-600/30",
                )}
              >
                {t.label}
                {/* Düz sayı (arayüz testi D-196): "Yayında 0/50" tavanı yalnız
                    yayındakilerle ölçüyormuş gibi okunuyordu; tavan "yayında +
                    onayda" ve aşağıdaki notta. */}
                {t.key === "archived" ? null : (
                  <span
                    className={cn(
                      "tabular-nums rounded-full px-1.5 py-0.5 text-xs",
                      active ? "bg-white/25 text-white" : t.count === 0 ? "bg-zinc-100 text-zinc-400" : "bg-zinc-100 text-zinc-700",
                    )}
                  >
                    {t.count == null ? "—" : t.count}
                  </span>
                )}
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
            placeholder={tr("urunlerdeAra")}
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pr-3 pl-9 text-sm shadow-sm outline-none placeholder:text-zinc-500 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
          />
        </div>
      </div>

      {profileHidden ? (
        <p className="mt-3 max-w-2xl rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-600/20">
          {tr.rich("firmaProfilinizHenuzHerkeseAcikDegil", {
            link: (c) => (
              <Link href="/company/sirketim/profil" className="font-medium underline">
                {c}
              </Link>
            ),
          })}
        </p>
      ) : null}

      {productLimit != null ? (
        <p
          className={`mt-3 max-w-2xl rounded-lg px-3 py-2 text-sm ${
            publishLimitReached ? "bg-amber-50 text-amber-900 ring-1 ring-amber-600/20" : "bg-zinc-50 text-zinc-600"
          }`}
        >
          {tr.rich("dogrulanmamisFirmadaEnFazlaUrun", {
            limit: productLimit,
            occupied,
            link: (c) => (
              // Tavan doğrulamayla kalkar: bağlantı doğrulama akışına gider,
              // paneli TERK ETMEZ (ücretsiz dönem 2026-10-07).
              <Link href={VERIFY_HREF} className="font-medium text-zinc-900 underline">
                {c}
              </Link>
            ),
          })}
        </p>
      ) : null}

      {isPending ? (
        <p className="mt-8 text-sm text-zinc-500">{tr("yukleniyor")}</p>
      ) : showcase.isError && !showcase.data ? (
        /* HATA ≠ BOŞ (canlı doğrulama OUT-2): API kesintisinde 93 ürünü olan
           firmaya "Henüz ürün yok." + "Yeni ürün ekle" çiziliyordu. Boş durum
           yalnız başarılı ve boş yanıtta; okunamayan liste hata kartı alır. */
        <ErrorState className="mt-4" onRetry={() => void showcase.refetch()} />
      ) : visible.length === 0 ? (
        /* Ortak EmptyState (1d): ikon + başlık + tek satır + TEK eylem. */
        <EmptyState
          icon={Package}
          title={
            q
              ? tr("eslesenUrunYok")
              : tab === "archived"
                ? tr("arsivdeUrunYok")
                : tab === "published"
                ? tr("yayindaUrunYok")
                : tab === "pending"
                  ? tr("onayBekleyenUrunYok")
                  : tab === "rejected"
                    ? tr("duzeltmeIstenenUrunYok")
                    : tab === "draft"
                      ? tr("taslakUrunYok")
                      : tr("henuzUrunYok")
          }
          description={
            q
              ? tr("aramayiDegistiripTekrarDeneyin")
              : tab === "archived"
                ? tr("arsivlenenUrunlerBuradaDurur")
                : tab === "published"
                ? tr("taslakUrunleriDuzenleyipOnayaGonder")
                : tab === "pending"
                  ? tr("onayaGonderdiginizUrunlerIncelemeBoyunca")
                  : tab === "rejected"
                    ? tr("duzeltmeIstenenUrunGerekcesiyleBurada")
                    : tr("vitrininizeEklediginizUrunlerFirmaSayfanizda")
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
                {tr("yeniUrunEkle")}
              </button>
            )
          }
        />
      ) : (
        <ProductRows
          items={visible}
          archived={tab === "archived"}
          canManage={canManage}
          busy={productArchive.pending}
          onOpen={(item) => void openEditor(item)}
          onArchive={(item) => void productArchive.archive(item.id)}
          onRestore={(item) => void productArchive.restore(item.id)}
        />
      )}

      {showcase.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => void showcase.fetchNextPage()} disabled={showcase.isFetchingNextPage}>
            {tr("dahaFazlaYukle")}
          </Button>
        </div>
      ) : null}
    </PageContainer>
  );
}

/**
 * GENİŞ SÜTUNLAR TABLO KARTININ GENİŞLİĞİNE GÖRE (mobil denetim 2026-10, beşinci
 * tur). Eskiden ekran kırılımıyla açılıyorlardı (Min. sipariş + Görüntülenme xl,
 * Kategori + Eklenme 2xl); sabitlenmiş kenar çubuğuyla 1280'de kart 944 px,
 * 1536'da 1200 px ve RU sütunların en dar hâli bile sığmıyordu (gerçek veriyle
 * 1280'de 6, 1536'da 29 px taşma; "Опубликован · на проверке" rozetli tek satır
 * Действия sütununu kartın dışına itiyor, ⋮ AI düğmesinin sütununa düşüyor,
 * sayfa yana kayıyordu). Eşikler RU'nun ölçülen en dar sütun toplamı + pay:
 * Min. sipariş 58rem (≈850 px gerekli), Görüntülenme 64rem (≈950), Eklenme
 * 72rem (≈1070), Kategori 77rem (≈1230; kartın tavanı 1240). Kart kenar
 * çubuğu sabitken de ray hâlindeyken de kendi genişliğini ölçer; ray üzerine
 * gelinip genişleyince (içeriği İTER) bir geniş sütun o süre için kapanabilir —
 * bilerek: eskiden aynı anda tablo kartın dışına taşıyordu. Ölçüm (RU + TR,
 * "Опубликован · на проверке" / "Требуются исправления" rozetli satırla):
 * 1024–1920, sabit ve ray, ⋮ her genişlikte AI düğmesinin ≥ 8 px solunda.
 */
const WIDE_COLUMN = {
  minSiparis: "hidden @[58rem]:table-cell",
  goruntulenme: "hidden @[64rem]:table-cell",
  eklenme: "hidden @[72rem]:table-cell",
  kategori: "hidden @[77rem]:table-cell",
} as const;

/**
 * TABLO (2026-09-18, kullanıcı mockup'ı): Ürün (görsel + ad + kategori) ·
 * Durum · Kategori · Fiyat · Min. sipariş · Görüntülenme · Eklenme ·
 * İşlemler. Satır tıklanır (düzenleyici/önizleme). Düzeltme gerekçesi ad
 * altında.
 *
 * YATAY KAYDIRMA YOK (2026-09-18, kullanıcı: "scroll bar olmasın, tabloyu
 * oturt"): tablo kapsayıcıya sığar; alan daraldıkça sütunlar SIRAYLA
 * gizlenir — Fiyat md (640-767 px'te sığmıyordu), Durum sm; geniş sütunlar
 * TABLO KARTININ KENDİ genişliğine göre (`@container`, `WIDE_COLUMN`).
 * Kategori zaten ad altındaki ikinci satırda okunur, bilgi kaybolmaz. Ad ve
 * kategori sm'den itibaren tek satırda kısaltılır; telefonda iki satıra kadar
 * sarar (`wrap-anywhere`: uzun kod tablo hücresini genişletmesin).
 */
function ProductRows({
  items,
  archived,
  canManage,
  busy,
  onOpen,
  onArchive,
  onRestore,
}: {
  items: CatalogItem[];
  /** Arşiv sekmesi: satır açılmaz (arşivdeki ürün düzenlenmez), menüde yalnız "Geri al". */
  archived: boolean;
  canManage: boolean;
  busy: boolean;
  onOpen: (item: CatalogItem) => void;
  onArchive: (item: CatalogItem) => void;
  onRestore: (item: CatalogItem) => void;
}) {
  const t = useTranslations("web.panel.trade.productsView");
  const statusMeta = useProductStatusMeta();
  const unitLabel = useUnitLabel();
  const quantity = useQuantityLabel();
  const locale = useLocale();
  const ids = useMemo(
    () => [...new Set(items.map((i) => i.categoryId).filter((c): c is string => !!c))],
    [items],
  );
  const cats = useCategoriesByIds(ids);
  const catName = (id: string | null) =>
    id ? (cats.data?.find((c) => c.id === id)?.nameTr ?? null) : null;
  /** Fiyat modu → kısa etiket (form seçenekleriyle aynı sözcükler); bilinmeyen kod olduğu gibi. */
  const priceModeLabel = (m: CatalogItem["priceMode"]) =>
    t.has(`priceMode.${m}` as never) ? t(`priceMode.${m}` as never) : m;
  /**
   * Fiyat hücresi SARABİLİR ama yalnız parçalar arasında (mobil denetim 2026-10,
   * beşinci tur): tutar ("1 250 000,00 ₽") ve birim kendi içinde bölünmez, eğik
   * çizgi birime bağlı kalır ("/ шт."), kademeli eki ayrı satıra inebilir. Eskiden
   * hücre `whitespace-nowrap`tı; uzun kademeli fiyat (RU 272 px) 768'de tabloyu 98,
   * 1240 px'lik kartta 120 px taşırıp ⋮'yi AI düğmesinin altına itiyordu. Yer
   * varken tablo hücreyi yine tek satırda bırakır.
   */
  const unbreakable = (s: string) => s.replace(/ /g, "\u00a0");
  const price = (it: CatalogItem) =>
    it.priceMode === "ON_REQUEST" || it.priceAmount == null
      ? priceModeLabel(it.priceMode)
      : t(it.priceMode === "TIERED" ? "fiyatBirimKademeli" : "fiyatBirim", {
          amount: unbreakable(affixCurrency(formatNumber(Number(it.priceAmount), locale), it.priceCurrency ?? "TRY", locale)),
          unit: unbreakable(unitLabel(it.unit)),
        }).replace(" / ", " /\u00a0");
  const th = "px-3 py-3 text-left text-xs font-semibold tracking-wide text-zinc-500";
  /** Satırda ⋮ menüsü var mı (arşivde yalnız yönetebilen "Geri al" görür). */
  const hasMenu = !(archived && !canManage);
  return (
    <div className="@container mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-950/5">
          <tr>
            <th scope="col" className={th}>{t("urun")}</th>
            <th scope="col" className={cn(th, "hidden sm:table-cell")}>{t("durum")}</th>
            <th scope="col" className={cn(th, WIDE_COLUMN.kategori)}>{t("kategori")}</th>
            {/* Fiyat md'den (mobil denetim 2026-10): 640-767 px'te Ürün + Durum + Fiyat
                + ⋮ (AI düğmesi payıyla 120 px) içeriğe sığmıyordu — tablo 592 px'lik
                alanda TR 626, RU 687 px oluyor, ⋮ kesiliyor ve AI düğmesinin
                sütununa düşüyordu. Telefon satırı da fiyatı göstermez. */}
            <th scope="col" className={cn(th, "hidden md:table-cell")}>{t("fiyat")}</th>
            <th scope="col" className={cn(th, WIDE_COLUMN.minSiparis)}>{t("minSiparis")}</th>
            <th scope="col" className={cn(th, WIDE_COLUMN.goruntulenme)}>{t("goruntulenme")}</th>
            <th scope="col" className={cn(th, WIDE_COLUMN.eklenme)}>{t("eklenme")}</th>
            {/* Telefonda ⋮ sütunu sıfır genişlikte (⋮ durum satırında; aşağıda). */}
            <th scope="col" className={cn(th, "text-right max-sm:w-0 max-sm:px-0")}>
              <span className="sr-only">{t("islemler")}</span>
            </th>
          </tr>
        </thead>
        <tbody role="list" className="divide-y divide-zinc-950/5">
          {items.map((item) => {
            // Arşivdeki ürün vitrinde DEĞİL (publicProductWhere isActive ister) — "Yayında" yazmasın.
            const st = archived ? { label: t("arsiv"), color: "zinc" as const } : statusMeta(productStatusKey(item));
            return (
              <tr
                key={item.id}
                role="listitem"
                onClick={archived ? undefined : () => onOpen(item)}
                className={archived ? undefined : "cursor-pointer transition hover:bg-zinc-50"}
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb src={item.thumbnailUrl} size="md" className="shrink-0" />
                    {/* TELEFON (mobil denetim g09): yalnız bu sütun görünür; ad ve alt satır
                        tek satıra (176 px) kırpılınca benzer ürünler ("… M12x50 DIN 933")
                        ayırt edilemiyordu → sm altında iki satıra kadar sarar; sm'den
                        itibaren eski tek satır + genişlik tavanları.
                        AI düğmesi sütunu (mobil denetim 2026-10, dördüncü tur): telefonda
                        satırın sağ ucu (390'da 334-378) AI Asistan düğmesinin sütunu.
                        Tıklanan ad düğmesi `max-sm:mr-9` ile o sütunun 8 px solunda biter;
                        alt satır (düz metin) tam genişliği kullanır. */}
                    <div className="min-w-0">
                      {archived ? (
                        <span
                          title={item.name}
                          className="block font-semibold text-zinc-950 max-sm:line-clamp-2 max-sm:wrap-anywhere sm:max-w-[14rem] sm:truncate xl:max-w-[18rem]"
                        >
                          {item.name}
                        </span>
                      ) : (
                        <button
                          type="button"
                          title={item.name}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(item);
                          }}
                          className="block max-w-full text-left font-semibold text-zinc-950 hover:underline max-sm:mr-9 sm:max-w-[14rem] sm:truncate xl:max-w-[18rem]"
                        >
                          <span className="max-sm:line-clamp-2 max-sm:wrap-anywhere">{item.name}</span>
                        </button>
                      )}
                      <div className="text-xs text-zinc-500 max-sm:line-clamp-2 max-sm:wrap-anywhere sm:max-w-[14rem] sm:truncate xl:max-w-[18rem]">
                        {catName(item.categoryId) ?? t("kategoriSecilmedi")} · {priceModeLabel(item.priceMode)} · {unitLabel(item.unit)}
                      </div>
                      {/* Düzeltme gerekçesi KENDİ satırında: kırpılan alt satırın sonuna
                          eklendiği için hiçbir genişlikte okunmuyordu (mobil denetim g09). */}
                      {item.reviewStatus === "REJECTED" && item.rejectReason ? (
                        <p className="mt-1 line-clamp-2 text-xs wrap-anywhere text-red-700 sm:max-w-[14rem] xl:max-w-[18rem]">
                          {t("duzeltmeSatiri", { rejectReason: item.rejectReason })}
                        </p>
                      ) : null}
                      {/* Dar ekranda Durum sütunu gizli → rozet adın altında; ⋮ bu
                          satırın sağında durur (`pr-22` onun yeri: 44 px ⋮ + 36 px
                          AI düğmesi payı + 8 px). */}
                      <div className={cn("mt-1 sm:hidden", hasMenu && "max-sm:pr-22")}>
                        <Badge color={st.color}>{st.label}</Badge>
                      </div>
                    </div>
                  </div>
                </td>
                {/* Durum rozeti HER genişlikte sözcük arasında sarabilir (sözcük
                    içinde bölünmez): yer varken tablo onu tek satırda bırakır, yer
                    yoksa uzun durum ("Опубликован · на проверке") tabloyu kartın
                    dışına itmek yerine ikinci satıra iner. Eskiden xl'de
                    `whitespace-nowrap`tı; 1280'de tek satırlık bu rozet Действия
                    sütununu kesiyordu (mobil denetim 2026-10, beşinci tur). */}
                <td className="hidden px-3 py-3 sm:table-cell">
                  <Badge color={st.color}>{st.label}</Badge>
                </td>
                <td className={cn("max-w-[10rem] truncate px-3 py-3 text-zinc-700", WIDE_COLUMN.kategori)}>{catName(item.categoryId) ?? "—"}</td>
                <td className="hidden px-3 py-3 tabular-nums text-zinc-700 md:table-cell">{price(item)}</td>
                <td className={cn("px-3 py-3 whitespace-nowrap tabular-nums text-zinc-700", WIDE_COLUMN.minSiparis)}>
                  {item.moq != null ? t("min", { qty: quantity(item.moq, item.unit) }) : "—"}
                </td>
                <td className={cn("px-3 py-3 whitespace-nowrap tabular-nums text-zinc-700", WIDE_COLUMN.goruntulenme)}>
                  {item.viewCount != null ? (
                    <span className="inline-flex items-center gap-1.5"><EyeIcon className="size-4 text-zinc-400" />{formatNumber(item.viewCount, locale)}</span>
                  ) : "—"}
                </td>
                <td className={cn("px-3 py-3 whitespace-nowrap text-zinc-700", WIDE_COLUMN.eklenme)}>
                  {formatDate(item.createdAt ?? item.updatedAt, "short", locale)}
                </td>
                {/* ⋮ GERÇEK MENÜ (arayüz testi O-039): eskiden doğrudan ürünü
                    açıyordu, arşivleme hiçbir yerde yoktu. Satır tıklaması
                    menüye (portal dahil — React olayı ağaçta kabarır) sızmasın.
                    sm'den itibaren sağ pay (mobil denetim 2026-10): 1280'de ⋮
                    AI Asistan düğmesinin altında kalıyor, düğme neredeyse her
                    durağan konumda çekiliyordu → ⋮ düğmenin solunda, ikisi de
                    kullanılır.
                    TELEFON (mobil denetim 2026-10, dördüncü tur): ⋮ kendi sütununda
                    satırın sağ ucunda (390'da 318-362) AI düğmesinin sütununa
                    (334-378) düşüyordu; her satırda biri düğmenin altında kaldığı
                    için düğme 20 durağan konumun yalnız 4'ünde (RU 360: 7)
                    görünüyordu. Satırın ÜSTÜNE taşımak işe yaramaz (örtüşme payı
                    satır yüksekliğine oranla aynı kalır); sütun payı (`pr-12`) adı
                    36 px daraltıyordu. Bunun yerine sütun telefonda sıfır genişlikte
                    (`relative`), ⋮ durum rozetiyle aynı satırda ve sağdan 48 px
                    içeride (`right-12`): düğmenin sütununun 8 px solunda biter, ad
                    sütunu bugünkünden geniş kalır. Ölçüldü (eski derlemeye aynı
                    yerleşim uygulanarak): TR 390, TR 360, RU 360, RU 390'da 20/20.
                    Tek düğüm; sm'den eski sütun. */}
                <td
                  className={cn(
                    "px-3 py-3 text-right max-sm:relative max-sm:w-0 max-sm:px-0 max-sm:py-0",
                    FAB_CLEARANCE_SM_CLASS,
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {hasMenu ? (
                    <span className="max-sm:absolute max-sm:right-12 max-sm:bottom-0.5">
                      <Dropdown>
                        <DropdownButton plain aria-label={t("islemMenusu", { name: item.name })}>
                          <EllipsisVerticalIcon className="size-5" />
                        </DropdownButton>
                        <DropdownMenu anchor="bottom end">
                          {archived ? (
                            <DropdownItem onClick={() => onRestore(item)} disabled={busy}>
                              <DropdownLabel>{t("geriAl")}</DropdownLabel>
                            </DropdownItem>
                          ) : (
                            <>
                              <DropdownItem onClick={() => onOpen(item)}>
                                <DropdownLabel>{t("acMenu")}</DropdownLabel>
                              </DropdownItem>
                              {/* İncelemedeki ürün kilitli — arşivle de verilmez. */}
                              {canManage && item.reviewStatus !== "PENDING" ? (
                                <DropdownItem onClick={() => onArchive(item)} disabled={busy}>
                                  <DropdownLabel>{t("arsivle")}</DropdownLabel>
                                </DropdownItem>
                              ) : null}
                            </>
                          )}
                        </DropdownMenu>
                      </Dropdown>
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
