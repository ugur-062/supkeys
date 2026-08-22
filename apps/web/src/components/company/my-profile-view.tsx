"use client";

import { ProfileEditor } from "@/components/company/profile-editor";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { tierAtLeast } from "@rothern/shared";
import { Lock } from "lucide-react";

/**
 * Profilim — başkalarının gördüğü profil, ÜSTÜNDE düzenlenir (2026-08-22;
 * eski Önizleme/Düzenle sekmeleri + ayrı form kaldırıldı). Düzenleme yetkisi
 * backend PATCH kapısıyla birebir (company:manage). Ticari sicil bilgileri
 * Ayarlar → Firma'dan gelir; herkese açık profil Bronz+ (sayfa layout kapısı
 * satış tarafında PremiumOnly; burada da kilit kartı gösterilir).
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

  if (!tierAtLeast(profile.tier, "BRONZ")) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Profilim</h1>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <Lock className="mx-auto mb-2 h-7 w-7 text-amber-500" />
          <p className="font-medium text-amber-900">Herkese açık profil premium özelliği</p>
          <p className="mt-1 text-sm text-amber-800">
            Premium üyelikle Google&apos;da bulunabilir bir firma profili oluşturabilir, yeni
            firmalarla bağlantı kurabilirsiniz.
          </p>
        </div>
      </div>
    );
  }

  return <ProfileEditor profile={profile} canEdit={canEdit} />;
}
