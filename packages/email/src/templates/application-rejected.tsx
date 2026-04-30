import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { ApplicationRejectedData } from "../types";
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

const reasonBox = {
  backgroundColor: COLORS.surfaceSubtle,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderRadius: "8px",
  padding: "14px 18px",
  margin: "16px 0",
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  lineHeight: "1.6",
  fontStyle: "italic" as const,
};

export const APPLICATION_REJECTED_SUBJECT =
  "Başvurunuz hakkında — Supkeys";

export function ApplicationRejectedEmail(props: ApplicationRejectedData) {
  const role = props.applicantType === "supplier" ? "tedarikçi" : "alıcı";

  return (
    <Layout preview="Başvurunuz hakkında">
      <Heading>Merhaba {props.firstName},</Heading>

      <Text style={paragraph}>
        <strong>{props.companyName}</strong> firması adına yaptığınız {role}{" "}
        başvurusu maalesef bu aşamada uygun bulunmadı.
      </Text>

      <Heading level={2}>Sebep</Heading>
      <Section style={reasonBox}>{props.rejectionReason}</Section>

      <Text style={paragraph}>
        Eksik veya hatalı bir bilgi olduğunu düşünüyorsanız, başvurunuzu
        yenileyebilir veya destek ekibimize yazabilirsiniz.
      </Text>

      <Text style={{ ...paragraph, fontSize: "13px" }}>
        Sorularınız için:{" "}
        <a
          href={`mailto:${props.supportEmail}`}
          style={{ color: COLORS.brand700, textDecoration: "underline" }}
        >
          {props.supportEmail}
        </a>
      </Text>

      <Text
        style={{
          ...paragraph,
          marginTop: "20px",
          color: COLORS.brand900,
          fontWeight: 600,
        }}
      >
        — Supkeys ekibi
      </Text>
    </Layout>
  );
}

export function renderApplicationRejectedText(
  props: ApplicationRejectedData,
): string {
  const role = props.applicantType === "supplier" ? "tedarikçi" : "alıcı";
  return [
    `Merhaba ${props.firstName},`,
    "",
    `${props.companyName} firması adına yaptığınız ${role} başvurusu`,
    "maalesef bu aşamada uygun bulunmadı.",
    "",
    "Sebep:",
    props.rejectionReason,
    "",
    "Eksik veya hatalı bir bilgi olduğunu düşünüyorsanız",
    "başvurunuzu yenileyebilir veya destek ekibimize yazabilirsiniz.",
    "",
    `Sorularınız için: ${props.supportEmail}`,
    "",
    "— Supkeys ekibi",
    "© 2026 Supkeys",
  ].join("\n");
}
