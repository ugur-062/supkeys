"use client";

import { TenderMessagesButton } from "@/components/messaging/tender-messages-button";
import { Button } from "@/components/ui/button";
import { useTenderDetail } from "@/hooks/use-tenant-tenders";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { cn } from "@/lib/utils";
import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Gavel,
  Info,
  Layers,
  Loader2,
  Paperclip,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { BidsTab } from "./bids-tab";
import { FilesTab } from "./files-tab";
import { GeneralInfoTab } from "./general-info-tab";
import { TenderHeaderCard } from "./header-card";
import { ItemsTab } from "./items-tab";

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
  "data-selected:border-zinc-900 data-selected:text-zinc-950",
  "focus:outline-none",
);

function TabBadge({ count }: { count: number }) {
  return (
    <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 group-data-selected:bg-zinc-900 group-data-selected:text-white">
      {count}
    </span>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Layers;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50">
        <Icon className="h-4 w-4 text-zinc-600" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
          {label}
        </p>
        <p className="truncate text-sm font-semibold text-zinc-900">{value}</p>
      </div>
    </div>
  );
}

export function TenderDetailView({ id }: { id: string }) {
  const detail = useTenderDetail(id);

  // İlk yükleme (cache'te veri yok ve fetch ilerliyor)
  if (detail.isLoading && !detail.data) {
    return (
      <div className="max-w-7xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">İhale yükleniyor…</p>
      </div>
    );
  }

  // Veri yoksa hata göster — `isError` tek başına yeterli değil çünkü
  // refetch hatası kayıtlı veriyi silmez; sadece data tamamen yoksa
  // "bulunamadı" göster.
  if (!detail.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">İhale bulunamadı</p>
          <p className="text-sm text-slate-500">
            Bu ihale silinmiş veya size ait olmayabilir.
          </p>
          <Link href="/dashboard/ihaleler" className="inline-block">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
              İhaleler
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const tender = detail.data;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link
          href="/dashboard/ihaleler"
          className="hover:text-brand-700 hover:underline"
        >
          İhaleler
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-mono text-brand-700">{tender.tenderNumber}</span>
      </nav>

      <TenderHeaderCard tender={tender} />

      {/* Meta bar — tedarikçi ihale detayıyla aynı standart */}
      <section className="rounded-2xl border border-zinc-950/5 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <MetaItem
              icon={Layers}
              label="Kalem"
              value={`${tender.items.length} kalem`}
            />
            <MetaItem
              icon={Wallet}
              label="Para Birimi"
              value={`${tender.primaryCurrency} ${CURRENCY_SYMBOL[tender.primaryCurrency]}`}
            />
            <MetaItem
              icon={CalendarClock}
              label="Kapanış"
              value={format(new Date(tender.bidsCloseAt), "d MMM yyyy HH:mm", {
                locale: tr,
              })}
            />
            <MetaItem
              icon={Users}
              label="Davetli"
              value={`${tender.bidStats.invitedCount} tedarikçi`}
            />
            <MetaItem
              icon={Gavel}
              label="Teklif"
              value={`${tender.bidStats.submitted}`}
            />
          </div>
          <TenderMessagesButton
            tenderId={tender.id}
            tenderNumber={tender.tenderNumber}
          />
        </div>
      </section>

      {/* Detay sayfaya gömülü — varsayılan sekme Teklifler. Genel Bilgi /
          Kalemler / Dosyalar artık aynı sayfada (modal kaldırıldı). */}
      <TabGroup defaultIndex={0} className="space-y-5">
        <TabList
          className="border-b border-zinc-950/10 flex overflow-x-auto"
          aria-label="İhale detay sekmeleri"
        >
          <Tab className={TRIGGER_CLASSES}>
            <Gavel className="h-4 w-4" />
            Teklifler
          </Tab>
          <Tab className={TRIGGER_CLASSES}>
            <Info className="h-4 w-4" />
            Genel Bilgi
          </Tab>
          <Tab className={TRIGGER_CLASSES}>
            <Layers className="h-4 w-4" />
            Kalemler
            <TabBadge count={tender.items.length} />
          </Tab>
          <Tab className={TRIGGER_CLASSES}>
            <Paperclip className="h-4 w-4" />
            Dosyalar
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel className="outline-none">
            <BidsTab tender={tender} />
          </TabPanel>
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
    </div>
  );
}
