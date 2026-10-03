import { Section, Text } from "@react-email/components";
import * as React from "react";
import { DEFAULT_LOCALE, emailT, type Locale } from "../i18n";
import type { PasswordResetData } from "../types";
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

export function makePasswordResetSubject(locale: Locale = DEFAULT_LOCALE): string {
  return emailT(locale)("email.passwordReset.subject");
}

export function PasswordResetEmail(props: PasswordResetData & { locale?: Locale }) {
  const locale = props.locale ?? DEFAULT_LOCALE;
  const t = emailT(locale);

  return (
    <Layout preview={t("email.passwordReset.preview")} locale={locale}>
      <Heading>{t("email.passwordReset.heading")}</Heading>

      <Text style={paragraph}>
        {t("email.passwordReset.greeting", { firstName: props.firstName })}
      </Text>

      <Text style={paragraph}>{t("email.passwordReset.intro")}</Text>

      <Section style={infoBox}>
        <strong style={{ color: COLORS.brand900 }}>
          {t("email.passwordReset.infoTitle")}
        </strong>
        <br />
        {t("email.passwordReset.accountLabel")} <strong>{props.email}</strong>
        <br />
        {t("email.passwordReset.validityLabel")}{" "}
        <strong>
          {t("email.passwordReset.validityValue", {
            minutes: props.expiresInMinutes,
          })}
        </strong>
        <br />
        {t("email.passwordReset.onceOnly")}
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.resetUrl}>{t("email.passwordReset.cta")}</Button>
      </Section>

      <Section style={warningBox}>{t("email.passwordReset.ignoreNote")}</Section>
    </Layout>
  );
}

export function renderPasswordResetText(
  props: PasswordResetData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = emailT(locale);
  return [
    t("email.passwordReset.textTitle"),
    "",
    t("email.passwordReset.greeting", { firstName: props.firstName }),
    "",
    t("email.passwordReset.textIntro"),
    "",
    t("email.passwordReset.textValidity", { minutes: props.expiresInMinutes }),
    "",
    t("email.passwordReset.textCta", { url: props.resetUrl }),
    "",
    t("email.passwordReset.textIgnore"),
    "",
    t("email.layout.textSignature"),
  ].join("\n");
}
