"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/catalyst/description-list";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Switch } from "@/components/catalyst/switch";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useCompanyProfile,
  useUpdateCompanyProfile,
} from "@/hooks/use-company-profile";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CompanyUsersSection } from "./_components/company-users-section";

export default function AyarlarPage() {
  const { user } = useCompanyAuth();
  const { data: profile, isLoading } = useCompanyProfile();
  const update = useUpdateCompanyProfile();
  const canEdit = !!user?.roles.includes("YONETICI");

  const [form, setForm] = useState({
    name: "",
    legalName: "",
    industry: "",
    website: "",
    city: "",
    district: "",
    addressLine: "",
    postalCode: "",
    aboutText: "",
    publicEnabled: false,
  });

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name ?? "",
        legalName: profile.legalName ?? "",
        industry: profile.industry ?? "",
        website: profile.website ?? "",
        city: profile.city ?? "",
        district: profile.district ?? "",
        addressLine: profile.addressLine ?? "",
        postalCode: profile.postalCode ?? "",
        aboutText: profile.aboutText ?? "",
        publicEnabled: profile.publicEnabled,
      });
    }
  }, [profile]);

  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  const handleSave = async () => {
    try {
      await update.mutateAsync(form);
      toast.success("Firma profili güncellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  if (isLoading || !profile) {
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Heading>Ayarlar</Heading>

      {/* Salt-okunur kimlik */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>Kimlik</Subheading>
        <DescriptionList className="mt-3">
          <DescriptionTerm>Firma Kodu</DescriptionTerm>
          <DescriptionDetails className="font-mono">
            {profile.supkeysId ?? "—"}
          </DescriptionDetails>
          <DescriptionTerm>Vergi No</DescriptionTerm>
          <DescriptionDetails className="font-mono">
            {profile.taxNumber ?? "—"}
          </DescriptionDetails>
          <DescriptionTerm>Üyelik</DescriptionTerm>
          <DescriptionDetails>
            <Badge color={profile.tier === "PAKET" ? "amber" : "zinc"}>
              {profile.tier === "PAKET" ? "Tek Paket" : "Standart"}
            </Badge>
          </DescriptionDetails>
          <DescriptionTerm>Doğrulama</DescriptionTerm>
          <DescriptionDetails>
            {profile.companyVerificationStatus === "VERIFIED"
              ? "Doğrulanmış"
              : "Bekliyor"}
          </DescriptionDetails>
        </DescriptionList>
      </section>

      {/* Düzenlenebilir profil */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <div className="flex items-center justify-between">
          <Subheading>Firma Profili</Subheading>
          {!canEdit ? (
            <Text className="text-xs text-zinc-400">
              Düzenleme için Yönetici rolü gerekir
            </Text>
          ) : null}
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Firma adı</Label>
              <Input
                value={form.name}
                disabled={!canEdit}
                onChange={(e) => set({ name: e.target.value })}
              />
            </Field>
            <Field>
              <Label>Yasal ünvan</Label>
              <Input
                value={form.legalName}
                disabled={!canEdit}
                onChange={(e) => set({ legalName: e.target.value })}
              />
            </Field>
            <Field>
              <Label>Sektör</Label>
              <Input
                value={form.industry}
                disabled={!canEdit}
                onChange={(e) => set({ industry: e.target.value })}
              />
            </Field>
            <Field>
              <Label>Web sitesi</Label>
              <Input
                value={form.website}
                disabled={!canEdit}
                onChange={(e) => set({ website: e.target.value })}
              />
            </Field>
            <Field>
              <Label>İl / Şehir</Label>
              <Input
                value={form.city}
                disabled={!canEdit}
                onChange={(e) => set({ city: e.target.value })}
              />
            </Field>
            <Field>
              <Label>İlçe</Label>
              <Input
                value={form.district}
                disabled={!canEdit}
                onChange={(e) => set({ district: e.target.value })}
              />
            </Field>
            <Field>
              <Label>Posta kodu</Label>
              <Input
                value={form.postalCode}
                disabled={!canEdit}
                onChange={(e) => set({ postalCode: e.target.value })}
              />
            </Field>
          </div>
          <Field>
            <Label>Açık adres</Label>
            <Textarea
              rows={2}
              value={form.addressLine}
              disabled={!canEdit}
              onChange={(e) => set({ addressLine: e.target.value })}
            />
          </Field>
          <Field>
            <Label>Hakkında</Label>
            <Textarea
              rows={3}
              value={form.aboutText}
              disabled={!canEdit}
              onChange={(e) => set({ aboutText: e.target.value })}
            />
          </Field>

          <Field className="flex items-center justify-between">
            <Label>Herkese açık profil</Label>
            <Switch
              checked={form.publicEnabled}
              disabled={!canEdit}
              onChange={(v: boolean) => set({ publicEnabled: v })}
            />
          </Field>

          {canEdit ? (
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={update.isPending}>
                {update.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Kullanıcılar & Roller */}
      <CompanyUsersSection canManage={canEdit} meId={user?.id} />
    </div>
  );
}
