"use client";

import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  FileText,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export function TenderTypeSelection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope") === "international"
    ? "international"
    : "domestic";
  const goType = (type: "rfq" | "auction") =>
    router.push(`/dashboard/ihaleler/yeni?scope=${scope}&type=${type}`);

  return (
    <div className="max-w-5xl mx-auto pb-24">
      {/* Breadcrumb + heading */}
      <header className="mb-8">
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-1.5 text-xs text-slate-500"
        >
          <Link href="/dashboard" className="hover:text-brand-700">
            Dashboard
          </Link>
          <ChevronRight className="w-3 h-3" />
          <Link
            href="/dashboard/ihaleler"
            className="hover:text-brand-700"
          >
            İhaleler
          </Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-brand-700 font-medium">İhale Oluştur</span>
        </nav>
        <h1 className="font-semibold text-2xl md:text-3xl text-brand-900 mt-3">
          İhale Oluştur
        </h1>
        <p className="text-slate-600 mt-1 text-sm">
          Hangi tip ihale açmak istiyorsunuz?
        </p>
      </header>

      {/* Tip kartları */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* RFQ — aktif */}
        <button
          type="button"
          onClick={() => goType("rfq")}
          className="group relative bg-white border-2 border-slate-200 hover:border-brand-400 rounded-2xl p-6 text-left transition-all hover:shadow-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-2"
        >
          {/* Sol mavi şerit (PratisPro tarzı) */}
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500 group-hover:w-2 transition-all"
          />

          <div className="flex items-start gap-4 mb-4">
            <div className="h-14 w-14 rounded-2xl bg-brand-100 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-200 transition">
              <FileText className="h-7 w-7 text-brand-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-brand-900">
                RFQ (Teklif Talebi)
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Kapalı zarf usulü
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-sm text-slate-600 mb-6">
            <li className="flex gap-2">
              <span aria-hidden className="text-brand-500 flex-shrink-0">
                •
              </span>
              <span>Bu süreç teklif toplamayı hedefler.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-brand-500 flex-shrink-0">
                •
              </span>
              <span>Tedarikçiler yalnızca kendi teklifini görür.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-brand-500 flex-shrink-0">
                •
              </span>
              <span>
                Süre dolunca tüm teklifleri karşılaştırarak kazandırın.
              </span>
            </li>
          </ul>

          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-success-50 text-success-700 text-xs font-semibold">
              <Sparkles className="h-3 w-3" />
              Önerilen
            </span>
            <span className="inline-flex items-center gap-2 text-brand-600 font-semibold text-sm group-hover:gap-3 transition-all">
              Oluştur
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </button>

        {/* İngiliz Usulü — V2-7 aktif */}
        <button
          type="button"
          onClick={() => goType("auction")}
          className="group relative bg-white border-2 border-slate-200 hover:border-purple-400 rounded-2xl p-6 text-left transition-all hover:shadow-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:ring-offset-2"
        >
          <span
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500 group-hover:w-2 transition-all"
          />

          <div className="flex items-start gap-4 mb-4">
            <div className="h-14 w-14 rounded-2xl bg-purple-100 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-200 transition">
              <TrendingDown className="h-7 w-7 text-purple-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-brand-900">
                İngiliz Usulü İhale
              </h3>
              <p className="text-sm text-slate-500 mt-1">Açık eksiltme</p>
            </div>
          </div>

          <ul className="space-y-2 text-sm text-slate-600 mb-6">
            <li className="flex gap-2">
              <span aria-hidden className="text-purple-500 flex-shrink-0">
                •
              </span>
              <span>Bu süreç fiyat azaltmayı hedefler.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-purple-500 flex-shrink-0">
                •
              </span>
              <span>Tedarikçiler en iyi teklifi görüp altına teklif verir.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-purple-500 flex-shrink-0">
                •
              </span>
              <span>Canlı yarışma, dinamik fiyatlandırma.</span>
            </li>
          </ul>

          <div className="flex items-center justify-end">
            <span className="inline-flex items-center gap-2 text-purple-600 font-semibold text-sm group-hover:gap-3 transition-all">
              Oluştur
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </button>
      </div>

      {/* Geri */}
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
