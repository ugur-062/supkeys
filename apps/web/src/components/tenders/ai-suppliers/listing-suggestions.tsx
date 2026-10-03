"use client";

import { Button } from "@/components/ui/button";
import {
  useDismissListingDiscovery,
  useInviteDiscoveryCandidates,
  useListingDiscovery,
  type RunCandidate,
} from "@/hooks/use-supplier-discovery";
import { isInviteAccepted } from "@/lib/tenders/external-invite-status";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { toast } from "sonner";
import { CandidateList, isSelectable, type CandidateRow } from "./candidate-list";

/**
 * YAYIN SONRASI AI ÖNERİLERİ (2026-09-27, Faz 1; kullanıcı: "ihale açıldıktan
 * sonra bile şirketler bulundu, tek tıkla davet gönder diyelim").
 *
 * İki yüzey, tek bileşen:
 *  - `panel`: yayın sonrası panel — tur sürerken "AI arıyor…", bitince liste açık.
 *  - `band`: talep sayfası — sahibin görünümünde bant; `?ai-davet=1` (bildirim/
 *    e-posta bağlantısı) listeyi açık getirir; "Gizle" bir daha göstermez.
 * Bulunanlar SEÇİLİ gelir; kullanıcının çıkardığı yeniden seçilmez. Davet
 * kuyruğa girer (alıcının dilinde, kendi ülkesinde mesai saatinde). Rothern
 * üyeleri (2026-09-28) listenin en üstünde; onlar DOĞRUDAN talebe davet edilir.
 */
function toRow(c: RunCandidate): CandidateRow {
  return {
    key: c.id,
    name: c.name,
    email: c.email,
    website: c.website,
    city: c.city,
    country: c.country ?? null,
    reason: c.reason,
    matchedItems: c.matchedItems ?? [],
    scope: c.scope ?? null,
    status: c.status,
    recentlyInvited: c.recentlyInvited ?? false,
    memberCompanyId: c.memberCompanyId ?? null,
    matchedCategories: c.matchedCategories ?? [],
    alsoOnWeb: c.source === "BOTH" || (c.source === "WEB" && !!c.memberCompanyId),
  };
}

export function ListingSuggestions({
  listingId,
  itemNames,
  buyerCountry,
  variant,
  defaultOpen = false,
}: {
  listingId: string;
  itemNames: string[];
  buyerCountry: string | null | undefined;
  variant: "panel" | "band";
  defaultOpen?: boolean;
}) {
  const t = useTranslations("web.panel.requests.aiSuppliers");
  const q = useListingDiscovery(listingId);
  const invite = useInviteDiscoveryCandidates(listingId);
  // Çift tık ikinci davet isteği atmasın (arayüz testi FX-00 O-082).
  const sendLock = useSubmitLock();
  const dismiss = useDismissListingDiscovery(listingId);
  const [open, setOpen] = useState(variant === "panel" || defaultOpen);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string>>(new Set());

  const runs = useMemo(() => q.data?.runs ?? [], [q.data]);
  const searching = runs.some((r) => r.state === "PENDING" || r.state === "RUNNING");
  const dismissed = runs.length > 0 && runs.every((r) => r.dismissedAt);
  const rows = useMemo(() => {
    const byEmail = new Map<string, CandidateRow>();
    for (const r of runs) {
      for (const c of r.candidates) {
        const k = c.memberCompanyId ? `m:${c.memberCompanyId}` : (c.email ?? c.id).toLowerCase();
        if (!byEmail.has(k)) byEmail.set(k, toRow(c));
      }
    }
    return [...byEmail.values()];
  }, [runs]);
  const open_ = useMemo(() => rows.filter(isSelectable), [rows]);
  const abroad = open_.filter((r) => r.scope === "ABROAD" && !r.memberCompanyId).length;
  const members = open_.filter((r) => r.memberCompanyId).length;
  const secondRound = runs.some(
    (r) => r.trigger === "SECOND_ROUND" && r.candidates.some((c) => c.status === "SUGGESTED" || c.status === "MEMBER"),
  );

  // Yeni gelen seçilebilir adaylar SEÇİLİ başlar (bir kez; kullanıcı çıkardıysa kalır).
  useEffect(() => {
    const fresh = open_.filter((r) => !seen.current.has(r.key));
    if (fresh.length === 0) return;
    fresh.forEach((r) => seen.current.add(r.key));
    setSelected((s) => new Set([...s, ...fresh.map((r) => r.key)]));
  }, [open_]);

  if (!q.data) return null;
  if (runs.length === 0 && !(q.data.aiDiscovery && q.data.listingStatus === "OPEN")) return null;
  // Tur hiç gelmedi (yoklama tavanı doldu) → süresiz "aranıyor" bandı çizilmez.
  if (runs.length === 0 && q.emptyPollExhausted) return null;
  // Embargolu talep: tur açılışta yazılır — "aranıyor" değil bekleme metni.
  const awaitingOpen = runs.length === 0 && !!q.data.startsAt;
  if (variant === "band" && (dismissed || (!searching && open_.length === 0))) return null;

  const chosen = [...selected].filter((k) => open_.some((r) => r.key === k));

  const send = async () => {
    try {
      const { results, memberResults } = await invite.mutateAsync(chosen);
      const invitedMembers = memberResults.filter((r) => r.status === "INVITED").length;
      if (invitedMembers > 0) toast.success(t("memberInvitedToast", { n: invitedMembers }));
      const ok = results.filter((r) => isInviteAccepted(r.status)).length;
      if (ok > 0) toast.success(t("invitedToast", { n: ok }));
      const limited = memberResults.filter((r) => r.status === "DAILY_LIMIT").length;
      if (limited > 0) toast.warning(t("memberDailyLimit", { n: limited }));
      // Derin denetim LU-31: reddedilen dış davetler (günlük sınır, çıkış,
      // geçersiz adres…) sessiz kalıyordu ve seçim yine sıfırlanıyordu.
      const failedEmails = new Set(
        results
          .filter((r) => !isInviteAccepted(r.status) && r.status !== "ALREADY_INVITED")
          .map((r) => r.email.toLowerCase()),
      );
      if (failedEmails.size > 0) toast.warning(t("externalNotSent", { n: failedEmails.size }));
      const failedMembers = new Set(
        memberResults
          .filter((r) => r.status !== "INVITED" && r.status !== "ALREADY_INVITED")
          .map((r) => r.companyId),
      );
      // Seçim yalnız davet edilenlerden temizlenir; gönderilemeyenler seçili kalır.
      const keep = new Set(
        open_
          .filter((r) =>
            r.memberCompanyId
              ? failedMembers.has(r.memberCompanyId)
              : !!r.email && failedEmails.has(r.email.toLowerCase()),
          )
          .map((r) => r.key),
      );
      setSelected((s) => new Set([...s].filter((k) => keep.has(k))));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("inviteFailed")));
    }
  };

  return (
    <section
      className={cn(
        "rounded-2xl border p-4 text-left",
        variant === "band" ? "border-blue-200 bg-blue-50/50" : "border-zinc-200 bg-white",
      )}
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
          <Sparkles className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          {awaitingOpen ? (
            <p className="text-sm font-medium text-zinc-900">{t("bandAwaitingOpen")}</p>
          ) : searching || runs.length === 0 ? (
            <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("bandSearching")}
            </p>
          ) : open_.length === 0 ? (
            <p className="text-sm font-medium text-zinc-900">{t("allHandled")}</p>
          ) : (
            <p className="text-sm font-semibold text-zinc-900">
              {t("bandTitle", { n: open_.length })}{" "}
              {members > 0 ? <span className="font-normal text-zinc-700">{t("bandMembers", { n: members })} </span> : null}
              {abroad > 0 ? <span className="font-normal text-zinc-700">{t("bandAbroad", { n: abroad })}</span> : null}
            </p>
          )}
          {secondRound ? <p className="text-xs text-zinc-600">{t("secondRound")}</p> : null}
        </div>
        {open_.length > 0 ? (
          <div className="flex items-center gap-2">
            {variant === "band" ? (
              <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm font-medium text-blue-700 hover:underline">
                {open ? t("hideList") : t("showList")}
              </button>
            ) : null}
            {variant === "band" ? (
              <button
                type="button"
                onClick={() => dismiss.mutate()}
                disabled={dismiss.isPending}
                className="text-sm text-zinc-600 hover:text-zinc-900"
              >
                {t("dismiss")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {open && open_.length > 0 ? (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-zinc-700">{t("bandLead")}</p>
          <CandidateList
            candidates={rows}
            itemNames={itemNames}
            buyerCountry={buyerCountry}
            selected={selected}
            onToggle={(k) =>
              setSelected((s) => {
                const n = new Set(s);
                if (n.has(k)) n.delete(k);
                else n.add(k);
                return n;
              })
            }
            onSetMany={(keys, on) =>
              setSelected((s) => {
                const n = new Set(s);
                keys.forEach((k) => (on ? n.add(k) : n.delete(k)));
                return n;
              })
            }
            disabled={invite.isPending}
          />
          <div className="sticky bottom-2 flex justify-end">
            <Button
              type="button"
              onClick={() => void sendLock.run(send)}
              disabled={chosen.length === 0 || invite.isPending || sendLock.locked}
              iconLeft={invite.isPending || sendLock.locked ? <Loader2 className="animate-spin" /> : <Send />}
            >
              {t("inviteButton", { n: chosen.length })}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
