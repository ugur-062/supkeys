import { render } from "@react-email/render";
import * as React from "react";
import { DEFAULT_LOCALE, emailT, type Locale } from "./i18n";
import {
  makePasswordResetSubject,
  PasswordResetEmail,
  renderPasswordResetText,
} from "./templates/password-reset";
import { buildReferralInviteLetter, makeReferralInviteSubject } from "./templates/referral-invite";
import {
  buildTenderExternalInviteLetter,
  makeTenderExternalInviteSubject,
} from "./templates/tender-external-invite";
import { buildTenderInviteDigestLetter, makeTenderInviteDigestSubject } from "./templates/tender-invite-digest";
import {
  makeNotificationSubject,
  NotificationEmail,
  renderNotificationText,
} from "./templates/notification";
import {
  EmailEnvContext,
  privacyNoticeUrl,
  showsPrivacyNotice,
  type EmailEnv,
} from "./templates/_components/email-env";
import { PlainLetter, renderLetterText, type Letter } from "./templates/_components/plain-letter";
import type { EmailTemplate, EmailTemplateData, RenderedEmail } from "./types";

/**
 * DÜZ MEKTUP şablonları — kayıtsız adrese giden soğuk davetler (2026-10-09).
 * Marka kabuğunu (`Layout`: logo, kart, düğme) KULLANMAZLAR; alt bilgilerini
 * (kim-neden, çıkış, aydınlatma) kendileri taşırlar, `renderEmail` ayrıca
 * satır eklemez. Logo eki de gitmez (bkz. client.ts). Yeni bir soğuk davet
 * şablonu buraya eklenir; sözleşme `apps/api/test/unit/cold-invite-plain-letter.spec.ts`.
 */
export const PLAIN_LETTER_TEMPLATES: ReadonlySet<EmailTemplate> = new Set<EmailTemplate>([
  "tender_external_invite",
  "tender_invite_digest",
  "referral_invite",
]);

/** Şablonu gönderim ortamı bağlamıyla sarar (alt bilgi alan adı + yıl). */
function withEnv(env: EmailEnv, el: React.ReactElement): React.ReactElement {
  return React.createElement(EmailEnvContext.Provider, { value: env }, el);
}

/**
 * `locale` ALICININ dilidir (bildirim/e-posta alıcı başına üretilir); verilmezse
 * Türkçe — bugünkü davranış aynen korunur. `notification` şablonunun GÖVDESİ
 * çağıranda üretilir, dil yalnız kabuğa (altbilgi + <html lang>) geçer.
 * `env` gönderim ortamı: `siteUrl` alt bilgideki alan adı (staging kendi
 * alanını basar); verilmezse "rothern.com".
 */
export async function renderEmail(
  spec: EmailTemplateData,
  locale: Locale = DEFAULT_LOCALE,
  env: EmailEnv = {},
): Promise<RenderedEmail> {
  const rendered = await renderTemplate(spec, locale, env);
  // Düz mektup kendi alt bilgisini (tek çıkış bağlantısı + aydınlatma) taşır.
  if (PLAIN_LETTER_TEMPLATES.has(spec.template)) return rendered;
  // Düz metin sürümü de çıkış ve aydınlatma bağlantısını taşır (HTML alt
  // bilgisiyle aynı kural: çıkış yalnız işlem dışı e-postada; aydınlatma
  // çıkışla birlikte ya da `privacyNotice` bayrağıyla).
  const privacy = showsPrivacyNotice(env);
  if (!env.unsubscribeUrl && !env.preferencesUrl && !privacy) return rendered;
  const t = emailT(locale);
  const lines = [
    ...(env.unsubscribeUrl ? [t("email.layout.textUnsubscribe", { url: env.unsubscribeUrl })] : []),
    ...(env.unsubscribeUrl && env.preferencesUrl
      ? [t("email.layout.textPreferences", { url: env.preferencesUrl })]
      : []),
    // ACTIVITY bildirimi: çıkış yok, yalnız bildirim ayarları (HTML ile aynı kural).
    ...(!env.unsubscribeUrl && env.preferencesUrl
      ? [t("email.layout.textPreferencesOnly", { url: env.preferencesUrl })]
      : []),
    ...(privacy ? [t("email.layout.textPrivacy", { url: privacyNoticeUrl(env.siteUrl, locale) })] : []),
  ];
  return { ...rendered, text: `${rendered.text}\n\n${lines.join("\n")}` };
}

/**
 * Düz mektubun iki parçası TEK modelden: HTML ve düz metin aynı şeyi söyler.
 * React'in akış işaretleri (`<!--$-->`, `<!--html-->`…) HTML'den atılır:
 * mektupta koşullu yorum (MSO) yok, görünmeyen hiçbir şey kalmasın.
 */
async function renderLetter(subject: string, letter: Letter, locale: Locale): Promise<RenderedEmail> {
  const html = await render(React.createElement(PlainLetter, { letter, locale }));
  return {
    subject,
    html: html.replace(/<!--[\s\S]*?-->/g, ""),
    text: renderLetterText(letter),
  };
}

async function renderTemplate(
  spec: EmailTemplateData,
  locale: Locale,
  env: EmailEnv,
): Promise<RenderedEmail> {
  switch (spec.template) {
    case "password_reset": {
      const html = await render(
        withEnv(env, React.createElement(PasswordResetEmail, { ...spec.data, locale })),
      );
      return {
        subject: makePasswordResetSubject(locale),
        html,
        text: renderPasswordResetText(spec.data, locale),
      };
    }
    case "tender_external_invite":
      return renderLetter(
        makeTenderExternalInviteSubject(spec.data, locale),
        buildTenderExternalInviteLetter(spec.data, locale, env),
        locale,
      );
    case "tender_invite_digest":
      return renderLetter(
        makeTenderInviteDigestSubject(spec.data, locale),
        buildTenderInviteDigestLetter(spec.data, locale, env),
        locale,
      );
    case "referral_invite":
      return renderLetter(
        makeReferralInviteSubject(spec.data, locale),
        buildReferralInviteLetter(spec.data, locale, env),
        locale,
      );
    case "notification": {
      const html = await render(
        withEnv(env, React.createElement(NotificationEmail, { ...spec.data, locale })),
      );
      return {
        subject: makeNotificationSubject(spec.data),
        html,
        text: renderNotificationText(spec.data, locale),
      };
    }
    default: {
      const _exhaustive: never = spec;
      throw new Error(
        `Unknown email template: ${String((_exhaustive as { template?: string }).template)}`,
      );
    }
  }
}
