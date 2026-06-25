"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import {
  useBrowseListings,
  useMyListings,
  type ListingStatus,
} from "@/hooks/use-company-listings";
import { PlusIcon } from "@heroicons/react/20/solid";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import Link from "next/link";
import { useState } from "react";
import { NewListingDialog } from "./_components/new-listing-dialog";

const STATUS_LABEL: Record<ListingStatus, string> = {
  DRAFT: "Taslak",
  OPEN: "Açık",
  CLOSED: "Kapandı",
  AWARDED: "Kazandırıldı",
  CANCELLED: "İptal",
};

function TypeBadge({ type }: { type: "ALIM" | "SATIS" }) {
  return (
    <Badge color={type === "ALIM" ? "blue" : "emerald"}>
      {type === "ALIM" ? "🔵 Alım" : "🟢 Satış"}
    </Badge>
  );
}

export default function IlanlarPage() {
  const [tab, setTab] = useState<"mine" | "browse">("mine");
  const [open, setOpen] = useState(false);
  const mine = useMyListings();
  const browse = useBrowseListings();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Heading>İlanlar</Heading>
        <Button onClick={() => setOpen(true)}>
          <PlusIcon data-slot="icon" />
          Yeni İlan
        </Button>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 border-b border-zinc-200">
        {(
          [
            ["mine", "İlanlarım"],
            ["browse", "Bana Açık İlanlar"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "mine" ? (
        mine.isLoading ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : !mine.data || mine.data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
            <Text className="text-sm text-zinc-500">
              Henüz ilanın yok. <strong>Yeni İlan</strong> ile bir{" "}
              <span className="text-blue-600">🔵 alım</span> veya{" "}
              <span className="text-emerald-600">🟢 satış</span> ilanı aç.
            </Text>
          </div>
        ) : (
          <div className="space-y-2">
            {mine.data.map((l) => (
              <Link
                key={l.id}
                href={`/company/ilanlar/${l.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3 hover:bg-zinc-50 transition"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TypeBadge type={l.type} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900">
                      {l.title}
                    </div>
                    <div className="text-xs text-zinc-500">
                      <span className="font-mono">{l.number ?? "—"}</span>
                      {" · "}
                      {l.visibility === "PUBLIC" ? "herkese açık" : "bağlantılar"}
                      {" · "}
                      {format(new Date(l.createdAt), "dd MMM yyyy", {
                        locale: tr,
                      })}
                    </div>
                  </div>
                </div>
                <Badge color="zinc">{STATUS_LABEL[l.status]}</Badge>
              </Link>
            ))}
          </div>
        )
      ) : browse.isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : !browse.data || browse.data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
          <Text className="text-sm text-zinc-500">
            Şu an sana açık ilan yok. Firmalarla bağlan veya herkese açık ilanlar
            geldikçe burada görünür.
          </Text>
        </div>
      ) : (
        <div className="space-y-2">
          {browse.data.map((l) => (
            <Link
              key={l.id}
              href={`/company/ilanlar/${l.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3 hover:bg-zinc-50 transition"
            >
              <div className="flex min-w-0 items-center gap-3">
                <TypeBadge type={l.type} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {l.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    <span className="font-mono">{l.number ?? "—"}</span>
                    {" · "}
                    {l.owner ? (
                      l.owner.name
                    ) : (
                      <span className="italic">🔒 Gizli firma</span>
                    )}
                  </div>
                </div>
              </div>
              {l.canBid ? (
                <Badge color="green">Teklif verebilirsin</Badge>
              ) : (
                <Badge color="amber">Premium gerekir</Badge>
              )}
            </Link>
          ))}
        </div>
      )}

      <NewListingDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
