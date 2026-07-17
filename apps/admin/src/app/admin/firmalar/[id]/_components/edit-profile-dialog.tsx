"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useUpdateCompanyProfile,
  type AdminCompanyDetail,
  type CompanyProfilePatch,
} from "@/hooks/use-admin-companies";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * Düzenlenebilir alanlar — sıra formda görünen sıradır. `max` backend
 * UpdateCompanyProfileDto @MaxLength/@Length ile BİREBİR (admin-companies.controller).
 */
const FIELDS: {
  key: keyof CompanyProfilePatch;
  label: string;
  hint?: string;
  max: number;
}[] = [
  { key: "name", label: "Firma adı (görünen)", max: 200 },
  { key: "legalName", label: "Ünvan", max: 300 },
  { key: "taxNumber", label: "Vergi No", max: 30 },
  { key: "taxOffice", label: "Vergi Dairesi", max: 120 },
  { key: "mersisNo", label: "MERSİS No", max: 30 },
  { key: "tradeRegistryNo", label: "Ticari Sicil No", max: 40 },
  { key: "country", label: "Ülke (kod)", hint: "TR, DE... — 2 harf", max: 2 },
  { key: "stateRegion", label: "Eyalet / Bölge", max: 120 },
  { key: "city", label: "Şehir", max: 120 },
  { key: "addressLine", label: "Adres", max: 400 },
  { key: "billingEmail", label: "Fatura e-postası", max: 200 },
  { key: "website", label: "Web sitesi", max: 300 },
  { key: "industry", label: "Sektör", max: 120 },
  { key: "iban", label: "IBAN", max: 40 },
  { key: "ibanHolder", label: "IBAN Sahibi", max: 200 },
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
    <Dialog open onClose={onClose} size="2xl" aria-label="Firma bilgisi düzenle">
      <DialogTitle>Firma Bilgisi Düzenle</DialogTitle>
      <DialogBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <Field key={f.key} hint={f.hint}>
              <Label htmlFor={`profile-${f.key}`}>{f.label}</Label>
              <Input
                id={`profile-${f.key}`}
                value={form[f.key] ?? ""}
                maxLength={f.max}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
              />
            </Field>
          ))}
        </div>
        <p className="text-admin-text-muted mt-4 text-xs">
          Değişiklikler denetim kaydına yazılır. Vergi no / ülke değişimi
          doğrulama kararını otomatik bozmaz — gerekiyorsa belgeleri yeniden
          inceleyin.
        </p>
      </DialogBody>
      <DialogActions>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} loading={update.isPending}>
            Kaydet
          </Button>
      </DialogActions>
    </Dialog>
  );
}
