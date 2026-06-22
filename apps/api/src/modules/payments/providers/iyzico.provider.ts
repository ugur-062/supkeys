import { Logger } from "@nestjs/common";
import { createHmac, randomBytes } from "node:crypto";
import type {
  CallbackResult,
  CreateCheckoutInput,
  CreateCheckoutResult,
  PaymentProvider,
} from "../payment-provider";

/**
 * Faz 7 — Iyzico (TR) ödeme sağlayıcısı. Resmi `iyzipay` SDK'sı YERİNE doğrudan
 * REST + IYZWSv2 HMAC imzası kullanılır (yeni bağımlılık yok).
 *
 * ⚠️ SANDBOX DOĞRULAMASI GEREKİYOR: İmza/istek formatı Iyzico dokümanına göre
 * yazıldı; canlıya almadan önce sandbox anahtarlarıyla test edilmeli.
 * Anahtar yoksa PaymentsService bu sağlayıcıyı SEÇMEZ (test sağlayıcı kullanılır).
 */
export class IyzicoProvider implements PaymentProvider {
  readonly name = "iyzico";
  private readonly logger = new Logger(IyzicoProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly secretKey: string,
    private readonly baseUrl: string, // örn. https://sandbox-api.iyzipay.com
  ) {}

  /** IYZWSv2 Authorization header'ı üretir. */
  private authHeader(uriPath: string, body: string): string {
    const randomKey = `${Date.now()}${randomBytes(8).toString("hex")}`;
    const payload = randomKey + uriPath + body;
    const signature = createHmac("sha256", this.secretKey)
      .update(payload)
      .digest("hex");
    const authString = `apiKey:${this.apiKey}&randomKey:${randomKey}&signature:${signature}`;
    return `IYZWSv2 ${Buffer.from(authString).toString("base64")}`;
  }

  async createCheckout(
    input: CreateCheckoutInput,
  ): Promise<CreateCheckoutResult> {
    const uriPath = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
    const priceStr = input.amount.toFixed(2);
    const [firstName, ...rest] = input.buyer.name.trim().split(" ");
    const lastName = rest.join(" ") || firstName;

    const requestBody = {
      locale: "tr",
      conversationId: input.paymentId,
      price: priceStr,
      paidPrice: priceStr,
      currency: input.currency,
      basketId: input.paymentId,
      paymentGroup: "PRODUCT",
      callbackUrl: input.callbackUrl,
      buyer: {
        id: input.buyer.id,
        name: firstName,
        surname: lastName,
        email: input.buyer.email,
        identityNumber: "11111111111",
        registrationAddress: "—",
        city: "Istanbul",
        country: "Turkey",
        ip: "0.0.0.0",
      },
      billingAddress: {
        contactName: input.buyer.name,
        city: "Istanbul",
        country: "Turkey",
        address: "—",
      },
      basketItems: [
        {
          id: input.paymentId,
          name: input.description,
          category1: "Abonelik",
          itemType: "VIRTUAL",
          price: priceStr,
        },
      ],
    };

    const body = JSON.stringify(requestBody);
    const res = await fetch(`${this.baseUrl}${uriPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader(uriPath, body),
      },
      body,
    });
    const data = (await res.json()) as {
      status?: string;
      paymentPageUrl?: string;
      token?: string;
      errorMessage?: string;
    };
    if (data.status !== "success" || !data.paymentPageUrl) {
      this.logger.warn(`Iyzico checkout init başarısız: ${data.errorMessage}`);
      throw new Error(data.errorMessage ?? "Iyzico ödeme başlatılamadı");
    }
    return { redirectUrl: data.paymentPageUrl, providerRef: data.token };
  }

  /**
   * Callback doğrulama (token ile ödeme sonucunu sorgula). ⚠️ Sandbox'ta
   * doğrulanacak; şimdilik PaymentsService callback iskeleti kullanır.
   */
  async verifyCallback(token: string): Promise<CallbackResult> {
    const uriPath = "/payment/iyzipos/checkoutform/auth/ecom/detail";
    const body = JSON.stringify({ locale: "tr", token });
    const res = await fetch(`${this.baseUrl}${uriPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader(uriPath, body),
      },
      body,
    });
    const data = (await res.json()) as {
      status?: string;
      paymentStatus?: string;
      conversationId?: string;
      paymentId?: string;
    };
    return {
      paymentId: data.conversationId ?? "",
      success: data.status === "success" && data.paymentStatus === "SUCCESS",
      providerRef: data.paymentId,
    };
  }
}
