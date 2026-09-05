"use client";

import { tierAtLeast } from "@rothern/shared";
import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { usePendingApprovalCount } from "@/hooks/use-company-approvals";
import { usePortalStore } from "@/lib/company/portal-store";
import { userHasPermission } from "@/lib/company/permissions";
import {
  COMPANY_AREA,
  PORTALS,
  PORTAL_ORDER,
  accessiblePortals,
  activePortalFromPath,
  isCompanyAreaPath,
  isPortalItemActive,
  type PortalKey,
} from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import {
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  LockClosedIcon,
  PlusIcon,
  ShieldCheckIcon,
  ShoppingCartIcon,
} from "@heroicons/react/20/solid";
import { Pin, PinOff } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Portal aksanına göre aktif öğe stilleri (dinamik Tailwind sınıfı üretmemek için sabit). */
const ACCENT = {
  blue: {
    active: "bg-blue-50 text-blue-700",
    bar: "bg-blue-600",
    switch: "bg-white text-blue-700 shadow-sm",
  },
  emerald: {
    active: "bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-600",
    switch: "bg-white text-emerald-700 shadow-sm",
  },
} as const;

/** Tekil nav satırı — daralınca etiket ray genişliğiyle kırpılır (animasyonlu). */
function RailItem({
  href,
  icon: Icon,
  label,
  active,
  accent,
  expanded,
  badge,
  locked,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  active: boolean;
  accent: "blue" | "emerald" | "zinc";
  expanded: boolean;
  badge?: number;
  locked?: boolean;
  onClick?: () => void;
}) {
  const accentCls =
    accent === "zinc"
      ? { active: "bg-zinc-100 text-zinc-900", bar: "bg-zinc-700" }
      : ACCENT[accent];
  return (
    <Link
      href={href}
      // P0: açılışta 13 linkin RSC prefetch fırtınası (503'ler + "Yeni Satış
      // İhalesi"ndeki ölü tıklamanın kaynağı) — nav'da prefetch kapalı.
      prefetch={false}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      title={expanded ? undefined : label}
      className={cn(
        "group/item relative flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors",
        active
          ? accentCls.active
          : "text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-900",
      )}
    >
      {/* Aktif gösterge çubuğu */}
      {active ? (
        <span
          className={cn(
            "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full",
            accentCls.bar,
          )}
          aria-hidden
        />
      ) : null}
      <span className="relative ml-0.5 shrink-0">
        <Icon className="size-5" aria-hidden />
        {/* Daralmışken rozet yerine nokta */}
        {!expanded && badge ? (
          <span className="absolute -top-1 -right-1 size-2 rounded-full bg-red-500" />
        ) : null}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate whitespace-nowrap transition-opacity duration-150",
          expanded ? "opacity-100" : "opacity-0",
        )}
      >
        {label}
      </span>
      {expanded && badge ? (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
      {expanded && locked ? (
        <LockClosedIcon className="size-4 shrink-0 text-zinc-400" aria-hidden />
      ) : null}
    </Link>
  );
}

/**
 * Sol navigasyon içeriği — masaüstünde ikon rayı (hover'da genişler),
 * mobil dialog'da hep geniş. Ayarlar sol altta sabit.
 */
export function CompanySidebarContent({
  expanded,
  showPin = true,
  onNavigate,
}: {
  expanded: boolean;
  /** Mobilde pin anlamsız — gizlenir. */
  showPin?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { company, user } = useCompanyAuth();
  const setLastPortal = usePortalStore((s) => s.setLastPortal);
  const pinned = usePortalStore((s) => s.sidebarPinned);
  const togglePinned = usePortalStore((s) => s.toggleSidebarPinned);
  const tier = company?.tier ?? "STANDART";

  const canAct = useHasCompanyPermission("approval:act");
  const { data: pendingCount } = usePendingApprovalCount(canAct);
  // Madde 19: ana menü "Satın Alma Talebi Aç" CTA'sı — izin tek-kaynak backend
  // permissions (SAHIP/YONETICI etiketi taşımaz, Faz R).
  const canCreateBuyListing = useHasCompanyPermission("buy:listing:manage");
  const available = accessiblePortals(user, company?.tier);
  // Yetki tablosu Faz 3: pil yalnız GÖRÜNTÜLEME izni olan portallar için
  // çizilir; izni olmayan portal menüde hiç yoktur (kilitli pil yok). Tek
  // istisna paket kapısı: satınalma izni var ama kademe < Silver → kilitli pil
  // (tıklayınca PortalGuard paket ekranını açar). Tek portal → pil satırı yok.
  const visiblePortals: PortalKey[] = PORTAL_ORDER.filter((p) =>
    userHasPermission(user, p === "satinalma" ? "buy:view" : "sell:view"),
  );
  const lastPortal = usePortalStore((s) => s.lastPortal);
  // Portal-nötr rotalarda (/company/ilan, /company/onaylar…) SON portalda kal.
  const active: PortalKey =
    activePortalFromPath(pathname) ??
    (lastPortal && available.includes(lastPortal) ? lastPortal : null) ??
    available[0] ??
    "satis";
  const portal = PORTALS[active];
  // Minimal kabuk modu: hiç portal erişimi olmayan üye (ONAYLAYICI-only /
  // rolsüz) yalnız Onaylar + Ayarlar görür — panel nav'ı duvara götürür.
  // YONETICI/SAHIP etiketi accessiblePortals'ın manager dalıyla panel aldığı
  // için salt-okunur gözetim (Faz R) DEĞİŞMEZ.
  const minimal = available.length === 0;
  // ŞİRKETİM alanı (2026-09-05): üst çubuktaki firma adından girilir; sol menü
  // firma menüsüne döner, portal geçişi üstte KALIR (panele tek tıkla dönüş).
  const inCompanyArea = isCompanyAreaPath(pathname);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Satınalma/Satış geçişi — Anasayfa'nın ÜSTÜNDE (kullanıcı isteği).
          Eski topbar'daki segmentli (yan yana) görünüm; rayda daralınca dikey
          ikon pill'ine döner. Kilitli panel PortalGuard'a gider. */}
      {visiblePortals.length > 1 ? (
        <div className="mt-3 border-b border-zinc-950/5 px-2 pb-2">
          <div
            className={cn(
              "grid gap-1 rounded-lg bg-zinc-100 p-1",
              expanded ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            {PORTAL_ORDER.filter((p) => visiblePortals.includes(p)).map((p) => {
              const def = PORTALS[p];
              const allowedP = available.includes(p);
              const on = p === active && !inCompanyArea;
              const Icon =
                p === "satinalma" ? ShoppingCartIcon : BuildingStorefrontIcon;
              return (
                <Link
                  key={p}
                  href={def.basePath}
                  prefetch={false}
                  aria-label={`${def.label} paneline geç`}
                  title={expanded ? undefined : def.label}
                  onClick={() => {
                    if (allowedP) setLastPortal(p);
                    onNavigate?.();
                  }}
                  className={cn(
                    "flex h-8 items-center justify-center gap-2 rounded-md px-1 text-xs font-semibold whitespace-nowrap transition",
                    on
                      ? ACCENT[def.accent].switch
                      : "text-zinc-500 hover:text-zinc-800",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {expanded ? (
                    <span className="truncate">{def.label}</span>
                  ) : null}
                  {expanded && !allowedP ? (
                    <LockClosedIcon
                      className="size-3.5 shrink-0 text-zinc-400"
                      aria-hidden
                    />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Madde 19: "Satın Alma Talebi Aç" — yalnız satınalma portalında belirgin
          CTA (izin + portal erişimi şart). Satış portalında ana CTA yok: satış
          ilanı kaldırıldı (2026-09-04); ürün ekleme Ürünlerim sayfasında. */}
      {!minimal &&
      !inCompanyArea &&
      available.includes(active) &&
      active === "satinalma" &&
      canCreateBuyListing ? (
        <div className="mt-3 px-2">
          <Link
            href="/company/satinalma/taleplerim/yeni"
            onClick={onNavigate}
            title={expanded ? undefined : "Satın Alma Talebi Aç"}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <PlusIcon className="size-4 shrink-0" aria-hidden />
            {expanded ? (
              <span className="truncate">Satın Alma Talebi Aç</span>
            ) : null}
          </Link>
        </div>
      ) : null}

      {/* Nav — DÜZ liste, iç içe/akordeon yok (2026-08-22 sadeleştirme):
          Raporlar/Şablonlar İhalelerim sayfasından açılır; Profilim satışta
          menüde, satınalmada hesap menüsünde. */}
      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2">
        {inCompanyArea ? (
          <div
            className={cn(
              "mb-2 flex items-center gap-2.5 rounded-xl bg-zinc-50 ring-1 ring-zinc-950/5",
              expanded ? "px-2.5 py-2" : "justify-center p-1.5",
            )}
            title={expanded ? undefined : COMPANY_AREA.label}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-[11px] font-semibold text-white">
              {(company?.name ?? "?")
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0]?.toLocaleUpperCase("tr-TR") ?? "")
                .join("")}
            </span>
            {expanded ? (
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">{COMPANY_AREA.label}</span>
                <span className="block truncate text-sm font-semibold text-zinc-900">{company?.name ?? "—"}</span>
              </span>
            ) : null}
          </div>
        ) : null}
        {(inCompanyArea ? COMPANY_AREA.nav : minimal ? [] : portal.nav)
          .filter((item) => !item.permission || userHasPermission(user, item.permission))
          .map((item) => (
            <RailItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={
                inCompanyArea && item.href === COMPANY_AREA.basePath
                  ? pathname === COMPANY_AREA.basePath
                  : isPortalItemActive(item.href, pathname)
              }
              accent={inCompanyArea ? "zinc" : portal.accent}
              expanded={expanded}
              locked={!!item.minTier && !tierAtLeast(tier, item.minTier)}
              onClick={onNavigate}
            />
          ))}

        {/* Onaylar — panel nav'ından ayraçla ayrılır (yönetsel). */}
        {canAct && !minimal ? (
          <div className="mx-1 my-2 h-px bg-zinc-100" aria-hidden />
        ) : null}
        {canAct ? (
          <RailItem
            href="/company/onaylar"
            icon={ShieldCheckIcon}
            label="Onaylar"
            active={isPortalItemActive("/company/onaylar", pathname)}
            accent="zinc"
            expanded={expanded}
            badge={pendingCount || undefined}
            onClick={onNavigate}
          />
        ) : null}

      </nav>

      {/* Alt: Ayarlar (sol altta) + pin */}
      <div className="space-y-0.5 border-t border-zinc-100 px-2 py-2">
        <RailItem
          href="/company/ayarlar"
          icon={Cog6ToothIcon}
          label="Ayarlar"
          active={pathname?.startsWith("/company/ayarlar") ?? false}
          accent="zinc"
          expanded={expanded}
          onClick={onNavigate}
        />
        {showPin ? (
          <button
            type="button"
            onClick={togglePinned}
            title={pinned ? "Menüyü serbest bırak" : "Menüyü sabitle"}
            className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-950/5 hover:text-zinc-700"
          >
            <span className="ml-0.5 shrink-0">
              {pinned ? (
                <PinOff className="size-4.5" aria-hidden />
              ) : (
                <Pin className="size-4.5" aria-hidden />
              )}
            </span>
            <span
              className={cn(
                "truncate whitespace-nowrap transition-opacity duration-150",
                expanded ? "opacity-100" : "opacity-0",
              )}
            >
              {pinned ? "Sabitlemeyi kaldır" : "Menüyü sabitle"}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
