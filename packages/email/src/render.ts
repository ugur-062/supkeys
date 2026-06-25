import { render } from "@react-email/render";
import * as React from "react";
import {
  makePasswordResetSubject,
  PasswordResetEmail,
  renderPasswordResetText,
} from "./templates/password-reset";
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
    default: {
      const _exhaustive: never = spec.template;
      throw new Error(`Unknown email template: ${String(_exhaustive)}`);
    }
  }
}
