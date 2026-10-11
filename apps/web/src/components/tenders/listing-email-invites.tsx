"use client";

import { Subheading } from "@/components/catalyst/heading";
import { InviteOutcome } from "@/components/tenders/ai-suppliers/invite-outcome";
import { CountryLabel } from "@/components/ui/country-flag";
import { useListingEmailInvites, type ListingEmailInviteSource } from "@/hooks/use-listing-email-invites";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";

/**
 * E-POSTAYLA DAVET EDİLENLER — talep sayfasının sahip görünümünde KALICI bölüm
 * (2026-10-09, canlı doğrulama D3 / AI-UI-1).
 *
 * "Davetli Tedarikçiler" yalnız Rothern üyelerini (talep daveti) listeler;
 * kayıtsız adrese giden davet e-postaları — elle pencereden gönderilenler ve
 * otomatik turun gönderdikleri — alıcıya hiçbir yerde kalıcı görünmüyordu
 * (yalnız turun durum bandında, o da "Gizle" denince kayboluyordu).
 *
 * Satır: firma adı + altında DAVETİN GİTTİĞİ ADRES (ad bilinmiyorsa yalnız
 * adres) · ülke · nasıl davet edildi (elle / AI) · durum + neden, sıradaysa
 * planlanan gönderim. Adres her satırda yazılır (gözden geçirme R7): aynı
 * firmanın iki posta kutusu davet edilince (uk@ ve export@) ya da alıcı adresi
 * pencerede düzeltince satırlar yalnız adla ayırt edilemiyordu. Durum ve neden
 * etiketleri durum bandıyla TEK kaynaktan (`InviteOutcome`). Hiç davet yoksa
 * bölüm çizilmez; yükleme ve hata ayrı durumdur (hata "davet yok" gibi görünmez).
 */

/**
 * SAYFA SONU PAYI (canlı yeniden doğrulama N6, gözden geçirme R6-04).
 *
 * Bölüm talep sayfasının SON öğesidir. Sayfanın en altında son satırın durum
 * rozeti sabit AI Asistan düğmesinin altında kalıyordu (1440 px'te 16×7 px):
 * panel kabuğunun içerik alt boşluğu 1024 px'ten itibaren 32 px'tir
 * (`shell.tsx`: `pb-24`, ama `lg:py-8` onu ezer), düğmenin tepesi ise ekranın
 * altından 88 px yukarıdadır (`assistant-launcher.tsx`: `bottom-8` + `h-14`).
 * Daha dar ekranda kabuğun 96 px'lik boşluğu yerindedir, örtüşme olmaz.
 *
 * İlk düzeltme YALNIZ son satırın rozetini sağdan içeri çekiyordu (`pr-16
 * sm:pr-14`): örtüşmenin hiç olmadığı telefonda da son rozet öteki satırların
 * rozet sütunundan 64 px solda duruyor, satırın metin sütunu o kadar
 * daralıyordu. Artık hiçbir rozet kaydırılmaz — bütün satırlarda aynı sütunda,
 * sona yaslı kalır; bölüm geniş ekranda kabuğun eksik boşluğunu (64 px) kendisi
 * ekler, böylece son satır sayfanın sonunda düğmenin ÜSTÜNE kadar kayar
 * (32 + 64 = 96 px, dar ekrandaki boşlukla aynı).
 */
const PAGE_END_CLEARANCE_CLASS = "lg:pb-16";

/** Elle pencereden yapılan davet (`AI_FORM`: alıcı seçti) de alıcının davetidir; yalnız tur `AI_AUTO` yazar. */
function sourceKind(source: ListingEmailInviteSource | string): "manual" | "ai" | null {
  if (source === "AI_AUTO") return "ai";
  if (source === "MANUAL" || source === "AI_FORM") return "manual";
  return null;
}

export function ListingEmailInvites({
  listingId,
  enabled = true,
  inviteWindowOpen = false,
  className,
}: {
  listingId: string;
  /** Uç `buy:view` ister — izni olmayan üyede istek atılmaz, bölüm çizilmez. */
  enabled?: boolean;
  /** Elle davet penceresi ("AI ile tedarikçi bul") açık mı — kapanınca liste yeniden okunur. */
  inviteWindowOpen?: boolean;
  className?: string;
}) {
  const t = useTranslations("web.panel.requests.emailInvites");
  const tError = useTranslations("web.shared.errorState");
  const headingId = useId();
  const q = useListingEmailInvites(listingId, enabled);
  const { refetch } = q;

  // Pencereden davet gönderilmiş olabilir: kapanınca güncel listeyi oku.
  const wasOpen = useRef(inviteWindowOpen);
  useEffect(() => {
    if (wasOpen.current && !inviteWindowOpen && enabled) void refetch();
    wasOpen.current = inviteWindowOpen;
  }, [inviteWindowOpen, enabled, refetch]);

  if (!enabled) return null;

  const items = q.data;
  // Elde liste varsa (arka plan tazelemesi düşse de) o gösterilir.
  if (!items) {
    if (q.isError) {
      return (
        <section className={cn("space-y-2", className)} aria-labelledby={headingId}>
          <Subheading id={headingId}>{t("heading")}</Subheading>
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-red-700">
            <span className="min-w-0">{t("error")}</span>
            <button
              type="button"
              onClick={() => void refetch()}
              className="shrink-0 font-medium text-blue-700 underline-offset-2 hover:underline"
            >
              {tError("tekrarDene")}
            </button>
          </div>
        </section>
      );
    }
    return (
      <section className={cn("space-y-2", className)} aria-labelledby={headingId} aria-busy="true">
        <Subheading id={headingId}>{t("heading")}</Subheading>
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          {t("loading")}
        </p>
      </section>
    );
  }
  if (items.length === 0) return null;

  return (
    <section className={cn("space-y-2", PAGE_END_CLEARANCE_CLASS, className)} aria-labelledby={headingId}>
      <Subheading id={headingId}>{t("headingCount", { n: items.length })}</Subheading>
      <p className="text-xs text-zinc-600">{t("lead")}</p>
      <ul className="divide-y divide-zinc-950/5 rounded-xl bg-white ring-1 ring-zinc-950/5">
        {items.map((i) => {
          const kind = sourceKind(i.source);
          const name = i.name?.trim() || null;
          // Ad adresin kendisiyse (ad yerine adres kaydedilmiş) ikinci kez yazılmaz.
          const showAddress = !!name && name.toLowerCase() !== i.email.trim().toLowerCase();
          return (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2.5">
              <div className="min-w-0 flex-[1_1_11rem]">
                {/* Adres tek sözcüktür: dar ekranda satırı genişletmesin diye her yerden bölünebilir. */}
                <p className="text-sm font-medium text-zinc-900 [overflow-wrap:anywhere]">{name ?? i.email}</p>
                {showAddress ? (
                  <p className="mt-0.5 text-xs text-zinc-600 [overflow-wrap:anywhere]">{i.email}</p>
                ) : null}
                {i.country || kind ? (
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
                    {i.country ? <CountryLabel code={i.country} /> : null}
                    {kind ? (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                          kind === "ai" ? "bg-blue-50 text-blue-800 ring-blue-600/20" : "bg-zinc-100 text-zinc-700 ring-zinc-600/10",
                        )}
                      >
                        {kind === "ai" ? t("sourceAi") : t("sourceManual")}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              {/* Rozet her satırda AYNI sütunda, sona yaslı (R6-04: satıra özel sağ pay yok). */}
              <InviteOutcome invite={i.invite} reason={i.reason} sendAfter={i.sendAfter} className="ml-auto" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
