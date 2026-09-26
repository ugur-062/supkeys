"use client";

import { useTranslations } from "next-intl";
import { RequestDefaultsForm } from "@/components/tenders/request-defaults-form";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useRequestDefaults, useSaveRequestDefaults } from "@/hooks/use-request-defaults";
import { REQUEST_DEFAULTS_FALLBACK, type RequestDefaults } from "@rothern/shared";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * TALEP ŞARTLARI — firmanın ticari profili (2026-09-09).
 * Bir kez kurulur; hızlı talep kartı ve sihirbaz her yeni talebi bu değerlerle
 * başlatır. Kayıt yoksa son yayımlanan talepten türetilmiş hâl önerilir.
 */
export default function TalepSartlariPage() {
  const t = useTranslations("web.panel.requests.page");
  const q = useRequestDefaults();
  const save = useSaveRequestDefaults();
  const canEdit = useHasCompanyPermission("buy:listing:manage");
  const [draft, setDraft] = useState<RequestDefaults | null>(null);
  useEffect(() => {
    if (q.data && !draft) setDraft(q.data.defaults ?? REQUEST_DEFAULTS_FALLBACK);
  }, [q.data, draft]);

  const onSave = async () => {
    if (!draft) return;
    try {
      await save.mutateAsync(draft);
      toast.success(t("talepSartlariKaydedildiYeniTalepler"));
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg || t("kaydedilemedi"));
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={t("talepSartlari")}
        description={t("teslimSekliOdemeKosuluPara")}
      />
      {q.isLoading || !draft ? (
        <p className="mt-8 text-sm text-zinc-500">{t("yukleniyor")}</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
            {q.data?.source === "last_listing" ? (
              <p className="mb-6 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 ring-1 ring-blue-600/20">
                {t.rich("henuzKaydedilmisSartYok", { strong: (c) => <strong>{c}</strong> })}
              </p>
            ) : q.data?.source === "none" ? (
              <p className="mb-6 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                {t("henuzTalepAcmamissinizPlatformVarsayilani")}
              </p>
            ) : null}
            <RequestDefaultsForm value={draft} onChange={setDraft} />
          </div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
              <p className="text-sm font-semibold text-zinc-950">{t("neredeKullanilir")}</p>
              <p className="mt-2 text-xs/5 text-zinc-600">
                {t("hizliTalepKartindaSartlarOzet")}
              </p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={save.isPending}
                  className="mt-4 w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {save.isPending ? t("kaydediliyor") : t("sartlariKaydet")}
                </button>
              ) : (
                <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">{t("duzenlemekIcinTalepYonetimiYetkisi")}</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </PageContainer>
  );
}
