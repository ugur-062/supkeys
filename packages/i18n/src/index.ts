/**
 * KÖK GİRİŞ HAFİFTİR: yalnız dil sabitleri + tipler. Kataloglar (JSON) ve
 * çevirmen ayrı alt yollardan gelir ki istemci paketine üç dilin tüm metni
 * gömülmesin (CJS'de tree-shaking yok):
 *   @rothern/i18n             → LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE, tipler
 *   @rothern/i18n/messages    → messagesFor (sunucu, API)
 *   @rothern/i18n/translator  → createApiTranslator, createWebTranslator, …
 *   @rothern/i18n/glossary    → terim sözlüğü (betikler)
 *   @rothern/i18n/catalog/<dil>/<ad-alanı>.json → ham katalog (küçük yedekler için)
 */
export * from "./locales";
export * from "./pathnames";
export type {
  ApiMessages,
  MessageTree,
  Namespace,
  TrMessages,
  WebMessages,
} from "./messages";
export type {
  AnyTranslator,
  ApiTranslator,
  Formatter,
  TranslatorOptions,
  WebTranslator,
} from "./translator";
