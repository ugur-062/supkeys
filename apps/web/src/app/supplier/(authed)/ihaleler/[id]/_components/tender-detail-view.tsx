"use client";

// Items ve Files tab'ları tenant tarafıyla aynı — yeniden kullanıyoruz
// (kapalı zarf gereği `Davetli Tedarikçiler` ve `Teklifler` tab'ları YOK).
import { FilesTab } from "@/app/dashboard/ihaleler/[id]/_components/files-tab";
import { ItemsTab } from "@/app/dashboard/ihaleler/[id]/_components/items-tab";
import { MessageDialog } from "@/components/messaging/message-dialog";
import { BidStatusBadge } from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import { useSupplierTenderDetail } from "@/hooks/use-supplier-tenders";
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
  Building2,
  CalendarClock,
  ChevronRight,
  Info,
  Layers,
  Loader2,
  Lock,
  MessageCircle,
  Paperclip,
  ReceiptText,
  Sparkles,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AuctionLiveCard } from "./auction-live-card";
import { SupplierGeneralInfoTab } from "./general-info-tab";
import { SupplierTenderHeaderCard } from "./header-card";
import { MyBidTab } from "./my-bid-tab";

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
  icon: typeof Building2;
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

export function SupplierTenderDetailView({ id }: { id: string }) {
  const detail = useSupplierTenderDetail(id);
  const [messageOpen, setMessageOpen] = useState(false);

  if (detail.isLoading && !detail.data) {
    return (
      <div className="max-w-6xl mx-auto py-16 flex flex-col items-center text-slate-500">
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
    <div className="max-w-6xl mx-auto space-y-5">
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

      {/* V2-7 — İngiliz Usulü canlı eksiltme kartı (sadece açık eksiltmede;
          kilitli teaser'da gösterilmez — teklif/eksiltme premium gerektirir) */}
      {tender.type === "ENGLISH_AUCTION" && !tender.locked ? (
        <AuctionLiveCard tender={tender} />
      ) : null}

      {/* Kilitli teaser — premium'a teşvik bandı */}
      {tender.locked ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">
                  Bu herkese açık ihale önizleme modunda
                </p>
                <p className="text-sm text-amber-800">
                  Alıcı firma gizli. Teklif vermek ve alıcıyı görmek için Premium
                  üyeliğe geçin.
                </p>
              </div>
            </div>
            <Link href="/supplier/premium" className="inline-block">
              <Button size="sm">
                <Sparkles className="w-4 h-4" />
                Premium'a Geç
              </Button>
            </Link>
          </div>
        </section>
      ) : null}

      {/* Meta bar — alıcı + temel bilgiler + mesaj (kapalı zarf: sadece firma adı) */}
      <section className="rounded-2xl border border-zinc-950/5 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <MetaItem
              icon={Building2}
              label="Alıcı Firma"
              value={tender.tenant?.name ?? "Gizli Alıcı"}
            />
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
          </div>
          {/* Kilitli teaser'da alıcı gizli → mesaj yok */}
          {!tender.locked ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setMessageOpen(true)}
            >
              <MessageCircle className="w-4 h-4" />
              Alıcıya Mesaj
            </Button>
          ) : null}
        </div>
      </section>

      {/*
        ÖNEMLİ — KAPALI ZARF: "Davetli Tedarikçiler" ve "Teklifler" sekmeleri
        tedarikçi tarafında YOK. Diğer tedarikçiler/teklifler asla erişilemez.
        Varsayılan sekme her zaman "Teklifim" (teklif yoksa CTA gösterir).
      */}
      <TabGroup defaultIndex={0} className="space-y-5">
        <TabList
          className="border-b border-zinc-950/10 flex overflow-x-auto"
          aria-label="İhale detay sekmeleri"
        >
          <Tab className={TRIGGER_CLASSES}>
            <ReceiptText className="h-4 w-4" />
            Teklifim
            {hasBid && tender.myBid ? (
              <span className="ml-1">
                <BidStatusBadge status={tender.myBid.status} />
              </span>
            ) : null}
          </Tab>
          <Tab className={TRIGGER_CLASSES}>
            <Layers className="h-4 w-4" />
            Kalemler
            <TabBadge count={tender.items.length} />
          </Tab>
          <Tab className={TRIGGER_CLASSES}>
            <Info className="h-4 w-4" />
            Genel Bilgi
          </Tab>
          <Tab className={TRIGGER_CLASSES}>
            <Paperclip className="h-4 w-4" />
            Dosyalar
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel className="outline-none">
            {tender.locked ? (
              <div className="rounded-2xl border border-zinc-950/5 bg-white p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
                  <Lock className="h-6 w-6 text-amber-600" />
                </div>
                <p className="font-semibold text-zinc-900">
                  Teklif vermek için Premium gerekli
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
                  Bu herkese açık ihaleye teklif verebilmek için Premium üyeliğe
                  geçin. Premium ile davet beklemeden tüm açık ihalelere teklif
                  verebilirsiniz.
                </p>
                <Link href="/supplier/premium" className="mt-4 inline-block">
                  <Button>
                    <Sparkles className="w-4 h-4" />
                    Premium'a Geç
                  </Button>
                </Link>
              </div>
            ) : (
              <MyBidTab tender={tender} />
            )}
          </TabPanel>
          <TabPanel className="outline-none">
            <ItemsTab
              items={tender.items}
              currency={tender.primaryCurrency}
              showTargetPrice
            />
          </TabPanel>
          <TabPanel className="outline-none">
            <SupplierGeneralInfoTab tender={tender} />
          </TabPanel>
          <TabPanel className="outline-none">
            <FilesTab surface="supplier" tender={tender} />
          </TabPanel>
        </TabPanels>
      </TabGroup>

      {/* Kilitli teaser'da alıcı gizli olduğundan mesaj diyalogu render edilmez. */}
      {!tender.locked && tender.tenant ? (
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
      ) : null}
    </div>
  );
}
