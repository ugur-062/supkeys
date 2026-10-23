"use client";

import { useRelativeTime } from "@/i18n/domain";
import { useTranslations } from "next-intl";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import {
  useThreads,
  useUnreadMessages,
  type MessagePortal,
} from "@/hooks/use-company-messages";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { MessageSquare } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCompanyPermissionsSynced } from "@/hooks/use-company-auth";
import { POPOVER_ANCHOR, POPOVER_MAX_HEIGHT_CLASS } from "./popover-anchor";


/** "Bu konuşmada ben kimim?" rozeti — birleşik kutu satırları. */
const ROLE_CHIP: Record<MessagePortal, { label: string; cls: string }> = {
  satinalma: { label: "aliciSiniz", cls: "bg-blue-50 text-blue-700" },
  satis: { label: "saticiSiniz", cls: "bg-emerald-50 text-emerald-700" },
};

/** Panel içeriği ayrı bileşen — thread sorgusu yalnızca popover AÇILINCA atılır. */
function RecentThreads({ close }: { close: () => void }) {
  const tr = useTranslations("web.panel.shell.messagesPopover");
  const ago = useRelativeTime("short");
  // Birleşik kutu (2026-08-02): iki tarafın konuşmaları birlikte.
  // `isPending`: çevrimdışı duraklayan sorguda `isLoading` false kalır ve
  // "Henüz mesajınız yok" çizilirdi (LİSTE DURUMLARI).
  const { data: threads, isPending, isError, refetch } = useThreads("all");
  const recent = (threads ?? []).slice(0, 6);

  if (isPending) {
    return (
      <div className="space-y-2 p-3" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-100" />
        ))}
      </div>
    );
  }
  // Kesinti ≠ boş kutu (arayüz testi D-070): 5xx'te "Henüz mesajınız yok"
  // yanıltıyordu.
  if (isError && !threads) {
    return (
      <div role="alert" className="px-4 py-8 text-center">
        <p className="text-sm text-zinc-600">{tr("yuklenemedi")}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
        >
          {tr("tekrarDene")}
        </button>
      </div>
    );
  }
  if (recent.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <MessageSquare className="mx-auto size-7 text-zinc-300" aria-hidden />
        <p className="mt-2 text-sm text-zinc-500">{tr("henuzMesajinizYok")}</p>
      </div>
    );
  }
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {recent.map((t) => (
        <li key={`${t.portal}:${t.threadId}`}>
          <Link
            href={`/company/mesajlar?with=${t.otherPartyId}&portal=${t.portal}`}
            onClick={close}
            className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-zinc-50"
          >
            <AvatarInitials
              name={t.otherPartyName}
              size="sm"
              className="mt-0.5"
            />
            {/* Mobil denetim g04: ad, rol rozeti ve tarih tek satırdaydı; RU'da
                ad 'QA Ted…'e iniyor, iki firma ayırt edilemiyordu. Adın
                yanında yalnız tarih kalır, ad iki satıra sarar; rozet önizleme
                satırının başında (panel her ekranda 22rem, kural her yerde). */}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span
                  className={`line-clamp-2 min-w-0 break-words text-sm ${
                    t.unread
                      ? "font-semibold text-zinc-900"
                      : "font-medium text-zinc-700"
                  }`}
                  title={t.otherPartyName}
                >
                  {t.otherPartyName}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {ago(t.lastMessageAt)}
                </span>
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold ${ROLE_CHIP[t.portal].cls}`}
                >
                  {tr(ROLE_CHIP[t.portal].label as never)}
                </span>
                <span
                  className={`min-w-0 truncate text-xs ${
                    t.unread ? "font-medium text-zinc-700" : "text-zinc-400"
                  }`}
                  title={t.lastMessagePreview ?? undefined}
                >
                  {t.lastMessagePreview ?? "—"}
                </span>
              </span>
            </span>
            {t.unread ? (
              <span
                className="mt-2 size-2 shrink-0 rounded-full bg-blue-500"
                aria-label={tr("okunmamis")}
              />
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Topbar mesaj önizlemesi — zil deseniyle aynı: son konuşmalar + okunmamış
 * rozeti; öğe tıklaması ilgili konuşmayı açar (?with=), altta "Tüm mesajlar".
 */
export function MessagesPopover() {
  const t = useTranslations("web.panel.shell.messagesPopover");
  // Rozet İKİ tarafın toplamı (arayüz testi D-354): kutu birleşik, rozet de
  // birleşik olmalı — B18'deki "aktif portal" rozeti öbür portala gelen
  // okunmamışı gizliyordu. Portal'sız uç yalnız kullanıcının OKUYABİLDİĞİ
  // tarafları sayar (API `unreadCount`). İzinler /me ile tazelenene dek
  // istek atılmaz (D-299: bayat anlık görüntüyle 403 olmasın).
  const synced = useCompanyPermissionsSynced();
  const { data: unreadData } = useUnreadMessages(undefined, synced);
  const unread = unreadData?.count ?? 0;

  return (
    <Popover className="relative">
      {/* İkon + ALTINDA etiket (2026-09-08, kullanıcı): çıplak ikon ne olduğunu
          yalnız hover ipucuyla söylüyordu. Rozet ikonun kendi kutusuna
          çapalanır — düğme etiketle genişlediği için düğmenin köşesine
          çapalansaydı sayı ikonun yanından kopardı. */}
      <PopoverButton
        aria-label={unread > 0 ? t("mesajlarOkunmamis", { n: unread }) : t("mesajlar")}
        className="flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span className="relative">
          <MessageSquare className="size-5" aria-hidden />
          {unread > 0 ? (
            <span className="absolute -top-1.5 -right-2 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </span>
        {/* Dar ekranda etiket gizli (O-049) — ad aria-label'da. */}
        <span className="hidden text-[10px] leading-none font-semibold sm:block" aria-hidden>
          {t("mesajlar")}
        </span>
      </PopoverButton>

      <PopoverPanel
        anchor={POPOVER_ANCHOR}
        // B16: panel viewport'a sığar; liste iç scroll, başlık/footer sabit —
        // son öğe kesilmez, footer üstüne binmez. Mobil denetim g04: boşluk ve
        // ekran payı Headless'ın hesabında (`popover-anchor.ts`; panel sol
        // kenara yapışıyordu); 30rem tavanı değişkenle (Headless'ın satır içi
        // `max-height`i onu okur; yatay telefonda ana ekran çizgisi payı da
        // düşülür — `POPOVER_MAX_HEIGHT_CLASS`); telefonda ekran eni − 2×8 px.
        className={`z-50 flex w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-zinc-950/10 bg-white shadow-lg ring-1 ring-zinc-950/5 ${POPOVER_MAX_HEIGHT_CLASS} sm:w-[22rem]`}
      >
        {({ close }) => (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
              <span className="text-sm font-semibold text-zinc-900">
                {t("mesajlar")}
              </span>
            </div>
            <RecentThreads close={close} />
            {/* Bağlantı satırın TAMAMI — 44 px, eski satır yüksekliğiyle aynı
                (py-2.5 + gövde satır kutusu); zildeki "Tüm bildirimleri gör"
                gibi tüm satır dokunma alanı. */}
            <div className="shrink-0 border-t border-zinc-100 text-center">
              <Link
                href="/company/mesajlar"
                onClick={() => close()}
                className="flex min-h-11 items-center justify-center px-4 text-sm font-semibold text-zinc-700 hover:text-zinc-950"
              >
                {t("tumMesajlariGor")}
              </Link>
            </div>
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
