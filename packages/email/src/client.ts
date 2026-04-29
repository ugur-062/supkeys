import { BaseEmailProvider } from "./providers/base";
import { MailpitProvider } from "./providers/mailpit";
import { ResendProvider } from "./providers/resend";
import type {
  EmailClientConfig,
  SendEmailInput,
  SendEmailResult,
} from "./types";

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
    } else if (config.provider === "mailpit") {
      const host = config.mailpit?.host ?? "localhost";
      const port = config.mailpit?.port ?? 1025;
      this.provider = new MailpitProvider({ host, port });
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
    });
  }
}

export function createEmailClient(config: EmailClientConfig): EmailClient {
  return new EmailClient(config);
}
