"use client";

import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";

import { userHasPermission } from "@/lib/company/permissions";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { verificationMeta } from "@/lib/company/verification-status";
import { SETTINGS_PAGES, type SettingsPageMeta } from "@/lib/company/settings-pages";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { cn } from "@/lib/utils";
import { Activity, BadgeCheck, Bell, Building2, ChevronRight, IdCard, Landmark, Lock, MapPin, Shield, Sparkles, Store, UserPlus2, Workflow, type LucideIcon } from "lucide-react";
import Link from "next/link";

interface SettingsCard extends SettingsPageMeta {
  icon: LucideIcon;
  /**
   * Kartı belirli bir İZİNLE kapıla (kart-kapısı = uç-kapısı; sayfanın
   * `layout.tsx` kapısıyla AYNI izin) — denetim 2026-08-26 Parça 10 B5.
   */
  permission?: string | readonly string[];
}

interface SettingsGroup {
  title: string;
  subtitle: string;
  items: SettingsCard[];
}

// Başlık/açıklama TEK KAYNAK `SETTINGS_PAGES` — sayfanın kendi kabuğu da aynı
// kaydı okur (hub 2026-09-10 denetimi: kart metinleri sayfalardan ayrışmıştı).
// Firma Ayarları ÜSTTE: firma hesabında günlük iş firma kartlarında.
const GROUPS: SettingsGroup[] = [
  {
    title: "Firma Ayarları",
    subtitle: "Firmanızı, ekip üyelerini ve süreçleri yönetin",
    items: [
      { ...SETTINGS_PAGES.profil, icon: Store },
      { ...SETTINGS_PAGES.firma, icon: Building2, permission: "company:manage" },
      // B5: uç `addresses:manage` ister ve bu izin Faz Y'de BİLİNÇLİ olarak
      // SA/ST'ye de verildi ("operasyon kullanıcısı teslimat adresi
      // ekleyebilmeli"); kart da aynı izinle açılır.
      { ...SETTINGS_PAGES.adresler, icon: MapPin, permission: "addresses:manage" },
      { ...SETTINGS_PAGES.banka, icon: Landmark, permission: "billing:manage" },
      { ...SETTINGS_PAGES.kullanicilar, icon: UserPlus2, permission: "users:manage" },
      // Faz O — firma-yüzü aktivite logu (Silver+; K+Y).
      { ...SETTINGS_PAGES.aktivite, icon: Activity, permission: ["users:manage", "company:manage"] },
      // Faz AI-0 — koltuklu herkes kendi kullanımını, K+Y firma kırılımını görür.
      {
        ...SETTINGS_PAGES.ai,
        icon: Sparkles,
        permission: ["users:manage", "company:manage", ...ALL_SEAT_PERMISSIONS],
      },
      { ...SETTINGS_PAGES.onayAkislari, icon: Workflow, permission: "approvals:manage" },
      { ...SETTINGS_PAGES.dogrulama, icon: BadgeCheck, permission: "company:manage" },
    ],
  },
  {
    title: "Kişisel Ayarlar",
    subtitle: "Hesabınız ve bildirim tercihleriniz",
    items: [
      { ...SETTINGS_PAGES.hesap, icon: IdCard },
      { ...SETTINGS_PAGES.sifre, icon: Lock },
      { ...SETTINGS_PAGES.bildirimler, icon: Bell },
      { ...SETTINGS_PAGES.twoFactor, icon: Shield },
    ],
  },
];

export default function AyarlarPage() {
  const { user, company } = useCompanyAuth();

  // P2 (denetim §10.5): karta durum rozeti — YALNIZ store'da hazır veriden
  // (ekstra istek yok). Durum bilinmiyorsa rozet basmayız.
  const badgeFor = (href: string): { label: string; tone: StatusTone } | null => {
    if (href === "/company/ayarlar/2fa" && user)
      return user.twoFactorEnabled
        ? { label: "Açık", tone: "done" }
        : { label: "Kapalı", tone: "neutral" };
    if (href === "/company/ayarlar/dogrulama" && company) {
      // Tek kaynak: lib/company/verification-status (Doğrulama + Firma Bilgileri aynı sözlük).
      const m = verificationMeta(company.companyVerificationStatus);
      return { label: m.label, tone: m.tone };
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Ayarlar</Heading>
      <Text className="mt-1 text-sm text-zinc-500">
        Hesabınızı, firmanızı ve bildirim tercihlerinizi yönetin.
      </Text>

      <div className="mt-8 space-y-8">
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.permission || userHasPermission(user, i.permission));
          if (items.length === 0) return null;
          return (
            <section key={group.title}>
              <div className="mb-3 px-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  {group.title}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">{group.subtitle}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={cn(
                      "group flex items-center gap-4 card p-5",
                      "transition-all duration-200 hover:-translate-y-[1px] hover:border-zinc-300 hover:shadow-card-hover",
                    )}
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 transition-colors group-hover:bg-zinc-900 group-hover:text-white">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-zinc-950">
                        {s.title}
                        {(() => {
                          const badge = badgeFor(s.href);
                          return badge ? (
                            <StatusBadge tone={badge.tone}>
                              {badge.label}
                            </StatusBadge>
                          ) : null;
                        })()}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                        {s.description}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-zinc-300 transition-all group-hover:translate-x-1 group-hover:text-zinc-700" />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
