"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import axios from "axios";
import { formatNumber } from "@/i18n/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { VerifiedOnly } from "@/components/company-shell/premium-only";
import { useAiUsage } from "@/hooks/use-ai-usage";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { tierAtLeast } from "@rothern/shared";
import { cn } from "@/lib/utils";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";



/**
 * Yüzde çubuğu — monokrom; uyarı eşiğinden sonra vurgulu. `exhausted`: bütçe
 * doldu, AI kapalı — %80 rozeti yerine ayrı rozet (arayüz testi D-172).
 */
function PercentBar({ percent, warn, exhausted = false }: { percent: number; warn: boolean; exhausted?: boolean }) {
  const t = useTranslations("web.panel.settings.ayarlarAiKullanimPage");
  const locale = useLocale() as Locale;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold text-zinc-950">
          {t("yuzde", { n: formatNumber(percent, locale) })}
        </span>
        {exhausted ? (
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-medium text-white">
            {t("butceDoldu")}
          </span>
        ) : warn ? (
          <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-xs font-medium text-white">
            {t("uyariEsigiAsildi")}
          </span>
        ) : null}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            exhausted ? "bg-red-600" : warn ? "bg-zinc-950" : "bg-zinc-600",
          )}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

export default function AiKullanimPage() {
  const t = useTranslations("web.panel.settings.ayarlarAiKullanimPage");
  // AI özellik adı `web.domain.aiFeature` sözlüğünden; sözlükte yoksa "Diğer".
  const tf = useTranslations("web.domain.aiFeature");
  const locale = useLocale() as Locale;
  // Erişim kilitliyse (VerifiedOnly doğrulama kapısı çizer) istek hiç atılmaz (O-044).
  const { company } = useCompanyAuth();
  const tierOk = !!company && tierAtLeast(company.tier, "SILVER");
  const { data, isLoading, isError, error, refetch } = useAiUsage(tierOk);
  const forbidden = axios.isAxiosError(error) && error.response?.status === 403;

  return (
    <SettingsShell
      page={SETTINGS_PAGES.ai}
      description={t("firmanizinAylikAiButcesininNe")}
    >
      <VerifiedOnly minTier="SILVER">
        {isError ? (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {forbidden
              ? t("aiKullaniminiYonetimYetkisiTasiyanlar")
              : t("aiKullanimiYuklenemedi")}{" "}
            {!forbidden ? (
              <button type="button" onClick={() => void refetch()} className="font-semibold underline underline-offset-2">
                {t("yenidenDene")}
              </button>
            ) : null}
          </p>
        ) : isLoading && !data ? (
          <p className="text-sm text-zinc-500">{t("yukleniyor")}</p>
        ) : data ? (
          <div className="space-y-8">
            {!data.enabled ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
                {t("aiOzellikleriSuAndaKapali")}
              </p>
            ) : data.exhausted ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {data.view === "company" ? t("firmaButcesiDolduAiKapali") : t("kisiselTavanDolduAiKapali")}
              </p>
            ) : data.view === "company" && data.myExhausted ? (
              // Havuz açık ama bakan yöneticinin kişisel tavanı doldu (D-172).
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {t("kisiselTavanDolduAiKapali")}
              </p>
            ) : null}

            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                {data.view === "company"
                  ? t("firmaHavuzuBuAy")
                  : t("kisiselKullaniminizBuAy")}
              </h2>
              <PercentBar percent={data.percentUsed} warn={data.warning} exhausted={data.exhausted === true} />
              <p className="mt-1.5 text-xs text-zinc-500">
                {data.view === "company"
                  ? t("aylikFirmaAiButcesiKullanildi", { percent: formatNumber(data.percentUsed, locale), warnAtPercent: data.warnAtPercent })
                  : t("kisiselTavanKullanildi", { percent: formatNumber(data.percentUsed, locale) })}
              </p>
            </section>

            {data.view === "company" &&
            typeof data.premiumPercentUsed === "number" ? (
              <section>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                  {t("gelismisModelAltButcesi")}
                </h2>
                <PercentBar
                  percent={data.premiumPercentUsed}
                  warn={data.premiumPercentUsed >= data.warnAtPercent}
                />
                <p className="mt-1.5 text-xs text-zinc-500">
                  {t("karmasikIslerIcinSisteminOtomatik")}
                </p>
              </section>
            ) : null}

            {data.view === "company" ? (
              <>
                <section>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {t("kullaniciKirilimi")}
                  </h2>
                  <Table dense>
                    <TableHead>
                      <TableRow>
                        <TableHeader>{t("kullanici")}</TableHeader>
                        <TableHeader>{t("istek")}</TableHeader>
                        <TableHeader>{t("havuzPayi")}</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(data.byUser ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-zinc-500">
                            {t("buAyAiKullanimiYok")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data.byUser ?? []).map((r) => (
                          <TableRow key={r.userId}>
                            <TableCell className="text-sm text-zinc-900">
                              {r.userEmail ?? r.userId}
                            </TableCell>
                            <TableCell className="text-sm text-zinc-600">
                              {r.requests}
                            </TableCell>
                            <TableCell className="text-sm text-zinc-600">
                              {t("yuzde", { n: formatNumber(r.percentOfPool, locale) })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </section>

                <section>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {t("ozellikKirilimi")}
                  </h2>
                  <Table dense>
                    <TableHead>
                      <TableRow>
                        <TableHeader>{t("ozellik")}</TableHeader>
                        <TableHeader>{t("istek")}</TableHeader>
                        <TableHeader>{t("havuzPayi")}</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(data.byFeature ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-zinc-500">
                            {t("buAyAiKullanimiYok")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data.byFeature ?? []).map((r) => (
                          <TableRow key={r.feature}>
                            <TableCell className="text-sm text-zinc-900">
                              {tf.has(r.feature as never) ? tf(r.feature as never) : t("diger")}
                            </TableCell>
                            <TableCell className="text-sm text-zinc-600">
                              {r.requests}
                            </TableCell>
                            <TableCell className="text-sm text-zinc-600">
                              {t("yuzde", { n: formatNumber(r.percentOfPool, locale) })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </section>
              </>
            ) : null}
          </div>
        ) : null}
      </VerifiedOnly>
    </SettingsShell>
  );
}
