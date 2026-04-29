import { render } from "@react-email/render";
import * as React from "react";
import {
  DemoRequestAdminAlertEmail,
  makeDemoRequestAdminAlertSubject,
  renderDemoRequestAdminAlertText,
} from "./templates/demo-request-admin-alert";
import {
  DEMO_REQUEST_RECEIVED_SUBJECT,
  DemoRequestReceivedEmail,
  renderDemoRequestReceivedText,
} from "./templates/demo-request-received";
import type { EmailTemplateData, RenderedEmail } from "./types";

export async function renderEmail(
  spec: EmailTemplateData,
): Promise<RenderedEmail> {
  switch (spec.template) {
    case "demo_request_received": {
      const html = await render(
        React.createElement(DemoRequestReceivedEmail, spec.data),
      );
      const text = renderDemoRequestReceivedText(spec.data);
      return {
        subject: DEMO_REQUEST_RECEIVED_SUBJECT,
        html,
        text,
      };
    }
    case "demo_request_admin_alert": {
      const html = await render(
        React.createElement(DemoRequestAdminAlertEmail, spec.data),
      );
      const text = renderDemoRequestAdminAlertText(spec.data);
      return {
        subject: makeDemoRequestAdminAlertSubject(spec.data.companyName),
        html,
        text,
      };
    }
    default: {
      const _exhaustive: never = spec;
      throw new Error(
        `[email] unknown template: ${JSON.stringify(_exhaustive)}`,
      );
    }
  }
}
