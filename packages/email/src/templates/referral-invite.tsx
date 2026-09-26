import { Section, Text } from "@react-email/components";
import * as React from "react";
import { DEFAULT_LOCALE, emailT, type Locale } from "../i18n";
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

/** Cümle içinde kalın yazılan parça — çeviride sözcük sırası değişse de yerini korur. */
const bold = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

export function makeReferralInviteSubject(
  props: ReferralInviteData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return emailT(locale)("email.referralInvite.subject", {
    inviterName: props.inviterName,
  });
}

export function ReferralInviteEmail(props: ReferralInviteData & { locale?: Locale }) {
  const locale = props.locale ?? DEFAULT_LOCALE;
  const t = emailT(locale);

  return (
    <Layout
      preview={t("email.referralInvite.preview", {
        inviterName: props.inviterName,
      })}
      locale={locale}
    >
      <Heading>{t("email.referralInvite.heading")}</Heading>

      <Text style={paragraph}>{t("email.referralInvite.greeting")}</Text>

      <Text style={paragraph}>
        {t.rich("email.referralInvite.intro", {
          inviterName: props.inviterName,
          b: bold,
        })}
      </Text>

      <Text style={paragraph}>
        {t.rich("email.referralInvite.autoConnect", {
          inviterName: props.inviterName,
          b: bold,
        })}
      </Text>

      <Section style={infoBox}>
        <strong style={{ color: COLORS.brand900 }}>
          {t("email.referralInvite.infoTitle")}
        </strong>
        <br />
        {t("email.referralInvite.inviterLabel")}{" "}
        <strong>{props.inviterName}</strong>
        <br />
        {t("email.referralInvite.inviteeLabel")} <strong>{props.email}</strong>
        <br />
        {t("email.referralInvite.infoNote")}
      </Section>

      <Section style={ctaWrap}>
        <Button href={props.registerUrl}>{t("email.referralInvite.cta")}</Button>
      </Section>

      <Section style={warningBox}>{t("email.referralInvite.ignoreNote")}</Section>
    </Layout>
  );
}

export function renderReferralInviteText(
  props: ReferralInviteData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = emailT(locale);
  return [
    t("email.referralInvite.textTitle"),
    "",
    t("email.referralInvite.textIntro", { inviterName: props.inviterName }),
    "",
    t("email.referralInvite.textAbout"),
    "",
    t("email.referralInvite.textAutoConnect", {
      email: props.email,
      inviterName: props.inviterName,
    }),
    "",
    t("email.referralInvite.textCta", { url: props.registerUrl }),
    "",
    t("email.referralInvite.textIgnore"),
    "",
    t("email.layout.textSignature"),
  ].join("\n");
}
