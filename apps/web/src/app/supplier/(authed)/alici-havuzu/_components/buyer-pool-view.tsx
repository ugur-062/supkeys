"use client";

import { Input, InputGroup } from "@/components/catalyst/input";
import { PageHeader } from "@/components/list";
import { PanelCard } from "@/components/supplier/panel-card";
import { Button } from "@/components/ui/button";
import {
  useBuyerPool,
  useConnectBuyerByRothernId,
  useConnectToBuyer,
  type BuyerPoolItem,
} from "@/hooks/use-buyer-pool";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import axios from "axios";
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
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

function displayId(code: string | null | undefined): string {
  return code ? `SK-${code}` : "—";
}

export function BuyerPoolView() {
  const { supplier } = useSupplierAuth();
  const isPremium = supplier?.membership === "PREMIUM";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Alıcı Havuzu"
        description={
          isPremium
            ? "Alıcıları keşfedin ve bağlantı isteği gönderin; bağlandığınız alıcıların davetli ihalelerinde listesine girersiniz."
            : "Alıcıları keşfedin. Bağlantı isteği göndermek premium üyeliğe özeldir."
        }
      />

      {isPremium ? (
        <ConnectByIdCard ownRothernId={supplier?.supkeysId ?? null} />
      ) : (
        <PanelCard className="border-amber-200 bg-amber-50/50">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <span>
              Alıcıya bağlantı isteği göndermek <strong>premium</strong>'a
              özeldir. Standart üyelikte alıcıların sizi{" "}
              <strong>Rothern ID'nizle</strong> eklemesini bekleyebilir veya{" "}
              <Link
                href="/supplier/premium"
                className="font-semibold underline"
              >
                premium'a geçebilirsiniz
              </Link>
              .
            </span>
          </div>
          <OwnIdRow ownRothernId={supplier?.supkeysId ?? null} />
        </PanelCard>
      )}

      <BuyerPool isPremium={isPremium} />
    </div>
  );
}

function OwnIdRow({ ownRothernId }: { ownRothernId: string | null }) {
  const copy = () => {
    if (!ownRothernId) return;
    navigator.clipboard
      .writeText(displayId(ownRothernId))
      .then(() => toast.success("Rothern ID kopyalandı"))
      .catch(() => toast.error("Kopyalanamadı"));
  };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 text-sm">
      <span className="text-slate-500">Sizin Rothern ID'niz:</span>
      <code className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono font-semibold text-zinc-900">
        {displayId(ownRothernId)}
      </code>
      {ownRothernId ? (
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
        >
          <Copy className="h-3.5 w-3.5" />
          Kopyala
        </button>
      ) : null}
      <span className="text-xs text-slate-400">
        — alıcılar bu ID ile sizi ekleyebilir.
      </span>
    </div>
  );
}

function ConnectByIdCard({ ownRothernId }: { ownRothernId: string | null }) {
  const [value, setValue] = useState("");
  const connect = useConnectBuyerByRothernId();

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    connect.mutate(v, {
      onSuccess: (r) => {
        toast.success(r.message);
        setValue("");
      },
      onError: (e) => toast.error(errMsg(e, "Bağlantı isteği gönderilemedi")),
    });
  };

  return (
    <PanelCard title="Rothern ID ile Alıcı Ekle">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <InputGroup>
            <MagnifyingGlassIcon data-slot="icon" />
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="Alıcının Rothern ID'si (örn. SK-K7X9-3M2P)"
            />
          </InputGroup>
        </div>
        <Button
          onClick={submit}
          loading={connect.isPending}
          disabled={connect.isPending || !value.trim()}
        >
          Bağlantı İste
        </Button>
      </div>
      <OwnIdRow ownRothernId={ownRothernId} />
    </PanelCard>
  );
}

function BuyerPool({ isPremium }: { isPremium: boolean }) {
  const [search, setSearch] = useState("");
  const pool = useBuyerPool(search);

  return (
    <div className="space-y-3">
      <InputGroup>
        <MagnifyingGlassIcon data-slot="icon" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Alıcı ara — firma adı, şehir, sektör veya Rothern ID…"
        />
      </InputGroup>

      {pool.isLoading ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !pool.data || pool.data.length === 0 ? (
        <PanelCard className="py-10 text-center text-sm text-slate-500">
          {search ? "Eşleşen alıcı bulunamadı." : "Henüz alıcı yok."}
        </PanelCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {pool.data.map((b) => (
            <BuyerCard key={b.id} buyer={b} isPremium={isPremium} />
          ))}
        </div>
      )}
    </div>
  );
}

function BuyerCard({
  buyer,
  isPremium,
}: {
  buyer: BuyerPoolItem;
  isPremium: boolean;
}) {
  const connect = useConnectToBuyer();
  const meta = [buyer.city, buyer.industry].filter(Boolean).join(" · ");

  const action = () => {
    connect.mutate(buyer.id, {
      onSuccess: (r) => toast.success(r.message),
      onError: (e) => toast.error(errMsg(e, "Bağlantı isteği gönderilemedi")),
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-950/5 bg-white p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
          <Building2 className="h-5 w-5 text-zinc-500" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-zinc-900">{buyer.name}</p>
          {meta ? (
            <p className="truncate text-xs text-slate-500">{meta}</p>
          ) : null}
          {buyer.publicEnabled ? (
            <Link
              href={`/firma/${buyer.slug}`}
              target="_blank"
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
            >
              Profili Gör
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      </div>

      {buyer.relationStatus === "ACTIVE" ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success-50 px-2 py-1 text-xs font-semibold text-success-700">
          <Check className="h-3.5 w-3.5" />
          Bağlı
        </span>
      ) : buyer.relationStatus === "PENDING_TENANT_APPROVAL" ? (
        <span className="shrink-0 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
          Onay bekliyor
        </span>
      ) : buyer.relationStatus === "BLOCKED" ? (
        <span className="shrink-0 rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
          Engelli
        </span>
      ) : isPremium ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={action}
          loading={connect.isPending}
          disabled={connect.isPending}
        >
          Bağlan
        </Button>
      ) : null}
    </div>
  );
}
