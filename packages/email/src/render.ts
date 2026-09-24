import { render } from "@react-email/render";
import * as React from "react";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
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
import type { EmailTemplateData, RenderedEmail } from "./types";

/**
 * `locale` ALICININ dilidir (bildirim/e-posta alıcı başına üretilir); verilmezse
 * Türkçe — bugünkü davranış aynen korunur. `notification` şablonunun GÖVDESİ
 * çağıranda üretilir, dil yalnız kabuğa (altbilgi + <html lang>) geçer.
 */
export async function renderEmail(
  spec: EmailTemplateData,
  locale: Locale = DEFAULT_LOCALE,
): Promise<RenderedEmail> {
  switch (spec.template) {
    case "password_reset": {
      const html = await render(
        React.createElement(PasswordResetEmail, { ...spec.data, locale }),
      );
      return {
        subject: makePasswordResetSubject(locale),
        html,
        text: renderPasswordResetText(spec.data, locale),
      };
    }
    case "tender_external_invite": {
      const html = await render(
        React.createElement(TenderExternalInviteEmail, { ...spec.data, locale }),
      );
      return {
        subject: makeTenderExternalInviteSubject(spec.data, locale),
        html,
        text: renderTenderExternalInviteText(spec.data, locale),
      };
    }
    case "referral_invite": {
      const html = await render(
        React.createElement(ReferralInviteEmail, { ...spec.data, locale }),
      );
      return {
        subject: makeReferralInviteSubject(spec.data, locale),
        html,
        text: renderReferralInviteText(spec.data, locale),
      };
    }
    case "notification": {
      const html = await render(
        React.createElement(NotificationEmail, { ...spec.data, locale }),
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
