"use client";

import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Globe,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Yeni ihale akışının İLK adımı — kapsam seçimi (Yurtiçi / Uluslararası).
 * Bu seçim hangi tedarikçilerin göreceğini + teslim şekli + belgeleri belirler.
 * Seçim sonrası ihale türü adımına (?scope=...) geçilir.
 */
export function TenderScopeSelection() {
  const router = useRouter();
  const go = (scope: "domestic" | "international") =>
    router.push(`/dashboard/ihaleler/yeni?scope=${scope}`);

  return (
    <div className="max-w-5xl mx-auto pb-24">
      <header className="mb-8">
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-1.5 text-xs text-slate-500"
        >
          <Link href="/dashboard" className="hover:text-brand-700">
            Dashboard
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link href="/dashboard/ihaleler" className="hover:text-brand-700">
            İhaleler
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-brand-700 font-medium">İhale Oluştur</span>
        </nav>
        <h1 className="font-semibold text-2xl md:text-3xl text-brand-900 mt-3">
          İhale Oluştur
        </h1>
        <p className="text-slate-600 mt-1 text-sm">
          İhaleniz yurtiçi mi yoksa uluslararası mı? Bu seçim hangi
          tedarikçilerin göreceğini, teslim şeklini ve belgeleri belirler.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Yurtiçi */}
        <button
          type="button"
          onClick={() => go("domestic")}
          className="group relative bg-white border-2 border-slate-200 hover:border-brand-400 rounded-2xl p-6 text-left transition-all hover:shadow-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-2"
        >
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500 group-hover:w-2 transition-all"
          />
          <div className="flex items-start gap-4 mb-4">
            <div className="h-14 w-14 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-200 transition">
              <MapPin className="h-7 w-7 text-brand-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-brand-900">Yurtiçi</h3>
              <p className="text-sm text-slate-500 mt-1">Aynı ülkedeki tedarikçiler</p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-slate-600 mb-6">
            <li className="flex gap-2">
              <span aria-hidden className="text-brand-500 flex-shrink-0">•</span>
              <span>Sizinle aynı ülkedeki tedarikçiler görür.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-brand-500 flex-shrink-0">•</span>
              <span>Sade teslim şekli (nakliye dahil / fabrika teslim).</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-brand-500 flex-shrink-0">•</span>
              <span>Yerel para birimi + irsaliye akışı.</span>
            </li>
          </ul>
          <div className="flex items-center justify-end">
            <span className="inline-flex items-center gap-2 text-brand-600 font-semibold text-sm group-hover:gap-3 transition-all">
              Devam
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </button>

        {/* Uluslararası */}
        <button
          type="button"
          onClick={() => go("international")}
          className="group relative bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-2xl p-6 text-left transition-all hover:shadow-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2"
        >
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 group-hover:w-2 transition-all"
          />
          <div className="flex items-start gap-4 mb-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-100 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 transition">
              <Globe className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-brand-900">
                Uluslararası
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Yurtdışındaki tedarikçiler
              </p>
            </div>
          </div>
          <ul className="space-y-2 text-sm text-slate-600 mb-6">
            <li className="flex gap-2">
              <span aria-hidden className="text-emerald-500 flex-shrink-0">•</span>
              <span>Ülkeniz dışındaki (yabancı) tedarikçiler görür.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-emerald-500 flex-shrink-0">•</span>
              <span>Incoterms teslim şekilleri (EXW, FOB, CIF…).</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-emerald-500 flex-shrink-0">•</span>
              <span>Döviz + konşimento akışı.</span>
            </li>
          </ul>
          <div className="flex items-center justify-end">
            <span className="inline-flex items-center gap-2 text-emerald-600 font-semibold text-sm group-hover:gap-3 transition-all">
              Devam
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </button>
      </div>

      <div className="mt-6 text-center">
        <Link href="/dashboard/ihaleler">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
            İhale listesine dön
          </Button>
        </Link>
      </div>
    </div>
  );
}
