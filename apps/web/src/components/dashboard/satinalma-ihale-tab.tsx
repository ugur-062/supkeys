"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";
import { TcmbRatesWidget } from "@/components/tcmb-rates-widget";
import type { SatinalmaDashboard } from "@/hooks/use-company-dashboard";
import { cn } from "@/lib/utils";
import { FileX2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type SubTab = "own" | "company";

/** Satınalma panosu — İhale sekmesi (eski ihale-tab markup'ı, yeni veri). */
export function SatinalmaIhaleTab({ data }: { data: SatinalmaDashboard }) {
  const [subTab, setSubTab] = useState<SubTab>("own");
  const rows =
    subTab === "own" ? data.openTendersOwn : data.openTendersCompany;

  return (
    <div className="space-y-6">
      {/* 4 KPI kartı */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          label="Açık İhalelerim"
          value={data.openCount}
          hint="Teklife açık ihalelerini takip et."
          href="/company/satinalma/ihalelerim"
          accent="brand"
        />
        <DashboardKpiCard
          label="Gelen Teklifler"
          value={data.bidsReceived}
          hint="İhalelerine gelen teklifleri incele ve kazandır."
          warning
          href="/company/satinalma/ihalelerim"
          accent="warning"
        />
        <DashboardKpiCard
          label="Kazandırılan İhaleler"
          value={data.awarded}
          hint="Kazandırılan ihalelerini siparişe dönüştür."
          href="/company/satinalma/ihalelerim"
          accent="success"
        />
        <DashboardKpiCard
          label="Devam Eden Siparişler"
          value={data.ongoingOrders}
          hint="Teslim aldığın siparişlerin durumunu belirt."
          warning
          href="/company/satinalma/siparisler"
          accent="indigo"
        />
      </div>

      {/* KPI altı — satış paneliyle aynı desen: sol geniş içerik + sağ kur kutusu */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
      {/* Teklife Açık İhaleler paneli */}
      <section className="card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-950/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success-500" />
            <h2 className="text-base font-semibold text-zinc-950">
              Teklife Açık İhaleler
            </h2>
          </div>
          <Link
            href="/company/satinalma/ihalelerim"
            className="text-sm font-semibold text-zinc-900 hover:text-zinc-600"
          >
            Tümünü İncele →
          </Link>
        </header>

        {/* Alt sekmeler */}
        <div className="flex gap-6 border-b border-zinc-950/5 px-5">
          <button
            type="button"
            onClick={() => setSubTab("own")}
            className={cn(
              "-mb-px border-b-2 py-2.5 text-sm font-medium transition-colors",
              subTab === "own"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700",
            )}
          >
            Oluşturduğun İhaleler ({data.openTendersOwn.length} İhale)
          </button>
          <button
            type="button"
            onClick={() => setSubTab("company")}
            className={cn(
              "-mb-px border-b-2 py-2.5 text-sm font-medium transition-colors",
              subTab === "company"
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700",
            )}
          >
            Firmanın İhaleleri ({data.openTendersCompany.length} İhale)
          </button>
        </div>

        {/* Tablo / boş durum */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
              <FileX2 className="h-7 w-7 text-zinc-400" />
            </div>
            <p className="text-sm text-zinc-500">
              Görüntülenecek bir ihale bulunmamaktadır.
            </p>
          </div>
        ) : (
          <div className="px-3 [--gutter:--spacing(5)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>İhale No</TableHeader>
                  <TableHeader>İhale Adı</TableHeader>
                  <TableHeader>Açılış Tarihi</TableHeader>
                  <TableHeader>Kapanış Tarihi</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums text-xs text-zinc-600">
                      {r.tenderNumber}
                    </TableCell>
                    <TableCell className="text-zinc-900">
                      <Link
                        href={`/company/ilan/${r.id}`}
                        className="font-medium hover:text-zinc-600"
                      >
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums text-zinc-600">
                      {formatDate(r.openedAt)}
                    </TableCell>
                    <TableCell className="tabular-nums text-zinc-600">
                      {formatDate(r.closesAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
        </div>

        {/* Sağ ray — TCMB kurları */}
        <div className="space-y-4">
          <TcmbRatesWidget />
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
