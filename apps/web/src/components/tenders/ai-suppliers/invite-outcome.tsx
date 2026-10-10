"use client";

import type { CandidateInviteState } from "@/hooks/use-supplier-discovery";
import { useFormatDate } from "@/i18n/domain";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * DAVET SONUCU — TEK ETİKET KAYNAĞI (rozet + neden + planlanan gönderim).
 *
 * Aynı sözlüğü (API `candidateInvite`: INVITED · QUEUED · ALREADY_INVITED ·
 * NOT_SENT + neden kodu · WAITING) iki yüzey çizer: AI keşfinin durum bandı
 * (`listing-suggestions.tsx`) ve talep sayfasındaki kalıcı "E-postayla davet
 * edilenler" bölümü (`listing-email-invites.tsx`). Etiketler katalogda
 * `web.panel.requests.aiSuppliers.{outcome,reason}.*`; yeni neden kodu =
 * `INVITE_REASON_KEYS`e satır + üç dilde katalog metni.
 */

/**
 * Otomatik turun sıraya aldığı davet, alıcı AI tedarikçi aramasını kapattığı ya
 * da talebi özele çevirdiği için gönderilmeden düştü (API kuyruk nedeni
 * `AUTO_INVITE_OFF_REASON`). Kendi cümlesi var (canlı doğrulama AUTO-UI-7):
 * çıplak "Davet iptal edildi" alıcıya nedenin KENDİ ayarı olduğunu ve ayarı
 * geri alınca davetlerin yeniden sıraya girdiğini söylemiyordu. `CANCELLED`
 * alıcının daveti elle iptal etmesidir; bu kodu ayırmayan API yanıtı iki
 * durumu da `CANCELLED` verir — ekran neden TAHMİN ETMEZ, gelen kodu yazar.
 */
export const AUTO_INVITE_OFF_REASON = "AUTO_INVITE_OFF";

/**
 * Otomatik tur bu Rothern üyesini BULDU ama davet ETMEDİ: eşleşme yalnız genel
 * sektör düzeyinde (kalem ya da alt kategori eşleşmesi yok). Onay sorulmadan
 * giden davet yalnız güçlü eşleşmeye gider; üye kategori duyurusunu yine alır
 * ve alıcı onu "AI ile tedarikçi bul" penceresinden kendisi davet edebilir.
 * Bir başarısızlık DEĞİLDİR: nötr tonda çizilir ve "gönderilmedi" sayısına
 * girmez (`inviteCounts`).
 */
export const WEAK_MATCH_REASON = "WEAK_MATCH";

/** Neden kodu → katalog anahtarı (`aiSuppliers.reason.*`); bilinmeyen kod neden yazmaz. */
export const INVITE_REASON_KEYS: ReadonlySet<string> = new Set([
  "DAILY_LIMIT",
  "NOT_ELIGIBLE",
  "NOT_ALLOWED",
  "CONSENT_REQUIRED",
  "OPTED_OUT",
  "REGISTERED",
  "COUNTRY_BLOCKED",
  "INVALID",
  "PAUSED",
  "FREQUENCY",
  // Sırada, ama sırası talep kapandıktan SONRA geliyor (API `queuedInviteForecast`).
  "CLOSES_FIRST",
  "SUPPRESSED",
  "ALLOWLIST",
  "LISTING_CLOSED",
  "CANCELLED",
  AUTO_INVITE_OFF_REASON,
  WEAK_MATCH_REASON,
  "FAILED",
]);

/**
 * Neden kodunun etiketi — sonucu KENDİ satır düzeninde yazan yüzey için ("AI ile
 * tedarikçi bul" penceresinin adres satırı). Anahtar kümesi ve katalog aynıdır
 * (ikinci bir neden sözlüğü yazılmaz); tanınmayan kod `null`.
 */
export function useInviteReasonLabel(): (reason: string | null | undefined) => string | null {
  const t = useTranslations("web.panel.requests.aiSuppliers");
  return (reason) => (reason && INVITE_REASON_KEYS.has(reason) ? t(`reason.${reason}` as never) : null);
}

const TONE: Record<CandidateInviteState, string> = {
  INVITED: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  QUEUED: "bg-blue-50 text-blue-800 ring-blue-600/20",
  ALREADY_INVITED: "bg-zinc-100 text-zinc-700 ring-zinc-600/10",
  NOT_SENT: "bg-amber-50 text-amber-900 ring-amber-600/20",
  WAITING: "bg-zinc-100 text-zinc-700 ring-zinc-600/10",
};

/** Tanınmayan durum (yeni API değeri) "gönderilmedi" gibi çizilir — ham kod basılmaz. */
function knownState(invite: string): CandidateInviteState {
  return invite in TONE ? (invite as CandidateInviteState) : "NOT_SENT";
}

export function InviteOutcome({
  invite,
  reason = null,
  sendAfter = null,
  className,
}: {
  invite: CandidateInviteState | string;
  /** NOT_SENT nedeni (kod); tanınmayan kod yalnız "Gönderilmedi" der. */
  reason?: string | null;
  /** QUEUED: e-postanın planlanan gönderim anı (ISO) — verilirse rozetin altına yazılır. */
  sendAfter?: string | null;
  className?: string;
}) {
  const t = useTranslations("web.panel.requests.aiSuppliers");
  const formatDate = useFormatDate();
  const state = knownState(invite);
  return (
    // `ml-auto` BURADA (canlı doğrulama AUTO-UI-6): rozet satırda her zaman sağa
    // yaslanır. Çağıran vermediğinde (durum bandı) uzun adlı satırda alt satıra
    // inen rozet SOLA düşüyor, 390 px'te rozet sütunu satırdan satıra sağ / sol
    // gidip geliyordu.
    <div className={cn("ml-auto max-w-full text-right sm:max-w-[60%]", className)}>
      <span
        className={cn(
          "inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
          // Zayıf eşleşme bilinçli bir "davet edilmedi"dir, hata değil → nötr ton.
          state === "NOT_SENT" && reason === WEAK_MATCH_REASON ? TONE.WAITING : TONE[state],
        )}
      >
        {state === "NOT_SENT" && reason === WEAK_MATCH_REASON ? t("outcome.NOT_INVITED") : t(`outcome.${state}`)}
      </span>
      {state === "NOT_SENT" && reason && INVITE_REASON_KEYS.has(reason) ? (
        <p className="mt-0.5 text-xs text-zinc-600">{t(`reason.${reason}` as never)}</p>
      ) : null}
      {state === "QUEUED" && sendAfter ? (
        <p className="mt-0.5 text-xs text-zinc-600">{t("sendAfter", { date: formatDate(sendAfter, "datetime") })}</p>
      ) : null}
    </div>
  );
}
