import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { UserInvitationData } from "../types";
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

const aboutBox = {
  marginTop: "20px",
  paddingTop: "20px",
  borderTop: `1px solid ${COLORS.surfaceBorder}`,
  fontFamily: FONTS.sans,
  fontSize: "12px",
  color: COLORS.slate500,
  lineHeight: "1.6",
};

export function makeUserInvitationSubject(tenantName: string): string {
  return `👥 ${tenantName} ekibine davet edildiniz — Rothern`;
}

export function UserInvitationEmail(props: UserInvitationData) {
  return (
    <Layout
      preview={`${props.tenantName} ekibine ${props.roleLabel} rolüyle davet edildiniz.`}
    >
      <Heading>Ekibe katılın 👥</Heading>

      <Text style={paragraph}>Merhaba,</Text>

      <Text style={paragraph}>
        <strong style={{ color: COLORS.brand900 }}>{props.inviterName}</strong>
        , sizi <strong>{props.tenantName}</strong> firmasının Rothern hesabına{" "}
        <strong>{props.roleLabel}</strong> rolüyle davet etti.
      </Text>

      <Section style={infoBox}>
        <strong style={{ color: COLORS.brand900 }}>Davet bilgileri</strong>
        <br />
        Firma: <strong>{props.tenantName}</strong>
        <br />
        Rol: <strong>{props.roleLabel}</strong>
        <br />
        Süre:{" "}
        <strong>
          {props.expiresInDays} gün
        </strong>{" "}
        içinde kabul etmeniz gerekiyor.
      </Section>

      <Text style={paragraph}>
        Hesabınızı oluşturmak ve ekibe katılmak için aşağıdaki butona tıklayın:
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.acceptUrl}>Daveti Kabul Et</Button>
      </Section>

      <Section style={aboutBox}>
        Bu e-posta <strong>{props.recipientEmail}</strong> adresine
        gönderildi. Eğer bu daveti beklemiyorsanız bu mesajı görmezden
        gelebilirsiniz — kabul etmediğiniz sürece hesap oluşmaz.
      </Section>
    </Layout>
  );
}

export function renderUserInvitationText(props: UserInvitationData): string {
  return [
    `${props.tenantName} ekibine davet edildiniz`,
    "",
    `${props.inviterName} sizi ${props.tenantName} firmasının Rothern hesabına ${props.roleLabel} rolüyle davet etti.`,
    "",
    `Davet ${props.expiresInDays} gün içinde geçerlidir.`,
    "",
    `Daveti kabul etmek için: ${props.acceptUrl}`,
    "",
    "— Rothern",
  ].join("\n");
}
