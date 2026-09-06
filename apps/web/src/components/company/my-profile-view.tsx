"use client";

import { ProfileEditor } from "@/components/company/profile-editor";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useCompanyProfile } from "@/hooks/use-company-profile";

/**
 * Profilim — başkalarının gördüğü profil, ÜSTÜNDE düzenlenir (2026-08-22;
 * eski Önizleme/Düzenle sekmeleri + ayrı form kaldırıldı). Düzenleme yetkisi
 * backend PATCH kapısıyla birebir (company:manage). Ticari sicil bilgileri
 * Ayarlar → Firma'dan gelir. Herkese açık profil HER pakete açık (2026-09-06:
 * eski Bronz+ layout kapısı ve buradaki kilit kartı kaldırıldı — denetimde
 * ücretsiz üye profilini düzenleyemiyordu, Faz 1 ile çelişiyordu).
 */
export function MyProfileView() {
  const { data: profile, isLoading } = useCompanyProfile();
  const canEdit = useHasCompanyPermission("company:manage");

  if (isLoading || !profile) {
    return (
      <div className="space-y-4" aria-hidden>
        <div className="h-8 w-40 animate-pulse rounded bg-zinc-100" />
        <div className="h-56 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }

  return <ProfileEditor profile={profile} canEdit={canEdit} />;
}
