import {
  LOGO_CID,
  LOGO_DARK_CID,
  LOGO_DARK_FILENAME,
  LOGO_FILENAME,
  ROTHERN_LOGO_BASE64,
  ROTHERN_LOGO_DARK_BASE64,
} from "./assets/logo";
import { BaseEmailProvider } from "./providers/base";
import { ResendProvider } from "./providers/resend";
import type {
  EmailAttachment,
  EmailClientConfig,
  SendEmailInput,
  SendEmailResult,
} from "./types";

/** Tüm e-postalar Rothern layout'unu kullanır ve logoyu `cid:rothern-logo`
 *  (koyu modda `cid:rothern-logo-dark`) ile referanslar → iki logo da her
 *  gönderime gömülü (inline) ek olarak eklenir. Böylece
 *  uzak görsel engelleyen istemcilerde (Gmail vb.) ve dev'de de görünür. */
const LOGO_ATTACHMENTS: EmailAttachment[] = [
  {
    filename: LOGO_FILENAME,
    content: ROTHERN_LOGO_BASE64,
    contentType: "image/png",
    inlineContentId: LOGO_CID,
  },
  // Koyu mod logosu (şeffaf zemin, açık renk): yalnız `prefers-color-scheme:
  // dark` okuyan istemcide ve Outlook.com koyu modunda görünür (layout.tsx).
  {
    filename: LOGO_DARK_FILENAME,
    content: ROTHERN_LOGO_DARK_BASE64,
    contentType: "image/png",
    inlineContentId: LOGO_DARK_CID,
  },
];

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
      // Gömülü Rothern logoları + çağıranın (varsa) ekleri.
      attachments: [...LOGO_ATTACHMENTS, ...(input.attachments ?? [])],
    });
  }
}

export function createEmailClient(config: EmailClientConfig): EmailClient {
  return new EmailClient(config);
}
