"use client";

import { useCompanyAuth, useCompanyMe } from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import {
  PORTALS,
  accessiblePortals,
  activePortalFromPath,
  type PortalKey,
} from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import * as Headless from "@headlessui/react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AssistantLauncher } from "./assistant/assistant-launcher";
import { CompanySidebarContent } from "./sidebar";
import { CompanyTopbar } from "./topbar";

/** Ray genişlikleri — içerik payı DAİMA dar raya göre; genişleme üstüne biner. */
const RAIL = "4.5rem"; // 72px
const RAIL_EXPANDED = "16rem"; // 256px

export function CompanyShell({ children }: { children: React.ReactNode }) {
  // Login sonrası /me ile firma + roller tazelenir.
  useCompanyMe();
  const pathname = usePathname();
  const { company, user } = useCompanyAuth();
  const pinned = usePortalStore((s) => s.sidebarPinned);
  const lastPortal = usePortalStore((s) => s.lastPortal);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const available = accessiblePortals(user?.roles ?? [], company?.tier);
  const activePortal: PortalKey =
    activePortalFromPath(pathname) ??
    (lastPortal && available.includes(lastPortal) ? lastPortal : null) ??
    available[0] ??
    "satis";

  const expanded = pinned || hovered;

  return (
    <div className="min-h-svh bg-zinc-50">
      <CompanyTopbar
        activePortal={activePortal}
        onOpenMobileNav={() => setMobileOpen(true)}
      />

      {/* Masaüstü rayı — mouse gelince genişler (pin ile sabitlenebilir).
          P0: hover genişlemesi OVERLAY'dir (gölgeyle üste biner) — içerik
          yalnız "Menüyü sabitle" aktifken itilir; KPI başlıklarının kırılıp
          kartların zıplaması biter. */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ width: expanded ? RAIL_EXPANDED : RAIL }}
        className={cn(
          "fixed top-14 bottom-0 left-0 z-30 hidden border-r border-zinc-950/10 bg-white transition-[width] duration-200 ease-out lg:block",
          expanded && !pinned && "shadow-xl",
        )}
      >
        <CompanySidebarContent expanded={expanded} />
      </aside>

      {/* Mobil çekmece */}
      <Headless.Dialog
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        className="lg:hidden"
      >
        <Headless.DialogBackdrop
          transition
          className="fixed inset-0 z-40 bg-black/30 transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
        />
        <Headless.DialogPanel
          transition
          className="fixed inset-y-0 left-0 z-50 w-full max-w-72 bg-white shadow-xl transition duration-300 ease-in-out data-closed:-translate-x-full"
        >
          <div className="flex h-14 items-center justify-between border-b border-zinc-100 px-4">
            <span className="text-sm font-semibold text-zinc-900">
              {available.length === 0 ? "Menü" : PORTALS[activePortal].label}
            </span>
            <Headless.CloseButton
              aria-label="Menüyü kapat"
              className="flex size-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-900"
            >
              <X className="size-5" aria-hidden />
            </Headless.CloseButton>
          </div>
          <div className="h-[calc(100%-3.5rem)]">
            <CompanySidebarContent
              expanded
              showPin={false}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </Headless.DialogPanel>
      </Headless.Dialog>

      {/* İçerik — üstte topbar payı; sol pay ray genişliğini AYNI animasyonla
          izler (menü açılınca içerik sağa kayar, üstüne binmez).
          Beyaz kart deseni korunur: sayfalar önceki görünümüyle aynı kalır. */}
      <main
        className={cn(
          "flex min-h-svh flex-col pt-14 transition-[padding] duration-200 ease-out",
          pinned ? "lg:pl-64" : "lg:pl-[4.5rem]",
        )}
      >
        <div className="flex grow flex-col p-2 pt-2">
          {/* P0: alt nefes payı (pb-24) — AI asistan FAB'ı pagination /
              "Devam" gibi son satır aksiyonlarının üstüne binmesin. */}
          <div className="grow rounded-xl bg-white p-6 pb-24 shadow-xs ring-1 ring-zinc-950/5 lg:p-10 lg:pb-24">
            <div id="icerik" className="mx-auto max-w-6xl">
              {children}
            </div>
          </div>
        </div>
      </main>

      {/* Faz AI-2 — asistan (Silver+ ∧ SA/ST'de görünür; kapı içeride) */}
      <AssistantLauncher />
    </div>
  );
}
