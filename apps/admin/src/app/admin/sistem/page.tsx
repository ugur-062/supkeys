"use client";

import { Input } from "@/components/ui/input";
import { canAdminDo } from "@/lib/admin-permissions";
import { useAdminAuth } from "@/hooks/use-admin-auth";
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
import { PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
import {
  useAdminSystem,
  useClearSuppression,
  useManualRate,
  useRefreshRates,
  useStorageHealth,
  useSuppressions,
  useTimeSavingsConfig,
  useUpdateTimeSavingsConfig,
  type TimeSavingsConfigRow,
} from "@/hooks/use-admin-system";
import { safeFormat } from "@/lib/date";
import {
  Database,
  HardDrive,
  MailWarning,
  PencilLine,
  RefreshCw,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const MANUAL_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
  "RUB",
];

/** Manuel kur formu — TCMB arızası acil durumu (yalnız SUPER_ADMIN, BE guard). */
function ManualRateForm() {
  const manual = useManualRate();
  const [currency, setCurrency] = useState("USD");
  const [rate, setRate] = useState("");
  return (
    <div className="border-admin-border mt-4 flex flex-wrap items-end gap-2 border-t pt-3">
      <PencilLine className="text-admin-text-muted mb-1.5 h-4 w-4" />
      <label className="flex flex-col gap-1">
        <span className="text-admin-text-muted text-xs font-medium">Birim</span>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="border-admin-border bg-admin-surface text-admin-text rounded-lg border px-2 py-1.5 text-sm"
        >
          {MANUAL_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-admin-text-muted text-xs font-medium">
          Kur (₺)
        </span>
        <Input
          type="number"
          step="0.0001"
          min="0"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="34.5000"
          className="w-32"
        />
      </label>
      <Button
        size="sm"
        variant="secondary"
        loading={manual.isPending}
        disabled={!Number.isFinite(Number(rate)) || Number(rate) <= 0}
        onClick={() =>
          manual.mutate(
            { currency, rate: Number(rate) },
            {
              onSuccess: () => {
                toast.success(`${currency} manuel kuru kaydedildi`);
                setRate("");
              },
              onError: (e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Hata"),
            },
          )
        }
      >
        Manuel Kur Kaydet
      </Button>
      <p className="text-admin-text-muted w-full text-xs">
        Yalnız TCMB uzun süre erişilemezse kullanın — sonraki TCMB çekimi
        üzerine yazar; işlem denetim kaydına girer.
      </p>
    </div>
  );
}

/** E-posta itibar — suppress edilmiş adresler + aklama. */
function SuppressionsSection() {
  const list = useSuppressions();
  const clear = useClearSuppression();
  const rows = list.data ?? [];
  return (
    <section className="admin-card overflow-hidden">
      <div className="border-admin-border border-b px-5 py-4">
        <h3 className="text-admin-text flex items-center gap-2 text-sm font-semibold">
          <MailWarning className="h-4 w-4" /> E-posta Gönderimi — Engellenen Adresler
        </h3>
        <p className="text-admin-text-muted mt-0.5 text-xs">
          Kalıcı bounce / şikayet almış adreslere gönderim otomatik atlanır.
          Adres yeniden ulaşılabilir olduysa engeli kaldırabilirsiniz.
        </p>
      </div>
      <div className="divide-admin-border divide-y">
        {rows.length === 0 ? (
          <p className="text-admin-text-muted px-5 py-6 text-center text-sm">
            {list.isLoading ? "Yükleniyor..." : "Engellenen adres yok"}
          </p>
        ) : (
          rows.map((r) => (
            <div
              key={r.email}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-admin-text text-sm font-medium">{r.email}</p>
                <p className="text-admin-text-muted text-xs">
                  {r.status === "COMPLAINED" ? "Şikayet" : "Kalıcı bounce"}
                  {r.reason ? ` — ${r.reason}` : ""} ·{" "}
                  {safeFormat(r.at, "d MMM yyyy")}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={clear.isPending}
                onClick={() =>
                  clear.mutate(
                    { email: r.email },
                    {
                      onSuccess: () => toast.success("Engel kaldırıldı"),
                      onError: (e: unknown) =>
                        toast.error(e instanceof Error ? e.message : "Hata"),
                    },
                  )
                }
              >
                Engeli Kaldır
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function SistemView() {
  const sys = useAdminSystem();
  const refresh = useRefreshRates();
  const storage = useStorageHealth();
  const s = sys.data;
  // B2: rol kapıları backend @RequireAdminRole ile birebir (drift nöbetçisi
  // artık bu üç aksiyonu da kapsıyor).
  const { admin } = useAdminAuth();
  const canManualRate = canAdminDo(admin?.role, "manualRate");
  const canListSuppressions = canAdminDo(admin?.role, "listSuppressions");
  const canTimeSavings = canAdminDo(admin?.role, "timeSavingsConfig");

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
              Son açılış
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
              Dosya Depolama
            </p>
            <p className="text-admin-text text-sm font-semibold">
              {storage.data
                ? `${storage.data.buckets.public} + ${storage.data.buckets.private} (${storage.data.envPrefix})`
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
                {s?.exchangeRates.stale ? "Güncel Değil" : "Güncel"}
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
        {/* B2 (denetim 2026-08-26 Parça 10): bu üç bölüm SUPER_ADMIN'e kilitli
            uçlara yazıyor (backend fail-closed) ama UI'da hiç kapı yoktu →
            SUPPORT/SALES basılabilir düğmeler görüp 403 alıyordu ve
            "UI kilidi = API kilidi" garantisi bu ekranda yoktu. */}
        {canManualRate ? <ManualRateForm /> : null}
      </section>

      {canListSuppressions ? <SuppressionsSection /> : null}
      {canTimeSavings ? <TimeSavingsConfigSection /> : null}

      {/* Cron işleri */}
      <section className="admin-card overflow-hidden">
        <div className="border-admin-border border-b px-5 py-4">
          <h3 className="text-admin-text text-sm font-semibold">
            Zamanlanmış İşler
          </h3>
          <p className="text-admin-text-muted mt-0.5 text-xs">
            Son açılıştan bu yana çalışma kayıtları — uygulama yeniden başladığında sıfırlanır.
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
              <TableStateRow
                colSpan={5}
                loading={sys.isLoading}
                empty="Kayıtlı iş yok"
              />
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
                      : "son açılıştan beri çalışmadı"}
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

/** Zaman Tasarrufu parametreleri — paneldeki "kazanılan saat" hesabının
 *  birim süreleri (dk). Kaydet SUPER_ADMIN ister (BE guard); audit'e düşer. */
const TS_FIELDS: { key: keyof TimeSavingsConfigRow; label: string; step?: string }[] = [
  { key: "rfqMailPrepMin", label: "RFQ maili (dk × davet)" },
  { key: "followupMin", label: "Hatırlatma (dk — v1'de hesaba katılmaz)" },
  { key: "bidToExcelMin", label: "Teklif→Excel (dk × teklif)" },
  { key: "bidItemFactor", label: "Kalem katsayısı", step: "0.05" },
  { key: "comparisonTableMin", label: "Karşılaştırma tablosu (dk × ihale)" },
  { key: "revisionRoundMin", label: "Revizyon turu (dk × tur)" },
  { key: "approvalLoopMin", label: "Onay döngüsü (dk × onay)" },
  { key: "poPrepMin", label: "PO hazırlama (dk × sipariş)" },
  { key: "hourlyLaborCost", label: "Saatlik maliyet (₺, boş = TL gizli)" },
];

const TS_DEFAULTS: TimeSavingsConfigRow = {
  rfqMailPrepMin: 6,
  followupMin: 3,
  bidToExcelMin: 4,
  bidItemFactor: 0.15,
  comparisonTableMin: 15,
  revisionRoundMin: 5,
  approvalLoopMin: 20,
  poPrepMin: 10,
  hourlyLaborCost: null,
};

function TimeSavingsConfigSection() {
  const cfg = useTimeSavingsConfig();
  const update = useUpdateTimeSavingsConfig();
  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    const src = cfg.data ?? TS_DEFAULTS;
    setForm(
      Object.fromEntries(
        TS_FIELDS.map((f) => [
          f.key,
          src[f.key] == null ? "" : String(src[f.key]),
        ]),
      ),
    );
  }, [cfg.data]);

  return (
    <section className="border-admin-border bg-admin-surface rounded-xl border p-5">
      <h2 className="text-admin-text text-sm font-semibold">
        Zaman Tasarrufu Parametreleri
      </h2>
      <p className="text-admin-text-muted mt-1 text-xs">
        Firma panellerindeki &ldquo;~X saat kazandın&rdquo; hesabının birim
        süreleri. Boş bırakılan saatlik maliyet TL gösterimini kapatır.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TS_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-admin-text-muted text-xs font-medium">
              {f.label}
            </span>
            <Input
              type="number"
              min="0"
              step={f.step ?? "0.5"}
              value={form[f.key] ?? ""}
              onChange={(e) =>
                setForm((cur) => ({ ...cur, [f.key]: e.target.value }))
              }
            />
          </label>
        ))}
      </div>
      <div className="mt-4">
        <Button
          size="sm"
          loading={update.isPending}
          onClick={() => {
            const payload: Partial<TimeSavingsConfigRow> = {};
            for (const f of TS_FIELDS) {
              const raw = (form[f.key] ?? "").trim();
              if (raw === "") {
                if (f.key === "hourlyLaborCost") payload.hourlyLaborCost = null;
                continue;
              }
              const n = Number(raw);
              if (!Number.isFinite(n) || n < 0) {
                toast.error(`Geçersiz değer: ${f.label}`);
                return;
              }
              (payload as Record<string, number | null>)[f.key] = n;
            }
            update.mutate(payload, {
              onSuccess: () => toast.success("Parametreler kaydedildi"),
              onError: (e: unknown) =>
                toast.error(e instanceof Error ? e.message : "Kaydedilemedi"),
            });
          }}
        >
          Kaydet
        </Button>
      </div>
    </section>
  );
}
