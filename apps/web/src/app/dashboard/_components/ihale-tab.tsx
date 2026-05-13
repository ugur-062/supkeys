"use client";

import { cn } from "@/lib/utils";
import { FileX2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DashboardKpiCard } from "./dashboard-kpi-card";

export interface IhaleTabData {
  closedForBids: number; // Teklife Kapandı İhaleler
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
          label="Teklife Kapandı İhaleler"
          value={data.closedForBids}
          hint="Tedarikçilerinizi bilgilendirmek için ihale durumunuzu belirtin"
          warning
          href="/dashboard/ihaleler?tab=IN_AWARD"
          accent="warning"
        />
        <DashboardKpiCard
          label="Kazandırma Aşamasındaki İhaleler"
          value={data.inAward}
          hint="Kazandırmaya kaldığınız yerden devam edin."
          href="/dashboard/ihaleler?tab=IN_AWARD"
          accent="brand"
        />
        <DashboardKpiCard
          label="Kazandırılan İhaleler"
          value={data.awarded}
          hint="Kazandırılan ihalelerinizi inceleyerek siparişe dönüştürün."
          href="/dashboard/ihaleler?tab=AWARDED"
          accent="success"
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
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success-500" />
            <h2 className="font-display text-base font-bold text-brand-900">
              Teklife Açık İhaleler
            </h2>
          </div>
          <Link
            href="/dashboard/ihaleler?tab=OPEN_FOR_BIDS"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Tümünü İncele →
          </Link>
        </header>

        {/* Alt sekmeler */}
        <div className="flex gap-6 border-b border-slate-100 px-5">
          <button
            type="button"
            onClick={() => setSubTab("own")}
            className={cn(
              "-mb-px border-b-2 py-2.5 text-sm font-medium transition-colors",
              subTab === "own"
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700",
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
                ? "border-brand-500 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            Firmanızın İhaleleri ({data.openTendersCompany.length} İhale)
          </button>
        </div>

        {/* Tablo / boş durum */}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <FileX2 className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">
              Görüntülenecek bir ihale bulunmamaktadır.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">İhale No</th>
                <th className="px-5 py-3">İhale Adı</th>
                <th className="px-5 py-3">Açılış Tarihi</th>
                <th className="px-5 py-3">Kapanış Tarihi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/40">
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">
                    {r.tenderNumber}
                  </td>
                  <td className="px-5 py-3 text-brand-900">
                    <Link
                      href={`/dashboard/ihaleler/${r.id}`}
                      className="font-medium hover:text-brand-700"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">
                    {formatDate(r.openedAt)}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">
                    {formatDate(r.closesAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
