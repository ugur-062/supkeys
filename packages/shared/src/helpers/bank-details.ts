import { countryUsesIban } from "../data/country-profiles";
import { isValidCountryCode } from "../data/countries";
import { countryInIbanRegistry, ibanLengthForPrefix } from "../data/iban-countries";
import { ibanChecksumOk, isValidIbanTr, normalizeIban } from "./company-identity";

/**
 * BANKA BİLGİSİ KURALI — TEK KAYNAK (2026-09-27, kayıt tüm ülkelere açıldı).
 *
 * Eskiden her yüzey (doğrulama, Banka Hesapları, profil, admin) yalnız IBAN
 * biliyordu; IBAN kullanmayan ülkenin (Rusya, Çin, Hindistan, Japonya, Kanada…)
 * firması hesap kaydedemiyor, bu yüzden SİPARİŞ DE KABUL EDEMİYORDU.
 *
 * Kural (kullanıcı kararı "hesap no + SWIFT zorunlu"):
 *  · Bankanın ülkesi IBAN kullanıyorsa → IBAN zorunlu, mod-97 + ülkenin kayıtlı
 *    IBAN uzunluğu (TR IBAN katı).
 *  · Kullanmıyorsa → hesap numarası + SWIFT/BIC + banka adı zorunlu. Geçerli bir
 *    IBAN verilmişse o da kabul (yurt dışında IBAN'lı hesabı olan firma) — hesap
 *    no alanına yazılmış olsa bile (tek alanlı formlar: doğrulama, admin).
 * Ülke kipi `countryIbanMode`: "required" (profil + SWIFT IBAN kaydı), "optional"
 * (kayıtta var ama iç ödemede yerleşmemiş — BR, EG…; `IBAN_OPTIONAL`) ya da
 * "none". "optional" ile "none" kuralda AYNI (IBAN ya da hesap no + SWIFT +
 * banka adı); fark yalnız formun ne SORDUĞU ("IBAN ya da hesap no" / "hesap no").
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

/**
 * IBAN geçerli mi: TR katı biçim; diğerleri ülke önekinin KAYITLI uzunluğu
 * (`IBAN_LENGTHS`; eskiden hiç bakılmıyordu — mod-97'yi tesadüfen tutturan
 * eksik/fazla haneli IBAN geçiyordu) + mod-97. Önek kayıtta yoksa yalnız mod-97.
 */
export function isValidIbanAny(value: string | null | undefined): boolean {
  const v = normalizeIban(value ?? "");
  if (!v) return false;
  if (v.startsWith("TR")) return isValidIbanTr(v);
  const len = ibanLengthForPrefix(v.slice(0, 2));
  if (len != null && v.length !== len) return false;
  return ibanChecksumOk(v);
}

export type IbanMode = "required" | "optional" | "none";

/**
 * Bankanın ülkesinde IBAN ne kadar zorunlu (formun ne soracağı):
 *  · "required" — IBAN zorunlu (`countryUsesIban`: profil + IBAN kaydı).
 *  · "optional" — IBAN kaydında var ama zorunlu değil: kısmi IBAN ülkeleri
 *    (BR, EG…) ve profilde IBAN'sız sayılan kayıtlı ülke (RU). Form "IBAN ya da
 *    hesap no" sorar.
 *  · "none" — IBAN kaydında yok (IN, JP, CN, CA…): hesap no sorar.
 */
export function countryIbanMode(code: string | null | undefined): IbanMode {
  if (countryUsesIban(code)) return "required";
  return countryInIbanRegistry(code) ? "optional" : "none";
}

/**
 * Tek alana yazılan hesap kimliğini ayırır: IBAN zorunlu ülkede IBAN; değilse
 * değer geçerli bir IBAN'sa IBAN, değilse hesap numarası. Web formları ve API
 * aynı ayrımı yapar (IBAN'lı kayıt SWIFT/banka adını zorunlu tutmaz).
 */
export function classifyBankAccountInput(
  country: string | null | undefined,
  value: string | null | undefined,
): { iban: string | null; accountNumber: string | null } {
  const raw = (value ?? "").trim();
  if (!raw) return { iban: null, accountNumber: null };
  const iban = normalizeIban(raw);
  if (countryUsesIban(country) || isValidIbanAny(iban)) return { iban, accountNumber: null };
  return { iban: null, accountNumber: raw };
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
  // IBAN zorunlu olmayan ülke: geçerli IBAN verildiyse yeter — hesap no
  // alanına yazılmış olsa bile (doğrulama/admin formlarında alan tektir).
  const ibanLike = iban || normalizeIban(input.accountNumber ?? "");
  if (ibanLike && isValidIbanAny(ibanLike)) return swiftErrors();
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
