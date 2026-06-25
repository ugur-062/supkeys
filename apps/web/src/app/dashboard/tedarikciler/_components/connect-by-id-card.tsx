"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConnectSupplierByRothernId } from "@/hooks/use-tenant-suppliers";
import axios from "axios";
import { Link2 } from "lucide-react";
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

/** Faz 3 madde 6 — alıcı, tedarikçinin Rothern ID'sini girip doğrudan ekler. */
export function ConnectByIdCard() {
  const [value, setValue] = useState("");
  const connect = useConnectSupplierByRothernId();

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    connect.mutate(v, {
      onSuccess: (r) => {
        toast.success(r.message);
        setValue("");
      },
      onError: (e) => toast.error(errMsg(e, "Tedarikçi eklenemedi")),
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-950/5 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 sm:w-64 sm:shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-50">
            <Link2 className="h-4 w-4 text-zinc-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              Rothern ID ile ekle
            </p>
            <p className="text-xs text-slate-500">
              Tedarikçinin ID'siyle anında bağlan
            </p>
          </div>
        </div>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="örn. SK-K7X9-3M2P"
          className="flex-1"
        />
        <Button
          onClick={submit}
          loading={connect.isPending}
          disabled={connect.isPending || !value.trim()}
        >
          Ekle
        </Button>
      </div>
    </div>
  );
}
