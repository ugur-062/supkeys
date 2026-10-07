"use client";

import { useTranslations } from "next-intl";
import { ALL_SEAT_PERMISSIONS, tierAtLeast } from "@rothern/shared";

import { userHasPermission } from "@/lib/company/permissions";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useVerificationMeta } from "@/lib/company/verification-status";
import { useSettingsPages, type SettingsPageMeta } from "@/lib/company/settings-pages";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { COMPANY_PROFILE_PERMISSIONS } from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import { Activity, BadgeCheck, Bell, Building2, ChevronRight, IdCard, Landmark, Lock, MapPin, Sparkles, Store, UserPlus2, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";

interface SettingsCard extends SettingsPageMeta {
  icon: LucideIcon;
  /**
   * Kartı belirli bir İZİNLE kapıla (kart-kapısı = uç-kapısı; sayfanın
   * `layout.tsx` kapısıyla AYNI izin) — denetim 2026-08-26 Parça 10 B5.
   */
  permission?: string | readonly string[];
  /**
   * Sayfa bu paketle açılır (sayfadaki `PremiumOnly` ile aynı eşik). Kademe
   * yetmiyorsa kart Raporlar hub'ı gibi "Silver ile açılır" rozeti taşır —
   * paket kilidi izin kapısının İÇİNDE: izinsiz üye kartı hiç görmez
   * (arayüz testi T3; eskiden tıklayınca sürpriz paket duvarı).
   */
  minTier?: "SILVER";
}

interface SettingsGroup {
  id: "firma" | "kisisel";
  title: string;
  subtitle: string;
  items: SettingsCard[];
}

export default function AyarlarPage() {
  const t = useTranslations("web.panel.settings.ayarlarPage");
  // Başlık/açıklama TEK KAYNAK `SETTINGS_PAGES` (okuyucunun dilinde) — sayfanın
  // kendi kabuğu da aynı kaydı okur (hub 2026-09-10 denetimi: kart metinleri
  // sayfalardan ayrışmıştı).
  const pages = useSettingsPages();
  const verificationMeta = useVerificationMeta();
  const { user, company } = useCompanyAuth();

  // Firma Ayarları ÜSTTE: firma hesabında günlük iş firma kartlarında.
  const groups: SettingsGroup[] = [
    {
      id: "firma",
      title: t("firmaAyarlari"),
      subtitle: t("firmaniziEkipUyeleriniVeSurecleriYonetin"),
      items: [
        // Profil sayfasının kapısıyla AYNI sabit (API `GET company/profile`
        // aynası) — yalnız onaylama izinli kişi kartı görüp yetki duvarına
        // düşüyordu (arayüz testi O-108).
        { ...pages.profil, icon: Store, permission: COMPANY_PROFILE_PERMISSIONS },
        { ...pages.firma, icon: Building2, permission: "company:manage" },
        // B5: uç `addresses:manage` ister ve bu izin Faz Y'de BİLİNÇLİ olarak
        // SA/ST'ye de verildi ("operasyon kullanıcısı teslimat adresi
        // ekleyebilmeli"); kart da aynı izinle açılır.
        { ...pages.adresler, icon: MapPin, permission: "addresses:manage" },
        { ...pages.banka, icon: Landmark, permission: "billing:manage" },
        { ...pages.kullanicilar, icon: UserPlus2, permission: "users:manage" },
        // Faz O — firma-yüzü aktivite logu (Silver+; K+Y).
        { ...pages.aktivite, icon: Activity, permission: ["users:manage", "company:manage"], minTier: "SILVER" },
        // Faz AI-0 — koltuklu herkes kendi kullanımını, K+Y firma kırılımını görür.
        {
          ...pages.ai,
          icon: Sparkles,
          permission: ["users:manage", "company:manage", ...ALL_SEAT_PERMISSIONS],
          minTier: "SILVER",
        },
        { ...pages.dogrulama, icon: BadgeCheck, permission: "company:manage" },
      ],
    },
    {
      id: "kisisel",
      title: t("kisiselAyarlar"),
      subtitle: t("hesabinizVeBildirimTercihleriniz"),
      items: [
        { ...pages.hesap, icon: IdCard },
        { ...pages.sifre, icon: Lock },
        { ...pages.bildirimler, icon: Bell },
      ],
    },
  ];

  // P2 (denetim §10.5): karta durum rozeti — YALNIZ store'da hazır veriden
  // (ekstra istek yok). Durum bilinmiyorsa rozet basmayız.
  const badgeFor = (href: string): { label: string; tone: StatusTone } | null => {
    if (href === "/company/ayarlar/dogrulama" && company) {
      // Tek kaynak: lib/company/verification-status (Doğrulama + Firma Bilgileri aynı sözlük).
      const m = verificationMeta(company.companyVerificationStatus);
      return { label: m.label, tone: m.tone };
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>{t("ayarlar")}</Heading>
      <Text className="mt-1 text-sm text-zinc-500">
        {t("hesabiniziFirmaniziVeBildirimTercihlerinizi")}
      </Text>

      <div className="mt-8 space-y-8">
        {groups.map((group) => {
          const items = group.items.filter((i) => !i.permission || userHasPermission(user, i.permission));
          if (items.length === 0) return null;
          return (
            <section key={group.id}>
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
                        {s.minTier && company && !tierAtLeast(company.tier, s.minTier) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                            <Lock className="size-3" aria-hidden />
                            {t("silverIleAcilir")}
                          </span>
                        ) : null}
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
