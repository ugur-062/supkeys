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
import { useState } from "react";
import { AssistantPanel } from "./assistant-panel";

const SEAT_ROLES = ["SATIN_ALMACI", "SATISCI"];

/**
 * Faz AI-2 — sağ-alt floating launcher + sağdan slide-over asistan paneli.
 * Yalnız Silver+ ∧ SA/ST kullanıcıda görünür (AI-0 erişim kapısıyla aynı; asıl
 * güvenlik backend'de — bu UX katmanı). Panel açık değilken içerik mount edilmez.
 */
export function AssistantLauncher() {
  const { user, company } = useCompanyAuth();
  const [open, setOpen] = useState(false);

  const eligible =
    !!user &&
    !!company &&
    tierAtLeast(company.tier, "SILVER") &&
    user.roles.some((r) => SEAT_ROLES.includes(r));
  if (!eligible) return null;

  return (
    <>
      <button
        type="button"
        aria-label="AI Asistan"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full",
          "bg-zinc-900 text-white shadow-lg transition hover:bg-zinc-700 hover:shadow-xl",
        )}
      >
        <Sparkles className="h-5 w-5" />
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
