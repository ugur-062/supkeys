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
  DEMO_TO_REGISTER_INVITATION_SUBJECT,
  DemoToRegisterInvitationEmail,
  renderDemoToRegisterInvitationText,
} from "./templates/demo-to-register-invitation";
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
import {
  makeSupplierRelationEstablishedBuyerSubject,
  renderSupplierRelationEstablishedBuyerText,
  SupplierRelationEstablishedBuyerEmail,
} from "./templates/supplier-relation-established-buyer";
import {
  makeSupplierRelationEstablishedSupplierSubject,
  renderSupplierRelationEstablishedSupplierText,
  SupplierRelationEstablishedSupplierEmail,
} from "./templates/supplier-relation-established-supplier";
import {
  AwardCompletedBuyerEmail,
  makeAwardCompletedBuyerSubject,
  renderAwardCompletedBuyerText,
} from "./templates/award-completed-buyer";
import {
  AwardLostSupplierEmail,
  makeAwardLostSupplierSubject,
  renderAwardLostSupplierText,
} from "./templates/award-lost-supplier";
import {
  AwardWonSupplierEmail,
  makeAwardWonSupplierSubject,
  renderAwardWonSupplierText,
} from "./templates/award-won-supplier";
import {
  BidEliminatedSupplierEmail,
  makeBidEliminatedSupplierSubject,
  renderBidEliminatedSupplierText,
} from "./templates/bid-eliminated-supplier";
import {
  makeTenderClosedBuyerSubject,
  renderTenderClosedBuyerText,
  TenderClosedBuyerEmail,
} from "./templates/tender-closed-buyer";
import {
  makeTenderClosedSupplierSubject,
  renderTenderClosedSupplierText,
  TenderClosedSupplierEmail,
} from "./templates/tender-closed-supplier";
import {
  makeAuctionClosingReminderSubject,
  renderAuctionClosingReminderText,
  AuctionClosingReminderEmail,
} from "./templates/auction-closing-reminder";
import {
  makeTenderClosingTimeChangedSubject,
  renderTenderClosingTimeChangedText,
  TenderClosingTimeChangedEmail,
} from "./templates/tender-closing-time-changed";
import {
  makeTenderInvitationSubject,
  renderTenderInvitationText,
  TenderInvitationEmail,
} from "./templates/tender-invitation";
import {
  makeUserInvitationSubject,
  renderUserInvitationText,
  UserInvitationEmail,
} from "./templates/user-invitation";
import {
  AdminPasswordResetEmail,
  makeAdminPasswordResetSubject,
  renderAdminPasswordResetText,
} from "./templates/admin-password-reset";
import {
  ApprovalRequiredEmail,
  makeApprovalRequiredSubject,
  renderApprovalRequiredText,
} from "./templates/approval-required";
import {
  ApprovalApprovedEmail,
  makeApprovalApprovedSubject,
  renderApprovalApprovedText,
} from "./templates/approval-approved";
import {
  ApprovalRejectedEmail,
  makeApprovalRejectedSubject,
  renderApprovalRejectedText,
} from "./templates/approval-rejected";
import {
  ApprovalReminderEmail,
  makeApprovalReminderSubject,
  renderApprovalReminderText,
} from "./templates/approval-reminder";
import {
  MessageNotificationEmail,
  makeMessageNotificationSubject,
  renderMessageNotificationText,
} from "./templates/message-notification";
import {
  OrderStatusChangedEmail,
  makeOrderStatusChangedSubject,
  renderOrderStatusChangedText,
} from "./templates/order-status-changed";
import {
  makeTwoFactorOtpSubject,
  renderTwoFactorOtpText,
  TwoFactorOtpEmail,
} from "./templates/two-factor-otp";
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

    case "demo_to_register_invitation": {
      const html = await render(
        React.createElement(DemoToRegisterInvitationEmail, spec.data),
      );
      return {
        subject: DEMO_TO_REGISTER_INVITATION_SUBJECT,
        html,
        text: renderDemoToRegisterInvitationText(spec.data),
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
        subject: makeSupplierInvitationSubject(
          spec.data.inviterTenantName,
          spec.data.isExistingSupplier,
        ),
        html,
        text: renderSupplierInvitationText(spec.data),
      };
    }

    case "supplier_relation_established_buyer": {
      const html = await render(
        React.createElement(
          SupplierRelationEstablishedBuyerEmail,
          spec.data,
        ),
      );
      return {
        subject: makeSupplierRelationEstablishedBuyerSubject(
          spec.data.supplierCompanyName,
        ),
        html,
        text: renderSupplierRelationEstablishedBuyerText(spec.data),
      };
    }

    case "supplier_relation_established_supplier": {
      const html = await render(
        React.createElement(
          SupplierRelationEstablishedSupplierEmail,
          spec.data,
        ),
      );
      return {
        subject: makeSupplierRelationEstablishedSupplierSubject(
          spec.data.tenantName,
        ),
        html,
        text: renderSupplierRelationEstablishedSupplierText(spec.data),
      };
    }

    case "tender_invitation": {
      const html = await render(
        React.createElement(TenderInvitationEmail, spec.data),
      );
      return {
        subject: makeTenderInvitationSubject(spec.data.tenderTitle),
        html,
        text: renderTenderInvitationText(spec.data),
      };
    }

    case "tender_closed_supplier": {
      const html = await render(
        React.createElement(TenderClosedSupplierEmail, spec.data),
      );
      return {
        subject: makeTenderClosedSupplierSubject(spec.data.tenderTitle),
        html,
        text: renderTenderClosedSupplierText(spec.data),
      };
    }

    case "auction_closing_reminder": {
      const html = await render(
        React.createElement(AuctionClosingReminderEmail, spec.data),
      );
      return {
        subject: makeAuctionClosingReminderSubject(
          spec.data.tenderTitle,
          spec.data.minutesLeft,
        ),
        html,
        text: renderAuctionClosingReminderText(spec.data),
      };
    }

    case "tender_closing_time_changed": {
      const html = await render(
        React.createElement(TenderClosingTimeChangedEmail, spec.data),
      );
      return {
        subject: makeTenderClosingTimeChangedSubject(
          spec.data.tenderTitle,
          spec.data.closedImmediately,
        ),
        html,
        text: renderTenderClosingTimeChangedText(spec.data),
      };
    }

    case "tender_closed_buyer": {
      const html = await render(
        React.createElement(TenderClosedBuyerEmail, spec.data),
      );
      return {
        subject: makeTenderClosedBuyerSubject(spec.data.tenderTitle),
        html,
        text: renderTenderClosedBuyerText(spec.data),
      };
    }

    case "bid_eliminated_supplier": {
      const html = await render(
        React.createElement(BidEliminatedSupplierEmail, spec.data),
      );
      return {
        subject: makeBidEliminatedSupplierSubject(spec.data.tenderTitle),
        html,
        text: renderBidEliminatedSupplierText(spec.data),
      };
    }

    case "award_won_supplier": {
      const html = await render(
        React.createElement(AwardWonSupplierEmail, spec.data),
      );
      return {
        subject: makeAwardWonSupplierSubject(spec.data.tenderTitle),
        html,
        text: renderAwardWonSupplierText(spec.data),
      };
    }

    case "award_lost_supplier": {
      const html = await render(
        React.createElement(AwardLostSupplierEmail, spec.data),
      );
      return {
        subject: makeAwardLostSupplierSubject(spec.data.tenderTitle),
        html,
        text: renderAwardLostSupplierText(spec.data),
      };
    }

    case "award_completed_buyer": {
      const html = await render(
        React.createElement(AwardCompletedBuyerEmail, spec.data),
      );
      return {
        subject: makeAwardCompletedBuyerSubject(spec.data.tenderTitle),
        html,
        text: renderAwardCompletedBuyerText(spec.data),
      };
    }

    case "user_invitation": {
      const html = await render(
        React.createElement(UserInvitationEmail, spec.data),
      );
      return {
        subject: makeUserInvitationSubject(spec.data.tenantName),
        html,
        text: renderUserInvitationText(spec.data),
      };
    }

    case "admin_password_reset": {
      const html = await render(
        React.createElement(AdminPasswordResetEmail, spec.data),
      );
      return {
        subject: makeAdminPasswordResetSubject(),
        html,
        text: renderAdminPasswordResetText(spec.data),
      };
    }

    case "approval_required": {
      const html = await render(
        React.createElement(ApprovalRequiredEmail, spec.data),
      );
      return {
        subject: makeApprovalRequiredSubject(spec.data.tenderTitle),
        html,
        text: renderApprovalRequiredText(spec.data),
      };
    }

    case "approval_approved": {
      const html = await render(
        React.createElement(ApprovalApprovedEmail, spec.data),
      );
      return {
        subject: makeApprovalApprovedSubject(spec.data.tenderTitle),
        html,
        text: renderApprovalApprovedText(spec.data),
      };
    }

    case "approval_rejected": {
      const html = await render(
        React.createElement(ApprovalRejectedEmail, spec.data),
      );
      return {
        subject: makeApprovalRejectedSubject(spec.data.tenderTitle),
        html,
        text: renderApprovalRejectedText(spec.data),
      };
    }

    case "order_status_changed": {
      const html = await render(
        React.createElement(OrderStatusChangedEmail, spec.data),
      );
      return {
        subject: makeOrderStatusChangedSubject(
          spec.data.newStatus,
          spec.data.tenderTitle,
        ),
        html,
        text: renderOrderStatusChangedText(spec.data),
      };
    }

    case "approval_reminder": {
      const html = await render(
        React.createElement(ApprovalReminderEmail, spec.data),
      );
      return {
        subject: makeApprovalReminderSubject(
          spec.data.tenderTitle,
          spec.data.daysWaiting,
        ),
        html,
        text: renderApprovalReminderText(spec.data),
      };
    }

    case "message_notification": {
      const html = await render(
        React.createElement(MessageNotificationEmail, spec.data),
      );
      return {
        subject: makeMessageNotificationSubject(
          spec.data.contextLabel,
          spec.data.senderCompanyName,
        ),
        html,
        text: renderMessageNotificationText(spec.data),
      };
    }

    case "two_factor_otp": {
      const html = await render(
        React.createElement(TwoFactorOtpEmail, spec.data),
      );
      return {
        subject: makeTwoFactorOtpSubject(),
        html,
        text: renderTwoFactorOtpText(spec.data),
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
