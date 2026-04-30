import { render } from "@react-email/render";
import * as React from "react";
import {
  ApplicationAdminAlertEmail,
  makeApplicationAdminAlertSubject,
  renderApplicationAdminAlertText,
} from "./templates/application-admin-alert";
import {
  APPLICATION_REJECTED_SUBJECT,
  ApplicationRejectedEmail,
  renderApplicationRejectedText,
} from "./templates/application-rejected";
import {
  BUYER_APPLICATION_APPROVED_SUBJECT,
  BuyerApplicationApprovedEmail,
  renderBuyerApplicationApprovedText,
} from "./templates/buyer-application-approved";
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
import {
  BUYER_EMAIL_VERIFICATION_SUBJECT,
  EmailVerificationEmail,
  renderEmailVerificationText,
  SUPPLIER_EMAIL_VERIFICATION_SUBJECT,
} from "./templates/email-verification";
import {
  SUPPLIER_APPLICATION_APPROVED_SUBJECT,
  SupplierApplicationApprovedEmail,
  renderSupplierApplicationApprovedText,
} from "./templates/supplier-application-approved";
import {
  makeSupplierInvitationSubject,
  renderSupplierInvitationText,
  SupplierInvitationEmail,
} from "./templates/supplier-invitation";
import type { EmailTemplateData, RenderedEmail } from "./types";

export async function renderEmail(
  spec: EmailTemplateData,
): Promise<RenderedEmail> {
  switch (spec.template) {
    case "demo_request_received": {
      const html = await render(
        React.createElement(DemoRequestReceivedEmail, spec.data),
      );
      return {
        subject: DEMO_REQUEST_RECEIVED_SUBJECT,
        html,
        text: renderDemoRequestReceivedText(spec.data),
      };
    }

    case "demo_request_admin_alert": {
      const html = await render(
        React.createElement(DemoRequestAdminAlertEmail, spec.data),
      );
      return {
        subject: makeDemoRequestAdminAlertSubject(spec.data.companyName),
        html,
        text: renderDemoRequestAdminAlertText(spec.data),
      };
    }

    case "buyer_email_verification": {
      const props = { ...spec.data, applicantType: "buyer" as const };
      const html = await render(
        React.createElement(EmailVerificationEmail, props),
      );
      return {
        subject: BUYER_EMAIL_VERIFICATION_SUBJECT,
        html,
        text: renderEmailVerificationText(props),
      };
    }

    case "supplier_email_verification": {
      const props = { ...spec.data, applicantType: "supplier" as const };
      const html = await render(
        React.createElement(EmailVerificationEmail, props),
      );
      return {
        subject: SUPPLIER_EMAIL_VERIFICATION_SUBJECT,
        html,
        text: renderEmailVerificationText(props),
      };
    }

    case "buyer_application_admin_alert": {
      const props = { ...spec.data, applicantType: "buyer" as const };
      const html = await render(
        React.createElement(ApplicationAdminAlertEmail, props),
      );
      return {
        subject: makeApplicationAdminAlertSubject("buyer", spec.data.companyName),
        html,
        text: renderApplicationAdminAlertText(props),
      };
    }

    case "supplier_application_admin_alert": {
      const props = { ...spec.data, applicantType: "supplier" as const };
      const html = await render(
        React.createElement(ApplicationAdminAlertEmail, props),
      );
      return {
        subject: makeApplicationAdminAlertSubject(
          "supplier",
          spec.data.companyName,
        ),
        html,
        text: renderApplicationAdminAlertText(props),
      };
    }

    case "buyer_application_approved": {
      const html = await render(
        React.createElement(BuyerApplicationApprovedEmail, spec.data),
      );
      return {
        subject: BUYER_APPLICATION_APPROVED_SUBJECT,
        html,
        text: renderBuyerApplicationApprovedText(spec.data),
      };
    }

    case "supplier_application_approved": {
      const html = await render(
        React.createElement(SupplierApplicationApprovedEmail, spec.data),
      );
      return {
        subject: SUPPLIER_APPLICATION_APPROVED_SUBJECT,
        html,
        text: renderSupplierApplicationApprovedText(spec.data),
      };
    }

    case "application_rejected": {
      const html = await render(
        React.createElement(ApplicationRejectedEmail, spec.data),
      );
      return {
        subject: APPLICATION_REJECTED_SUBJECT,
        html,
        text: renderApplicationRejectedText(spec.data),
      };
    }

    case "supplier_invitation": {
      const html = await render(
        React.createElement(SupplierInvitationEmail, spec.data),
      );
      return {
        subject: makeSupplierInvitationSubject(spec.data.inviterTenantName),
        html,
        text: renderSupplierInvitationText(spec.data),
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
