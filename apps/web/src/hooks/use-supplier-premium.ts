import { supplierApi } from "@/lib/supplier-auth/api";
import { useMutation } from "@tanstack/react-query";

/** Faz 7 — Premium ödeme başlat → sağlayıcının (test/Iyzico) URL'ine yönlendir. */
export function usePremiumCheckout() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await supplierApi.post<{
        paymentId: string;
        provider: string;
        redirectUrl: string;
      }>("/supplier-self-service/premium/checkout");
      return data;
    },
  });
}

/** Faz 7 — Test sağlayıcı ödeme onayı. */
export function useConfirmTestPayment() {
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { data } = await supplierApi.post(
        "/supplier-self-service/premium/test-confirm",
        { paymentId },
      );
      return data;
    },
  });
}
