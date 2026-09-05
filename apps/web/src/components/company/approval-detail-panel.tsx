"use client";

import { Badge } from "@/components/catalyst/badge";
import { ListSkeleton } from "@/components/list";
import { useApprovalDetail } from "@/hooks/use-company-approvals";
import { formatDate } from "@/lib/format-date";
import { currencySymbol } from "@/lib/tenders/labels";
import { BadgeCheck } from "lucide-react";
import Link from "next/link";

const STEP_LABEL: Record<string, { label: string; color: "amber" | "green" | "rose" | "zinc" }> = {
  WAITING: { label: "Sırada", color: "zinc" },
  PENDING: { label: "Bekliyor", color: "amber" },
  APPROVED: { label: "Onaylandı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "rose" },
  SKIPPED: { label: "Atlandı", color: "zinc" },
};

function money(amount: number | null | undefined, currency: string) {
  if (amount == null) return "—";
  return `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${currencySymbol(currency)}`;
}

function qty(amount: number, unit: string) {
  return `${amount.toLocaleString("tr-TR", { maximumFractionDigits: 3 })} ${unit}`.trim();
}

/**
 * Onay DETAYI — onaycının karar bağlamı (yetki tablosu Faz 2). Talep detayı
 * sayfasının yerine geçer: kazanan firma + Doğrulanmış rozeti + tutar,
 * kalem-bazlıysa satırlar, rekabet özeti (geçerli teklif sayısı, en düşük /
 * ikinci toplam, kazananın sırası), kalemler, adım çizelgesi. Tedarikçi
 * iletişim bilgisi TAŞIMAZ. "Talebi aç" bağlantısı yalnız satınalma
 * görüntüleme izni olana (API `canOpenListing`).
 */
export function ApprovalDetailPanel({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useApprovalDetail(id, true);
  if (isLoading) return <ListSkeleton rows={3} />;
  if (isError || !data) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-600">
        <span>Onay detayı yüklenemedi.</span>
        <button
          type="button"
          onClick={() => void refetch()}
          className="font-medium text-blue-600 hover:underline"
        >
          Tekrar dene
        </button>
      </div>
    );
  }
  const d = data;
  const comp = d.competition;

  return (
    <div className="space-y-4 text-sm" data-testid="approval-detail">
      {/* Kazanan */}
      <section aria-labelledby={`onay-kazanan-${d.id}`}>
        <h4 id={`onay-kazanan-${d.id}`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {d.award.kind === "by-item" ? "Kazananlar (kalem bazlı)" : "Kazanan teklif"}
        </h4>
        {d.award.kind === "full" ? (
          d.award.winner ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-zinc-950">{d.award.winner.companyName}</span>
              {d.award.winner.verified ? (
                <Badge color="blue">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Doğrulanmış
                </Badge>
              ) : (
                <Badge color="zinc">Doğrulanmamış firma</Badge>
              )}
              <span className="tabular-nums font-semibold text-zinc-950">
                {money(d.award.winner.amount, d.award.winner.currency)}
              </span>
              <span className="text-xs text-zinc-500">
                {d.award.winner.itemsCovered}/{d.listing.itemCount} kalem
              </span>
            </div>
          ) : (
            <p className="mt-1 text-zinc-500">Kazanan teklif artık görüntülenemiyor.</p>
          )
        ) : d.award.kind === "by-item" ? (
          <div className="mt-1.5 space-y-2">
            <ul className="flex flex-wrap gap-2">
              {d.award.winners.map((w) => (
                <li key={w.bidId} className="rounded-lg border border-zinc-950/10 px-2.5 py-1.5">
                  <span className="font-medium text-zinc-950">{w.companyName}</span>{" "}
                  {w.verified ? (
                    <Badge color="blue">Doğrulanmış</Badge>
                  ) : (
                    <Badge color="zinc">Doğrulanmamış</Badge>
                  )}
                  <span className="ml-2 tabular-nums font-semibold">{money(w.total, w.currency)}</span>
                  <span className="ml-1 text-xs text-zinc-500">· {w.lineCount} kalem</span>
                </li>
              ))}
            </ul>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Kalem</th>
                    <th className="py-1 pr-3 font-medium">Miktar</th>
                    <th className="py-1 pr-3 font-medium">Firma</th>
                    <th className="py-1 pr-3 text-right font-medium">Birim fiyat</th>
                    <th className="py-1 text-right font-medium">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {d.award.lines.map((l, i) => (
                    <tr key={i} className="border-t border-zinc-950/5">
                      <td className="py-1 pr-3 text-zinc-950">{l.itemName}</td>
                      <td className="py-1 pr-3 tabular-nums">{qty(l.quantity, l.unit)}</td>
                      <td className="py-1 pr-3">{l.companyName}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{money(l.unitPrice, l.currency)}</td>
                      <td className="py-1 text-right tabular-nums font-medium">{money(l.lineTotal, l.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-zinc-500">Bu istekte kazandırma verisi yok.</p>
        )}
      </section>

      {/* Rekabet */}
      <section aria-labelledby={`onay-rekabet-${d.id}`}>
        <h4 id={`onay-rekabet-${d.id}`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Rekabet
        </h4>
        <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-zinc-500">Geçerli teklif</dt>
            <dd className="font-medium tabular-nums">{comp.validBidCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">En düşük toplam</dt>
            <dd className="font-medium tabular-nums">
              {comp.currency ? money(comp.lowestTotal, comp.currency) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">İkinci toplam</dt>
            <dd className="font-medium tabular-nums">
              {comp.currency ? money(comp.secondLowestTotal, comp.currency) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Kazananın sırası</dt>
            <dd className="font-medium tabular-nums">
              {comp.winnerRank ? `${comp.winnerRank}.` : "—"}
            </dd>
          </div>
        </dl>
        {comp.currencyMixed ? (
          <p className="mt-1 text-xs text-amber-700">
            Teklifler farklı para birimlerinde; sıralama yalnız kazananın para birimindeki teklifleri kapsar.
          </p>
        ) : null}
      </section>

      {/* Talep */}
      <section aria-labelledby={`onay-talep-${d.id}`}>
        <h4 id={`onay-talep-${d.id}`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Talep
        </h4>
        <p className="mt-1.5 text-zinc-700">
          {d.listing.itemCount} kalem
          {d.listing.totalQuantity
            ? ` · ${qty(d.listing.totalQuantity.amount, d.listing.totalQuantity.unit)}`
            : ""}
          {d.listing.closesAt ? ` · Kapanış ${formatDate(d.listing.closesAt, "datetime")}` : ""}
        </p>
        {d.listing.items.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {d.listing.items.slice(0, 12).map((i) => (
              <li key={i.lineNo} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                {i.name} · {qty(i.quantity, i.unit)}
              </li>
            ))}
            {d.listing.items.length > 12 ? (
              <li className="px-1 py-0.5 text-xs text-zinc-500">+{d.listing.items.length - 12} kalem</li>
            ) : null}
          </ul>
        ) : null}
        {d.canOpenListing ? (
          <Link
            href={`/company/ilan/${d.listing.id}`}
            className="mt-2 inline-block text-xs font-medium text-blue-600 hover:underline"
          >
            Talebi aç
          </Link>
        ) : null}
      </section>

      {/* Adımlar */}
      <section aria-labelledby={`onay-adimlar-${d.id}`}>
        <h4 id={`onay-adimlar-${d.id}`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Onay adımları
        </h4>
        <ol className="mt-1.5 space-y-1">
          {d.steps.map((s) => {
            const st = STEP_LABEL[s.status] ?? STEP_LABEL.WAITING!;
            return (
              <li key={s.order} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="tabular-nums text-zinc-400">{s.order}.</span>
                <span className="font-medium text-zinc-950">
                  {s.approverName}
                  {s.mine ? " (siz)" : ""}
                </span>
                {s.displayLabel ? <span className="text-zinc-500">{s.displayLabel}</span> : null}
                <Badge color={st.color}>{st.label}</Badge>
                {s.decidedAt ? (
                  <span className="text-zinc-400">{formatDate(s.decidedAt, "datetime")}</span>
                ) : null}
                {s.note ? <span className="text-zinc-600">“{s.note}”</span> : null}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
