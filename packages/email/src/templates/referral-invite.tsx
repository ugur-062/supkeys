import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { ReferralInviteData } from "../types";
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

const infoBox = {
  ...paragraph,
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "10px",
  padding: "14px 16px",
  fontSize: "13px",
  margin: "16px 0",
};

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
};

const warningBox = {
  marginTop: "20px",
  paddingTop: "20px",
  borderTop: `1px solid ${COLORS.surfaceBorder}`,
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  lineHeight: "1.6",
};

export function makeReferralInviteSubject(props: ReferralInviteData): string {
  return `🤝 ${props.inviterName} sizi Rothern'e davet etti`;
}

export function ReferralInviteEmail(props: ReferralInviteData) {
  return (
    <Layout preview={`${props.inviterName} sizinle Rothern'de bağlantı kurmak istiyor.`}>
      <Heading>Rothern&apos;e davet edildiniz 🤝</Heading>

      <Text style={paragraph}>Merhaba,</Text>

      <Text style={paragraph}>
        <strong>{props.inviterName}</strong>, sizinle Rothern üzerinden tedarik
        süreçlerini yürütmek için bağlantı kurmak istiyor. Rothern; teklif
        toplama, açık eksiltme, sipariş ve ödeme takibini tek yerde toplayan bir
        B2B tedarik platformudur.
      </Text>

      <Text style={paragraph}>
        Bu e-posta ile kaydolduğunuzda <strong>{props.inviterName}</strong> ile
        bağlantınız otomatik kurulur — bu bağlantı kalıcıdır, üyelik türünden
        bağımsız çalışır.
      </Text>

      <Section style={infoBox}>
        <strong style={{ color: COLORS.brand900 }}>Davet bilgisi</strong>
        <br />
        Davet eden: <strong>{props.inviterName}</strong>
        <br />
        Davet edilen: <strong>{props.email}</strong>
        <br />
        Bu adresle kaydolduğunuzda bağlantı otomatik kurulur.
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.registerUrl}>Rothern&apos;e Kaydol</Button>
      </Section>

      <Section style={warningBox}>
        Bu daveti beklemiyorduysanız bu e-postayı yok sayabilirsiniz — hiçbir
        işlem yapılmaz.
      </Section>
    </Layout>
  );
}

export function renderReferralInviteText(props: ReferralInviteData): string {
  return [
    "Rothern daveti",
    "",
    `${props.inviterName} sizi Rothern'e davet etti.`,
    "",
    "Rothern; teklif toplama, açık eksiltme, sipariş ve ödeme takibini tek",
    "yerde toplayan bir B2B tedarik platformudur.",
    "",
    `Bu adresle (${props.email}) kaydolduğunuzda ${props.inviterName} ile bağlantınız otomatik kurulur.`,
    "",
    `Kaydolmak için: ${props.registerUrl}`,
    "",
    "Bu daveti beklemiyorduysanız bu e-postayı yok sayabilirsiniz.",
    "",
    "— Rothern",
  ].join("\n");
}
