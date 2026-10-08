"use client";

import { countryDisplayName, useActivityLabel } from "@/i18n/domain";
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
import { useCategoriesByIds, useRoots } from "@/hooks/use-categories";
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
  readOnboardingDraft,
  saveOnboardingDraft,
} from "@/lib/company-auth/onboarding-draft";
import { cleanPostal, isInvalidTrPostal, postalInputMaxLength } from "@/lib/company/postal-code";
import { errorToastedGlobally, extractErrorMessage, extractFieldErrors } from "@/lib/tenders/error";
import {
  TURKEY_LOCATIONS,
  categorySegment,
  deepestCategoryPicks,
  isValidTaxIdForCountry,
  isValidTckn,
  EU_VAT_COUNTRIES,
  findLocalLegalForm,
  foldSearchText,
  isRegistrationOpen,
  localLegalForms,
  normalizeTaxId,
  parsePhone,
  provinceDisplayName,
  registrationCountries,
  taxIdLabelKey,
} from "@rothern/shared";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { CityCombobox } from "@/components/ui/city-combobox";
import { Description as HeadlessDescription } from "@headlessui/react";
import axios from "axios";
import { Check } from "lucide-react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@rothern/i18n";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { toast } from "sonner";

const COMPANY_TYPE_VALUES = ["LIMITED", "JOINT_STOCK", "SOLE_PROPRIETOR", "OTHER"] as const;
type CompanyTypeValue = (typeof COMPANY_TYPE_VALUES)[number];
const isCompanyType = (value: string): value is CompanyTypeValue =>
  (COMPANY_TYPE_VALUES as readonly string[]).includes(value);
/** "Diğer": hem genel hem yerel listede son seçenek; yapı adı serbest metinle yazılır. */
const OTHER_LEGAL_FORM: CompanyTypeValue = "OTHER";
/** Kayda açık ülke kodları (kapalı liste hariç — `REGISTRATION_BLOCKED`). */
const REGISTRATION_CODES = registrationCountries().map((c) => c.code);

/** Taslak, son değişiklikten bu kadar sonra yazılır (her tuşta depoya yazmamak için). */
const DRAFT_SAVE_DELAY_MS = 400;

const INITIAL_FORM = {
  // Başlangıç ülkesi `/me` gelince kurulur (bkz. initialOnboardingCountry).
  country: "",
  legalName: "",
  /**
   * Hukuki yapı (bkz. `legalFormSelection`). `companyType` API enum değeridir;
   * yerel listesi olan ülkede seçim yapılmadan önce BOŞTUR. `legalFormLocal`
   * seçilen yerel yapının adı ya da "Diğer"de yazılan serbest metindir.
   */
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
};
type OnboardingForm = typeof INITIAL_FORM;
type FieldKey = keyof OnboardingForm;

/**
 * ADIMLAR (2026-10-08, kullanıcı: "kayıt kısmında ülke bazlı her şeyi ve
 * kategori seçimini daha mantıklı hale getir"):
 *  0 · Şirket bilgileri — ÜLKE en başta (altındaki alanlar ona göre çizilir),
 *      unvan, hukuki yapı, vergi no (+ vergi dairesi), web sitesi, adres.
 *  1 · Faaliyet alanı — ne alıp sattığı (kategori seçici) + faaliyet tipi;
 *      kişisel hiçbir şey yok.
 *  2 · Yetkili ve onay — ad (salt okunur), yetkili kimlik no, kurucu notu,
 *      özet, beyan, "Tamamla".
 * Eskiden 2. adım kişisel bilgiyle kategori seçimini karıştırıyor, ülke unvanın
 * altında duruyordu. Alanın sahibi adım: aşağıda yazmayan her alan 0 (şirket).
 * Adım sırası değişirse taslak sürümü de artar (`onboarding-draft.ts`).
 */
const STEP_OF_FIELD: Partial<Record<FieldKey, number>> = {
  mainCategoryIds: 1,
  subCategoryIds: 1,
  activities: 1,
  authorizedTckn: 2,
  declarationAccepted: 2,
};
const LAST_STEP = 2;
const stepOfField = (field: FieldKey): number => STEP_OF_FIELD[field] ?? 0;

/** Formun bütün alan anahtarları (API gövdesindeki adlarla aynı). */
export const ONBOARDING_FORM_KEYS = Object.keys(INITIAL_FORM) as FieldKey[];

/**
 * HATA YUVASI OLAN ALANLAR: `data-field` kutusu ve altında `FieldError` taşıyan
 * alanlar — sunucunun reddi bunların ALTINDA gösterilebilir. Listede olmayan
 * alanın (mahalle, eyalet/bölge, faaliyet tipi, teslimat ilçesi …)
 * reddi adımın hata kutusunda gösterilir (bkz. `stepError`). Bir alana hata
 * yuvası eklenince buraya da eklenir; koşullu çizilen yuvalar `hasErrorSlot`ta.
 */
const ERROR_SLOT_FIELDS: ReadonlySet<FieldKey> = new Set<FieldKey>([
  "country",
  "legalName",
  "companyType",
  "legalFormLocal",
  "taxNumber",
  "taxOffice",
  "website",
  "city",
  "district",
  "postalCode",
  "addressLine",
  "deliveryCity",
  "deliveryPostalCode",
  "deliveryAddressLine",
  "authorizedTckn",
  "mainCategoryIds",
  "declarationAccepted",
]);

/**
 * Alanın hata yuvası formun BU hâlinde çizili mi (koşullu alanlar dahil)?
 * `freeLegalForm`: "Diğer"in serbest metin kutusu açık mı (listeden seçilen
 * yerel yapının kutusu yoktur).
 */
function hasErrorSlot(field: FieldKey, f: OnboardingForm, freeLegalForm: boolean): boolean {
  if (!ERROR_SLOT_FIELDS.has(field)) return false;
  switch (field) {
    case "legalFormLocal":
      return freeLegalForm;
    case "taxOffice":
    case "district":
      return f.country === "TR";
    case "deliveryCity":
    case "deliveryPostalCode":
    case "deliveryAddressLine":
      return !f.deliverySameAsBilling;
    default:
      return true;
  }
}

/** Alan kutusunda odağı alabilen ilk denetim (Headless onay kutusu `span[role=checkbox]`). */
const FOCUSABLE = 'input:not([type="hidden"]), select, textarea, button, [role="checkbox"]';

/**
 * Odaklanan alanın KAYDIRMA PAYI (kayıt denetimi 2026-10 resignup-3). Tarayıcı
 * odaklanan kutuyu görünüm alanının kenarına yaslıyordu: kutu y = 0'a geliyor,
 * üstündeki etiket ekranın dışında kalıyordu (1280 px'te "Firma Unvanı",
 * telefonda yarısı kesik "Web siteniz"). Pay kutunun "görünür olması gereken
 * alanını" etiketi (üstte; iki satıra saran etiket dahil) ve hata / ipucu
 * satırlarını (altta) kapsayacak kadar büyütür. Sınıf sihirbaz kartına
 * verilir; `data-field` kutularının odaklanabilir denetimlerine iner
 * (`FOCUSABLE` ile aynı liste — Catalyst `Input` kendi `className`ini
 * sarmalayıcıya verdiği için pay alan başına yazılamaz).
 */
const FIELD_SCROLL_MARGIN =
  "[&_[data-field]_:is(input,select,textarea,button,[role=checkbox])]:scroll-mt-20 [&_[data-field]_:is(input,select,textarea,button,[role=checkbox])]:scroll-mb-16";

/**
 * Alanın (`data-field`) ilk denetimine odaklanır ve alanı etiketiyle birlikte
 * görünür kılar; alan o an çizili değilse hiçbir şey yapmaz (`false`).
 *
 * Kaydırma odaktan AYRI yapılır: `focus()`un kendi kaydırması kutuyu kenara
 * yaslar ve payı her tarayıcıda uygulamaz; `scrollIntoView` kaydırma payını
 * (`FIELD_SCROLL_MARGIN`) her zaman uygular. `nearest`: alan payıyla birlikte
 * zaten görünüyorsa sayfa oynamaz.
 */
function focusFieldIn(root: HTMLElement | null, field: FieldKey): boolean {
  const control = root
    ?.querySelector<HTMLElement>(`[data-field="${field}"]`)
    ?.querySelector<HTMLElement>(FOCUSABLE);
  if (!control) return false;
  control.focus({ preventScroll: true });
  control.scrollIntoView?.({ block: "nearest" });
  return true;
}

/**
 * Ülke alanının BAŞLANGIÇ değeri (2026-09-27): eskiden her kayıt "TR" ile
 * açılıyordu — Rus kullanıcı fark etmeden Türk firması olarak kaydoluyor, VKN
 * kuralına takılıyordu. Kural ARAYÜZ DİLİ: tr → TR, ru → RU, öteki diller boş
 * (İngilizce arayüz birçok ülkeden kullanılır; ülke bilinçli seçilmeden form
 * ilerlemez).
 *
 * KAYIT FORMU TELEFONU SORMAZ (sahip kararı 2026-10-08) → yeni hesapta `phone`
 * null'dır ve doğrudan dil kuralı işler. Telefonu KAYITLI hesapta (karar
 * öncesi açılmış ve onboarding'i bitmemiş kayıt, telefonu hâlâ gönderen eski
 * web paketi) numaranın ülkesi — kayda açıksa — eskisi gibi önce gelir; kimse
 * telefonu VAR saymaz.
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

/**
 * HUKUKİ YAPI — ÜLKEYE GÖRE (2026-10-08). Seçici, seçilen ülkenin YEREL
 * yapılarını listeler (`@rothern/shared` `localLegalForms`: DE GmbH / UG / AG /
 * KG…, RU ООО / АО / ИП…) ve sonda "Diğer"i (serbest metin). Listesi olmayan
 * ülke — Türkiye ve KKTC dahil — bugünkü genel dört seçeneği görür (Limited /
 * Anonim / Şahıs / Diğer).
 *
 * Formda iki alan durur, ikisi de API gövdesine gider:
 *  · `companyType` — platform enum değeri (yerel yapının eşlendiği tür).
 *  · `legalFormLocal` — seçilen yerel yapının adı ya da "Diğer"de yazılan metin;
 *    genel listede "Diğer" dışında BOŞ.
 * Yerel listesi olan ülkede seçim yapılmadan önce `companyType` boştur
 * (varsayılan bir yapı sessizce kaydedilmez; "Devam" seçim ister). Genel liste
 * bugünkü gibi "Limited Şirket" ön seçili açılır.
 *
 * Yerel yapıların bir kısmı da `OTHER` türüne eşlenir (KG, OHG, LLP…): "Diğer"
 * ile aynı tür, ama listeden seçilmiştir. İkisini AD ayırır — ad ülkenin
 * listesindeyse seçim o yapıdır, değilse serbest metindir. Tek istisna
 * serbest metin kutusunun DÜZENLENDİĞİ andır: yazılırken hiçbir şey kendi
 * kendine değişmez; yazılan ad listedeki bir yapıysa seçim, kutu odağı
 * bırakınca ya da adım gönderilince o yapıya çevrilir (`settleTypedLegalForm`).
 */
type LegalFormFields = Pick<OnboardingForm, "country" | "companyType" | "legalFormLocal">;
type LegalFormChoice = Pick<OnboardingForm, "companyType" | "legalFormLocal">;

/** Ülkenin başlangıç seçimi: yerel liste varsa seçimsiz, yoksa "Limited Şirket". */
export function defaultLegalForm(country: string): LegalFormChoice {
  return { companyType: localLegalForms(country).length > 0 ? "" : "LIMITED", legalFormLocal: "" };
}

/**
 * Seçicinin değeri: genel listede enum değeri, yerel listede yapının adı,
 * "Diğer"de `OTHER`, seçim yoksa "". Yerel ad YALNIZ o ülkenin listesinde
 * aranır — başka ülkenin yapısı hiçbir zaman seçili görünmez.
 */
export function legalFormSelection(f: LegalFormFields): string {
  if (localLegalForms(f.country).length === 0) return isCompanyType(f.companyType) ? f.companyType : "";
  const local = findLocalLegalForm(f.country, f.legalFormLocal);
  if (local) return local.name;
  return f.companyType === OTHER_LEGAL_FORM ? OTHER_LEGAL_FORM : "";
}

/** Seçicide yapılan seçimin form karşılığı (yerel ad → eşlendiği tür + ad). */
export function pickLegalForm(country: string, value: string): LegalFormChoice {
  if (value === OTHER_LEGAL_FORM) return { companyType: OTHER_LEGAL_FORM, legalFormLocal: "" };
  const local = findLocalLegalForm(country, value);
  if (local) return { companyType: local.type, legalFormLocal: local.name };
  if (localLegalForms(country).length === 0 && isCompanyType(value)) return { companyType: value, legalFormLocal: "" };
  return defaultLegalForm(country);
}

/**
 * Hukuki yapıyı ÜLKEYLE tutarlı kılar (açılış tohumu, geri gelen taslak,
 * gönderim): ülkenin listesinde olmayan yerel ad ya da tanınmayan tür seçimi
 * düşürür; listedeki ad her zaman eşlendiği türle birlikte yazılır ("Diğer"e
 * elle "GmbH" yazan firma LIMITED + GmbH olarak kaydolur). "Diğer"in listede
 * olmayan serbest metnine dokunulmaz.
 */
export function sanitizeLegalForm<F extends LegalFormFields>(f: F): F {
  const selected = legalFormSelection(f);
  if (selected === OTHER_LEGAL_FORM) return f;
  return { ...f, ...(selected ? pickLegalForm(f.country, selected) : defaultLegalForm(f.country)) };
}

/**
 * "Diğer"e YAZILAN ad ülkenin listesindeki bir yapıysa seçimi o yapıya çevirir
 * (eşlendiği tür + listedeki yazım); değilse formu AYNI nesne olarak döner.
 * Serbest metin kutusu odağı bırakınca ve 1. adım gönderilince çağrılır —
 * yazılırken ÇAĞRILMAZ (kayıt arayüz testi 2026-10 D-02). API aynı eşlemeyi
 * zaten yapar (`resolveLegalForm`); burası ekranın kaydedilecek olanı
 * göstermesi içindir.
 */
export function settleTypedLegalForm<F extends LegalFormFields>(f: F): F {
  if (f.companyType !== OTHER_LEGAL_FORM || !findLocalLegalForm(f.country, f.legalFormLocal)) return f;
  const next = sanitizeLegalForm(f);
  return next.companyType === f.companyType && next.legalFormLocal === f.legalFormLocal ? f : next;
}

/**
 * KATEGORİ BEYANI — 2. ADIMDAKİ KARTLARLA AYNI GRUPLAR VE SIRA (kayıt arayüz
 * testi 2026-10 CAT-D2). Özet beyanı kartların gösterdiği gibi okur: sektör →
 * kullanıcının o sektörde seçtikleri. Altı BOŞ grup = sektörün TAMAMI beyan
 * edildi (değer sözleşmesi: kod `mainIds`te, o sektörden hiçbir kod `subIds`te
 * yok). Sıra kartların sırasıdır: önce kayıtlı sektör sırası, her sektörde
 * seçim sırası.
 *
 * `CompanyCategoryPicker`ın kart gruplamasının (`gruplar`) AYNASIDIR — biri
 * değişirse diğeri de. Eskiden özet sektörleri katalog sırasıyla ve işaretsiz
 * yazıyor, tamamı beyan edilen sektör "Ürün ve Hizmetler: —" olarak görünüyordu.
 */
export function categoryDeclarationGroups(
  mainIds: readonly string[],
  subIds: readonly string[],
): { sector: string; picks: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const id of mainIds) groups.set(id, []);
  for (const id of deepestCategoryPicks(subIds)) {
    const sector = categorySegment(id);
    if (!sector) continue;
    if (!groups.has(sector)) groups.set(sector, []);
    groups.get(sector)!.push(id);
  }
  return [...groups].map(([sector, picks]) => ({ sector, picks }));
}

/**
 * ÜLKE DEĞİŞİMİ: ülkeye bağlı alanlar sıfırlanır, gerisi kalır.
 *  · Sıfırlananlar: hukuki yapı (yeni ülkenin başlangıcına döner — başka
 *    ülkenin yapısı seçili kalamaz), vergi no ve vergi dairesi (biçimi ülkeye
 *    özgü; D-065), adresin ülkeye bağlı parçaları — il / şehir (+ dünya şehir
 *    kaydı), ilçe, eyalet / bölge, mahalle, posta kodu; ayrı teslimat
 *    adresinde de aynıları.
 *  · Kalanlar: unvan, web sitesi, açık adres satırları, teslimat tercihi,
 *    yetkili kimlik no, kategori ve faaliyet seçimleri, beyan.
 * Aynı ülkeyi yeniden seçmek hiçbir şeyi silmez.
 *
 * İLK SEÇİM (ülke boşken) bir ülke DEĞİŞİMİ değildir: kayıtta telefon
 * sorulmadığı için İngilizce arayüzde form ülkesiz açılır ve alttaki alanlar
 * yazılabilir durumdadır — kullanıcı önce vergi no / şehri yazıp sonra ülkeyi
 * seçerse yazdıkları SİLİNMEZ (inceleme R2, 2026-10-08). Yalnız hukuki yapı
 * yeni ülkenin başlangıcına döner ve şehir kaydı kimliği bırakılır (ülkesiz
 * aranan şehir başka ülkeden olabilir; metin kalır, sunucu yeniden eşler).
 * Türkiye seçilirse şehir il listesine eşlenir, eyalet / bölge boşalır.
 */
export function applyCountryChange(f: OnboardingForm, code: string): OnboardingForm {
  if (code === f.country) return f;
  if (f.country === "") {
    const toTr = code === "TR";
    return {
      ...f,
      country: code,
      ...defaultLegalForm(code),
      city: toTr ? matchTurkeyProvince(f.city) : f.city,
      cityId: null,
      district: "",
      stateRegion: toTr ? "" : f.stateRegion,
      deliveryCity: toTr ? matchTurkeyProvince(f.deliveryCity) : f.deliveryCity,
      deliveryCityId: null,
      deliveryDistrict: "",
      deliveryStateRegion: toTr ? "" : f.deliveryStateRegion,
    };
  }
  return {
    ...f,
    country: code,
    ...defaultLegalForm(code),
    taxNumber: "",
    taxOffice: "",
    city: "",
    cityId: null,
    district: "",
    stateRegion: "",
    neighborhood: "",
    postalCode: "",
    deliveryCity: "",
    deliveryCityId: null,
    deliveryDistrict: "",
    deliveryStateRegion: "",
    deliveryNeighborhood: "",
    deliveryPostalCode: "",
  };
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
 * İl seçenekleri (kayıt denetimi 2026-10 login-17): DEĞER her dilde Türkçe il
 * adıdır (saklanan şehir metni ve ilçe listesi ona bağlı), ETİKET arayüz
 * dilindedir (`provinceDisplayName`: EN Istanbul / Izmir, RU Kiril). Türkçe
 * dışında liste o dilin alfabesine göre sıralanır — Rusça ekranda "Стамбул"
 * Türkçe "İ" sırasında durmasın.
 */
export function provinceOptions(locale: string): { value: string; label: string }[] {
  const rows = TURKEY_LOCATIONS.map((l) => ({ value: l.il, label: provinceDisplayName(l.il, locale) }));
  return locale === "tr" ? rows : rows.sort((a, b) => a.label.localeCompare(b.label, locale));
}

/**
 * "Web siteniz" kabul edilir mi (kayıt denetimi 2026-10 signup-tr-5)? Alan
 * isteğe bağlı: boş değer geçerli. Dolu değer boşluk içeremez ve noktalı bir
 * alan adı taşımalıdır; `http://` / `https://` isteğe bağlı, alan adından
 * sonra port, yol, sorgu gelebilir. Eskiden "ornek firma sitesi" gibi serbest
 * metin kabul ediliyor, `https://ornek firma sitesi` olarak kaydedilip
 * herkese açık profilin yapılandırılmış verisine giriyordu.
 *
 * Dolu değer kuralı API `common/company/website-address.ts`
 * `isValidWebsiteAddress` ile AYNI algoritmadır (etiketler her alfabeden harf
 * / rakam / tire, baş ve sonda tire yok; son etiket en az 2 karakter ve harf
 * içerir — IP adresi ya da "1.5" site değildir; başka şema ve kullanıcı
 * bölümü — "info@firma.com" bir e-postadır — reddedilir). Biri değişirse
 * diğeri de değişir: form, API'nin reddedeceği değeri kabul etmemeli.
 *
 * Etiket ilk karakterinden sonra birleşen işaret (\p{M}) ve sıfır genişlikli
 * birleştirici / ayırıcı da taşıyabilir: Tayca, Hintçe, Tamilce, Bengalce
 * ünlüleri birleşen işaretle yazar ("ธุรกิจ.ไทย", "कंपनी.com"), Farsça sözcük
 * içinde U+200C kullanır, Latin harf ayrık aksanla gelebilir ("s" + U+0327).
 * Bunlar olmadan o ülkelerin geçerli alan adları reddediliyordu.
 */
const WEBSITE_SCHEME = /^https?:\/\//i;
const WEBSITE_ANY_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const WEBSITE_HOST_LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}‌‍-]{0,61}[\p{L}\p{M}\p{N}])?$/u;

export function isAcceptableWebsite(raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;
  if (/\s/.test(value)) return false;
  const rest = value.replace(WEBSITE_SCHEME, "");
  if (WEBSITE_ANY_SCHEME.test(rest)) return false;
  const authority = rest.split(/[/?#]/, 1)[0] ?? "";
  if (!authority || authority.includes("@")) return false;
  const host = authority.replace(/:\d{1,5}$/, "");
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => WEBSITE_HOST_LABEL.test(label))) return false;
  const topLevel = labels[labels.length - 1]!;
  return topLevel.length >= 2 && /\p{L}/u.test(topLevel);
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

/**
 * Sunucunun reddettiği gönderimde hatanın SAHİBİ alan (kayıt denetimi 2026-10
 * signup-tr-6): hata o alanın adımında, alanın altında gösterilir. DTO
 * doğrulaması alan adını `errors` haritasında verir; servis kuralları katalog
 * anahtarıyla (`i18nKey`) ya da `code` ile tanınır. Tanınmayan hata `null`
 * döner ve son adımdaki genel kutuda kalır.
 */
const SERVER_ERROR_FIELD: Record<string, FieldKey> = {
  "api.companyAuth.gecersizUlkeSecimi": "country",
  "api.companyAuth.buUlkedenYeniKayitAlinmiyor": "country",
  "api.companyAuth.yerelHukukiYapiZorunlu": "legalFormLocal",
  "api.companyAuth.sahisFirmasiIcin11HaneliTckn": "taxNumber",
  "api.companyAuth.tuzelKisiIcin10HaneliVergiNo": "taxNumber",
  "api.companyAuth.gecerliBirVergiSicilNumarasiGiriniz": "taxNumber",
  "api.companyAuth.vergiDairesiZorunlu": "taxOffice",
  "api.companyAuth.ilceZorunlu": "district",
  "api.companyAuth.yetkiliTCKimlikNoGecersiz": "authorizedTckn",
  "api.companyAddresses.trPostaKodu5Hane": "postalCode",
};

export function serverErrorField(err: unknown, f: OnboardingForm): FieldKey | null {
  const dtoField = Object.keys(extractFieldErrors(err) ?? {})
    .map((k) => k.split(".")[0]!)
    .find((k): k is FieldKey => k in f);
  if (dtoField) return dtoField;
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as { i18nKey?: unknown; code?: unknown } | undefined;
  const key = typeof data?.i18nKey === "string" ? data.i18nKey : "";
  if (data?.code === "TAX_NUMBER_TAKEN") return "taxNumber";
  if (data?.code === "WEBSITE_INVALID") return "website";
  const known = SERVER_ERROR_FIELD[key];
  if (known === "postalCode") {
    // API hangi posta kodunu reddettiğini söylemez: fatura kodu kurala
    // uyuyorsa reddedilen ayrı teslimat adresininkidir.
    const delivery =
      !f.deliverySameAsBilling && !isInvalidTrPostal(f.postalCode) && isInvalidTrPostal(f.deliveryPostalCode);
    return delivery ? "deliveryPostalCode" : "postalCode";
  }
  if (known) return known;
  // Kategori beyanı kuralları (`category-selection.helper`).
  if (key.startsWith("api.helpers.")) return "mainCategoryIds";
  return null;
}

export function OnboardingClient() {
  const t = useTranslations("web.auth.onboarding");
  const tc = useTranslations("web.auth.common");
  const tTax = useTranslations("web.domain.taxId");
  // Sektör listesi yüklenemeyince seçicinin yerine çizilen satır, seçicinin
  // kendi "Yeniden dene" etiketini kullanır (her dilde aynı sözcük).
  const tPicker = useTranslations("web.shared.companyCategoryPicker");
  // Özet, tamamı beyan edilen sektörü kategori penceresinin çipiyle AYNI sözle
  // yazar ("<sektör> · sektörün tamamı").
  const tCategoryDialog = useTranslations("web.shared.categorySelectorModal");
  const locale = useLocale();
  const activityLabel = useActivityLabel();
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
  // Seçiciyle ortak sorgu anahtarı → aynı seçenek. Sihirbaz sektör listesini
  // seçiciden ÖNCE ister (1. adımdan beri bağlı), yani isteğin politikasını o
  // belirler; hatayı da kendi satırında "Yeniden dene" ile gösterir (2. adım).
  const roots = useRoots({ inlineError: true });

  const STEPS = [t("step1"), t("step2"), t("step3")];
  const companyTypes = COMPANY_TYPE_VALUES.map((value) => ({ value, label: t(`companyType.${value}`) }));
  /* Kayıt kapısı (2026-09-27): tüm ülkeler, kapalı liste hariç (ABD + toprakları,
     kapsamlı yaptırım ülkeleri) — kaydolamayacağı ülke seçicide HİÇ çıkmaz,
     formun sonunda reddedilmez. Seçici aranabilir (`CountryCombobox`). */

  const [step, setStep] = useState(0);
  const [f, setF] = useState(INITIAL_FORM);
  /** "Diğer"in serbest metin kutusu düzenleniyor: odak kutuda (bkz. `isFreeLegalForm`). */
  const [editingLegalFormText, setEditingLegalFormText] = useState(false);
  /** "Devam" / "Tamamla"ya basılmış adımlar: o adımın eksikleri alan altında görünür. */
  const [attempted, setAttempted] = useState<readonly number[]>([]);
  /**
   * Sunucunun reddi. `field` hatanın sahibi alandır (bilinmiyorsa `null`):
   *  - alanın hata yuvası çiziliyse (`hasErrorSlot`) hata o alanın ALTINDA;
   *  - yuvası yoksa alanın adımındaki hata kutusunda, alanın adıyla
   *    (`boxMessage`) — eskiden sihirbaz o adıma dönüyor ama hiçbir şey
   *    göstermiyordu (kayıt denetimi 2026-10 resignup-1);
   *  - sahibi bilinmiyorsa son adımdaki kutuda ("Tamamla"nın üstünde).
   * `at` reddedilen değerin (alan ya da formun tamamı) anlık görüntüsüdür —
   * değer düzeltildiği an hata kendiliğinden kaybolur.
   */
  const [serverError, setServerError] = useState<{
    message: string;
    boxMessage: string;
    field: FieldKey | null;
    at: string;
  } | null>(null);
  const isTR = f.country === "TR";
  const isSole = f.companyType === "SOLE_PROPRIETOR";
  // Kimlik doğrulama — backend company-auth.service.completeOnboarding ile BİREBİR
  // (isValidTaxIdForCountry: TR strict VKN(10)/TCKN(11) checksum, yabancı gevşek;
  // TR yetkili için isValidTckn). Eski "length>=4 / ===11" gevşek gate'i kapatır.
  // Ülke seçilmeden vergi no ÖLÇÜLMEZ: kural ülkeye bağlı ve boş ülke Türkiye sayılıyordu —
  // ülkesiz açılan (İngilizce) formda yazılan Alman / İngiliz numarası anında "geçersiz"
  // görünüyordu (tarayıcı kontrolü D1, 2026-10-08). Ülke hatası zaten adımı durdurur.
  const taxNumberValid = f.country
    ? isValidTaxIdForCountry(f.taxNumber, f.country, isSole)
    : f.taxNumber.trim().length > 0;
  const tcknValid = isTR ? isValidTckn(f.authorizedTckn) : true;
  const set = (k: FieldKey) => (v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const [countryReady, setCountryReady] = useState(false);
  useEffect(() => {
    if (countryReady || !me.data) return;
    const initial = initialOnboardingCountry(me.data.user.phone, locale);
    // Davetle gelen firma (2026-09-27, Faz 3): AI keşfinin bulduğu kendi
    // firma bilgisi formu başlatır — ad, site, ülke, şehir; kullanıcı düzeltebilir.
    const invite = readInvitePrefill();
    const inviteCountry = invite?.country && isRegistrationOpen(invite.country) ? invite.country.toUpperCase() : null;
    // Saklanan taslak (sayfa yenilendi ya da dil değişimi sihirbazı yeniden
    // bağladı) geri gelir — yalnız bilinen alanlar, aynı türdeyse
    // (onboarding-draft.ts). Okumak silmez: ikinci yenileme de aynı taslağı bulur.
    const draft = readOnboardingDraft(userId);
    if (draft) setStep(Math.min(Math.max(Math.trunc(draft.step), 0), LAST_STEP));
    setF((prev) => {
      const s = draft ? mergeDraft(prev, draft.f) : prev;
      const country = s.country || inviteCountry || initial;
      // TR'de şehir il listesinden seçilir: ön doldurulan ad listeye eşlenir,
      // eşleşmezse boş kalır (D-344).
      const prefillCity = country === "TR" ? matchTurkeyProvince(invite?.city) : invite?.city || "";
      // Hukuki yapı ülkenin listesine göre kurulur: yerel listesi olan ülkede
      // seçimsiz açılır; taslaktan gelen seçim o ülkenin listesinde yoksa düşer.
      return sanitizeLegalForm({
        ...s,
        country,
        legalName: s.legalName || invite?.companyName || "",
        website: s.website || invite?.website || "",
        city: s.city || prefillCity,
      });
    });
    setCountryReady(true);
  }, [countryReady, me.data, locale, userId]);

  /**
   * TASLAK SÜREKLİ YAZILIR (kayıt denetimi 2026-10 signup-tr-2 / code-auth-14):
   * sayfa yenilenince sihirbaz boş 1. adıma dönüyordu. Form açılışta
   * tohumlandıktan sonra her değişiklik kısa bir gecikmeyle saklanır; tohumun
   * kendisi (kullanıcı henüz bir şey yazmadı) yazılmaz. Tamamlanınca ve
   * çıkışta taslak silinir — `leavingRef` bekleyen yazmanın silinen taslağı
   * geri getirmesini engeller.
   */
  const savedDraftRef = useRef<string | null>(null);
  const leavingRef = useRef(false);
  useEffect(() => {
    if (!countryReady || !userId || leavingRef.current) return;
    const snapshot = JSON.stringify({ step, f });
    if (savedDraftRef.current === null) {
      savedDraftRef.current = snapshot;
      return;
    }
    if (savedDraftRef.current === snapshot) return;
    const timer = window.setTimeout(() => {
      if (leavingRef.current) return;
      saveOnboardingDraft(userId, { step, f });
      savedDraftRef.current = snapshot;
    }, DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [countryReady, userId, step, f]);

  /**
   * Ana ve alt kategori TEK yazmada güncellenir: seçici ikisini birlikte
   * üretiyor (segment, seçilen yapraklardan türetiliyor) ve iki ayrı `set`
   * çağrısı ara bir turda tutarsız çift bırakırdı.
   */
  const setKategoriler = (v: { mainIds: string[]; subIds: string[] }) =>
    setF((s) => ({ ...s, mainCategoryIds: v.mainIds, subCategoryIds: v.subIds }));

  /**
   * "DİĞER"E YAZILAN AD — YAZARKEN HİÇBİR ŞEY DEĞİŞMEZ (kayıt arayüz testi
   * 2026-10 D-02). Yazılan ad ülkenin listesindeki bir yapıysa seçim o yapıya
   * çevrilir ve kutu kapanır; ama yalnız kutu odağı BIRAKINCA ya da adım
   * gönderilince (`next`). Eskiden karar "kullanıcı bu oturumda Diğer'i seçti"
   * bayrağına bağlıydı; bayrak taslakta saklanmadığı için yenileme / dil
   * değişiminden sonra "KGaA" yazarken "KG"de kutu kapanıyor, seçim listedeki
   * "KG"ye atlıyor, odak <body>'ye düşüyor ve kalan harfler kayboluyordu.
   *
   * BASIŞ SÜRERKEN ERTELENİR: kutu kapanınca altındaki her şey yukarı kayar.
   * Odağı bir basış aldıysa (fareyle "Devam"a, bir onay kutusuna…) kayma
   * basışla bırakış arasına düşer — bırakış başka öğeye gelir ve tıklama
   * kaybolur. Bu yüzden basış (mousedown … mouseup) sürerken çevirme,
   * bırakıştan sonraki göreve bırakılır: tıklama teslim edilmiş olur.
   * Bekleyen çevirme, kutu yeniden odaklanınca ya da seçim değişince düşer
   * (`cancelPendingSettle`) — düzenleme sürerken kutu kapatılmaz.
   */
  const pressingRef = useRef(false);
  const settleAfterPressRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const cancelPendingSettle = useCallback(() => {
    settleAfterPressRef.current = false;
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);
  /** Düzenlemeyi bitirir: yazılan ad listedeki bir yapıysa seçim ona çevrilir. */
  const settleLegalForm = useCallback(() => {
    cancelPendingSettle();
    setEditingLegalFormText(false);
    setF(settleTypedLegalForm);
  }, [cancelPendingSettle]);
  useEffect(() => {
    const onPress = () => {
      pressingRef.current = true;
    };
    const onRelease = () => {
      pressingRef.current = false;
      if (!settleAfterPressRef.current) return;
      settleAfterPressRef.current = false;
      // `click` bırakışla aynı görevde gelir; çevirme bir sonraki görevde.
      settleTimerRef.current = window.setTimeout(settleLegalForm, 0);
    };
    // Bırakışı sayfaya gelmeyen basış (yerel <select> listesi, pencere dışı
    // bırakış) "sürüyor" kalmasın: klavye kullanılıyorsa basış bitmiştir.
    const onKeyDown = () => {
      pressingRef.current = false;
    };
    // `mousedown` / `mouseup`: dokunmada da odak bu ikisinin arasında değişir.
    // Sürükleme `mouseup` üretmez, `dragend` üretir.
    document.addEventListener("mousedown", onPress, true);
    document.addEventListener("mouseup", onRelease, true);
    document.addEventListener("dragend", onRelease, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPress, true);
      document.removeEventListener("mouseup", onRelease, true);
      document.removeEventListener("dragend", onRelease, true);
      document.removeEventListener("keydown", onKeyDown, true);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
  }, [settleLegalForm]);
  const onLegalFormTextFocus = () => {
    cancelPendingSettle();
    setEditingLegalFormText(true);
  };
  const onLegalFormTextBlur = (e: FocusEvent<HTMLInputElement>) => {
    // Pencere / sekme odağı kaybetti: kutu hâlâ belgenin etkin öğesi, kullanıcı
    // alandan çıkmadı (geri dönünce yazmayı sürdürür) → çevirme yok.
    if (document.activeElement === e.currentTarget) return;
    if (pressingRef.current) settleAfterPressRef.current = true;
    else settleLegalForm();
  };

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

  const provinces = useMemo(() => provinceOptions(locale), [locale]);
  const ilceler = useMemo(
    () => TURKEY_LOCATIONS.find((l) => l.il === f.city)?.ilceler ?? [],
    [f.city],
  );
  const deliveryIlceler = useMemo(
    () => TURKEY_LOCATIONS.find((l) => l.il === f.deliveryCity)?.ilceler ?? [],
    [f.deliveryCity],
  );
  // Kullanıcının seçtiği ürün/hizmetler (ata zinciri değil) — ad isteğinin
  // anahtarı; özetteki sıra için bkz. `categoryGroups`.
  const pickedIds = useMemo(() => deepestCategoryPicks(f.subCategoryIds), [f.subCategoryIds]);
  // Adlar seçiciyle (`CompanyCategoryPicker`) AYNI id listesi ve AYNI seçenekle
  // istenir: seçimler + sektörler, `inlineError`. Yalnız o zaman sorgu anahtarı
  // ortaktır ve ek istek gitmez. Eskiden yalnız seçimler soruluyordu — anahtar
  // hiç tutmuyor, her seçim değişikliğinde ikinci bir `by-ids` isteği
  // varsayılan seçeneklerle çıkıyordu (429'da üç otomatik tekrar, 5xx'te genel
  // toast; kayıt denetimi 2026-10 webcat-5).
  const categoryNameIds = useMemo(
    () => [...new Set([...pickedIds, ...f.mainCategoryIds])],
    [pickedIds, f.mainCategoryIds],
  );
  const pickedCats = useCategoriesByIds(categoryNameIds, { inlineError: true });
  // Özet beyanı 2. adımdaki kartların gruplarıyla ve sırasıyla yazar (CAT-D2).
  const categoryGroups = useMemo(
    () => categoryDeclarationGroups(f.mainCategoryIds, f.subCategoryIds),
    [f.mainCategoryIds, f.subCategoryIds],
  );

  const taxKey = taxIdLabelKey(f.country);
  // Hukuki yapı seçenekleri: ülkenin yerel yapıları; listesi olmayan ülkede
  // (Türkiye ve KKTC dahil) genel dört seçenek.
  const localForms = localLegalForms(f.country);
  // "Diğer"in serbest metin kutusu açık mı? Tür "Diğer" ve yazılan ad ülkenin
  // listesinde DEĞİLSE (boş dahil) açıktır. Kutu DÜZENLENİRKEN ad listedeki bir
  // yapıya denk gelse de açık kalır ("KGaA" yazarken "KG"de kapanıp seçim
  // listeye atlamasın) — yenilemeyle / dil değişimiyle geri gelen taslakta da:
  // düzenleme kutuya odaklanınca başlar, taslakta saklanan bir bayrağa bağlı
  // değildir. Odak kutudan çıkınca listedeki ad yapıya çevrilir (`settleLegalForm`).
  const isFreeLegalForm =
    f.companyType === OTHER_LEGAL_FORM && (editingLegalFormText || !findLocalLegalForm(f.country, f.legalFormLocal));
  const legalFormValue = isFreeLegalForm ? OTHER_LEGAL_FORM : legalFormSelection(f);
  // "Diğer"in örnekleri ülkeye göre: Türk firmasına "GmbH, LLC" önerilmez;
  // yerel listesi olan ülkede örnek listeye BİLEREK alınmayan bir yapıdır
  // (vakıf — `@rothern/shared` `data/legal-forms.ts`). Listedeki bir yapı (ör.
  // kooperatif) örnek gösterilirse kurucu onu serbest metin yazar ve "Diğer"
  // olarak kaydolur. Metinler KISA tutulur: yer tutucu kutusuna sığmalı (yarım
  // genişlikte 270 px, 360 px'lik telefonda 260 px; D-01) — ölçüm ve bekçi
  // `packages/i18n` `onboarding-copy.test`.
  const legalFormPlaceholder =
    localForms.length > 0
      ? t("legalFormLocalPlaceholderListed")
      : isTR || f.country === "XN"
        ? t("legalFormLocalPlaceholderTr")
        : t("legalFormLocalPlaceholder");
  // Özet: yerel yapı adı ya da "Diğer"de yazılan metin; yoksa genel türün adı.
  const legalFormText =
    f.legalFormLocal.trim() || companyTypes.find((ct) => ct.value === f.companyType)?.label;

  /**
   * ADIM DENETİMİ (kayıt denetimi 2026-10 code-auth-9 / signup-tr-9): "Devam"
   * ve "Tamamla" sessizce pasif kalmaz. Basılınca adımın geçersiz her alanı
   * kendi altında hatasını gösterir ve ilk hatalı alan odaklanır. Kurallar
   * API ile aynı (DTO uzunlukları, `completeOnboarding` servis kuralları);
   * sıra ekrandaki alan sırasıdır — ilk satır odaklanacak alandır.
   */
  const rule = (ok: boolean, field: FieldKey, message: string): [FieldKey, string][] =>
    ok ? [] : [[field, message]];
  const taxInvalidMessage = isTR ? (isSole ? t("tcknInvalid") : t("vknInvalid")) : t("taxForeignInvalid");
  const cityMissingMessage = isTR ? t("errProvince") : t("errCity");
  const errorsByStep: [FieldKey, string][][] = [
    [
      ...rule(!!f.country, "country", t("errCountry")),
      ...rule(f.legalName.trim().length >= 2, "legalName", t("errLegalName")),
      // Yerel listesi olan ülkede yapı seçilmeden ilerlenmez (ön seçim yok).
      ...rule(legalFormValue !== "", "companyType", t("errLegalForm")),
      ...rule(!isFreeLegalForm || f.legalFormLocal.trim().length >= 2, "legalFormLocal", t("legalFormLocalRequired")),
      ...rule(taxNumberValid, "taxNumber", taxInvalidMessage),
      // TR'de vergi dairesi zorunlu (backend 400).
      ...rule(!isTR || f.taxOffice.trim().length > 0, "taxOffice", t("errTaxOffice")),
      ...rule(isAcceptableWebsite(f.website), "website", t("errWebsite")),
      ...rule(f.city.trim().length >= 2, "city", cityMissingMessage),
      ...rule(!isTR || !!f.district, "district", t("errDistrict")),
      // TR posta kodu 5 rakam — adres defteri ve API `assertPostalCode` ile
      // aynı kural (`lib/company/postal-code.ts`); boş serbest.
      ...rule(!isTR || !isInvalidTrPostal(f.postalCode), "postalCode", t("errPostalTr")),
      ...rule(f.addressLine.trim().length >= 5, "addressLine", t("errAddressLine")),
      // Ayrı teslimat adresi seçiliyse il/şehir + açık adres zorunlu (BE @Length).
      ...(f.deliverySameAsBilling
        ? []
        : [
            ...rule(f.deliveryCity.trim().length >= 2, "deliveryCity", cityMissingMessage),
            ...rule(!isTR || !isInvalidTrPostal(f.deliveryPostalCode), "deliveryPostalCode", t("errPostalTr")),
            ...rule(f.deliveryAddressLine.trim().length >= 5, "deliveryAddressLine", t("errAddressLine")),
          ]),
    ],
    [
      // Kategori ZORUNLU (DTO `@ArrayMinSize(1)`). Üst sınırı (sektör tavanı)
      // seçici kendi uyarısıyla uygular; aşan bir değer yine de gelirse
      // API'nin reddi bu alanın altında gösterilir (`serverErrorField`).
      ...rule(f.mainCategoryIds.length >= 1, "mainCategoryIds", t("categoryRequired")),
    ],
    [
      ...rule(tcknValid, "authorizedTckn", t("tcknInvalidPerson")),
      ...rule(f.declarationAccepted, "declarationAccepted", t("errDeclaration")),
    ],
  ];

  /**
   * Alanın altında gösterilecek hata. İstemci kuralı, adımına basıldıktan
   * sonra görünür (`live`: kimlik numaraları yazılırken de — eski davranış);
   * kural geçiyorsa sunucunun o alan için verdiği ret, değer değişene dek.
   */
  const fieldError = (field: FieldKey, live = false): string | null => {
    const stepIndex = stepOfField(field);
    const client = errorsByStep[stepIndex]!.find(([k]) => k === field)?.[1] ?? null;
    if (client && (attempted.includes(stepIndex) || live)) return client;
    return serverError?.field === field && JSON.stringify(f[field]) === serverError.at ? serverError.message : null;
  };
  /**
   * ADIMIN HATA KUTUSU (resignup-1): alanın altında gösterilemeyen sunucu
   * reddi — sahibi bilinmeyen (özet adımı) ya da hata yuvası olmayan alan
   * (alanın adımı). Görünür ve duyurulur (`role="alert"`), odak kutuya gider.
   */
  const serverErrorLive =
    serverError && JSON.stringify(serverError.field ? f[serverError.field] : f) === serverError.at
      ? serverError
      : null;
  const stepError =
    serverErrorLive &&
    !(serverErrorLive.field && hasErrorSlot(serverErrorLive.field, f, isFreeLegalForm)) &&
    (serverErrorLive.field ? stepOfField(serverErrorLive.field) : LAST_STEP) === step
      ? serverErrorLive.boxMessage
      : null;

  // ADIM GEÇİŞİ (signup-tr-7): yeni adım kaydırma konumunu koruyup ortasından
  // açılıyordu (telefonda başlık ve ilk zorunlu alan ekranın 580 px üstünde).
  // Geçişte sihirbazın başına kaydırılır ve odak adım başlığına taşınır;
  // hedef bir alan ise (eksik/reddedilen) odak o alana gider.
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  // Adım adlarının kimliği: adım başlığı adını göstergedeki etiketten alır.
  const stepLabelId = useId();
  // Sektör listesi yüklenemediğinde "Yeniden dene"yi açıklayan metinlerin kimliği.
  const sectorErrorId = useId();
  // Son adımın bölüm başlıkları ("Yetkili kişi", "Özet").
  const sectionId = useId();
  // Adımın hata kutusu (alanın altında gösterilemeyen sunucu reddi).
  const stepErrorRef = useRef<HTMLDivElement>(null);
  /** Geçişin odak hedefi: bir alan, adımın hata kutusu ya da (null) adım başlığı. */
  type NavTarget = FieldKey | "stepError" | null;
  const pendingNavRef = useRef<{ to: NavTarget } | null>(null);
  const goTo = (target: number, to: NavTarget = null) => {
    if (target === step && to !== "stepError") {
      if (to) focusFieldIn(cardRef.current, to);
      return;
    }
    // Hata kutusu bir sonraki çizimde belirir (adım değişmese de) → odak efektte.
    pendingNavRef.current = { to };
    if (target !== step) setStep(target);
  };
  useEffect(() => {
    const nav = pendingNavRef.current;
    if (!nav) return;
    pendingNavRef.current = null;
    if (nav.to === "stepError" && stepErrorRef.current) {
      stepErrorRef.current.focus({ preventScroll: true });
      stepErrorRef.current.scrollIntoView?.({ block: "center" });
      return;
    }
    if (nav.to && nav.to !== "stepError" && focusFieldIn(cardRef.current, nav.to)) return;
    stepHeadingRef.current?.focus({ preventScroll: true });
    titleRef.current?.scrollIntoView?.({ block: "start" });
    // `serverError`: kutu adım değişmeden de belirebilir (son adımdaki ret).
  }, [step, serverError]);

  /** Adımın eksiklerini gösterir ve ilk hatalı alana gider (gerekirse o adıma döner). */
  const revealErrors = (stepIndex: number) => {
    setAttempted((a) => (a.includes(stepIndex) ? a : [...a, stepIndex]));
    goTo(stepIndex, errorsByStep[stepIndex]![0]?.[0] ?? null);
  };
  const next = () => {
    // Adım gönderilirken "Diğer"e yazılan ad listedeki bir yapıysa ona çevrilir
    // (odak kutudan çıkmadan da gönderilebilir; basışla gelen çevirme henüz
    // bekliyor olabilir). Adımın geçerliliğini değiştirmez: listedeki adlar en
    // az 2 karakterdir. Listede olmayan ada dokunulmaz — düzenleme sürebilir.
    if (step === 0 && f.companyType === OTHER_LEGAL_FORM && findLocalLegalForm(f.country, f.legalFormLocal)) {
      settleLegalForm();
    }
    if (errorsByStep[step]!.length > 0) revealErrors(step);
    else goTo(step + 1);
  };

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
    // Önceki adımlar da denetlenir: yenilemeyle geri gelen taslak sihirbazı
    // doğrudan son adımda açabilir.
    const firstInvalidStep = errorsByStep.findIndex((list) => list.length > 0);
    if (firstInvalidStep !== -1) {
      revealErrors(firstInvalidStep);
      return;
    }
    setServerError(null);
    // Hukuki yapı tek kaynaktan (`@rothern/shared` yerel yapı listesi): listedeki
    // ad eşlendiği türle gider — "Diğer"e elle yazılmış olsa da.
    const legalForm = sanitizeLegalForm(f);
    try {
      await complete.mutateAsync({
        legalName: f.legalName.trim(),
        companyType: legalForm.companyType,
        // Seçilen yerel yapının adı (GmbH, ООО…) ya da "Diğer"de yazılan metin;
        // genel listenin öteki seçeneklerinde alan gönderilmez.
        ...(legalForm.legalFormLocal.trim() ? { legalFormLocal: legalForm.legalFormLocal.trim() } : {}),
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
      leavingRef.current = true;
      clearOnboardingDraft(userId);
      window.location.href = localizePath("/company", runtimeLocale());
    } catch (err) {
      // Hata, sahibi olan alanın adımında gösterilir: alanın hata yuvası varsa
      // altında, yoksa o adımın hata kutusunda (alanın adıyla); alan
      // tanınmıyorsa bu adımdaki kutuda. Hepsi değer düzeltilince kaybolur.
      const field = serverErrorField(err, f);
      setServerError({
        message: extractErrorMessage(err, t("saveFailed")),
        boxMessage: extractErrorMessage(err, t("saveFailed"), fieldLabels()),
        field,
        at: JSON.stringify(field ? f[field] : f),
      });
      goTo(
        field ? stepOfField(field) : step,
        field && hasErrorSlot(field, f, isFreeLegalForm) ? field : "stepError",
      );
    }
  };

  /**
   * DTO alan anahtarı → ekrandaki etiket (zorunluluk yıldızı olmadan). Hata
   * kutusu reddedilen alanı ADIYLA söyler: doğrulama iletisi alan adını
   * taşımaz ("En fazla 100 karakter olabilir").
   */
  const fieldLabels = (): Record<string, string> => {
    const plain = (label: string) => label.replace(/\s*\*$/, "");
    const delivery = (label: string) => `${t("deliveryAddress")} – ${plain(label)}`;
    const cityLabel = isTR ? t("province") : t("city");
    const labels: Partial<Record<FieldKey, string>> = {
      country: plain(t("country")),
      legalName: plain(t("legalName")),
      companyType: plain(t("companyTypeLabel")),
      legalFormLocal: t("legalFormLocal"),
      taxNumber: plain(isTR ? t("taxTr") : tTax(`label.${taxKey}` as never)),
      taxOffice: plain(t("taxOffice")),
      website: t("website"),
      city: plain(cityLabel),
      cityId: plain(cityLabel),
      district: plain(t("district")),
      stateRegion: t("stateRegion"),
      neighborhood: t("neighborhood"),
      postalCode: t("postalCode"),
      addressLine: plain(t("addressLine")),
      deliveryCity: delivery(cityLabel),
      deliveryCityId: delivery(cityLabel),
      deliveryStateRegion: delivery(t("stateRegion")),
      deliveryDistrict: delivery(t("deliveryDistrict")),
      deliveryNeighborhood: delivery(t("neighborhood")),
      deliveryPostalCode: delivery(t("postalCode")),
      deliveryAddressLine: delivery(t("addressLine")),
      authorizedTckn: plain(isTR ? t("tcknLabel") : t("foreignIdLabel")),
      mainCategoryIds: t("pickerLabel"),
      subCategoryIds: t("pickerLabel"),
      activities: t("sumActivities"),
    };
    return labels as Record<string, string>;
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

  // Özet: il adı arayüz dilinde (saklanan değer Türkçe ad kalır).
  const shownCity = (city: string) => (isTR ? provinceDisplayName(city, locale) : city);
  /**
   * ÖZETTE KATEGORİ BEYANI (CAT-D2) — kartlarla aynı gruplar, aynı sıra:
   *  · "Sektörler": her sektör kendi satırında; tamamı beyan edilen sektör
   *    pencere ve kartlardaki gibi "<sektör> · sektörün tamamı" diye yazılır;
   *  · "Ürün ve Hizmetler": yalnız tek tek seçim varsa çizilir (yalnız sektörün
   *    tamamı beyan edildiğinde boş "—" satırı basılmaz).
   * Sektör adı seçicideki gibi önce sektör listesinden, yoksa ad isteğinden
   * (liste gizli sektörleri taşımaz, düşmüş de olabilir).
   */
  const categoryName = (id: string) =>
    roots.data?.find((c) => c.id === id)?.nameTr ?? pickedCats.data?.find((c) => c.id === id)?.nameTr ?? id;
  const sectorLines = categoryGroups.map(({ sector, picks }) =>
    picks.length > 0 ? categoryName(sector) : `${categoryName(sector)} · ${tCategoryDialog("sektorunTamami")}`,
  );
  const pickedNames = categoryGroups
    .flatMap((group) => group.picks)
    .map((id) => pickedCats.data?.find((c) => c.id === id)?.nameTr ?? id)
    .join(", ");
  // Sektör listesi YOK ve yüklenemedi. `isError` tek başına yetmez (kayıt
  // denetimi 2026-10 webcat-8): TanStack Query onu, eldeki liste dururken arka
  // plan tazelemesi düştüğünde de kurar. O durumda seçici (ve açık kategori
  // penceresi) sökülüp yerine hata satırı geliyor, onaylanmamış seçimler
  // sorulmadan kayboluyordu. Liste eldeyse seçici kalır — pencerenin kendi
  // kuralıyla aynı (hata yalnız gösterilecek veri yokken).
  const sectorsUnavailable = roots.isError && roots.data === undefined;
  const categoryError = fieldError("mainCategoryIds");
  const declarationError = fieldError("declarationAccepted");
  // Adımın hata kutusu: 1. ve 2. adımda adımın BAŞINDA (kullanıcı adımın başına
  // döndürülür), son adımda "Tamamla"nın hemen üstünde. Odaklanabilir
  // (`tabIndex={-1}`): ret sonrası odak buraya gelir, klavye sırası kutudan sürer.
  const stepErrorBox = stepError ? (
    <div
      ref={stepErrorRef}
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {stepError}
    </div>
  ) : null;

  return (
    <OnboardingShell
      onBeforeLocaleSwitch={() => saveOnboardingDraft(userId, { step, f })}
      onBeforeLogout={() => {
        // Çıkış taslağı siler; bekleyen yazma onu geri getirmesin.
        leavingRef.current = true;
      }}
    >
      <h1 ref={titleRef} className="scroll-mt-28 text-2xl font-bold text-zinc-900">{t("title")}</h1>
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
            <span
              id={`${stepLabelId}-${i}`}
              className={`text-xs ${i === step ? "font-semibold text-zinc-900" : "text-zinc-500"}`}
            >
              {s}
            </span>
            {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-zinc-200" /> : null}
          </li>
        ))}
      </ol>

      <div ref={cardRef} className={`mt-6 card p-5 ${FIELD_SCROLL_MARGIN}`}>
        {/* Adım başlığı: adım değişince odak buraya taşınır (ekran okuyucu
            yeni adımı duyurur, klavye sırası adımın başından sürer). Görsel
            karşılığı üstteki adım göstergesi olduğundan yalnız ekran okuyucuya;
            adımın ADI metne yazılmaz, göstergedeki etiketten açıklama olarak
            okunur — aynı ad sayfada ikinci bir başlık/metin olarak çoğalmaz
            (sayfa başlığı da "Şirket bilgileri"). */}
        <h2
          ref={stepHeadingRef}
          tabIndex={-1}
          aria-describedby={`${stepLabelId}-${step}`}
          className="sr-only"
        >
          {t("stepOf", { current: step + 1, total: STEPS.length })}
        </h2>
        {step === 0 ? (
          <div className="space-y-3">
            {stepErrorBox}
            {/* ÜLKE EN BAŞTA: hukuki yapı listesi, vergi no etiketi ve kuralı,
                vergi dairesi ve adres parçaları ona göre çizilir. Not bunu
                söyler — kullanıcı önce ülkeyi doğrulasın, sonra alanları
                doldursun (ülke değişince ülkeye bağlı alanlar sıfırlanır,
                bkz. `applyCountryChange`). */}
            <Field data-field="country">
              <Label>{t("country")}</Label>
              <CountryCombobox
                value={f.country}
                codes={REGISTRATION_CODES}
                ariaLabel={t("country")}
                invalid={!!fieldError("country")}
                onChange={(code) => {
                  if (code !== f.country) {
                    cancelPendingSettle();
                    setEditingLegalFormText(false);
                  }
                  setF((s) => applyCountryChange(s, code));
                }}
              />
              <FieldError message={fieldError("country")} />
              <p className="mt-1 text-xs text-zinc-500">{t("countryNote")}</p>
            </Field>
            <Field data-field="legalName">
              <Label>{t("legalName")}</Label>
              <Input
                value={f.legalName}
                maxLength={150}
                invalid={!!fieldError("legalName")}
                onChange={(e) => set("legalName")(e.target.value)}
              />
              <FieldError message={fieldError("legalName")} />
            </Field>
            {/* ETİKETLER ORTAK SATIRDA (sm ve üstü; kayıt denetimi 2026-10
                signup-enru-4): iki sütunun etiketleri aynı ızgara satırını
                paylaşır, kutular ikinci satırda başlar. Eskiden her sütun
                etiketini kendi içinde taşıyordu; Rusça vergi etiketi iki
                satıra sarınca vergi kutusu hukuki yapı kutusunun 25 px altına
                düşüyordu. Alanlar `contents`: çocukları doğrudan ızgaraya
                yerleşir, etiket-kutu bağı (Field) aynen kalır. Telefonda tek
                sütun, kaynak sırasıyla. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-rows-[auto_auto_1fr] sm:gap-x-3">
              <Field className="contents" data-field="companyType">
                <Label className="sm:col-start-1 sm:row-start-1 sm:self-end">{t("companyTypeLabel")}</Label>
                {/* Kutu + hata tek ızgara hücresinde (vergi no sütunuyla aynı kalıp). */}
                <div data-slot="control" className="sm:col-start-1 sm:row-start-2">
                  <Select
                    value={legalFormValue}
                    invalid={!!fieldError("companyType")}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Listeden seçim serbest metin düzenlemesini bitirir ("KG"
                      // listeden seçildiyse kutu açılmaz); bekleyen çevirme düşer.
                      cancelPendingSettle();
                      setEditingLegalFormText(false);
                      setF((s) => ({ ...s, ...pickLegalForm(s.country, value) }));
                    }}
                  >
                    {localForms.length > 0 ? (
                      <>
                        {/* Ülkenin yerel yapıları, yerel yazımıyla (veri — çevrilmez). */}
                        <option value="">{t("select")}</option>
                        {localForms.map((form) => (
                          <option key={form.name} value={form.name}>{form.name}</option>
                        ))}
                        <option value={OTHER_LEGAL_FORM}>{t("companyType.OTHER")}</option>
                      </>
                    ) : (
                      companyTypes.map((ct) => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                      ))
                    )}
                  </Select>
                  <FieldError message={fieldError("companyType")} />
                </div>
              </Field>
              {/* Ayrı Field: aynı Field içinde Headless ikinci kontrolü de
                  seçicinin etiketine bağlıyordu (D-353). */}
              {isFreeLegalForm ? (
                <Field className="mt-2 sm:col-start-1 sm:row-start-3" data-field="legalFormLocal">
                  <Label className="sr-only">{t("legalFormLocal")}</Label>
                  <Input
                    value={f.legalFormLocal}
                    maxLength={80}
                    placeholder={legalFormPlaceholder}
                    invalid={!!fieldError("legalFormLocal")}
                    onChange={(e) => set("legalFormLocal")(e.target.value)}
                    // Yazarken hiçbir şey değişmez; listedeki ad odak çıkınca çevrilir.
                    onFocus={onLegalFormTextFocus}
                    onBlur={onLegalFormTextBlur}
                  />
                  <FieldError message={fieldError("legalFormLocal")} />
                </Field>
              ) : null}
              <Field className="contents" data-field="taxNumber">
                <Label className="mt-3 sm:col-start-2 sm:row-start-1 sm:mt-0 sm:self-end">
                  {isTR ? t("taxTr") : `${tTax(`label.${taxKey}` as never)} *`}
                </Label>
                <div data-slot="control" className="sm:col-start-2 sm:row-span-2 sm:row-start-2">
                  <Input
                    value={f.taxNumber}
                    maxLength={40}
                    invalid={!!fieldError("taxNumber", !!f.taxNumber.trim())}
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
                  <FieldError message={fieldError("taxNumber", !!f.taxNumber.trim())} />
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
                </div>
              </Field>
            </div>
            {isTR ? (
              <Field data-field="taxOffice">
                <Label>{t("taxOffice")}</Label>
                <Input
                  value={f.taxOffice}
                  maxLength={60}
                  invalid={!!fieldError("taxOffice")}
                  onChange={(e) => set("taxOffice")(e.target.value)}
                />
                <FieldError message={fieldError("taxOffice")} />
              </Field>
            ) : null}
            {/* WEB SİTESİ — ZORUNLU DEĞİL, TEŞVİKLİ (2026-09-15, kullanıcı
                kararı). Zorunlu tutmak, sitesi olmayan ama 20 ürün yükleyecek
                imalatçıyı kapıda elerdi — bizim için o firma sitesi olup hiç
                ürün eklemeyenden daha değerli. Bedel kapıda değil sonuçta:
                giren firmanın profilini AI dolduruyor, girmeyen elle yazana
                kadar arama eşiğini geçemiyor. Yazıldıysa bir web adresi
                olmalı (`isAcceptableWebsite`). */}
            <Field data-field="website">
              <Label>{t("website")}</Label>
              <Input
                value={f.website}
                maxLength={200}
                placeholder={t("websitePlaceholder")}
                invalid={!!fieldError("website")}
                onChange={(e) => set("website")(e.target.value)}
              />
              <FieldError message={fieldError("website")} />
              <p className="mt-1 text-xs text-zinc-500">{t.rich("websiteHint", { b })}</p>
            </Field>
            {isTR ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-field="city">
                  <Label>{t("province")}</Label>
                  <Select
                    value={f.city}
                    invalid={!!fieldError("city")}
                    onChange={(e) => { set("city")(e.target.value); set("district")(""); }}
                  >
                    <option value="">{t("select")}</option>
                    {provinces.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </Select>
                  <FieldError message={fieldError("city")} />
                </Field>
                <Field data-field="district">
                  <Label>{t("district")}</Label>
                  <Select
                    value={f.district}
                    disabled={ilceler.length === 0}
                    invalid={!!fieldError("district")}
                    onChange={(e) => set("district")(e.target.value)}
                  >
                    <option value="">{t("select")}</option>
                    {ilceler.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                  <FieldError message={fieldError("district")} />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field data-field="city">
                  <Label>{t("city")}</Label>
                  <CityCombobox
                    country={f.country}
                    value={f.city}
                    ariaLabel={t("city")}
                    invalid={!!fieldError("city")}
                    onChange={({ city, cityId }) => setF((s) => ({ ...s, city, cityId }))}
                  />
                  <FieldError message={fieldError("city")} />
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
              <Field data-field="postalCode">
                <Label>{t("postalCode")}</Label>
                <Input
                  value={f.postalCode}
                  inputMode={isTR ? "numeric" : undefined}
                  maxLength={postalInputMaxLength(isTR, 12)}
                  invalid={!!fieldError("postalCode")}
                  onChange={(e) => set("postalCode")(cleanPostal(e.target.value, isTR))}
                />
                <FieldError message={fieldError("postalCode")} />
              </Field>
            </div>
            <Field data-field="addressLine">
              <Label>{t("addressLine")}</Label>
              <Input
                value={f.addressLine}
                maxLength={500}
                invalid={!!fieldError("addressLine")}
                onChange={(e) => set("addressLine")(e.target.value)}
              />
              <FieldError message={fieldError("addressLine")} />
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
                    <Field data-field="deliveryCity">
                      <Label>{t("deliveryProvince")}</Label>
                      <Select
                        value={f.deliveryCity}
                        invalid={!!fieldError("deliveryCity")}
                        onChange={(e) => setF((s) => ({ ...s, deliveryCity: e.target.value, deliveryDistrict: "" }))}
                      >
                        <option value="">{t("select")}</option>
                        {provinces.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </Select>
                      <FieldError message={fieldError("deliveryCity")} />
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
                    <Field data-field="deliveryCity">
                      <Label>{t("deliveryCity")}</Label>
                      <CityCombobox
                        country={f.country}
                        value={f.deliveryCity}
                        ariaLabel={t("deliveryCity")}
                        invalid={!!fieldError("deliveryCity")}
                        onChange={({ city, cityId }) =>
                          setF((s) => ({ ...s, deliveryCity: city, deliveryCityId: cityId }))
                        }
                      />
                      <FieldError message={fieldError("deliveryCity")} />
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
                  <Field data-field="deliveryPostalCode">
                    <Label>{t("postalCode")}</Label>
                    <Input
                      value={f.deliveryPostalCode}
                      inputMode={isTR ? "numeric" : undefined}
                      maxLength={postalInputMaxLength(isTR, 12)}
                      invalid={!!fieldError("deliveryPostalCode")}
                      onChange={(e) => set("deliveryPostalCode")(cleanPostal(e.target.value, isTR))}
                    />
                    <FieldError message={fieldError("deliveryPostalCode")} />
                  </Field>
                </div>
                <Field data-field="deliveryAddressLine">
                  <Label>{t("addressLine")}</Label>
                  <Input
                    value={f.deliveryAddressLine}
                    maxLength={500}
                    invalid={!!fieldError("deliveryAddressLine")}
                    onChange={(e) => set("deliveryAddressLine")(e.target.value)}
                  />
                  <FieldError message={fieldError("deliveryAddressLine")} />
                </Field>
              </div>
            )}
          </div>
        ) : null}

        {/* FAALİYET ALANI: firmanın NE alıp sattığı (kategori seçici) ve NASIL
            çalıştığı (faaliyet tipi). Kişisel alan yok — yetkili bilgisi son
            adımda. Adımın tek işi bu olduğundan ayrı bir kutu çerçevesi yok. */}
        {step === 1 ? (
          <div className="space-y-3">
            {stepErrorBox}
            <div className="space-y-4">
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
              {/* `data-field` İKİ dalı da sarar (kayıt denetimi 2026-10
                  web-auth-6): sektör listesi yüklenemeyince seçici çizilmez;
                  sarmalayıcı yalnız seçici dalındayken "Devam"ın işaretleyip
                  odaklayacağı bir öğe kalmıyor, basış görünür ve duyulur bir
                  sonuç vermiyordu. Artık odak "Yeniden dene"ye gider ve
                  kategori hatası yükleme hatasının altında yazılır; düğme iki
                  metne de `aria-describedby` ile bağlıdır. */}
              <div data-field="mainCategoryIds">
                {sectorsUnavailable ? (
                  <>
                    {/* Kategori pencerelerindeki yükleme hatası satırıyla AYNI
                        dil (kayıt denetimi 2026-10 recategory-new-6):
                        `role="alert"` (belirdiği an okunur) ve seçicinin kendi
                        "Yeniden dene" etiketi — satır seçicinin yerine çizilir;
                        eskiden düz paragraftı ve "Tekrar dene" diyordu. */}
                    <div role="alert" className="text-xs text-rose-600">
                      <span id={`${sectorErrorId}-load`}>{t("sectorsFailed")}</span>{" "}
                      <button
                        type="button"
                        onClick={() => roots.refetch()}
                        aria-describedby={
                          categoryError
                            ? `${sectorErrorId}-load ${sectorErrorId}-required`
                            : `${sectorErrorId}-load`
                        }
                        className="font-semibold underline"
                      >
                        {tPicker("yenidenDene")}
                      </button>
                    </div>
                    {categoryError ? (
                      <p id={`${sectorErrorId}-required`} className="mt-1.5 text-xs text-rose-600">
                        {categoryError}
                      </p>
                    ) : null}
                  </>
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
                    error={categoryError ?? undefined}
                  />
                )}
              </div>

              <CompanyActivityPicker
                value={f.activities}
                onChange={set("activities")}
              />
            </div>
          </div>
        ) : null}

        {/* YETKİLİ VE ONAY: önce yetkili kişi (ad kayıttan gelir, salt okunur;
            kimlik no burada sorulur), sonra önceki iki adımın özeti, beyan ve
            "Tamamla". Yetkilinin adı ve kimlik numarası aynı ekranda alan
            olarak durduğundan özette yinelenmez. */}
        {step === 2 ? (
          <div className="space-y-5">
            <section aria-labelledby={`${sectionId}-authorized`} className="space-y-3">
              <h3 id={`${sectionId}-authorized`} className="text-sm font-semibold text-zinc-900">
                {t("authorizedHeading")}
              </h3>
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
                <Field data-field="authorizedTckn">
                  <Label>{isTR ? t("tcknLabel") : t("foreignIdLabel")}</Label>
                  <Input
                    value={f.authorizedTckn}
                    maxLength={isTR ? 11 : 30}
                    invalid={!!fieldError("authorizedTckn", !!f.authorizedTckn.trim())}
                    onChange={(e) =>
                      set("authorizedTckn")(
                        isTR ? e.target.value.replace(/\D/g, "") : e.target.value,
                      )
                    }
                  />
                  <FieldError message={fieldError("authorizedTckn", !!f.authorizedTckn.trim())} />
                  {/* Yurt dışında alan isteğe bağlıdır ve hangi numaranın
                      istendiği etiketten anlaşılmıyordu (TR etiketi kendini
                      açıklar: "T.C. Kimlik No *"). */}
                  {isTR ? null : <p className="mt-1 text-xs text-zinc-500">{t("foreignIdHint")}</p>}
                </Field>
                <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                  {t.rich("founderBox", { b })}
                </div>
              </div>
            </section>
            <section aria-labelledby={`${sectionId}-summary`} className="space-y-3">
              <div>
                <h3 id={`${sectionId}-summary`} className="text-sm font-semibold text-zinc-900">
                  {t("summaryHeading")}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500">{t("summaryHint")}</p>
              </div>
              {/* ÖZET kaydedilecek her şeyi listeler (signup-tr-14): web sitesi,
                  ayrı teslimat adresi, seçilen ürün ve hizmetler ile faaliyet
                  tipleri de burada. */}
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                {/* Satırlar adımlardaki alan sırasıyla: ülke en başta. */}
                <Summary
                  label={t("sumCountry")}
                  value={f.country ? countryDisplayName(f.country, locale) : null}
                />
                <Summary label={t("sumLegalName")} value={f.legalName} />
                {/* Hukuki yapı: seçilen yerel ad (GmbH, ООО…) ya da "Diğer"de
                    yazılan metin; genel listede türün adı. */}
                <Summary label={t("sumCompanyType")} value={legalFormText} />
                {/* Yabancıya "Vergi No / TCKN" ve boş "Vergi dairesi" satırı
                    gösterilmez — form etiketiyle aynı dil (2026-09-27). */}
                <Summary
                  label={isTR ? t("sumTax") : tTax(`label.${taxKey}` as never)}
                  value={normalizeTaxId(f.taxNumber, f.country)}
                />
                {isTR ? <Summary label={t("sumTaxOffice")} value={f.taxOffice} /> : null}
                <Summary label={t("sumWebsite")} value={f.website.trim()} />
                <Summary
                  label={t("sumAddress")}
                  value={formatOnboardingAddress({
                    isTR,
                    addressLine: f.addressLine,
                    neighborhood: f.neighborhood,
                    postalCode: f.postalCode,
                    district: f.district,
                    city: shownCity(f.city),
                    stateRegion: f.stateRegion,
                  })}
                />
                <Summary
                  label={t("sumDeliveryAddress")}
                  value={
                    f.deliverySameAsBilling
                      ? t("sumDeliverySame")
                      : formatOnboardingAddress({
                          isTR,
                          addressLine: f.deliveryAddressLine,
                          neighborhood: f.deliveryNeighborhood,
                          postalCode: f.deliveryPostalCode,
                          district: f.deliveryDistrict,
                          city: shownCity(f.deliveryCity),
                          stateRegion: f.deliveryStateRegion,
                        })
                  }
                />
                {/* Satınalma koltuğu BURADA YAZILMAZ: talep açmak Gold paket
                    ister, yeni firma STANDART doğar. Eskiden "Kurucu · satınalma
                    koltuğu · satış koltuğu" yazıyordu — kullanılamayan bir yetkiyi
                    vaat ediyor, üstelik ücretsiz paketin 2 koltuğunun ikisini de
                    kurucuya yüklüyordu (ilk çalışan davetinde "koltuk dolu"). */}
                <Summary label={t("sumRole")} value={t("sumRoleValue")} />
                <Summary label={t("sumSectors")} lines={sectorLines} />
                {pickedNames ? <Summary label={t("sumProducts")} value={pickedNames} /> : null}
                <Summary label={t("sumActivities")} value={f.activities.map(activityLabel).join(", ")} />
              </dl>
            </section>
            {/* Sırada ne olduğunu ÜLKEDEN BAĞIMSIZ olarak söyler. Kayıt için
                admin onayı GEREKMEZ — hesap hemen çalışır; doğrulama yalnız
                para taahhüdü doğuran işlemlerin (talep yayınlama, teklif
                gönderme, kazandırma) kapısıdır. Kullanıcı bunu baştan bilsin
                ki "kaydoldum ama teklif veremiyorum" sürprizi yaşamasın. */}
            <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-sm text-blue-900">
              <p className="font-medium">{t("nextTitle")}</p>
              <p className="mt-1">{t.rich("nextBody", { b })}</p>
            </div>
            {/* Hata CheckboxField'in İÇİNDE (kayıt denetimi 2026-10 web-auth-1):
                Headless `Description` kutunun `aria-describedby`ına bağlanır,
                kutu `aria-invalid` olur — sihirbazın öteki alanlarıyla aynı.
                Eskiden hata alanın dışında düz bir paragraftı: odak kutuya
                gidiyor ama ekran okuyucu yalnız etiketi okuyordu. Izgarada
                etiketin altına oturur (2. sütun, 2. satır; onay satırlarıyla
                aynı yerleşim). */}
            <CheckboxField
              data-field="declarationAccepted"
              className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3"
            >
              <Checkbox
                aria-label={t("declarationAria")}
                aria-invalid={declarationError ? true : undefined}
                checked={f.declarationAccepted}
                onChange={(v) => set("declarationAccepted")(v)}
              />
              <Label className="cursor-pointer">{t("declaration")}</Label>
              <FieldError message={declarationError} className="col-start-2 row-start-2" />
            </CheckboxField>
            {stepErrorBox}
          </div>
        ) : null}

        <div className="mt-5 flex justify-between">
          <Button plain disabled={step === 0} onClick={() => goTo(step - 1)}>
            {t("back")}
          </Button>
          {step < LAST_STEP ? (
            <Button onClick={next}>{t("next")}</Button>
          ) : (
            <Button disabled={complete.isPending || finishLock.locked} onClick={() => void finishLock.run(submit)}>
              {complete.isPending || finishLock.locked ? t("saving") : t("finish")}
            </Button>
          )}
        </div>
      </div>
    </OnboardingShell>
  );
}

/**
 * Alan altı hata metni. `Field` içinde çizilir: Headless `Description` kutuya
 * `aria-describedby` ile bağlanır — odak hatalı alana taşındığında ekran
 * okuyucu hatayı da okur. (Catalyst `ErrorMessage` değil: onun `data-slot`u
 * Field'in 12 px üst boşluk kuralını tetikler; buradaki hatalar kutunun hemen
 * altında, ipucu satırlarıyla aynı ölçüde durur.)
 *
 * `className` üst boşluğun yerini alır: `CheckboxField` ızgarasında boşluğu
 * ızgara verir, hata yalnız hücresini söyler (`col-start-2 row-start-2`).
 */
function FieldError({ message, className = "mt-1" }: { message: string | null; className?: string }) {
  if (!message) return null;
  return <HeadlessDescription className={`${className} text-xs text-red-600`}>{message}</HeadlessDescription>;
}

/**
 * Sihirbazın üst çubuğu (arayüz testi O-122): logo, dil seçici ve "Oturumu
 * kapat". Eskiden yalın kapsayıcıydı — ortak bilgisayarda ya da yanlış
 * hesapla kaydolan kurucu onboarding bitene kadar çıkamıyordu.
 */
function OnboardingShell({
  children,
  onBeforeLocaleSwitch,
  onBeforeLogout,
}: {
  children: ReactNode;
  /** Dil değişimi sihirbazı yeniden bağlar — girilenler önce saklanır. */
  onBeforeLocaleSwitch?: () => void;
  /** Çıkıştan hemen önce (taslak yazımı durdurulur). */
  onBeforeLogout?: () => void;
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
          <Button
            plain
            onClick={() => {
              onBeforeLogout?.();
              void logout();
            }}
          >
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
 * (`onBeforeSwitch`).
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
      // TEK hata mesajı (code-auth-13): 5xx ve ağ hatasını istek katmanı zaten
      // "Sunucu hatası" / "Bağlantı hatası" olarak gösterir; üstüne ikinci
      // toast basılmaz.
      if (!errorToastedGlobally(err)) toast.error(extractErrorMessage(err, t("languageFailed")));
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

/**
 * Özet satırı. `lines`: çok değerli satır — her değer kendi `<dd>`sinde, alt
 * alta (sektör adları virgül içerebilir, virgülle birleştirilmez).
 */
function Summary({ label, value, lines }: { label: string; value?: string | null; lines?: readonly string[] }) {
  // min-w-0 + break-words: boşluksuz uzun unvan kartın dışına taşmasın (D-343).
  const values = lines && lines.length > 0 ? lines : [value || "—"];
  return (
    <div className="min-w-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      {values.map((text, i) => (
        <dd key={i} className="font-medium break-words text-zinc-900">
          {text}
        </dd>
      ))}
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
