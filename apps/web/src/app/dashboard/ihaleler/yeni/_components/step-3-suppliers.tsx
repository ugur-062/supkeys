"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSuppliers } from "@/hooks/use-tenant-suppliers";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import type { SupplierWithRelation } from "@/lib/tedarikciler/types";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  CheckSquare,
  Info,
  Plus,
  Search,
  Users2,
  X,
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

  const { data, isLoading, isError, refetch } = useSuppliers({
    status: "ACTIVE",
    pageSize: 100,
  });

  const allSuppliers: SupplierWithRelation[] = data?.items ?? [];

  const filteredSuppliers = useMemo<SupplierWithRelation[]>(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allSuppliers;
    return allSuppliers.filter((s) => {
      const name = s.supplier.companyName.toLowerCase();
      const tax = s.supplier.taxNumber.toLowerCase();
      const primary = s.supplier.users[0];
      const email = (primary?.email ?? "").toLowerCase();
      return name.includes(term) || tax.includes(term) || email.includes(term);
    });
  }, [allSuppliers, search]);

  const error = formState.errors.invitedSupplierIds?.message;

  if (isError) {
    return (
      <div className="card p-12 text-center space-y-3">
        <p className="text-brand-900 font-medium">
          Tedarikçi listesi alınamadı.
        </p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Tekrar dene
        </Button>
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

        const allVisibleSelected =
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

        const removeOne = (id: string) => {
          const next = new Set(selected);
          next.delete(id);
          field.onChange(Array.from(next));
        };

        const clearAll = () => field.onChange([]);

        const selectedSuppliers = allSuppliers.filter((s) =>
          selected.has(s.supplier.id),
        );

        return (
          <div className="space-y-6">
            {/* Section header */}
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                <Users2 className="h-5 w-5 text-brand-600" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-brand-900">
                  Tedarikçi Daveti
                </h2>
                <p className="text-sm text-slate-500">
                  Bu ihaleye kimler teklif verebilir?
                </p>
              </div>
            </div>

            {/* 1. Davet Yöntemi radio cards */}
            <div className="space-y-3">
              {/* "Tüm Supkeys" — disabled, V2 */}
              <label
                className="block bg-slate-50 border-2 border-slate-200 rounded-xl p-4 cursor-not-allowed opacity-60"
                aria-disabled="true"
              >
                <div className="flex gap-3 items-start">
                  <input
                    type="radio"
                    name="inviteMethod"
                    disabled
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-700">
                        Tüm Supkeys Tedarikçileri Teklif Verebilsin
                      </p>
                      <span className="px-2 py-0.5 bg-warning-100 text-warning-700 text-[10px] rounded-md font-bold uppercase tracking-wide">
                        Yakında
                      </span>
                    </div>
                    <ul className="text-xs text-slate-500 mt-2 space-y-0.5 list-disc list-inside">
                      <li>
                        İhaleniz herkese açık olur, kategoriye uygun tedarikçiler
                        teklif verebilir
                      </li>
                      <li>
                        Supkeys uygun tedarikçilere otomatik davet gönderir
                      </li>
                      <li>Engellediğiniz tedarikçiler hariç tutulur</li>
                    </ul>
                  </div>
                </div>
              </label>

              {/* "Sadece Onaylı Tedarikçilerim" — V1 default */}
              <label className="block bg-white border-2 border-brand-400 rounded-xl p-4 cursor-pointer ring-2 ring-brand-100">
                <div className="flex gap-3 items-start">
                  <input
                    type="radio"
                    name="inviteMethod"
                    checked
                    readOnly
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-brand-900">
                        Sadece Onaylı Tedarikçilerim
                      </p>
                      <span className="px-2 py-0.5 bg-success-50 text-success-700 text-[10px] rounded-md font-semibold uppercase tracking-wide">
                        Aktif
                      </span>
                    </div>
                    <ul className="text-xs text-slate-600 mt-2 space-y-0.5 list-disc list-inside">
                      <li>Sadece davet ettikleriniz ihaleyi görür</li>
                      <li>
                        Onaylı tedarikçi listenizden manuel seçim yaparsınız
                      </li>
                      <li>Tedarikçilere e-posta ile davet gönderilir</li>
                    </ul>
                  </div>
                </div>
              </label>
            </div>

            {error ? (
              <p className="text-sm text-danger-600 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> {error}
              </p>
            ) : null}

            {/* 2. Bilgi banner / boş state / loading */}
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl bg-slate-100 animate-pulse"
                  />
                ))}
              </div>
            ) : allSuppliers.length === 0 ? (
              <div className="bg-warning-50 border border-warning-200 rounded-xl p-6 text-center">
                <Users2 className="h-12 w-12 text-warning-500 mx-auto mb-3" />
                <p className="font-display font-bold text-warning-900">
                  Henüz onaylı tedarikçiniz yok
                </p>
                <p className="text-sm text-warning-700 mt-1">
                  İhale açabilmek için en az 1 onaylı tedarikçi gerekli.
                </p>
                <Link
                  href="/dashboard/tedarikciler"
                  className="inline-flex items-center gap-1 mt-4 px-4 py-2 bg-warning-600 text-white rounded-lg text-sm font-semibold hover:bg-warning-700"
                >
                  <Plus className="h-4 w-4" />
                  Tedarikçi Davet Et
                </Link>
              </div>
            ) : (
              <>
                <div className="bg-success-50 border border-success-200 rounded-xl p-4 flex gap-3 items-start">
                  <CheckCircle2 className="h-5 w-5 text-success-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-success-900 text-sm">
                      {allSuppliers.length} onaylı tedarikçiniz bulundu
                    </p>
                    <p className="text-xs text-success-700 mt-0.5">
                      Aşağıdaki listeden ihaleye davet etmek istediklerinizi
                      seçin.
                    </p>
                  </div>
                </div>

                {/* 3. Search + Tümünü Seç */}
                <div className="flex gap-2 items-center flex-wrap md:flex-nowrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="search"
                      placeholder="Firma adı, vergi no veya e-posta ara…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={selectAllVisible}
                    disabled={
                      filteredSuppliers.length === 0 || allVisibleSelected
                    }
                  >
                    <CheckSquare className="w-4 h-4" />
                    Tümünü Seç ({filteredSuppliers.length})
                  </Button>
                </div>

                <p className="text-xs text-slate-500">
                  {filteredSuppliers.length} tedarikçi gösteriliyor ·{" "}
                  <strong className="text-brand-700">{selected.size}</strong>{" "}
                  seçili
                </p>

                {/* Tedarikçi liste */}
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {filteredSuppliers.map((s) => {
                    const checked = selected.has(s.supplier.id);
                    const primary = s.supplier.users[0];
                    return (
                      <label
                        key={s.supplier.id}
                        className={cn(
                          "flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all",
                          checked
                            ? "bg-brand-50 border-brand-300 shadow-sm"
                            : "bg-white border-slate-200 hover:border-brand-200 hover:bg-slate-50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(s.supplier.id)}
                          className="mt-1 h-4 w-4 rounded text-brand-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <p className="font-semibold text-brand-900 truncate">
                              {s.supplier.companyName}
                            </p>
                            <span
                              className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded-md font-semibold uppercase tracking-wide flex-shrink-0",
                                MEMBERSHIP_BADGE[s.supplier.membership],
                              )}
                            >
                              {MEMBERSHIP_LABEL[s.supplier.membership]}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            VKN:{" "}
                            <span className="font-mono">
                              {s.supplier.taxNumber}
                            </span>{" "}
                            · {s.supplier.city}
                            {s.supplier.industry
                              ? ` · ${s.supplier.industry}`
                              : ""}
                          </p>
                          {primary ? (
                            <p className="text-xs text-slate-500 mt-0.5">
                              İletişim: {primary.firstName} {primary.lastName}{" "}
                              · {primary.email}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}

                  {filteredSuppliers.length === 0 ? (
                    <div className="text-center text-sm text-slate-500 py-8">
                      &ldquo;{search}&rdquo; için sonuç yok
                    </div>
                  ) : null}
                </div>
              </>
            )}

            {/* 4. Seçim özeti — chip'ler */}
            <div
              className={cn(
                "rounded-xl p-4 border-2",
                selected.size > 0
                  ? "bg-brand-50 border-brand-200"
                  : "bg-slate-50 border-dashed border-slate-300",
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-display font-bold text-brand-900 text-sm">
                  Seçilen Tedarikçiler ({selected.size})
                </p>
                {selected.size > 0 ? (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs text-danger-600 hover:text-danger-700 font-semibold"
                  >
                    Temizle
                  </button>
                ) : null}
              </div>

              {selectedSuppliers.length === 0 ? (
                <p className="text-sm text-slate-500 italic">
                  Henüz tedarikçi seçmediniz
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedSuppliers.map((s) => (
                    <span
                      key={s.supplier.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-brand-300 rounded-lg text-sm font-semibold text-brand-700"
                    >
                      <Building2 className="h-3.5 w-3.5 text-brand-500" />
                      <span className="truncate max-w-[14rem]">
                        {s.supplier.companyName}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeOne(s.supplier.id)}
                        aria-label={`${s.supplier.companyName} kaldır`}
                        className="text-brand-400 hover:text-danger-600 ml-0.5"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bilgi notu */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <Info className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <p>
                Yayınladığınızda seçili tedarikçilere &ldquo;🎯 Yeni İhale
                Daveti&rdquo; e-postası gönderilecek. Yayın sonrası davetli
                liste değiştirilemez (V1).
              </p>
            </div>
          </div>
        );
      }}
    />
  );
}
