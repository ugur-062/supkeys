import nodemailer, { type Transporter } from "nodemailer";
import type {
  EmailProviderName,
  SendEmailInput,
  SendEmailResult,
} from "../types";
import { BaseEmailProvider } from "./base";

export class MailpitProvider extends BaseEmailProvider {
  readonly name: EmailProviderName = "mailpit";
  private readonly transporter: Transporter;

  constructor(opts: { host: string; port: number }) {
    super();
    this.transporter = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: false,
      ignoreTLS: true,
    });
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const info = await this.transporter.sendMail({
      from: input.from.name
        ? { name: input.from.name, address: input.from.email }
        : input.from.email,
      to: input.to.name
        ? { name: input.to.name, address: input.to.email }
        : input.to.email,
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
      replyTo: input.replyTo,
    });

    return { providerMessageId: info.messageId ?? null };
  }
}
