"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useSupplierAuth,
  useUpdateCompanyInfo,
  type UpdateCompanyInfoPayload,
} from "@/hooks/use-supplier-auth";
import { COMPANY_TYPE_LABEL } from "@/lib/supplier/membership";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { Award, ExternalLink, Lock, Pencil, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-brand-900 break-words">{children}</dd>
    </div>
  );
}

type DraftState = {
  industry: string;
  website: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string;
};

export function CompanyInfoCard() {
  const { supplier } = useSupplierAuth();
  const updateMutation = useUpdateCompanyInfo();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftState>({
    industry: "",
    website: "",
    city: "",
    district: "",
    addressLine: "",
    postalCode: "",
  });

  if (!supplier) return null;

  const isPremium = supplier.membership === "PREMIUM";

  const startEdit = () => {
    setDraft({
      industry: supplier.industry ?? "",
      website: supplier.website ?? "",
      city: supplier.city,
      district: supplier.district,
      addressLine: supplier.addressLine,
      postalCode: supplier.postalCode ?? "",
    });
    setEditing(true);
  };

  const set = (patch: Partial<DraftState>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  // Zorunlu alanlar boş bırakılamaz (DB non-null + DTO Length kuralları).
  const canSave =
    draft.city.trim().length >= 2 &&
    draft.district.trim().length >= 2 &&
    draft.addressLine.trim().length >= 5;

  const handleSave = async () => {
    if (!canSave) return;
    const payload: UpdateCompanyInfoPayload = {
      industry: draft.industry.trim(),
      website: draft.website.trim(),
      city: draft.city.trim(),
      district: draft.district.trim(),
      addressLine: draft.addressLine.trim(),
      postalCode: draft.postalCode.trim(),
    };
    try {
      await updateMutation.mutateAsync(payload);
      toast.success("Firma bilgileri güncellendi");
      setEditing(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  return (
    <section className="card p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display font-bold text-lg text-brand-900">
            Firma Bilgileri
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            İletişim ve adres bilgilerinizi güncelleyebilirsiniz.
          </p>
        </div>
        {!editing ? (
          <Button variant="secondary" size="sm" onClick={startEdit}>
            <Pencil className="h-4 w-4" />
            Düzenle
          </Button>
        ) : null}
      </div>

      {/* Yasal kimlik — her zaman salt-okunur */}
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <InfoRow label="Firma Adı">{supplier.companyName}</InfoRow>
        <InfoRow label="Firma Tipi">
          {COMPANY_TYPE_LABEL[supplier.companyType]}
        </InfoRow>
        <InfoRow label="Vergi Numarası">
          <span className="font-mono">{supplier.taxNumber}</span>
        </InfoRow>
        <InfoRow label="Vergi Dairesi">{supplier.taxOffice}</InfoRow>
      </dl>

      {!editing ? (
        <>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="Sektör">{supplier.industry || "—"}</InfoRow>
            <InfoRow label="Web Sitesi">
              {supplier.website ? (
                <a
                  href={supplier.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                >
                  {supplier.website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                "—"
              )}
            </InfoRow>
          </dl>

          <div className="pt-5 border-t border-surface-border space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Adres
            </h3>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoRow label="İl / İlçe">
                {supplier.city} / {supplier.district}
              </InfoRow>
              {supplier.postalCode && (
                <InfoRow label="Posta Kodu">
                  <span className="font-mono">{supplier.postalCode}</span>
                </InfoRow>
              )}
              <div className="md:col-span-2">
                <InfoRow label="Açık Adres">
                  <span className="whitespace-pre-wrap">
                    {supplier.addressLine}
                  </span>
                </InfoRow>
              </div>
            </dl>
          </div>
        </>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field>
              <Label htmlFor="ci-industry">Sektör</Label>
              <Input
                id="ci-industry"
                value={draft.industry}
                onChange={(e) => set({ industry: e.target.value })}
                maxLength={100}
                placeholder="Ör. Tekstil"
              />
            </Field>
            <Field>
              <Label htmlFor="ci-website">Web Sitesi</Label>
              <Input
                id="ci-website"
                value={draft.website}
                onChange={(e) => set({ website: e.target.value })}
                maxLength={200}
                placeholder="https://ornek.com"
              />
            </Field>
          </div>

          <div className="pt-2 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Adres
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <Label htmlFor="ci-city" required>
                  İl
                </Label>
                <Input
                  id="ci-city"
                  value={draft.city}
                  onChange={(e) => set({ city: e.target.value })}
                  maxLength={50}
                />
              </Field>
              <Field>
                <Label htmlFor="ci-district" required>
                  İlçe
                </Label>
                <Input
                  id="ci-district"
                  value={draft.district}
                  onChange={(e) => set({ district: e.target.value })}
                  maxLength={50}
                />
              </Field>
              <Field>
                <Label htmlFor="ci-postal">Posta Kodu</Label>
                <Input
                  id="ci-postal"
                  value={draft.postalCode}
                  onChange={(e) => set({ postalCode: e.target.value })}
                  maxLength={20}
                />
              </Field>
              <div className="md:col-span-2">
                <Field>
                  <Label htmlFor="ci-address" required>
                    Açık Adres
                  </Label>
                  <Textarea
                    id="ci-address"
                    value={draft.addressLine}
                    onChange={(e) => set({ addressLine: e.target.value })}
                    maxLength={500}
                    rows={3}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={updateMutation.isPending}
            >
              İptal
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!canSave || updateMutation.isPending}
              loading={updateMutation.isPending}
            >
              Kaydet
            </Button>
          </div>
        </div>
      )}

      <div className="pt-5 border-t border-surface-border space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Üyelik
        </h3>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border",
            isPremium
              ? "bg-yellow-50 text-yellow-700 border-yellow-200"
              : "bg-slate-100 text-slate-600 border-slate-200",
          )}
        >
          <Award className="h-3.5 w-3.5" />
          {isPremium ? "Premium" : "Standart"} Üyelik
        </span>

        {!isPremium && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-brand-900 text-sm">
                  Premium üyelik avantajları
                </p>
                <ul className="text-xs text-slate-700 space-y-1 list-disc list-inside mt-2 marker:text-brand-300">
                  <li>Tüm açık ihalelere teklif verebilme</li>
                  <li>Tedarikçi havuzunda öne çıkma</li>
                  <li>Detaylı performans raporları</li>
                </ul>
              </div>
            </div>
            <Button variant="secondary" size="sm" disabled>
              Premium'a Yükselt (Yakında)
            </Button>
          </div>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-slate-500 pt-4 border-t border-surface-border">
        <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Ünvan, firma tipi ve vergi bilgilerini değiştirmek için{" "}
          <a
            href="mailto:support@supkeys.com"
            className="text-brand-700 hover:underline"
          >
            support@supkeys.com
          </a>{" "}
          ile iletişime geçin.
        </span>
      </p>
    </section>
  );
}
