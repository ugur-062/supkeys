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

  send(
    input: Omit<SendEmailInput, "from" | "replyTo">,
  ): Promise<SendEmailResult> {
    return this.provider.send({
      ...input,
      from: this.from,
      replyTo: this.replyTo,
      // Gömülü Rothern logosu + çağıranın (varsa) ekleri.
      attachments: [LOGO_ATTACHMENT, ...(input.attachments ?? [])],
    });
  }
}

export function createEmailClient(config: EmailClientConfig): EmailClient {
  return new EmailClient(config);
}
