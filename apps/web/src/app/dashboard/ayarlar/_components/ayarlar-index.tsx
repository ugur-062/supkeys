"use client";

import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  Bell,
  Building2,
  ChevronRight,
  IdCard,
  Lock,
  type LucideIcon,
  MapPin,
  UserPlus2,
} from "lucide-react";
import Link from "next/link";

interface SettingsCard {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  adminOnly?: boolean;
}

const SECTIONS: SettingsCard[] = [
  {
    href: "/dashboard/ayarlar/hesap-bilgileri",
    icon: IdCard,
    title: "Hesap Bilgileri",
    description: "Kişisel Bilgiler, İletişim Bilgileri",
  },
  {
    href: "/dashboard/ayarlar/sifre-islemleri",
    icon: Lock,
    title: "Şifre İşlemleri",
    description: "Şifre Değiştir",
  },
  {
    href: "/dashboard/ayarlar/kullanici-islemleri",
    icon: UserPlus2,
    title: "Kullanıcı İşlemleri",
    description: "Kullanıcı Ekleme ve Yetkilendirme",
    adminOnly: true,
  },
  {
    href: "/dashboard/ayarlar/firma-tercihleri",
    icon: MapPin,
    title: "Firma Tercihleri",
    description: "Fatura, İletişim ve Teslimat Adresleri",
    adminOnly: true,
  },
  {
    href: "/dashboard/ayarlar/bildirim-tercihleri",
    icon: Bell,
    title: "Bildirim Tercihleri",
    description: "İhale, Firma ve Supkeys Bildirimleri",
  },
  {
    href: "/dashboard/ayarlar/firma-profili",
    icon: Building2,
    title: "Firma Profili",
    description: "Firma Bilgileri, Vergi Bilgileri",
  },
];

export function AyarlarIndex() {
  const { user } = useAuth();
  const isAdmin = user?.role === "COMPANY_ADMIN";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-brand-900">
          Ayarlar
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Hesabınızı ve firma ayarlarınızı yönetin.
        </p>
      </header>

      <div className="mt-8 space-y-3">
        {SECTIONS.filter((s) => !s.adminOnly || isAdmin).map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5",
              "transition-all hover:border-brand-300 hover:shadow-sm",
            )}
          >
            <div className="h-12 w-12 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
              <s.icon className="h-6 w-6 text-brand-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-brand-900">{s.title}</p>
              <p className="text-sm text-slate-500 mt-0.5">{s.description}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-400 transition-all group-hover:translate-x-1 group-hover:text-brand-600" />
          </Link>
        ))}
      </div>
    </div>
  );
}
