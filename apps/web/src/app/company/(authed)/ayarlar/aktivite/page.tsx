"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { Button } from "@/components/catalyst/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { PremiumOnly } from "@/components/company-shell/premium-only";
import {
  useActivityLog,
  type ActivityLogRow,
} from "@/hooks/use-activity-log";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useState } from "react";
import { SettingsShell } from "../_components/settings-shell";
import {
  AUDIT_ACTION_LABELS,
  labelOr,
  roleLabel,
} from "@/lib/company/labels";

/** Modül filtresi — backend whitelist ile birebir. */
const MODULES: { value: string; label: string }[] = [
  { value: "", label: "Tümü" },
  { value: "listing", label: "İhaleler" },
  { value: "bid", label: "Teklifler" },
  { value: "order", label: "Siparişler" },
  { value: "user", label: "Kullanıcılar" },
  { value: "seats", label: "Koltuklar" },
  { value: "bank_account", label: "Banka Hesapları" },
  { value: "address", label: "Adresler" },
  { value: "docs", label: "Belgeler (KYC)" },
  { value: "approval", label: "Onaylar" },
  { value: "connection", label: "Bağlantılar" },
  { value: "profile", label: "Firma Profili" },
];


/** Metadata'dan kısa, değersiz özet (alan adları / maskeli referanslar). */
function summarize(row: ActivityLogRow): string {
  const m = row.metadata ?? {};
  const parts: string[] = [];
  // C16: kazandırma SİPARİŞ BAŞINA iz yazar (INV-AUDIT-1) — numara olmadan
  // aynı saniyedeki kayıtlar "çift kayıt" gibi okunuyordu.
  if (typeof m.orderNumber === "string") parts.push(`sipariş ${m.orderNumber}`);
  if (Array.isArray(m.changedFields) && m.changedFields.length) {
    parts.push(`alanlar: ${(m.changedFields as string[]).join(", ")}`);
  }
  if (typeof m.ibanMasked === "string") parts.push(m.ibanMasked);
  if (typeof m.kind === "string") parts.push(String(m.kind));
  if (Array.isArray(m.after))
    parts.push(
      `yeni roller: ${(m.after as string[]).map(roleLabel).join(", ") || "—"}`,
    );
  if (typeof m.reason === "string") parts.push(m.reason);
  return parts.join(" · ");
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : format(d, "d MMM yyyy HH:mm", { locale: tr });
}

export default function AktivitePage() {
  const [page, setPage] = useState(1);
  const [module, setModule] = useState("");
  const { data, isLoading, isError } = useActivityLog(page, module || undefined);
  const totalPages = data?.pagination.totalPages ?? 1;

  return (
    <SettingsShell
      title="Aktivite Logu"
      description="Firmanızdaki eylem kayıtları — kim ihale açtı, kim rol değiştirdi, kim banka hesabı güncelledi. Değerler değil eylemler kaydedilir; hassas alanlar maskeli referansla görünür."
    >
      <PremiumOnly minTier="SILVER">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500" htmlFor="aktivite-modul">
              Modül
            </label>
            <SelectMenu
              id="aktivite-modul"
              value={module}
              onChange={(v) => {
                setModule(v);
                setPage(1);
              }}
              className="min-w-44"
              options={MODULES}
            />
          </div>

          {isError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Aktivite logu yüklenemedi — bu sayfayı yalnızca Kurucu ve
              Yönetici, Silver ve üzeri pakette görüntüleyebilir.
            </p>
          ) : isLoading && !data ? (
            <p className="text-sm text-zinc-500">Yükleniyor…</p>
          ) : (
            <>
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>Tarih</TableHeader>
                    <TableHeader>Eylem</TableHeader>
                    <TableHeader>Kişi</TableHeader>
                    <TableHeader>Detay</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-zinc-500">
                        Kayıt yok
                      </TableCell>
                    </TableRow>
                  ) : (
                    (data?.items ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs text-zinc-500">
                          {fmtDate(r.createdAt)}
                        </TableCell>
                        <TableCell
                          className="text-sm text-zinc-900"
                          title={AUDIT_ACTION_LABELS[r.action] ? undefined : r.action}
                        >
                          {labelOr(AUDIT_ACTION_LABELS, r.action)}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-600">
                          {r.actorEmail ?? "sistem"}
                        </TableCell>
                        <TableCell
                          className="max-w-[280px] truncate text-xs text-zinc-500"
                          title={summarize(r)}
                        >
                          {summarize(r)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              {totalPages > 1 ? (
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    Sayfa {data?.pagination.page ?? 1}/{totalPages} —{" "}
                    {data?.pagination.total ?? 0} kayıt
                  </span>
                  <div className="flex gap-2">
                    <Button
                      plain
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Önceki
                    </Button>
                    <Button
                      plain
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Sonraki
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </PremiumOnly>
    </SettingsShell>
  );
}
