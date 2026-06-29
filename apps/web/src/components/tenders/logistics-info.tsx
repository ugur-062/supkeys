"use client";

// Lojistik İhalesi — taşıma bilgisi görüntüleme bloğu.
// Alıcı + tedarikçi ihale detayı ve wizard özetinde kullanılır.

import { formatDate } from "@/lib/tenders/date";
import { TRANSPORT_MODE_LABELS } from "@/lib/tenders/labels";
import type { TenderLogisticsDetails } from "@/lib/tenders/types";
import {
  ArrowRight,
  MapPin,
  Package,
  Truck,
} from "lucide-react";

function fmtDate(iso: string | null | undefined): string | null {
  return iso ? formatDate(iso) : null;
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-zinc-900 break-words">{value}</dd>
    </div>
  );
}

export function LogisticsInfoCard({
  details,
  className,
}: {
  details: TenderLogisticsDetails;
  className?: string;
}) {
  const flags = [
    details.hazardous ? "Tehlikeli Madde (ADR)" : null,
    details.refrigerated ? "Soğuk Zincir" : null,
    details.fragile ? "Kırılabilir" : null,
    details.stackable ? "İstiflenebilir" : null,
  ].filter((f): f is string => f !== null);

  const origin = [details.originCity, details.originDistrict]
    .filter(Boolean)
    .join(" / ");
  const destination = [details.destinationCity, details.destinationDistrict]
    .filter(Boolean)
    .join(" / ");

  const loading = fmtDate(details.loadingDate);
  const delivery = fmtDate(details.deliveryDate);

  return (
    <section
      className={
        className ??
        "rounded-2xl border border-teal-200 bg-teal-50/30 p-5 space-y-4"
      }
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
          <Truck className="w-4 h-4 text-teal-700" />
        </div>
        <h3 className="font-display font-bold text-base text-zinc-900">
          Lojistik Bilgileri
        </h3>
        <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">
          {details.transportMode
            ? (TRANSPORT_MODE_LABELS[details.transportMode] ??
              details.transportMode)
            : "—"}
        </span>
      </div>

      {/* Rota */}
      <div className="flex items-center gap-3 rounded-xl bg-white border border-surface-border p-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-sm font-semibold text-zinc-900 truncate">
            {origin}
          </span>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-4 h-4 text-zinc-600 shrink-0" />
          <span className="text-sm font-semibold text-zinc-900 truncate">
            {destination}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Cell label="Kargo Cinsi" value={details.cargoType} />
        {details.weightKg != null ? (
          <Cell
            label="Ağırlık"
            value={`${details.weightKg.toLocaleString("tr-TR")} kg`}
          />
        ) : null}
        {details.volumeM3 != null ? (
          <Cell
            label="Hacim"
            value={`${details.volumeM3.toLocaleString("tr-TR")} m³`}
          />
        ) : null}
        {details.packageCount != null ? (
          <Cell label="Kap / Palet" value={details.packageCount} />
        ) : null}
        {details.vehicleType ? (
          <Cell label="Araç / Ekipman" value={details.vehicleType} />
        ) : null}
        {loading ? <Cell label="Yükleme Tarihi" value={loading} /> : null}
        {delivery ? <Cell label="Teslim Tarihi" value={delivery} /> : null}
      </dl>

      {details.originAddress || details.destinationAddress ? (
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-teal-200/60">
          {details.originAddress ? (
            <Cell
              label="Çıkış Adresi"
              value={
                <span className="whitespace-pre-wrap">
                  {details.originAddress}
                </span>
              }
            />
          ) : null}
          {details.destinationAddress ? (
            <Cell
              label="Varış Adresi"
              value={
                <span className="whitespace-pre-wrap">
                  {details.destinationAddress}
                </span>
              }
            />
          ) : null}
        </dl>
      ) : null}

      {flags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Package className="w-4 h-4 text-slate-400" />
          {flags.map((f) => (
            <span
              key={f}
              className="inline-flex items-center rounded-md bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700"
            >
              {f}
            </span>
          ))}
        </div>
      ) : null}

      {details.notes ? (
        <div className="rounded-xl bg-white border border-surface-border p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Lojistik Notu
          </p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {details.notes}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Liste/başlık için küçük "Lojistik" rozeti. */
export function LogisticsBadge({ className }: { className?: string }) {
  return (
    <span
      className={
        className ??
        "inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700"
      }
    >
      <Truck className="w-3 h-3" />
      Lojistik
    </span>
  );
}
