"use client";

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
import { PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
import {
  useMembershipReport,
  type MembershipReportRow,
} from "@/hooks/use-admin-companies";
import { safeFormat } from "@/lib/date";
import { Download } from "lucide-react";
import { useState } from "react";

const ACTION_META: Record<
  MembershipReportRow["action"],
  { label: string; color: "green" | "blue" | "red" | "zinc" }
> = {
  GRANT: { label: "Verildi", color: "green" },
  EXTEND: { label: "Uzatıldı", color: "blue" },
  REVOKE: { label: "Kaldırıldı", color: "red" },
  EXPIRE: { label: "Süre doldu", color: "zinc" },
};

/** Filtreli sonucu istemci tarafında CSV'ye dök (Excel uyumlu, BOM'lu). */
function downloadCsv(rows: MembershipReportRow[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const header = ["Tarih", "Firma", "Kod", "İşlem", "Ay", "Yeni Bitiş", "Yapan", "Gerekçe"];
  const lines = rows.map((r) =>
    [
      safeFormat(r.createdAt, "yyyy-MM-dd HH:mm"),
      r.companyName,
      r.rothernId ?? "",
      ACTION_META[r.action].label,
      r.months ?? "",
      r.endAfter ? safeFormat(r.endAfter, "yyyy-MM-dd") : "",
      r.adminEmail ?? "sistem",
      r.reason ?? "",
    ]
      .map(esc)
      .join(";"),
  );
  // ﻿ BOM — Excel'in TR karakterleri doğru açması için.
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `uyelik-raporu-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function RaporView() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useMembershipReport(from || undefined, to || undefined);
  const rows = query.data?.rows ?? [];
  const t = query.data?.totals;

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        title="Üyelik Raporu"
        description="Premium verme / uzatma / kaldırma hareketleri — satış ve yenileme takibi."
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(rows)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" /> CSV İndir
          </Button>
        }
      />

      {/* Tarih aralığı */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-admin-text-muted text-xs font-medium">
            Başlangıç
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border-admin-border bg-admin-surface text-admin-text rounded-lg border px-3 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-admin-text-muted text-xs font-medium">
            Bitiş
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border-admin-border bg-admin-surface text-admin-text rounded-lg border px-3 py-1.5 text-sm"
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

      {/* Toplamlar */}
      {t ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <TotalCard label="Verilen" value={t.grants} />
          <TotalCard label="Uzatılan" value={t.extends} />
          <TotalCard label="Kaldırılan" value={t.revokes} />
          <TotalCard label="Süresi dolan" value={t.expires} />
          <TotalCard label="Toplam ay (satış)" value={t.monthsGranted} strong />
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
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-admin-text-muted py-8 text-center"
                >
                  {query.isLoading
                    ? "Yükleniyor..."
                    : query.isError
                      ? "Veri alınamadı"
                      : "Bu aralıkta üyelik hareketi yok"}
                </TableCell>
              </TableRow>
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
                    {r.adminEmail ?? "sistem"}
                  </TableCell>
                  <TableCell className="text-admin-text-muted max-w-[220px] truncate text-xs">
                    {r.reason ?? "—"}
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

function TotalCard({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="admin-card px-4 py-3">
      <p className="text-admin-text-muted text-xs font-medium">{label}</p>
      <p
        className={`text-admin-text mt-1 text-2xl font-bold tabular-nums ${strong ? "text-emerald-700" : ""}`}
      >
        {value.toLocaleString("tr-TR")}
      </p>
    </div>
  );
}

export default function AdminUyelikRaporuPage() {
  return (
    <AdminShell>
      <RaporView />
    </AdminShell>
  );
}
