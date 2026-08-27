import { Resend } from "resend";
import type {
  EmailProviderName,
  SendEmailInput,
  SendEmailResult,
} from "../types";
import { BaseEmailProvider } from "./base";

/** Tek istek için üst sınır — asılı bağlantı kullanıcıyı bekletmesin. */
const RESEND_TIMEOUT_MS = 10_000;

/** `p` verilen sürede bitmezse reddet (altta soket akmaya devam edebilir). */
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`[resend] istek zaman aşımına uğradı (${RESEND_TIMEOUT_MS}ms)`)),
        RESEND_TIMEOUT_MS,
      ).unref(),
    ),
  ]);
}

export class ResendProvider extends BaseEmailProvider {
  readonly name: EmailProviderName = "resend";
  private readonly client: Resend;

  constructor(apiKey: string) {
    super();
    this.client = new Resend(apiKey);
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const fromHeader = input.from.name
      ? `${input.from.name} <${input.from.email}>`
      : input.from.email;

    const attachments = input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      // Set ise Resend eki INLINE gönderir; HTML'de cid: ile referanslanır.
      inlineContentId: a.inlineContentId,
    }));

    /**
     * Denetim 2026-08-27 Parça 11 #9: Resend SDK'sı ne timeout ne özel `fetch`
     * kabul ediyor (kurucusu tek argümanlı, dist'te `AbortSignal` hiç yok) →
     * tek tavan undici `headersTimeout` ≈ 300 sn. Kayıt akışı bu çağrıyı
     * `await` ettiği için, sağlayıcı TCP'yi kabul edip yanıt vermediğinde
     * kullanıcının isteği 5 DAKİKA asılı kalıyordu. Soketi kapatamıyoruz ama
     * ÇAĞIRANI bekletmeyi bırakabiliriz: gecikme hata olarak yüzeye çıkar,
     * EmailLog FAILED damgalanır ve istek normal sürede biter.
     */
    const { data, error } = await withTimeout(
      this.client.emails.send({
      from: fromHeader,
      to: [input.to.email],
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
      replyTo: input.replyTo,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      }),
    );

    if (error) {
      // Resend SDK returns { data: null, error } shape — surface as Error
      throw new Error(
        `[resend] ${error.name ?? "send_failed"}: ${error.message ?? "unknown error"}`,
      );
    }

    return { providerMessageId: data?.id ?? null };
  }
}
