"use client";

// V2-7+ — "İhale Detayını Gör" pop-up'ı. Detay sayfası default'u sadece
// Teklifler tablosunu gösterir; geri kalan tüm bilgi (Genel/Kalemler/Davetli/
// Dosyalar) bu modal'da toplanır. Teklifler burada TEKRAR gösterilmez.

import {
  TenderLiveStatusPill,
} from "@/components/tenders/countdown-full";
import { TenderTypeBadge } from "@/components/tenders/status-badge";
import type { TenderDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { X } from "lucide-react";
import { FilesTab } from "./files-tab";
import { GeneralInfoTab } from "./general-info-tab";
import { ItemsTab } from "./items-tab";

interface Props {
  open: boolean;
  onClose: () => void;
  tender: TenderDetail;
}

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50",
  "data-[state=active]:border-brand-600 data-[state=active]:text-brand-700 data-[state=active]:bg-brand-50/30",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded-t-md",
);

function TabBadge({ count }: { count: number }) {
  return (
    <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 text-slate-600 group-data-[state=active]:bg-brand-100 group-data-[state=active]:text-brand-700">
      {count}
    </span>
  );
}

export function TenderDetailDialog({ open, onClose, tender }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60] backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            // Sabit boyut — sekme değişiminde modal yeniden boyutlanmasın.
            // Gövde flex-1 + overflow-y-auto ile kendi içinde kaydırılır.
            "w-[calc(100vw-2rem)] max-w-6xl h-[90vh] max-h-[calc(100vh-2rem)] flex flex-col",
            "bg-white rounded-2xl shadow-2xl outline-none overflow-hidden",
          )}
        >
          {/* Header */}
          <header className="px-6 pt-5 pb-4 border-b border-surface-border shrink-0 bg-gradient-to-br from-brand-50/60 via-white to-indigo-50/40">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm text-brand-700 font-mono font-semibold">
                    {tender.tenderNumber}
                  </code>
                  <TenderTypeBadge type={tender.type} />
                  <TenderLiveStatusPill status={tender.status} />
                  {tender.roundNumber > 1 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-xs font-bold">
                      Tur #{tender.roundNumber}
                    </span>
                  ) : null}
                </div>
                <Dialog.Title className="font-display font-bold text-xl text-brand-900 leading-tight truncate">
                  {tender.title}
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  İhale detay bilgileri — genel bilgi, kalemler, davetli
                  tedarikçiler ve dosyalar.
                </Dialog.Description>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Kapat"
                className="text-slate-400 hover:text-slate-600 shrink-0 -mr-1 -mt-0.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Tabs */}
          <TabsPrimitive.Root
            defaultValue="general"
            className="flex flex-col min-h-0 flex-1"
          >
            <TabsPrimitive.List
              className="px-6 border-b border-surface-border flex gap-1 overflow-x-auto shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="İhale detay sekmeleri"
            >
              <TabsPrimitive.Trigger value="general" className={TRIGGER_CLASSES}>
                Genel Bilgi
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger value="items" className={TRIGGER_CLASSES}>
                Kalemler
                <TabBadge count={tender.items.length} />
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger value="files" className={TRIGGER_CLASSES}>
                Dosyalar
              </TabsPrimitive.Trigger>
            </TabsPrimitive.List>

            {/* Scroll işlevi korunur (tekerlek/trackpad) ama görsel scrollbar
                çubuğu gizlenir — sabit boyut + temiz görünüm. */}
            <div className="overflow-y-auto px-6 py-5 min-h-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsPrimitive.Content value="general" className="outline-none">
                <GeneralInfoTab tender={tender} />
              </TabsPrimitive.Content>
              <TabsPrimitive.Content value="items" className="outline-none">
                <ItemsTab
                  items={tender.items}
                  currency={tender.primaryCurrency}
                  showTargetPrice
                />
              </TabsPrimitive.Content>
              <TabsPrimitive.Content value="files" className="outline-none">
                <FilesTab tender={tender} />
              </TabsPrimitive.Content>
            </div>
          </TabsPrimitive.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
