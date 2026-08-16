"use client";

import { AI_FEATURE_LABELS, labelOr } from "@/lib/company/labels";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { PremiumOnly } from "@/components/company-shell/premium-only";
import { useAiUsage } from "@/hooks/use-ai-usage";
import { cn } from "@/lib/utils";
import { SettingsShell } from "../_components/settings-shell";



/** Yüzde çubuğu — monokrom; uyarı eşiğinden sonra vurgulu. */
function PercentBar({ percent, warn }: { percent: number; warn: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-semibold text-zinc-950">
          %{percent.toLocaleString("tr-TR")}
        </span>
        {warn ? (
          <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-xs font-medium text-white">
            Uyarı eşiği aşıldı
          </span>
        ) : null}
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            warn ? "bg-zinc-950" : "bg-zinc-600",
          )}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

export default function AiKullanimPage() {
  const { data, isLoading, isError } = useAiUsage();

  return (
    <SettingsShell
      title="AI Kullanımı"
      description="Firmanızın aylık AI kullanım bütçesi — yüzde bazında. Bütçe dolduğunda AI özellikleri ay sonuna kadar kapanır; %80'de uyarı verilir."
    >
      <PremiumOnly minTier="SILVER">
        {isError ? (
          <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            AI kullanımı görüntülenemedi — bu sayfayı Kurucu/Yönetici (firma
            kırılımı) ile Satın Almacı/Satışçı (kendi kullanımı) rolündeki
            kullanıcılar, Silver ve üzeri pakette görebilir.
          </p>
        ) : isLoading && !data ? (
          <p className="text-sm text-zinc-500">Yükleniyor…</p>
        ) : data ? (
          <div className="space-y-8">
            {!data.enabled ? (
              <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                AI özellikleri şu anda kapalı (yapılandırılmamış). Kullanım
                geçmişiniz aşağıda görünmeye devam eder.
              </p>
            ) : null}

            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                {data.view === "company"
                  ? "Firma havuzu (bu ay)"
                  : "Kişisel kullanımınız (bu ay)"}
              </h2>
              <PercentBar percent={data.percentUsed} warn={data.warning} />
              <p className="mt-1.5 text-xs text-zinc-500">
                {data.view === "company"
                  ? `Aylık firma AI bütçenizin %${data.percentUsed.toLocaleString("tr-TR")} kadarı kullanıldı. %${data.warnAtPercent} eşiğinde uyarı verilir; %100'de AI kapanır.`
                  : `Kişisel tavanınızın (firma havuzunun yarısı) %${data.percentUsed.toLocaleString("tr-TR")} kadarı kullanıldı.`}
              </p>
            </section>

            {data.view === "company" &&
            typeof data.premiumPercentUsed === "number" ? (
              <section>
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Gelişmiş model alt-bütçesi
                </h2>
                <PercentBar
                  percent={data.premiumPercentUsed}
                  warn={data.premiumPercentUsed >= data.warnAtPercent}
                />
                <p className="mt-1.5 text-xs text-zinc-500">
                  Karmaşık işler için sistemin otomatik seçtiği gelişmiş model,
                  havuzun ayrı bir bölümünden harcar. Dolduğunda istekler
                  standart modelle sürdürülür.
                </p>
              </section>
            ) : null}

            {data.view === "company" ? (
              <>
                <section>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Kullanıcı kırılımı
                  </h2>
                  <Table dense>
                    <TableHead>
                      <TableRow>
                        <TableHeader>Kullanıcı</TableHeader>
                        <TableHeader>İstek</TableHeader>
                        <TableHeader>Havuz payı</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(data.byUser ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-zinc-500">
                            Bu ay AI kullanımı yok
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
                              %{r.percentOfPool.toLocaleString("tr-TR")}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </section>

                <section>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Özellik kırılımı
                  </h2>
                  <Table dense>
                    <TableHead>
                      <TableRow>
                        <TableHeader>Özellik</TableHeader>
                        <TableHeader>İstek</TableHeader>
                        <TableHeader>Havuz payı</TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(data.byFeature ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-zinc-500">
                            Bu ay AI kullanımı yok
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data.byFeature ?? []).map((r) => (
                          <TableRow key={r.feature}>
                            <TableCell className="text-sm text-zinc-900">
                              {labelOr(AI_FEATURE_LABELS, r.feature, "Diğer")}
                            </TableCell>
                            <TableCell className="text-sm text-zinc-600">
                              {r.requests}
                            </TableCell>
                            <TableCell className="text-sm text-zinc-600">
                              %{r.percentOfPool.toLocaleString("tr-TR")}
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
      </PremiumOnly>
    </SettingsShell>
  );
}
