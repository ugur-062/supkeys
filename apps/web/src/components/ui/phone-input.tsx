"use client";

import {
  PHONE_COUNTRIES,
  composePhone,
  parseInternationalInput,
  parsePhone,
  stripTrunkPrefix,
} from "@rothern/shared";
import { useLocale } from "next-intl";
import { countryDisplayName } from "@/i18n/domain";
import { useMemo, useState } from "react";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

/**
 * Uluslararası telefon girişi — solda bayrak + ülke kodu seçici (native select),
 * sağda ulusal numara. `value` tam string ("+90 5xxxxxxxxx"); onChange aynı
 * formatı döndürür. Kayıt, davet-kabul, ayarlar ve adres defterinde ortak.
 *
 * 2026-09-27 (kayıt tüm ülkelere açık): liste tam (245 ülke) ve ekrandaki dile
 * göre sıralı; boş alanda varsayılan ülke firmanın ülkesi (yoksa TR); numara
 * yazılmadan seçilen ülke artık KAYBOLMAZ (boş değer "+90"a dönüyordu); örnek
 * numara yalnız Türkiye'de Türk cep biçiminde.
 *
 * Alana "+44 7911 …" / "0049 …" biçiminde TAM numara yazılır ya da yapıştırılırsa
 * seçili kodun önüne eklenmez: numara ayrıştırılır ve ülke ona geçer. Ulusal
 * önek "0" atılır (TR 0532 → +90 532, GB 07911 → +44 7911; İtalya'da 0
 * numaranın parçası, atılmaz). Ortak kodda (+1, +44, +7) seçili ülke korunur.
 */
export function PhoneInput({
  value,
  onChange,
  placeholder,
  autoComplete = "tel",
  disabled,
  id,
  invalid,
  ariaLabel = "Telefon",
}: {
  value: string;
  onChange: (fullValue: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  ariaLabel?: string;
}) {
  const locale = useLocale();
  const companyCountry = useCompanyAuthStore((st) => st.company?.country);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  // Uluslararası önek yazılırken henüz bir ülke koduna ulaşmamış ham metin ("+3", "00").
  const [draft, setDraft] = useState<string | null>(null);
  const fallback = companyCountry && PHONE_COUNTRIES.some((c) => c.code === companyCountry) ? companyCountry : "TR";
  const selected = pendingCode ?? fallback;
  const parsed = useMemo(() => parsePhone(value, selected), [value, selected]);
  const hasNumber = parsed.national.replace(/\D/g, "").length > 0;
  const code = hasNumber ? parsed.code : selected;
  const current = PHONE_COUNTRIES.find((c) => c.code === code);
  const options = useMemo(() => {
    const rows = PHONE_COUNTRIES.map((c) => ({ ...c, label: countryDisplayName(c.code, locale) }));
    const tr = rows.filter((r) => r.code === "TR");
    return [...tr, ...rows.filter((r) => r.code !== "TR").sort((a, b) => a.label.localeCompare(b.label, locale))];
  }, [locale]);

  const setCountry = (next: string) => {
    setPendingCode(next);
    setDraft(null);
    if (hasNumber) onChange(composePhone(next, parsed.national));
  };
  const setNational = (raw: string) => {
    const intl = parseInternationalInput(raw, code);
    if (intl && "pending" in intl) {
      setDraft(raw);
      return;
    }
    setDraft(null);
    if (intl) {
      setPendingCode(intl.code);
      onChange(composePhone(intl.code, intl.national));
      return;
    }
    onChange(composePhone(code, stripTrunkPrefix(code, raw)));
  };

  return (
    <div
      className={[
        "flex items-stretch overflow-hidden rounded-lg border bg-white shadow-sm",
        "focus-within:ring-2 focus-within:ring-zinc-950",
        invalid ? "border-red-500" : "border-zinc-950/15",
        disabled ? "opacity-50" : "",
      ].join(" ")}
    >
      {/* Ülke seçici — bayrak + arama kodu. */}
      <div className="relative flex items-center border-r border-zinc-950/10 bg-zinc-50">
        <span className="pointer-events-none pl-3 text-base leading-none">
          {current?.flag ?? "🏳️"}
        </span>
        <span className="pointer-events-none pl-1.5 text-sm text-zinc-600">
          +{current?.dialCode ?? "90"}
        </span>
        <select
          aria-label="Ülke kodu"
          value={code}
          disabled={disabled}
          onChange={(e) => setCountry(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent pr-6 text-transparent outline-none"
        >
          {options.map((c) => (
            <option key={c.code} value={c.code} className="text-zinc-900">
              {c.flag} {c.label} (+{c.dialCode})
            </option>
          ))}
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
        aria-label={ariaLabel}
        autoComplete={autoComplete}
        placeholder={placeholder ?? (code === "TR" ? "5XX XXX XX XX" : undefined)}
        disabled={disabled}
        value={draft ?? parsed.national}
        onChange={(e) => setNational(e.target.value)}
        className="w-full bg-transparent px-3 py-2.5 text-base text-zinc-900 outline-none placeholder:text-zinc-400 sm:py-2 sm:text-sm"
      />
    </div>
  );
}
