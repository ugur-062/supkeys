"use client";

import {
  useDismissListingDiscovery,
  useListingDiscovery,
  type CandidateInviteState,
  type RunCandidate,
} from "@/hooks/use-supplier-discovery";
import { AUTO_INVITE_OFF_REASON, InviteOutcome, WEAK_MATCH_REASON } from "@/components/tenders/ai-suppliers/invite-outcome";
import { CountryFlag } from "@/components/ui/country-flag";
import { listingEmailInvitesKey } from "@/hooks/use-listing-email-invites";
import { countryDisplayName } from "@/i18n/domain";
import { cn } from "@/lib/utils";
import type { Locale } from "@rothern/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * YAYIN SONRASI AI KEŞFİ — YALNIZ DURUM (2026-10-08, sahip: "kutu seçiliyse AI
 * arasın ve göndersin, bir daha sormasın; kutu falan gelmesine gerek yok").
 *
 * Tur bulduğunu KENDİSİ davet eder (API `DiscoveryRunsService`); burada
 * onaylanacak, seçilecek, gönderilecek bir şey YOK. İki yüzey, tek bileşen:
 *  - `panel`: yayın sonrası panel,
 *  - `band`: talep sayfası (sahibin görünümü); "Gizle" bandı kapatır —
 *    sonuç bildirimi bağlantısı (`?ai-davet=1`) gizlenmiş bandı da geri
 *    getirir (canlı doğrulama AI-UI-1: bağlantı boş sayfa açıyordu).
 * Gösterilen: aranıyor → kaç tedarikçi bulundu · kaçı davet edildi (üye talebe
 * davetli / e-posta gitti) · kaç davet sırada · kaçı gönderilmedi; açılır
 * listede ad, ülke ve sonuç (+ neden). `?ai-davet=1` listeyi açık getirir.
 * Elle seçip davet etmek isteyen talep sayfasındaki "AI ile tedarikçi bul"
 * penceresini kullanır. E-postayla davet edilenlerin KALICI listesi talep
 * sayfasında ayrı bölümdür (`listing-email-invites.tsx`); tur bitince o liste
 * buradan tazelenir.
 */
interface Row {
  key: string;
  name: string;
  country: string | null;
  member: boolean;
  invite: CandidateInviteState;
  reason: string | null;
}

/**
 * Adayın davet sonucu. API `invite` alanını verir; alanı henüz taşımayan
 * (dağıtım sırasında eski) yanıtta ham durumdan türetilir.
 */
export function candidateOutcome(
  c: Pick<RunCandidate, "status" | "invite" | "inviteReason">,
  runActive: boolean,
): { invite: CandidateInviteState; reason: string | null } {
  if (c.invite) return { invite: c.invite, reason: c.inviteReason ?? null };
  if (c.status === "INVITED") return { invite: "INVITED", reason: null };
  if (c.status === "ALREADY_INVITED") return { invite: "ALREADY_INVITED", reason: null };
  if (c.status === "CONSENT_REQUIRED") return { invite: "NOT_SENT", reason: "CONSENT_REQUIRED" };
  return { invite: runActive ? "WAITING" : "NOT_SENT", reason: null };
}

/**
 * Bant başlığının sayıları (canlı doğrulama AI-UI-2): "davet edildi" YALNIZ
 * gerçekten davet edileni sayar (üye talebe davetli ya da e-posta gitti);
 * sırada bekleyen e-posta ayrı sayılır — eskiden ikisi toplanıyor, başlık 20
 * e-posta henüz çıkmamışken "23 davet edildi" diyordu (satırlarla ve sonuç
 * bildirimiyle çelişiyordu). Zaten davetli / bekleyen satır hiçbir parçaya girmez.
 */
export function inviteCounts(rows: ReadonlyArray<{ invite: CandidateInviteState; reason?: string | null }>): {
  found: number;
  invited: number;
  queued: number;
  notSent: number;
} {
  const count = (state: CandidateInviteState) => rows.filter((r) => r.invite === state).length;
  // Zayıf eşleşme (yalnız genel sektör) bilinçli olarak davet edilmez; bir
  // gönderim hatası değildir → "gönderilmedi" sayısına ve açıklama cümlesinin
  // "hiçbiri gönderilmedi" dalına girmez. Satırında nedeni yazar.
  const notSent = rows.filter((r) => r.invite === "NOT_SENT" && r.reason !== WEAK_MATCH_REASON).length;
  return { found: rows.length, invited: count("INVITED"), queued: count("QUEUED"), notSent };
}

/**
 * Liste üstündeki açıklama SAYILARLA UYUŞUR (canlı doğrulama AUTO-UI-7). Tek
 * cümle "bulunan tedarikçiler sizin adınıza davet edildi" diyordu; alıcı
 * otomatik aramayı kapatınca yedi satırın yedisi "Gönderilmedi" iken de aynı
 * cümle duruyordu. Gönderilmeyen yoksa eski cümle; hepsi gönderilmediyse
 * "davet gönderilmedi"; arası "bir kısmı davet edildi, gönderilmeyenin nedeni
 * satırında".
 */
export function statusLeadKey(counts: {
  found: number;
  notSent: number;
}): "statusLead" | "statusLeadPartial" | "statusLeadNoneSent" {
  if (counts.notSent === 0) return "statusLead";
  return counts.notSent >= counts.found ? "statusLeadNoneSent" : "statusLeadPartial";
}

export function ListingSuggestions({
  listingId,
  variant,
  defaultOpen = false,
  onDismiss,
}: {
  listingId: string;
  variant: "panel" | "band";
  /**
   * Sonuç bildirimi bağlantısı (`?ai-davet=1`) — liste açık gelir ve "Gizle"
   * ile kapatılmış bant yeniden çizilir. Bileşen BAĞLIYKEN de izlenir: değer
   * sonradan true olursa bant ve liste yine açılır.
   */
  defaultOpen?: boolean;
  /** "Gizle"ye basıldı — sayfa bağlantı parametresini adresten siler (aynı bildirim yeniden tıklanabilsin). */
  onDismiss?: () => void;
}) {
  const t = useTranslations("web.panel.requests.aiSuppliers");
  const locale = useLocale() as Locale;
  const qc = useQueryClient();
  const q = useListingDiscovery(listingId);
  const dismiss = useDismissListingDiscovery(listingId);
  const [open, setOpen] = useState(defaultOpen);
  // Gizlenmiş bandı bağlantı geri getirdi; bu sayfada yeniden "Gizle" denene dek kalır.
  const [revealed, setRevealed] = useState(defaultOpen);
  // Bağlantı sayfa AÇIKKEN de gelir (gözden geçirme R1): zil ve canlı bildirim
  // `router.push` ile gezinir; yalnız arama parametresi değişince Next sayfa
  // örneğini korur → bileşen yeniden bağlanmaz, `useState(defaultOpen)` yeni
  // değeri hiç görmezdi ("Gizle" denmiş bant bağlantıya rağmen gizli kalıyordu).
  // Yalnız false → true geçişi bir şey açar; parametrenin silinmesi (true →
  // false) açık listeyi kapatmaz. Çizim sırasında düzeltilir (efekt değil):
  // bant bir kare bile gizli çizilmez.
  const [seenDefaultOpen, setSeenDefaultOpen] = useState(defaultOpen);
  if (defaultOpen !== seenDefaultOpen) {
    setSeenDefaultOpen(defaultOpen);
    if (defaultOpen) {
      setOpen(true);
      setRevealed(true);
    }
  }

  const runs = useMemo(() => q.data?.runs ?? [], [q.data]);
  const searching = runs.some((r) => r.state === "PENDING" || r.state === "RUNNING");
  const dismissed = runs.length > 0 && runs.every((r) => r.dismissedAt);

  // Tur bitti → kuyruğa aldığı e-posta davetleri talep sayfasındaki kalıcı
  // listede de görünsün. İlk yüklemede tetiklenmez (liste zaten yeni okunur).
  const finishedRuns = runs.filter((r) => r.state === "DONE" || r.state === "FAILED").length;
  const hasData = !!q.data;
  const seenFinished = useRef<number | null>(null);
  useEffect(() => {
    if (!hasData) return;
    if (seenFinished.current !== null && finishedRuns > seenFinished.current) {
      void qc.invalidateQueries({ queryKey: listingEmailInvitesKey(listingId) });
    }
    seenFinished.current = finishedRuns;
  }, [hasData, finishedRuns, listingId, qc]);

  const rows = useMemo(() => {
    const seen = new Map<string, Row>();
    for (const r of runs) {
      const active = r.state === "PENDING" || r.state === "RUNNING";
      for (const c of r.candidates) {
        const key = c.memberCompanyId ? `m:${c.memberCompanyId}` : (c.email ?? c.id).toLowerCase();
        if (seen.has(key)) continue;
        const out = candidateOutcome(c, active);
        seen.set(key, {
          key,
          name: c.name,
          country: c.country ?? null,
          member: !!c.memberCompanyId,
          invite: out.invite,
          reason: out.reason,
        });
      }
    }
    return [...seen.values()];
  }, [runs]);
  const counts = inviteCounts(rows);
  // Sıfır olan parça yazılmaz ("0 davet sırada" bilgi taşımaz).
  const headerParts = [
    counts.invited > 0 ? t("bandInvited", { n: counts.invited }) : null,
    counts.queued > 0 ? t("bandQueued", { n: counts.queued }) : null,
    counts.notSent > 0 ? t("bandNotSent", { n: counts.notSent }) : null,
  ].filter((p): p is string => p !== null);
  const secondRound = runs.some((r) => r.trigger === "SECOND_ROUND" && r.candidates.length > 0);
  // Alıcının kendi ayarı yüzünden düşen davet var: neyin kapattığı ve nasıl geri
  // geleceği (ayar geri alınınca dağıtıcı satırları yeniden sıraya alır) söylenir.
  const autoInviteOff = rows.some((r) => r.invite === "NOT_SENT" && r.reason === AUTO_INVITE_OFF_REASON);

  if (!q.data) return null;
  if (runs.length === 0 && !(q.data.aiDiscovery && q.data.listingStatus === "OPEN")) return null;
  // Tur hiç gelmedi (yoklama tavanı doldu) → süresiz "aranıyor" bandı çizilmez.
  if (runs.length === 0 && q.emptyPollExhausted) return null;
  // Embargolu talep: tur açılışta yazılır — "aranıyor" değil bekleme metni.
  const awaitingOpen = runs.length === 0 && !!q.data.startsAt;
  const pending = searching || runs.length === 0;
  // Talep sayfası: hiçbir şey bulunmamış turun bandı çizilmez; gizlenmiş bant
  // yalnız sonuç bağlantısıyla (`?ai-davet=1`) gelindiyse çizilir.
  if (variant === "band" && ((dismissed && !revealed) || (!pending && rows.length === 0))) return null;

  return (
    <section
      className={cn(
        "rounded-2xl border p-4 text-left",
        variant === "band" ? "border-blue-200 bg-blue-50/50" : "border-zinc-200 bg-white",
      )}
      aria-live="polite"
    >
      {/* Satır kalıbı (gözden geçirme R5): metin `flex-[1_1_12rem]` — tabanı 0
          iken (`flex-1`) satır hiç sarmıyor, başlık iki bağlantının yanında
          kalan dar sütuna (390 px'te TR 135 px / 5 satır, RU 91 px / 9 satır;
          360 px'te sözcükler taşıyordu) sıkışıyordu. Artık metin en az 12rem
          alır; sığmayan eylemler kendi satırına iner, sağa yaslanır. 12rem:
          320 px'te de simgeyle aynı satırda kalır. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Sparkles className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-[1_1_12rem]">
          {awaitingOpen ? (
            <p className="text-sm font-medium text-zinc-900">{t("bandAwaitingOpen")}</p>
          ) : pending ? (
            <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              {t("bandSearching")}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm font-medium text-zinc-900">{t("bandNone")}</p>
          ) : (
            <p className="text-sm font-semibold text-zinc-900">
              {t("bandFound", { n: counts.found })}
              {headerParts.length > 0 ? (
                <span className="font-normal text-zinc-700">{headerParts.map((p) => ` · ${p}`).join("")}</span>
              ) : null}
            </p>
          )}
          {secondRound ? <p className="text-xs text-zinc-600">{t("secondRound")}</p> : null}
        </div>
        {rows.length > 0 || variant === "band" ? (
          <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap">
            {rows.length > 0 ? (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className="text-sm font-medium text-blue-700 hover:underline"
              >
                {open ? t("hideList") : t("showList")}
              </button>
            ) : null}
            {variant === "band" && runs.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setRevealed(false);
                  // Zaten gizlenmiş (bağlantıyla geri gelmiş) turda sunucuya yazılacak bir şey yok.
                  if (!dismissed) dismiss.mutate();
                  onDismiss?.();
                }}
                disabled={dismiss.isPending}
                className="text-sm text-zinc-600 hover:text-zinc-900"
              >
                {t("dismiss")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {open && rows.length > 0 ? (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-zinc-700">{t(statusLeadKey(counts))}</p>
          {autoInviteOff ? <p className="text-xs text-zinc-700">{t("statusLeadAutoOff")}</p> : null}
          <ul className="divide-y divide-zinc-950/5 rounded-xl bg-white ring-1 ring-zinc-950/5">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-zinc-900">
                    <span className="min-w-0 break-words">{r.name}</span>
                    {r.member ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 ring-1 ring-blue-600/20">
                        {t("groupMembers")}
                      </span>
                    ) : null}
                  </p>
                  {r.country ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-zinc-600">
                      <CountryFlag code={r.country} decorative />
                      {countryDisplayName(r.country, locale)}
                    </p>
                  ) : null}
                </div>
                <InviteOutcome invite={r.invite} reason={r.reason} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
