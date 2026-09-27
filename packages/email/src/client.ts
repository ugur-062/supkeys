import {
  LOGO_CID,
  LOGO_FILENAME,
  ROTHERN_LOGO_BASE64,
} from "./assets/logo";
import { BaseEmailProvider } from "./providers/base";
import { ResendProvider } from "./providers/resend";
import type {
  EmailAttachment,
  EmailClientConfig,
  SendEmailInput,
  SendEmailResult,
} from "./types";

/** Tüm e-postalar Rothern layout'unu kullanır ve logoyu `cid:rothern-logo` ile
 *  referanslar → logo her gönderime gömülü (inline) ek olarak eklenir. Böylece
 *  uzak görsel engelleyen istemcilerde (Gmail vb.) ve dev'de de görünür. */
const LOGO_ATTACHMENT: EmailAttachment = {
  filename: LOGO_FILENAME,
  content: ROTHERN_LOGO_BASE64,
  contentType: "image/png",
  inlineContentId: LOGO_CID,
};

export class EmailClient {
  readonly provider: BaseEmailProvider;
  readonly from: { email: string; name?: string };
  readonly replyTo?: string;

  constructor(config: EmailClientConfig) {
    this.from = config.from;
    this.replyTo = config.replyTo;

    if (config.provider === "resend") {
      if (!config.resend?.apiKey) {
        throw new Error("[email] RESEND_API_KEY missing for provider=resend");
      }
      this.provider = new ResendProvider(config.resend.apiKey);
    } else {
      throw new Error(
        `[email] unsupported provider: ${String(config.provider)}`,
      );
    }
  }

  /**
   * `from`/`replyTo` verilmezse istemcinin varsayılanı. Akış bazlı gönderen
   * (bildirim/davet alt alan adı) ve davette "Firma (Rothern üzerinden)"
   * görünen adı çağırandan gelir.
   */
  send(
    input: Omit<SendEmailInput, "from" | "replyTo"> & {
      from?: { email: string; name?: string };
      replyTo?: string;
    },
  ): Promise<SendEmailResult> {
    return this.provider.send({
      ...input,
      from: input.from ?? this.from,
      replyTo: input.replyTo ?? this.replyTo,
      // Gömülü Rothern logosu + çağıranın (varsa) ekleri.
      attachments: [LOGO_ATTACHMENT, ...(input.attachments ?? [])],
    });
  }
}

export function createEmailClient(config: EmailClientConfig): EmailClient {
  return new EmailClient(config);
}
