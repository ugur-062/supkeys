"use client";

import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";

import { isManagementUser, userHasPermission } from "@/lib/company/permissions";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useActivePortal } from "@/hooks/use-active-portal";
import { PORTAL_SECONDARY_HREFS } from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import { Activity, BadgeCheck, Bell, Building2, ChevronRight, IdCard, Landmark, Lock, MapPin, Shield, Sparkles, Store, UserPlus2, Workflow, type LucideIcon } from "lucide-react";
import Link from "next/link";

/** Sol menüden kalkan Profilim'in yeni giriş noktası — href aktif portala göre çözülür. */
const PROFILE_CARD_HREF = "__firma-profili__";

interface SettingsCard {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** Yalnızca Yönetici görür (operasyon/yönetim kartları). */
  managerOnly?: boolean;
  /**
   * Kartı belirli bir İZİNLE kapıla (kart-kapısı = uç-kapısı). `managerOnly`
   * yönetim ETİKETİNE bakar; bazı kartların ucu ise operasyon rollerine de
   * açıktır — denetim 2026-08-26 Parça 10 B5.
   */
  permission?: string | readonly string[];
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
        // Firma Bilgileri = ticari kayıt, Firma Profili = Profilim sayfası —
        // ayrım korunur (bkz. profile/settings split). İki kartın açıklaması
        // eskiden aynı sözcükleri taşıyordu ("vitrin"/"kategoriler"), kullanıcı
        // hangisine gideceğini bilemiyordu; bu kart yalnız Profilim'e köprü.
        href: PROFILE_CARD_HREF,
        icon: Store,
        title: "Firma Profili",
        description: "Profilim sayfasını aç — logo, tanıtım, galeri, hizmetler",
      },
      {
        href: "/company/ayarlar/firma",
        icon: Building2,
        title: "Firma Bilgileri",
        description: "Unvan, adres, KEP ve faaliyet kategorileri",
        permission: "company:manage",
      },
      {
        href: "/company/ayarlar/adresler",
        icon: MapPin,
        title: "Adres Yönetimi",
        description: "Fatura ve teslimat adresleri",
        // B5: uç `addresses:manage` ister ve bu izin Faz Y'de BİLİNÇLİ olarak
        // SA/ST'ye de verildi ("operasyon kullanıcısı teslimat adresi
        // ekleyebilmeli"). Kart `managerOnly` olduğu için operatör sihirbazda
        // "Ayarlar → Adresler'den ekleyin" uyarısını alıyor ama kartı
        // göremiyordu; URL'yi elle yazınca sayfa tam yetkiyle açılıyordu.
        permission: "addresses:manage",
      },
      {
        href: "/company/ayarlar/banka-hesaplari",
        icon: Landmark,
        title: "Banka Hesapları",
        description: "Sipariş onayında seçilen ödeme hesapları",
        permission: "billing:manage",
      },
      {
        href: "/company/ayarlar/kullanicilar",
        icon: UserPlus2,
        title: "Kullanıcı Yönetimi",
        description: "Ekip üyeleri, roller ve izinler",
        permission: "users:manage",
      },
      {
        // Faz O — firma-yüzü aktivite logu (Silver+; K+Y).
        href: "/company/ayarlar/aktivite",
        icon: Activity,
        title: "Aktivite Logu",
        description: "Firmanızda kim ne yaptı — eylem kayıtları",
        permission: ["users:manage", "company:manage"],
      },
      {
        // Faz AI-0 — AI kullanım ekranı (Silver+). managerOnly DEĞİL: SA/ST
        // kendi kullanımını görür; K+Y firma kırılımını görür.
        href: "/company/ayarlar/ai-kullanim",
        icon: Sparkles,
        title: "AI Kullanımı",
        description: "Aylık AI bütçe kullanımınız — yüzde bazında",
        permission: ["users:manage", "company:manage", ...ALL_SEAT_PERMISSIONS],
      },
      {
        // Onay akışları artık Onaylar sayfasından yönetiliyor — kısayol.
        href: "/company/onaylar",
        icon: Workflow,
        title: "Onay Akışları",
        description: "Kazanan onayı akışlarını Onaylar sayfasından tanımlayın",
        permission: "approvals:manage",
      },
      {
        href: "/company/ayarlar/dogrulama",
        icon: BadgeCheck,
        title: "Doğrulama Belgeleri",
        description: "Vergi levhası, sicil, imza sirküleri — Silver/Gold paketine geçişin ilk adımı",
        permission: "company:manage",
      },
    ],
  },
];

export default function AyarlarPage() {
  const { user, company } = useCompanyAuth();
  const activePortal = useActivePortal();
  const resolveHref = (href: string) =>
    href === PROFILE_CARD_HREF
      ? PORTAL_SECONDARY_HREFS[activePortal].profilim
      : href;
  const isManager = isManagementUser(user);

  // P2 (denetim §10.5): karta durum rozeti — YALNIZ store'da hazır veriden
  // (ekstra istek yok). Durum bilinmiyorsa rozet basmayız.
  const badgeFor = (href: string): { label: string; tone: StatusTone } | null => {
    if (href === "/company/ayarlar/2fa" && user)
      return user.twoFactorEnabled
        ? { label: "Açık", tone: "done" }
        : { label: "Kapalı", tone: "neutral" };
    if (href === "/company/ayarlar/dogrulama" && company) {
      switch (company.companyVerificationStatus) {
        case "VERIFIED":
          return { label: "Doğrulandı", tone: "done" };
        case "PENDING":
          return { label: "İncelemede", tone: "pending" };
        case "REJECTED":
          return { label: "Reddedildi", tone: "failed" };
        default:
          return { label: "Belge bekleniyor", tone: "neutral" };
      }
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
          const items = group.items.filter((i) =>
            i.permission
              ? userHasPermission(user, i.permission)
              : !i.managerOnly || isManager,
          );
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
                    href={resolveHref(s.href)}
                    className={cn(
                      "group flex items-center gap-4 card p-5",
                      "transition-all duration-200 hover:-translate-y-[1px] hover:border-slate-300 hover:shadow-card-hover",
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
