import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { ApplicantType, ApplicationAdminAlertData } from "../types";
import { Button } from "./_components/button";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";
import { COLORS, FONTS } from "./_components/tokens";

const paragraph = {
  fontFamily: FONTS.sans,
  fontSize: "14px",
  lineHeight: "1.6",
  color: COLORS.slate700,
  margin: "0 0 16px 0",
};

const tableWrap = {
  backgroundColor: COLORS.surfaceSubtle,
  borderRadius: "8px",
  border: `1px solid ${COLORS.surfaceBorder}`,
  padding: "16px 20px",
  margin: "16px 0",
};

const row = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  lineHeight: "1.6",
  color: COLORS.slate700,
  margin: "0 0 6px 0",
};

const labelStyle = {
  color: COLORS.slate500,
  fontWeight: 500,
  display: "inline-block",
  width: "130px",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
};

interface Props extends ApplicationAdminAlertData {
  applicantType: ApplicantType;
}

export function makeApplicationAdminAlertSubject(
  applicantType: ApplicantType,
  companyName: string,
): string {
  return applicantType === "supplier"
    ? `🔔 Yeni tedarikçi başvurusu: ${companyName}`
    : `🔔 Yeni alıcı başvurusu: ${companyName}`;
}

export function ApplicationAdminAlertEmail(props: Props) {
  const role =
    props.applicantType === "supplier" ? "tedarikçi" : "alıcı";

  return (
    <Layout preview={`Yeni ${role} başvurusu: ${props.companyName}`}>
      <Heading>
        Yeni {role} başvurusu
      </Heading>

      <Text style={paragraph}>
        Aşağıdaki başvuru e-posta doğrulamasını tamamladı, inceleme bekliyor.
        {props.invitedByTenantName && (
          <>
            {" "}
            Bu başvuru{" "}
            <strong style={{ color: COLORS.brand900 }}>
              {props.invitedByTenantName}
            </strong>{" "}
            firmasının daveti ile geldi.
          </>
        )}
      </Text>

      <Section style={tableWrap}>
        <Text style={row}>
          <span style={labelStyle}>Firma:</span>{" "}
          <strong style={{ color: COLORS.brand900 }}>{props.companyName}</strong>
        </Text>
        <Text style={row}>
          <span style={labelStyle}>Yetkili:</span> {props.contactName}
        </Text>
        <Text style={row}>
          <span style={labelStyle}>E-posta:</span> {props.contactEmail}
        </Text>
        {props.contactPhone && (
          <Text style={row}>
            <span style={labelStyle}>Telefon:</span> {props.contactPhone}
          </Text>
        )}
        <Text style={row}>
          <span style={labelStyle}>Vergi No:</span>{" "}
          <span style={{ fontFamily: "monospace" }}>{props.taxNumber}</span>
        </Text>
        <Text style={row}>
          <span style={labelStyle}>Şehir:</span> {props.city}
        </Text>
        {props.industry && (
          <Text style={row}>
            <span style={labelStyle}>Sektör:</span> {props.industry}
          </Text>
        )}
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.reviewUrl}>İncele</Button>
      </Section>

      <Text
        style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}
      >
        Başvuru ID: {props.applicationId}
      </Text>
    </Layout>
  );
}

export function renderApplicationAdminAlertText(
  props: Props,
): string {
  const role = props.applicantType === "supplier" ? "tedarikçi" : "alıcı";
  const lines = [
    `Yeni ${role} başvurusu`,
    "",
    `Firma: ${props.companyName}`,
    `Yetkili: ${props.contactName}`,
    `E-posta: ${props.contactEmail}`,
  ];
  if (props.contactPhone) lines.push(`Telefon: ${props.contactPhone}`);
  lines.push(`Vergi No: ${props.taxNumber}`);
  lines.push(`Şehir: ${props.city}`);
  if (props.industry) lines.push(`Sektör: ${props.industry}`);
  if (props.invitedByTenantName) {
    lines.push("", `Davet eden: ${props.invitedByTenantName}`);
  }
  lines.push(
    "",
    `İncele: ${props.reviewUrl}`,
    `Başvuru ID: ${props.applicationId}`,
    "",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
