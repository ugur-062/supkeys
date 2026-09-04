"use client";

import { Dialog, DialogPanel } from "@headlessui/react";
import { AdjustmentsHorizontalIcon, XMarkIcon } from "@heroicons/react/20/solid";
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
 * `basePath`: herkese açık `/urunler` ya da panel `/company/satinalma/urunler`.
 * Kategori yol sayfasından (`/urunler/kategori/…`) ilk etkileşimde sorgu
 * şemasına geçilir — yol sayfası SEO girişi, etkileşim sorguda.
 */
interface Ctx {
  state: ProductFilterState;
  update: (patch: Partial<ProductFilterState> | ((s: ProductFilterState) => ProductFilterState)) => void;
  clear: () => void;
  isPending: boolean;
  total: number;
  openMobile: () => void;
  closeMobile: () => void;
}
const FilterCtx = createContext<Ctx | null>(null);
export const useFilters = () => {
  const c = useContext(FilterCtx);
  if (!c) throw new Error("useFilters — FilterShell dışında");
  return c;
};

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
  /** Mobil çekmecede çizilecek süzgeç ağacı (masaüstü aside ile aynı bileşen, ikinci örnek). */
  drawer?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);
  const state = parseProductFilters(sp ?? new URLSearchParams(), fixedCategory);

  const navigate = (next: ProductFilterState) => {
    // Kategori yol sayfasındaysak ve kategori değiştiyse/başka süzgeç
    // eklendiyse sorgu şemasına geç; yoksa mevcut yolda kal (kanonik yol).
    const onPathPage = !!fixedCategory && pathname !== basePath;
    const keepPath = onPathPage && next.category === fixedCategory;
    const target = keepPath ? pathname : basePath;
    const q = buildProductFilterQuery(keepPath ? { ...next, category: undefined } : next);
    startTransition(() => router.replace(`${target}${q}`, { scroll: false }));
  };
  const update: Ctx["update"] = (patch) => {
    const next = typeof patch === "function" ? patch(state) : { ...state, ...patch };
    navigate({ ...next, page: 1 });
  };
  const clear = () => navigate({ cities: [], activities: [], verified: false, attrs: [], page: 1, q: state.q });

  return (
    <FilterCtx.Provider value={{ state, update, clear, isPending, total, openMobile: () => setMobileOpen(true), closeMobile: () => setMobileOpen(false) }}>
      {children}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)}>{drawer}</MobileDrawer>
    </FilterCtx.Provider>
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
  const { state, openMobile } = useFilters();
  const n = activeFilterCount(state);
  return (
    <button
      type="button"
      onClick={openMobile}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-semibold text-zinc-900 lg:hidden"
    >
      <AdjustmentsHorizontalIcon aria-hidden className="size-4" />
      Filtrele{n > 0 ? ` (${n})` : ""}
    </button>
  );
}

function MobileDrawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { total, clear, isPending } = useFilters();
  return (
    <Dialog open={open} onClose={onClose} className="lg:hidden">
      <div className="fixed inset-0 z-50 bg-zinc-950/40" aria-hidden />
      <DialogPanel className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-950/5 px-5 py-3">
          <button type="button" onClick={clear} className="text-sm font-medium text-zinc-600 hover:text-zinc-950">
            Temizle
          </button>
          <p className="text-sm font-semibold text-zinc-900">Filtreler</p>
          <button type="button" onClick={onClose} aria-label="Kapat" className="-m-2 p-2 text-zinc-500">
            <XMarkIcon aria-hidden className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="border-t border-zinc-950/5 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white"
          >
            {isPending ? "Güncelleniyor…" : `Sonuçları göster (${total.toLocaleString("tr-TR")})`}
          </button>
        </div>
      </DialogPanel>
    </Dialog>
  );
}
