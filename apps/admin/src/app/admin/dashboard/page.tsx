"use client";

import { Badge } from "@/components/catalyst/badge";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader } from "@/components/list";
import {
  useAdminCompanies,
  useAdminCompanyStats,
  useAdminComplaints,
  type AdminCompanyStats,
} from "@/hooks/use-admin-companies";
import { countryFlag, countryName } from "@/lib/country";
import { safeFormat } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  Building2,
  CalendarClock,
  Clock,
  FilePlus2,
  Flag,
  type LucideIcon,
  Package,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Link from "next/link";

function DashboardContent() {
  const companiesQ = useAdminCompanies({ page: 1, pageSize: 6 });
  const openComplaintsQ = useAdminComplaints("OPEN");
  const statsQ = useAdminCompanyStats();
  const s = statsQ.data;

  const companies = companiesQ.data?.items ?? [];
  const openComplaints = openComplaintsQ.data?.items ?? [];

  // KYC kuyruk yaşı — en eski bekleyen başvuru kaç gündür bekliyor?
  const queueAgeDays = s?.oldestPendingSince
    ? Math.floor(
        (Date.now() - new Date(s.oldestPendingSince).getTime()) / 86_400_000,
      )
    : null;

  return (
    <div className="max-w-[1400px] space-y-6">
      <PageHeader
        title="Genel Bakış"
        description="Platform geneli — doğrulama, üyelik ve operasyon özeti."
      />

      {/* Ana KPI'lar */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Building2}
          label="Toplam Firma"
          value={s?.totalCompanies ?? 0}
          href="/admin/firmalar"
          sub={
            s
              ? `${s.tierBreakdown.GOLD} gold · ${s.tierBreakdown.SILVER} silver · ${s.tierBreakdown.STANDART} standart`
              : undefined
          }
        />
        <KpiCard
          icon={ShieldCheck}
          label="Doğrulanmış"
          value={s?.verified ?? 0}
          href="/admin/firmalar?status=VERIFIED"
        />
        <KpiCard
          icon={Clock}
          label="İnceleme Bekleyen"
          value={s?.pendingReview ?? 0}
          href="/admin/firmalar?status=PENDING"
          // SLA: kuyrukta 2+ gün bekleyen başvuru varsa kırmızı uyarı.
          alert={(s?.pendingReview ?? 0) > 0 && (queueAgeDays ?? 0) >= 2}
          sub={
            queueAgeDays != null
              ? `en eski başvuru ${queueAgeDays} gündür kuyrukta`
              : undefined
          }
        />
        <KpiCard
          icon={Flag}
          label="Açık Şikayet"
          value={s?.openComplaints ?? 0}
          href="/admin/sikayetler"
          alert={(s?.openComplaints ?? 0) > 0}
        />
      </div>

      {/* Kayıt hunisi: kayıt → onboarding → KYC → doğrulandı */}
      {s?.funnel ? <FunnelCard funnel={s.funnel} /> : null}

      {/* İlan/ihale panosu — sistemde açılan ihalelerin durumu ve görünürlüğü */}
      {s?.listings ? <ListingsCard l={s.listings} /> : null}

      {/* Son 30 gün aktivite */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MiniStat
          icon={UserPlus}
          label="Yeni firma (30 gün)"
          value={s?.last30Days.newCompanies ?? 0}
        />
        <MiniStat
          icon={FilePlus2}
          label="Yeni ilan (30 gün)"
          value={s?.last30Days.newListings ?? 0}
        />
        <MiniStat
          icon={Package}
          label="Yeni sipariş (30 gün)"
          value={s?.last30Days.newOrders ?? 0}
        />
      </div>

      {/* items-start: kısa panel (ör. "açık şikayet yok") uzun panelin boyuna
          gerilip kocaman boşluk bırakmasın — her kart kendi boyunda dursun. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {/* Süresi yaklaşan üyelikler — yenileme satışı fırsatı */}
        <Panel
          title="Süresi Yaklaşan Üyelikler"
          titleIcon={CalendarClock}
          moreHref="/admin/firmalar"
        >
          {(s?.expiringMemberships ?? []).length === 0 ? (
            <p className="text-admin-text-muted p-6 text-center text-sm">
              {statsQ.isLoading
                ? "Yükleniyor…"
                : "30 gün içinde bitecek üyelik yok"}
            </p>
          ) : (
            (s?.expiringMemberships ?? []).map((c) => {
              const days = Math.ceil(
                (new Date(c.membershipEndAt).getTime() - Date.now()) /
                  86_400_000,
              );
              return (
                <Link
                  key={c.id}
                  href={`/admin/firmalar/${c.id}`}
                  className="hover:bg-admin-border/20 flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-admin-text truncate font-semibold">
                      {c.name}
                    </p>
                    <p className="text-admin-text-muted font-mono text-xs">
                      {c.rothernId ?? "—"}
                    </p>
                  </div>
                  <Badge color={days <= 7 ? "red" : "amber"}>
                    {days} gün
                  </Badge>
                </Link>
              );
            })
          )}
        </Panel>

        {/* Ülke dağılımı */}
        <Panel title="Ülke Dağılımı" moreHref="/admin/firmalar">
          {(s?.countryBreakdown ?? []).length === 0 ? (
            <p className="text-admin-text-muted p-6 text-center text-sm">
              {statsQ.isLoading ? "Yükleniyor…" : "Veri yok"}
            </p>
          ) : (
            (s?.countryBreakdown ?? []).map((c) => (
              <Link
                key={c.country}
                href={`/admin/firmalar?country=${c.country}`}
                className="hover:bg-admin-border/20 flex items-center justify-between px-5 py-2.5"
              >
                <span className="text-admin-text text-sm">
                  {countryFlag(c.country)} {countryName(c.country)}
                </span>
                <span className="text-admin-text text-sm font-semibold tabular-nums">
                  {c.count}
                </span>
              </Link>
            ))
          )}
        </Panel>

        {/* Son firmalar */}
        <Panel title="Son Firmalar" moreHref="/admin/firmalar">
          {companies.length === 0 ? (
            <p className="text-admin-text-muted p-6 text-center text-sm">
              {companiesQ.isLoading ? "Yükleniyor…" : "Firma yok"}
            </p>
          ) : (
            companies.map((c) => (
              <Link
                key={c.id}
                href={`/admin/firmalar/${c.id}`}
                className="hover:bg-admin-border/20 flex items-center justify-between px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-admin-text truncate font-semibold">
                    {countryFlag(c.country)} {c.name}
                  </p>
                  <p className="text-admin-text-muted font-mono text-xs">
                    {c.rothernId ?? "—"}
                  </p>
                </div>
                <span className="text-admin-text-muted ml-3 flex-shrink-0 text-xs">
                  {safeFormat(c.createdAt, "d MMM")}
                </span>
              </Link>
            ))
          )}
        </Panel>

        {/* Açık şikayetler */}
        <Panel title="Açık Şikayetler" moreHref="/admin/sikayetler">
          {openComplaints.length === 0 ? (
            <p className="text-admin-text-muted p-6 text-center text-sm">
              {openComplaintsQ.isLoading ? "Yükleniyor…" : "Açık şikayet yok"}
            </p>
          ) : (
            openComplaints.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                href={`/admin/firmalar/${c.against.id}?tab=sikayetler`}
                className="hover:bg-admin-border/20 block px-5 py-3"
              >
                <p className="text-admin-text truncate font-semibold">
                  {c.against.name}
                </p>
                <p className="text-admin-text-muted truncate text-xs">
                  {c.reason} · şikayet eden: {c.complainant.name}
                </p>
              </Link>
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

/**
 * İlan/ihale panosu — "sistemde kaç ihale açıldı, kaçı herkese açık, kaçı şu an
 * canlı" sorularının tek bakışta cevabı. Görünürlük ve tip kırılımları YALNIZ
 * yayınlanmış ilanlar üzerinden (taslak ilan kimseye görünmediği için "herkese
 * açık" sayılmaz) — payda bu yüzden `published`.
 */
function ListingsCard({
  l,
}: {
  l: NonNullable<AdminCompanyStats["listings"]>;
}) {
  const flow = [
    { label: "Toplam ilan", value: l.total, hint: "taslaklar dahil" },
    { label: "Yayınlanmış", value: l.published, hint: `${l.draft} taslak` },
    { label: "Şu an açık", value: l.open, hint: "teklif topluyor" },
    { label: "Değerlendirmede", value: l.inAward, hint: "alıcı karar veriyor" },
    { label: "Sonuçlanan", value: l.awarded, hint: "sipariş oluştu" },
  ];
  return (
    <div className="admin-card px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-admin-text font-bold">İlan & Satın Alma Talebi Durumu</h3>
        <span className="text-admin-text-muted text-xs">
          {l.totalBids.toLocaleString("tr-TR")} gönderilmiş teklif
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {flow.map((f) => (
          <div key={f.label}>
            <p className="text-admin-text-muted text-xs font-medium">
              {f.label}
            </p>
            <p className="text-admin-text mt-0.5 text-xl font-bold tabular-nums">
              {f.value.toLocaleString("tr-TR")}
            </p>
            <p className="text-admin-text-muted mt-0.5 text-[11px]">{f.hint}</p>
          </div>
        ))}
      </div>

      <div className="border-admin-border mt-4 grid grid-cols-1 gap-x-10 gap-y-4 border-t pt-4 sm:grid-cols-2">
        <Breakdown
          title="Görünürlük"
          note="yayınlanmış ilanlar"
          total={l.published}
          rows={[
            { label: "Herkese açık", value: l.byVisibility.PUBLIC },
            { label: "Bağlantılara açık", value: l.byVisibility.CONNECTIONS },
            { label: "Yalnız davetli", value: l.byVisibility.PRIVATE },
          ]}
        />
        <Breakdown
          title="Tip"
          note="yayınlanmış ilanlar"
          total={l.published}
          rows={[
            { label: "Satın alma talebi", value: l.byType.ALIM },
          ]}
        />
      </div>

      {l.closedNoAward > 0 ? (
        <p className="text-admin-text-muted mt-3 text-xs">
          {l.closedNoAward.toLocaleString("tr-TR")} ilan kazanan çıkmadan
          kapandı veya iptal edildi.
        </p>
      ) : null}
    </div>
  );
}

/** Oranlı kırılım satırları — payda 0 olduğunda bar çizilmez. */
function Breakdown({
  title,
  note,
  total,
  rows,
}: {
  title: string;
  note: string;
  total: number;
  rows: { label: string; value: number }[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-admin-text text-sm font-semibold">{title}</p>
        <p className="text-admin-text-muted text-[11px]">{note}</p>
      </div>
      <div className="mt-2 space-y-2">
        {rows.map((r) => {
          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
          return (
            <div key={r.label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-admin-text-muted">{r.label}</span>
                <span className="text-admin-text font-semibold tabular-nums">
                  {r.value.toLocaleString("tr-TR")}
                  <span className="text-admin-text-muted ml-1.5 text-xs font-normal">
                    %{pct}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-900"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Kayıt hunisi — her adımda kaç firma kaldı + önceki adıma göre oran. */
function FunnelCard({
  funnel,
}: {
  funnel: {
    signedUp: number;
    onboarded: number;
    kycSubmitted: number;
    verified: number;
  };
}) {
  const steps = [
    { label: "Kayıt", value: funnel.signedUp },
    { label: "Kayıt tamamlandı", value: funnel.onboarded },
    { label: "Belgeler yüklendi", value: funnel.kycSubmitted },
    { label: "Doğrulandı", value: funnel.verified },
  ];
  const max = Math.max(1, funnel.signedUp);
  return (
    <div className="admin-card px-5 py-4">
      <h3 className="text-admin-text font-bold">Kayıt Hunisi</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        {steps.map((st, i) => {
          const prev = i === 0 ? st.value : steps[i - 1]!.value;
          const rate = prev > 0 ? Math.round((st.value / prev) * 100) : 0;
          return (
            <div key={st.label}>
              <div className="flex items-baseline justify-between">
                <span className="text-admin-text-muted text-xs font-medium">
                  {st.label}
                </span>
                {i > 0 ? (
                  <span className="text-admin-text-muted text-[11px]">
                    %{rate}
                  </span>
                ) : null}
              </div>
              <p className="text-admin-text mt-0.5 text-xl font-bold tabular-nums">
                {st.value.toLocaleString("tr-TR")}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-zinc-900"
                  style={{ width: `${Math.round((st.value / max) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Panel({
  title,
  titleIcon: Icon,
  moreHref,
  children,
}: {
  title: string;
  titleIcon?: LucideIcon;
  moreHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="admin-card">
      <div className="border-admin-border flex items-center justify-between border-b px-5 py-4">
        <h3 className="text-admin-text flex items-center gap-2 font-bold">
          {Icon ? <Icon className="text-admin-text-muted h-4 w-4" /> : null}
          {title}
        </h3>
        <Link
          href={moreHref}
          className="text-xs font-semibold text-zinc-600 hover:underline"
        >
          Tümünü Gör →
        </Link>
      </div>
      <div className="divide-admin-border divide-y">{children}</div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="admin-card flex items-center gap-3 px-5 py-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100">
        <Icon className="h-5 w-5 text-zinc-600" />
      </div>
      <div>
        <p className="text-admin-text-muted text-xs font-semibold tracking-wide uppercase">
          {label}
        </p>
        <p className="text-admin-text text-xl font-bold tabular-nums">
          {value.toLocaleString("tr-TR")}
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  href,
  alert,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
  alert?: boolean;
  sub?: string;
}) {
  return (
    <Link href={href} className="block">
      <div className="admin-card h-full p-5 transition-colors hover:border-zinc-300">
        <div
          className={cn(
            "mb-3 flex h-10 w-10 items-center justify-center rounded-xl",
            alert ? "bg-danger-50" : "bg-zinc-100",
          )}
        >
          <Icon
            className={cn("h-5 w-5", alert ? "text-danger-600" : "text-zinc-600")}
          />
        </div>
        <p className="text-admin-text-muted text-xs font-semibold tracking-wide uppercase">
          {label}
        </p>
        <p className="text-admin-text mt-1 text-2xl font-bold">
          {value.toLocaleString("tr-TR")}
        </p>
        {sub ? <p className="text-admin-text-muted mt-1 text-xs">{sub}</p> : null}
      </div>
    </Link>
  );
}

export default function AdminDashboardPage() {
  return (
    <AdminShell>
      <DashboardContent />
    </AdminShell>
  );
}
