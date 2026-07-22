"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/catalyst/description-list";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import {
  useCompanyProfile,
  useUpdateCompanyProfile,
} from "@/hooks/use-company-profile";
import { extractErrorMessage } from "@/lib/tenders/error";
import { safeExternalUrl } from "@/lib/safe-url";
import { isValidIbanTr, isValidMersis, normalizeIban } from "@rothern/shared";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const TIER_LABEL: Record<string, string> = {
  STANDART: "Standart",
  BRONZ: "Bronz",
  SILVER: "Silver",
  GOLD: "Gold",
};

export function CompanyProfileSection() {
  const { user } = useCompanyAuth();
  const { data: profile, isLoading } = useCompanyProfile();
  const update = useUpdateCompanyProfile();
  const canEdit = useHasCompanyPermission("company:manage");

  const [form, setForm] = useState({
    name: "",
    legalName: "",
    industry: "",
    website: "",
    city: "",
    district: "",
    addressLine: "",
    postalCode: "",
    mersisNo: "",
    tradeRegistryNo: "",
    kepAddress: "",
    iban: "",
    ibanHolder: "",
    buyerCategoryIds: [] as string[],
    sellerCategoryIds: [] as string[],
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
        mersisNo: profile.mersisNo ?? "",
        tradeRegistryNo: profile.tradeRegistryNo ?? "",
        kepAddress: profile.kepAddress ?? "",
        iban: profile.iban ?? "",
        ibanHolder: profile.ibanHolder ?? "",
        buyerCategoryIds: profile.buyerCategoryIds ?? [],
        sellerCategoryIds: profile.sellerCategoryIds ?? [],
      });
    }
  }, [profile]);

  // IBAN/MERSİS/KEP doğrulaması — backend company-profile.service ile BİREBİR.
  // IBAN: TR strict mod-97 (isValidIbanTr), yabancı gevşek format. Eski
  // `/^TR\d{24}$/` yalnız biçim kontrolüydü (checksum'sız → backend'e uyumsuz).
  const ibanClean = normalizeIban(form.iban);
  const ibanInvalid =
    ibanClean.length > 0 &&
    (ibanClean.startsWith("TR")
      ? !isValidIbanTr(ibanClean)
      : !/^[A-Z]{2}[0-9A-Z]{8,32}$/.test(ibanClean));
  // MERSİS: boş VEYA tam 16 hane (backend @Matches /^$|^\d{16}$/).
  const mersisInvalid = !isValidMersis(form.mersisNo);
  // KEP: backend regex birebir (@...kep.tr).
  const kepInvalid =
    form.kepAddress.trim().length > 0 &&
    !/^[^@\s]+@[^@\s]+\.kep\.tr$/i.test(form.kepAddress.trim());

  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  const handleSave = async () => {
    // Kimlik alanları geçersizse backend 400'ünü beklemeden burada engelle.
    if (mersisInvalid || kepInvalid || ibanInvalid) {
      toast.error("Kurumsal kimlik alanlarında geçersiz değer var");
      return;
    }
    // Güvenlik (defense-in-depth): website'i javascript:/data: gibi şemalardan
    // arındır, şemasızı https'e normalize et. Asıl koruma render'da (safeExternalUrl).
    const normWebsite = form.website.trim()
      ? safeExternalUrl(form.website)
      : "";
    if (normWebsite === null) {
      toast.error("Geçersiz web sitesi — yalnız http/https adresleri kabul edilir");
      return;
    }
    try {
      await update.mutateAsync({ ...form, website: normWebsite });
      toast.success("Firma bilgileri güncellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  if (isLoading || !profile) {
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  }

  return (
    <div className="space-y-6">
      {/* Salt-okunur kimlik */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>Kimlik</Subheading>
        <DescriptionList className="mt-3">
          <DescriptionTerm>Firma Kodu</DescriptionTerm>
          <DescriptionDetails className="font-mono">
            {profile.rothernId ?? "—"}
          </DescriptionDetails>
          <DescriptionTerm>Yasal Ünvan</DescriptionTerm>
          <DescriptionDetails>{profile.legalName ?? "—"}</DescriptionDetails>
          <DescriptionTerm>Firma Türü</DescriptionTerm>
          <DescriptionDetails>
            {profile.companyType === "JOINT_STOCK"
              ? "Anonim Şirket"
              : profile.companyType === "LIMITED"
                ? "Limited Şirket"
                : profile.companyType === "SOLE_PROPRIETOR"
                  ? "Şahıs Firması"
                  : "—"}
          </DescriptionDetails>
          <DescriptionTerm>Vergi No</DescriptionTerm>
          <DescriptionDetails className="font-mono">
            {profile.taxNumber ?? "—"}
          </DescriptionDetails>
          <DescriptionTerm>Vergi Dairesi</DescriptionTerm>
          <DescriptionDetails>{profile.taxOffice ?? "—"}</DescriptionDetails>
          <DescriptionTerm>Yetkili TC</DescriptionTerm>
          <DescriptionDetails className="font-mono">
            {profile.authorizedTckn ?? "—"}
          </DescriptionDetails>
          <DescriptionTerm>Yetkili Ünvanı</DescriptionTerm>
          <DescriptionDetails>
            {profile.authorizedTitle ?? "—"}
          </DescriptionDetails>
          <DescriptionTerm>Üyelik</DescriptionTerm>
          <DescriptionDetails>
            <Badge color={profile.tier === "GOLD" ? "amber" : profile.tier === "STANDART" ? "zinc" : "blue"}>
              {TIER_LABEL[profile.tier] ?? profile.tier}
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

      {/* Düzenlenebilir kurumsal kimlik kalemleri (MERSİS/KEP/IBAN) */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>Kurumsal Kimlik</Subheading>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label>MERSİS No</Label>
            <Input
              value={form.mersisNo}
              maxLength={16}
              disabled={!canEdit}
              invalid={mersisInvalid}
              placeholder="16 haneli"
              onChange={(e) =>
                set({ mersisNo: e.target.value.replace(/\D/g, "") })
              }
            />
            {mersisInvalid ? (
              <p className="mt-1 text-xs text-red-600">
                MERSİS No 16 haneli olmalı
              </p>
            ) : null}
          </Field>
          <Field>
            <Label>Ticaret Sicil No</Label>
            <Input
              value={form.tradeRegistryNo}
              disabled={!canEdit}
              onChange={(e) => set({ tradeRegistryNo: e.target.value })}
            />
          </Field>
          <Field>
            <Label>KEP Adresi</Label>
            <Input
              value={form.kepAddress}
              disabled={!canEdit}
              invalid={kepInvalid}
              placeholder="ornek@hs01.kep.tr"
              onChange={(e) => set({ kepAddress: e.target.value })}
            />
            {kepInvalid ? (
              <p className="mt-1 text-xs text-red-600">
                Geçerli bir KEP adresi giriniz (…@…kep.tr)
              </p>
            ) : null}
          </Field>
          <Field>
            <Label>IBAN</Label>
            <Input
              value={form.iban}
              disabled={!canEdit}
              invalid={ibanInvalid}
              placeholder="TR.."
              onChange={(e) => set({ iban: e.target.value })}
            />
            {ibanInvalid ? (
              <p className="mt-1 text-xs text-red-600">Bu değer geçersiz</p>
            ) : null}
          </Field>
          <Field>
            <Label>IBAN Sahibi</Label>
            <Input
              value={form.ibanHolder}
              disabled={!canEdit}
              onChange={(e) => set({ ibanHolder: e.target.value })}
            />
          </Field>
        </div>
      </section>

      {/* Düzenlenebilir firma bilgileri */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <div className="flex items-center justify-between">
          <Subheading>Firma Bilgileri</Subheading>
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

          {/* Ne alırım / ne satarım */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <span className="block text-sm font-medium text-zinc-950">
                🔵 Ne alırım (alış kategorileri)
              </span>
              {canEdit ? (
                <div className="mt-2">
                  <CategorySelectorButton
                    value={form.buyerCategoryIds}
                    onChange={(ids) => set({ buyerCategoryIds: ids })}
                  />
                </div>
              ) : (
                <Text className="mt-1 text-sm text-zinc-500">
                  {form.buyerCategoryIds.length} kategori
                </Text>
              )}
            </div>
            <div>
              <span className="block text-sm font-medium text-zinc-950">
                🟢 Ne satarım (satış kategorileri)
              </span>
              {canEdit ? (
                <div className="mt-2">
                  <CategorySelectorButton
                    value={form.sellerCategoryIds}
                    onChange={(ids) => set({ sellerCategoryIds: ids })}
                  />
                </div>
              ) : (
                <Text className="mt-1 text-sm text-zinc-500">
                  {form.sellerCategoryIds.length} kategori
                </Text>
              )}
            </div>
          </div>

          {canEdit ? (
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={update.isPending}>
                {update.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Herkese açık profil → Profilim */}
      <Link
        href="/company/satinalma/profilim"
        className="flex items-center justify-between gap-4 rounded-xl border border-zinc-950/10 bg-white p-5 transition hover:bg-zinc-50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
            <UserRound className="h-5 w-5 text-zinc-600" />
          </div>
          <div>
            <Subheading>Herkese Açık Profil</Subheading>
            <Text className="text-sm text-zinc-500">
              Logo, kapak, hakkında, hizmetler ve galeri — Profilim
              sayfasından düzenlenir.
            </Text>
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium text-zinc-700">
          Düzenle →
        </span>
      </Link>
    </div>
  );
}
