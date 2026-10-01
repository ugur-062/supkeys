"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Select } from "@/components/catalyst/select";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useUpdateCompanyProfile,
  type AdminCompanyDetail,
  type CompanyProfilePatch,
  type CompanyTypeCode,
} from "@/hooks/use-admin-companies";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/api";

/**
 * Düzenlenebilir alanlar — sıra formda görünen sıradır. `max` backend
 * UpdateCompanyProfileDto @MaxLength/@Length ile BİREBİR (admin-companies.controller).
 */
const FIELDS: {
  key: keyof CompanyProfilePatch;
  label: string;
  hint?: string;
  max: number;
  type?: "email";
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
  {
    key: "billingEmail",
    label: "Fatura e-postası",
    // Doluysa firma düzeyindeki TÜM e-postalar kullanıcılar yerine buraya
    // gider (notifyCompanyEmail, pickCompanyRecipients, üyelik, sipariş) —
    // yazım hatası firmanın e-posta akışını keser (derin denetim MU-02).
    hint: "Doluysa firmaya giden tüm e-postalar (sipariş, doğrulama, üyelik, bildirim) kullanıcılar yerine bu adrese gider.",
    max: 200,
    type: "email",
  },
  { key: "website", label: "Web sitesi", max: 300 },
  { key: "industry", label: "Sektör", max: 120 },
  { key: "iban", label: "IBAN", max: 40 },
  { key: "ibanHolder", label: "IBAN Sahibi", max: 200 },
  { key: "bankSwiftBic", label: "SWIFT / BIC", max: 20 },
  { key: "bankName", label: "Banka adı", max: 200 },
];

/** Hukuki yapı seçenekleri (API `UpdateCompanyProfileDto.companyType` ile aynı). */
const COMPANY_TYPES: { value: CompanyTypeCode; label: string }[] = [
  { value: "LIMITED", label: "Limited Şirket" },
  { value: "JOINT_STOCK", label: "Anonim Şirket" },
  { value: "SOLE_PROPRIETOR", label: "Şahıs Firması" },
  { value: "OTHER", label: "Diğer (yerel adıyla)" },
];

/**
 * Banka alanı etiketi ÜLKEYE göre (2026-09-27): IBAN kullanmayan ülkede
 * `iban` kolonu HESAP NUMARASINI taşır — "IBAN" yazmak yanıltıcıydı. Kural
 * API'den (`usesIban`, kayıtlı ülkeye göre); ülke kodunu burada değiştirmek
 * etiketi kayda dek değiştirmez.
 */
function fieldLabel(key: keyof CompanyProfilePatch, label: string, usesIban: boolean): string {
  if (usesIban) return label;
  if (key === "iban") return "Hesap No";
  if (key === "ibanHolder") return "Hesap Sahibi";
  return label;
}

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
  // Hukuki yapı (2026-09-27): yabancı firmanın GmbH/LLC'si admin'den
  // düzeltilemiyordu. "Diğer" iken yerel ad zorunlu (API aynı kuralı uygular).
  const [companyType, setCompanyType] = useState<string>("");
  const [legalFormLocal, setLegalFormLocal] = useState("");

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const f of FIELDS) {
      init[f.key] = (data[f.key as keyof AdminCompanyDetail] as string | null) ?? "";
    }
    setForm(init);
    setCompanyType(data.companyType ?? "");
    setLegalFormLocal(data.legalFormLocal ?? "");
  }, [data]);


  const usesIban = data.usesIban !== false;

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
    if (companyType && companyType !== (data.companyType ?? "")) {
      patch.companyType = companyType as CompanyTypeCode;
    }
    if (companyType === "OTHER") {
      if (legalFormLocal.trim().length < 2) {
        toast.error("Hukuki yapı \"Diğer\" iken yerel adı zorunlu (ör. GmbH, LLC)");
        return;
      }
      if (legalFormLocal.trim() !== (data.legalFormLocal ?? "").trim()) {
        patch.legalFormLocal = legalFormLocal.trim();
      }
    }
    if (Object.keys(patch).length === 0) {
      toast.info("Değişiklik yok");
      return;
    }
    // Anahtar VARLIĞINA bakılır (D-201): boşaltılan alan "" → falsy olduğu
    // için kontrol atlanıyor, istek gidip alansız "Bu alan zorunlu" dönüyordu.
    if ("name" in patch && !patch.name) {
      toast.error("Firma adı boş bırakılamaz");
      return;
    }
    if ("country" in patch && !/^[A-Za-z]{2}$/.test(patch.country ?? "")) {
      toast.error("Ülke (kod) zorunlu — 2 harf olmalı (TR, DE...)");
      return;
    }
    // Fatura e-postası (derin denetim MU-02): API @IsEmail ile reddeder; burada
    // erken uyarı + küçük harf (API aynı normalizasyonu uygular). Boş = temizle.
    if (patch.billingEmail) {
      patch.billingEmail = patch.billingEmail.toLowerCase();
      if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(patch.billingEmail)) {
        toast.error("Fatura e-postası geçerli bir e-posta adresi olmalı");
        return;
      }
    }
    // SWIFT boşluklu yazılabilir ("DEUT DE FF"); API aynı normalizasyonu uygular.
    if (patch.bankSwiftBic) patch.bankSwiftBic = patch.bankSwiftBic.replace(/\s+/g, "").toUpperCase();
    update.mutate(
      { id: companyId, patch },
      {
        onSuccess: (r) => {
          toast.success(`Güncellendi (${r.changed.length} alan)`);
          onClose();
        },
        onError: (e: unknown) => toastApiError(e),
      },
    );
  };

  return (
    <Dialog open onClose={onClose} size="2xl" aria-label="Firma bilgisi düzenle">
      <DialogTitle>Firma Bilgisi Düzenle</DialogTitle>
      <DialogBody>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label htmlFor="profile-companyType">Hukuki yapı</Label>
            <Select
              id="profile-companyType"
              aria-label="Hukuki yapı"
              value={companyType}
              onChange={(e) => setCompanyType(e.target.value)}
            >
              {!companyType ? <option value="">—</option> : null}
              {COMPANY_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </Select>
          </Field>
          {companyType === "OTHER" ? (
            <Field hint="GmbH, LLC, ООО, kooperatif…">
              <Label htmlFor="profile-legalFormLocal">Yerel hukuki yapı</Label>
              <Input
                id="profile-legalFormLocal"
                value={legalFormLocal}
                maxLength={80}
                onChange={(e) => setLegalFormLocal(e.target.value)}
              />
            </Field>
          ) : null}
          {FIELDS.map((f) => (
            <Field key={f.key} hint={f.hint}>
              <Label htmlFor={`profile-${f.key}`}>{fieldLabel(f.key, f.label, usesIban)}</Label>
              <Input
                id={`profile-${f.key}`}
                type={f.type}
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
