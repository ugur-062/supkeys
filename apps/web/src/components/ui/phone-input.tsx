"use client";

import {
  PHONE_COUNTRIES,
  composePhone,
  parseInternationalInput,
  parsePhone,
  phoneNationalLength,
  stripTrunkPrefix,
} from "@rothern/shared";
import { useLocale, useTranslations } from "next-intl";
import { countryDisplayName } from "@/i18n/domain";
import { useMemo, useState } from "react";
import { GlobeAltIcon } from "@heroicons/react/16/solid";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { CountryFlag } from "@/components/ui/country-flag";

/**
 * Uluslararası telefon girişi — solda bayrak + ülke kodu seçici (native select),
 * sağda ulusal numara. Bayrak SVG görseli (`CountryFlag`, 2026-10-04): emoji
 * bayrağı Windows'ta "TR" diye basılıyordu; native `<option>` görsel alamaz, o
 * yüzden listede yalnız ad + kod. `value` tam string ("+90 5xxxxxxxxx"); onChange aynı
 * formatı döndürür. Kayıt, davet-kabul, ayarlar ve adres defterinde ortak.
 *
 * 2026-09-27 (kayıt tüm ülkelere açık): liste tam (245 ülke) ve ekrandaki dile
 * göre sıralı; numara yazılmadan seçilen ülke artık KAYBOLMAZ (boş değer
 * "+90"a dönüyordu).
 *
 * Alana "+44 7911 …" / "0049 …" biçiminde TAM numara yazılır ya da yapıştırılırsa
 * seçili kodun önüne eklenmez: numara ayrıştırılır ve ülke ona geçer. Ulusal
 * önek atılır (TR 0532 → +90 532, GB 07911 → +44 7911, RU/KZ "8 916…" → +7 916,
 * HU "06 30…" → +36 30; İtalya'da 0 numaranın parçası, atılmaz). Ortak kodda
 * (+1, +44, +7) seçili ülke korunur. Arap-Hint/Farsça rakamlar çevrilir.
 */

/**
 * Boş alanda seçili gelen ülke: firmanın ülkesi → çağıranın `defaultCountry`'si
 * → arayüz dili (tr → Türkiye, ru → Rusya). İNGİLİZCEDE VARSAYILAN YOK
 * (2026-09-27): İngilizce her ülkeden kullanıcının ortak dili; Türkiye'ye
 * düşmek yabancı kullanıcının numarasını sessizce "+90"la kaydediyordu (Rus
 * kullanıcı bayrağı değiştirmeden "8 916…" yazınca "+90 89161234567"). Ülke
 * seçilene ya da "+kod" yazılana dek değer BOŞ kalır → form geçersiz.
 */
export function defaultPhoneCountry(opts: {
  companyCountry?: string | null;
  defaultCountry?: string | null;
  locale: string;
}): string | null {
  const known = (c: string | null | undefined) =>
    c && PHONE_COUNTRIES.some((p) => p.code === c) ? c : null;
  return (
    known(opts.companyCountry) ??
    known(opts.defaultCountry) ??
    (opts.locale === "tr" ? "TR" : opts.locale === "ru" ? "RU" : null)
  );
}

/** Ülkenin tipik uzunluğunda "XXX XXX XXXX" yer tutucu (TR'de cep biçimi). */
function nationalPlaceholder(code: string): string {
  if (code === "TR") return "5XX XXX XX XX";
  // Tavan 11: uzun planlarda (DE 13) yer tutucu alana sığsın.
  const n = Math.min(phoneNationalLength(code).max, 11);
  if (n <= 4) return "X".repeat(n);
  if (n === 8) return "XXXX XXXX";
  const groups: string[] = [];
  let rest = n;
  while (rest > 4) {
    groups.push("XXX");
    rest -= 3;
  }
  groups.push("X".repeat(rest));
  return groups.join(" ");
}

export function PhoneInput({
  value,
  onChange,
  placeholder,
  autoComplete = "tel",
  disabled,
  id,
  invalid,
  ariaLabel,
  defaultCountry,
  onCountryMissingChange,
}: {
  value: string;
  onChange: (fullValue: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  ariaLabel?: string;
  /** Firma ülkesi bilinmiyorsa boş alanda seçili gelecek ülke (ör. kayıtta). */
  defaultCountry?: string | null;
  /**
   * Ülke seçilmeden ulusal numara yazıldı mı (İngilizce arayüzde varsayılan
   * ülke yok). Değer bu durumda BOŞ yayılır; form "boş alan" ile "ülkesiz
   * numara"yı ayırıp doğru hatayı ("önce ülke kodunu seçin") yalnız bununla
   * verebilir — eskiden "seçili ülke için geçerli numara" deniyordu, seçili
   * ülke yokken (arayüz testi son tur webA-1). İsteğe bağlı alanda da numara
   * sessizce düşmez.
   */
  onCountryMissingChange?: (missing: boolean) => void;
}) {
  const t = useTranslations("web.shared.phoneInput");
  const locale = useLocale();
  const companyCountry = useCompanyAuthStore((st) => st.company?.country);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  // Uluslararası önek yazılırken henüz bir ülke koduna ulaşmamış ham metin ("+3", "00").
  const [draft, setDraft] = useState<string | null>(null);
  const fallback = defaultPhoneCountry({ companyCountry, defaultCountry, locale });
  const selected = pendingCode ?? fallback;
  const parsed = useMemo(() => parsePhone(value, selected), [value, selected]);
  const hasNumber = parsed.national.replace(/\D/g, "").length > 0;
  // Ülke yok (İngilizce arayüz, seçim yapılmadı) → `null`: numara taslakta
  // bekler, ülke seçilince ya da "+kod" yazılınca değer oluşur.
  const code: string | null = hasNumber ? parsed.code : selected;
  const current = code ? PHONE_COUNTRIES.find((c) => c.code === code) : undefined;
  const options = useMemo(() => {
    const rows = PHONE_COUNTRIES.map((c) => ({ ...c, label: countryDisplayName(c.code, locale) }));
    const tr = rows.filter((r) => r.code === "TR");
    return [...tr, ...rows.filter((r) => r.code !== "TR").sort((a, b) => a.label.localeCompare(b.label, locale))];
  }, [locale]);
  // 245 `<option>` ÖNBELLEKLİ (son toparlama 2026-10-04): telefon kutusu
  // formların içinde; her tuş vuruşunda (ad, e-posta, şifre…) liste baştan
  // kuruluyordu. Aynı öğe nesneleri React'te uzlaştırmayı da atlatır.
  const optionNodes = useMemo(
    () =>
      options.map((c) => (
        <option key={c.code} value={c.code} className="text-zinc-900">
          {c.label} (+{c.dialCode})
        </option>
      )),
    [options],
  );

  const setCountry = (next: string) => {
    if (!next) return;
    setPendingCode(next);
    onCountryMissingChange?.(false);
    // Ülkesiz yazılmış taslak numara seçilen ülkeyle birleşir.
    const typed = draft && !parseInternationalInput(draft, next) ? draft : null;
    setDraft(null);
    if (typed) onChange(composePhone(next, stripTrunkPrefix(next, typed)));
    else if (hasNumber) onChange(composePhone(next, parsed.national));
  };
  const setNational = (raw: string) => {
    const intl = parseInternationalInput(raw, code);
    if (intl && "pending" in intl) {
      setDraft(raw);
      onCountryMissingChange?.(false);
      return;
    }
    if (intl) {
      setDraft(null);
      setPendingCode(intl.code);
      onCountryMissingChange?.(false);
      onChange(composePhone(intl.code, intl.national));
      return;
    }
    if (!code) {
      // Ülke seçilmeden ulusal numara: tahmin YOK (bkz. defaultPhoneCountry).
      setDraft(raw);
      onChange("");
      onCountryMissingChange?.(raw.replace(/\D/g, "").length > 0);
      return;
    }
    onCountryMissingChange?.(false);
    setDraft(null);
    onChange(composePhone(code, stripTrunkPrefix(code, raw)));
  };

  return (
    // `data-slot="control"`: Catalyst `<Field>` etiketle kutu arasına komşu
    // alanlarla aynı boşluğu (mt-3) koyar; numara kutusunun dolgusu Catalyst
    // `Input` ile aynı (36 px masaüstü / 44 px mobil) — Telefon kutusu İlgili
    // kişi kutusundan 12 px yukarıda duruyordu (arayüz testi webC-09, D-311).
    <div
      data-slot="control"
      className={[
        "flex items-stretch overflow-hidden rounded-lg border bg-white shadow-sm",
        "focus-within:ring-2 focus-within:ring-zinc-950",
        invalid ? "border-red-500" : "border-zinc-950/15",
        disabled ? "opacity-50" : "",
      ].join(" ")}
    >
      {/* Ülke seçici — bayrak + arama kodu. `flex-none`: Firefox, numara
          kutusunun (`w-full`) taşan genişliğini bu sarmalayıcıdan da kırpıyordu
          (16 px) → 16×12 bayrak 8×12 çiziliyordu. Seçici ASLA küçülmez; dar
          kapta yalnız numara kutusu daralır (`min-w-0 flex-1`). */}
      <div
        data-testid="phone-country"
        className="relative flex flex-none items-center border-r border-zinc-950/10 bg-zinc-50"
      >
        <span className="pointer-events-none flex flex-none items-center pl-3">
          {current ? (
            <CountryFlag code={current.code} decorative />
          ) : (
            <GlobeAltIcon aria-hidden className="size-4 text-zinc-400" />
          )}
        </span>
        <span className="pointer-events-none pl-1.5 text-sm text-zinc-600">
          +{current?.dialCode ?? ""}
        </span>
        <select
          aria-label={t("countryCode")}
          value={code ?? ""}
          disabled={disabled}
          onChange={(e) => setCountry(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent pr-6 text-transparent outline-none"
        >
          {code ? null : (
            <option value="" disabled className="text-zinc-900">
              {t("selectCountry")}
            </option>
          )}
          {optionNodes}
        </select>
        <svg
          className="pointer-events-none mr-2 ml-1 h-4 w-4 text-zinc-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </div>

      {/* Ulusal numara. */}
      <input
        id={id}
        type="tel"
        inputMode="tel"
        aria-label={ariaLabel ?? t("label")}
        autoComplete={autoComplete}
        placeholder={placeholder ?? (code ? nationalPlaceholder(code) : t("placeholderIntl"))}
        disabled={disabled}
        value={draft ?? parsed.national}
        onChange={(e) => setNational(e.target.value)}
        className="w-full min-w-0 flex-1 bg-transparent px-3 py-[calc(--spacing(2.5)-1px)] text-base/6 text-zinc-900 outline-none placeholder:text-zinc-400 sm:py-[calc(--spacing(1.5)-1px)] sm:text-sm/6"
      />
    </div>
  );
}
