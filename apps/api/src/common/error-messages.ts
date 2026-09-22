/**
 * class-validator varsayılan (İngilizce) mesajlarını istek DİLİNDEKİ kısa
 * doğrulama metnine çevirir — katalog `api.validation.*` (@rothern/i18n).
 *
 * Eskiden (Polish-3) burada Türkçe sabit sözlük vardı; 2026-09-23 i18n Faz 0
 * ile metinler kataloğa taşındı, desen tanıma aynı kaldı. DTO'da elle verilen
 * `message:` dizesi (Türkçe) olduğu gibi döner — o mesajlar Faz 3'te fonksiyon
 * biçimine (`message: () => tApi("…")`) geçer.
 */
import type { Locale } from "@rothern/i18n";
import { tApi } from "./i18n/i18n.service";

type Values = Record<string, string | number | Date>;

export function translateValidatorMessage(msg: string, locale?: Locale): string {
  const t = (key: Parameters<typeof tApi>[0], values?: Values) => tApi(key, values, locale);

  if (/must be (?:a|an) (?:valid )?email/i.test(msg)) return t("api.validation.emailInvalid");
  if (/should not be empty/i.test(msg) || /must not be empty/i.test(msg)) return t("api.validation.required");
  if (/must be a string/i.test(msg)) return t("api.validation.mustBeString");
  if (/must be a number/i.test(msg)) return t("api.validation.mustBeNumber");
  if (/must be a boolean/i.test(msg)) return t("api.validation.mustBeBoolean");
  if (/must be an array/i.test(msg)) return t("api.validation.mustBeArray");
  if (/must be (?:a Date|a valid ISO|a valid date)/i.test(msg)) return t("api.validation.dateInvalid");
  if (/must be a UUID/i.test(msg)) return t("api.validation.uuidInvalid");
  if (/must be a URL/i.test(msg)) return t("api.validation.urlInvalid");

  const longer = msg.match(/longer than or equal to (\d+) characters/i);
  if (longer) return t("api.validation.stringMin", { n: Number(longer[1]) });
  const shorter = msg.match(/shorter than or equal to (\d+) characters/i);
  if (shorter) return t("api.validation.stringMax", { n: Number(shorter[1]) });
  const notLess = msg.match(/must not be less than (\d+)/i);
  if (notLess) return t("api.validation.numberMin", { n: Number(notLess[1]) });
  const notGreater = msg.match(/must not be greater than (\d+)/i);
  if (notGreater) return t("api.validation.numberMax", { n: Number(notGreater[1]) });
  const arrMin = msg.match(/must contain at least (\d+) elements/i);
  if (arrMin) return t("api.validation.arrayMin", { n: Number(arrMin[1]) });
  const arrMax = msg.match(/must contain no more than (\d+) elements/i);
  if (arrMax) return t("api.validation.arrayMax", { n: Number(arrMax[1]) });

  if (/must be one of the following values/i.test(msg)) return t("api.validation.inValues");
  if (/property .+ should not exist/i.test(msg)) return t("api.validation.notAccepted");

  // Bilinmeyen — DTO'dan gelen elle yazılmış mesaj olabilir, dokunma.
  return msg;
}
