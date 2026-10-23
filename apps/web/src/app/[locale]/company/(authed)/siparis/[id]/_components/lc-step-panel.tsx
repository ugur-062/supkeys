"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import {
  useLcStep,
  type CompanyOrderDetail,
} from "@/hooks/use-company-orders";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { canActOnOrder } from "@/lib/orders/can-act-on-order";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useFormatPaymentPlan } from "@/i18n/domain";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { useFormatMoney } from "@/components/ui/money";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { Landmark } from "lucide-react";
import { toast } from "sonner";

/**
 * Akreditif (LC) adım paneli — yalnız paymentCategory=LETTER_OF_CREDIT.
 * Akış: alıcı "Akreditif Açıldı" (beyan; belge yüklemesi yok) → satıcı "Akreditifi Kabul
 * Ettim" (gönderim kilidi açılır) → gönder/teslim → satıcı "Ödeme Bankadan
 * Alındı" (sistem onaylı tam-tutar kaydı üretir, sipariş tamamlanır).
 *
 * Üç adım da karşı tarafa giden BEYANDIR ve geri alma yolu yoktur → her biri
 * onay penceresinden geçer; "Ödeme Bankadan Alındı" onaylı tam tutarlı ödeme
 * kaydı yarattığı için GERİ ALINAMAZ uyarısı taşır (arayüz testi O-029).
 */
export function LcStepPanel({ order }: { order: CompanyOrderDetail }) {
  const t = useTranslations("web.panel.trade.lcStepPanel");
  const paymentPlan = useFormatPaymentPlan();
  const id = order.id;
  const isSeller = order.role === "seller";
  // F7: LC adımları tarafın işlem rolünü ister (assertOrderRole aynası).
  const { user } = useCompanyAuth();
  const canAct = canActOnOrder(order.role, user);
  const opened = useLcStep(id, "opened");
  const accept = useLcStep(id, "accept");
  const paid = useLcStep(id, "paid");
  const confirm = useConfirm();
  const { money: formatMoney } = useFormatMoney();
  // Onay penceresi + istek boyunca tek uçuş (arayüz testi FX-00 kilidi).
  const lock = useSubmitLock();

  if (order.paymentCategory !== "LETTER_OF_CREDIT") return null;
  // Sonlanmış siparişte panel gizlenir. COMPLETED **gizlenmez**: Madde 17 ile
  // "Teslim Aldım" siparişi oto-tamamlıyor, banka ödemesi ise günler sonra
  // gelebiliyor — `lcMarkPaid` API'si COMPLETED'ı kabul eder (yaşam döngüsü
  // ayrımı, business-rules §3). Panel COMPLETED'da da açık kalmazsa satıcı
  // borcu kapatamaz (denetim 2026-08-23 Parça 3 #1).
  if (order.status === "REJECTED" || order.status === "CANCELLED") {
    return null;
  }
  // Onay öncesi (PENDING) LC adımı yok — önce satıcı siparişi kabul etmeli.
  if (order.status === "PENDING") return null;

  /** Onay penceresinden sonra adımı yürütür (vazgeçilirse istek atılmaz). */
  const run = (
    dialog: {
      title: string;
      description: string;
      confirmLabel: string;
      destructive?: boolean;
    },
    exec: () => Promise<unknown>,
    ok: string,
  ) =>
    void lock.run(async () => {
      const yes = await confirm(dialog);
      if (!yes) return;
      try {
        await exec();
        toast.success(ok);
      } catch (err) {
        toast.error(extractErrorMessage(err, t("islemBasarisiz")));
      }
    });

  const step = (() => {
    // ACCEPTED evresi — açılış + kabul. A1-DISPUTED (satıcının iptal talebi
    // reddedildi, ayıp ihbarı yok) da dahil: API lcMarkOpened/lcMarkAccepted'ı
    // orada da kabul eder (isA1Dispute) ve bunlar satıcının "mal bulundu →
    // sevk" çıkışının ön koşuludur (invariants §A1).
    const a1Dispute = order.status === "DISPUTED" && !order.defectNotifiedAt;
    if (order.status === "ACCEPTED" || a1Dispute) {
      if (!order.lcOpenedAt) {
        return isSeller
          ? {
              tone: "wait" as const,
              text: t("alicininAkreditifiAcmasiBekleniyorAlici"),
            }
          : {
              tone: "act" as const,
              text: t("akreditifiBankanizdanActirdiktanSonraAkredit"),
              button: {
                label: t("akreditifAcildi"),
                onClick: () =>
                  run(
                    {
                      title: t("acildiOnayBaslik"),
                      description: t("acildiOnayAciklama"),
                      confirmLabel: t("acildiOnayDugme"),
                    },
                    () => opened.mutateAsync(),
                    t("akreditifAcildiOlarakIsaretlendi"),
                  ),
                pending: opened.isPending,
              },
            };
      }
      if (!order.lcAcceptedAt) {
        return isSeller
          ? {
              tone: "act" as const,
              text: t("aliciAkreditifiActiKusatMektubunu"),
              button: {
                label: t("akreditifiKabulEttim"),
                onClick: () =>
                  run(
                    {
                      title: t("kabulOnayBaslik"),
                      description: t("kabulOnayAciklama"),
                      confirmLabel: t("kabulOnayDugme"),
                    },
                    () => accept.mutateAsync(),
                    t("akreditifKabulEdildi"),
                  ),
                pending: accept.isPending,
              },
            }
          : {
              tone: "wait" as const,
              text: t("akreditifiActinizSaticininKabulEtmesi"),
            };
      }
      // Kabul edildi → gönderim kilidi açık (gönderme işlemi Aksiyon bölümünde).
      return {
        tone: "ok" as const,
        text: t("akreditifKabulEdildiSaticiSiparisi"),
      };
    }

    // Gönderildi / teslim alındı / tamamlandı — banka ödemesi işaretlemesi.
    if (
      order.status === "IN_DELIVERY" ||
      order.status === "DELIVERED" ||
      order.status === "COMPLETED"
    ) {
      if (!order.lcPaidAt) {
        return isSeller
          ? {
              tone: "act" as const,
              text: t("akreditifOdemesiBankaKanalindanHesabiniza"),
              button: {
                label: t("odemeBankadanAlindi"),
                onClick: () =>
                  run(
                    {
                      title: t("odemeOnayBaslik"),
                      description: t("odemeOnayAciklama", {
                        amount: formatMoney(order.amount, order.currency),
                      }),
                      confirmLabel: t("odemeOnayDugme"),
                      destructive: true,
                    },
                    () => paid.mutateAsync(),
                    t("akreditifOdemesiAlindiOlarakIsaretlendi"),
                  ),
                pending: paid.isPending,
              },
            }
          : {
              tone: "wait" as const,
              text: t("odemeAkreditifKapsamindaBankaKanalindan"),
            };
      }
      // Ödeme alındı + sipariş tamamlandı → panel gizlenir (geçmiş Zaman
      // Tüneli'nde); açık siparişte "alındı" bilgisi görünmeye devam eder.
      if (order.status === "COMPLETED") return null;
      return {
        tone: "ok" as const,
        text: t("akreditifOdemesiAlindi"),
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
        {/* Başlık ödeme planının kendisi ("Akreditif (görüldüğünde ödemeli)") —
            eski "Akreditif — {plan}" sözcüğü iki kez basıyordu (arayüz testi D-128). */}
        <h2 className="text-sm font-semibold text-zinc-900">
          {paymentPlan(order)}
        </h2>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Text className="max-w-xl text-sm text-zinc-600">{step.text}</Text>
        {canAct && "button" in step && step.button ? (
          <Button
            onClick={step.button.onClick}
            disabled={step.button.pending || lock.locked}
          >
            {step.button.label}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
