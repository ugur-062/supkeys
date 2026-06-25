export type EmailTemplate = "password_reset";

export type EmailProviderName = "resend";

export interface EmailRecipient {
  email: string;
  name?: string;
}

/**
 * Self-service "şifremi unuttum" + e-posta daveti — kullanıcıya giden tek
 * kullanımlık parola belirleme/sıfırlama linki.
 */
export interface PasswordResetData {
  firstName: string;
  email: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export type EmailTemplateData = {
  template: "password_reset";
  data: PasswordResetData;
};

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailInput {
  to: EmailRecipient;
  from: { email: string; name?: string };
  replyTo?: string;
  rendered: RenderedEmail;
}

export interface SendEmailResult {
  providerMessageId: string | null;
}

export interface EmailClientConfig {
  provider: EmailProviderName;
  from: { email: string; name?: string };
  replyTo?: string;
  resend?: { apiKey: string };
}
