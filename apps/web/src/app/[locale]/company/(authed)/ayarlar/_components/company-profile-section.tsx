"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { countryDisplayName, useTierLabel } from "@/i18n/domain";
import { CityCombobox } from "@/components/ui/city-combobox";
import {
  isKycLocked,
  useVerificationMeta,
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
  isTurkey,
  maskNationalId,
  taxIdLabelKey,
} from "@rothern/shared";
import { Lock, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { cleanPostal, isInvalidTrPostal } from "@/lib/company/postal-code";
import { toast } from "sonner";
import { formatDate } from "@/lib/format-date";
import { PRICING_HREF, VerifyFirstLink } from "@/components/company/silver-lock-card";

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
  /** Dünya şehir listesi kaydı (seçiciden; 2026-09-27). */
  cityId: number | null;
  district: string;
  /** Eyalet/bölge — yalnız TR dışında (2026-09-27: kayıttan sonra düzenlenemiyordu). */
  stateRegion: string;
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
  cityId: null,
  district: "",
  stateRegion: "",
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
    cityId: p.cityId ?? null,
    district: p.district ?? "",
    stateRegion: p.stateRegion ?? "",
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

/** Hukuki yapı etiketi `companyType.<KOD>` katalog anahtarından çizilir (Anonim / Limited / Şahıs). */
type CompanyType = NonNullable<CompanyProfile["companyType"]>;

/**
 * Kayıtta yazılan "Kurucu" unvanı — hangi dilde yazıldıysa (eski kayıtlar
 * Türkçe) okuyucunun dilinde gösterilir; elle girilmiş unvan olduğu gibi.
 */
const FOUNDER_TITLES = new Set(["Kurucu", "Founder", "Основатель"]);

// KEP: backend regex birebir (@...kep.tr).
const KEP_RE = /^[^@\s]+@[^@\s]+\.kep\.tr$/i;

export function CompanyProfileSection() {
  const t = useTranslations("web.panel.settings.companyProfileSection");
  const tTax = useTranslations("web.domain.taxId");
  const locale = useLocale() as Locale;
  const tierLabel = useTierLabel();
  const verificationMeta = useVerificationMeta();
  const { data: profile, isLoading, isError, refetch } = useCompanyProfile();
  // Banka Hesapları sahibe özel (`billing:manage`): yetkisi olmayana bağlantı
  // değil düz metin — tıklayınca "yalnız Kurucuya açık" kapısına düşüyordu (D-300).
  const canBilling = useHasCompanyPermission("billing:manage");
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

  // Kaydedilmemiş değişiklikle sayfadan çıkış uyarısı — sekme kapatma VE
  // uygulama içi bağlantı ("← Ayarlar", kenar çubuğu); ürün formuyla aynı
  // ortak kanca (arayüz testi D-309: eskiden yalnız `beforeunload`).
  useUnsavedChangesGuard(dirty);

  const kycLocked = isKycLocked(profile?.companyVerificationStatus);
  const isTR = isTurkey(profile?.country);

  // Satır içi doğrulama — backend kurallarıyla aynı (Length(2,200), KEP regex).
  const nameError =
    !kycLocked && form.name.trim().length < 2
      ? t("firmaAdiEnAz2")
      : null;
  const kepError =
    form.kepAddress.trim().length > 0 && !KEP_RE.test(form.kepAddress.trim())
      ? t("gecerliBirKepAdresiGiriniz")
      : null;
  // TR posta kodu 5 rakam (D-133) — yalnız değiştirildiyse: eski hatalı kayıt
  // başka alanın kaydını kilitlemesin.
  const postalError =
    isTR && changed.postalCode !== undefined && isInvalidTrPostal(form.postalCode)
      ? t("postaKodu5Hane")
      : null;
  const hasError = Boolean(nameError || kepError || postalError);

  // Çift tık iki istek / iki toast / iki denetim kaydı üretmesin (arayüz testi FX-00 D-132).
  const saveLock = useSubmitLock();
  const handleSave = () => saveLock.run(doSave);
  const doSave = async () => {
    if (hasError || !dirty) return;
    try {
      await update.mutateAsync(changed as CompanyProfileUpdate);
      toast.success(t("firmaBilgileriGuncellendi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("guncellenemedi")));
    }
  };

  if (isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-sm text-rose-800"
      >
        {t("firmaBilgileriYuklenemedi")}{" "}
        <button
          type="button"
          onClick={() => void refetch()}
          className="font-semibold underline underline-offset-2"
        >
          {t("yenidenDene")}
        </button>
      </div>
    );
  }
  if (isLoading || !profile) {
    return <Text className="text-sm text-zinc-500">{t("yukleniyor")}</Text>;
  }

  const verification = verificationMeta(profile.companyVerificationStatus);
  const isSole = profile.companyType === "SOLE_PROPRIETOR";
  // Vergi kimliği etiketi ülkeye göre; TR'de kısa ad, yurt dışında arayüz
  // dilinde + resmî yerel ad parantezde (INN/BIN/USCC/TRN…; katalog
  // `web.domain.taxId.label.*` — eskiden profildeki karışık dilli metin ham
  // basılıyordu). Şahıs firmasında vergi no = TCKN → kişisel veri, maskeli.
  const taxLabel = isTR
    ? isSole
      ? t("vergiNoTckn")
      : t("vergiNo")
    : tTax(`label.${taxIdLabelKey(profile.country)}` as never);
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
            <Subheading>{t("kimlik")}</Subheading>
            <Text className="mt-1 text-sm text-zinc-500">
              {t("kayitSirasindaBeyanEdilenBilgiler")}
            </Text>
          </div>
          <Lock aria-hidden className="mt-1 h-4 w-4 shrink-0 text-zinc-500" />
        </div>
        <DescriptionList className="mt-3">
          <DescriptionTerm>{t("firmaKodu")}</DescriptionTerm>
          <DescriptionDetails className="tabular-nums">
            {profile.rothernId ?? "—"}
          </DescriptionDetails>
          <DescriptionTerm>{t("kayitUlkesi")}</DescriptionTerm>
          <DescriptionDetails>{countryDisplayName(profile.country, locale)}</DescriptionDetails>
          {/* "Firma Türü" faaliyet tipiyle (Üretici/Distribütör…) karışıyordu —
              bu alan HUKUKİ yapı. */}
          <DescriptionTerm>{t("hukukiYapi")}</DescriptionTerm>
          <DescriptionDetails>
            {profile.companyType
              ? profile.companyType === "OTHER" && profile.legalFormLocal
                ? profile.legalFormLocal
                : t(`companyType.${profile.companyType as CompanyType}` as never)
              : "—"}
          </DescriptionDetails>
          <DescriptionTerm>{taxLabel}</DescriptionTerm>
          <DescriptionDetails className="tabular-nums">{taxValue}</DescriptionDetails>
          {isTR ? (
            <>
              <DescriptionTerm>{t("vergiDairesi")}</DescriptionTerm>
              <DescriptionDetails>{profile.taxOffice ?? "—"}</DescriptionDetails>
            </>
          ) : null}
          <DescriptionTerm>
            {isTR ? t("yetkiliTCKimlikNo") : t("yetkiliKimlikNo")}
          </DescriptionTerm>
          <DescriptionDetails className="tabular-nums">
            {profile.authorizedTckn ? maskNationalId(profile.authorizedTckn) : "—"}
          </DescriptionDetails>
          <DescriptionTerm>{t("yetkiliUnvani")}</DescriptionTerm>
          <DescriptionDetails>
            {profile.authorizedTitle
              ? FOUNDER_TITLES.has(profile.authorizedTitle.trim())
                ? t("kurucu")
                : profile.authorizedTitle
              : "—"}
          </DescriptionDetails>
          <DescriptionTerm>{t("uyelik")}</DescriptionTerm>
          <DescriptionDetails>
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge
                color={
                  profile.tier === "GOLD"
                    ? "amber"
                    : profile.tier === "STANDART"
                      ? "zinc"
                      : "blue"
                }
              >
                {tierLabel(profile.tier)}
              </Badge>
              {/* Üyelik bitişi / süre dolumu (arayüz testi D-029). */}
              {profile.tier !== "STANDART" && profile.membership?.endsAt ? (
                <span className="text-xs text-zinc-600">
                  {t("uyelikBitis", { date: formatDate(profile.membership.endsAt, "long", locale) })}
                </span>
              ) : profile.tier === "STANDART" && profile.membership?.expiredAt ? (
                <>
                  <span className="text-xs text-amber-800">
                    {t("uyelikSuresiDoldu", { date: formatDate(profile.membership.expiredAt, "long", locale) })}
                  </span>
                  <Link
                    href={PRICING_HREF}
                    className="text-xs font-semibold text-zinc-700 underline hover:text-zinc-900"
                  >
                    {t("uyelikYenile")}
                  </Link>
                  {/* Yenileme de paket alımıdır — doğrulama önce (webC-2). */}
                  <VerifyFirstLink className="text-xs text-zinc-700 hover:text-zinc-900" />
                </>
              ) : null}
            </span>
          </DescriptionDetails>
          <DescriptionTerm>{t("dogrulama")}</DescriptionTerm>
          <DescriptionDetails>
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge color={verification.color}>{verification.label}</Badge>
              <Link
                href="/company/ayarlar/dogrulama"
                className="text-xs font-semibold text-zinc-700 underline hover:text-zinc-900"
              >
                {t("dogrulamaBelgeleri")}
              </Link>
            </span>
          </DescriptionDetails>
        </DescriptionList>
        <p className="mt-4 text-xs text-zinc-500">
          {/* MERSİS Türkiye'ye özgü — yabancı firmaya anılmaz (D-137). */}
          {t.rich(isTR ? "kimlikBilgilerindeHataVarsa" : "kimlikBilgilerindeHataVarsaYabanci", {
            dogrulama: (c) => (
              <Link
                href="/company/ayarlar/dogrulama"
                className="font-semibold text-zinc-700 underline hover:text-zinc-900"
              >
                {c}
              </Link>
            ),
            banka: (c) =>
              canBilling ? (
                <Link
                  href="/company/ayarlar/banka-hesaplari"
                  className="font-semibold text-zinc-700 underline hover:text-zinc-900"
                >
                  {c}
                </Link>
              ) : (
                <span className="font-semibold text-zinc-700">{c}</span>
              ),
          })}
        </p>
      </section>

      {/* 2 · UNVAN — doğrulama sonrası kilitli */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Subheading>{t("unvan")}</Subheading>
            {kycLocked ? (
              <Text className="mt-1 text-sm text-zinc-500">
                {profile.companyVerificationStatus === "PENDING"
                  ? t("dogrulamaInceleniyorFirmaAdiVe")
                  : t("firmaAdiVeYasalUnvan")}
              </Text>
            ) : (
              <Text className="mt-1 text-sm text-zinc-500">
                {t("dogrulamaBasladiktanSonraFirmaAdi")}
              </Text>
            )}
          </div>
          {kycLocked ? (
            <Lock aria-hidden className="mt-1 h-4 w-4 shrink-0 text-zinc-500" />
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label>{t("firmaAdi")}</Label>
            <Input
              value={form.name}
              maxLength={200}
              disabled={kycLocked}
              invalid={Boolean(nameError)}
              onChange={(e) => set({ name: e.target.value })}
            />
            {nameError ? (
              <p className="mt-1 text-xs text-red-600">{nameError}</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500">
                {t("vitrindeVeTekliflerdeGorunenAd")}
              </p>
            )}
          </Field>
          <Field>
            <Label>{t("yasalUnvan")}</Label>
            <Input
              value={form.legalName}
              maxLength={200}
              disabled={kycLocked}
              onChange={(e) => set({ legalName: e.target.value })}
            />
            <p className="mt-1 text-xs text-zinc-500">
              {t("vergiLevhasiVeSicilKaydindaki")}
            </p>
          </Field>
          {isTR ? (
            <Field>
              <Label>{t("kepAdresi")}</Label>
              <Input
                value={form.kepAddress}
                maxLength={120}
                invalid={Boolean(kepError)}
                placeholder={t("ornekHs01KepTr")}
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
        <Subheading>{t("adres")}</Subheading>
        <Text className="mt-1 text-sm text-zinc-500">
          {t.rich("firmaMerkeziTeslimatVeFaturaAdresleri", {
            adresler: (c) => (
              <Link
                href="/company/ayarlar/adresler"
                className="font-semibold text-zinc-700 underline hover:text-zinc-900"
              >
                {c}
              </Link>
            ),
          })}
        </Text>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <Label>{isTR ? t("il") : t("sehir")}</Label>
              <CityCombobox
                country={profile.country ?? "TR"}
                value={form.city}
                onChange={({ city, cityId }) => set({ city, cityId })}
              />
            </Field>
            {/* TR'de ilçe; yurt dışında eyalet/bölge (kayıtta sorulan alan —
                eskiden burada yoktu ve yabancıya "İlçe" gösteriliyordu). */}
            {isTR ? (
              <Field>
                <Label>{t("ilce")}</Label>
                <Input
                  value={form.district}
                  maxLength={80}
                  onChange={(e) => set({ district: e.target.value })}
                />
              </Field>
            ) : (
              <Field>
                <Label>{t("eyaletBolge")}</Label>
                <Input
                  value={form.stateRegion}
                  maxLength={100}
                  onChange={(e) => set({ stateRegion: e.target.value })}
                />
              </Field>
            )}
            <Field>
              <Label>{t("postaKodu")}</Label>
              <Input
                value={form.postalCode}
                inputMode={isTR ? "numeric" : undefined}
                maxLength={isTR ? 5 : 20}
                invalid={Boolean(postalError)}
                onChange={(e) => set({ postalCode: cleanPostal(e.target.value, isTR) })}
              />
              {postalError ? (
                <p className="mt-1 text-xs text-red-600">{postalError}</p>
              ) : null}
            </Field>
          </div>
          <Field>
            <Label>{t("acikAdres")}</Label>
            <Textarea
              rows={2}
              maxLength={500}
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
        <Subheading>{t("kategoriler")}</Subheading>
        <Text className="mt-1 text-sm text-zinc-500">
          {t("talepEslesmesiOnerilerVeBildirimler")}
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
            label={t("neAlirim")}
            hint={t("satinAldiklarinizTedarikciOnerileriVe")}
            modalTitle={t("alisKategorileriniz")}
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
            label={t("neSatarim")}
            hint={t("tedarikEdebildiklerinizYeniBirAlim")}
            modalTitle={t("satisKategorileriniz")}
            accent="emerald"
          />
        </div>
      </section>

      {/* 5 · FAALİYET TİPİ — kategori "ne", bu "nasıl". Kategorilerin ALTINDA:
          önce ne yaptığını söylersin, sonra nasıl yaptığını. Kayıt ekranındaki
          sıra da bu. */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>{t("faaliyetTipi")}</Subheading>
        <Text className="mt-1 mb-3 text-sm text-zinc-500">
          {t("aliciIcinCoguZamanKategoriden")}
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
            {t("kaydedilmemisDegisikliklerVar")}
          </Text>
        ) : null}
        {dirty ? (
          <Button
            plain
            type="button"
            disabled={update.isPending}
            onClick={() => initial && setForm(initial)}
          >
            {t("vazgec")}
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={() => void handleSave()}
          disabled={!dirty || hasError || update.isPending || saveLock.locked}
        >
          {update.isPending || saveLock.locked ? t("kaydediliyor") : t("kaydet")}
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
            <Subheading>{t("herkeseAcikProfil")}</Subheading>
            <Text className="text-sm text-zinc-500">
              {t("logoKapakHakkindaVeHizmetler")}
            </Text>
          </div>
        </div>
        <span className="shrink-0 text-sm font-medium text-zinc-700">{t("duzenle")}</span>
      </Link>
    </div>
  );
}
