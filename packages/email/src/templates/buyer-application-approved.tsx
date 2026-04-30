import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { BuyerApplicationApprovedData } from "../types";
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

const stepBox = {
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "8px",
  padding: "14px 18px",
  margin: "12px 0",
};

const stepText = {
  fontFamily: FONTS.sans,
  fontSize: "13px",
  lineHeight: "1.6",
  color: COLORS.slate700,
  margin: 0,
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
};

export const BUYER_APPLICATION_APPROVED_SUBJECT =
  "🎉 Hesabınız aktif — Supkeys";

export function BuyerApplicationApprovedEmail(
  props: BuyerApplicationApprovedData,
) {
  return (
    <Layout preview={`${props.companyName} hesabınız onaylandı.`}>
      <Heading>Hoş geldin {props.firstName}! 🎉</Heading>

      <Text style={paragraph}>
        <strong>{props.companyName}</strong> hesabınız onaylandı. Artık Supkeys
        platformunda tedarikçilerinizle e-ihale ve teklif süreçlerini
        yönetebilirsiniz.
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.loginUrl}>Şimdi Giriş Yap</Button>
      </Section>

      <Heading level={2}>İlk değeri 5 dakikada al</Heading>

      <Section style={stepBox}>
        <Text style={stepText}>
          <strong style={{ color: COLORS.brand900 }}>1.</strong> İlk
          tedarikçilerini ekle veya davet et.
        </Text>
      </Section>
      <Section style={stepBox}>
        <Text style={stepText}>
          <strong style={{ color: COLORS.brand900 }}>2.</strong> Talebini
          yayınlayarak ilk ihaleni aç.
        </Text>
      </Section>
      <Section style={stepBox}>
        <Text style={stepText}>
          <strong style={{ color: COLORS.brand900 }}>3.</strong> Ekibine satın
          alma ve onay rolünde kullanıcılar davet et.
        </Text>
      </Section>

      <Text
        style={{ ...paragraph, marginTop: "24px", color: COLORS.brand900, fontWeight: 600 }}
      >
        — Supkeys ekibi
      </Text>
    </Layout>
  );
}

export function renderBuyerApplicationApprovedText(
  props: BuyerApplicationApprovedData,
): string {
  return [
    `Hoş geldin ${props.firstName}!`,
    "",
    `${props.companyName} hesabınız onaylandı.`,
    "",
    `Giriş yap: ${props.loginUrl}`,
    "",
    "İlk değeri 5 dakikada al:",
    "1. İlk tedarikçilerini ekle veya davet et.",
    "2. Talebini yayınlayarak ilk ihaleni aç.",
    "3. Ekibine satın alma ve onay rolünde kullanıcılar davet et.",
    "",
    "— Supkeys ekibi",
    "© 2026 Supkeys",
  ].join("\n");
}
