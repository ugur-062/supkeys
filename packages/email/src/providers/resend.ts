import { Resend } from "resend";
import type {
  EmailProviderName,
  SendEmailInput,
  SendEmailResult,
} from "../types";
import { BaseEmailProvider } from "./base";

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

    const { data, error } = await this.client.emails.send({
      from: fromHeader,
      to: [input.to.email],
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
      replyTo: input.replyTo,
    });

    if (error) {
      // Resend SDK returns { data: null, error } shape — surface as Error
      throw new Error(
        `[resend] ${error.name ?? "send_failed"}: ${error.message ?? "unknown error"}`,
      );
    }

    return { providerMessageId: data?.id ?? null };
  }
}
