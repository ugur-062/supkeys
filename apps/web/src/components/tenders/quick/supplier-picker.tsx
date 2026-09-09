"use client";

import { useConnections, type Connection } from "@/hooks/use-company-connections";
import { cn } from "@/lib/utils";
import { companyActivityLabel } from "@rothern/shared";
import { CheckCircleIcon, CheckBadgeIcon, MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { useMemo, useState } from "react";

/**
 * "SEÇTİKLERİM" — bağlantılardan FİRMA KARTI seçici (2026-09-09 v2).
 *
 * Eski hâli ad + kutucuk listesiydi ("çok düz"). Kart: logo (yoksa baş
 * harf), ad + doğrulanmış rozeti, şehir · sektör, faaliyet çipi, yayındaki
 * ürünlerden 3 küçük görsel. Karta tıklamak seçer; seçilenler üstte çip
 * olarak durur (kaldırılabilir). Değer sihirbazla AYNI: Rothern ID listesi.
 */
export function SupplierPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: connections = [], isLoading } = useConnections();
  const [q, setQ] = useState("");
  const term = q.trim().toLocaleLowerCase("tr");
  const rows = useMemo(
    () =>
      connections
        .filter((c) => !!c.company.rothernId)
        .filter((c) => {
          if (!term) return true;
          const hay = [c.company.name, c.company.city, c.company.industry].filter(Boolean).join(" ").toLocaleLowerCase("tr");
          return hay.includes(term);
        }),
    [connections, term],
  );
  const selected = connections.filter((c) => c.company.rothernId && value.includes(c.company.rothernId));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-busy>
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>
    );
  }
  if (connections.length === 0) {
    return (
      <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
        Henüz bağlantınız yok. “Herkese açık” seçin ya da yayından sonra tedarikçi önerisinden davet edin.
      </p>
    );
  }

  return (
    <div>
      {selected.length ? (
        <p className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600">
          <span className="font-medium text-zinc-800">{selected.length} firma davet edilecek:</span>
          {selected.map((c) => (
            <button
              key={c.connectionId}
              type="button"
              onClick={() => toggle(c.company.rothernId as string)}
              aria-label={`${c.company.name} davetini kaldır`}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800 ring-1 ring-blue-600/20 hover:bg-blue-100"
            >
              {c.company.name} ×
            </button>
          ))}
        </p>
      ) : null}
      {connections.length > 4 ? (
        <div className="relative mb-3">
          <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Bağlantılarda ara — ad, şehir, sektör"
            aria-label="Bağlantılarda ara"
            className="w-full rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
          />
        </div>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Davet edilecek firmalar">
        {rows.map((c) => (
          <SupplierCard key={c.connectionId} c={c} on={value.includes(c.company.rothernId as string)} onToggle={() => toggle(c.company.rothernId as string)} />
        ))}
        {rows.length === 0 ? <li className="col-span-full px-1 py-2 text-sm text-zinc-500">Eşleşen bağlantı yok.</li> : null}
      </ul>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase("tr") ?? "")
    .join("");
}

function SupplierCard({ c, on, onToggle }: { c: Connection; on: boolean; onToggle: () => void }) {
  const co = c.company;
  const meta = [co.city, co.industry].filter(Boolean).join(" · ");
  const acts = (co.activities ?? []).slice(0, 2).map((a) => companyActivityLabel(a));
  const thumbs = co.productPreview?.thumbnails?.slice(0, 3) ?? [];
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        className={cn(
          "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition",
          on ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600" : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50",
        )}
      >
        {co.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={co.logoUrl} alt="" className="size-11 shrink-0 rounded-lg bg-white object-contain ring-1 ring-zinc-950/10" />
        ) : (
          <span aria-hidden className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold", on ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600")}>
            {initials(co.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-zinc-950">{co.name}</span>
            {co.verified ? <CheckBadgeIcon aria-label="Doğrulanmış firma" className="size-4 shrink-0 text-blue-600" /> : null}
            {co.tier === "GOLD" ? <span className="shrink-0 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-600/20">Gold</span> : null}
          </span>
          {meta ? <span className="block truncate text-xs text-zinc-600">{meta}</span> : null}
          {acts.length ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {acts.map((a) => (
                <span key={a} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                  {a}
                </span>
              ))}
            </span>
          ) : null}
          {thumbs.length ? (
            <span className="mt-2 flex items-center gap-1">
              {thumbs.map((t) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={t} src={t} alt="" className="size-8 rounded-md object-cover ring-1 ring-zinc-950/10" />
              ))}
              {co.productPreview && co.productPreview.total > thumbs.length ? <span className="text-[11px] text-zinc-500">+{co.productPreview.total - thumbs.length} ürün</span> : null}
            </span>
          ) : null}
        </span>
        <span className={cn("mt-0.5 shrink-0", on ? "text-blue-600" : "text-zinc-300")}>
          <CheckCircleIcon aria-hidden className="size-5" />
        </span>
      </button>
    </li>
  );
}
