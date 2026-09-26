import { BadRequestException } from "@nestjs/common";
import { bankDetailsErrors, type BankDetailsInput } from "@rothern/shared";
import { i18nMessage } from "../i18n/http-i18n";

/**
 * Banka bilgisi kapısı (API) — kural `@rothern/shared` `bankDetailsErrors`
 * (IBAN ülkesi → IBAN; değilse hesap no + SWIFT/BIC + banka adı). Doğrulama
 * (`company-docs`), Banka Hesapları, profil ve admin AYNI kapıdan geçer.
 */
export function assertBankDetails(input: BankDetailsInput, opts: { requireSwift?: boolean } = {}): void {
  const [first] = bankDetailsErrors(input, opts);
  if (first) {
    throw new BadRequestException(i18nMessage(`api.bankDetails.${first}` as Parameters<typeof i18nMessage>[0], undefined, "BANK_DETAILS_INVALID"));
  }
}
