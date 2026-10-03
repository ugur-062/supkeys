import type { ConfigService } from "@nestjs/config";
import type { AdminRole } from "@rothern/db";

/**
 * Admin 2FA zorunlulugu (derin denetim 2026-09-29 MU-01 / X18) — TEK KAYNAK.
 *
 * `ADMIN_2FA_REQUIRED_ROLES` virgullu rol listesi. Listedeki roldeki bir admin
 * 2FA'yi (TOTP) acmadan yalniz kurulum uclarini (`/admin/auth/me`,
 * `/admin/auth/2fa/setup`, `/admin/auth/2fa/enable`) kullanabilir; geri kalan
 * her admin ucu 403 `ADMIN_2FA_SETUP_REQUIRED` doner (AdminRolesGuard). Hesap
 * kilitlenmez: parolayla giris yapar, panel onu Ayarlar'daki kuruluma yollar.
 *
 *  - Tanimsiz  → production'da `SUPER_ADMIN`, diger ortamlarda bos (test/dev inert).
 *  - `""` / `none` → bilincli olarak kapali (prod'da boot uyarisi basilir).
 *  - Bilinmeyen rol → THROW (boot fail-closed; yazim hatasi sessizce kapatmasin).
 */
export const ADMIN_2FA_SETUP_REQUIRED_CODE = "ADMIN_2FA_SETUP_REQUIRED";

/** Record → prisma enum'una yeni rol eklenirse typecheck burada kirilir. */
const KNOWN_ROLES: Record<AdminRole, true> = {
  SUPER_ADMIN: true,
  SALES: true,
  SUPPORT: true,
};

export function resolveAdmin2faRequiredRoles(
  nodeEnv: string | undefined,
  raw: string | undefined,
): ReadonlySet<string> {
  if (raw === undefined || raw === null) {
    return new Set(nodeEnv === "production" ? ["SUPER_ADMIN"] : []);
  }
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "none") return new Set();
  const roles = trimmed
    .split(",")
    .map((r) => r.trim().toUpperCase())
    .filter((r) => r !== "");
  const unknown = roles.filter((r) => !(r in KNOWN_ROLES));
  if (unknown.length > 0) {
    throw new Error(
      `ADMIN_2FA_REQUIRED_ROLES contains unknown admin role(s): ${unknown.join(", ")}. ` +
        `Allowed: ${Object.keys(KNOWN_ROLES).join(", ")} (comma separated), or "none" to disable.`,
    );
  }
  return new Set(roles);
}

export function admin2faRequiredRolesFromConfig(
  config: Pick<ConfigService, "get"> | undefined,
): ReadonlySet<string> {
  const nodeEnv = config ? config.get<string>("NODE_ENV") : process.env.NODE_ENV;
  const raw = config
    ? config.get<string>("ADMIN_2FA_REQUIRED_ROLES")
    : process.env.ADMIN_2FA_REQUIRED_ROLES;
  return resolveAdmin2faRequiredRoles(nodeEnv, raw);
}

/** Bu rol + 2FA durumu icin kurulum zorunlu mu (login/me/guard ortak). */
export function isAdmin2faSetupRequired(
  requiredRoles: ReadonlySet<string>,
  admin: { role: string; twoFactorEnabled?: boolean | null },
): boolean {
  return requiredRoles.has(admin.role) && admin.twoFactorEnabled !== true;
}

/**
 * Boot guard: gecersiz deger THROW (deploy fail). Prod'da bilincli kapatma
 * gecerli ama gurultulu olsun diye cagirana uyari metni doner.
 */
export function assertAdmin2faConfig(config: Pick<ConfigService, "get">): string | null {
  const roles = admin2faRequiredRolesFromConfig(config);
  if (config.get<string>("NODE_ENV") === "production" && roles.size === 0) {
    return "ADMIN_2FA_REQUIRED_ROLES is empty/none in production - admin 2FA is NOT enforced for any role.";
  }
  return null;
}
