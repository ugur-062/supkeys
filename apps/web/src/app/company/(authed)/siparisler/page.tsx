"use client";

import { Badge } from "@/components/catalyst/badge";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useOrders, type CompanyOrder } from "@/hooks/use-company-orders";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

const STATUS_LABEL: Record<CompanyOrder["status"], string> = {
  CREATED: "Yeni",
  IN_DELIVERY: "Kargoda",
  DELIVERED: "Teslim edildi",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
};

export default function SiparislerPage() {
  const { data, isLoading } = useOrders();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Heading>Siparişler</Heading>

      {isLoading ? (
        <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
      ) : !data || data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
          <Text className="text-sm text-zinc-500">
            Henüz siparişin yok. Bir ilan kazandırıldığında burada{" "}
            <span className="text-emerald-600">🟢 gönderdiğin</span> /{" "}
            <span className="text-blue-600">🔵 aldığın</span> sipariş olarak
            görünür.
          </Text>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Badge color={o.role === "seller" ? "emerald" : "blue"}>
                  {o.role === "seller" ? "🟢 Gönderiyorsun" : "🔵 Alıyorsun"}
                </Badge>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {o.listingTitle ?? "—"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    <span className="font-mono">{o.number}</span>
                    {" · "}
                    {o.role === "seller" ? "Alıcı" : "Satıcı"}: {o.counterparty}
                    {" · "}
                    {format(new Date(o.createdAt), "dd MMM yyyy", { locale: tr })}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-zinc-900">
                  {Number(o.amount).toLocaleString("tr-TR")} ₺
                </span>
                <Badge color="zinc">{STATUS_LABEL[o.status]}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
