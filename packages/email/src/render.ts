import { render } from "@react-email/render";
import * as React from "react";
import { DEFAULT_LOCALE, emailT, type Locale } from "./i18n";
import {
  makePasswordResetSubject,
  PasswordResetEmail,
  renderPasswordResetText,
} from "./templates/password-reset";
import {
  makeReferralInviteSubject,
  ReferralInviteEmail,
  renderReferralInviteText,
} from "./templates/referral-invite";
import {
  TenderExternalInviteEmail,
  makeTenderExternalInviteSubject,
  renderTenderExternalInviteText,
} from "./templates/tender-external-invite";
import {
  makeNotificationSubject,
  NotificationEmail,
  renderNotificationText,
} from "./templates/notification";
import { EmailEnvContext, type EmailEnv } from "./templates/_components/email-env";
import type { EmailTemplateData, RenderedEmail } from "./types";

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
  // Düz metin sürümü de çıkış bağlantısını taşır (HTML alt bilgisiyle aynı
  // kural: yalnız işlem dışı e-postada, bağlam kurulduysa).
  if (!env.unsubscribeUrl) return rendered;
  const t = emailT(locale);
  const lines = [
    t("email.layout.textUnsubscribe", { url: env.unsubscribeUrl }),
    ...(env.preferencesUrl ? [t("email.layout.textPreferences", { url: env.preferencesUrl })] : []),
  ];
  return { ...rendered, text: `${rendered.text}\n\n${lines.join("\n")}` };
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
    case "tender_external_invite": {
      const html = await render(
        withEnv(env, React.createElement(TenderExternalInviteEmail, { ...spec.data, locale })),
      );
      return {
        subject: makeTenderExternalInviteSubject(spec.data, locale),
        html,
        text: renderTenderExternalInviteText(spec.data, locale),
      };
    }
    case "referral_invite": {
      const html = await render(
        withEnv(env, React.createElement(ReferralInviteEmail, { ...spec.data, locale })),
      );
      return {
        subject: makeReferralInviteSubject(spec.data, locale),
        html,
        text: renderReferralInviteText(spec.data, locale),
      };
    }
    case "notification": {
      const html = await render(
        withEnv(env, React.createElement(NotificationEmail, { ...spec.data, locale })),
      );
      return {
        subject: makeNotificationSubject(spec.data),
        html,
        text: renderNotificationText(spec.data),
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
