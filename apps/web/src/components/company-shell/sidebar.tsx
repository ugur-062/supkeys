"use client";

import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { usePendingApprovalCount } from "@/hooks/use-company-approvals";
import { usePortalStore } from "@/lib/company/portal-store";
import {
  PORTALS,
  PORTAL_ORDER,
  accessiblePortals,
  activePortalFromPath,
  isPortalItemActive,
  type PortalKey,
} from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import {
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  LockClosedIcon,
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
      onClick={onClick}
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
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
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
  const isPaid = company?.tier === "PAKET";

  const roles = user?.roles ?? [];
  const canAct = useHasCompanyPermission("approval:act");
  const { data: pendingCount } = usePendingApprovalCount(canAct);
  const available = accessiblePortals(roles, company?.tier);
  // Operasyonel kullanıcıya (en az bir portal rolü) HER İKİ panel gösterilir;
  // giremediği panel kilitli görünür. Tıklayınca PortalGuard uygun ekranı açar
  // (rol yoksa yetki ekranı, STANDARD ise Premium kapısı) — eski topbar mantığı.
  const canPurchase =
    roles.includes("SAHIP") ||
    roles.includes("YONETICI") ||
    roles.includes("SATIN_ALMACI");
  const canSell =
    roles.includes("SAHIP") ||
    roles.includes("YONETICI") ||
    roles.includes("SATISCI");
  const visiblePortals: PortalKey[] =
    canPurchase || canSell ? [...PORTAL_ORDER] : available;
  const lastPortal = usePortalStore((s) => s.lastPortal);
  // Portal-nötr rotalarda (/company/ilan, /company/onaylar…) SON portalda kal.
  const active: PortalKey =
    activePortalFromPath(pathname) ??
    (lastPortal && available.includes(lastPortal) ? lastPortal : null) ??
    available[0] ??
    "satis";
  const portal = PORTALS[active];
  // Profilim öğesi (portal-özel href) — ayraç altında ayrı render edilir.
  const profilItem = portal.nav.find((i) => i.href.endsWith("/profilim"));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Satınalma/Satış geçişi — Anasayfa'nın ÜSTÜNDE (kullanıcı isteği).
          Masaüstü rayda ikonla daralır; kilitli panel PortalGuard'a gider. */}
      {visiblePortals.length > 1 ? (
        <div className="mt-3 space-y-0.5 border-b border-zinc-950/5 px-2 pb-2">
          {PORTAL_ORDER.filter((p) => visiblePortals.includes(p)).map((p) => {
            const def = PORTALS[p];
            const allowedP = available.includes(p);
            return (
              <RailItem
                key={p}
                href={def.basePath}
                icon={
                  p === "satinalma" ? ShoppingCartIcon : BuildingStorefrontIcon
                }
                label={def.label}
                active={p === active}
                accent={def.accent}
                expanded={expanded}
                locked={!allowedP}
                onClick={() => {
                  if (allowedP) setLastPortal(p);
                  onNavigate?.();
                }}
              />
            );
          })}
        </div>
      ) : null}

      {/* Nav — Profilim ayraç altına alınır; Onaylar onun eski (liste-içi) yerine
          gelir (kullanıcı isteği: Onaylar ↔ Profil yer değişimi). */}
      <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2">
        {portal.nav
          .filter((item) => !item.href.endsWith("/profilim"))
          .map((item) => (
            <RailItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={isPortalItemActive(item.href, pathname)}
              accent={portal.accent}
              expanded={expanded}
              locked={item.paidOnly && !isPaid}
              onClick={onNavigate}
            />
          ))}

        {/* Onaylar — Profilim'in eski liste-içi konumu (ayraçsız). */}
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

        {/* Profilim — Onaylar'ın eski (ayraç altı) konumu. */}
        {profilItem ? (
          <>
            <div className="mx-1 my-2 h-px bg-zinc-100" aria-hidden />
            <RailItem
              href={profilItem.href}
              icon={profilItem.icon}
              label={profilItem.label}
              active={isPortalItemActive(profilItem.href, pathname)}
              accent={portal.accent}
              expanded={expanded}
              onClick={onNavigate}
            />
          </>
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
