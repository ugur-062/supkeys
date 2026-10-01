"use client";

import { useFormatter, useTranslations } from "next-intl";

import { useAccentFill } from "@/components/ui/accent-fill";
import { Sheet } from "@/components/ui/sheet";
import { AdjustmentsHorizontalIcon } from "@heroicons/react/20/solid";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  activeFilterCount,
  buildProductFilterQuery,
  clearProductFilters,
  parseProductFilters,
  type ProductFilterState,
} from "@/lib/public/product-filter-params";

/**
 * SÜZGEÇ KABUĞU — URL durumu, geçiş (pending) ve mobil çekmece TEK yerde.
 *
 * Süzgeç bileşenleri durumu buradan okur ve `update()` ile yazar; yazma
 * `router.replace(url, { scroll: false })` + `startTransition` → sunucu
 * bileşeni yeniden render olurken `isPending` sonuç ızgarasını soluklaştırır
 * (spinner değil, mevcut içerik + iskelet). Tam sayfa yenileme ve scroll
 * sıfırlanması YOK (süzgeç v3, 2026-09-04).
 *
 * İki katman (2026-09-05): `FilterShellCore` durum tipinden BAĞIMSIZ çekirdek
 * (ürün süzgeci ve açık talep süzgeci aynı çekirdeği kullanır — çekmece,
 * geçiş, sayaç, "Filtrele (n)" bir kez yazılır); `FilterShell` ürün süzgecinin
 * URL kurallarını (kategori yol sayfası) taşıyan ince sarmalayıcı.
 */
interface Ctx<S> {
  state: S;
  /**
   * `opts.replace`: geçmişe YAZMADAN değiştir — kullanıcının değil sistemin
   * yaptığı değişim için (kayıtlı görünüm tercihini URL'e taşımak gibi);
   * yoksa "geri" tuşu kullanıcıyı tercihsiz adrese atıp aynı yere döndürürdü.
   */
  update: (patch: Partial<S> | ((s: S) => S), opts?: { replace?: boolean }) => void;
  clear: () => void;
  isPending: boolean;
  total: number;
  /** Aktif süzgeç sayısı — arama/sıralama/sayfa hariç. */
  activeCount: number;
  openMobile: () => void;
  closeMobile: () => void;
  /**
   * Süzgeç yüzeyinin VURGU rengi (2026-09-08, kullanıcı kararı: "satınalmada
   * siyah kullanma"). Herkese açık pazar yeri monokrom SİYAH kalır; panelin
   * satınalma bölgesi MAVİ. Renk kabuktan geçer ki kutucuk, çip, kaydırıcı ve
   * mobil düğme tek yerden dönsün — her bileşene ayrı prop taşımak, biri
   * unutulduğunda tek siyah leke bırakırdı.
   */
  accent: FilterAccent;
}

export type FilterAccent = "default" | "blue";

/** Süzgeç yüzeyinin vurgu rengi — bağlam yoksa monokrom. */
export function useFilterAccent(): FilterAccent {
  return useContext(FilterCtx)?.accent ?? "default";
}
const FilterCtx = createContext<Ctx<unknown> | null>(null);
export function useFilters<S = ProductFilterState>(): Ctx<S> {
  const c = useContext(FilterCtx);
  if (!c) throw new Error("useFilters — FilterShell dışında");
  return c as Ctx<S>;
}

export function FilterShellCore<S extends { page: number }>({
  state,
  toUrl,
  clearState,
  total,
  activeCount,
  accent = "default",
  drawer,
  drawerHideAt = "lg",
  pushFilters = false,
  children,
}: {
  state: S;
  /** Durum → hedef URL (yol + sorgu). */
  toUrl: (next: S) => string;
  /** "Tümünü temizle" sonrası durum. */
  clearState: (s: S) => S;
  total: number;
  activeCount: number;
  /** Mobil çekmecede çizilecek süzgeç ağacı (masaüstü aside ile aynı bileşen, ikinci örnek). */
  drawer?: ReactNode;
  /**
   * Çekmecenin kapandığı (kenar rayının açıldığı) kırılım — kabuğun kendi
   * `aside` kırılımıyla AYNI olmalı. Herkese açık listelerde `lg`; PANEL
   * pazarında `xl`, çünkü orada ekranı sol menü de paylaşıyor: 1024 px'te
   * menü (256) + ray (256) ekranın yarısını yiyor ve sonuç sütunu tek
   * karta düşüyordu. Ayrışırsa 1024-1280 arasında ne ray ne çekmece
   * görünür — süzgeçler tamamen erişilemez olur.
   */
  drawerHideAt?: "lg" | "xl";
  /**
   * Süzgeç değişimi GEÇMİŞE yazılsın mı (2026-09-07, kullanıcı kararı).
   *
   * Varsayılan `false` (`replace`) — açık talep süzgecinin bugünkü davranışı;
   * o listede tıklar hızlı ve ardışıktır, her biri geçmişe girseydi "geri"
   * tuşu listeden çıkamaz hâle gelirdi. Ürün dizininde `true`: 9 grup var ve
   * kullanıcı yanlış kutucuğu geri almak için geri tuşunu bekliyor.
   */
  pushFilters?: boolean;
  /** Vurgu rengi — panel satınalma `blue`, herkese açık pazar yeri monokrom. */
  accent?: FilterAccent;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  /**
   * BEKLEYEN DURUM (arayüz testi O-014). Süzgeç yazımı bir GEÇİŞ: URL ve
   * dolayısıyla `state`, sunucu yanıtı gelene dek ESKİ kalır. Eskiden ikinci
   * tık da eski URL'den kuruluyordu — "Üretici"yi işaretleyip 150 ms sonra
   * "Distribütör"ü işaretleyen kullanıcının ilk seçimi sessizce düşüyordu.
   * Gönderilen son durum ref'te tutulur (art arda gelen olaylar render
   * beklemeden okur), sonraki güncellemeler onun üstüne kurulur ve kutucuklar
   * da onu gösterir (iyimser). Geçiş bitince (URL yetişti ya da gezinme
   * başka yerde sonlandı) yeniden URL kaynak olur.
   */
  const pendingRef = useRef<S | null>(null);
  const [pending, setPending] = useState<S | null>(null);
  useEffect(() => {
    if (!isPending && pendingRef.current) {
      pendingRef.current = null;
      setPending(null);
    }
  }, [isPending]);

  /**
   * SÜZGEÇ değişimi `replace` (her tık geçmişe girmesin — "geri" tuşu on
   * kutucuk geri gitmemeli), SAYFA değişimi `push` (2. sayfadan "geri"
   * 1. sayfaya dönmeli). İkisi de `scroll: false`: konumu sayfalama
   * kendi yönetir, süzgeçte sayfa başına zıplamak istenmiyor.
   */
  const navigate = (next: S, mode: "replace" | "push" = "replace") => {
    pendingRef.current = next;
    setPending(next);
    startTransition(() => router[mode](toUrl(next), { scroll: false }));
  };
  const update: Ctx<S>["update"] = (patch, opts) => {
    const base = pendingRef.current ?? state;
    const next = typeof patch === "function" ? patch(base) : { ...base, ...patch };
    // Süzgeç değişince 1. sayfaya dönülür; sayfa YALNIZ açıkça istenince
    // korunur (eskiden `update({ page })` da 1'e düşüyordu — panel ürün
    // dizininde "Sonraki" çalışmıyordu).
    const explicitPage = typeof patch === "function" ? next.page !== base.page : "page" in patch;
    navigate(
      explicitPage ? next : { ...next, page: 1 },
      !opts?.replace && (explicitPage || pushFilters) ? "push" : "replace",
    );
  };
  const clear = () => navigate(clearState(pendingRef.current ?? state));

  const value: Ctx<S> = {
    state: pending ?? state,
    update,
    clear,
    isPending,
    total,
    activeCount,
    openMobile: () => setMobileOpen(true),
    closeMobile: () => setMobileOpen(false),
    accent,
  };
  return (
    <FilterCtx.Provider value={value as Ctx<unknown>}>
      {children}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} hideAt={drawerHideAt}>
        {drawer}
      </MobileDrawer>
    </FilterCtx.Provider>
  );
}

/**
 * ÜRÜN süzgeç kabuğu. `basePath`: herkese açık `/urunler` ya da panel
 * `/company/satinalma/urunler`. Kategori yol sayfasından
 * (`/urunler/kategori/…`) ilk etkileşimde sorgu şemasına geçilir — yol
 * sayfası SEO girişi, etkileşim sorguda.
 */
export function FilterShell({
  basePath,
  fixedCategory,
  fixedCity,
  fixedCountry,
  total,
  drawer,
  drawerHideAt,
  pushFilters,
  accent,
  children,
}: {
  basePath: string;
  /** Kategori yol sayfasında yoldan gelen kod. */
  fixedCategory?: string;
  /**
   * Şehir/ülke açılış sayfasında YOLDAN gelen süzgeç (2026-09-27): durumun
   * parçası sayılır (sayaç, çip, işaretli kutu) ve sıralama/görünüm/sayfa
   * boyutu değişince açılış yolunda kalınır; yoldaki değer kaldırılır ya da
   * başka şehir/ülke eklenirse sorgu şemasına (`/urunler?…`) geçilir.
   */
  fixedCity?: string;
  fixedCountry?: string;
  total: number;
  drawer?: ReactNode;
  /** Bkz. `FilterShellCore` — panel pazarında `xl`. */
  drawerHideAt?: "lg" | "xl";
  /** Bkz. `FilterShellCore` — ürün dizininde `true`. */
  pushFilters?: boolean;
  /** Bkz. `FilterShellCore` — panel satınalmada `blue`. */
  accent?: FilterAccent;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = new URLSearchParams(sp?.toString() ?? "");
  if (fixedCity) current.set("sehir", fixedCity);
  if (fixedCountry) current.set("ulke", fixedCountry);
  const state = parseProductFilters(current, fixedCategory);

  const only = (list: string[], value: string) => list.length === 1 && list[0] === value;
  const toUrl = (next: ProductFilterState) => {
    // Yol sayfasındaysak (kategori/şehir/ülke) ve yoldaki süzgeç AYNEN
    // duruyorsa mevcut yolda kal (kanonik yol); değiştiyse/genişlediyse
    // sorgu şemasına geç.
    const onPathPage = (!!fixedCategory || !!fixedCity || !!fixedCountry) && pathname !== basePath;
    const keepPath =
      onPathPage &&
      (!fixedCategory || next.category === fixedCategory) &&
      (!fixedCity || only(next.cities, fixedCity)) &&
      (!fixedCountry || only(next.countries, fixedCountry));
    const target = keepPath ? pathname : basePath;
    return `${target}${buildProductFilterQuery(
      keepPath
        ? {
            ...next,
            category: fixedCategory ? undefined : next.category,
            cities: fixedCity ? [] : next.cities,
            countries: fixedCountry ? [] : next.countries,
          }
        : next,
    )}`;
  };

  return (
    <FilterShellCore
      state={state}
      toUrl={toUrl}
      clearState={clearProductFilters}
      total={total}
      activeCount={activeFilterCount(state)}
      drawer={drawer}
      drawerHideAt={drawerHideAt}
      pushFilters={pushFilters}
      accent={accent}
    >
      {children}
    </FilterShellCore>
  );
}

/** Sonuç alanı: geçişte soluk + tıklanamaz; içerik yerinde kalır. */
export function FilterResults({ children }: { children: ReactNode }) {
  const { isPending } = useFilters();
  return (
    <div aria-busy={isPending} className={isPending ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
      {children}
    </div>
  );
}

/**
 * "N ürün bulundu" — ekran okuyucuya canlı bildirilir.
 *
 * `loading`: İLK yükleme (veri henüz hiç gelmedi). `isPending` yalnız
 * süzgeç GEÇİŞİNİ kapsar, ilk isteği değil — o yüzden sayfa açılırken
 * "0" görünüyor ve başlıkta "firma bulunamadı" yazıyordu; iskeletler hâlâ
 * dönerken sayfa boş olduğunu ilan ediyordu.
 */
/**
 * Sonuç sayısı — `aria-live` bölgesi (süzgeç değişince ekran okuyucuya kaç
 * sonuç kaldığını söyler).
 *
 * `quiet` (2026-09-07): sayı SAYFA BAŞLIĞINDA da yazılıyorsa metin
 * görsel olarak gizlenir, canlı bölge KALIR. İki yerde aynı sayıyı basmak
 * kullanıcının bu oturumda tekrar tekrar işaret ettiği "aynı içerik iki
 * yerde" hatasıydı; `sr-only`ye almak yerine bileşeni kaldırmak ise
 * duyuruyu tümden susturur ve süzgeç değişimi sessiz kalırdı.
 * "Güncelleniyor…" `quiet` modda da GÖRÜNÜR — bekleme geri bildirimi
 * gözle görülmeli.
 */
/** Sayılan şey — "N … bulundu" cümlesi dil başına ICU çoğuluyla tek mesajda. */
export type ResultCountKind =
  | "product"
  | "company"
  | "buyingRequest"
  | "openRequest"
  /** Satış paneli Açık Talepler › Durum: Geçmiş (arayüz testi D-116). */
  | "pastRequest"
  /** Satış paneli Açık Talepler › Durum: Tümü. */
  | "request";

const FOUND_KEY = {
  product: "foundProduct",
  company: "foundCompany",
  buyingRequest: "foundBuyingRequest",
  openRequest: "foundOpenRequest",
  pastRequest: "foundPastRequest",
  request: "foundRequest",
} as const satisfies Record<ResultCountKind, string>;

/**
 * Liste tarama tavanına dayandığında sayı ALT SINIRDIR ("200+") — tavanlı
 * kaynağı olan türler (D-116: geçmiş talepler 200'de kırpılıyordu, metin
 * kesin sayı gibi okunuyordu).
 */
const FOUND_AT_LEAST_KEY = {
  openRequest: "foundOpenRequestAtLeast",
  pastRequest: "foundPastRequestAtLeast",
  request: "foundRequestAtLeast",
} as const satisfies Partial<Record<ResultCountKind, string>>;

function foundKey(kind: ResultCountKind, atLeast: boolean) {
  if (atLeast && kind in FOUND_AT_LEAST_KEY) {
    return FOUND_AT_LEAST_KEY[kind as keyof typeof FOUND_AT_LEAST_KEY];
  }
  return FOUND_KEY[kind];
}

/** "… bulunamadı" da tür başına TAM cümle — isim parçası cümleye eklenmez (RU/EN çekimi tutmaz). */
const NOT_FOUND_KEY = {
  product: "notFoundProduct",
  company: "notFoundCompany",
  buyingRequest: "notFoundBuyingRequest",
  openRequest: "notFoundOpenRequest",
  pastRequest: "notFoundPastRequest",
  request: "notFoundRequest",
} as const satisfies Record<ResultCountKind, string>;

export function ResultCount({
  kind,
  loading = false,
  quiet = false,
  atLeast = false,
}: {
  kind: ResultCountKind;
  loading?: boolean;
  quiet?: boolean;
  /** Sayı tarama tavanında — "N+" yazılır. */
  atLeast?: boolean;
}) {
  const t = useTranslations("web.marketplace.filters");
  const { total, isPending } = useFilters();
  const busy = loading || isPending;
  return (
    <p aria-live="polite" className={quiet && !busy ? "sr-only" : "text-sm text-zinc-600"}>
      {busy
        ? t("updating")
        : total > 0
          ? t(foundKey(kind, atLeast), { total })
          : t(NOT_FOUND_KEY[kind])}
    </p>
  );
}

/**
 * Mobil: "Filtrele (n)" düğmesi. `hideAt` kabuğun kenar rayı kırılımıyla
 * AYNI olmalı (bkz. `FilterShellCore.drawerHideAt`) — sınıflar birebir
 * yazılır, `lg`/`xl` farklı varyant olduğu için twMerge onları birleştiremez.
 */
export function MobileFilterButton({ hideAt = "lg" }: { hideAt?: "lg" | "xl" }) {
  const t = useTranslations("web.marketplace.filters");
  const { activeCount, openMobile } = useFilters();
  return (
    <button
      type="button"
      onClick={openMobile}
      className={`inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-semibold text-zinc-900 ${
        hideAt === "xl" ? "xl:hidden" : "lg:hidden"
      }`}
    >
      <AdjustmentsHorizontalIcon aria-hidden className="size-4" />
      {t("filterButton")}{activeCount > 0 ? ` (${activeCount})` : ""}
    </button>
  );
}

function MobileDrawer({
  open,
  onClose,
  hideAt,
  children,
}: {
  open: boolean;
  onClose: () => void;
  hideAt: "lg" | "xl";
  children: ReactNode;
}) {
  const t = useTranslations("web.marketplace.filters");
  const fmt = useFormatter();
  // Mavi olmayan yüzeyde portal bağlamı (public tedarikçi yüzü yeşil; 2026-09-18).
  const ctxFill = useAccentFill();
  const { total, clear, isPending, accent } = useFilters();
  // Sözlük primitive'i (PROMPT 3): alt çekmece, başlıkta "Temizle", altlıkta canlı sayaç.
  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="bottom"
      title={t("filtersTitle")}
      className={hideAt === "xl" ? "xl:hidden" : "lg:hidden"}
      header={
        <div className="flex flex-1 items-center justify-between gap-3">
          <button type="button" onClick={clear} className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
            {t("clear")}
          </button>
          <p className="text-sm font-semibold text-zinc-900">{t("filtersTitle")}</p>
        </div>
      }
      footer={
        <button
          type="button"
          onClick={onClose}
          className={`w-full rounded-full px-4 py-2.5 text-sm font-semibold text-white ${
            accent === "blue" ? "bg-blue-600 hover:bg-blue-700" : ctxFill
          }`}
        >
          {isPending ? t("updating") : t("showResults", { total: fmt.number(total) })}
        </button>
      }
    >
      {children}
    </Sheet>
  );
}
