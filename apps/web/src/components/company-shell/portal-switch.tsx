"use client";

import {
  BuildingStorefrontIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  ChevronUpDownIcon,
  LockClosedIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { usePortalStore } from "@/lib/company/portal-store";
import { PORTALS, PORTAL_ORDER, type PortalKey } from "@/lib/company/portals";

const ICON: Record<PortalKey, typeof ShoppingCartIcon> = {
  satinalma: ShoppingCartIcon,
  satis: BuildingStorefrontIcon,
};

/** Aktif portal ikonunun rengi. Sınıflar tam yazılı (Tailwind dinamik adı derleyemez). */
const IKON_RENGI: Record<PortalKey, string> = {
  satinalma: "text-blue-600",
  satis: "text-emerald-600",
};

/** Panelde ne yapıldığını TEK cümleyle anlatır — panel açıklaması burada. */
const NE_YAPAR: Record<PortalKey, string> = {
  satinalma: "Talep açar, teklif toplar, kazandırırsınız.",
  satis: "Açık talepleri görür, teklif verir, ürünlerinizi yayınlarsınız.",
};

/**
 * PORTAL DEĞİŞTİRME — TEK TUŞ (2026-09-15, kullanıcı kararı).
 *
 * Eskiden sol menüde, "Anasayfa"nın üstünde iki ayrı bağlantıdan oluşan
 * segmentli bir pildi. Artık üst çubukta TEK tuş: üstünde iki portalın ikonu ve
 * aralarında değişim oku. Tuş iki şeyi birden söyler — NEREDESİN (koyu ikon +
 * etiket) ve DEĞİŞTİREBİLİRSİN (ok). Tıklayınca iki portalı açıklayan panel
 * açılır.
 *
 * AYNI AİLE, AYIRT EDİLİR (2026-09-15, iki tur kullanıcı geri bildirimi):
 *  1. İlk hâl mesaj/bildirim/Şirketim ile BİREBİR aynıydı (gri ikon + 10 px
 *     etiket) → "kendini belli etmiyor".
 *  2. Renkli, çerçeveli yuvarlak çip denendi → "diğer tuşlardan çok farklı".
 *  Orta yol (bu hâl): düzen diğer düğmelerle AYNI (h-12, ikon + altında 10 px
 *  etiket, çerçevesiz, hover'da hafif zemin). Ayrışma üç küçük işaretle:
 *  · ikon AKTİF portalın renginde (satınalma mavi, satış emerald)
 *  · etiket koyu (diğerleri zinc-500) + yanında aç/kapa işareti (seçici olduğu
 *    okunur)
 *  · sağında ince dikey ayırıcı — portal düğmesini "firma/mesaj/bildirim"
 *    kümesinden ayırır
 *  Renk yalnız bir ikon büyüklüğünde; "tek eylem rengi" kuralını zorlamaz.
 *
 * KİLİTLİ PORTAL: bugünkü davranış aynen — satır yine tıklanır, `PortalGuard`
 * paket ekranını açar (kilidi gizlemek kullanıcıya neyi kaçırdığını söylemezdi).
 */
export function PortalSwitch({
  active,
  visiblePortals,
  available,
  onNavigate,
}: {
  active: PortalKey;
  /** Menüde görünen portallar (görüntüleme izni olanlar). */
  visiblePortals: readonly PortalKey[];
  /** Gerçekten girilebilen portallar (paket kapısı geçilmiş). */
  available: readonly PortalKey[];
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const setLastPortal = usePortalStore((s) => s.setLastPortal);
  const kutu = useRef<HTMLDivElement>(null);

  // Dışarı tıklama + Escape — popover kalıbı (mesaj/bildirim ile aynı).
  useEffect(() => {
    if (!open) return;
    const disari = (e: MouseEvent) => {
      if (!kutu.current?.contains(e.target as Node)) setOpen(false);
    };
    const kacis = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", disari);
    window.addEventListener("keydown", kacis);
    return () => {
      document.removeEventListener("mousedown", disari);
      window.removeEventListener("keydown", kacis);
    };
  }, [open]);

  // TEK portallı üye (ör. yalnız satış yetkisi) için değiştirecek bir şey yok.
  if (visiblePortals.length < 2) return null;

  const sirali = PORTAL_ORDER.filter((p) => visiblePortals.includes(p));
  const aktifDef = PORTALS[active];

  return (
    <div ref={kutu} className="relative flex shrink-0 items-center">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Panel değiştir — şu an ${aktifDef.label}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 text-zinc-900 transition hover:bg-zinc-950/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          open && "bg-zinc-950/5",
        )}
      >
        {/* İKİ PANEL DE GÖRÜNÜR (2026-09-15, üçüncü tur, kullanıcı: "değişim
            tuşu olduğu çok belli değil; satıştayken satınalma logosu da
            gözüksün ama hangisinde olduğum belli olsun"). Aktif panel kendi
            renginde ve tam opak, diğeri gri ve soluk; arada değişim oku.
            Yer, düzen ve açılan liste AYNI (mimari değişmedi). */}
        <span className="flex items-center gap-1" aria-hidden>
          {sirali.map((p, i) => {
            const Icon = ICON[p];
            const aktif = p === active;
            return (
              <span key={p} className="flex items-center gap-1">
                {i > 0 ? <ArrowsRightLeftIcon className="size-3.5 text-zinc-500" /> : null}
                <Icon
                  data-portal-icon={p}
                  data-active={aktif ? "true" : "false"}
                  className={cn("size-5 shrink-0", aktif ? IKON_RENGI[p] : "text-zinc-400")}
                />
              </span>
            );
          })}
        </span>
        <span
          className="flex items-center gap-0.5 text-[10px] leading-none font-semibold whitespace-nowrap"
          aria-hidden
        >
          {aktifDef.label}
          <ChevronUpDownIcon className="size-3 text-zinc-500" />
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Panel değiştir"
          className="absolute top-full right-0 z-50 mt-1 w-72 overflow-hidden rounded-xl border border-zinc-950/10 bg-white shadow-lg"
        >
          <p className="border-b border-zinc-950/5 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Panel değiştir
          </p>
          <ul>
            {sirali.map((p) => {
              const def = PORTALS[p];
              const Icon = ICON[p];
              const aktif = p === active;
              const acik = available.includes(p);
              return (
                <li key={p}>
                  <Link
                    href={def.basePath}
                    prefetch={false}
                    aria-current={aktif ? "page" : undefined}
                    onClick={() => {
                      if (acik) setLastPortal(p);
                      setOpen(false);
                      onNavigate?.();
                    }}
                    className={cn(
                      "flex items-start gap-3 px-3 py-3 transition hover:bg-zinc-50",
                      aktif && "bg-zinc-50",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 size-5 shrink-0",
                        aktif
                          ? p === "satinalma"
                            ? "text-blue-600"
                            : "text-emerald-600"
                          : "text-zinc-400",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-zinc-900">
                          {def.label}
                        </span>
                        {!acik ? (
                          <LockClosedIcon
                            className="size-3.5 text-zinc-400"
                            aria-label="Paketle açılır"
                          />
                        ) : null}
                        {aktif ? (
                          <CheckIcon
                            className="size-4 text-zinc-500"
                            aria-label="Şu an buradasınız"
                          />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-600">
                        {NE_YAPAR[p]}
                        {!acik ? " Gold paketiyle açılır." : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {/* Portal düğmesini firma/mesaj/bildirim kümesinden ayıran ince çizgi. */}
      <span aria-hidden className="mx-1.5 h-8 w-px bg-zinc-950/10" />
    </div>
  );
}
