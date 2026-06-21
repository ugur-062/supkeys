"use client";

import { PageHeader } from "@/components/list";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import {
  Bell,
  Building2,
  ChevronRight,
  IdCard,
  Lock,
  type LucideIcon,
  MapPin,
  Shield,
  UserPlus2,
  Workflow,
} from "lucide-react";
import Link from "next/link";

interface SettingsCard {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** V2-6.5 — Gerekli permission; undefined = herkese açık */
  permission?: string;
  accent: "brand" | "indigo" | "success" | "warning" | "danger";
}

interface SettingsGroup {
  title: string;
  subtitle: string;
  items: SettingsCard[];
}

const GROUPS: SettingsGroup[] = [
  {
    title: "Kişisel Ayarlar",
    subtitle: "Sizin hesabınız ve bildirim tercihleriniz",
    items: [
      {
        href: "/dashboard/ayarlar/hesap-bilgileri",
        icon: IdCard,
        title: "Hesap Bilgileri",
        description: "Ad, soyad, telefon ve iletişim bilgileri",
        accent: "brand",
      },
      {
        href: "/dashboard/ayarlar/sifre-islemleri",
        icon: Lock,
        title: "Şifre İşlemleri",
        description: "Şifrenizi güvenli bir şekilde değiştirin",
        accent: "indigo",
      },
      {
        href: "/dashboard/ayarlar/bildirim-tercihleri",
        icon: Bell,
        title: "Bildirim Tercihleri",
        description: "E-posta bildirimlerinizi yönetin",
        accent: "warning",
      },
    ],
  },
  {
    title: "Firma Ayarları",
    subtitle: "Firmanızı, ekip üyelerini ve süreçleri yönetin",
    items: [
      {
        href: "/dashboard/ayarlar/firma-profili",
        icon: Building2,
        title: "Firma Profili",
        description: "Vergi, iletişim ve kategori bilgileri",
        accent: "brand",
      },
      {
        href: "/dashboard/ayarlar/firma-tercihleri",
        icon: MapPin,
        title: "Adres Yönetimi",
        description: "Fatura, iletişim ve teslimat adresleri",
        permission: "settings:addresses",
        accent: "success",
      },
      {
        href: "/dashboard/ayarlar/kullanici-islemleri",
        icon: UserPlus2,
        title: "Kullanıcı Yönetimi",
        description: "Ekip üyeleri ve yetkilendirme",
        permission: "settings:users",
        accent: "indigo",
      },
      {
        href: "/dashboard/ayarlar/onay-akislari",
        icon: Workflow,
        title: "Onay Akışları",
        description: "İhale yayın ve kazandırma onay süreçleri",
        permission: "settings:approval",
        accent: "danger",
      },
    ],
  },
];

const ACCENT_ICON_BG: Record<SettingsCard["accent"], string> = {
  brand: "bg-brand-50 text-brand-600 group-hover:bg-brand-100",
  indigo: "bg-zinc-50 text-zinc-600 group-hover:bg-zinc-100",
  success: "bg-success-50 text-success-600 group-hover:bg-success-100",
  warning: "bg-warning-50 text-warning-600 group-hover:bg-warning-100",
  danger: "bg-danger-50 text-danger-600 group-hover:bg-danger-100",
};

export function AyarlarIndex() {
  // V2-6.5 RBAC — gizli card'lar permission tabanlı
  const { has } = usePermissions();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        title="Ayarlar"
        description="Hesabınızı, firmanızı ve bildirim tercihlerinizi yönetin."
      />

      <div className="mt-8 space-y-8">
        {GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (i) => !i.permission || has(i.permission),
          );
          if (visibleItems.length === 0) return null;
          return (
            <section key={group.title}>
              <div className="mb-3 px-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {group.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {group.subtitle}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visibleItems.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={cn(
                      "group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5",
                      "transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl transition-colors",
                        ACCENT_ICON_BG[s.accent],
                      )}
                    >
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-brand-900">{s.title}</p>
                        {s.permission ? (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-700"
                            title={`Gerekli yetki: ${s.permission}`}
                          >
                            <Shield className="h-2.5 w-2.5" />
                            Yetki
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {s.description}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-brand-600" />
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
