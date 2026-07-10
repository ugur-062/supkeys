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
  useAdminSystem,
  useRefreshRates,
  useStorageHealth,
} from "@/hooks/use-admin-system";
import { safeFormat } from "@/lib/date";
import { Database, HardDrive, RefreshCw, Timer } from "lucide-react";
import { toast } from "sonner";

function SistemView() {
  const sys = useAdminSystem();
  const refresh = useRefreshRates();
  const storage = useStorageHealth();
  const s = sys.data;

  return (
    <div className="max-w-[1100px] space-y-6">
      <PageHeader
        title="Sistem Sağlığı"
        description="Veritabanı, kur servisi, zamanlanmış işler ve depolama."
      />

      {/* Durum kartları */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="admin-card flex items-center gap-3 px-5 py-4">
          <Database className="h-6 w-6 text-zinc-500" />
          <div>
            <p className="text-admin-text-muted text-xs font-semibold uppercase">
              Veritabanı
            </p>
            <Badge color={s?.database === "up" ? "green" : "red"}>
              {s?.database === "up" ? "Çalışıyor" : sys.isLoading ? "…" : "Erişilemiyor"}
            </Badge>
          </div>
        </div>
        <div className="admin-card flex items-center gap-3 px-5 py-4">
          <Timer className="h-6 w-6 text-zinc-500" />
          <div>
            <p className="text-admin-text-muted text-xs font-semibold uppercase">
              Uygulama açılışı
            </p>
            <p className="text-admin-text text-sm font-semibold">
              {s?.bootAt ? safeFormat(s.bootAt, "d MMM yyyy HH:mm") : "…"}
            </p>
          </div>
        </div>
        <div className="admin-card flex items-center gap-3 px-5 py-4">
          <HardDrive className="h-6 w-6 text-zinc-500" />
          <div>
            <p className="text-admin-text-muted text-xs font-semibold uppercase">
              Depolama (R2)
            </p>
            <p className="text-admin-text text-sm font-semibold">
              {storage.data
                ? `${storage.data.bucket} (${storage.data.envPrefix})`
                : storage.isError
                  ? "Erişilemiyor"
                  : "…"}
            </p>
          </div>
        </div>
      </div>

      {/* Kur servisi */}
      <section className="admin-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-admin-text text-sm font-semibold">
              TCMB Kurları
            </h3>
            <div className="mt-1 flex items-center gap-2 text-sm">
              <Badge color={s?.exchangeRates.stale ? "red" : "green"}>
                {s?.exchangeRates.stale ? "BAYAT" : "Güncel"}
              </Badge>
              <span className="text-admin-text-muted text-xs">
                Son kur günü: {s?.exchangeRates.latestRateDate ?? "—"}
              </span>
            </div>
          </div>
          <Button
            size="sm"
            loading={refresh.isPending}
            onClick={() =>
              refresh.mutate(undefined, {
                onSuccess: (r) =>
                  r.success
                    ? toast.success(`Kurlar yenilendi (${r.date})`)
                    : toast.error(`TCMB alınamadı: ${r.reason ?? "bilinmiyor"}`),
                onError: (e: unknown) =>
                  toast.error(e instanceof Error ? e.message : "Hata"),
              })
            }
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Kurları Şimdi Yenile
          </Button>
        </div>
        {s?.exchangeRates.rates ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(s.exchangeRates.rates)
              .filter(([c]) => c !== "TRY")
              .map(([c, r]) => (
                <span
                  key={c}
                  className="border-admin-border text-admin-text rounded-lg border px-2.5 py-1 font-mono text-xs"
                >
                  {c} = {r.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} ₺
                </span>
              ))}
          </div>
        ) : null}
        <p className="text-admin-text-muted mt-3 text-xs">
          Kur bayatken (7+ gün) döviz ilanlarında taban kıyası güvenlik gereği
          reddedilir — TCMB arızasında bu buton kilidi açar.
        </p>
      </section>

      {/* Cron işleri */}
      <section className="admin-card overflow-hidden">
        <div className="border-surface-border border-b px-5 py-4">
          <h3 className="text-admin-text text-sm font-semibold">
            Zamanlanmış İşler
          </h3>
          <p className="text-admin-text-muted mt-0.5 text-xs">
            Bu açılıştan beri çalışma kayıtları — restart sonrası sıfırlanır.
          </p>
        </div>
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>İş</TableHeader>
              <TableHeader>Zamanlama</TableHeader>
              <TableHeader>Son çalışma</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader className="text-right">Çalışma sayısı</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {(s?.crons ?? []).length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-admin-text-muted py-8 text-center"
                >
                  {sys.isLoading ? "Yükleniyor..." : "Kayıtlı iş yok"}
                </TableCell>
              </TableRow>
            ) : (
              (s?.crons ?? []).map((c) => (
                <TableRow key={c.key}>
                  <TableCell className="text-admin-text text-sm font-medium">
                    {c.label}
                    <span className="text-admin-text-muted block font-mono text-[11px]">
                      {c.key}
                    </span>
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs">
                    {c.schedule}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {c.lastRunAt
                      ? safeFormat(c.lastRunAt, "d MMM HH:mm:ss")
                      : "bu açılışta henüz çalışmadı"}
                  </TableCell>
                  <TableCell>
                    {c.lastStatus === null ? (
                      <Badge color="zinc">—</Badge>
                    ) : c.lastStatus === "ok" ? (
                      <Badge color="green">OK</Badge>
                    ) : (
                      <Badge color="red" title={c.lastError ?? undefined}>
                        Hata
                      </Badge>
                    )}
                    {c.lastError ? (
                      <span className="text-admin-text-muted ml-2 text-xs">
                        {c.lastError}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-admin-text text-right text-sm tabular-nums">
                    {c.runCount}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}

export default function AdminSistemPage() {
  return (
    <AdminShell>
      <SistemView />
    </AdminShell>
  );
}
