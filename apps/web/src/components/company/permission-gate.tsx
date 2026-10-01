"use client";

import { useTranslations } from "next-intl";
import { OWNER_ONLY_PERMISSIONS } from "@rothern/shared";
import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { userHasPermission } from "@/lib/company/permissions";
import { Link } from "@/i18n/navigation";
import { ShieldAlert } from "lucide-react";

const OWNER_ONLY = new Set<string>(OWNER_ONLY_PERMISSIONS);

/**
 * Genel izin kapısı (yetki tablosu Faz 3) — sayfa düzeyinde: kişinin efektif
 * izin listesinde `permission` (dizi = herhangi biri) yoksa içerik yerine
 * kısa bir not gösterir. API kapısının aynasıdır; asıl güvenlik sunucuda,
 * bu katman kullanıcıya 403 tostu yerine anlaşılır bir sayfa verir.
 * `/me` izin listesi yoksa (eski önbellek) rol hazır setine düşer.
 */
export function PermissionGate({
  permission,
  title,
  description,
  backHref,
  backLabel,
  children,
}: {
  permission: string | readonly string[];
  title?: string;
  /** Hangi tikin gerektiği — Ayarlar › Kullanıcılar'daki satır adıyla. */
  description: string;
  /** Kapı ekranında geri bağlantısı (ör. Ayarlar hub'ı). */
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("web.panel.trade.permissionGate");
  const { user } = useCompanyAuth();
  const heading = title ?? t("buSayfaYetkiGerektirir");
  // Sahibe özel izin (banka, firma silme, devir) tabloda VERİLEMEZ: "firma
  // yöneticinize başvurun" yanlış yönlendirir — kurucuya yönlendir (D-301).
  const perms = typeof permission === "string" ? [permission] : permission;
  const ownerOnly = perms.length > 0 && perms.every((p) => OWNER_ONLY.has(p));
  if (!userHasPermission(user, permission)) {
    return (
      <div
        className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center"
        role="status"
      >
        <ShieldAlert className="h-8 w-8 text-zinc-300" aria-hidden />
        <h2 className="text-base font-semibold text-zinc-900">{heading}</h2>
        <Text className="text-sm text-zinc-500">
          {ownerOnly
            ? t("kurucuyaBasvurun", { description: description })
            : t("yetkiIcinFirmaYoneticinizeBasvurun", { description: description })}
        </Text>
        {backHref && backLabel ? (
          <Link
            href={backHref}
            className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
          >
            {backLabel}
          </Link>
        ) : null}
      </div>
    );
  }
  return <>{children}</>;
}
