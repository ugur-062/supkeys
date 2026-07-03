"use client";

import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { cn } from "@/lib/utils";
import { BadgeCheck, Bell, Building2, ChevronRight, IdCard, Landmark, Lock, MapPin, Shield, UserPlus2, Workflow, type LucideIcon } from "lucide-react";
import Link from "next/link";

interface SettingsCard {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Yalnızca Yönetici görür (operasyon/yönetim kartları). */
  managerOnly?: boolean;
}

interface SettingsGroup {
  title: string;
  subtitle: string;
  items: SettingsCard[];
}

const GROUPS: SettingsGroup[] = [
  {
    title: "Kişisel Ayarlar",
    subtitle: "Hesabınız ve bildirim tercihleriniz",
    items: [
      {
        href: "/company/ayarlar/hesap-bilgileri",
        icon: IdCard,
        title: "Hesap Bilgileri",
        description: "Ad, soyad, telefon ve iletişim bilgileri",
      },
      {
        href: "/company/ayarlar/sifre",
        icon: Lock,
        title: "Şifre İşlemleri",
        description: "Parolanızı güvenli bir şekilde değiştirin",
      },
      {
        href: "/company/ayarlar/bildirimler",
        icon: Bell,
        title: "Bildirim Tercihleri",
        description: "E-posta bildirimlerinizi yönetin",
      },
      {
        href: "/company/ayarlar/2fa",
        icon: Shield,
        title: "İki Adımlı Doğrulama",
        description: "Authenticator ile ek giriş güvenliği",
      },
    ],
  },
  {
    title: "Firma Ayarları",
    subtitle: "Firmanızı, ekip üyelerini ve süreçleri yönetin",
    items: [
      {
        href: "/company/ayarlar/firma",
        icon: Building2,
        title: "Firma Profili",
        description: "Vergi, iletişim ve kategori bilgileri",
      },
      {
        href: "/company/ayarlar/adresler",
        icon: MapPin,
        title: "Adres Yönetimi",
        description: "Fatura ve teslimat adresleri",
        managerOnly: true,
      },
      {
        href: "/company/ayarlar/banka-hesaplari",
        icon: Landmark,
        title: "Banka Hesapları",
        description: "Sipariş onayında seçilen ödeme hesapları",
        managerOnly: true,
      },
      {
        href: "/company/ayarlar/kullanicilar",
        icon: UserPlus2,
        title: "Kullanıcı Yönetimi",
        description: "Ekip üyeleri, roller ve izinler",
        managerOnly: true,
      },
      {
        href: "/company/ayarlar/onay-akislari",
        icon: Workflow,
        title: "Onay Akışları",
        description: "İhale yayın ve kazandırma onay süreçleri",
        managerOnly: true,
      },
      {
        href: "/company/ayarlar/dogrulama",
        icon: BadgeCheck,
        title: "Doğrulama Belgeleri",
        description: "Vergi levhası, sicil, imza sirküleri (premium için gerekli)",
        managerOnly: true,
      },
    ],
  },
];

export default function AyarlarPage() {
  const { user } = useCompanyAuth();
  const isManager = !!user && (user.isOwner || user.roles.includes("YONETICI"));

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Ayarlar</Heading>
      <Text className="mt-1 text-sm text-zinc-500">
        Hesabınızı, firmanızı ve bildirim tercihlerinizi yönetin.
      </Text>

      <div className="mt-8 space-y-8">
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.managerOnly || isManager);
          if (items.length === 0) return null;
          return (
            <section key={group.title}>
              <div className="mb-3 px-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  {group.title}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-400">{group.subtitle}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((s) => (
                  <Link
                    key={s.href}
                    href={s.href}
                    className={cn(
                      "group flex items-center gap-4 rounded-2xl border border-zinc-950/10 bg-white p-5",
                      "transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md",
                    )}
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 transition-colors group-hover:bg-zinc-900 group-hover:text-white">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-950">{s.title}</p>
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
