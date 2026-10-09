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
  "SUPPRESSED",
  "ALLOWLIST",
  "LISTING_CLOSED",
  "CANCELLED",
  "FAILED",
]);

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
    <div className={cn("max-w-full text-right sm:max-w-[60%]", className)}>
      <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", TONE[state])}>
        {t(`outcome.${state}`)}
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
