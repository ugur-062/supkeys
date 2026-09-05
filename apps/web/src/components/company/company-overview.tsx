"use client";

import { CompanyLogo } from "@/components/company/company-logo";
import { SellerHealthCards } from "@/components/dashboard/seller-health-cards";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { useCompanyUsers } from "@/hooks/use-company-users";
import { useVisitors } from "@/hooks/use-company-views";
import { useReceivedInquiries } from "@/hooks/use-inquiries";
import { TIER_LABELS } from "@/lib/company/labels";
import { COMPANY_AREA_BASE } from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import { tierAtLeast } from "@rothern/shared";
import {
  ArrowRightIcon,
  ChartBarIcon,
  CheckBadgeIcon,
  EnvelopeIcon,
  EyeIcon,
  ShieldExclamationIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";

/**
 * ŞİRKETİM › GENEL BAKIŞ (2026-09-05, Europages "My Company" kalıbı).
 *
 * Bir pano DEĞİL: firmanın kimlik başlığı + özet kartları + her kartta tek
 * çıkış bağlantısı. Liste, tablo, grafik YOK — aynı içeriğin ikinci kopyası
 * olmasın (kullanıcı kuralı). Kartlar mevcut kancalardan beslenir; verisi
 * olmayan kart çizilmez (uydurma/"yakında" yok).
 *   · Profil tamlığı + vitrin sayıları: `SellerHealthCards` (satış panosuyla
 *     AYNI bileşen, AYNI hesap)
 *   · Bilgi talepleri (yanıt bekleyen), Ekip, Doğrulama, Raporlar
 *   · Ziyaretçiler (30 gün): `useVisitors` — Ziyaret Edenler ile aynı uç
 */
export function CompanyOverview() {
  const { company, user } = useCompanyAuth();
  const profile = useCompanyProfile();
  const roles = user?.roles ?? [];
  const isManager = roles.includes("SAHIP") || roles.includes("YONETICI");
  const canSell = isManager || roles.includes("SATISCI");
  const tier = profile.data?.tier ?? company?.tier ?? "STANDART";
  const inquiries = useReceivedInquiries(canSell && tierAtLeast(tier, "BRONZ"));
  const users = useCompanyUsers();
  const visitors = useVisitors(30);
  const p = profile.data;
  const verified = p?.companyVerificationStatus === "VERIFIED";
  const inquiryList = Array.isArray(inquiries.data) ? [] : (inquiries.data?.items ?? []);
  const pendingInquiries = inquiryList.filter((i) => i.replies.length === 0).length;
  const initials = (company?.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");

  return (
    <div className="space-y-8">
      {/* Kimlik başlığı */}
      <header className="flex flex-wrap items-center gap-4">
        <CompanyLogo
          src={p?.logoUrl}
          alt=""
          className="size-16 rounded-2xl object-cover ring-1 ring-zinc-950/10"
          fallback={
            <span className="flex size-16 items-center justify-center rounded-2xl bg-zinc-900 text-lg font-semibold text-white">
              {initials}
            </span>
          }
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-950">
            {company?.name ?? "—"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
            {p?.rothernId ? <span className="font-mono text-xs text-zinc-600">{p.rothernId}</span> : null}
            {p?.city ? <span>{p.city}</span> : null}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                tier === "GOLD"
                  ? "bg-amber-100 text-amber-700"
                  : tier === "STANDART"
                    ? "bg-zinc-100 text-zinc-600"
                    : "bg-blue-100 text-blue-700",
              )}
            >
              {TIER_LABELS[tier] ?? tier}
            </span>
            {verified ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckBadgeIcon aria-hidden className="size-4" />
                Doğrulanmış firma
              </span>
            ) : null}
          </p>
        </div>
        {p?.slug && p.publicEnabled ? (
          <Link
            href={`/firma/${p.slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Herkese açık profili gör
          </Link>
        ) : null}
      </header>

      {/* Profil tamlığı + vitrin — satış panosuyla AYNI kartlar/hesap */}
      <SellerHealthCards mode={canSell ? "both" : "profile"} profileHref={`${COMPANY_AREA_BASE}/profil`} />

      <section aria-label="Firma özeti" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={EyeIcon}
          label="Ziyaretçiler (30 gün)"
          value={visitors.isLoading ? null : (visitors.data?.total ?? 0)}
          hint={
            visitors.data
              ? visitors.data.identified > 0
                ? `${visitors.data.identified} firma kimliğiyle`
                : "profil ve ürün görüntülenmesi"
              : "profil ve ürün görüntülenmesi"
          }
          href={`${COMPANY_AREA_BASE}/ziyaretciler`}
        />
        {canSell && tierAtLeast(tier, "BRONZ") ? (
          <StatCard
            icon={EnvelopeIcon}
            label="Bilgi talepleri"
            value={inquiries.isLoading ? null : pendingInquiries}
            hint={pendingInquiries > 0 ? "yanıt bekliyor" : "yanıt bekleyen yok"}
            href="/company/satis/bilgi-talepleri"
            attention={pendingInquiries > 0}
          />
        ) : null}
        {isManager ? (
          <StatCard
            icon={UsersIcon}
            label="Ekip"
            value={users.isLoading ? null : (users.data?.length ?? 0)}
            hint="kullanıcı"
            href="/company/ayarlar/kullanicilar"
          />
        ) : null}
        <StatCard
          icon={verified ? CheckBadgeIcon : ShieldExclamationIcon}
          label="Doğrulama"
          value={null}
          hint={verified ? "Kimlik doğrulandı" : "Belgeler bekleniyor"}
          href="/company/ayarlar/dogrulama"
          attention={!verified}
        />
        {tierAtLeast(tier, "SILVER") ? (
          <StatCard
            icon={ChartBarIcon}
            label="Raporlar"
            value={null}
            hint="Satın alma raporları ve zaman tasarrufu"
            href={`${COMPANY_AREA_BASE}/raporlar`}
          />
        ) : null}
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  attention = false,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  /** null → sayı basılmaz (durum kartı ya da yükleniyor). */
  value: number | null;
  hint: string;
  href: string;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-zinc-600">
        <Icon aria-hidden className={cn("size-4", attention ? "text-amber-600" : "text-zinc-400")} />
        {label}
      </span>
      <span className="mt-3">
        {value != null ? (
          <span className="block text-2xl font-semibold tabular-nums text-zinc-950">{value}</span>
        ) : null}
        <span className="block text-xs text-zinc-500">{hint}</span>
      </span>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 group-hover:text-zinc-600">
        Aç
        <ArrowRightIcon aria-hidden className="size-3.5" />
      </span>
    </Link>
  );
}
