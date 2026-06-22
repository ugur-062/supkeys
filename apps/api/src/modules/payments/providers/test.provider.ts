import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentProvider,
} from "../payment-provider";

/**
 * Faz 7 — Test ödeme sağlayıcısı (varsayılan; Iyzico anahtarı yoksa).
 * Gerçek tahsilat yapmaz; kullanıcıyı bir "test ödeme" sayfasına yönlendirir,
 * orada onaylayınca ödeme PAID olur. Akışı uçtan uca test etmeyi sağlar.
 */
export class TestPaymentProvider implements PaymentProvider {
  readonly name = "test";

  constructor(private readonly webUrl: string) {}

  async createCheckout(
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutResult> {
    const base = this.webUrl.replace(/\/$/, "");
    return {
      redirectUrl: `${base}/supplier/premium/test-odeme?paymentId=${input.paymentId}`,
      providerRef: `test-${input.paymentId}`,
    };
  }
}
