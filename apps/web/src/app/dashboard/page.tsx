"use client";

import { EmptyPanel } from "@/components/dashboard/empty-panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { OnboardingCard } from "@/components/dashboard/onboarding-card";
import { useAuth, useMe } from "@/hooks/use-auth";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Activity,
  Calendar,
  CheckSquare,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const { user } = useAuth();
  // Token doğrulama — sessizce arka planda /auth/me çağır
  useMe();

  // Hydration sonrası tarih (SSR/CSR mismatch'i önler — saat dilimi farkı)
  const [todayLabel, setTodayLabel] = useState<string>("");
  useEffect(() => {
    setTodayLabel(format(new Date(), "d MMMM yyyy, EEEE", { locale: tr }));
  }, []);

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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Greeting */}
      <header>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="font-display font-bold text-3xl text-brand-900 leading-tight">
            Hoş geldin, {user?.firstName ?? "Supkeys kullanıcısı"} 👋
          </h1>
          <span className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md bg-success-50 text-success-700 font-semibold border border-success-500/20">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-success-500" />
            Aktif
          </span>
        </div>
        <p className="text-slate-500 text-sm">
          {user?.tenant.name
            ? `${user.tenant.name} hesabına genel bakış`
            : "Panele genel bakış"}
          {todayLabel && (
            <>
              <span className="mx-2 text-slate-300">·</span>
              <span>{todayLabel}</span>
            </>
          )}
        </p>
      </header>

      {/* KPI grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Aktif İhaleler"
          value={kpis.activeAuctions === 0 ? null : kpis.activeAuctions}
          icon={FileText}
          accent="brand"
          hint="Yayında olan ihaleler burada görünecek"
        />
        <KpiCard
          label="Onay Bekleyen"
          value={kpis.pendingApprovals === 0 ? null : kpis.pendingApprovals}
          icon={CheckSquare}
          accent="warning"
          hint="Sizin onayınızı bekleyenler"
        />
        <KpiCard
          label="Bu Ay Tasarruf"
          value={
            kpis.monthSavings === 0
              ? null
              : `₺${kpis.monthSavings.toLocaleString("tr-TR")}`
          }
          icon={TrendingUp}
          accent="success"
          hint="İhalelerden kazanılan toplam"
        />
        <KpiCard
          label="Tedarikçiler"
          value={kpis.suppliers === 0 ? null : kpis.suppliers}
          icon={Users}
          accent="indigo"
          hint="Onaylı listede toplam"
        />
      </div>

      {/* Onboarding — tüm KPI'lar 0 ise göster */}
      {allEmpty && (
        <OnboardingCard
          heading="Supkeys'e hoş geldin"
          subtitle="İlk değerini almak için 3 hızlı adım"
          steps={[
            {
              title: "İlk tedarikçini ekle",
              description:
                "Mevcut tedarikçilerini davet et veya 45 binlik tedarikçi havuzumuzdan keşfet.",
              ctaLabel: "Tedarikçi Ekle",
              ctaHref: "/dashboard/tedarikciler",
              duration: "2dk",
            },
            {
              title: "İlk ihaleni aç",
              description:
                "Talebini yayınla, tekliflerini topla, tasarruf et.",
              ctaLabel: "İhale Oluştur",
              ctaHref: "/dashboard/ihaleler/yeni",
              duration: "5dk",
            },
            {
              title: "Ekibine üye davet et",
              description:
                "Satın almacı veya onaylayıcı kullanıcılar ekle.",
              ctaLabel: "Davet Gönder",
              ctaHref: "/dashboard/ayarlar",
              duration: "1dk",
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
          iconAccent="brand"
          emptyTitle="Henüz aktif ihalen yok"
          emptyDescription="İlk ihaleni oluşturarak tasarrufa başla."
          ctaLabel="İlk ihalemi aç"
          ctaHref="/dashboard/ihaleler/yeni"
        />
        <EmptyPanel
          heading="Son Aktiviteler"
          subtitle="Sistemdeki son hareketler."
          icon={Activity}
          iconAccent="indigo"
          emptyTitle="Henüz aktivite yok"
          emptyDescription="İhale, teklif ve sipariş hareketleri burada listelenecek."
        />
      </div>
    </div>
  );
}
