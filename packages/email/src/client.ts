import { BaseEmailProvider } from "./providers/base";
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
