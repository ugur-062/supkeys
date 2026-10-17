import { createFormatter, createTranslator } from "use-intl/core";
import { type Locale } from "./locales";
import {
  API_NAMESPACES,
  WEB_NAMESPACES,
  messagesFor,
  type ApiMessages,
  type Namespace,
  type WebMessages,
} from "./messages";

/** Uygulama duvar saati — web `lib/time-zone.ts` ile aynı değer (tek kaynak orası; burada kopya YOK, parametre). */
export interface TranslatorOptions {
  timeZone?: string;
  now?: Date;
}

function onError(error: { code: string; message: string }): void {
  // Eksik anahtar geliştirici hatasıdır (tr'de olmayan anahtar): sessizce yutma,
  // ama üretimi de düşürme — uyar, anahtar yolu görünür kalır.
  if (process.env.NODE_ENV !== "test") {
    console.warn(`[i18n] ${error.code}: ${error.message}`);
  }
}

function getMessageFallback(info: { key: string; namespace?: string }): string {
  return info.namespace ? `${info.namespace}.${info.key}` : info.key;
}

/**
 * React DIŞI kullanım için çevirmen (API, e-posta, betikler, testler).
 * `namespaces` verilmezse tüm ad alanları yüklenir.
 */
export type Formatter = ReturnType<typeof createFormatter>;
export type ApiTranslator = ReturnType<typeof createTranslator<ApiMessages>>;
export type WebTranslator = ReturnType<typeof createTranslator<WebMessages>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseMessages = Record<string, any>;
export type AnyTranslator = ReturnType<typeof createTranslator<LooseMessages>>;

export function createTranslatorFor(
  locale: Locale,
  namespaces?: readonly Namespace[],
  options: TranslatorOptions = {},
): AnyTranslator {
  return createTranslator<LooseMessages>({
    locale,
    messages: messagesFor(locale, namespaces) as LooseMessages,
    onError,
    getMessageFallback,
    timeZone: options.timeZone,
    now: options.now,
  });
}

/** API tarafı: `common + api + email`, anahtarlar TİPLİ. */
export function createApiTranslator(locale: Locale, options: TranslatorOptions = {}): ApiTranslator {
  return createTranslator<ApiMessages>({
    locale,
    messages: messagesFor(locale, API_NAMESPACES) as ApiMessages,
    onError,
    getMessageFallback,
    timeZone: options.timeZone,
    now: options.now,
  });
}

/** Web tarafı (test sahtesi ve React dışı köprü): `common + web`, anahtarlar TİPLİ. */
export function createWebTranslator(locale: Locale, options: TranslatorOptions = {}): WebTranslator {
  return createTranslator<WebMessages>({
    locale,
    messages: messagesFor(locale, WEB_NAMESPACES) as WebMessages,
    onError,
    getMessageFallback,
    timeZone: options.timeZone,
    now: options.now,
  });
}

/** Tarih/sayı biçimlendirici — Intl tabanlı, dile göre. */
export function createFormatterFor(locale: Locale, options: TranslatorOptions = {}): Formatter {
  return createFormatter({
    locale,
    timeZone: options.timeZone,
    now: options.now,
    onError,
  });
}
