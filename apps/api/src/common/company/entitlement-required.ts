import { ForbiddenException, GoneException } from "@nestjs/common";
import type { TierName } from "@rothern/shared";
import { i18nMessage } from "../i18n/http-i18n";
import type { ApiMessageKey } from "../i18n/i18n.service";
import { isFreePeriod } from "./effective-tier";

/**
 * YETKİ REDDİ METNİ — ÜCRETSİZ DÖNEM (sahip kararı 2026-10-07) TEK KAYNAK.
 *
 * Kullanıcıya dönen hiçbir metin paket adı ya da üyelik ücreti anmaz. Bir
 * özellik efektif kademe yetmediği için kapalıysa sebep firmanın
 * DOĞRULANMAMIŞ olmasıdır; metin doğrulama ister ve durumuna göre ayrışır:
 *   UNVERIFIED → çağıranın bağlam metni (yoksa genel "doğrulama gerekir")
 *   PENDING    → "doğrulamanız inceleniyor"
 *   REJECTED   → "yeniden başvurun"
 *   VERIFIED   → nötr "kullanılamıyor" (yalnız anahtar KAPALIYKEN ulaşılır;
 *                ücretli paketler dönünce paket metinleri git geçmişinden gelir)
 *
 * Gövde sözleşmesi DEĞİŞMEDİ: `code: "TIER_REQUIRED"` + `minTier` (web bu
 * kodla hata toast'ı basmaz, kilit kartını çizer). Ek alanlar:
 * `verificationStatus` ve `verifyPath` (web doğrulama akışına bağlar).
 */
export const VERIFICATION_PATH = "/company/ayarlar/dogrulama";

export type VerificationStatusLike = string | null | undefined;

export function entitlementMessageKey(
  status: VerificationStatusLike,
  unverifiedKey: ApiMessageKey = "api.entitlement.verificationRequired",
): ApiMessageKey {
  if (status === "PENDING") return "api.entitlement.verificationPending";
  if (status === "REJECTED") return "api.entitlement.verificationRejected";
  if (status === "VERIFIED") return "api.entitlement.notAvailable";
  return unverifiedKey;
}

export interface EntitlementDenial {
  message: string;
  i18nKey: string;
  code?: string;
  minTier?: TierName;
  verificationStatus: string | null;
  verifyPath: string;
}

/** İstisna gövdesi (statusCode'u çağıran ekler). */
export function entitlementDenial(
  status: VerificationStatusLike,
  opts: {
    /** UNVERIFIED için bağlam metni (ör. "Satın alma talebi açmak için…"). */
    key?: ApiMessageKey;
    params?: Record<string, string | number | Date>;
    minTier?: TierName;
    /** Varsayılan `TIER_REQUIRED`; `null` → kod yazılmaz (toast basılsın). */
    code?: string | null;
  } = {},
): EntitlementDenial {
  const key = entitlementMessageKey(status, opts.key);
  // Bağlam parametreleri yalnız bağlam anahtarına gider (durum metinleri parametresiz).
  const params = key === opts.key ? opts.params : undefined;
  const code = opts.code === undefined ? "TIER_REQUIRED" : opts.code;
  return {
    ...i18nMessage(key, params, code ?? undefined),
    ...(opts.minTier ? { minTier: opts.minTier } : {}),
    verificationStatus: status ?? null,
    verifyPath: VERIFICATION_PATH,
  };
}

/** Kademe kapısının 403'ü (guard'lar + servis içi kapılar aynı gövdeyi atar). */
export function entitlementRequiredError(
  min: TierName,
  status: VerificationStatusLike,
  opts: { key?: ApiMessageKey; params?: Record<string, string | number | Date> } = {},
): ForbiddenException {
  return new ForbiddenException({
    ...entitlementDenial(status, { ...opts, minTier: min }),
    statusCode: 403,
  });
}

/**
 * PAKET SATIN ALMA / YÜKSELTME uçlarının kapısı: ücretsiz dönemde 410 Gone,
 * HİÇBİR ŞEY yazılmaz (çağıran bunu ilk satırda çağırır). Anahtar kapalıyken
 * hiçbir şey yapmaz.
 */
export function assertPackagePurchaseOpen(): void {
  if (!isFreePeriod()) return;
  throw new GoneException({
    ...i18nMessage("api.entitlement.purchaseClosed", undefined, "FREE_PERIOD"),
    statusCode: 410,
  });
}

/**
 * Servis içi kapıların 403'ü. `code` verilmezse gövde KODSUZ döner (web hata
 * toast'ı basar) — kilit kartı çizen yüzeyler `code: "TIER_REQUIRED"` geçer.
 */
export function entitlementForbidden(
  status: VerificationStatusLike,
  opts: {
    key?: ApiMessageKey;
    params?: Record<string, string | number | Date>;
    code?: string;
    minTier?: TierName;
  } = {},
): ForbiddenException {
  return new ForbiddenException({
    ...entitlementDenial(status, { ...opts, code: opts.code ?? null }),
    statusCode: 403,
  });
}
