import { countryUsesIban } from "../data/country-profiles";
import { isValidCountryCode } from "../data/countries";
import { ibanChecksumOk, isValidIbanTr, normalizeIban } from "./company-identity";

/**
 * BANKA BİLGİSİ KURALI — TEK KAYNAK (2026-09-27, kayıt tüm ülkelere açıldı).
 *
 * Eskiden her yüzey (doğrulama, Banka Hesapları, profil, admin) yalnız IBAN
 * biliyordu; IBAN kullanmayan ülkenin (Rusya, Çin, Hindistan, Japonya, Kanada…)
 * firması hesap kaydedemiyor, bu yüzden SİPARİŞ DE KABUL EDEMİYORDU.
 *
 * Kural (kullanıcı kararı "hesap no + SWIFT zorunlu"):
 *  · Bankanın ülkesi IBAN kullanıyorsa → IBAN zorunlu, mod-97 (TR IBAN katı).
 *  · Kullanmıyorsa → hesap numarası + SWIFT/BIC + banka adı zorunlu. Geçerli bir
 *    IBAN verilmişse o da kabul (yurt dışında IBAN'lı hesabı olan firma).
 * Ülke seçimi `countryUsesIban` (profil + SWIFT IBAN kaydı).
 *
 * FİRMA DOĞRULAMASINDA SWIFT HER ÜLKEDE ZORUNLU (aynı gün, kullanıcı: "şirket
 * doğrularken swift numarası girmek zorunlu olsun") → `{ requireSwift: true }`.
 * Banka Hesapları defterinde ülke kuralı geçerli (IBAN ülkesinde SWIFT isteğe bağlı).
 */

export type BankDetailsError =
  | "ibanRequired"
  | "ibanInvalid"
  | "accountNumberRequired"
  | "accountNumberInvalid"
  | "swiftRequired"
  | "swiftInvalid"
  | "bankNameRequired";

export function normalizeSwift(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

/** SWIFT/BIC: 4 harf banka + 2 harf ülke + 2 konum (+ 3 şube), ülke kodu geçerli. */
export function isValidSwiftBic(value: string | null | undefined): boolean {
  const v = normalizeSwift(value);
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v)) return false;
  return isValidCountryCode(v.slice(4, 6));
}

/** Serbest biçimli hesap numarası (ülkeye göre değişir): 4-40 harf/rakam, boşluk/tire/eğik çizgi. */
export function isValidAccountNumber(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9 \-/.]{3,39}$/.test(v) && /\d/.test(v);
}

export interface BankDetailsInput {
  /** Bankanın ülkesi (yoksa firmanın ülkesi). */
  country: string | null | undefined;
  iban?: string | null;
  accountNumber?: string | null;
  swiftBic?: string | null;
  bankName?: string | null;
}

/** IBAN (TR ise katı TR biçimi) geçerli mi. */
export function isValidIbanAny(value: string | null | undefined): boolean {
  const v = normalizeIban(value ?? "");
  if (!v) return false;
  return v.startsWith("TR") ? isValidIbanTr(v) : ibanChecksumOk(v);
}

/** Banka bilgisinin eksik/hatalı alanları (boş dizi = geçerli). */
export function bankDetailsErrors(
  input: BankDetailsInput,
  opts: { requireSwift?: boolean } = {},
): BankDetailsError[] {
  const iban = normalizeIban(input.iban ?? "");
  const swiftErrors = (): BankDetailsError[] => {
    const sw = normalizeSwift(input.swiftBic);
    if (!sw) return opts.requireSwift ? ["swiftRequired"] : [];
    return isValidSwiftBic(sw) ? [] : ["swiftInvalid"];
  };
  if (countryUsesIban(input.country)) {
    if (!iban) return ["ibanRequired", ...swiftErrors()];
    return [...(isValidIbanAny(iban) ? [] : (["ibanInvalid"] as BankDetailsError[])), ...swiftErrors()];
  }
  // IBAN kullanmayan ülke: geçerli IBAN verildiyse yeter.
  if (iban && isValidIbanAny(iban)) return swiftErrors();
  const errors: BankDetailsError[] = [];
  const acct = (input.accountNumber ?? "").trim();
  if (!acct) errors.push("accountNumberRequired");
  else if (!isValidAccountNumber(acct)) errors.push("accountNumberInvalid");
  const swift = normalizeSwift(input.swiftBic);
  if (!swift) errors.push("swiftRequired");
  else if (!isValidSwiftBic(swift)) errors.push("swiftInvalid");
  if (!(input.bankName ?? "").trim()) errors.push("bankNameRequired");
  return errors;
}

/** Görünen hesap kimliği: IBAN ya da "hesap no · SWIFT". */
export function bankAccountRef(a: {
  iban?: string | null;
  accountNumber?: string | null;
  swiftBic?: string | null;
}): string {
  if (a.iban) return normalizeIban(a.iban);
  return [a.accountNumber?.trim(), a.swiftBic ? `SWIFT ${normalizeSwift(a.swiftBic)}` : null]
    .filter(Boolean)
    .join(" · ");
}
