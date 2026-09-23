"use client";

import { TIER_LABELS } from "@/lib/company/labels";
import {
  isKycLocked,
  verificationMeta,
} from "@/lib/company/verification-status";
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
import { CompanyActivityPicker } from "@/components/categories/company-activity-picker";
import { CompanyCategoryPicker } from "@/components/categories/company-category-picker";
import {
  useCompanyProfile,
  useUpdateCompanyProfile,
  type CompanyProfile,
  type CompanyProfileUpdate,
} from "@/hooks/use-company-profile";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  countryName,
  getCountryProfile,
  isTurkey,
  maskNationalId,
} from "@rothern/shared";
import { Lock, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * Ayarlar › Firma Bilgileri — TİCARİ KAYIT.
 *
 * Üç katman, üç kural (2026-09-10 denetimi):
 *  1. KİMLİK (firma kodu, ülke, hukuki yapı, vergi no/dairesi, yetkili) kayıt
 *     sırasında beyan edilir ve HİÇBİR yoldan değişmez — API DTO'sunda yok,
 *     burada salt-okunur çizilir ve nedeni yazılır.
 *  2. UNVAN (firma adı + yasal unvan) doğrulama başladıktan sonra kilitlenir
 *     (`isKycLocked`, backend BİREBİR). MERSİS/sicil/IBAN Doğrulama sayfasında.
 *  3. ADRES · FAALİYET · KATEGORİ her zaman düzenlenebilir.
 *
 * Vitrin verisi (logo, hakkında, web sitesi, sektör) Profilim'de — buradan
 * BİLEREK çıkarıldı, payload'a da girmez.
 */

const SEGMENT_RE = /^\d{2}000000$/;

type FormState = {
  name: string;
  legalName: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string;
  kepAddress: string;
  buyerCategoryIds: string[];
  sellerCategoryIds: string[];
  buyerSubCategoryIds: string[];
  sellerSubCategoryIds: string[];
  activities: string[];
};

const EMPTY_FORM: FormState = {
  name: "",
  legalName: "",
  city: "",
  district: "",
  addressLine: "",
  postalCode: "",
  kepAddress: "",
  buyerCategoryIds: [],
  sellerCategoryIds: [],
  buyerSubCategoryIds: [],
  sellerSubCategoryIds: [],
  activities: [],
};

/** Profil → form; aynı fonksiyon "kirli mi" karşılaştırmasının tabanıdır. */
function toForm(p: CompanyProfile): FormState {
  return {
    name: p.name ?? "",
    legalName: p.legalName ?? "",
    city: p.city ?? "",
    district: p.district ?? "",
    addressLine: p.addressLine ?? "",
    postalCode: p.postalCode ?? "",
    kepAddress: p.kepAddress ?? "",
    // Ana kategori yalnız segment (XX000000); eski hatalı UI alt seviye
    // yazabiliyordu, backend exactLevel:1 doğruladığından temizle.
    buyerCategoryIds: (p.buyerCategoryIds ?? []).filter((id) => SEGMENT_RE.test(id)),
    sellerCategoryIds: (p.sellerCategoryIds ?? []).filter((id) => SEGMENT_RE.test(id)),
    // Alt kategori: segment DIŞI her seviye — ana kategorinin tam tersi eksen.
    buyerSubCategoryIds: (p.buyerSubCategoryIds ?? []).filter((id) => !SEGMENT_RE.test(id)),
    sellerSubCategoryIds: (p.sellerSubCategoryIds ?? []).filter((id) => !SEGMENT_RE.test(id)),
    activities: p.activities ?? [],
  };
}

const COMPANY_TYPE_LABEL: Record<NonNullable<CompanyProfile["companyType"]>, string> = {
  JOINT_STOCK: "Anonim Şirket",
  LIMITED: "Limited Şirket",
  SOLE_PROPRIETOR: "Şahıs Firması",
};

// KEP: backend regex birebir (@...kep.tr).
const KEP_RE = /^[^@\s]+@[^@\s]+\.kep\.tr$/i;

export function CompanyProfileSection() {
  const { data: profile, isLoading, isError, refetch } = useCompanyProfile();
  const update = useUpdateCompanyProfile();

  const initial = useMemo(() => (profile ? toForm(profile) : null), [profile]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  useEffect(() => {
    if (initial) setForm(initial);
  }, [initial]);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  // Kirli alanlar — yalnız DEĞİŞEN anahtar gönderilir: kilitli alan değişmediyse
  // payload'a hiç girmez, backend'in "değişiyor mu" kilidi de tetiklenmez.
  const changed = useMemo(() => {
    if (!initial) return {} as Partial<FormState>;
    const out: Partial<FormState> = {};
    for (const k of Object.keys(form) as (keyof FormState)[]) {
      if (JSON.stringify(form[k]) !== JSON.stringify(initial[k])) {
        (out as Record<string, unknown>)[k] = form[k];
      }
    }
    return out;
  }, [form, initial]);
  const dirty = Object.keys(changed).length > 0;

  // Kaydedilmemiş değişiklikle sayfadan çıkış uyarısı (ürün formuyla aynı kalıp).
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const kycLocked = isKycLocked(profile?.companyVerificationStatus);
  const isTR = isTurkey(profile?.country);

  // Satır içi doğrulama — backend kurallarıyla aynı (Length(2,200), KEP regex).
  const nameError =
    !kycLocked && form.name.trim().length < 2
      ? "Firma adı en az 2 karakter olmalı"
      : null;
  const kepError =
    form.kepAddress.trim().length > 0 && !KEP_RE.test(form.kepAddress.trim())
      ? "Geçerli bir KEP adresi giriniz (…@…kep.tr)"
      : null;
  const hasError = Boolean(nameError || kepError);

  const handleSave = async () => {
    if (hasError || !dirty) return;
    try {
      await update.mutateAsync(changed as CompanyProfileUpdate);
      toast.success("Firma bilgileri güncellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm text-rose-800"
      >
        Firma bilgileri yüklenemedi.{" "}
        <button
          type="button"
          onClick={() => void refetch()}
          className="font-semibold underline underline-offset-2"
        >
          Yeniden dene
        </button>
      </div>
    );
  }
  if (isLoading || !profile) {
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  }

  const verification = verificationMeta(profile.companyVerificationStatus);
  const isSole = profile.companyType === "SOLE_PROPRIETOR";
  const countryProfile = getCountryProfile(profile.country);
  // Vergi kimliği etiketi ülkeye göre; TR'de kısa ad, yurt dışında ülke
  // profilinin adı (INN/BIN/USCC/TRN…). Şahıs firmasında vergi no = TCKN →
  // kişisel veri, maskeli.
  const taxLabel = isTR
    ? isSole
      ? "Vergi No (TCKN)"
      : "Vergi No"
    : (countryProfile?.taxIdLabel ?? "Vergi / Sicil No");
  const taxValue = profile.taxNumber
    ? isSole
      ? maskNationalId(profile.taxNumber)
      : profile.taxNumber
    : "—";

  return (
    <div className="space-y-6">
      {/* 1 · KİMLİK — salt-okunur */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Subheading>Kimlik</Subheading>
            <Text className="mt-1 text-sm text-zinc-500">
              Kayıt sırasında beyan edilen bilgiler firma hesabının kimliğidir;
              buradan değiştirilemez.
            </Text>
          </div>
          <Lock aria-hidden className="mt-1 h-4 w-4 shrink-0 text-zinc-500" />
        </div>
        <DescriptionList className="mt-3">
          <DescriptionTerm>Firma Kodu</DescriptionTerm>
          <DescriptionDetails className="tabular-nums">
            {profile.rothernId ?? "—"}
          </DescriptionDetails>
          <DescriptionTerm>Kayıt Ülkesi</DescriptionTerm>
          <DescriptionDetails>{countryName(profile.country)}</DescriptionDetails>
          {/* "Firma Türü" faaliyet tipiyle (Üretici/Distribütör…) karışıyordu —
              bu alan HUKUKİ yapı. */}
          <DescriptionTerm>Hukuki Yapı</DescriptionTerm>
          <DescriptionDetails>
            {profile.companyType ? COMPANY_TYPE_LABEL[profile.companyType] : "—"}
          </DescriptionDetails>
          <DescriptionTerm>{taxLabel}</DescriptionTerm>
          <DescriptionDetails className="tabular-nums">{taxValue}</DescriptionDetails>
          {isTR ? (
            <>
              <DescriptionTerm>Vergi Dairesi</DescriptionTerm>
              <DescriptionDetails>{profile.taxOffice ?? "—"}</DescriptionDetails>
            </>
          ) : null}
          <DescriptionTerm>
            {isTR ? "Yetkili T.C. Kimlik No" : "Yetkili Kimlik No"}
          </DescriptionTerm>
          <DescriptionDetails className="tabular-nums">
            {profile.authorizedTckn ? maskNationalId(profile.authorizedTckn) : "—"}
          </DescriptionDetails>
          <DescriptionTerm>Yetkili Unvanı</DescriptionTerm>
          <DescriptionDetails>{profile.authorizedTitle ?? "—"}</DescriptionDetails>
          <DescriptionTerm>Üyelik</DescriptionTerm>
          <DescriptionDetails>
            <Badge
              color={
                profile.tier === "GOLD"
                  ? "amber"
                  : profile.tier === "STANDART"
                    ? "zinc"
                    : "blue"
              }
            >
              {TIER_LABELS[profile.tier] ?? profile.tier}
            </Badge>
          </DescriptionDetails>
          <DescriptionTerm>Doğrulama</DescriptionTerm>
          <DescriptionDetails>
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge color={verification.color}>{verification.label}</Badge>
              <Link
                href="/company/ayarlar/dogrulama"
                className="text-xs font-semibold text-zinc-700 underline hover:text-zinc-900"
              >
                Doğrulama Belgeleri
              </Link>
            </span>
          </DescriptionDetails>
        </DescriptionList>
        <p className="mt-4 text-xs text-zinc-500">
          Kimlik bilgilerinde hata varsa değişiklik için destek ile iletişime
          geçin. MERSİS, ticaret sicil numarası ve IBAN{" "}
          <Link
            href="/company/ayarlar/dogrulama"
            className="font-semibold text-zinc-700 underline hover:text-zinc-900"
          >
            Doğrulama Belgeleri
          </Link>{" "}
          sayfasından; sipariş tahsilat hesapları{" "}
          <Link
            href="/company/ayarlar/banka-hesaplari"
            className="font-semibold text-zinc-700 underline hover:text-zinc-900"
          >
            Banka Hesapları
          </Link>{" "}
          sayfasından yönetilir.
        </p>
      </section>

      {/* 2 · UNVAN — doğrulama sonrası kilitli */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Subheading>Unvan</Subheading>
            {kycLocked ? (
              <Text className="mt-1 text-sm text-zinc-500">
                {profile.companyVerificationStatus === "PENDING"
                  ? "Doğrulama inceleniyor; firma adı ve yasal unvan inceleme bitene kadar kilitli."
                  : "Firma adı ve yasal unvan belgelerle doğrulandı; değişiklik (unvan tadili) için destek ile iletişime geçin."}
              </Text>
            ) : (
              <Text className="mt-1 text-sm text-zinc-500">
                Doğrulama başladıktan sonra firma adı ve yasal unvan kilitlenir.
              </Text>
            )}
          </div>
          {kycLocked ? (
            <Lock aria-hidden className="mt-1 h-4 w-4 shrink-0 text-zinc-500" />
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label>Firma adı</Label>
            <Input
              value={form.name}
              disabled={kycLocked}
              invalid={Boolean(nameError)}
              onChange={(e) => set({ name: e.target.value })}
            />
            {nameError ? (
              <p className="mt-1 text-xs text-red-600">{nameError}</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                Vitrinde ve tekliflerde görünen ad.
              </p>
            )}
          </Field>
          <Field>
            <Label>Yasal unvan</Label>
            <Input
              value={form.legalName}
              disabled={kycLocked}
              onChange={(e) => set({ legalName: e.target.value })}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Vergi levhası ve sicil kaydındaki tam unvan.
            </p>
          </Field>
          {isTR ? (
            <Field>
              <Label>KEP Adresi</Label>
              <Input
                value={form.kepAddress}
                invalid={Boolean(kepError)}
                placeholder="ornek@hs01.kep.tr"
                onChange={(e) => set({ kepAddress: e.target.value })}
              />
              {kepError ? (
                <p className="mt-1 text-xs text-red-600">{kepError}</p>
              ) : null}
            </Field>
          ) : null}
        </div>
      </section>

      {/* 3 · ADRES */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>Adres</Subheading>
        <Text className="mt-1 text-sm text-zinc-500">
          Firma merkezi. Teslimat ve fatura adresleri{" "}
          <Link
            href="/company/ayarlar/adresler"
            className="font-semibold text-zinc-700 underline hover:text-zinc-900"
          >
            Adres Yönetimi
          </Link>
          nde tutulur.
        </Text>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <Label>İl / Şehir</Label>
              <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
            </Field>
            <Field>
              <Label>İlçe</Label>
              <Input
                value={form.district}
                onChange={(e) => set({ district: e.target.value })}
              />
            </Field>
            <Field>
              <Label>Posta kodu</Label>
              <Input
                value={form.postalCode}
                onChange={(e) => set({ postalCode: e.target.value })}
              />
            </Field>
          </div>
          <Field>
            <Label>Açık adres</Label>
            <Textarea
              rows={2}
              value={form.addressLine}
              onChange={(e) => set({ addressLine: e.target.value })}
            />
          </Field>
        </div>
      </section>


      {/* 4 · KATEGORİLER — pano ve liste boş durumlarındaki "kategorileri
          düzenle" bağlantısı buraya iner (#kategoriler).

          İKİ EKSEN AYRI: kayıt sırasında tek soru sorulur ve aynı liste dört
          alana birden yazılır (`company-auth.service.ts` completeOnboarding);
          alış ile satışı gerçekten ayırmanın yeri burasıdır. */}
      <section
        id="kategoriler"
        className="scroll-mt-24 rounded-xl border border-zinc-950/10 bg-white p-5"
      >
        <Subheading>Kategoriler</Subheading>
        <Text className="mt-1 text-sm text-zinc-500">
          Talep eşleşmesi, öneriler ve bildirimler bu seçime göre yapılır. Somut
          ürün/hizmetlerinizi seçin — sektörünüz seçiminizden otomatik belirlenir.
        </Text>
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <CompanyCategoryPicker
            value={{
              mainIds: form.buyerCategoryIds,
              subIds: form.buyerSubCategoryIds,
            }}
            onChange={(v) =>
              set({ buyerCategoryIds: v.mainIds, buyerSubCategoryIds: v.subIds })
            }
            label="Ne alırım"
            hint="Satın aldıklarınız. Tedarikçi önerileri ve ürün keşfindeki “size uygun” sıralaması bu seçimden çıkar."
            modalTitle="Alış kategorileriniz"
            accent="blue"
          />
          <CompanyCategoryPicker
            value={{
              mainIds: form.sellerCategoryIds,
              subIds: form.sellerSubCategoryIds,
            }}
            onChange={(v) =>
              set({ sellerCategoryIds: v.mainIds, sellerSubCategoryIds: v.subIds })
            }
            label="Ne satarım"
            hint="Tedarik edebildikleriniz. Yeni bir alım talebi yayınlandığında size bildirim gidip gitmeyeceğini BU seçim belirler."
            modalTitle="Satış kategorileriniz"
            accent="emerald"
          />
        </div>
      </section>

      {/* 5 · FAALİYET TİPİ — kategori "ne", bu "nasıl". Kategorilerin ALTINDA:
          önce ne yaptığını söylersin, sonra nasıl yaptığını. Kayıt ekranındaki
          sıra da bu. */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>Faaliyet tipi</Subheading>
        <Text className="mt-1 mb-3 text-sm text-zinc-500">
          Alıcı için çoğu zaman kategoriden daha belirleyici: seri üretim işi
          üreticiye, stoktan acil ihtiyaç bayiye, çizimle parça fasona gider.
        </Text>
        <CompanyActivityPicker
          value={form.activities}
          onChange={(codes) => set({ activities: codes })}
        />
      </section>

      {/* KAYDET — yalnız değişiklik varsa aktif; Vazgeç forma geri döner. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty ? (
          <Text className="mr-auto text-xs text-amber-700">
            Kaydedilmemiş değişiklikler var
          </Text>
        ) : null}
        {dirty ? (
          <Button
            plain
            type="button"
            disabled={update.isPending}
            onClick={() => initial && setForm(initial)}
          >
            Vazgeç
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={handleSave}
          disabled={!dirty || hasError || update.isPending}
        >
          {update.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>

      {/* Herkese açık profil → Profilim */}
      <Link
        href="/company/sirketim/profil"
        className="flex items-center justify-between gap-4 rounded-xl border border-zinc-950/10 bg-white p-5 transition hover:bg-zinc-100"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
            <UserRound className="h-5 w-5 text-zinc-600" />
          </div>
          <div>
            <Subheading>Herkese Açık Profil</Subheading>
            <Text className="text-sm text-zinc-500">
              Logo, kapak, hakkında ve hizmetler — Profilim sayfasından
              düzenlenir.
            </Text>
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium text-zinc-700">Düzenle →</span>
      </Link>
    </div>
  );
}
