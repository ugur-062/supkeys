import type {
  EmailProviderName,
  SendEmailInput,
  SendEmailResult,
} from "../types";

export abstract class BaseEmailProvider {
  abstract readonly name: EmailProviderName;
  abstract send(input: SendEmailInput): Promise<SendEmailResult>;
}
