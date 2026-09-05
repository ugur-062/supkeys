"use client";

import { CompanyLogo } from "@/components/company/company-logo";
import { MiniBars } from "@/components/company/ui/mini-bars";
import { ProgressRing } from "@/components/company/ui/progress-ring";
import { SectionHead, StatTile } from "@/components/company/ui/stat-tile";
import { useCatalogCounts } from "@/hooks/use-company-items";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { useCompanyUsers } from "@/hooks/use-company-users";
import { useVisitors } from "@/hooks/use-company-views";
import { useReceivedInquiries } from "@/hooks/use-inquiries";
import { pctChange } from "@/lib/dashboard/delta";
import { TIER_LABELS } from "@/lib/company/labels";
import { COMPANY_AREA_BASE } from "@/lib/company/portals";
import { profileCompleteness } from "@/lib/company/profile-completeness";
import { cn } from "@/lib/utils";
import { companyActivityLabel, tierAtLeast } from "@rothern/shared";
import {
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ChartBarIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  CubeIcon,
  EnvelopeIcon,
  EyeIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  ShieldExclamationIcon,
  SparklesIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import Link from "next/link";
import { useState } from "react";

/**
 * ŞİRKETİM › GENEL BAKIŞ (2026-09-05; görsel revizyon aynı gün — "Europages
 * gibi, daha iyi"). Bir pano DEĞİL: kimlik kartı + her biri tek çıkışlı özet
 * kartlar; liste/tablo yok ("aynı içerik iki yerde" kuralı).
 *
 * Düzen: kapak bandı + logo/ad/rozetler/eylemler → sol sütun (Profil gücü
 * halkası + eksikler, Vitrin, Ziyaretçiler mini grafik + son ziyaretçi
 * logoları) → sağ sütun (bilgi talepleri, ekip, doğrulama, paket, raporlar).
 * Veri mevcut kancalardan; yüklenirken iskelet, ASLA yanlış durum (doğrulama
 * "bekliyor" gibi) basılmaz.
 */
export function CompanyOverview() {
  const { company, user } = useCompanyAuth();
  const profile = useCompanyProfile();
  const roles = user?.roles ?? [];
  const isManager = roles.includes("SAHIP") || roles.includes("YONETICI");
  const canSell = isManager || roles.includes("SATISCI");
  const tier = profile.data?.tier ?? company?.tier ?? "STANDART";
  const paid = tierAtLeast(tier, "BRONZ");
  const inquiries = useReceivedInquiries(canSell && paid);
  const users = useCompanyUsers();
  const visitors = useVisitors(30);
  const counts = useCatalogCounts(canSell);
  const p = profile.data;
  const completeness = p ? profileCompleteness(p) : null;
  const verified = p?.companyVerificationStatus === "VERIFIED";
  const inquiryList = Array.isArray(inquiries.data) ? [] : (inquiries.data?.items ?? []);
  const pendingInquiries = inquiryList.filter((i) => i.replies.length === 0).length;
  const initials = (company?.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");
  const v = visitors.data;

  return (
    <div className="space-y-8">
      {/* ── Kimlik kartı ── */}
      <section aria-label="Firma kimliği" className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-zinc-950/5">
        <div
          className="h-28 w-full bg-cover bg-center sm:h-32"
          style={{
            backgroundImage: p?.coverImageUrl
              ? `url(${p.coverImageUrl})`
              : "linear-gradient(120deg, #dbeafe 0%, #eef2ff 45%, #d1fae5 100%)",
          }}
          aria-hidden
        />
        <div className="px-5 pb-5 sm:px-7 sm:pb-6">
          {/* Logo kapak bandına taşar; ad bloğu dar ekranda bandın ALTINA sarar
              (kapak üstüne yazı binmesin). */}
          <div className="flex flex-wrap items-end gap-4">
            <CompanyLogo
              src={p?.logoUrl}
              alt=""
              className="-mt-10 size-20 rounded-2xl bg-white object-cover shadow-md ring-4 ring-white sm:-mt-12 sm:size-24"
              fallback={
                <span className="-mt-10 flex size-20 items-center justify-center rounded-2xl bg-zinc-900 text-2xl font-semibold text-white shadow-md ring-4 ring-white sm:-mt-12 sm:size-24">
                  {initials}
                </span>
              }
            />
            <div className="min-w-0 flex-1 pb-1 pt-2 sm:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                  {company?.name ?? "—"}
                </h1>
                {p ? (
                  verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      <CheckBadgeIcon aria-hidden className="size-4" />
                      Doğrulanmış
                    </span>
                  ) : null
                ) : null}
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                    tier === "GOLD"
                      ? "bg-amber-100 text-amber-700"
                      : tier === "STANDART"
                        ? "bg-zinc-100 text-zinc-600"
                        : "bg-blue-100 text-blue-700",
                  )}
                >
                  {TIER_LABELS[tier] ?? tier} üye
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                {p?.rothernId ? <RothernIdChip id={p.rothernId} /> : null}
                {p?.city ? <span>{p.city}</span> : null}
                {(p?.activities ?? []).slice(0, 3).map((a) => (
                  <span key={a} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {companyActivityLabel(a)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              {paid ? (
                <Link
                  href={`${COMPANY_AREA_BASE}/profil`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  <PencilSquareIcon aria-hidden className="size-4" />
                  Profili düzenle
                </Link>
              ) : null}
              {p?.slug && p.publicEnabled ? (
                <Link
                  href={`/firma/${p.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                >
                  Herkese açık profil
                  <ArrowTopRightOnSquareIcon aria-hidden className="size-4" />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Sol sütun ── */}
        <div className="space-y-6 lg:col-span-2">
          {/* Profil gücü */}
          <section aria-label="Profil gücü" className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5 sm:p-6">
            {!p || !completeness ? (
              <div className="h-28 animate-pulse rounded-xl bg-zinc-100" aria-hidden />
            ) : (
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <ProgressRing value={completeness.pct} size={88} label={`%${completeness.pct}`} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-600">Profil gücü</p>
                  <p className="mt-0.5 text-lg font-semibold tracking-tight text-zinc-950">
                    {completeness.pct >= 100
                      ? "Profiliniz eksiksiz"
                      : completeness.pct >= 60
                        ? "İyi — birkaç alan daha"
                        : "Alıcılar sizi tam göremiyor"}
                  </p>
                  {completeness.missing.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {completeness.missing.slice(0, 4).map((m) => (
                        <li key={m} className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          {m}
                        </li>
                      ))}
                      {completeness.missing.length > 4 ? (
                        <li className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600">
                          +{completeness.missing.length - 4}
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <p className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-700">
                      <CheckCircleIcon aria-hidden className="size-4" />
                      Eksik alan yok — alıcılar firma sayfanızı tam görüyor.
                    </p>
                  )}
                </div>
                <Link
                  href={paid ? `${COMPANY_AREA_BASE}/profil` : "/company/ayarlar/firma"}
                  className="inline-flex items-center gap-1 self-start rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 sm:self-auto"
                >
                  {completeness.pct >= 100 ? "Profili gör" : "Tamamla"}
                  <ArrowRightIcon aria-hidden className="size-4" />
                </Link>
              </div>
            )}
          </section>

          {/* Vitrin + Ziyaretçiler */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {canSell && counts.isLoading ? (
              <div className="h-44 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />
            ) : canSell ? (
              <StatTile
                icon={CubeIcon}
                tone="emerald"
                label="Vitrin"
                value={`${counts.data?.published ?? 0} ürün`}
                hint={
                  counts.data
                    ? counts.data.draft > 0
                      ? `${counts.data.published} yayında · ${counts.data.draft} taslak`
                      : counts.data.published > 0
                        ? "Tümü yayında"
                        : "Henüz ürün yok — ilkini ekleyin"
                    : undefined
                }
                href="/company/satis/urunlerim"
                cta={counts.data && counts.data.published === 0 ? "Ürün ekle" : "Ürünlerim"}
              >
                {counts.data && counts.data.published + counts.data.draft > 0 ? (
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
                    <span
                      className="h-full bg-emerald-500"
                      style={{ width: `${Math.round((counts.data.published / (counts.data.published + counts.data.draft)) * 100)}%` }}
                    />
                  </div>
                ) : null}
              </StatTile>
            ) : null}
            {visitors.isLoading ? (
              <div className="h-44 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />
            ) : (
            <StatTile
              icon={EyeIcon}
              tone="blue"
              label="Ziyaretçiler · 30 gün"
              value={(v?.total ?? 0).toLocaleString("tr-TR")}
              deltaPct={v ? pctChange(v.total, v.previous.total) : undefined}
              deltaLabel="Önceki 30 güne göre"
              hint={
                v
                  ? v.identified > 0
                    ? `${v.identified} firma kimliğiyle · ${v.anonymous} anonim`
                    : "Profil ve ürün görüntülenmesi"
                  : undefined
              }
              href={`${COMPANY_AREA_BASE}/ziyaretciler`}
              cta="Ziyaret Edenler"
            >
              {v && v.total > 0 ? <MiniBars data={v.daily} height={40} accent="blue" /> : null}
              {v && !v.locked && v.items.length > 0 ? (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {v.items.slice(0, 4).map((it) => (
                      <CompanyLogo
                        key={it.company.id}
                        src={it.company.logoUrl}
                        alt={it.company.name}
                        className="size-7 rounded-full bg-white object-cover ring-2 ring-white"
                        fallback={
                          <span className="flex size-7 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-700 ring-2 ring-white">
                            {it.company.name.slice(0, 1)}
                          </span>
                        }
                      />
                    ))}
                  </div>
                  <span className="truncate text-xs text-zinc-500">
                    Son: {v.items.slice(0, 2).map((it) => it.company.name).join(", ")}
                  </span>
                </div>
              ) : null}
            </StatTile>
            )}
          </div>
        </div>

        {/* ── Sağ sütun ── */}
        <div className="space-y-4">
          {canSell && paid ? (
            inquiries.isLoading ? (
              <SideSkeleton />
            ) : (
              <SideRow
                icon={EnvelopeIcon}
                tone={pendingInquiries > 0 ? "amber" : "zinc"}
                title="Bilgi talepleri"
                value={pendingInquiries > 0 ? `${pendingInquiries} yanıt bekliyor` : "Yanıt bekleyen yok"}
                href="/company/satis/bilgi-talepleri"
              />
            )
          ) : null}
          {isManager ? (
            users.isLoading ? (
              <SideSkeleton />
            ) : (
              <SideRow icon={UsersIcon} tone="violet" title="Ekip" value={`${users.data?.length ?? 0} kullanıcı`} href="/company/ayarlar/kullanicilar" />
            )
          ) : null}
          {p ? (
            <SideRow
              icon={verified ? ShieldCheckIcon : ShieldExclamationIcon}
              tone={verified ? "emerald" : "amber"}
              title="Doğrulama"
              value={verified ? "Kimlik doğrulandı" : "Belgeler bekleniyor"}
              href="/company/ayarlar/dogrulama"
            />
          ) : (
            <SideSkeleton />
          )}
          <SideRow
            icon={SparklesIcon}
            tone={tier === "GOLD" ? "amber" : "blue"}
            title="Paket"
            value={tier === "GOLD" ? "Gold — tüm özellikler açık" : `${TIER_LABELS[tier] ?? tier} — yükseltin`}
            href="/company/ayarlar"
          />
          {tierAtLeast(tier, "SILVER") ? (
            <SideRow icon={ChartBarIcon} tone="zinc" title="Raporlar" value="İş Analizi ve satın alma raporları" href={`${COMPANY_AREA_BASE}/raporlar`} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SideSkeleton() {
  return <div className="h-[4.5rem] animate-pulse rounded-2xl bg-zinc-100" aria-hidden />;
}

function RothernIdChip({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Rothern ID'yi kopyala"
      className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-700 hover:bg-zinc-200"
    >
      {id}
      <ClipboardDocumentIcon aria-hidden className="size-3.5 text-zinc-400" />
      <span className="sr-only">{copied ? "Kopyalandı" : "Kopyala"}</span>
    </button>
  );
}

function SideRow({
  icon: Icon,
  tone,
  title,
  value,
  href,
}: {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tone: "zinc" | "blue" | "emerald" | "amber" | "violet";
  title: string;
  value: string;
  href: string;
}) {
  const iconCls = {
    zinc: "bg-zinc-100 text-zinc-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
  }[tone];
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10"
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", iconCls)}>
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-zinc-500">{title}</span>
        <span className="block truncate text-sm font-semibold text-zinc-950">{value}</span>
      </span>
      <ArrowRightIcon aria-hidden className="size-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
    </Link>
  );
}

export { SectionHead };
