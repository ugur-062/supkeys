import { DEFAULT_LOCALE, FALLBACK_CHAIN, type Locale } from "./locales";
import enApi from "./messages/en/api.json";
import enCommon from "./messages/en/common.json";
import enEmail from "./messages/en/email.json";
import enWeb from "./messages/en/web.json";
import ruApi from "./messages/ru/api.json";
import ruCommon from "./messages/ru/common.json";
import ruEmail from "./messages/ru/email.json";
import ruWeb from "./messages/ru/web.json";
import trApi from "./messages/tr/api.json";
import trCommon from "./messages/tr/common.json";
import trEmail from "./messages/tr/email.json";
import trWeb from "./messages/tr/web.json";

/**
 * Ad alanları: web `common + web`, API `common + api + email` yükler. Katalog
 * dosyası = ad alanı; yeni ad alanı eklemek buraya + her dil klasörüne bir
 * dosya demektir (check betiği eksik dosyayı boş sayar, kırmızı yapmaz).
 */
export const NAMESPACES = ["common", "web", "api", "email"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const WEB_NAMESPACES = ["common", "web"] as const satisfies readonly Namespace[];
export const API_NAMESPACES = ["common", "api", "email"] as const satisfies readonly Namespace[];

/** Kaynak (Türkçe) kataloğun tam tipi — anahtar tip güvenliğinin tek kaynağı. */
export type TrMessages = {
  common: typeof trCommon;
  web: typeof trWeb;
  api: typeof trApi;
  email: typeof trEmail;
};
export type WebMessages = Pick<TrMessages, "common" | "web">;
export type ApiMessages = Pick<TrMessages, "common" | "api" | "email">;

export type MessageTree = { [key: string]: string | MessageTree };

const RAW: Record<Locale, Record<Namespace, MessageTree>> = {
  tr: { common: trCommon, web: trWeb, api: trApi, email: trEmail },
  en: { common: enCommon, web: enWeb, api: enApi, email: enEmail },
  ru: { common: ruCommon, web: ruWeb, api: ruApi, email: ruEmail },
};

/** Bir dilin HAM kataloğu (düşüş zinciri UYGULANMAMIŞ) — check/sync betikleri için. */
export function rawMessages(locale: Locale, namespace: Namespace): MessageTree {
  return RAW[locale][namespace];
}

function isTree(value: unknown): value is MessageTree {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Derin birleştirme: `over` içindeki değerler `base`in üstüne yazar, eksikler
 * `base`ten kalır. Yalnız düz nesne ve dize bilir (katalog başka tip taşımaz).
 */
export function mergeMessages(base: MessageTree, over: MessageTree): MessageTree {
  const out: MessageTree = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const existing = out[key];
    if (isTree(value) && isTree(existing)) {
      out[key] = mergeMessages(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const cache = new Map<string, MessageTree>();

/**
 * Dilin ÇALIŞMA ZAMANI kataloğu: düşüş zinciri (ör. ru → en → tr) birleştirilmiş,
 * istenen ad alanlarıyla sınırlı. Eksik anahtar hiçbir zaman boş/ham anahtar
 * olarak görünmez; İngilizce'ye, o da yoksa Türkçe'ye düşer.
 */
export function messagesFor<N extends Namespace>(
  locale: Locale,
  namespaces: readonly N[] = NAMESPACES as unknown as readonly N[],
): Pick<TrMessages, N> {
  const cacheKey = `${locale}:${[...namespaces].sort().join(",")}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit as unknown as Pick<TrMessages, N>;

  const chain = FALLBACK_CHAIN[locale] ?? FALLBACK_CHAIN[DEFAULT_LOCALE];
  const out: MessageTree = {};
  for (const ns of namespaces) {
    // Zincir öncelik sırasıyla (kendi dili önce) → ters çevirip üst üste bindir.
    let merged: MessageTree = {};
    for (const step of [...chain].reverse()) {
      merged = mergeMessages(merged, RAW[step][ns]);
    }
    out[ns] = merged;
  }
  cache.set(cacheKey, out);
  return out as unknown as Pick<TrMessages, N>;
}
