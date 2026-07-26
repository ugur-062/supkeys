"use client";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import { cn } from "@/lib/utils";
import { tierAtLeast } from "@rothern/shared";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
} from "@headlessui/react";
import { Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AssistantPanel } from "./assistant-panel";

const SEAT_ROLES = ["SATIN_ALMACI", "SATISCI"];

/** Karşılama balonu oturumda BİR KEZ gösterilir (sayfa geçişlerinde tekrar
 *  çıkıp rahatsız etmesin); ~12sn sonra kendiliğinden kaybolur. */
const GREET_SEEN_KEY = "ai-assistant-greeted";
const GREET_HIDE_MS = 12_000;

/**
 * Faz AI-2 — sağ-alt floating launcher + sağdan slide-over asistan paneli.
 * Yalnız Silver+ ∧ SA/ST kullanıcıda görünür (AI-0 erişim kapısıyla aynı; asıl
 * güvenlik backend'de — bu UX katmanı). Panel açık değilken içerik mount edilmez.
 */
export function AssistantLauncher() {
  const { user, company } = useCompanyAuth();
  const [open, setOpen] = useState(false);
  const [greet, setGreet] = useState(false);

  const eligible =
    !!user &&
    !!company &&
    tierAtLeast(company.tier, "SILVER") &&
    user.roles.some((r) => SEAT_ROLES.includes(r));

  // İlk girişte karşılama balonu — kısa gecikmeyle belirir, 12sn sonra gider.
  // "Görüldü" işareti balon fiilen GÖSTERİLİNCE yazılır (StrictMode'un çift
  // effect koşusu balonu hiç göstermeden işaretlemesin).
  useEffect(() => {
    if (!eligible || sessionStorage.getItem(GREET_SEEN_KEY)) return;
    const show = setTimeout(() => {
      sessionStorage.setItem(GREET_SEEN_KEY, "1");
      setGreet(true);
    }, 800);
    const hide = setTimeout(() => setGreet(false), 800 + GREET_HIDE_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [eligible]);

  if (!eligible) return null;

  const openPanel = () => {
    setGreet(false);
    setOpen(true);
  };

  return (
    <>
      {/* Karşılama balonu — tıklayınca panel açılır */}
      <div
        aria-hidden={!greet}
        className={cn(
          "fixed bottom-24 right-5 z-40 max-w-[260px] transition-all duration-500",
          greet && !open
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <div className="relative rounded-2xl rounded-br-sm border border-brand-200 bg-white p-3.5 shadow-xl shadow-brand-900/10">
          <button
            type="button"
            aria-label="Karşılama mesajını kapat"
            onClick={() => setGreet(false)}
            className="absolute right-2 top-2 text-zinc-300 hover:text-zinc-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={openPanel} className="text-left">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-700">
              <Sparkles className="h-4 w-4" /> Rothern Asistanı
            </p>
            <p className="mt-1 pr-3 text-sm text-zinc-600">
              {user.firstName ? `Merhaba ${user.firstName}!` : "Merhaba!"} 👋
              Bugün size nasıl yardımcı olabilirim? İhale açabilir, belge
              okuyabilir ya da sorularınızı yanıtlayabilirim.
            </p>
          </button>
        </div>
      </div>

      <button
        type="button"
        aria-label="AI Asistan"
        onClick={openPanel}
        className={cn(
          "group fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg ring-1 ring-white/20",
          "transition hover:-translate-y-0.5 hover:shadow-xl",
        )}
      >
        {/* Nefes alan halka — buton kapalıyken sürekli, dikkat çekmeden */}
        {!open ? (
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-brand-500/40 [animation-duration:2.5s]" />
        ) : null}
        <Sparkles
          className={cn(
            "h-6 w-6 transition-transform duration-300",
            "group-hover:rotate-12 group-hover:scale-110",
            greet ? "animate-bounce" : "",
          )}
        />
      </button>

      <Dialog open={open} onClose={setOpen} className="relative z-50">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-zinc-950/20 transition data-closed:opacity-0"
        />
        <div className="fixed inset-y-0 right-0 flex max-w-full">
          <DialogPanel
            transition
            className="flex w-screen max-w-md transform flex-col bg-white shadow-xl transition duration-200 ease-out data-closed:translate-x-full"
          >
            <div className="flex items-center justify-between border-b border-zinc-950/10 px-4 py-3">
              <span className="flex items-center gap-2 font-semibold text-zinc-950">
                <Sparkles className="h-5 w-5" /> Asistan
              </span>
              <button
                type="button"
                aria-label="Kapat"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <AssistantPanel />
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
