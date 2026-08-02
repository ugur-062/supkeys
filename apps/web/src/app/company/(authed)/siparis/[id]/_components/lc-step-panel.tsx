"use client";

import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import {
  useLcStep,
  type CompanyOrderDetail,
} from "@/hooks/use-company-orders";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { canActOnOrder } from "@/lib/orders/can-act-on-order";
import { extractErrorMessage } from "@/lib/tenders/error";
import { formatPaymentPlan } from "@/lib/tenders/labels";
import { Landmark } from "lucide-react";
import { toast } from "sonner";

/**
 * Akreditif (LC) adım paneli — yalnız paymentCategory=LETTER_OF_CREDIT.
 * Akış: alıcı "Akreditif Açıldı" (LC belgesi yüklü) → satıcı "Akreditifi Kabul
 * Ettim" (gönderim kilidi açılır) → gönder/teslim → satıcı "Ödeme Bankadan
 * Alındı" (sistem onaylı tam-tutar kaydı üretir, sipariş tamamlanır).
 */
export function LcStepPanel({ order }: { order: CompanyOrderDetail }) {
  const id = order.id;
  const isSeller = order.role === "seller";
  // F7: LC adımları tarafın işlem rolünü ister (assertOrderRole aynası).
  const { user } = useCompanyAuth();
  const canAct = canActOnOrder(order.role, user?.roles);
  const opened = useLcStep(id, "opened");
  const accept = useLcStep(id, "accept");
  const paid = useLcStep(id, "paid");

  if (order.paymentCategory !== "LETTER_OF_CREDIT") return null;
  // Sonlanmış siparişte panel gizlenir (tamamlanan LC ödemesi zaten geçmişte).
  if (
    order.status === "REJECTED" ||
    order.status === "CANCELLED" ||
    order.status === "COMPLETED"
  ) {
    return null;
  }
  // Onay öncesi (PENDING) LC adımı yok — önce satıcı siparişi kabul etmeli.
  if (order.status === "PENDING") return null;

  const run = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      toast.success(ok);
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const step = (() => {
    // ACCEPTED evresi — açılış + kabul.
    if (order.status === "ACCEPTED") {
      if (!order.lcOpenedAt) {
        return isSeller
          ? {
              tone: "wait" as const,
              text: "Alıcının akreditifi açması bekleniyor. Alıcı küşat mektubunu yükleyip 'Akreditif Açıldı' adımını tamamlayacak.",
            }
          : {
              tone: "act" as const,
              text: "Akreditifi açtırdıktan sonra küşat mektubunu aşağıdaki Belgeler bölümünden yükleyin ve 'Akreditif Açıldı' olarak işaretleyin.",
              button: {
                label: "Akreditif Açıldı",
                onClick: () =>
                  run(opened.mutateAsync(), "Akreditif açıldı olarak işaretlendi"),
                pending: opened.isPending,
              },
            };
      }
      if (!order.lcAcceptedAt) {
        return isSeller
          ? {
              tone: "act" as const,
              text: "Alıcı akreditifi açtı. Küşat mektubunu inceleyip kabul ederseniz gönderim adımı açılır.",
              button: {
                label: "Akreditifi Kabul Ettim",
                onClick: () =>
                  run(accept.mutateAsync(), "Akreditif kabul edildi"),
                pending: accept.isPending,
              },
            }
          : {
              tone: "wait" as const,
              text: "Akreditifi açtınız — satıcının kabul etmesi bekleniyor.",
            };
      }
      // Kabul edildi → gönderim kilidi açık (gönderme işlemi Aksiyon bölümünde).
      return {
        tone: "ok" as const,
        text: "Akreditif kabul edildi — satıcı siparişi gönderebilir.",
      };
    }

    // Gönderildi / teslim alındı — banka ödemesi işaretlemesi.
    if (order.status === "IN_DELIVERY" || order.status === "DELIVERED") {
      if (!order.lcPaidAt) {
        return isSeller
          ? {
              tone: "act" as const,
              text: "Akreditif ödemesi banka kanalından hesabınıza geçtiğinde işaretleyin — sistem tam tutarlı onaylı ödeme kaydı oluşturur.",
              button: {
                label: "Ödeme Bankadan Alındı",
                onClick: () =>
                  run(paid.mutateAsync(), "Akreditif ödemesi alındı olarak işaretlendi"),
                pending: paid.isPending,
              },
            }
          : {
              tone: "wait" as const,
              text: "Ödeme akreditif kapsamında banka kanalından yapılır — satıcı ödemeyi aldığında işaretleyecek.",
            };
      }
      return {
        tone: "ok" as const,
        text: "Akreditif ödemesi alındı.",
      };
    }
    return null;
  })();

  if (!step) return null;

  const toneCls =
    step.tone === "act"
      ? "border-indigo-200 bg-indigo-50"
      : step.tone === "ok"
        ? "border-emerald-200 bg-emerald-50"
        : "border-zinc-200 bg-zinc-50";

  return (
    <section className={`rounded-2xl border p-5 ${toneCls}`}>
      <div className="mb-2 flex items-center gap-2">
        <Landmark className="h-4 w-4 text-zinc-700" />
        <h2 className="text-sm font-semibold text-zinc-900">
          Akreditif — {formatPaymentPlan(order)}
        </h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Text className="max-w-xl text-sm text-zinc-600">{step.text}</Text>
        {canAct && "button" in step && step.button ? (
          <Button
            onClick={step.button.onClick}
            disabled={step.button.pending}
          >
            {step.button.label}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
