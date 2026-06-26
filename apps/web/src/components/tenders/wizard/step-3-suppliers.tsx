"use client";

import { useConnections } from "@/hooks/use-company-connections";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import { Check, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

/**
 * Adım 3 — Davet edilecek firmalar. Eski tedarikçi havuzu yerine yeni model:
 * bağlantılı firmalar (useConnections). Seçilenler supkeysId olarak
 * invitedSupplierIds'e yazılır (backend invitations = supkeysId[]).
 */
export function Step3Suppliers() {
  const { control } = useFormContext<TenderFormData>();
  const connections = useConnections();
  const [search, setSearch] = useState("");

  const companies = useMemo(() => {
    const rows = (connections.data ?? [])
      .map((c) => c.company)
      .filter((c): c is { id: string; name: string; supkeysId: string | null } =>
        Boolean(c.supkeysId),
      );
    const q = search.trim().toLocaleLowerCase("tr");
    return q
      ? rows.filter(
          (c) =>
            c.name.toLocaleLowerCase("tr").includes(q) ||
            (c.supkeysId ?? "").toLocaleLowerCase("tr").includes(q),
        )
      : rows;
  }, [connections.data, search]);

  return (
    <Controller
      control={control}
      name="invitedSupplierIds"
      render={({ field }) => {
        const selected = new Set(field.value ?? []);
        const toggle = (code: string) => {
          const next = new Set(selected);
          if (next.has(code)) next.delete(code);
          else next.add(code);
          field.onChange([...next]);
        };

        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">
                Davet Edilecek Firmalar
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Bağlantılı firmalarından bu ihaleye davet etmek istediklerini
                seç. Davet edilenler ihaleyi görüp teklif verebilir.
              </p>
            </div>

            {/* Arama */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Firma adı veya kodu ara…"
                className="w-full rounded-lg border border-surface-border bg-white py-2.5 pl-10 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>

            {/* Seçilenler */}
            {selected.size > 0 ? (
              <div className="flex flex-wrap gap-2">
                {[...selected].map((code) => {
                  const c = (connections.data ?? []).find(
                    (x) => x.company.supkeysId === code,
                  );
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white"
                    >
                      {c?.company.name ?? code}
                      <button
                        type="button"
                        onClick={() => toggle(code)}
                        aria-label="Kaldır"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}

            {/* Liste */}
            <div className="overflow-hidden rounded-xl border border-zinc-950/10">
              {connections.isLoading ? (
                <p className="p-6 text-center text-sm text-zinc-500">
                  Yükleniyor…
                </p>
              ) : companies.length === 0 ? (
                <div className="flex flex-col items-center gap-3 p-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                    <Users className="h-6 w-6 text-zinc-400" />
                  </div>
                  <p className="text-sm text-zinc-500">
                    {search
                      ? "Eşleşen firma yok."
                      : "Henüz bağlantın yok."}
                  </p>
                  <Link
                    href="/company/satinalma/tedarikcilerim"
                    className="text-sm font-semibold text-zinc-900 hover:text-zinc-600"
                  >
                    Bağlantı ekle →
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-zinc-950/5">
                  {companies.map((c) => {
                    const code = c.supkeysId!;
                    const checked = selected.has(code);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => toggle(code)}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50",
                            checked && "bg-zinc-50",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                              checked
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-300",
                            )}
                          >
                            {checked ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-zinc-900">
                              {c.name}
                            </div>
                            <div className="font-mono text-xs text-zinc-500">
                              {code}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="text-xs text-zinc-500">
              {selected.size} firma seçildi. Davet etmeden de ihaleyi
              oluşturabilir, sonra davet gönderebilirsin.
            </p>
          </div>
        );
      }}
    />
  );
}
