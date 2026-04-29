"use client";

import { EmptyPanel } from "@/components/dashboard/empty-panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { useAuth, useMe } from "@/hooks/use-auth";
import {
  Activity,
  Calendar,
  CheckSquare,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuth();
  // Token doğrulama — sessizce arka planda /auth/me çağır
  useMe();

  // V1'de gerçek metrik yok — null/0 ile placeholder göster
  const kpis = {
    activeAuctions: 0,
    pendingApprovals: 0,
    monthSavings: 0,
    suppliers: 0,
  };

  const allEmpty =
    kpis.activeAuctions === 0 &&
    kpis.pendingApprovals === 0 &&
    kpis.monthSavings === 0 &&
    kpis.suppliers === 0;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Greeting */}
      <header className="space-y-1">
        <h1 className="font-display font-bold text-3xl text-brand-900">
          Hoş geldin, {user?.firstName ?? "Supkeys kullanıcısı"} 👋
        </h1>
        <p className="text-slate-500">
          {user?.tenant.name
            ? `${user.tenant.name} hesabı için panele genel bakış.`
            : "Panele genel bakış."}
        </p>
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Aktif İhaleler"
          value={kpis.activeAuctions === 0 ? null : kpis.activeAuctions}
          icon={FileText}
          accent="brand"
          hint="Yayında olan"
        />
        <KpiCard
          label="Onay Bekleyen"
          value={kpis.pendingApprovals === 0 ? null : kpis.pendingApprovals}
          icon={CheckSquare}
          accent="warning"
          hint="Sizin onayınızda"
        />
        <KpiCard
          label="Bu Ay Tasarruf"
          value={
            kpis.monthSavings === 0 ? null : `₺${kpis.monthSavings.toLocaleString("tr-TR")}`
          }
          icon={TrendingUp}
          accent="success"
          hint="Toplam saving"
        />
        <KpiCard
          label="Tedarikçiler"
          value={kpis.suppliers === 0 ? null : kpis.suppliers}
          icon={Users}
          accent="brand"
          hint="Onaylı listede"
        />
      </div>

      {/* Onboarding — tüm KPI'lar 0 ise göster */}
      {allEmpty && (
        <OnboardingCard
          heading="Supkeys'e hoş geldin 🎯"
          subtitle="İlk değerini almak için 3 hızlı adım:"
          steps={[
            {
              title: "İlk tedarikçini ekle",
              description:
                "Mevcut tedarikçilerini davet et veya 45 binlik tedarikçi havuzumuzdan keşfet.",
              ctaLabel: "Tedarikçi Ekle",
              ctaHref: "/dashboard/tedarikciler",
            },
            {
              title: "İlk ihaleni aç",
              description:
                "Talebini yayınla, tekliflerini topla, tasarruf et.",
              ctaLabel: "İhale Oluştur",
              ctaHref: "/dashboard/ihaleler/yeni",
            },
            {
              title: "Ekibine üye davet et",
              description:
                "Satın almacı veya onaylayıcı kullanıcılar ekle.",
              ctaLabel: "Davet Gönder",
              ctaHref: "/dashboard/ayarlar",
            },
          ]}
        />
      )}

      {/* İki panelli alt grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EmptyPanel
          heading="Yaklaşan İhaleler"
          subtitle="Kapanışı yaklaşan ihaleler burada görünecek."
          icon={Calendar}
          emptyTitle="Henüz aktif ihalen yok"
          emptyDescription="İlk ihaleni oluşturduğunda burada listelenir."
          ctaLabel="İlk ihaleni oluştur"
          ctaHref="/dashboard/ihaleler/yeni"
        />
        <EmptyPanel
          heading="Son Aktiviteler"
          subtitle="Sistemdeki son hareketler."
          icon={Activity}
          emptyTitle="Henüz aktivite yok"
          emptyDescription="İhale, teklif ve sipariş hareketleri burada listelenecek."
        />
      </div>
    </div>
  );
}
