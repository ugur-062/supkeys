"use client";

import { PageHeader } from "@/components/list";
import { cn } from "@/lib/utils";
import {
  Bell,
  Building2,
  ChevronRight,
  IdCard,
  Lock,
  type LucideIcon,
  Users2,
} from "lucide-react";
import Link from "next/link";

interface SettingsCard {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  accent: "brand" | "indigo" | "warning" | "success";
}

interface SettingsGroup {
  title: string;
  subtitle: string;
  items: SettingsCard[];
}

const GROUPS: SettingsGroup[] = [
  {
    title: "Kişisel Ayarlar",
    subtitle: "Hesabınız, güvenliğiniz ve bildirim tercihleriniz",
    items: [
      {
        href: "/supplier/ayarlar/hesap-bilgileri",
        icon: IdCard,
        title: "Hesap Bilgileri",
        description: "Ad, soyad ve telefon bilgileri",
        accent: "brand",
      },
      {
        href: "/supplier/ayarlar/sifre-islemleri",
        icon: Lock,
        title: "Şifre İşlemleri",
        description: "Şifrenizi güvenli bir şekilde değiştirin",
        accent: "indigo",
      },
      {
        href: "/supplier/ayarlar/bildirim-tercihleri",
        icon: Bell,
        title: "Bildirim Tercihleri",
        description: "E-posta bildirimlerinizi yönetin",
        accent: "warning",
      },
    ],
  },
  {
    title: "Firma Ayarları",
    subtitle: "Firma profilinizi ve ekibinizi yönetin",
    items: [
      {
        href: "/supplier/profil",
        icon: Building2,
        title: "Firma Profili",
        description: "Firma bilgileri, adres ve kategoriler",
        accent: "success",
      },
      {
        href: "/supplier/ayarlar/ekip",
        icon: Users2,
        title: "Ekip Yönetimi",
        description: "Çalışan davet edin, ekip üyelerini yönetin",
        accent: "indigo",
      },
    ],
  },
];

const ACCENT_ICON_BG: Record<SettingsCard["accent"], string> = {
  brand: "bg-brand-50 text-brand-600 group-hover:bg-brand-100",
  indigo: "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100",
  warning: "bg-warning-50 text-warning-600 group-hover:bg-warning-100",
  success: "bg-success-50 text-success-600 group-hover:bg-success-100",
};

export function SettingsIndex() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <PageHeader
        title="Ayarlar"
        description="Hesabınızı, güvenliğinizi ve bildirim tercihlerinizi yönetin."
      />

      <div className="mt-8 space-y-8">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <div className="mb-3 px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {group.title}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">{group.subtitle}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.items.map((s) => (
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
                    <p className="font-bold text-brand-900">{s.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {s.description}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-brand-600" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
