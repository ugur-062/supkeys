"use client";

// Items ve Files tab'ları tenant tarafıyla aynı — yeniden kullanıyoruz
// (kapalı zarf gereği `Davetli Tedarikçiler` ve `Teklifler` tab'ları YOK).
import { FilesTab } from "@/app/dashboard/ihaleler/[id]/_components/files-tab";
import { ItemsTab } from "@/app/dashboard/ihaleler/[id]/_components/items-tab";
import { BidStatusBadge } from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import { useSupplierTenderDetail } from "@/hooks/use-supplier-tenders";
import { cn } from "@/lib/utils";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  ChevronRight,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { SupplierGeneralInfoTab } from "./general-info-tab";
import { SupplierTenderHeaderCard } from "./header-card";
import { MyBidTab } from "./my-bid-tab";

const TRIGGER_CLASSES = cn(
  "group inline-flex items-center px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
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

export function SupplierTenderDetailView({ id }: { id: string }) {
  const detail = useSupplierTenderDetail(id);

  if (detail.isLoading && !detail.data) {
    return (
      <div className="max-w-5xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">İhale yükleniyor…</p>
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-danger-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-danger-600" />
          </div>
          <p className="font-medium text-brand-900">İhale bulunamadı</p>
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
          className="hover:text-brand-700 hover:underline"
        >
          İhaleler
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-mono text-brand-700">{tender.tenderNumber}</span>
      </nav>

      <SupplierTenderHeaderCard tender={tender} />

      {/* Alıcı firma bilgisi — sadece adı (kapalı zarf) */}
      <section className="card p-4 bg-slate-50/40 border-slate-200">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-1">
          Alıcı Firma
        </p>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <p className="font-semibold text-brand-900">{tender.tenant.name}</p>
        </div>
      </section>

      <TabsPrimitive.Root
        defaultValue={hasBid ? "my-bid" : "general"}
        className="space-y-4"
      >
        <TabsPrimitive.List
          className="border-b border-surface-border flex gap-1 overflow-x-auto"
          aria-label="İhale detay sekmeleri"
        >
          <TabsPrimitive.Trigger value="my-bid" className={TRIGGER_CLASSES}>
            Teklifim
            {hasBid && tender.myBid ? (
              <span className="ml-2">
                <BidStatusBadge status={tender.myBid.status} />
              </span>
            ) : null}
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="general" className={TRIGGER_CLASSES}>
            Genel Bilgi
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="items" className={TRIGGER_CLASSES}>
            Kalemler
            <TabBadge count={tender.items.length} />
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="files" className={TRIGGER_CLASSES}>
            Dosyalar
            <TabBadge count={tender.attachments.length} />
          </TabsPrimitive.Trigger>
          {/*
            ÖNEMLİ — KAPALI ZARF:
            "Davetli Tedarikçiler" ve "Teklifler" sekmeleri tedarikçi tarafında
            YOK. Diğer tedarikçiler veya tekliflerine asla erişilemez.
          */}
        </TabsPrimitive.List>

        <TabsPrimitive.Content value="my-bid" className="outline-none">
          <MyBidTab tender={tender} />
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="general" className="outline-none">
          <SupplierGeneralInfoTab tender={tender} />
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="items" className="outline-none">
          <ItemsTab items={tender.items} currency={tender.primaryCurrency} />
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="files" className="outline-none">
          <FilesTab attachments={tender.attachments} />
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  );
}
