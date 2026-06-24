"use client";

import { Input, InputGroup } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { PageHeader } from "@/components/list";
import { Button } from "@/components/ui/button";
import {
  useConnectSupplierBySupkeysId,
  useSupplierPool,
  type SupplierPoolItem,
} from "@/hooks/use-tenant-suppliers";
import { useRoots } from "@/hooks/use-categories";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import axios from "axios";
import { Building2, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(d?.message)) return d.message.join(", ");
    return d?.message ?? fallback;
  }
  return fallback;
}

export function SupplierPoolView() {
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("");
  const [detail, setDetail] = useState<SupplierPoolItem | null>(null);
  const { data: segments } = useRoots();
  const pool = useSupplierPool(search, sector);

  const openSupplier = (s: SupplierPoolItem) => {
    if (s.membership === "PREMIUM" && s.publicEnabled && s.slug) {
      window.open(`/${s.slug}`, "_blank");
    } else {
      setDetail(s);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Tedarikçi Havuzu"
        description="Premium tedarikçileri ve bağlı tedarikçilerinizi keşfedin, ekleyin."
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <InputGroup>
            <MagnifyingGlassIcon data-slot="icon" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tedarikçi ara — firma adı veya Supkeys ID…"
            />
          </InputGroup>
        </div>
        <div className="sm:w-64">
          <Select value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">Tüm kategoriler</option>
            {(segments ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameTr}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {pool.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : !pool.data || pool.data.length === 0 ? (
        <div className="rounded-xl border border-zinc-950/10 bg-white py-10 text-center text-sm text-zinc-500">
          {search || sector
            ? "Eşleşen tedarikçi bulunamadı."
            : "Havuzda görüntülenecek tedarikçi yok."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pool.data.map((s) => (
            <SupplierCard key={s.id} s={s} onOpen={() => openSupplier(s)} />
          ))}
        </div>
      )}

      {detail ? (
        <StandardDetailDialog
          s={detail}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </div>
  );
}

function SupplierCard({
  s,
  onOpen,
}: {
  s: SupplierPoolItem;
  onOpen: () => void;
}) {
  const connect = useConnectSupplierBySupkeysId();
  const meta = [s.city, s.industry].filter(Boolean).join(" · ");

  const add = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!s.supkeysId) return;
    connect.mutate(s.supkeysId, {
      onSuccess: () => toast.success(`${s.companyName} eklendi`),
      onError: (err) => toast.error(errMsg(err, "Eklenemedi")),
    });
  };

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-start justify-between gap-3 rounded-xl border border-zinc-950/5 bg-white p-4 text-left transition-colors hover:bg-zinc-50"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
          <Building2 className="h-5 w-5 text-zinc-500" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-zinc-900">
              {s.companyName}
            </p>
            {s.membership === "PREMIUM" ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                <Sparkles className="h-3 w-3" /> Premium
              </span>
            ) : null}
          </div>
          {meta ? (
            <p className="truncate text-xs text-zinc-500">{meta}</p>
          ) : null}
          {s.sectors.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {s.sectors.slice(0, 3).map((c) => (
                <span
                  key={c}
                  className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600"
                >
                  {c}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="shrink-0">
        {s.relationStatus === "ACTIVE" ? (
          <span className="rounded-md bg-success-50 px-2 py-1 text-xs font-semibold text-success-700">
            Bağlı
          </span>
        ) : s.relationStatus === "PENDING_TENANT_APPROVAL" ? (
          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
            Onay bekliyor
          </span>
        ) : s.relationStatus === "BLOCKED" ? (
          <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
            Engelli
          </span>
        ) : s.supkeysId ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={add}
            loading={connect.isPending}
            disabled={connect.isPending}
          >
            Ekle
          </Button>
        ) : null}
      </div>
    </button>
  );
}

/** Standart tedarikçi — public profili yok; gerekli bilgileri burada gösterilir. */
function StandardDetailDialog({
  s,
  onClose,
}: {
  s: SupplierPoolItem;
  onClose: () => void;
}) {
  const rows: [string, string | null][] = [
    ["Şehir / İlçe", [s.city, s.district].filter(Boolean).join(" / ") || null],
    ["Sektör", s.industry],
    ["Web sitesi", s.website],
    ["Supkeys ID", s.supkeysId ? `SK-${s.supkeysId}` : null],
  ];
  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogTitle>{s.companyName}</DialogTitle>
      <DialogDescription>Tedarikçi bilgileri</DialogDescription>
      <DialogBody>
        <dl className="divide-y divide-zinc-100 rounded-lg border border-zinc-950/10">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="text-right font-medium text-zinc-900">
                {v || "—"}
              </dd>
            </div>
          ))}
        </dl>
        {s.sectors.length > 0 ? (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-zinc-500">
              Faaliyet alanları
            </p>
            <div className="flex flex-wrap gap-1.5">
              {s.sectors.map((c) => (
                <span
                  key={c}
                  className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {s.services.length > 0 ? (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-zinc-500">Hizmetler</p>
            <div className="flex flex-wrap gap-1.5">
              {s.services.map((c) => (
                <span
                  key={c}
                  className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </DialogBody>
    </Dialog>
  );
}
