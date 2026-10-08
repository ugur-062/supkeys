import { BadRequestException } from "@nestjs/common";
import { i18nMessage } from "../i18n/http-i18n";

/**
 * Company web site rule (arayuz testi 2026-10 signup-tr-5).
 *
 * The field accepted any text: "ornek firma sitesi" was stored as
 * "https://ornek firma sitesi", shown in the company details and published in
 * the public profile's structured data (`sameAs`).
 *
 * RULE: a host name with a dot and no whitespace; `http://` / `https://` is
 * optional; a port, path, query and fragment may follow the host.
 *  - host labels are letters / digits / hyphens of any alphabet (IDN:
 *    "şirket.com.tr", "компания.рф"), not empty, no hyphen at either end;
 *  - after its first character a label may also carry combining marks and the
 *    zero-width (non-)joiner: Thai, Devanagari, Tamil and Bengali write vowels
 *    and tone marks as combining marks ("ธุรกิจ.ไทย", "कंपनी.com"), Persian
 *    uses the zero-width non-joiner inside words, and a Latin letter may arrive
 *    decomposed ("s" + U+0327 for "ş"). Without them these hosts got 400
 *    WEBSITE_INVALID although registration is open to those countries
 *    (website-idn-combining-marks). A label still cannot START with a mark;
 *  - the last label has at least 2 characters and a letter, so "1.5" or an IP
 *    address is not a web site;
 *  - any other scheme ("ftp://", "mailto:") and a user part ("info@firma.com"
 *    is an e-mail address) are refused.
 *
 * Applied in the SERVICE and only to a NEW or CHANGED value (onboarding
 * completion, company profile update): forms send stored values back, and a
 * value saved before the rule must not block the save of another field
 * (CLAUDE.md "sonradan sikilasan bicim kurali").
 */
const SCHEME = /^https?:\/\//i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const HOST_LABEL = /^[\p{L}\p{N}](?:[\p{L}\p{M}\p{N}‌‍-]{0,61}[\p{L}\p{M}\p{N}])?$/u;

export function isValidWebsiteAddress(raw: string): boolean {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return false;
  const rest = value.replace(SCHEME, "");
  if (ANY_SCHEME.test(rest)) return false;
  const authority = rest.split(/[/?#]/, 1)[0] ?? "";
  if (!authority || authority.includes("@")) return false;
  const host = authority.replace(/:\d{1,5}$/, "");
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => HOST_LABEL.test(label))) return false;
  const topLevel = labels[labels.length - 1]!;
  return topLevel.length >= 2 && /\p{L}/u.test(topLevel);
}

/** 400 `WEBSITE_INVALID` unless the value is empty or a valid web site address. */
export function assertWebsiteAddress(value: string | null | undefined): void {
  const v = value?.trim();
  if (v && !isValidWebsiteAddress(v)) {
    throw new BadRequestException(
      i18nMessage("api.companyProfile.gecerliBirWebSitesiGiriniz", undefined, "WEBSITE_INVALID"),
    );
  }
}
