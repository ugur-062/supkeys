"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import axios from "axios";
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
import { useState } from "react";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";
import { formatDate } from "@/lib/format-date";
import { useAuditActionLabel, useRoleLabel } from "@/i18n/domain";

/** Modül filtresi — backend whitelist ile birebir; etiket `module.<key>` katalog anahtarı. */
const MODULES: { value: string; key: string }[] = [
  { value: "", key: "all" },
  { value: "listing", key: "listing" },
  { value: "bid", key: "bid" },
  { value: "order", key: "order" },
  { value: "user", key: "user" },
  { value: "seats", key: "seats" },
  { value: "bank_account", key: "bank_account" },
  { value: "address", key: "address" },
  { value: "docs", key: "docs" },
  { value: "approval", key: "approval" },
  { value: "connection", key: "connection" },
  { value: "profile", key: "profile" },
];

export default function AktivitePage() {
  const t = useTranslations("web.panel.settings.ayarlarAktivitePage");
  const td = useTranslations("web.domain");
  const locale = useLocale() as Locale;
  const auditAction = useAuditActionLabel();
  const roleLabel = useRoleLabel();
  const [page, setPage] = useState(1);
  const [module, setModule] = useState("");
  const { data, isLoading, isError, error, refetch } = useActivityLog(page, module || undefined);
  const forbidden = axios.isAxiosError(error) && error.response?.status === 403;
  const totalPages = data?.pagination.totalPages ?? 1;

  const moduleOptions = MODULES.map((m) => ({ value: m.value, label: t(`module.${m.key}` as never) }));
  /** Eylem sözlükte var mı — yoksa ham anahtar yalnız title'da kalır (destek teşhisi). */
  const actionKnown = (action: string) =>
    td.has(`auditAction.${action.replace(/\./g, "_")}` as never);

  /** Metadata'dan kısa, değersiz özet (alan adları / maskeli referanslar). */
  const summarize = (row: ActivityLogRow): string => {
    const m = row.metadata ?? {};
    const parts: string[] = [];
    // C16: kazandırma SİPARİŞ BAŞINA iz yazar (INV-AUDIT-1) — numara olmadan
    // aynı saniyedeki kayıtlar "çift kayıt" gibi okunuyordu.
    if (typeof m.orderNumber === "string") parts.push(t("siparis", { n: m.orderNumber }));
    if (Array.isArray(m.changedFields) && m.changedFields.length) {
      parts.push(t("alanlar", { list: (m.changedFields as string[]).join(", ") }));
    }
    if (typeof m.ibanMasked === "string") parts.push(m.ibanMasked);
    if (typeof m.kind === "string") parts.push(String(m.kind));
    if (Array.isArray(m.after))
      parts.push(
        t("yeniRoller", { list: (m.after as string[]).map(roleLabel).join(", ") || "—" }),
      );
    if (typeof m.reason === "string") parts.push(m.reason);
    return parts.join(" · ");
  };

  const fmtDate = (iso: string): string => formatDate(iso, "datetime", locale);

  return (
    <SettingsShell
      page={SETTINGS_PAGES.aktivite}
      description={t("firmanizdakiEylemKayitlariKimSatin")}
    >
      <PremiumOnly minTier="SILVER">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500" htmlFor="aktivite-modul">
              {t("modul")}
            </label>
            <SelectMenu
              id="aktivite-modul"
              value={module}
              onChange={(v) => {
                setModule(v);
                setPage(1);
              }}
              className="min-w-44"
              options={moduleOptions}
            />
          </div>

          {isError ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {forbidden
                ? t("aktiviteLogunuYalnizKullaniciYonetimi")
                : t("aktiviteLoguYuklenemedi")}{" "}
              {!forbidden ? (
                <button type="button" onClick={() => void refetch()} className="font-semibold underline underline-offset-2">
                  {t("yenidenDene")}
                </button>
              ) : null}
            </p>
          ) : isLoading && !data ? (
            <p className="text-sm text-zinc-500">{t("yukleniyor")}</p>
          ) : (
            <>
              <Table dense>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t("tarih")}</TableHeader>
                    <TableHeader>{t("eylem")}</TableHeader>
                    <TableHeader>{t("kisi")}</TableHeader>
                    <TableHeader>{t("detay")}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-zinc-500">
                        {module ? t("buModuldeHenuzKayitYok") : t("henuzKayitYok")}
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
                          title={actionKnown(r.action) ? undefined : r.action}
                        >
                          {auditAction(r.action)}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-600">
                          {r.actorEmail ?? t("sistem")}
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
                    {t("sayfaKayit", {
                      page: data?.pagination.page ?? 1,
                      totalPages,
                      total: data?.pagination.total ?? 0,
                    })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      plain
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t("onceki")}
                    </Button>
                    <Button
                      plain
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t("sonraki")}
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
