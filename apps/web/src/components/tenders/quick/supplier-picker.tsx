"use client";

import { useConnections } from "@/hooks/use-company-connections";
import { cn } from "@/lib/utils";
import { CheckIcon } from "@heroicons/react/20/solid";
import { useState } from "react";

/**
 * "SEÇTİKLERİM" — bağlantılardan kompakt davet seçici (2026-09-09).
 * Sihirbazın 3. adımı kart/arama/gruplarla zengin; hızlı kartta yalnız
 * bağlantı listesi + arama. Gruplar ve dış davet "Detaylı ayarlar"da.
 * Değer sihirbazla AYNI: `invitedSupplierIds` = Rothern ID listesi.
 */
export function SupplierPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { data: connections = [], isLoading } = useConnections();
  const [q, setQ] = useState("");
  const term = q.trim().toLocaleLowerCase("tr");
  const rows = connections
    .filter((c) => !!c.company.rothernId)
    .filter((c) => !term || c.company.name.toLocaleLowerCase("tr").includes(term) || (c.company.city ?? "").toLocaleLowerCase("tr").includes(term));

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  if (isLoading) return <p className="text-sm text-zinc-500">Bağlantılar yükleniyor…</p>;
  if (connections.length === 0) {
    return (
      <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
        Henüz bağlantınız yok. “Bağlantılarım” yerine <strong>Herkese açık</strong> seçin ya da yayından sonra tedarikçi önerisinden davet edin.
      </p>
    );
  }
  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Bağlantılarda ara"
        aria-label="Bağlantılarda ara"
        className="mb-2 w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-600"
      />
      <ul className="max-h-56 divide-y divide-zinc-950/5 overflow-y-auto rounded-xl ring-1 ring-zinc-950/5" aria-label="Davet edilecek firmalar">
        {rows.map((c) => {
          const id = c.company.rothernId as string;
          const on = value.includes(id);
          return (
            <li key={c.connectionId}>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={on}
                className={cn("flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-zinc-50", on && "bg-blue-50/70")}
              >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded border", on ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 bg-white")}>
                  {on ? <CheckIcon aria-hidden className="size-3.5" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-zinc-900">{c.company.name}</span>
                  <span className="block truncate text-xs text-zinc-500">{[c.company.city, c.company.industry].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          );
        })}
        {rows.length === 0 ? <li className="px-3 py-2 text-sm text-zinc-500">Eşleşen bağlantı yok.</li> : null}
      </ul>
      {value.length ? <p className="mt-1.5 text-xs text-zinc-600">{value.length} firma davet edilecek</p> : null}
    </div>
  );
}
