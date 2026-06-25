"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useMyListings, type ListingStatus } from "@/hooks/use-company-listings";
import { PlusIcon } from "@heroicons/react/20/solid";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { useState } from "react";
import { NewListingDialog } from "./_components/new-listing-dialog";

const STATUS_LABEL: Record<ListingStatus, string> = {
  DRAFT: "Taslak",
  OPEN: "Açık",
  CLOSED: "Kapandı",
  AWARDED: "Kazandırıldı",
  CANCELLED: "İptal",
};

export default function IlanlarPage() {
  const { data, isLoading } = useMyListings();
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Heading>İlanlar</Heading>
        <Button onClick={() => setOpen(true)}>
          <PlusIcon data-slot="icon" />
          Yeni İlan
        </Button>
      </div>

      {isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : !data || data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
          <Text className="text-sm text-zinc-500">
            Henüz ilanın yok. <strong>Yeni İlan</strong> ile bir{" "}
            <span className="text-blue-600">🔵 alım</span> veya{" "}
            <span className="text-emerald-600">🟢 satış</span> ilanı aç.
          </Text>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Badge color={l.type === "ALIM" ? "blue" : "emerald"}>
                  {l.type === "ALIM" ? "🔵 Alım" : "🟢 Satış"}
                </Badge>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {l.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {format(new Date(l.createdAt), "dd MMM yyyy HH:mm", {
                      locale: tr,
                    })}
                  </div>
                </div>
              </div>
              <Badge color="zinc">{STATUS_LABEL[l.status]}</Badge>
            </div>
          ))}
        </div>
      )}

      <NewListingDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
