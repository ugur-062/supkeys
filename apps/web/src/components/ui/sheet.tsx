"use client";

import { cn } from "@/lib/utils";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

/**
 * ÇEKMECE — Headless Dialog; `side="bottom"` (mobil süzgeç) ya da `"right"`
 * (mobil menü). Mobilde tam yükseklik, sm+ üstünde sağ çekmece dar (max-w-sm),
 * alt çekmece `max-h-[88vh]`. Başlık/gövde/altlık yuvaları; gövde kaydırılır,
 * altlık sabit (CTA hep görünür). Odak tuzağı ve Esc Headless'tan.
 */
export function Sheet({
  open,
  onClose,
  title,
  side = "bottom",
  header,
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Ekran okuyucu başlığı; `header` verilmezse görünür başlık olarak da basılır. */
  title: string;
  side?: "bottom" | "right";
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("web.shared.ui");
  const bottom = side === "bottom";
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-zinc-950/40" aria-hidden />
      <DialogPanel
        className={cn(
          "fixed z-50 flex flex-col bg-white shadow-2xl",
          // Güvenli alan (mobil kabuk): alt çekmecenin altlığı ana ekran
          // çizgisinin, sağ çekmecenin başlığı durum çubuğunun altında kalmaz;
          // yatay telefonda çentik tarafı pay alır. Pay 0 iken eskisiyle aynı.
          bottom
            ? "inset-x-0 bottom-0 max-h-[88vh] rounded-t-3xl pr-(--safe-right) pb-(--safe-bottom) pl-(--safe-left)"
            : "inset-y-0 right-0 h-dvh w-full pt-(--safe-top) pr-(--safe-right) pb-(--safe-bottom) sm:max-w-sm sm:ring-1 sm:ring-zinc-950/10",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-950/5 px-5 py-3">
          {header ?? <DialogTitle className="text-sm font-semibold text-zinc-900">{title}</DialogTitle>}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            // Dokunma alanı 44 px (20 px ikon + 2 × 12 px), ikon yerinde: eksi
            // kenar boşluğu dolguyu götürür; 12 px başlığın `gap-3`/`py-3`üne sığar.
            className="-m-3 rounded-lg p-3 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {header ? <DialogTitle className="sr-only">{title}</DialogTitle> : null}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-zinc-950/5 px-5 py-3">{footer}</div> : null}
      </DialogPanel>
    </Dialog>
  );
}
