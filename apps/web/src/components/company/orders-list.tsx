"use client";

import { Badge } from "@/components/catalyst/badge";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useOrders, type CompanyOrder } from "@/hooks/use-company-orders";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import Link from "next/link";

const STATUS_LABEL: Record<CompanyOrder["status"], string> = {
  CREATED: "Yeni",
  IN_DELIVERY: "Kargoda",
  DELIVERED: "Teslim edildi",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

export function OrdersList({ role }: { role: "buyer" | "seller" }) {
  const { data, isLoading } = useOrders();
  const rows = (data ?? []).filter((o) => o.role === role);
  const isSeller = role === "seller";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Heading>Siparişlerim</Heading>

      {isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
          <Text className="text-sm text-zinc-500">
            {isSeller
              ? "Henüz satış siparişin yok. Bir satış ilanın veya ihale teklifin kazandığında burada görünür."
              : "Henüz alım siparişin yok. Bir ihaleni kazandırdığında veya satın aldığında burada görünür."}
          </Text>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((o) => (
            <Link
              key={o.id}
              href={`/company/siparis/${o.id}`}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3 transition hover:bg-zinc-50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Badge color={isSeller ? "emerald" : "blue"}>
                  {isSeller ? "🟢 Gönderiyorsun" : "🔵 Alıyorsun"}
                </Badge>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {o.listingTitle ?? "—"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    <span className="font-mono">{o.number}</span>
                    {" · "}
                    {isSeller ? "Alıcı" : "Satıcı"}: {o.counterparty}
                    {" · "}
                    {format(new Date(o.createdAt), "dd MMM yyyy", {
                      locale: tr,
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-zinc-900">
                  {Number(o.amount).toLocaleString("tr-TR")} ₺
                </span>
                <Badge color="zinc">{STATUS_LABEL[o.status]}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
