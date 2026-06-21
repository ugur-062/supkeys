"use client";

// V2-7+ — "İhale Detayını Gör" pop-up'ı. Detay sayfası default'u sadece
// Teklifler tablosunu gösterir; geri kalan tüm bilgi (Genel/Kalemler/Davetli/
// Dosyalar) bu modal'da toplanır. Teklifler burada TEKRAR gösterilmez.

import { IconButton } from "@/components/ui/icon-button";
import { TenderLiveStatusPill } from "@/components/tenders/countdown-full";
import { TenderTypeBadge } from "@/components/tenders/status-badge";
import type { TenderDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { X } from "lucide-react";
import { FilesTab } from "./files-tab";
import { GeneralInfoTab } from "./general-info-tab";
import { ItemsTab } from "./items-tab";

interface Props {
  open: boolean;
  onClose: () => void;
  tender: TenderDetail;
}

const TAB_CLASSES = cn(
  "group inline-flex items-center px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap focus:outline-none rounded-t-md",
  "border-transparent text-zinc-500 hover:text-zinc-700",
  "data-selected:border-zinc-900 data-selected:text-zinc-900",
);

function TabBadge({ count }: { count: number }) {
  return (
    <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-zinc-100 text-zinc-600 group-data-selected:bg-zinc-900 group-data-selected:text-white">
      {count}
    </span>
  );
}

export function TenderDetailDialog({ open, onClose, tender }: Props) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150"
      />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-2 sm:p-4">
        <DialogPanel
          transition
          className="flex h-[90vh] max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10 outline-none transition data-closed:opacity-0 data-enter:duration-200 data-leave:duration-150 data-closed:data-enter:scale-95"
        >
          {/* Header */}
          <header className="px-6 pt-5 pb-4 border-b border-zinc-950/5 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm text-zinc-700 font-mono font-semibold">
                    {tender.tenderNumber}
                  </code>
                  <TenderTypeBadge type={tender.type} />
                  <TenderLiveStatusPill status={tender.status} />
                  {tender.roundNumber > 1 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 text-xs font-bold">
                      Tur #{tender.roundNumber}
                    </span>
                  ) : null}
                </div>
                <DialogTitle className="font-semibold text-xl text-zinc-950 leading-tight truncate">
                  {tender.title}
                </DialogTitle>
              </div>
              <IconButton aria-label="Kapat" onClick={onClose} className="-mr-1">
                <X className="w-5 h-5" />
              </IconButton>
            </div>
          </header>

          {/* Tabs */}
          <TabGroup className="flex flex-col min-h-0 flex-1">
            <TabList className="px-6 border-b border-zinc-950/5 flex gap-1 overflow-x-auto shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Tab className={TAB_CLASSES}>Genel Bilgi</Tab>
              <Tab className={TAB_CLASSES}>
                Kalemler
                <TabBadge count={tender.items.length} />
              </Tab>
              <Tab className={TAB_CLASSES}>Dosyalar</Tab>
            </TabList>

            <TabPanels className="overflow-y-auto px-6 py-5 min-h-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabPanel className="outline-none">
                <GeneralInfoTab tender={tender} />
              </TabPanel>
              <TabPanel className="outline-none">
                <ItemsTab
                  items={tender.items}
                  currency={tender.primaryCurrency}
                  showTargetPrice
                />
              </TabPanel>
              <TabPanel className="outline-none">
                <FilesTab tender={tender} />
              </TabPanel>
            </TabPanels>
          </TabGroup>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
