"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSuppliers } from "@/hooks/use-tenant-suppliers";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import type { SupplierWithRelation } from "@/lib/tedarikciler/types";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Search,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

const MEMBERSHIP_LABEL = {
  STANDARD: "Standart",
  PREMIUM: "Premium",
} as const;

const MEMBERSHIP_BADGE = {
  STANDARD: "bg-slate-100 text-slate-700",
  PREMIUM: "bg-yellow-100 text-yellow-800",
} as const;

export function Step3Suppliers() {
  const { control, formState } = useFormContext<TenderFormData>();
  const [search, setSearch] = useState("");

  // Onaylı tedarikçi listesini çek (max 100 — V1)
  const { data, isLoading, isError, refetch } = useSuppliers({
    status: "ACTIVE",
    pageSize: 100,
  });

  const filteredSuppliers = useMemo<SupplierWithRelation[]>(() => {
    const items = data?.items ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((s) => {
      const name = s.supplier.companyName.toLowerCase();
      const tax = s.supplier.taxNumber.toLowerCase();
      const primary = s.supplier.users[0];
      const email = (primary?.email ?? "").toLowerCase();
      return (
        name.includes(term) || tax.includes(term) || email.includes(term)
      );
    });
  }, [data?.items, search]);

  const error = formState.errors.invitedSupplierIds?.message;

  if (isError) {
    return (
      <div className="card p-12 text-center space-y-3">
        <p className="text-brand-900 font-medium">Tedarikçi listesi alınamadı.</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-xl bg-slate-100 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if ((data?.items.length ?? 0) === 0) {
    return (
      <div className="card p-12 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-warning-50 flex items-center justify-center">
          <Users2 className="w-6 h-6 text-warning-600" />
        </div>
        <div>
          <p className="font-display font-bold text-lg text-brand-900">
            Henüz onaylı tedarikçiniz yok
          </p>
          <p className="text-sm text-slate-500 mt-1">
            İhale açabilmek için önce tedarikçi davet edin veya onaylayın.
          </p>
        </div>
        <Link href="/dashboard/tedarikciler" className="inline-block">
          <Button variant="primary" size="sm">
            Tedarikçilere Git
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <Controller
      control={control}
      name="invitedSupplierIds"
      render={({ field }) => {
        const selected = new Set(field.value ?? []);
        const visibleIds = filteredSuppliers.map((s) => s.supplier.id);

        const allSelected =
          visibleIds.length > 0 &&
          visibleIds.every((id) => selected.has(id));

        const toggle = (id: string) => {
          const next = new Set(selected);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          field.onChange(Array.from(next));
        };

        const selectAllVisible = () => {
          const next = new Set(selected);
          visibleIds.forEach((id) => next.add(id));
          field.onChange(Array.from(next));
        };

        const clearAll = () => field.onChange([]);

        return (
          <div className="space-y-4">
            {error ? (
              <p className="text-sm text-danger-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> {error}
              </p>
            ) : null}

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Firma adı, vergi no veya e-posta ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between text-xs">
              <p className="text-slate-500">
                {filteredSuppliers.length} tedarikçi gösteriliyor ·{" "}
                <strong className="text-brand-700">
                  {selected.size}
                </strong>{" "}
                seçili
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllVisible}
                  disabled={allSelected}
                  className="text-brand-700 hover:text-brand-900 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Görünenleri Seç
                </button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={selected.size === 0}
                  className="text-slate-500 hover:text-danger-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Temizle
                </button>
              </div>
            </div>

            {/* Supplier list */}
            <div className="space-y-2">
              {filteredSuppliers.map((s) => {
                const checked = selected.has(s.supplier.id);
                const primary = s.supplier.users[0];
                return (
                  <label
                    key={s.supplier.id}
                    className={cn(
                      "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors",
                      checked
                        ? "bg-brand-50/50 border-brand-300 ring-1 ring-brand-200"
                        : "bg-white border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.supplier.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-brand-900">
                          {s.supplier.companyName}
                        </p>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide",
                            MEMBERSHIP_BADGE[s.supplier.membership],
                          )}
                        >
                          {MEMBERSHIP_LABEL[s.supplier.membership]}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        VKN: <span className="font-mono">{s.supplier.taxNumber}</span>{" "}
                        · {s.supplier.city}
                        {s.supplier.industry
                          ? ` · ${s.supplier.industry}`
                          : ""}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        İletişim:{" "}
                        {primary
                          ? `${primary.firstName} ${primary.lastName} · ${primary.email}`
                          : "—"}
                      </p>
                    </div>
                    {checked ? (
                      <CheckCircle2 className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
                    ) : null}
                  </label>
                );
              })}
              {filteredSuppliers.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-8">
                  Aramaya uygun tedarikçi bulunamadı.
                </div>
              ) : null}
            </div>

            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <AlertCircle className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <p>
                Yayınladığınızda seçili tedarikçilere e-posta gönderilecek.
                Yayın sonrası davetli liste değiştirilemez (V1).
              </p>
            </div>
          </div>
        );
      }}
    />
  );
}
