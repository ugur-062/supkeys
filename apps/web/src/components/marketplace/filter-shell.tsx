"use client";

import { Sheet } from "@/components/ui/sheet";
import { AdjustmentsHorizontalIcon } from "@heroicons/react/20/solid";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import {
  activeFilterCount,
  buildProductFilterQuery,
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
  update: (patch: Partial<S> | ((s: S) => S)) => void;
  clear: () => void;
  isPending: boolean;
  total: number;
  /** Aktif süzgeç sayısı — arama/sıralama/sayfa hariç. */
  activeCount: number;
  openMobile: () => void;
  closeMobile: () => void;
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
  drawer,
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
  children: ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigate = (next: S) => startTransition(() => router.replace(toUrl(next), { scroll: false }));
  const update: Ctx<S>["update"] = (patch) => {
    const next = typeof patch === "function" ? patch(state) : { ...state, ...patch };
    // Süzgeç değişince 1. sayfaya dönülür; sayfa YALNIZ açıkça istenince
    // korunur (eskiden `update({ page })` da 1'e düşüyordu — panel Ürün
    // Ara'da "Sonraki" çalışmıyordu).
    const explicitPage = typeof patch === "function" ? next.page !== state.page : "page" in patch;
    navigate(explicitPage ? next : { ...next, page: 1 });
  };
  const clear = () => navigate(clearState(state));

  const value: Ctx<S> = {
    state,
    update,
    clear,
    isPending,
    total,
    activeCount,
    openMobile: () => setMobileOpen(true),
    closeMobile: () => setMobileOpen(false),
  };
  return (
    <FilterCtx.Provider value={value as Ctx<unknown>}>
      {children}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)}>{drawer}</MobileDrawer>
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
  total,
  drawer,
  children,
}: {
  basePath: string;
  /** Kategori yol sayfasında yoldan gelen kod. */
  fixedCategory?: string;
  total: number;
  drawer?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const state = parseProductFilters(sp ?? new URLSearchParams(), fixedCategory);

  const toUrl = (next: ProductFilterState) => {
    // Kategori yol sayfasındaysak ve kategori değiştiyse/başka süzgeç
    // eklendiyse sorgu şemasına geç; yoksa mevcut yolda kal (kanonik yol).
    const onPathPage = !!fixedCategory && pathname !== basePath;
    const keepPath = onPathPage && next.category === fixedCategory;
    const target = keepPath ? pathname : basePath;
    return `${target}${buildProductFilterQuery(keepPath ? { ...next, category: undefined } : next)}`;
  };

  return (
    <FilterShellCore
      state={state}
      toUrl={toUrl}
      clearState={(s) => ({ cities: [], activities: [], verified: false, attrs: [], page: 1, q: s.q })}
      total={total}
      activeCount={activeFilterCount(state)}
      drawer={drawer}
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

/** "N ürün bulundu" — ekran okuyucuya canlı bildirilir. */
export function ResultCount({ noun }: { noun: string }) {
  const { total, isPending } = useFilters();
  return (
    <p aria-live="polite" className="text-sm text-zinc-600">
      {isPending ? "Güncelleniyor…" : total > 0 ? `${total.toLocaleString("tr-TR")} ${noun} bulundu` : `${noun} bulunamadı`}
    </p>
  );
}

/** Mobil: "Filtrele (n)" düğmesi. */
export function MobileFilterButton() {
  const { activeCount, openMobile } = useFilters();
  return (
    <button
      type="button"
      onClick={openMobile}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-semibold text-zinc-900 lg:hidden"
    >
      <AdjustmentsHorizontalIcon aria-hidden className="size-4" />
      Filtrele{activeCount > 0 ? ` (${activeCount})` : ""}
    </button>
  );
}

function MobileDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { total, clear, isPending } = useFilters();
  // Sözlük primitive'i (PROMPT 3): alt çekmece, başlıkta "Temizle", altlıkta canlı sayaç.
  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="bottom"
      title="Filtreler"
      className="lg:hidden"
      header={
        <div className="flex flex-1 items-center justify-between gap-3">
          <button type="button" onClick={clear} className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
            Temizle
          </button>
          <p className="text-sm font-semibold text-zinc-900">Filtreler</p>
        </div>
      }
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
        >
          {isPending ? "Güncelleniyor…" : `Sonuçları göster (${total.toLocaleString("tr-TR")})`}
        </button>
      }
    >
      {children}
    </Sheet>
  );
}
