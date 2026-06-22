/**
 * Faz 7 — Sağlayıcı-agnostik ödeme arayüzü. TR'de Iyzico, yurtdışında
 * (ileride) Stripe Connect implementasyonu bu arayüzü uygular.
 */
export interface CreateCheckoutInput {
  paymentId: string;
  amount: number;
  currency: string;
  description: string;
  /** Ödeme sonrası kullanıcının/sağlayıcının döneceği URL. */
  callbackUrl: string;
  buyer: { id: string; name: string; email: string };
}

export interface CreateCheckoutResult {
  /** Kullanıcının ödeme için yönlendirileceği URL (hosted form / test sayfası). */
  redirectUrl: string;
  /** Sağlayıcı tarafındaki referans (token/conversationId). */
  providerRef?: string;
}

export interface CallbackResult {
  paymentId: string;
  success: boolean;
  providerRef?: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
}
