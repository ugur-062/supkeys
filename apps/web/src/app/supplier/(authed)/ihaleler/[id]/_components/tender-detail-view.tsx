"use client";

// Items ve Files tab'ları tenant tarafıyla aynı — yeniden kullanıyoruz
// (kapalı zarf gereği `Davetli Tedarikçiler` ve `Teklifler` tab'ları YOK).
import { FilesTab } from "@/app/dashboard/ihaleler/[id]/_components/files-tab";
import { ItemsTab } from "@/app/dashboard/ihaleler/[id]/_components/items-tab";
import { MessageDialog } from "@/components/messaging/message-dialog";
import { BidStatusBadge } from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import { useSupplierTenderDetail } from "@/hooks/use-supplier-tenders";
import { cn } from "@/lib/utils";
import {
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@headlessui/react";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  ChevronRight,
  Loader2,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuctionLiveCard } from "./auction-live-card";
import { SupplierGeneralInfoTab } from "./general-info-tab";
import { SupplierTenderHeaderCard } from "./header-card";
import { MyBidTab } from "./my-bid-tab";

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center px-1 py-3 mr-6 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
  "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
  "data-selected:border-zinc-900 data-selected:text-zinc-950",
  "focus:outline-none",
);

function TabBadge({ count }: { count: number }) {
  return (
    <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] bg-zinc-100 text-zinc-600 group-data-selected:bg-zinc-200 group-data-selected:text-zinc-800">
      {count}
    </span>
  );
}

export function SupplierTenderDetailView({ id }: { id: string }) {
  const detail = useSupplierTenderDetail(id);
  const [messageOpen, setMessageOpen] = useState(false);

  if (detail.isLoading && !detail.data) {
    return (
      <div className="max-w-5xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">İhale yükleniyor…</p>
      </div>
    );
  }

  // Refetch hatasında cached veriyi koru; sadece veri tamamen yoksa hata göster.
  if (!detail.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-zinc-900">İhale bulunamadı</p>
          <p className="text-sm text-slate-500">
            Bu ihaleye davet edilmemiş olabilirsiniz veya ihale yayından
            kaldırılmış olabilir.
          </p>
          <Link href="/supplier/ihaleler" className="inline-block">
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
  const hasBid = !!tender.myBid;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link
          href="/supplier/ihaleler"
          className="hover:text-zinc-700 hover:underline"
        >
          İhaleler
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-mono text-zinc-700">{tender.tenderNumber}</span>
      </nav>

      <SupplierTenderHeaderCard tender={tender} />

      {/* V2-7 — İngiliz Usulü canlı eksiltme kartı (sadece açık eksiltmede) */}
      {tender.type === "ENGLISH_AUCTION" ? (
        <AuctionLiveCard tender={tender} />
      ) : null}

      {/* Alıcı firma bilgisi — sadece adı (kapalı zarf) */}
      <section className="card p-4 bg-slate-50/40 border-slate-200 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">
            Alıcı Firma
          </p>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400" />
            <p className="font-semibold text-zinc-900">{tender.tenant.name}</p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setMessageOpen(true)}
        >
          <MessageCircle className="w-4 h-4" />
          Alıcıya Mesaj
        </Button>
      </section>

      {/*
        ÖNEMLİ — KAPALI ZARF: "Davetli Tedarikçiler" ve "Teklifler" sekmeleri
        tedarikçi tarafında YOK. Diğer tedarikçiler/teklifler asla erişilemez.
      */}
      <TabGroup defaultIndex={hasBid ? 0 : 1} className="space-y-4">
        <TabList
          className="border-b border-zinc-950/10 flex overflow-x-auto"
          aria-label="İhale detay sekmeleri"
        >
          <Tab className={TRIGGER_CLASSES}>
            Teklifim
            {hasBid && tender.myBid ? (
              <span className="ml-2">
                <BidStatusBadge status={tender.myBid.status} />
              </span>
            ) : null}
          </Tab>
          <Tab className={TRIGGER_CLASSES}>Genel Bilgi</Tab>
          <Tab className={TRIGGER_CLASSES}>
            Kalemler
            <TabBadge count={tender.items.length} />
          </Tab>
          <Tab className={TRIGGER_CLASSES}>Dosyalar</Tab>
        </TabList>

        <TabPanels>
          <TabPanel className="outline-none">
            <MyBidTab tender={tender} />
          </TabPanel>
          <TabPanel className="outline-none">
            <SupplierGeneralInfoTab tender={tender} />
          </TabPanel>
          <TabPanel className="outline-none">
            <ItemsTab
              items={tender.items}
              currency={tender.primaryCurrency}
              showTargetPrice
            />
          </TabPanel>
          <TabPanel className="outline-none">
            <FilesTab surface="supplier" tender={tender} />
          </TabPanel>
        </TabPanels>
      </TabGroup>

      <MessageDialog
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        surface="supplier"
        otherPartyId={tender.tenant.id}
        defaultContext={{ context: "TENDER", contextRefId: tender.id }}
        currentUserType="SUPPLIER_USER"
        otherPartyName={tender.tenant.name}
        contextNumber={`İhale ${tender.tenderNumber}`}
      />
    </div>
  );
}
