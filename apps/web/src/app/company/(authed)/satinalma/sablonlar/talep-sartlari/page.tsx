"use client";

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
      toast.success("Talep şartları kaydedildi — yeni talepler bunlarla başlar");
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg || "Kaydedilemedi");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Talep Şartları"
        description="Teslim şekli, ödeme koşulu, para birimi, görünürlük ve süre — bir kez kurun; her yeni satın alma talebi bunlarla başlasın, gerekirse talepte değiştirin."
      />
      {q.isLoading || !draft ? (
        <p className="mt-8 text-sm text-zinc-500">Yükleniyor…</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-zinc-950/5">
            {q.data?.source === "last_listing" ? (
              <p className="mb-6 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 ring-1 ring-blue-600/20">
                Henüz kaydedilmiş şart yok — aşağıdakiler <strong>son yayımladığınız talepten</strong> türetildi. Kontrol edip kaydedin.
              </p>
            ) : q.data?.source === "none" ? (
              <p className="mb-6 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                Henüz talep açmamışsınız; platform varsayılanı gösteriliyor (yurtiçi, açık hesap, TRY, 7 gün, kapalı zarf).
              </p>
            ) : null}
            <RequestDefaultsForm value={draft} onChange={setDraft} />
          </div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
              <p className="text-sm font-semibold text-zinc-950">Nerede kullanılır</p>
              <p className="mt-2 text-xs/5 text-zinc-600">
                Hızlı talep kartında şartlar özet olarak görünür; tek satırı değiştirmek için kartta "değiştir" deyin. Sihirbaz (detaylı talep) da bu değerlerle başlar.
              </p>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => void onSave()}
                  disabled={save.isPending}
                  className="mt-4 w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {save.isPending ? "Kaydediliyor…" : "Şartları kaydet"}
                </button>
              ) : (
                <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">Düzenlemek için talep yönetimi yetkisi gerekir.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </PageContainer>
  );
}
