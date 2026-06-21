"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/catalyst/description-list";
import { Field, FieldGroup, Fieldset, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text, TextLink } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import {
  useSupplierAuth,
  useUpdateCompanyInfo,
  type UpdateCompanyInfoPayload,
} from "@/hooks/use-supplier-auth";
import { COMPANY_TYPE_LABEL } from "@/lib/supplier/membership";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Award, ExternalLink, Lock, Pencil, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
    <section>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Subheading>Firma Bilgileri</Subheading>
          <Text className="mt-1">
            İletişim ve adres bilgilerinizi güncelleyebilirsiniz.
          </Text>
        </div>
        {!editing ? (
          <Button outline onClick={startEdit}>
            <Pencil data-slot="icon" />
            Düzenle
          </Button>
        ) : null}
      </div>

      {/* Yasal kimlik — her zaman salt-okunur */}
      <DescriptionList className="mt-6">
        <DescriptionTerm>Firma Adı</DescriptionTerm>
        <DescriptionDetails>{supplier.companyName}</DescriptionDetails>
        <DescriptionTerm>Firma Tipi</DescriptionTerm>
        <DescriptionDetails>
          {COMPANY_TYPE_LABEL[supplier.companyType]}
        </DescriptionDetails>
        <DescriptionTerm>Vergi Numarası</DescriptionTerm>
        <DescriptionDetails className="font-mono">
          {supplier.taxNumber}
        </DescriptionDetails>
        <DescriptionTerm>Vergi Dairesi</DescriptionTerm>
        <DescriptionDetails>{supplier.taxOffice}</DescriptionDetails>
      </DescriptionList>

      {!editing ? (
        <DescriptionList className="mt-2">
          <DescriptionTerm>Sektör</DescriptionTerm>
          <DescriptionDetails>{supplier.industry || "—"}</DescriptionDetails>
          <DescriptionTerm>Web Sitesi</DescriptionTerm>
          <DescriptionDetails>
            {supplier.website ? (
              <TextLink
                href={supplier.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
              >
                {supplier.website}
                <ExternalLink className="h-3 w-3" />
              </TextLink>
            ) : (
              "—"
            )}
          </DescriptionDetails>
          <DescriptionTerm>İl / İlçe</DescriptionTerm>
          <DescriptionDetails>
            {supplier.city} / {supplier.district}
          </DescriptionDetails>
          {supplier.postalCode ? (
            <>
              <DescriptionTerm>Posta Kodu</DescriptionTerm>
              <DescriptionDetails className="font-mono">
                {supplier.postalCode}
              </DescriptionDetails>
            </>
          ) : null}
          <DescriptionTerm>Açık Adres</DescriptionTerm>
          <DescriptionDetails className="whitespace-pre-wrap">
            {supplier.addressLine}
          </DescriptionDetails>
        </DescriptionList>
      ) : (
        <Fieldset className="mt-6">
          <FieldGroup>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Field>
                <Label>Sektör</Label>
                <Input
                  value={draft.industry}
                  onChange={(e) => set({ industry: e.target.value })}
                  maxLength={100}
                  placeholder="Ör. Tekstil"
                />
              </Field>
              <Field>
                <Label>Web Sitesi</Label>
                <Input
                  value={draft.website}
                  onChange={(e) => set({ website: e.target.value })}
                  maxLength={200}
                  placeholder="https://ornek.com"
                />
              </Field>
              <Field>
                <Label>İl *</Label>
                <Input
                  value={draft.city}
                  onChange={(e) => set({ city: e.target.value })}
                  maxLength={50}
                />
              </Field>
              <Field>
                <Label>İlçe *</Label>
                <Input
                  value={draft.district}
                  onChange={(e) => set({ district: e.target.value })}
                  maxLength={50}
                />
              </Field>
              <Field>
                <Label>Posta Kodu</Label>
                <Input
                  value={draft.postalCode}
                  onChange={(e) => set({ postalCode: e.target.value })}
                  maxLength={20}
                />
              </Field>
            </div>
            <Field>
              <Label>Açık Adres *</Label>
              <Textarea
                value={draft.addressLine}
                onChange={(e) => set({ addressLine: e.target.value })}
                maxLength={500}
                rows={3}
              />
            </Field>
          </FieldGroup>
          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              plain
              onClick={() => setEditing(false)}
              disabled={updateMutation.isPending}
            >
              İptal
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave || updateMutation.isPending}
            >
              Kaydet
            </Button>
          </div>
        </Fieldset>
      )}

      {/* Üyelik */}
      <div className="mt-8">
        <Subheading level={3}>Üyelik</Subheading>
        <div className="mt-3">
          <Badge color={isPremium ? "amber" : "zinc"}>
            <Award className="h-3.5 w-3.5" />
            {isPremium ? "Premium" : "Standart"} Üyelik
          </Badge>
        </div>

        {!isPremium ? (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-100/60 p-4">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
              <div>
                <Text className="font-semibold text-zinc-950">
                  Premium üyelik avantajları
                </Text>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-700 marker:text-zinc-300">
                  <li>Tüm açık ihalelere teklif verebilme</li>
                  <li>Tedarikçi havuzunda öne çıkma</li>
                  <li>Detaylı performans raporları</li>
                </ul>
                <div className="mt-3">
                  <Button outline disabled>
                    Premium&apos;a Yükselt (Yakında)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Text className="mt-6 flex items-start gap-1.5 text-xs">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Ünvan, firma tipi ve vergi bilgilerini değiştirmek için{" "}
          <TextLink href="mailto:support@supkeys.com">
            support@supkeys.com
          </TextLink>{" "}
          ile iletişime geçin.
        </span>
      </Text>
    </section>
  );
}
