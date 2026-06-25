"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { NewListingDialog } from "@/components/company/new-listing-dialog";
import {
  useBrowseListings,
  useMyListings,
  type ListingStatus,
  type ListingType,
} from "@/hooks/use-company-listings";
import { PlusIcon } from "@heroicons/react/20/solid";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import Link from "next/link";
import { useState } from "react";

const STATUS_LABEL: Record<ListingStatus, string> = {
  DRAFT: "Taslak",
  OPEN: "Açık",
  CLOSED: "Kapandı",
  AWARDED: "Kazandırıldı",
  CANCELLED: "İptal",
};

/** Kendi ilanlarım (portal türüne göre filtreli) + oluştur. */
export function MyListings({
  type,
  title,
  createLabel,
  emptyHint,
  createHref,
}: {
  type: ListingType;
  title: string;
  createLabel: string;
  emptyHint: string;
  /** Verilirse "oluştur" butonu bu sayfaya yönlendirir (çok-adımlı wizard);
   *  yoksa basit dialog açılır. */
  createHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const mine = useMyListings();
  const rows = (mine.data ?? []).filter((l) => l.type === type);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Heading>{title}</Heading>
        {createHref ? (
          <Button href={createHref}>
            <PlusIcon data-slot="icon" />
            {createLabel}
          </Button>
        ) : (
          <Button onClick={() => setOpen(true)}>
            <PlusIcon data-slot="icon" />
            {createLabel}
          </Button>
        )}
      </div>

      {mine.isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
          <Text className="text-sm text-zinc-500">{emptyHint}</Text>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((l) => (
            <Link
              key={l.id}
              href={`/company/ilan/${l.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3 transition hover:bg-zinc-50"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-900">
                  {l.title}
                </div>
                <div className="text-xs text-zinc-500">
                  <span className="font-mono">{l.number ?? "—"}</span>
                  {" · "}
                  {l.visibility === "PUBLIC" ? "herkese açık" : "bağlantılar"}
                  {" · "}
                  {format(new Date(l.createdAt), "dd MMM yyyy", { locale: tr })}
                </div>
              </div>
              <Badge color="zinc">{STATUS_LABEL[l.status]}</Badge>
            </Link>
          ))}
        </div>
      )}

      <NewListingDialog
        open={open}
        onClose={() => setOpen(false)}
        fixedType={type}
      />
    </div>
  );
}

/** Bana açık ilanlar (browse) — portal türüne göre filtreli. */
export function BrowseListings({
  type,
  title,
  emptyHint,
}: {
  type: ListingType;
  title: string;
  emptyHint: string;
}) {
  const browse = useBrowseListings();
  const rows = (browse.data ?? []).filter((l) => l.type === type);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Heading>{title}</Heading>

      {browse.isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
          <Text className="text-sm text-zinc-500">{emptyHint}</Text>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((l) => (
            <Link
              key={l.id}
              href={`/company/ilan/${l.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3 transition hover:bg-zinc-50"
            >
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
              {l.canBid ? (
                <Badge color="green">Teklif verebilirsin</Badge>
              ) : (
                <Badge color="amber">Premium gerekir</Badge>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
