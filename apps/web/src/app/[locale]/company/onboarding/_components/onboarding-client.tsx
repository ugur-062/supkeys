"use client";

import { countryDisplayName } from "@/i18n/domain";
import { localizePath } from "@/i18n/href";
import { runtimeLocale } from "@/i18n/runtime";

import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { CompanyActivityPicker } from "@/components/categories/company-activity-picker";
import { CompanyCategoryPicker } from "@/components/categories/company-category-picker";
import { useRoots } from "@/hooks/use-categories";
import {
  useCompanyMe,
  useCompleteOnboarding,
  useViesCheck,
} from "@/hooks/use-company-auth";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  MAX_COMPANY_MAIN_CATEGORIES,
  TURKEY_LOCATIONS,
  isValidTaxIdForCountry,
  isValidTckn,
  registrationCountries,
} from "@rothern/shared";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

const COMPANY_TYPE_VALUES = ["LIMITED", "JOINT_STOCK", "SOLE_PROPRIETOR"] as const;
// AB VAT (VIES) kapsamındaki ülkeler.
const EU_VAT = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

export function OnboardingClient() {
  const t = useTranslations("web.auth.onboarding");
  const tc = useTranslations("web.auth.common");
  const locale = useLocale();
  const b = (chunks: ReactNode) => <strong>{chunks}</strong>;
  const authUser = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const me = useCompanyMe(!!authUser);
  const complete = useCompleteOnboarding();
  const vies = useViesCheck();
  const roots = useRoots();

  const STEPS = [t("step1"), t("step2"), t("step3")];
  const companyTypes = COMPANY_TYPE_VALUES.map((value) => ({ value, label: t(`companyType.${value}`) }));
  /* Kayıt kapısı (2026-09-01): yalnız profili AÇIK ülkeler. `COUNTRIES` (98)
     burada KULLANILMAZ — kaydolamayacağı bir ülkeyi seçtirip formun sonunda
     reddetmek en kötü akış. Adres defteri ayrı: orada tüm ülkeler seçilebilir
     (teslimat adresi kayıt kapısına tabi değil). Ad dile göre (Intl.DisplayNames). */
  const countries = useMemo(
    () => registrationCountries().map((c) => ({ code: c.code, name: countryDisplayName(c.code, locale) })),
    [locale],
  );

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    country: "TR",
    legalName: "",
    companyType: "LIMITED",
    taxNumber: "",
    taxOffice: "",
    website: "",
    city: "",
    district: "",
    stateRegion: "",
    neighborhood: "",
    postalCode: "",
    addressLine: "",
    deliverySameAsBilling: true,
    deliveryCity: "",
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

  const step1Valid =
    f.legalName.trim().length >= 2 &&
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

  const isEuVat = !isTR && EU_VAT.has(f.country);
  const checkVies = async () => {
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
        country: f.country,
        taxNumber: f.taxNumber.trim(),
        taxOffice: f.taxOffice.trim() || undefined,
        website: f.website.trim() || undefined,
        city: f.city.trim(),
        district: f.district.trim() || undefined,
        stateRegion: f.stateRegion.trim() || undefined,
        neighborhood: f.neighborhood.trim() || undefined,
        postalCode: f.postalCode.trim() || undefined,
        addressLine: f.addressLine.trim(),
        deliverySameAsBilling: f.deliverySameAsBilling,
        ...(f.deliverySameAsBilling
          ? {}
          : {
              deliveryCity: f.deliveryCity.trim(),
              deliveryDistrict: f.deliveryDistrict.trim() || undefined,
              deliveryNeighborhood: f.deliveryNeighborhood.trim() || undefined,
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

  const user = me.data?.user;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
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
              <Input value={f.legalName} onChange={(e) => set("legalName")(e.target.value)} />
            </Field>
            <Field>
              <Label>{t("country")}</Label>
              <Select
                value={f.country}
                onChange={(e) =>
                  // Ülke değişince ülkeye-özel alanları temizle (TR il/ilçe/vergi
                  // dairesi ↔ yabancı şehir/eyalet karışmasın).
                  setF((s) => ({
                    ...s,
                    country: e.target.value,
                    city: "",
                    district: "",
                    taxOffice: "",
                    stateRegion: "",
                  }))
                }
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <Label>{t("companyTypeLabel")}</Label>
                <Select value={f.companyType} onChange={(e) => set("companyType")(e.target.value)}>
                  {companyTypes.map((ct) => (
                    <option key={ct.value} value={ct.value}>{ct.label}</option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>{isTR ? t("taxTr") : t("taxForeign")}</Label>
                <Input
                  value={f.taxNumber}
                  onChange={(e) =>
                    set("taxNumber")(
                      isTR ? e.target.value.replace(/\D/g, "") : e.target.value,
                    )
                  }
                />
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
                    disabled={f.taxNumber.trim().length < 4 || vies.isPending}
                    onClick={checkVies}
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
                <Input value={f.taxOffice} onChange={(e) => set("taxOffice")(e.target.value)} />
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
                  <Select value={f.district} disabled={!f.city} onChange={(e) => set("district")(e.target.value)}>
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
                  <Input value={f.city} onChange={(e) => set("city")(e.target.value)} />
                </Field>
                <Field>
                  <Label>{t("stateRegion")}</Label>
                  <Input value={f.stateRegion} onChange={(e) => set("stateRegion")(e.target.value)} />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <Label>{t("neighborhood")}</Label>
                <Input value={f.neighborhood} onChange={(e) => set("neighborhood")(e.target.value)} />
              </Field>
              <Field>
                <Label>{t("postalCode")}</Label>
                <Input value={f.postalCode} onChange={(e) => set("postalCode")(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
            <Field>
              <Label>{t("addressLine")}</Label>
              <Input value={f.addressLine} onChange={(e) => set("addressLine")(e.target.value)} />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <Checkbox aria-label={t("sameAsBilling")} checked={f.deliverySameAsBilling} onChange={(v) => set("deliverySameAsBilling")(v)} />
              {t("sameAsBilling")}
            </label>
            {!f.deliverySameAsBilling && (
              <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
                <p className="text-sm font-medium text-zinc-700">{t("deliveryAddress")}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field>
                    <Label>{isTR ? t("deliveryProvince") : t("deliveryCity")}</Label>
                    <Input value={f.deliveryCity} onChange={(e) => set("deliveryCity")(e.target.value)} />
                  </Field>
                  <Field>
                    <Label>{t("deliveryDistrict")}</Label>
                    <Input value={f.deliveryDistrict} onChange={(e) => set("deliveryDistrict")(e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field>
                    <Label>{t("neighborhood")}</Label>
                    <Input value={f.deliveryNeighborhood} onChange={(e) => set("deliveryNeighborhood")(e.target.value)} />
                  </Field>
                  <Field>
                    <Label>{t("postalCode")}</Label>
                    <Input value={f.deliveryPostalCode} onChange={(e) => set("deliveryPostalCode")(e.target.value.replace(/\D/g, ""))} />
                  </Field>
                </div>
                <Field>
                  <Label>{t("addressLine")}</Label>
                  <Input value={f.deliveryAddressLine} onChange={(e) => set("deliveryAddressLine")(e.target.value)} />
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
              <Summary label={t("sumCompanyType")} value={companyTypes.find((ct) => ct.value === f.companyType)?.label} />
              <Summary label={t("sumTax")} value={f.taxNumber} />
              <Summary label={t("sumTaxOffice")} value={f.taxOffice} />
              <Summary
                label={t("sumAddress")}
                value={`${f.addressLine}, ${[f.district, f.stateRegion, f.city]
                  .filter(Boolean)
                  .join(" / ")}`}
              />
              <Summary
                label={t("sumCountry")}
                value={countries.find((c) => c.code === f.country)?.name ?? countryDisplayName(f.country, locale)}
              />
              <Summary label={t("sumAuthorized")} value={`${user?.firstName} ${user?.lastName}`} />
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
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-sm text-zinc-700">
              <Checkbox aria-label={t("declarationAria")} checked={f.declarationAccepted} onChange={(v) => set("declarationAccepted")(v)} className="mt-0.5" />
              {t("declaration")}
            </label>
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
            <Button disabled={!f.declarationAccepted || complete.isPending} onClick={submit}>
              {complete.isPending ? t("saving") : t("finish")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900">{value || "—"}</dd>
    </div>
  );
}
