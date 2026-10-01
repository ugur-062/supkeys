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
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { tierAtLeast } from "@rothern/shared";
import { useDocLabels, type DocKind } from "@/hooks/use-company-docs";

/** `company.docs.*` kayıtlarındaki `kind` — bilinen belge anahtarları (API DOC_META). */
const DOC_KINDS: readonly DocKind[] = [
  "taxPlate",
  "tradeRegistry",
  "signatureCircular",
  "activityCert",
  "idFront",
  "idBack",
];

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
  const docLabels = useDocLabels();
  const { company } = useCompanyAuth();
  const [page, setPage] = useState(1);
  const [module, setModule] = useState("");
  // Paket kilitliyse (PremiumOnly kilit kartı çizer) istek hiç atılmaz (O-044).
  const tierOk = !!company && tierAtLeast(company.tier, "SILVER");
  const { data, isLoading, isError, error, refetch } = useActivityLog(page, module || undefined, tierOk);
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
    // Alan adları API'nin iç adlarıdır ("postalCode") → katalog etiketi
    // (`field.<ad>`; arayüz testi O-107). Katalogda olmayan ad ham kalır.
    if (Array.isArray(m.changedFields) && m.changedFields.length) {
      const fieldLabel = (f: string) => {
        const k = `field.${f}`;
        return t.has(k as never) ? t(k as never) : f;
      };
      parts.push(
        // city + cityId gibi iç çiftler aynı etikete düşer → tekilleştirilir.
        t("alanlar", {
          list: [...new Set((m.changedFields as string[]).map(fieldLabel))].join(", "),
        }),
      );
    }
    if (typeof m.ibanMasked === "string") parts.push(m.ibanMasked);
    // Belge türü iç anahtardır ("taxPlate") — firmanın ülkesine göre katalog etiketi.
    if (typeof m.kind === "string" && (DOC_KINDS as readonly string[]).includes(m.kind))
      parts.push(docLabels(company?.country, [m.kind as DocKind])[0].label);
    if (Array.isArray(m.after))
      parts.push(
        t("yeniRoller", { list: (m.after as string[]).map(roleLabel).join(", ") || "—" }),
      );
    // Red kayıtlarının `reason`'ı makine kodudur ("not_admin_grant") → katalog
    // etiketi; katalogda yoksa serbest metindir (ör. sipariş iptal gerekçesi).
    if (typeof m.reason === "string") {
      const reasonKey = `reason.${m.reason}`;
      parts.push(t.has(reasonKey as never) ? t(reasonKey as never) : m.reason);
    }
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
                    {/* Dar ekranda (O-111) kişi ve detay eylem hücresinin
                        altına iner; tablo yatay kaymaz. */}
                    <TableHeader className="hidden sm:table-cell">{t("kisi")}</TableHeader>
                    <TableHeader className="hidden sm:table-cell">{t("detay")}</TableHeader>
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
                    (data?.items ?? []).map((r) => {
                      const detail = summarize(r);
                      const actor = r.actorEmail ?? t("sistem");
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="whitespace-nowrap align-top text-xs text-zinc-500">
                            {fmtDate(r.createdAt)}
                          </TableCell>
                          <TableCell
                            className="whitespace-normal text-sm text-zinc-900"
                            title={actionKnown(r.action) ? undefined : r.action}
                          >
                            {auditAction(r.action)}
                            <span className="mt-0.5 block text-xs text-zinc-600 [overflow-wrap:anywhere] sm:hidden">
                              {actor}
                            </span>
                            {detail ? (
                              <span className="block text-xs text-zinc-500 [overflow-wrap:anywhere] sm:hidden">
                                {detail}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="hidden text-xs text-zinc-600 sm:table-cell">
                            {actor}
                          </TableCell>
                          <TableCell
                            className="hidden max-w-[280px] truncate text-xs text-zinc-500 sm:table-cell"
                            title={detail}
                          >
                            {detail}
                          </TableCell>
                        </TableRow>
                      );
                    })
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
