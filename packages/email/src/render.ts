import { render } from "@react-email/render";
import * as React from "react";
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
  makeNotificationSubject,
  NotificationEmail,
  renderNotificationText,
} from "./templates/notification";
import type { EmailTemplateData, RenderedEmail } from "./types";

export async function renderEmail(
  spec: EmailTemplateData,
): Promise<RenderedEmail> {
  switch (spec.template) {
    case "password_reset": {
      const html = await render(
        React.createElement(PasswordResetEmail, spec.data),
      );
      return {
        subject: makePasswordResetSubject(),
        html,
        text: renderPasswordResetText(spec.data),
      };
    }
    case "referral_invite": {
      const html = await render(
        React.createElement(ReferralInviteEmail, spec.data),
      );
      return {
        subject: makeReferralInviteSubject(spec.data),
        html,
        text: renderReferralInviteText(spec.data),
      };
    }
    case "notification": {
      const html = await render(
        React.createElement(NotificationEmail, spec.data),
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
