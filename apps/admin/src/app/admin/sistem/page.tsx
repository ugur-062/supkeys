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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
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
import { cronJobMeta } from "@/lib/cron-jobs";
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
import { toastApiError } from "@/lib/api";

// API `FOREIGN_CURRENCY_CODES` (@rothern/shared) ile BİREBİR — admin paketi
// shared'e bağlı değil; API listede olmayan kodu 400 ile reddeder.
const MANUAL_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CHF",
  "JPY",
  "AED",
  "CNY",
  "RUB",
  "AZN",
  "SEK",
  "NOK",
  "DKK",
  "BGN",
  "RON",
  "KRW",
  "SAR",
  "QAR",
  "KWD",
  "AUD",
  "CAD",
];

/** Manuel kur formu — TCMB arızası acil durumu (yalnız SUPER_ADMIN, BE guard). */
function ManualRateForm({ rates }: { rates?: Record<string, number> }) {
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
          // Yer tutucu seçili birimin güncel kuru — eski sabit "34.5000"
          // gerçeğe uzaktı (arayüz testi D-139).
          placeholder={
            rates?.[currency] ? rates[currency].toFixed(4) : undefined
          }
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
              onError: (e: unknown) => toastApiError(e),
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
function SuppressionsSection({ canClear }: { canClear: boolean }) {
  const list = useSuppressions();
  const clear = useClearSuppression();
  const rows = list.data ?? [];
  // Engel kaldırma gerçek dış etki (adrese yeniden gönderim başlar) — onay
  // penceresiyle; tek tıkla aklama yoktu (arayüz testi D-221). Kilit onay
  // penceresinde (ConfirmDialog), açık pencere tek adrese bağlı.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
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
        {list.isError ? (
          // API hatasında "Engellenen adres yok" denmez — liste bilinmiyor
          // (arayüz testi D-221).
          <ErrorState
            className="m-4"
            title="Engellenen adresler yüklenemedi"
            message="Liste alınamadı; engelli adres olup olmadığı şu an bilinmiyor."
            onRetry={() => void list.refetch()}
          />
        ) : rows.length === 0 ? (
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
                <p className="text-admin-text text-sm font-medium break-all">{r.email}</p>
                <p className="text-admin-text-muted text-xs">
                  {r.status === "COMPLAINED" ? "Şikayet" : "Kalıcı bounce"}
                  {r.reason ? ` — ${r.reason}` : ""} ·{" "}
                  {safeFormat(r.at, "d MMM yyyy")}
                </p>
              </div>
              {/* Liste SUPER_ADMIN+SALES; engel kaldırma yalnız SUPER_ADMIN
                  (clearSuppression) — SALES'e 403 düğmesi çizilmez (LU-12). */}
              {canClear ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmEmail(r.email)}
                >
                  Engeli Kaldır
                </Button>
              ) : null}
            </div>
          ))
        )}
      </div>
      <ConfirmDialog
        open={confirmEmail !== null}
        title="E-posta engelini kaldır"
        confirmLabel="Engeli Kaldır"
        danger
        onConfirm={() => {
          if (!confirmEmail) return;
          return clear.mutateAsync({ email: confirmEmail }).then(
            () => {
              toast.success("Engel kaldırıldı");
              setConfirmEmail(null);
            },
            (e: unknown) => toastApiError(e),
          );
        }}
        onClose={() => setConfirmEmail(null)}
      >
        <p>
          <span className="font-medium break-all">{confirmEmail}</span> adresine
          e-posta gönderimi yeniden başlar.
        </p>
        <p className="text-admin-text-muted text-xs">
          Adres hâlâ ulaşılamazsa yeni bir geri dönme ya da şikayet onu yeniden
          engeller; işlem denetim kaydına girer.
        </p>
      </ConfirmDialog>
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
  const canClearSuppression = canAdminDo(admin?.role, "clearSuppression");
  // Kur yenileme SUPER_ADMIN+SALES; Sistem sayfası SUPPORT'a da açık (LU-12).
  const canRefreshRates = canAdminDo(admin?.role, "refreshRates");
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
          {canRefreshRates ? (
            <Button
              size="sm"
              loading={refresh.isPending}
              onClick={() =>
                refresh.mutate(undefined, {
                  onSuccess: (r) =>
                    r.success
                      ? toast.success(`Kurlar yenilendi (${r.date})`)
                      : toast.error(`TCMB alınamadı: ${r.reason ?? "bilinmiyor"}`),
                  onError: (e: unknown) => toastApiError(e),
                })
              }
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Kurları Şimdi Yenile
            </Button>
          ) : null}
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
          Kur bayatken (7+ gün) dövizli açık eksiltme açılamaz, kalem bazında
          farklı para birimli teklifler reddedilir ve dövizli tekliflerin TL
          karşılığı boş kalır — TCMB arızasında kurları yenilemek ya da manuel
          kur girmek bunu düzeltir.
        </p>
        {/* B2 (denetim 2026-08-26 Parça 10): bu üç bölüm SUPER_ADMIN'e kilitli
            uçlara yazıyor (backend fail-closed) ama UI'da hiç kapı yoktu →
            SUPPORT/SALES basılabilir düğmeler görüp 403 alıyordu ve
            "UI kilidi = API kilidi" garantisi bu ekranda yoktu. */}
        {canManualRate ? <ManualRateForm rates={s?.exchangeRates.rates ?? undefined} /> : null}
      </section>

      {canListSuppressions ? <SuppressionsSection canClear={canClearSuppression} /> : null}
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
              (s?.crons ?? []).map((c) => {
                const meta = cronJobMeta(c);
                return (
                <TableRow key={c.key}>
                  {/* Ad ve zamanlama sarar: tablo `whitespace-nowrap` olduğundan
                      uzun adlar Durum/Çalışma sayısı sütunlarını kartın
                      dışına itiyordu (arayüz testi D-139). */}
                  <TableCell className="text-admin-text min-w-[14rem] text-sm font-medium whitespace-normal">
                    {meta.label}
                    <span className="text-admin-text-muted block font-mono text-[11px]">
                      {c.key}
                    </span>
                  </TableCell>
                  <TableCell className="text-admin-text-muted min-w-[8rem] text-xs whitespace-normal">
                    {meta.schedule}
                  </TableCell>
                  <TableCell className="text-admin-text-muted text-xs whitespace-nowrap">
                    {c.lastRunAt
                      ? safeFormat(c.lastRunAt, "d MMM HH:mm:ss")
                      : "Henüz çalışmadı"}
                  </TableCell>
                  <TableCell>
                    {c.lastStatus === null ? (
                      <Badge color="zinc">—</Badge>
                    ) : c.lastStatus === "ok" ? (
                      <Badge color="green">Başarılı</Badge>
                    ) : (
                      <Badge color="red" title={c.lastError ?? undefined}>
                        Hata
                      </Badge>
                    )}
                    {c.lastError ? (
                      <span className="text-admin-text-muted mt-1 block max-w-[16rem] text-xs break-words whitespace-normal">
                        {c.lastError}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-admin-text text-right text-sm tabular-nums">
                    {c.runCount}
                  </TableCell>
                </TableRow>
                );
              })
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
// `max` API TimeSavingsConfigDto @Max ile birebir — aşan değer sunucunun alan
// adı taşımayan 400'üne düşmeden alan adıyla reddedilir (arayüz testi FX-00 D-037).
const TS_FIELDS: { key: keyof TimeSavingsConfigRow; label: string; step?: string; max: number }[] = [
  { key: "rfqMailPrepMin", label: "RFQ maili (dk × davet)", max: 999 },
  { key: "followupMin", label: "Hatırlatma (dk — v1'de hesaba katılmaz)", max: 999 },
  { key: "bidToExcelMin", label: "Teklif→Excel (dk × teklif)", max: 999 },
  { key: "bidItemFactor", label: "Kalem katsayısı", step: "0.05", max: 9 },
  { key: "comparisonTableMin", label: "Karşılaştırma tablosu (dk × satın alma talebi)", max: 999 },
  { key: "revisionRoundMin", label: "Revizyon turu (dk × tur)", max: 999 },
  { key: "approvalLoopMin", label: "Onay döngüsü (dk × onay)", max: 999 },
  { key: "poPrepMin", label: "PO hazırlama (dk × sipariş)", max: 999 },
  { key: "hourlyLaborCost", label: "Saatlik maliyet (₺, boş = TL gizli)", max: 1_000_000 },
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
  // Yapılandırma yüklenmeden form varsayılanlarla DOLDURULMAZ ve Kaydet kapalı
  // kalır — yükleme hatasında varsayılanları kaydetmek gerçek ayarları ezerdi
  // (arayüz testi FX-00 D-037).
  const loaded = cfg.isSuccess;
  useEffect(() => {
    if (!cfg.isSuccess) return;
    const src = cfg.data ?? TS_DEFAULTS;
    setForm(
      Object.fromEntries(
        TS_FIELDS.map((f) => [
          f.key,
          src[f.key] == null ? "" : String(src[f.key]),
        ]),
      ),
    );
  }, [cfg.isSuccess, cfg.data]);

  return (
    <section className="border-admin-border bg-admin-surface rounded-xl border p-5">
      <h2 className="text-admin-text text-sm font-semibold">
        Zaman Tasarrufu Parametreleri
      </h2>
      <p className="text-admin-text-muted mt-1 text-xs">
        Firma panellerindeki &ldquo;~X saat kazandın&rdquo; hesabının birim
        süreleri. Boş bırakılan saatlik maliyet TL gösterimini kapatır.
      </p>
      {cfg.isError ? (
        <ErrorState
          className="mt-4"
          title="Parametreler yüklenemedi"
          message="Kayıtlı değerler okunamadı; varsayılanlarla kaydetmek ayarları ezeceği için form kapalı."
          onRetry={() => cfg.refetch()}
        />
      ) : null}
      {loaded ? (
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TS_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-admin-text-muted text-xs font-medium">
              {f.label}
            </span>
            <Input
              type="number"
              min="0"
              max={f.max}
              step={f.step ?? "0.5"}
              value={form[f.key] ?? ""}
              onChange={(e) =>
                setForm((cur) => ({ ...cur, [f.key]: e.target.value }))
              }
            />
          </label>
        ))}
      </div>
      ) : null}
      <div className="mt-4">
        <Button
          size="sm"
          loading={update.isPending}
          disabled={!loaded}
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
              if (n > f.max) {
                toast.error(`${f.label}: en fazla ${f.max.toLocaleString("tr-TR")}`);
                return;
              }
              (payload as Record<string, number | null>)[f.key] = n;
            }
            // Promise döner → admin Button iş bitene dek kilitli (çift tık
            // ikinci istek atmaz).
            return update.mutateAsync(payload).then(
              () => toast.success("Parametreler kaydedildi"),
              (e: unknown) => toastApiError(e, "Kaydedilemedi"),
            );
          }}
        >
          Kaydet
        </Button>
      </div>
    </section>
  );
}
