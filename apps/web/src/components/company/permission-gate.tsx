"use client";

import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { userHasPermission } from "@/lib/company/permissions";
import { ShieldAlert } from "lucide-react";

/**
 * Genel izin kapısı (yetki tablosu Faz 3) — sayfa düzeyinde: kişinin efektif
 * izin listesinde `permission` (dizi = herhangi biri) yoksa içerik yerine
 * kısa bir not gösterir. API kapısının aynasıdır; asıl güvenlik sunucuda,
 * bu katman kullanıcıya 403 tostu yerine anlaşılır bir sayfa verir.
 * `/me` izin listesi yoksa (eski önbellek) rol hazır setine düşer.
 */
export function PermissionGate({
  permission,
  title = "Bu sayfa yetki gerektirir",
  description,
  children,
}: {
  permission: string | readonly string[];
  title?: string;
  /** Hangi tikin gerektiği — Ayarlar › Kullanıcılar'daki satır adıyla. */
  description: string;
  children: React.ReactNode;
}) {
  const { user } = useCompanyAuth();
  if (!userHasPermission(user, permission)) {
    return (
      <div
        className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center"
        role="status"
      >
        <ShieldAlert className="h-8 w-8 text-zinc-300" aria-hidden />
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <Text className="text-sm text-zinc-500">
          {description} Yetki için firma yöneticinize başvurun.
        </Text>
      </div>
    );
  }
  return <>{children}</>;
}
