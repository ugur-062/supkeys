"use client";

import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { CategorySelectorButton } from "@/components/categories/category-selector-button";
import { SegmentOnlyPicker } from "@/components/categories/segment-only-picker";
import { useRoots } from "@/hooks/use-categories";
import {
  useCompanyMe,
  useCompleteOnboarding,
  useViesCheck,
} from "@/hooks/use-company-auth";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  COUNTRIES,
  TURKEY_LOCATIONS,
  isValidTaxIdForCountry,
  isValidTckn,

  registrationCountries,
  COMPANY_ACTIVITIES,
  MAX_COMPANY_ACTIVITIES,
} from "@rothern/shared";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const COMPANY_TYPES = [
  { value: "LIMITED", label: "Limited Şirket" },
  { value: "JOINT_STOCK", label: "Anonim Şirket" },
  { value: "SOLE_PROPRIETOR", label: "Şahıs Firması" },
];
const STEPS = ["Şirket Bilgileri", "Kişisel Bilgiler", "Özet & Beyan"];
// AB VAT (VIES) kapsamındaki ülkeler.
const EU_VAT = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

export function OnboardingClient() {
  const authUser = useCompanyAuthStore((s) => s.user);
  const isHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const me = useCompanyMe(!!authUser);
  const complete = useCompleteOnboarding();
  const vies = useViesCheck();
  const roots = useRoots();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    country: "TR",
    legalName: "",
    companyType: "LIMITED",
    taxNumber: "",
    taxOffice: "",
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

  useEffect(() => {
    if (isHydrated && !authUser && typeof window !== "undefined") {
      window.location.href = "/company/login";
    }
  }, [isHydrated, authUser]);
  // Zaten tamamlanmışsa panele dön.
  useEffect(() => {
    if (me.data?.company.onboardingCompletedAt) {
      window.location.href = "/company";
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
  const step2Valid =
    tcknValid &&
    f.mainCategoryIds.length >= 1 &&
    f.mainCategoryIds.length <= 3;

  const isEuVat = !isTR && EU_VAT.has(f.country);
  const checkVies = async () => {
    try {
      const r = await vies.mutateAsync({
        countryCode: f.country,
        vatNumber: f.taxNumber,
      });
      if (r.unavailable) {
        toast.error("VIES servisine şu an ulaşılamıyor, sonra deneyin");
        return;
      }
      if (r.valid) {
        toast.success("VAT numarası doğrulandı (VIES)");
        if (r.name && !f.legalName.trim()) set("legalName")(r.name);
      } else {
        toast.error("VAT numarası VIES'te geçerli değil");
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, "VIES doğrulaması başarısız"));
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
      toast.success("Firma doğrulaması tamamlandı");
      window.location.href = "/company";
    } catch (err) {
      setError(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  if (!isHydrated || !authUser || me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Yükleniyor…
      </div>
    );
  }

  const user = me.data?.user;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-zinc-900">Firma Doğrulama</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Panelini kullanmaya başlamak için firma bilgilerini tamamla. Kayıtta
        verdiğiniz bilgiler tekrar sorulmaz.
      </p>

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
              <Label>Firma Unvanı *</Label>
              <Input value={f.legalName} onChange={(e) => set("legalName")(e.target.value)} />
            </Field>
            <Field>
              <Label>Ülke *</Label>
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
                {/* Kayıt kapısı (2026-09-01): yalnız profili AÇIK ülkeler.
                    `COUNTRIES` (98) burada KULLANILMAZ — kaydolamayacağı bir
                    ülkeyi seçtirip formun sonunda reddetmek en kötü akış.
                    Adres defteri ayrı: orada tüm ülkeler seçilebilir
                    (teslimat adresi kayıt kapısına tabi değil). */}
                {registrationCountries().map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <Label>Firma Türü *</Label>
                <Select value={f.companyType} onChange={(e) => set("companyType")(e.target.value)}>
                  {COMPANY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              <Field>
                <Label>{isTR ? "Vergi No / TCKN *" : "Vergi / Sicil No *"}</Label>
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
                        ? "11 haneli geçerli TCKN giriniz"
                        : "10 haneli geçerli vergi numarası giriniz"
                      : "Geçerli bir vergi/sicil numarası giriniz"}
                  </p>
                ) : null}
                {isEuVat ? (
                  <button
                    type="button"
                    disabled={f.taxNumber.trim().length < 4 || vies.isPending}
                    onClick={checkVies}
                    className="mt-1 text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {vies.isPending ? "Doğrulanıyor…" : "VIES ile doğrula (AB VAT)"}
                  </button>
                ) : null}
              </Field>
            </div>
            {isTR ? (
              <Field>
                <Label>Vergi Dairesi *</Label>
                <Input value={f.taxOffice} onChange={(e) => set("taxOffice")(e.target.value)} />
              </Field>
            ) : null}
            {isTR ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <Label>İl *</Label>
                  <Select value={f.city} onChange={(e) => { set("city")(e.target.value); set("district")(""); }}>
                    <option value="">Seçin…</option>
                    {TURKEY_LOCATIONS.map((l) => (
                      <option key={l.il} value={l.il}>{l.il}</option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>İlçe *</Label>
                  <Select value={f.district} disabled={!f.city} onChange={(e) => set("district")(e.target.value)}>
                    <option value="">Seçin…</option>
                    {ilceler.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <Label>Şehir *</Label>
                  <Input value={f.city} onChange={(e) => set("city")(e.target.value)} />
                </Field>
                <Field>
                  <Label>Eyalet / Bölge</Label>
                  <Input value={f.stateRegion} onChange={(e) => set("stateRegion")(e.target.value)} />
                </Field>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <Label>Mahalle</Label>
                <Input value={f.neighborhood} onChange={(e) => set("neighborhood")(e.target.value)} />
              </Field>
              <Field>
                <Label>Posta Kodu</Label>
                <Input value={f.postalCode} onChange={(e) => set("postalCode")(e.target.value.replace(/\D/g, ""))} />
              </Field>
            </div>
            <Field>
              <Label>Açık Adres *</Label>
              <Input value={f.addressLine} onChange={(e) => set("addressLine")(e.target.value)} />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
              <Checkbox aria-label="Fatura adresini teslimat adresi olarak kullan" checked={f.deliverySameAsBilling} onChange={(v) => set("deliverySameAsBilling")(v)} />
              Fatura adresini teslimat adresi olarak kullan
            </label>
            {!f.deliverySameAsBilling && (
              <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
                <p className="text-sm font-medium text-zinc-700">Teslimat Adresi</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field>
                    <Label>{f.country === "TR" ? "İl" : "Şehir"} *</Label>
                    <Input value={f.deliveryCity} onChange={(e) => set("deliveryCity")(e.target.value)} />
                  </Field>
                  <Field>
                    <Label>İlçe</Label>
                    <Input value={f.deliveryDistrict} onChange={(e) => set("deliveryDistrict")(e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field>
                    <Label>Mahalle</Label>
                    <Input value={f.deliveryNeighborhood} onChange={(e) => set("deliveryNeighborhood")(e.target.value)} />
                  </Field>
                  <Field>
                    <Label>Posta Kodu</Label>
                    <Input value={f.deliveryPostalCode} onChange={(e) => set("deliveryPostalCode")(e.target.value.replace(/\D/g, ""))} />
                  </Field>
                </div>
                <Field>
                  <Label>Açık Adres *</Label>
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
                <Label>Ad</Label>
                <Input value={user?.firstName ?? ""} readOnly disabled />
              </Field>
              <Field>
                <Label>Soyad</Label>
                <Input value={user?.lastName ?? ""} readOnly disabled />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <Label>{isTR ? "T.C. Kimlik No *" : "Yetkili Kimlik No"}</Label>
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
                  <p className="mt-1 text-xs text-red-600">
                    Geçerli bir T.C. Kimlik No giriniz
                  </p>
                ) : null}
              </Field>
              <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                Firmayı kurduğunuz için <strong>Kurucu</strong>sunuz —
                yönetim ve tüm operasyonlar (ilan açma, teklif verme) dahil tam
                yetkiye sahipsiniz.
              </div>
            </div>
            <div>
              {/* Grup etiketi — tek input'a bağlı değil, bu yüzden Headless
                  <Label> (Field gerektirir) yerine düz element. */}
              <p
                id="sector-label"
                className="text-base/6 text-zinc-950 select-none sm:text-sm/6"
              >
                Faaliyet Sektörü{" "}
                <span className="text-zinc-400">* (1-3 seçin)</span>
              </p>
              <p className="mt-0.5 mb-2 text-xs text-zinc-500">
                Firmanızın faaliyet gösterdiği ana sektörleri arayıp seçin — size
                uygun alış/satış ilanları bununla eşleştirilir.
              </p>
              {roots.isError ? (
                <p className="mt-2 text-xs text-red-600">
                  Sektörler yüklenemedi.{" "}
                  <button
                    type="button"
                    onClick={() => roots.refetch()}
                    className="font-semibold underline"
                  >
                    Tekrar dene
                  </button>
                </p>
              ) : (
                // 58 UNSPSC segmenti düz chip duvarı yerine aranabilir modal
                // seçici (arama + checkbox listesi + kaldırılabilir seçili çipler).
                <div className="space-y-4">
                  <SegmentOnlyPicker
                    value={f.mainCategoryIds}
                    onChange={set("mainCategoryIds")}
                    maxSelection={3}
                    placeholder="Sektör seçmek için tıklayın"
                    title="Faaliyet Sektörünüz"
                    description="Firmanızın faaliyet gösterdiği ana sektörleri seçin (en fazla 3). Bu seçim, size uygun alış/satış ilanlarını eşleştirmek için kullanılır."
                  />

                  {/* Alt kategori — ana sektör geniştir ("İmalat Makineleri"
                      88 başlık taşır). Burada seçilmezse firma o sektördeki
                      HER ilanın bildirimini alır ve bir süre sonra hepsini
                      görmezden gelir. */}
                  <div>
                    <span className="block text-sm font-medium text-zinc-950">
                      Ürün / hizmetleriniz{" "}
                      <span className="font-normal text-zinc-400">
                        (isteğe bağlı, sonra da eklenebilir)
                      </span>
                    </span>
                    <p className="mt-0.5 mb-2 text-xs text-zinc-500">
                      Tam olarak ne alıp sattığınızı işaretleyin — ilanlar önce
                      bu seçime göre karşınıza çıkar.
                    </p>
                    <CategorySelectorButton
                      value={f.subCategoryIds}
                      onChange={set("subCategoryIds")}
                      maxSelection={50}
                      modalTitle="Ürün ve Hizmetleriniz"
                      modalDescription="Alıp sattığınız ürün/hizmetleri arayıp seçin."
                      placeholder="Ürün / hizmet ekle"
                    />
                  </div>

                  {/* Faaliyet tipi — kategori "ne", bu "nasıl". */}
                  <div>
                    <span className="block text-sm font-medium text-zinc-950">
                      Faaliyet tipiniz{" "}
                      <span className="font-normal text-zinc-400">
                        (isteğe bağlı)
                      </span>
                    </span>
                    <p className="mt-0.5 mb-2 text-xs text-zinc-500">
                      En fazla {MAX_COMPANY_ACTIVITIES} seçim. Alıcılar
                      üreticiyle bayiyi ayırt edebilsin diye sorulur.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {COMPANY_ACTIVITIES.map((a) => {
                        const selected = f.activities.includes(a.code);
                        const full =
                          !selected &&
                          f.activities.length >= MAX_COMPANY_ACTIVITIES;
                        return (
                          <button
                            key={a.code}
                            type="button"
                            disabled={full}
                            aria-pressed={selected}
                            title={a.hintTr}
                            onClick={() =>
                              set("activities")(
                                selected
                                  ? f.activities.filter((c) => c !== a.code)
                                  : [...f.activities, a.code],
                              )
                            }
                            className={
                              selected
                                ? "rounded-lg border border-blue-600 bg-blue-50 px-3 py-2 text-left text-sm font-medium text-blue-900"
                                : "rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-left text-sm text-zinc-700 hover:border-zinc-950/20 disabled:opacity-40"
                            }
                          >
                            <span className="block">{a.nameTr}</span>
                            <span className="block text-xs font-normal text-zinc-500">
                              {a.hintTr}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <Summary label="Firma Unvanı" value={f.legalName} />
              <Summary label="Firma Türü" value={COMPANY_TYPES.find((t) => t.value === f.companyType)?.label} />
              <Summary label="Vergi No / TCKN" value={f.taxNumber} />
              <Summary label="Vergi Dairesi" value={f.taxOffice} />
              <Summary
                label="Adres"
                value={`${f.addressLine}, ${[f.district, f.stateRegion, f.city]
                  .filter(Boolean)
                  .join(" / ")}`}
              />
              <Summary
                label="Ülke"
                value={
                  registrationCountries().find((c) => c.code === f.country)?.name ??
                  COUNTRIES.find((c) => c.code === f.country)?.name
                }
              />
              <Summary label="Yetkili" value={`${user?.firstName} ${user?.lastName}`} />
              <Summary label="Rol" value="Kurucu (tam yetki)" />
              <Summary
                label="Sektörler"
                value={(roots.data ?? [])
                  .filter((c) => f.mainCategoryIds.includes(c.id))
                  .map((c) => c.nameTr)
                  .join(", ")}
              />
            </dl>
            {/* Sırada ne olduğunu ÜLKEDEN BAĞIMSIZ olarak söyler. Kayıt için
                admin onayı GEREKMEZ — hesap hemen çalışır; doğrulama yalnız
                para taahhüdü doğuran işlemlerin (ilan yayınlama, teklif
                gönderme, kazandırma) kapısıdır. Kullanıcı bunu baştan bilsin
                ki "kaydoldum ama teklif veremiyorum" sürprizi yaşamasın. */}
            <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-sm text-blue-900">
              <p className="font-medium">Kayıttan sonra ne olacak?</p>
              <p className="mt-1">
                Hesabınız <strong>hemen açılır</strong>; ilanları
                inceleyebilir, firmalarla bağlantı kurup mesajlaşabilirsiniz.
                Teklif göndermek ve talep yayınlamak için firma
                doğrulamanızın tamamlanması gerekir — belgelerinizi{" "}
                <strong>Ayarlar → Doğrulama</strong>&apos;dan yükleyip onaya
                gönderin. Belgeleriniz ekibimizce elle incelenir.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-sm text-zinc-700">
              <Checkbox aria-label="Verdiğim bilgilerin doğru ve güncel olduğunu beyan ederim" checked={f.declarationAccepted} onChange={(v) => set("declarationAccepted")(v)} className="mt-0.5" />
              Verdiğim bilgilerin doğru ve güncel olduğunu beyan ederim.
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
            Geri
          </Button>
          {step < 2 ? (
            <Button
              disabled={(step === 0 && !step1Valid) || (step === 1 && !step2Valid)}
              onClick={() => setStep((s) => s + 1)}
            >
              Devam
            </Button>
          ) : (
            <Button disabled={!f.declarationAccepted || complete.isPending} onClick={submit}>
              {complete.isPending ? "Kaydediliyor…" : "Tamamla"}
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
