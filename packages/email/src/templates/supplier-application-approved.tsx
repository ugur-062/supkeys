import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { SupplierApplicationApprovedData } from "../types";
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

const upgradeBox = {
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "8px",
  padding: "14px 18px",
  margin: "16px 0",
  fontFamily: FONTS.sans,
  fontSize: "13px",
  color: COLORS.slate700,
  lineHeight: "1.6",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
};

export const SUPPLIER_APPLICATION_APPROVED_SUBJECT =
  "🎉 Tedarikçi hesabınız aktif — Supkeys";

export function SupplierApplicationApprovedEmail(
  props: SupplierApplicationApprovedData,
) {
  return (
    <Layout preview={`${props.companyName} tedarikçi hesabınız onaylandı.`}>
      <Heading>Hoş geldin {props.firstName}! 🎉</Heading>

      <Text style={paragraph}>
        <strong>{props.companyName}</strong> tedarikçi hesabınız onaylandı.
        {props.invitedByTenantName ? (
          <>
            {" "}
            <strong style={{ color: COLORS.brand900 }}>
              {props.invitedByTenantName}
            </strong>{" "}
            firmasının ihalelerine teklif verebilirsiniz.
          </>
        ) : (
          <> Tedarikçi panelinizden gelen ihalelere teklif verebilirsiniz.</>
        )}
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.loginUrl}>Tedarikçi Paneline Giriş Yap</Button>
      </Section>

      <Section style={upgradeBox}>
        <strong style={{ color: COLORS.brand900 }}>Standart üyelik</strong> ile
        davet edildiğiniz ihalelere teklif verebilirsiniz. Tüm açık ihalelere
        görünür olmak için ileride{" "}
        <strong style={{ color: COLORS.brand700 }}>Premium üyeliğe</strong>{" "}
        yükseltebilirsiniz.
      </Section>

      <Text
        style={{
          ...paragraph,
          marginTop: "24px",
          color: COLORS.brand900,
          fontWeight: 600,
        }}
      >
        — Supkeys ekibi
      </Text>
    </Layout>
  );
}

export function renderSupplierApplicationApprovedText(
  props: SupplierApplicationApprovedData,
): string {
  const lines = [
    `Hoş geldin ${props.firstName}!`,
    "",
    `${props.companyName} tedarikçi hesabınız onaylandı.`,
  ];
  if (props.invitedByTenantName) {
    lines.push(
      `${props.invitedByTenantName} firmasının ihalelerine teklif verebilirsiniz.`,
    );
  }
  lines.push(
    "",
    `Giriş yap: ${props.loginUrl}`,
    "",
    "Standart üyelik ile davet edildiğiniz ihalelere teklif verebilirsiniz.",
    "İleride Premium üyeliğe yükselterek tüm açık ihalelere görünür olabilirsiniz.",
    "",
    "— Supkeys ekibi",
    "© 2026 Supkeys",
  );
  return lines.join("\n");
}
