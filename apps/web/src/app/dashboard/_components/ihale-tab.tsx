"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { cn } from "@/lib/utils";
import { FileX2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DashboardKpiCard } from "./dashboard-kpi-card";

export interface IhaleTabData {
  closedForBids: number; // Teklife Kapanan İhaleler
  inAward: number; // Kazandırma Aşaması
  awarded: number; // Kazandırılan İhaleler
  ongoingOrders: number; // Devam Eden Siparişler
  openTendersOwn: OpenTenderRow[]; // Oluşturduğunuz ihaleler (teklife açık)
  openTendersCompany: OpenTenderRow[]; // Firma genelindeki ihaleler
}

export interface OpenTenderRow {
  id: string;
  tenderNumber: string;
  title: string;
  openedAt: string; // ISO
  closesAt: string; // ISO
}

interface Props {
  data: IhaleTabData;
}

type SubTab = "own" | "company";

export function IhaleTab({ data }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("own");
  const rows = subTab === "own" ? data.openTendersOwn : data.openTendersCompany;

  return (
    <div className="space-y-6">
      {/* 4 KPI kartı */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          label="Teklife Kapanan İhaleler"
          value={data.closedForBids}
          hint="Tedarikçilerinizi bilgilendirmek için ihale durumunuzu belirtin"
          warning
          href="/dashboard/ihaleler?tab=IN_AWARD"
          accent="warning"
        />
        <DashboardKpiCard
          label="Kazandırılan İhaleler"
          value={data.awarded}
          hint="Kazandırılan ihalelerinizi inceleyerek siparişe dönüştürün."
          href="/dashboard/ihaleler?tab=AWARDED"
          accent="success"
        />
        <DashboardKpiCard
          label="Kazandırma Aşamasındaki İhaleler"
          value={data.inAward}
          hint="Kazandırmaya kaldığınız yerden devam edin."
          href="/dashboard/ihaleler?tab=IN_AWARD"
          accent="brand"
        />
        <DashboardKpiCard
          label="Devam Eden Siparişler"
          value={data.ongoingOrders}
          hint="Teslim aldığınız siparişlerin durumunu belirtin"
          warning
          href="/dashboard/siparisler"
          accent="indigo"
        />
      </div>

      {/* Teklife Açık İhaleler paneli */}
      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-950/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success-500" />
            <h2 className="text-base font-semibold text-zinc-950">
              Teklife Açık İhaleler
            </h2>
          </div>
          <Link
            href="/dashboard/ihaleler?tab=OPEN_FOR_BIDS"
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
            Oluşturduğunuz İhaleler ({data.openTendersOwn.length} İhale)
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
            Firmanızın İhaleleri ({data.openTendersCompany.length} İhale)
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
                    <TableCell className="font-mono text-xs text-zinc-600">
                      {r.tenderNumber}
                    </TableCell>
                    <TableCell className="text-zinc-900">
                      <Link
                        href={`/dashboard/ihaleler/${r.id}`}
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
