"use client";

import { Button } from "@/components/ui/button";
import {
  useUpdateCompanyProfile,
  type AdminCompanyDetail,
  type CompanyProfilePatch,
} from "@/hooks/use-admin-companies";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** Düzenlenebilir alanlar — sıra formda görünen sıradır. */
const FIELDS: { key: keyof CompanyProfilePatch; label: string; hint?: string }[] = [
  { key: "name", label: "Firma adı (görünen)" },
  { key: "legalName", label: "Ünvan" },
  { key: "taxNumber", label: "Vergi No" },
  { key: "taxOffice", label: "Vergi Dairesi" },
  { key: "mersisNo", label: "MERSİS No" },
  { key: "tradeRegistryNo", label: "Ticari Sicil No" },
  { key: "country", label: "Ülke (kod)", hint: "TR, DE... — 2 harf" },
  { key: "stateRegion", label: "Eyalet / Bölge" },
  { key: "city", label: "Şehir" },
  { key: "addressLine", label: "Adres" },
  { key: "billingEmail", label: "Fatura e-postası" },
  { key: "website", label: "Web sitesi" },
  { key: "industry", label: "Sektör" },
  { key: "iban", label: "IBAN" },
  { key: "ibanHolder", label: "IBAN Sahibi" },
];

/**
 * Firma kimlik düzeltme — "yanlış yazdık, düzeltir misiniz" çağrıları.
 * Yalnız DEĞİŞEN alanlar gönderilir; her değişiklik audit'e yazılır.
 */
export function EditProfileDialog({
  companyId,
  data,
  onClose,
}: {
  companyId: string;
  data: AdminCompanyDetail;
  onClose: () => void;
}) {
  const update = useUpdateCompanyProfile();
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const f of FIELDS) {
      init[f.key] = (data[f.key as keyof AdminCompanyDetail] as string | null) ?? "";
    }
    setForm(init);
  }, [data]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    // Yalnız değişen alanlar (audit gürültüsü olmasın).
    const patch: CompanyProfilePatch = {};
    for (const f of FIELDS) {
      const before =
        (data[f.key as keyof AdminCompanyDetail] as string | null) ?? "";
      const after = form[f.key] ?? "";
      if (after.trim() === before.trim()) continue;
      (patch as Record<string, string>)[f.key] = after.trim();
    }
    if (Object.keys(patch).length === 0) {
      toast.info("Değişiklik yok");
      return;
    }
    if (patch.country && !/^[A-Za-z]{2}$/.test(patch.country)) {
      toast.error("Ülke kodu 2 harf olmalı (TR, DE...)");
      return;
    }
    update.mutate(
      { id: companyId, patch },
      {
        onSuccess: (r) => {
          toast.success(`Güncellendi (${r.changed.length} alan)`);
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-6 pb-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Firma bilgisi düzenle"
    >
      <div
        className="bg-admin-surface flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-admin-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-admin-text text-lg font-bold">
            Firma Bilgisi Düzenle
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-admin-border/40 rounded-lg p-1"
            aria-label="Kapat"
          >
            <X className="text-admin-text-muted h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-admin-text-muted text-xs font-medium">
                  {f.label}
                </span>
                <input
                  value={form[f.key] ?? ""}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  className="border-admin-border bg-admin-surface text-admin-text rounded-lg border px-3 py-1.5 text-sm"
                />
                {f.hint ? (
                  <span className="text-admin-text-muted text-[11px]">
                    {f.hint}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
          <p className="text-admin-text-muted mt-4 text-xs">
            Değişiklikler denetim kaydına yazılır. Vergi no / ülke değişimi
            KYC kararını otomatik bozmaz — gerekiyorsa belgeleri yeniden
            inceleyin.
          </p>
        </div>
        <div className="border-admin-border flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} loading={update.isPending}>
            Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
