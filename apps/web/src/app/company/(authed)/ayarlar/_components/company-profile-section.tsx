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
import { SegmentOnlyPicker } from "@/components/categories/segment-only-picker";
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

  // Bu form YALNIZ ticari kaydı yönetir. Kimlik/IBAN (Doğrulama), sektör ve
  // web sitesi (Profilim) BİLEREK yok — payload'a da girmezler.
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    city: "",
    district: "",
    addressLine: "",
    postalCode: "",
    kepAddress: "",
    buyerCategoryIds: [] as string[],
    sellerCategoryIds: [] as string[],
  });

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name ?? "",
        legalName: profile.legalName ?? "",
        city: profile.city ?? "",
        district: profile.district ?? "",
        addressLine: profile.addressLine ?? "",
        postalCode: profile.postalCode ?? "",
        kepAddress: profile.kepAddress ?? "",
        // Yalnız segment (XX000000) kodları — eski hatalı UI alt seviye
        // yazabiliyordu; backend artık exactLevel:1 doğruladığından temizle.
        buyerCategoryIds: (profile.buyerCategoryIds ?? []).filter((id) =>
          /^\d{2}000000$/.test(id),
        ),
        sellerCategoryIds: (profile.sellerCategoryIds ?? []).filter((id) =>
          /^\d{2}000000$/.test(id),
        ),
      });
    }
  }, [profile]);

  // KYC kimlik kilidi — backend company-profile.service ile BİREBİR: inceleme
  // başladıktan (PENDING) veya onay verildikten (VERIFIED) sonra yasal ünvan
  // doğrulama dosyasının parçasıdır, değiştirilemez.
  const kycLocked =
    profile?.companyVerificationStatus === "PENDING" ||
    profile?.companyVerificationStatus === "VERIFIED";

  // KEP: backend regex birebir (@...kep.tr).
  const kepInvalid =
    form.kepAddress.trim().length > 0 &&
    !/^[^@\s]+@[^@\s]+\.kep\.tr$/i.test(form.kepAddress.trim());

  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  const handleSave = async () => {
    if (kepInvalid) {
      toast.error("Geçerli bir KEP adresi giriniz");
      return;
    }
    try {
      await update.mutateAsync(form);
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

      {/* Kimlik/IBAN alanları BURADA DEĞİL (2026-07-28): MERSİS, ticaret sicil
          ve IBAN doğrulama dosyasının parçası — tek yerden, Doğrulama
          ekranından yönetilir ve onay sonrası kilitlenir. Buraya kopyalanınca
          kilit baypas ediliyordu. Ödeme hesapları da ayrı: Banka Hesapları. */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>İletişim</Subheading>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          MERSİS, ticaret sicil numarası ve IBAN{" "}
          <Link
            href="/company/ayarlar/dogrulama"
            className="font-semibold text-zinc-700 underline hover:text-zinc-900"
          >
            Doğrulama Belgeleri
          </Link>{" "}
          sayfasından yönetilir. Sipariş tahsilatında kullanılan hesaplar için{" "}
          <Link
            href="/company/ayarlar/banka-hesaplari"
            className="font-semibold text-zinc-700 underline hover:text-zinc-900"
          >
            Banka Hesapları
          </Link>
          .
        </p>
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
                disabled={!canEdit || kycLocked}
                onChange={(e) => set({ legalName: e.target.value })}
              />
              {kycLocked ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Vergi levhası ve sicil belgeleriyle doğrulandı — değişiklik
                  için destek ile iletişime geçin.
                </p>
              ) : null}
            </Field>
            {/* Sektör ve web sitesi PROFİLİM'e taşındı — herkese açık profilde
                görünen vitrin verisi, düzenlemesi de orada olmalı. */}
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
                  <SegmentOnlyPicker
                    value={form.buyerCategoryIds}
                    onChange={(ids) => set({ buyerCategoryIds: ids })}
                    title="Alış Faaliyet Alanları"
                    description="Satın aldığınız ana kategorileri seçin — ihale eşleşmesi ve öneriler bu seçime göre yapılır."
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
                  <SegmentOnlyPicker
                    value={form.sellerCategoryIds}
                    onChange={(ids) => set({ sellerCategoryIds: ids })}
                    title="Satış Faaliyet Alanları"
                    description="Tedarik edebileceğiniz ana kategorileri seçin — açık ihale önerileri ve alıcı eşleşmesi bu seçime göre yapılır."
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
