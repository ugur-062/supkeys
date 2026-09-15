"use client";

import {
  ArrowsRightLeftIcon,
  BuildingStorefrontIcon,
  CheckIcon,
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

/**
 * Tuşun tonu AKTİF portaldan. Sınıflar tam yazılı (Tailwind dinamik sınıf
 * adını derleyemez). Kontrast: blue-700 / emerald-800 açık zeminde ≥ 4,5:1.
 */
const TON: Record<PortalKey, string> = {
  satinalma:
    "border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100 focus-visible:ring-blue-500",
  satis:
    "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100 focus-visible:ring-emerald-500",
};
const TON_ACIK: Record<PortalKey, string> = {
  satinalma: "border-blue-300 bg-blue-100",
  satis: "border-emerald-300 bg-emerald-100",
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
 * DİĞER DÜĞMELERDEN AYRIŞIR (2026-09-15, kullanıcı: "Şirketim yanındaki tuşu
 * daha belirgin yap, diğer tuşlardan farklı dursun"). İlk hâli mesaj, bildirim
 * ve Şirketim ile birebir aynı dildeydi (gri ikon + altında 10 px etiket) ve
 * dört eş düğmenin arasında bildirim gibi okunuyordu. Artık yatay, çerçeveli,
 * yuvarlak bir ÇİP: aktif portalın ikonu + adı + değişim oku.
 *
 * RENK: çip AKTİF PORTALIN renginde (satınalma mavi, satış emerald) açık tonlu.
 * "Tek eylem rengi" kuralına bilinçli istisna — renk bir eylemi değil hangi
 * paneldesiniz bilgisini taşır; sağdaki düğmeler nötr kalır. Dolgu yok, yalnız
 * açık zemin: sayfanın birincil eylem düğmesiyle yarışmasın.
 *
 * Dar ekranda (sm altı) portal adı düşer, ikon + ok kalır — üst çubuk 400 px'e
 * sığsın; tuş yine çerçeveli ve renkli olduğu için belirginliğini korur.
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
  const AktifIcon = ICON[active];

  return (
    <div ref={kutu} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Panel değiştir — şu an ${aktifDef.label}`}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "mr-1 inline-flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 sm:pr-3 sm:pl-2.5",
          TON[active],
          open && TON_ACIK[active],
        )}
      >
        <AktifIcon className="size-5 shrink-0" aria-hidden />
        <span className="hidden whitespace-nowrap sm:inline" aria-hidden>
          {aktifDef.label}
        </span>
        <ArrowsRightLeftIcon className="size-4 shrink-0 opacity-70" aria-hidden />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Panel değiştir"
          className="absolute right-0 z-50 mt-1 w-72 overflow-hidden rounded-xl border border-zinc-950/10 bg-white shadow-lg"
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
    </div>
  );
}
