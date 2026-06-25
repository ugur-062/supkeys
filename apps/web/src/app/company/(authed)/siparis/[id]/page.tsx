"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useOrder, useOrderAction } from "@/hooks/use-company-orders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { OrderDocumentsSection } from "./_components/order-documents-section";
import { ArrowLeftIcon, CheckCircleIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";

const STEPS = [
  { key: "CREATED", label: "Oluştu" },
  { key: "IN_DELIVERY", label: "Kargoda" },
  { key: "DELIVERED", label: "Teslim alındı" },
  { key: "COMPLETED", label: "Tamamlandı" },
] as const;

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: o, isLoading } = useOrder(id);
  const action = useOrderAction(id);

  if (isLoading) return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  if (!o)
    return (
      <Text className="text-sm text-zinc-500">Sipariş bulunamadı.</Text>
    );

  const stepIndex = STEPS.findIndex((s) => s.key === o.status);
  const isSeller = o.role === "seller";

  const next =
    isSeller && o.status === "CREATED"
      ? { label: "Kargoya Ver", act: "ship" as const }
      : !isSeller && o.status === "IN_DELIVERY"
        ? { label: "Teslim Aldım", act: "receive" as const }
        : !isSeller && o.status === "DELIVERED"
          ? { label: "Ödemeyi Tamamla", act: "complete" as const }
          : null;

  const handle = async (act: "ship" | "receive" | "complete") => {
    try {
      await action.mutateAsync(act);
      toast.success("Sipariş güncellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/company"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Siparişler
      </Link>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge color={isSeller ? "emerald" : "blue"}>
            {isSeller ? "🟢 Satıcısın" : "🔵 Alıcısın"}
          </Badge>
          <span className="font-mono text-xs text-zinc-500">{o.number}</span>
        </div>
        <Heading>{o.listingTitle ?? "Sipariş"}</Heading>
        <Text className="text-sm">
          {isSeller ? "Alıcı" : "Satıcı"}: <strong>{o.counterparty}</strong> ·{" "}
          {Number(o.amount).toLocaleString("tr-TR")} ₺
        </Text>
      </div>

      {/* Sipariş kalemleri */}
      {o.items && o.items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-950/10">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Kalem</th>
                <th className="px-3 py-2 text-right font-medium">Miktar</th>
                <th className="px-3 py-2 text-right font-medium">Birim Fiyat</th>
                <th className="px-3 py-2 text-right font-medium">Tutar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {o.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 text-zinc-900">{it.name}</td>
                  <td className="px-3 py-2 text-right text-zinc-600">
                    {Number(it.quantity).toLocaleString("tr-TR")} {it.unit}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-600">
                    {Number(it.unitPrice).toLocaleString("tr-TR")} ₺
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-zinc-900">
                    {(
                      Number(it.unitPrice) * Number(it.quantity)
                    ).toLocaleString("tr-TR")}{" "}
                    ₺
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Timeline */}
      {o.status === "CANCELLED" ? (
        <Badge color="red">İptal edildi</Badge>
      ) : (
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <CheckCircleIcon
                  className={`h-6 w-6 ${
                    i <= stepIndex ? "text-emerald-500" : "text-zinc-300"
                  }`}
                />
                <span
                  className={`text-xs ${
                    i <= stepIndex ? "text-zinc-900" : "text-zinc-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 ? (
                <div
                  className={`h-0.5 flex-1 ${
                    i < stepIndex ? "bg-emerald-400" : "bg-zinc-200"
                  }`}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Aksiyon */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        {o.status === "COMPLETED" ? (
          <Text className="text-sm text-emerald-700">
            ✓ Sipariş tamamlandı.
          </Text>
        ) : next ? (
          <div className="flex items-center justify-between gap-4">
            <Text className="text-sm text-zinc-600">
              {next.act === "ship"
                ? "Malı kargoya verdiğinde işaretle."
                : next.act === "receive"
                  ? "Malı teslim aldığında işaretle."
                  : "Ödemeyi yaptığında siparişi tamamla."}
            </Text>
            <Button onClick={() => handle(next.act)} disabled={action.isPending}>
              {next.label}
            </Button>
          </div>
        ) : (
          <Text className="text-sm text-zinc-500">
            Karşı tarafın işlemi bekleniyor…
          </Text>
        )}
      </section>

      <OrderDocumentsSection orderId={id} role={o.role} />
    </div>
  );
}
