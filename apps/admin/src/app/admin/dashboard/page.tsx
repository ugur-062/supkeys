"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader } from "@/components/list";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import {
  useAdminCompanies,
  useAdminComplaints,
} from "@/hooks/use-admin-companies";
import { cn } from "@/lib/utils";
import { safeFormat } from "@/lib/date";
import {
  Building2,
  Clock,
  Flag,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

function DashboardContent() {
  const companiesQ = useAdminCompanies({});
  const openComplaintsQ = useAdminComplaints("OPEN");

  const companies = companiesQ.data ?? [];
  const total = companies.length;
  const verified = companies.filter((c) => c.verification === "VERIFIED").length;
  const pendingKyc = companies.filter(
    (c) => c.verification === "PENDING" || c.verification === "UNVERIFIED",
  ).length;
  const openComplaints = openComplaintsQ.data ?? [];

  return (
    <div className="max-w-[1400px] space-y-6">
      <PageHeader
        title="Sistem Geneli"
        description="Birleşik firma ekosistemi — doğrulama ve moderasyon."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Building2}
          label="Toplam Firma"
          value={total}
          href="/admin/firmalar"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Doğrulanmış"
          value={verified}
          href="/admin/firmalar"
        />
        <KpiCard
          icon={Clock}
          label="KYC Bekleyen"
          value={pendingKyc}
          href="/admin/firmalar"
        />
        <KpiCard
          icon={Flag}
          label="Açık Şikayet"
          value={openComplaints.length}
          href="/admin/sikayetler"
          alert={openComplaints.length > 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="admin-card">
          <div className="border-surface-border flex items-center justify-between border-b px-5 py-4">
            <h3 className="text-admin-text font-bold">Son Firmalar</h3>
            <Link
              href="/admin/firmalar"
              className="text-xs font-semibold text-zinc-600 hover:underline"
            >
              Tümünü Gör →
            </Link>
          </div>
          <div className="divide-surface-border divide-y">
            {companies.length === 0 ? (
              <p className="text-admin-text-muted p-6 text-center text-sm">
                {companiesQ.isLoading ? "Yükleniyor…" : "Firma yok"}
              </p>
            ) : (
              companies.slice(0, 6).map((c) => (
                <div key={c.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-admin-text truncate font-semibold">
                      {c.name}
                    </p>
                    <p className="text-admin-text-muted font-mono text-xs">
                      {c.supkeysId ?? "—"}
                    </p>
                  </div>
                  <span className="text-admin-text-muted ml-3 flex-shrink-0 text-xs">
                    {safeFormat(c.createdAt, "d MMM")}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="admin-card">
          <div className="border-surface-border flex items-center justify-between border-b px-5 py-4">
            <h3 className="text-admin-text font-bold">Açık Şikayetler</h3>
            <Link
              href="/admin/sikayetler"
              className="text-xs font-semibold text-zinc-600 hover:underline"
            >
              Tümünü Gör →
            </Link>
          </div>
          <div className="divide-surface-border divide-y">
            {openComplaints.length === 0 ? (
              <p className="text-admin-text-muted p-6 text-center text-sm">
                {openComplaintsQ.isLoading
                  ? "Yükleniyor…"
                  : "Açık şikayet yok"}
              </p>
            ) : (
              openComplaints.slice(0, 6).map((c) => (
                <div key={c.id} className="px-5 py-3">
                  <p className="text-admin-text truncate font-semibold">
                    {c.against.name}
                  </p>
                  <p className="text-admin-text-muted truncate text-xs">
                    {c.reason} · şikayet eden: {c.complainant.name}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
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
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <div className="admin-card hover:border-zinc-300 h-full p-5 transition-colors">
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
        <p className="text-admin-text-muted text-xs font-semibold uppercase tracking-wide">
          {label}
        </p>
        <p className="text-admin-text mt-1 text-2xl font-bold">
          {value.toLocaleString("tr-TR")}
        </p>
      </div>
    </Link>
  );
}

export default function AdminDashboardPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <DashboardContent />
      </AdminShell>
    </RequireAdminAuth>
  );
}
