"use client";

import { countryDisplayName } from "@/i18n/domain";
import { localizePath } from "@/i18n/href";
import { runtimeLocale } from "@/i18n/runtime";

import { Button } from "@/components/catalyst/button";
import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { CompanyActivityPicker } from "@/components/categories/company-activity-picker";
import { CompanyCategoryPicker } from "@/components/categories/company-category-picker";
import { RothernLogo } from "@/components/brand/logo";
import { useRoots } from "@/hooks/use-categories";
import { useUpdateMe } from "@/hooks/use-company-account";
import {
  useCompanyLogout,
  useCompanyMe,
  useCompleteOnboarding,
  useViesCheck,
} from "@/hooks/use-company-auth";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { clearInvitePrefill, readInvitePrefill } from "@/lib/company-auth/invite-prefill";
import {
  clearOnboardingDraft,
  saveOnboardingDraft,
  takeOnboardingDraft,
} from "@/lib/company-auth/onboarding-draft";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  MAX_COMPANY_MAIN_CATEGORIES,
  TURKEY_LOCATIONS,
  isValidTaxIdForCountry,
  isValidTckn,
  EU_VAT_COUNTRIES,
  foldSearchText,
  isRegistrationOpen,
  normalizeTaxId,
  parsePhone,
  registrationCountries,
  taxIdLabelKey,
} from "@rothern/shared";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { CityCombobox } from "@/components/ui/city-combobox";
import { Check } from "lucide-react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { toast } from "sonner";

const COMPANY_TYPE_VALUES = ["LIMITED", "JOINT_STOCK", "SOLE_PROPRIETOR", "OTHER"] as const;
/** Kayda açık ülke kodları (kapalı liste hariç — `REGISTRATION_BLOCKED`). */
const REGISTRATION_CODES = registrationCountries().map((c) => c.code);

/**
 * Ülke alanının BAŞLANGIÇ değeri (2026-09-27): eskiden her kayıt "TR" ile
 * açılıyordu — Rus kullanıcı fark etmeden Türk firması olarak kaydoluyor, VKN
 * kuralına takılıyordu. Sıra: kayıtta girilen telefonun ülkesi (kayda açıksa) →
 * arayüz dili (tr → TR, ru → RU) → boş (İngilizce arayüz birçok ülkeden
 * kullanılır; ülke bilinçli seçilmeden form ilerlemez).
 */
export function initialOnboardingCountry(phone: string | null | undefined, locale: string): string {
  if (phone?.trim().startsWith("+")) {
    const { code } = parsePhone(phone);
    if (isRegistrationOpen(code)) return code;
  }
  if (locale === "tr") return "TR";
  if (locale === "ru") return "RU";
  return "";
}

/** Posta kodu: TR'de 5 rakam; diğer ülkelerde harf/rakam/boşluk/tire (SW1A 1AA, 1012 AB, K1A 0B1). */
function cleanPostal(v: string, tr: boolean): string {
  return tr ? v.replace(/\D/g, "") : v.toUpperCase().replace(/[^A-Z0-9 -]/g, "");
}

/**
 * Ön doldurulan (davet/AI keşfi) şehri Türkiye il listesine eşler — Türkçe
 * harf ve büyük/küçük harf duyarsız ("Istanbul", "ISTANBUL" → "İstanbul").
 * Eşleşmezse BOŞ döner: listede olmayan değer İl'i "Seçin…" gösterirken
 * İlçe'yi boş listeyle açık bırakıyordu (arayüz testi D-344).
 */
export function matchTurkeyProvince(raw: string | null | undefined): string {
  const key = foldSearchText(raw ?? "");
  if (!key) return "";
  return TURKEY_LOCATIONS.find((l) => foldSearchText(l.il) === key)?.il ?? "";
}

/**
 * Özet adımındaki adres satırı ülkeye göre (arayüz testi D-091): Türkiye'de
 * "mahalle, açık adres, posta kodu ilçe / il"; yurt dışında uluslararası
 * kalıp "açık adres, posta kodu şehir, eyalet" (Marienplatz 1, 80331 Munich,
 * Bayern). Eskiden TR kalıbı her ülkeye uygulanıyor ("Bayern / Munich"),
 * posta kodu hiç basılmıyordu.
 */
export function formatOnboardingAddress(a: {
  isTR: boolean;
  addressLine: string;
  neighborhood?: string;
  postalCode?: string;
  district?: string;
  city?: string;
  stateRegion?: string;
}): string {
  const clean = (v?: string) => (v ?? "").trim();
  const join = (parts: string[], sep: string) => parts.filter(Boolean).join(sep);
  if (a.isTR) {
    const locality = join([clean(a.postalCode), join([clean(a.district), clean(a.city)], " / ")], " ");
    return join([clean(a.neighborhood), clean(a.addressLine), locality], ", ");
  }
  return join(
    [clean(a.addressLine), join([clean(a.postalCode), clean(a.city)], " "), clean(a.stateRegion)],
    ", ",
  );
}

export function OnboardingClient() {
  const t = useTranslations("web.auth.onboarding");
  const tc = useTranslations("web.auth.common");
  const tTax = useTranslations("web.domain.taxId");
  const locale = useLocale();
  const b = (chunks: ReactNode) => <strong>{chunks}</strong>;
  const authUser = useCompanyAuthStore((s) => s.user);
  const userId = authUser?.id ?? "";
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  // Hata kendi kartında (aşağıda) → global toast yok (tek hata, tek mesaj).
  const me = useCompanyMe(!!authUser, { skipErrorToast: true });
  const complete = useCompleteOnboarding();
  const vies = useViesCheck();
  // Çift tık iki VIES isteği / iki denetim kaydı üretmesin (arayüz testi FX-00 D-350).
  const viesLock = useSubmitLock();
  const finishLock = useSubmitLock();
  const roots = useRoots();

  const STEPS = [t("step1"), t("step2"), t("step3")];
  const companyTypes = COMPANY_TYPE_VALUES.map((value) => ({ value, label: t(`companyType.${value}`) }));
  /* Kayıt kapısı (2026-09-27): tüm ülkeler, kapalı liste hariç (ABD + toprakları,
     kapsamlı yaptırım ülkeleri) — kaydolamayacağı ülke seçicide HİÇ çıkmaz,
     formun sonunda reddedilmez. Seçici aranabilir (`CountryCombobox`). */

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    // Başlangıç ülkesi `/me` gelince kurulur (bkz. initialOnboardingCountry).
    country: "",
    legalName: "",
    companyType: "LIMITED",
    legalFormLocal: "",
    taxNumber: "",
    taxOffice: "",
    website: "",
    city: "",
    /** Dünya şehir listesi kaydı (TR dışı seçiciden; 2026-09-27). */
    cityId: null as number | null,
    district: "",
    stateRegion: "",
    neighborhood: "",
    postalCode: "",
    addressLine: "",
    deliverySameAsBilling: true,
    deliveryCity: "",
    deliveryCityId: null as number | null,
    deliveryStateRegion: "",
    deliveryDistrict: "",
    deliveryNeighborhood: "",
    deliveryPostalCode: "",
    deliveryAddressLine: "",
    authorizedTckn: "",
    mainCategoryIds: [] as string[],
    subCategoryIds: [] as string[],
    activities: [] as string[],
    declarationAccepted: false,
  });
  const isTR = f.country === "TR";
  const isSole = f.companyType === "SOLE_PROPRIETOR";
  // Kimlik doğrulama — backend company-auth.service.completeOnboarding ile BİREBİR
  // (isValidTaxIdForCountry: TR strict VKN(10)/TCKN(11) checksum, yabancı gevşek;
  // TR yetkili için isValidTckn). Eski "length>=4 / ===11" gevşek gate'i kapatır.
  const taxNumberValid = isValidTaxIdForCountry(f.taxNumber, f.country, isSole);
  const tcknValid = isTR ? isValidTckn(f.authorizedTckn) : true;
  const set = (k: keyof typeof f) => (v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const [countryReady, setCountryReady] = useState(false);
  useEffect(() => {
    if (countryReady || !me.data) return;
    const initial = initialOnboardingCountry(me.data.user.phone, locale);
    // Davetle gelen firma (2026-09-27, Faz 3): AI keşfinin bulduğu kendi
    // firma bilgisi formu başlatır — ad, site, ülke, şehir; kullanıcı düzeltebilir.
    const invite = readInvitePrefill();
    const inviteCountry = invite?.country && isRegistrationOpen(invite.country) ? invite.country.toUpperCase() : null;
    // Dil değişiminden önce saklanan taslak (sihirbaz yeniden bağlandı) geri
    // gelir — yalnız bilinen alanlar, aynı türdeyse (onboarding-draft.ts).
    const draft = takeOnboardingDraft(userId);
    if (draft) setStep(Math.min(Math.max(Math.trunc(draft.step), 0), 2));
    setF((prev) => {
      const s = draft ? mergeDraft(prev, draft.f) : prev;
      const country = s.country || inviteCountry || initial;
      // TR'de şehir il listesinden seçilir: ön doldurulan ad listeye eşlenir,
      // eşleşmezse boş kalır (D-344).
      const prefillCity = country === "TR" ? matchTurkeyProvince(invite?.city) : invite?.city || "";
      return {
        ...s,
        country,
        legalName: s.legalName || invite?.companyName || "",
        website: s.website || invite?.website || "",
        city: s.city || prefillCity,
      };
    });
    setCountryReady(true);
  }, [countryReady, me.data, locale, userId]);
  /**
   * Ana ve alt kategori TEK yazmada güncellenir: seçici ikisini birlikte
   * üretiyor (segment, seçilen yapraklardan türetiliyor) ve iki ayrı `set`
   * çağrısı ara bir turda tutarsız çift bırakırdı.
   */
  const setKategoriler = (v: { mainIds: string[]; subIds: string[] }) =>
    setF((s) => ({ ...s, mainCategoryIds: v.mainIds, subCategoryIds: v.subIds }));

  useEffect(() => {
    if (isHydrated && !authUser && typeof window !== "undefined") {
      window.location.href = localizePath("/company/login", runtimeLocale());
    }
  }, [isHydrated, authUser]);
  // Zaten tamamlanmışsa panele dön.
  useEffect(() => {
    if (me.data?.company.onboardingCompletedAt) {
      window.location.href = localizePath("/company", runtimeLocale());
    }
  }, [me.data]);

  const ilceler = useMemo(
    () => TURKEY_LOCATIONS.find((l) => l.il === f.city)?.ilceler ?? [],
    [f.city],
  );
  const deliveryIlceler = useMemo(
    () => TURKEY_LOCATIONS.find((l) => l.il === f.deliveryCity)?.ilceler ?? [],
    [f.deliveryCity],
  );

  const taxKey = taxIdLabelKey(f.country);
  const step1Valid =
    !!f.country &&
    f.legalName.trim().length >= 2 &&
    (f.companyType !== "OTHER" || f.legalFormLocal.trim().length >= 2) &&
    taxNumberValid &&
    // TR'de vergi dairesi zorunlu (backend @400) — gate'e ekli.
    (isTR ? f.taxOffice.trim().length > 0 : true) &&
    f.city.trim().length >= 2 &&
    (isTR ? !!f.district : true) &&
    f.addressLine.trim().length >= 5 &&
    // Ayrı teslimat adresi seçiliyse il + açık adres zorunlu (BE @Length ile
    // uyumlu — boş bırakılırsa 400 yerine burada engelle).
    (f.deliverySameAsBilling ||
      (f.deliveryCity.trim().length >= 2 &&
        f.deliveryAddressLine.trim().length >= 5));
  // Tavan shared'den: DTO (`onboarding.dto.ts`) ve servis
  // (`category-selection.helper.ts`) AYNI sabiti okuyor. Elle yazılan "3"
  // burada duruyordu ve ayarlar ekranıyla sessizce ayrışmıştı.
  const step2Valid =
    tcknValid &&
    f.mainCategoryIds.length >= 1 &&
    f.mainCategoryIds.length <= MAX_COMPANY_MAIN_CATEGORIES;

  const isEuVat = EU_VAT_COUNTRIES.has(f.country);
  const checkVies = () => viesLock.run(doCheckVies);
  const doCheckVies = async () => {
    try {
      const r = await vies.mutateAsync({
        countryCode: f.country,
        vatNumber: f.taxNumber,
      });
      if (r.unavailable) {
        toast.error(t("viesUnavailable"));
        return;
      }
      if (r.valid) {
        toast.success(t("viesValid"));
        if (r.name && !f.legalName.trim()) set("legalName")(r.name);
      } else {
        toast.error(t("viesInvalid"));
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, t("viesFailed")));
    }
  };

  const submit = async () => {
    setError(null);
    try {
      await complete.mutateAsync({
        legalName: f.legalName.trim(),
        companyType: f.companyType,
        ...(f.companyType === "OTHER" ? { legalFormLocal: f.legalFormLocal.trim() } : {}),
        country: f.country,
        taxNumber: normalizeTaxId(f.taxNumber, f.country),
        taxOffice: f.taxOffice.trim() || undefined,
        website: f.website.trim() || undefined,
        city: f.city.trim(),
        ...(f.cityId != null ? { cityId: f.cityId } : {}),
        district: f.district.trim() || undefined,
        stateRegion: f.stateRegion.trim() || undefined,
        // Mahalle yalnız Türkiye'de sorulur (API açık adres satırına katar).
        neighborhood: (isTR && f.neighborhood.trim()) || undefined,
        postalCode: f.postalCode.trim() || undefined,
        addressLine: f.addressLine.trim(),
        deliverySameAsBilling: f.deliverySameAsBilling,
        ...(f.deliverySameAsBilling
          ? {}
          : {
              deliveryCity: f.deliveryCity.trim(),
              ...(f.deliveryCityId != null ? { deliveryCityId: f.deliveryCityId } : {}),
              deliveryStateRegion: f.deliveryStateRegion.trim() || undefined,
              deliveryDistrict: f.deliveryDistrict.trim() || undefined,
              deliveryNeighborhood: (isTR && f.deliveryNeighborhood.trim()) || undefined,
              deliveryPostalCode: f.deliveryPostalCode.trim() || undefined,
              deliveryAddressLine: f.deliveryAddressLine.trim(),
            }),
        authorizedTckn: f.authorizedTckn.trim() || undefined,
        mainCategoryIds: f.mainCategoryIds,
        subCategoryIds: f.subCategoryIds,
        activities: f.activities,
        declarationAccepted: f.declarationAccepted,
      });
      toast.success(t("completed"));
      clearInvitePrefill();
      clearOnboardingDraft(userId);
      window.location.href = localizePath("/company", runtimeLocale());
    } catch (err) {
      setError(extractErrorMessage(err, t("saveFailed")));
    }
  };

  if (!isHydrated || !authUser || me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        {t("loading")}
      </div>
    );
  }

  // /me düştüyse (5xx/ağ) boş alanlı sihirbaz AÇILMAZ — kurucu mu, onboarding
  // zaten bitti mi bilinmiyor; özet "Yetkili: undefined undefined" basıyordu
  // (arayüz testi D-347). Hata kartı + tekrar dene + çıkış.
  if (me.isError && !me.data) {
    return (
      <OnboardingShell>
        <div role="alert" className="card p-6 text-center">
          <h1 className="text-lg font-semibold text-zinc-900">{t("meFailedTitle")}</h1>
          <p className="mt-2 text-sm text-zinc-600">{t("meFailedBody")}</p>
          <div className="mt-5 flex justify-center">
            <Button onClick={() => void me.refetch()} disabled={me.isFetching}>
              {t("retry")}
            </Button>
          </div>
        </div>
      </OnboardingShell>
    );
  }

  const user = me.data?.user;

  // Derin denetim LU-31: şirket bilgilerini YALNIZ Kurucu tamamlar (API 403).
  // Kurucu bitirmeden eklenen üye (ör. destek ekibinin admin panelinden
  // eklediği) formu baştan sona doldurup gönderimde 403 alıyor, panele hiç
  // giremiyordu → formu değil bilgi ekranını görür.
  if (user?.isOwner === false && !me.data?.company.onboardingCompletedAt) {
    return <OwnerMustCompleteNotice />;
  }

  return (
    <OnboardingShell onBeforeLocaleSwitch={() => saveOnboardingDraft(userId, { step, f })}>
      <h1 className="text-2xl font-bold text-zinc-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-zinc-500">{t("lead")}</p>

      {/* Adım göstergesi */}
      <ol className="mt-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className="flex flex-1 items-center gap-2"
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i < step
                  ? "bg-zinc-900 text-white"
                  : i === step
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`text-xs ${i === step ? "font-semibold text-zinc-900" : "text-zinc-500"}`}>
              {s}
            </span>
            {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-zinc-200" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-6 card p-5">
        {step === 0 ? (
          <div className="space-y-3">
            <Field>
              <Label>{t("legalName")}</Label>
              <Input value={f.legalName} maxLength={150} onChange={(e) => set("legalName")(e.target.value)} />
            </Field>
            <Field>
              <Label>{t("country")}</Label>
              <CountryCombobox
                value={f.country}
                codes={REGISTRATION_CODES}
                ariaLabel={t("country")}
                onChange={(code) =>
                  // Ülke değişince ülkeye-özel alanları temizle (TR il/ilçe/vergi
                  // dairesi ↔ yabancı şehir/eyalet karışmasın). Aynı ülkeyi
                  // yeniden seçmek hiçbir şeyi silmez; vergi no da ülkeye özgü
                  // biçimde olduğundan ülke değişince temizlenir (D-065).
                  setF((s) => code === s.country ? s : ({
                    ...s,
                    country: code,
                    taxNumber: "",
                    city: "",
                    cityId: null,
                    district: "",
                    taxOffice: "",
                    stateRegion: "",
                    postalCode: "",
                    deliveryCity: "",
                    deliveryCityId: null,
                    deliveryDistrict: "",
                    deliveryStateRegion: "",
                    deliveryPostalCode: "",
                  }))
                }
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Field>
                  <Label>{t("companyTypeLabel")}</Label>
                  <Select value={f.companyType} onChange={(e) => set("companyType")(e.target.value)}>
                    {companyTypes.map((ct) => (
                      <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                  </Select>
                </Field>
                {/* Ayrı Field: aynı Field içinde Headless ikinci kontrolü de
                    "Firma Türü" etiketine bağlıyordu (D-353). */}
                {f.companyType === "OTHER" ? (
                  <Field className="mt-2">
                    <Label className="sr-only">{t("legalFormLocal")}</Label>
                    <Input
                      value={f.legalFormLocal}
                      maxLength={80}
                      placeholder={t("legalFormLocalPlaceholder")}
                      onChange={(e) => set("legalFormLocal")(e.target.value)}
                    />
                  </Field>
                ) : null}
              </div>
              <Field>
                <Label>{isTR ? t("taxTr") : `${tTax(`label.${taxKey}` as never)} *`}</Label>
                <Input
                  value={f.taxNumber}
                  maxLength={40}
                  onChange={(e) =>
                    set("taxNumber")(
                      isTR ? e.target.value.replace(/\D/g, "") : e.target.value,
                    )
                  }
                />
                {/* Biçim ipucu arayüz dilinde, ülkenin resmî adıyla (2026-09-27;
                    eskiden profildeki "БИН (BIN) — 12 hane" metni İngilizce
                    ekranda olduğu gibi basılıyordu). */}
                {f.country && !isTR ? (
                  <p className="mt-1 text-xs text-zinc-500">{tTax(`hint.${taxKey}` as never)}</p>
                ) : null}
                {f.taxNumber.trim() && !taxNumberValid ? (
                  <p className="mt-1 text-xs text-red-600">
                    {isTR
                      ? isSole
                        ? t("tcknInvalid")
                        : t("vknInvalid")
                      : t("taxForeignInvalid")}
                  </p>
                ) : null}
                {isEuVat ? (
                  <button
                    type="button"
                    disabled={f.taxNumber.trim().length < 4 || vies.isPending || viesLock.locked}
                    onClick={() => void checkVies()}
                    className="mt-1 text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {vies.isPending ? t("viesChecking") : t("viesCheck")}
                  </button>
                ) : null}
              </Field>
            </div>
            {isTR ? (
              <Field>
                <Label>{t("taxOffice")}</Label>
                <Input value={f.taxOffice} maxLength={60} onChange={(e) => set("taxOffice")(e.target.value)} />
              </Field>
            ) : null}
            {/* WEB SİTESİ — ZORUNLU DEĞİL, TEŞVİKLİ (2026-09-15, kullanıcı
                kararı). Zorunlu tutmak, sitesi olmayan ama 20 ürün yükleyecek
                imalatçıyı kapıda elerdi — bizim için o firma sitesi olup hiç
                ürün eklemeyenden daha değerli. Bedel kapıda değil sonuçta:
                giren firmanın profilini AI dolduruyor, girmeyen elle yazana
                kadar arama eşiğini geçemiyor. */}
            <Field>
              <Label>{t("website")}</Label>
              <Input
                value={f.website}
                maxLength={200}
                placeholder={t("websitePlaceholder")}
                onChange={(e) => set("website")(e.target.value)}
              />
              <p className="mt-1 text-xs text-zinc-500">{t.rich("websiteHint", { b })}</p>
            </Field>
            {isTR ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <Label>{t("province")}</Label>
                  <Select value={f.city} onChange={(e) => { set("city")(e.target.value); set("district")(""); }}>
                    <option value="">{t("select")}</option>
                    {TURKEY_LOCATIONS.map((l) => (
                      <option key={l.il} value={l.il}>{l.il}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>{t("district")}</Label>
                  <Select value={f.district} disabled={ilceler.length === 0} onChange={(e) => set("district")(e.target.value)}>
                    <option value="">{t("select")}</option>
                    {ilceler.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <Label>{t("city")}</Label>
                  <CityCombobox
                    country={f.country}
                    value={f.city}
                    ariaLabel={t("city")}
                    onChange={({ city, cityId }) => setF((s) => ({ ...s, city, cityId }))}
                  />
                </Field>
                <Field>
                  <Label>{t("stateRegion")}</Label>
                  <Input value={f.stateRegion} maxLength={100} onChange={(e) => set("stateRegion")(e.target.value)} />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Mahalle Türkiye'ye özgü adres parçası — yurt dışında sorulmaz. */}
              {isTR ? (
                <Field>
                  <Label>{t("neighborhood")}</Label>
                  <Input value={f.neighborhood} maxLength={100} onChange={(e) => set("neighborhood")(e.target.value)} />
                </Field>
              ) : null}
              <Field>
                <Label>{t("postalCode")}</Label>
                <Input value={f.postalCode} maxLength={12} onChange={(e) => set("postalCode")(cleanPostal(e.target.value, isTR))} />
              </Field>
            </div>
            <Field>
              <Label>{t("addressLine")}</Label>
              <Input value={f.addressLine} maxLength={500} onChange={(e) => set("addressLine")(e.target.value)} />
            </Field>
            {/* CheckboxField + Label: metne tıklamak da kutuyu değiştirir (O-120). */}
            <CheckboxField>
              <Checkbox checked={f.deliverySameAsBilling} onChange={(v) => set("deliverySameAsBilling")(v)} />
              <Label className="cursor-pointer">{t("sameAsBilling")}</Label>
            </CheckboxField>
            {!f.deliverySameAsBilling && (
              <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
                <p className="text-sm font-medium text-zinc-700">{t("deliveryAddress")}</p>
                {/* Fatura adres bloğunun AYNASI (2026-09-27): TR'de il/ilçe
                    seçici, yurtdışında dünya şehir listesi + eyalet/bölge —
                    düz metin şehir `cityId` taşımıyor, eyalet hiç sorulmuyordu. */}
                {isTR ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field>
                      <Label>{t("deliveryProvince")}</Label>
                      <Select
                        value={f.deliveryCity}
                        onChange={(e) => setF((s) => ({ ...s, deliveryCity: e.target.value, deliveryDistrict: "" }))}
                      >
                        <option value="">{t("select")}</option>
                        {TURKEY_LOCATIONS.map((l) => (
                          <option key={l.il} value={l.il}>{l.il}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label>{t("deliveryDistrict")}</Label>
                      <Select
                        value={f.deliveryDistrict}
                        disabled={deliveryIlceler.length === 0}
                        onChange={(e) => set("deliveryDistrict")(e.target.value)}
                      >
                        <option value="">{t("select")}</option>
                        {deliveryIlceler.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field>
                      <Label>{t("deliveryCity")}</Label>
                      <CityCombobox
                        country={f.country}
                        value={f.deliveryCity}
                        ariaLabel={t("deliveryCity")}
                        onChange={({ city, cityId }) =>
                          setF((s) => ({ ...s, deliveryCity: city, deliveryCityId: cityId }))
                        }
                      />
                    </Field>
                    <Field>
                      <Label>{t("stateRegion")}</Label>
                      <Input
                        value={f.deliveryStateRegion}
                        maxLength={100}
                        onChange={(e) => set("deliveryStateRegion")(e.target.value)}
                      />
                    </Field>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {isTR ? (
                    <Field>
                      <Label>{t("neighborhood")}</Label>
                      <Input value={f.deliveryNeighborhood} maxLength={100} onChange={(e) => set("deliveryNeighborhood")(e.target.value)} />
                    </Field>
                  ) : null}
                  <Field>
                    <Label>{t("postalCode")}</Label>
                    <Input value={f.deliveryPostalCode} maxLength={12} onChange={(e) => set("deliveryPostalCode")(cleanPostal(e.target.value, isTR))} />
                  </Field>
                </div>
                <Field>
                  <Label>{t("addressLine")}</Label>
                  <Input value={f.deliveryAddressLine} maxLength={500} onChange={(e) => set("deliveryAddressLine")(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <Label>{tc("firstName")}</Label>
                <Input value={user?.firstName ?? ""} readOnly disabled />
              </Field>
              <Field>
                <Label>{tc("lastName")}</Label>
                <Input value={user?.lastName ?? ""} readOnly disabled />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <Label>{isTR ? t("tcknLabel") : t("foreignIdLabel")}</Label>
                <Input
                  value={f.authorizedTckn}
                  maxLength={isTR ? 11 : 30}
                  onChange={(e) =>
                    set("authorizedTckn")(
                      isTR ? e.target.value.replace(/\D/g, "") : e.target.value,
                    )
                  }
                />
                {isTR && f.authorizedTckn.trim() && !tcknValid ? (
                  <p className="mt-1 text-xs text-red-600">{t("tcknInvalidPerson")}</p>
                ) : null}
              </Field>
              <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                {t.rich("founderBox", { b })}
              </div>
            </div>
            <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
              {/* Grup etiketi — tek input'a bağlı değil, bu yüzden Headless
                  <Label> (Field gerektirir) yerine düz element. */}
              <div>
                <p
                  id="sector-label"
                  className="text-base/6 font-medium text-zinc-950 select-none sm:text-sm/6"
                >
                  {t("sectorQuestion")} <span className="text-zinc-500">*</span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{t("sectorHint")}</p>
              </div>
              {roots.isError ? (
                <p className="text-xs text-rose-600">
                  {t("sectorsFailed")}{" "}
                  <button
                    type="button"
                    onClick={() => roots.refetch()}
                    className="font-semibold underline"
                  >
                    {t("retry")}
                  </button>
                </p>
              ) : (
                <CompanyCategoryPicker
                  value={{
                    mainIds: f.mainCategoryIds,
                    subIds: f.subCategoryIds,
                  }}
                  onChange={setKategoriler}
                  label={t("pickerLabel")}
                  hint={t("pickerHint")}
                  modalTitle={t("pickerLabel")}
                />
              )}

              <CompanyActivityPicker
                value={f.activities}
                onChange={set("activities")}
              />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <Summary label={t("sumLegalName")} value={f.legalName} />
              <Summary
                label={t("sumCompanyType")}
                value={
                  f.companyType === "OTHER" && f.legalFormLocal.trim()
                    ? f.legalFormLocal.trim()
                    : companyTypes.find((ct) => ct.value === f.companyType)?.label
                }
              />
              {/* Yabancıya "Vergi No / TCKN" ve boş "Vergi dairesi" satırı
                  gösterilmez — form etiketiyle aynı dil (2026-09-27). */}
              <Summary
                label={isTR ? t("sumTax") : tTax(`label.${taxKey}` as never)}
                value={normalizeTaxId(f.taxNumber, f.country)}
              />
              {isTR ? <Summary label={t("sumTaxOffice")} value={f.taxOffice} /> : null}
              <Summary
                label={t("sumAddress")}
                value={formatOnboardingAddress({
                  isTR,
                  addressLine: f.addressLine,
                  neighborhood: f.neighborhood,
                  postalCode: f.postalCode,
                  district: f.district,
                  city: f.city,
                  stateRegion: f.stateRegion,
                })}
              />
              <Summary
                label={t("sumCountry")}
                value={f.country ? countryDisplayName(f.country, locale) : null}
              />
              <Summary
                label={t("sumAuthorized")}
                value={[user?.firstName, user?.lastName].filter(Boolean).join(" ")}
              />
              {/* Satınalma koltuğu BURADA YAZILMAZ: talep açmak Gold paket
                  ister, yeni firma STANDART doğar. Eskiden "Kurucu · satınalma
                  koltuğu · satış koltuğu" yazıyordu — kullanılamayan bir yetkiyi
                  vaat ediyor, üstelik ücretsiz paketin 2 koltuğunun ikisini de
                  kurucuya yüklüyordu (ilk çalışan davetinde "koltuk dolu"). */}
              <Summary label={t("sumRole")} value={t("sumRoleValue")} />
              <Summary
                label={t("sumSectors")}
                value={(roots.data ?? [])
                  .filter((c) => f.mainCategoryIds.includes(c.id))
                  .map((c) => c.nameTr)
                  .join(", ")}
              />
            </dl>
            {/* Sırada ne olduğunu ÜLKEDEN BAĞIMSIZ olarak söyler. Kayıt için
                admin onayı GEREKMEZ — hesap hemen çalışır; doğrulama yalnız
                para taahhüdü doğuran işlemlerin (talep yayınlama, teklif
                gönderme, kazandırma) kapısıdır. Kullanıcı bunu baştan bilsin
                ki "kaydoldum ama teklif veremiyorum" sürprizi yaşamasın. */}
            <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-sm text-blue-900">
              <p className="font-medium">{t("nextTitle")}</p>
              <p className="mt-1">{t.rich("nextBody", { b })}</p>
            </div>
            <CheckboxField className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
              <Checkbox aria-label={t("declarationAria")} checked={f.declarationAccepted} onChange={(v) => set("declarationAccepted")(v)} />
              <Label className="cursor-pointer">{t("declaration")}</Label>
            </CheckboxField>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex justify-between">
          <Button plain disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            {t("back")}
          </Button>
          {step < 2 ? (
            <Button
              disabled={(step === 0 && !step1Valid) || (step === 1 && !step2Valid)}
              onClick={() => setStep((s) => s + 1)}
            >
              {t("next")}
            </Button>
          ) : (
            <Button disabled={!f.declarationAccepted || complete.isPending || finishLock.locked} onClick={() => void finishLock.run(submit)}>
              {complete.isPending || finishLock.locked ? t("saving") : t("finish")}
            </Button>
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}

/**
 * Sihirbazın üst çubuğu (arayüz testi O-122): logo, dil seçici ve "Oturumu
 * kapat". Eskiden yalın kapsayıcıydı — ortak bilgisayarda ya da yanlış
 * hesapla kaydolan kurucu onboarding bitene kadar çıkamıyordu.
 */
function OnboardingShell({
  children,
  onBeforeLocaleSwitch,
}: {
  children: ReactNode;
  /** Dil değişimi sihirbazı yeniden bağlar — girilenler önce saklanır. */
  onBeforeLocaleSwitch?: () => void;
}) {
  const t = useTranslations("web.auth.onboarding");
  const logout = useCompanyLogout();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <header className="mb-6 flex items-center justify-between gap-3">
        {/* Telefonda yalnız ikon: dil seçici + çıkış düğmesiyle tek satıra sığsın. */}
        <RothernLogo variant="icon" size="sm" className="sm:hidden" />
        <RothernLogo variant="full-light" size="sm" className="hidden sm:block" />
        <div className="flex items-center gap-2">
          <OnboardingLanguageSelect onBeforeSwitch={onBeforeLocaleSwitch} />
          <Button plain onClick={() => void logout()}>
            {t("logout")}
          </Button>
        </div>
      </header>
      {children}
    </div>
  );
}

/**
 * Dil seçimi ÖNCE hesaba yazılır (`PATCH /company-auth/me`), sonra oturum
 * anlık görüntüsü güncellenir; `LocaleUrlSync` sayfayı yeni dilde açar.
 * Yalnız adresi değiştirmek işe yaramaz — LocaleUrlSync hesabın kayıtlı diline
 * geri döndürür (kasıtlı). Yönlendirme `[locale]` bölümünü değiştirip
 * sihirbazı yeniden bağladığı için girilenler yönlendirmeden ÖNCE saklanır
 * (`onBeforeSwitch`); hesap güncellenemezse saklanmaz.
 */
function OnboardingLanguageSelect({ onBeforeSwitch }: { onBeforeSwitch?: () => void }) {
  const t = useTranslations("web.auth.onboarding");
  const current = useLocale();
  const updateMe = useUpdateMe();
  const onChange = async (next: Locale) => {
    if (next === current) return;
    try {
      await updateMe.mutateAsync({ locale: next });
      onBeforeSwitch?.();
      const st = useCompanyAuthStore.getState();
      if (st.user && st.company) st.setMe({ user: { ...st.user, locale: next }, company: st.company });
    } catch (err) {
      toast.error(extractErrorMessage(err, t("languageFailed")));
    }
  };
  return (
    <Select
      aria-label={t("language")}
      className="w-auto!"
      value={current}
      disabled={updateMe.isPending}
      onChange={(e) => void onChange(e.target.value as Locale)}
    >
      {LOCALES.map((code) => (
        <option key={code} value={code} lang={code}>
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </Select>
  );
}

/**
 * Saklanan taslağı forma katar: yalnız formda olan alanlar, aynı türdeyse
 * (bozuk/eski kayıt formu bozmasın). Başlangıcı null olan alanlar
 * (`cityId`, `number | null`) null ya da sayı kabul eder.
 */
export function mergeDraft<F extends Record<string, unknown>>(base: F, draft: Record<string, unknown>): F {
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) {
    if (!(k in draft)) continue;
    const v = draft[k];
    const cur = base[k];
    const ok = Array.isArray(cur)
      ? Array.isArray(v) && v.every((x) => typeof x === "string")
      : cur === null
        ? v === null || typeof v === "number"
        : typeof v === typeof cur;
    if (ok) out[k] = v;
  }
  return out as F;
}

function Summary({ label, value }: { label: string; value?: string | null }) {
  // min-w-0 + break-words: boşluksuz uzun unvan kartın dışına taşmasın (D-343).
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-medium break-words text-zinc-900">{value || "—"}</dd>
    </div>
  );
}

/** Kurucu olmayan üye: şirket bilgileri Kurucu tarafından tamamlanmalı. */
function OwnerMustCompleteNotice() {
  const t = useTranslations("web.auth.onboarding");
  const logout = useCompanyLogout();
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-bold text-zinc-900">{t("ownerOnlyTitle")}</h1>
      <p className="mt-2 text-sm text-zinc-600">{t("ownerOnlyBody")}</p>
      <div className="mt-6 flex justify-center">
        <Button plain onClick={() => void logout()}>
          {t("ownerOnlyLogout")}
        </Button>
      </div>
    </div>
  );
}
