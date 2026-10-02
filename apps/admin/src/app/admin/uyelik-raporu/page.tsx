"use client";

import { Input } from "@/components/ui/input";
import { TableStateRow } from "@/components/list/table-state";
import { Badge } from "@/components/catalyst/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminRoleGate } from "@/components/layout/admin-role-gate";
import { PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import {
  useMembershipReport,
  type MembershipReportRow,
} from "@/hooks/use-admin-companies";
import { downloadCsv } from "@/lib/csv";
import { safeFormat, toDateInput } from "@/lib/date";
import { membershipEventActor, membershipEventReason } from "@/lib/membership-event";
import { Download } from "lucide-react";
import { useState } from "react";

const ACTION_META: Record<
  MembershipReportRow["action"],
  { label: string; color: "green" | "blue" | "red" | "zinc" }
> = {
  GRANT: { label: "Tanımlandı", color: "green" },
  EXTEND: { label: "Uzatıldı", color: "blue" },
  REVOKE: { label: "Kaldırıldı", color: "red" },
  EXPIRE: { label: "Süre doldu", color: "zinc" },
};

function exportReportCsv(rows: MembershipReportRow[]) {
  downloadCsv(
    `uyelik-raporu-${toDateInput()}.csv`, // yerel gün (D-142)
    ["Tarih", "Firma", "Kod", "İşlem", "Ay", "Yeni Bitiş", "Yapan", "Gerekçe"],
    rows.map((r) => [
      safeFormat(r.createdAt, "yyyy-MM-dd HH:mm"),
      r.companyName,
      r.rothernId ?? "",
      ACTION_META[r.action].label,
      r.months ?? "",
      r.endAfter ? safeFormat(r.endAfter, "yyyy-MM-dd") : "",
      membershipEventActor(r),
      membershipEventReason(r.reason) ?? "",
    ]),
  );
}

function RaporView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Ters aralık (başlangıç > bitiş) sessizce kabul edilip boş rapor
  // gösteriyordu — uyarı verilir, istek atılmaz (arayüz testi D-145).
  // "YYYY-MM-DD" metin karşılaştırması tarih sırasıyla aynıdır.
  const inverted = !!from && !!to && from > to;
  const query = useMembershipReport(from || undefined, to || undefined, {
    enabled: !inverted,
  });
  const rows = inverted ? [] : (query.data?.rows ?? []);
  const t = inverted ? undefined : query.data?.totals;

  const truncated = query.data?.truncated ?? false;
  const totalMatching = query.data?.totalMatching ?? rows.length;

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        title="Üyelik Raporu"
        description="Premium tanımlama / uzatma / kaldırma hareketleri — satış ve yenileme takibi."
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={rows.length === 0}
            onClick={() => exportReportCsv(rows)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV İndir
          </Button>
        }
      />

      {/* Hazır aralıklar — en sık sorgular tek tık. */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            {
              label: "Bu Ay",
              range: () => {
                const n = new Date();
                return [
                  toDateInput(new Date(n.getFullYear(), n.getMonth(), 1)),
                  toDateInput(n),
                ];
              },
            },
            {
              label: "Geçen Ay",
              range: () => {
                const n = new Date();
                const first = new Date(n.getFullYear(), n.getMonth() - 1, 1);
                const last = new Date(n.getFullYear(), n.getMonth(), 0);
                return [toDateInput(first), toDateInput(last)];
              },
            },
            {
              label: "Son 30 Gün",
              range: () => [
                toDateInput(Date.now() - 30 * 86_400_000),
                toDateInput(),
              ],
            },
            {
              label: "Bu Yıl",
              range: () => [
                `${new Date().getFullYear()}-01-01`,
                toDateInput(),
              ],
            },
          ] as const
        ).map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              const [f, t] = preset.range();
              setFrom(f);
              setTo(t);
            }}
            className="rounded-full border border-zinc-950/10 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Tarih aralığı */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-admin-text-muted text-xs font-medium">
            Başlangıç
          </span>
          <Input
            type="date"
            value={from}
            max={to || undefined}
            aria-invalid={inverted || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-admin-text-muted text-xs font-medium">
            Bitiş
          </span>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            aria-invalid={inverted || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {from || to ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            Temizle
          </Button>
        ) : null}
      </div>

      {inverted ? (
        <p role="alert" className="text-sm text-red-700">
          Başlangıç tarihi bitiş tarihinden sonra olamaz — aralığı düzeltin.
        </p>
      ) : null}

      {/* Toplamlar */}
      {t ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Tanımlanan" value={t.grants.toLocaleString("tr-TR")} />
          <StatCard label="Uzatılan" value={t.extends.toLocaleString("tr-TR")} />
          <StatCard label="Kaldırılan" value={t.revokes.toLocaleString("tr-TR")} />
          <StatCard label="Süresi dolan" value={t.expires.toLocaleString("tr-TR")} />
          <StatCard
            label="Toplam ay (satış)"
            value={t.monthsGranted.toLocaleString("tr-TR")}
            accent="emerald"
          />
        </div>
      ) : null}

      {/*
        #14 (denetim 2026-08-26 Parça 9): liste tavana takıldıysa SÖYLE.
        Toplam kartları tüm evrenden hesaplandığı için doğru; kesilen yalnız
        aşağıdaki satır listesi (ve dolayısıyla CSV çıktısı).
      */}
      {truncated && !inverted ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Bu aralıkta {totalMatching.toLocaleString("tr-TR")} hareket var; aşağıda
          (ve CSV&apos;de) yalnız en yeni {rows.length.toLocaleString("tr-TR")}{" "}
          tanesi listeleniyor. Yukarıdaki toplamlar hareketlerin TAMAMINI kapsar —
          daha dar bir tarih aralığı seçerek listenin tümünü görebilirsiniz.
        </div>
      ) : null}

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Tarih</TableHeader>
              <TableHeader>Firma</TableHeader>
              <TableHeader>İşlem</TableHeader>
              <TableHeader>Ay</TableHeader>
              <TableHeader>Yeni bitiş</TableHeader>
              <TableHeader>Yapan</TableHeader>
              <TableHeader>Gerekçe</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableStateRow
                colSpan={7}
                loading={!inverted && query.isLoading}
                error={!inverted && query.isError}
                onRetry={() => void query.refetch()}
                empty={
                  inverted
                    ? "Geçerli bir tarih aralığı seçin"
                    : "Bu aralıkta üyelik hareketi yok"
                }
              />
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {safeFormat(r.createdAt, "d MMM yyyy HH:mm")}
                  </TableCell>
                  <TableCell className="text-admin-text text-sm font-medium">
                    {r.companyName}
                    <span className="text-admin-text-muted block font-mono text-[11px]">
                      {r.rothernId ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge color={ACTION_META[r.action].color}>
                      {ACTION_META[r.action].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-admin-text text-sm tabular-nums">
                    {r.months ?? "—"}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {r.endAfter ? safeFormat(r.endAfter, "d MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs">
                    {membershipEventActor(r)}
                  </TableCell>
                  <TableCell className="text-admin-text-muted max-w-[220px] truncate text-xs">
                    {membershipEventReason(r.reason) ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}


export default function AdminUyelikRaporuPage() {
  return (
    <AdminShell>
      <AdminRoleGate action="viewMembershipReport">
        <RaporView />
      </AdminRoleGate>
    </AdminShell>
  );
}
