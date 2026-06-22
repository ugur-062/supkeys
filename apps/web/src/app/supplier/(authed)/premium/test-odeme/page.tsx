"use client";

import { Button } from "@/components/ui/button";
import { useConfirmTestPayment } from "@/hooks/use-supplier-premium";
import { CreditCard } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { toast } from "sonner";

function TestPaymentInner() {
  const router = useRouter();
  const params = useSearchParams();
  const paymentId = params.get("paymentId");
  const confirm = useConfirmTestPayment();

  const onPay = () => {
    if (!paymentId) return;
    confirm.mutate(paymentId, {
      onSuccess: () => {
        toast.success("Ödeme alındı — premium aktif!");
        router.push("/supplier/premium");
      },
      onError: () => toast.error("Ödeme tamamlanamadı"),
    });
  };

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <CreditCard className="mx-auto mb-2 h-8 w-8 text-amber-600" />
        <h1 className="text-lg font-bold text-zinc-900">Test Ödeme</h1>
        <p className="mt-1 text-sm text-amber-800">
          Bu bir <strong>test ödeme</strong> ekranıdır (gerçek tahsilat yok).
          Iyzico entegrasyonu canlıya alınınca burası gerçek ödeme formuna
          yönlenir.
        </p>
      </div>

      {!paymentId ? (
        <p className="mt-6 text-center text-sm text-rose-600">
          Geçersiz ödeme. Premium sayfasından tekrar başlatın.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          <Button onClick={onPay} loading={confirm.isPending} size="lg">
            Ödemeyi Onayla (Test)
          </Button>
          <Button
            variant="ghost"
            onClick={() => router.push("/supplier/premium")}
          >
            Vazgeç
          </Button>
        </div>
      )}
    </div>
  );
}

export default function TestPaymentPage() {
  return (
    <Suspense fallback={null}>
      <TestPaymentInner />
    </Suspense>
  );
}
