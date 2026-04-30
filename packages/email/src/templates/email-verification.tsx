import { Section, Text } from "@react-email/components";
import * as React from "react";
import type { ApplicantType, EmailVerificationData } from "../types";
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

const ctaWrap = {
  textAlign: "center" as const,
  margin: "24px 0 8px 0",
};

const linkBox = {
  backgroundColor: COLORS.surfaceSubtle,
  border: `1px solid ${COLORS.surfaceBorder}`,
  borderRadius: "6px",
  padding: "10px 12px",
  fontFamily: "monospace",
  fontSize: "11px",
  wordBreak: "break-all" as const,
  color: COLORS.slate600,
  margin: "8px 0 16px 0",
};

const noticeBox = {
  ...paragraph,
  backgroundColor: COLORS.brand50,
  border: `1px solid ${COLORS.brand100}`,
  borderRadius: "8px",
  padding: "12px 16px",
  fontSize: "13px",
  margin: "16px 0",
};

interface Props extends EmailVerificationData {
  applicantType: ApplicantType;
}

export const BUYER_EMAIL_VERIFICATION_SUBJECT =
  "E-posta adresinizi doğrulayın — Supkeys";
export const SUPPLIER_EMAIL_VERIFICATION_SUBJECT =
  "Tedarikçi başvurunuz için e-posta doğrulama — Supkeys";

export function EmailVerificationEmail(props: Props) {
  const isSupplier = props.applicantType === "supplier";

  return (
    <Layout preview="Başvurunuzu tamamlamak için e-postanızı doğrulayın.">
      <Heading>Merhaba {props.firstName},</Heading>

      <Text style={paragraph}>
        <strong>{props.companyName}</strong> adına yaptığınız{" "}
        {isSupplier ? "tedarikçi" : "alıcı"} başvurusunu aldık. Hesabınızı
        oluşturmak için aşağıdaki bağlantıdan e-posta adresinizi doğrulayın.
      </Text>

      <Section style={ctaWrap}>
        <Button href={props.verifyUrl}>E-postamı Doğrula</Button>
      </Section>

      <Text style={{ ...paragraph, fontSize: "12px", color: COLORS.slate500 }}>
        Buton çalışmıyorsa aşağıdaki bağlantıyı tarayıcınıza yapıştırın:
      </Text>
      <Text style={linkBox}>{props.verifyUrl}</Text>

      <Section style={noticeBox}>
        Bu bağlantı <strong>24 saat</strong> içinde geçerlidir. Süre dolduğunda
        başvurunuzu tekrar başlatmanız gerekir.
      </Section>

      <Text
        style={{
          ...paragraph,
          margin: "20px 0 0 0",
          fontSize: "12px",
          color: COLORS.slate500,
        }}
      >
        Bu başvuruyu siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.
      </Text>
    </Layout>
  );
}

export function renderEmailVerificationText(
  props: Props,
): string {
  const role = props.applicantType === "supplier" ? "tedarikçi" : "alıcı";
  return [
    `Merhaba ${props.firstName},`,
    "",
    `${props.companyName} adına yaptığınız ${role} başvurusunu aldık.`,
    "Hesabınızı oluşturmak için e-posta adresinizi doğrulayın:",
    "",
    props.verifyUrl,
    "",
    "Bu bağlantı 24 saat içinde geçerlidir.",
    "",
    "Bu başvuruyu siz yapmadıysanız bu e-postayı görmezden gelebilirsiniz.",
    "",
    "© 2026 Supkeys",
  ].join("\n");
}
