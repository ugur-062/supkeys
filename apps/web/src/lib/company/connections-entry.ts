import { userHasPermission, type PermissionSubject } from "@/lib/company/permissions";
import { accessiblePortals, type PortalKey } from "@/lib/company/portals";

/** Portalın Bağlantılar (ilişki yönetimi) sayfası. */
export function connectionsPathFor(portal: PortalKey): string {
  return portal === "satis" ? "/company/satis/musterilerim" : "/company/satinalma/tedarikcilerim";
}

/**
 * Portaldan bağımsız Bağlantılar girişinin (`/company/baglantilar`) hedefi —
 * KİŞİNİN izinlerinden: son kullandığı portal açılabiliyorsa o, değilse
 * açılabilen ilk portal (satınalma önce). Hiçbir portalı açamayan ama satınalma
 * görüntüleme izni olan (paketi düşük) satınalma sayfasına gider — oradaki kapı
 * ne gerektiğini söyler; kalanlar panel köküne.
 */
export function connectionsPagePath(
  user: PermissionSubject | null | undefined,
  tier: string | undefined,
  lastPortal: PortalKey | null,
  incoming: boolean,
): string {
  const available = accessiblePortals(user, tier);
  const portal =
    lastPortal && available.includes(lastPortal)
      ? lastPortal
      : (available[0] ?? (userHasPermission(user, "buy:view") ? "satinalma" : null));
  if (!portal) return "/company";
  return `${connectionsPathFor(portal)}${incoming ? "?view=incoming" : ""}`;
}
