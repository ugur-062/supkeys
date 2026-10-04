import * as React from "react";
import { DEFAULT_LOCALE, emailT, type Locale } from "../i18n";
import type { PasswordResetData } from "../types";
import { InfoRows, Note, Paragraph } from "./_components/blocks";
import { CtaButton } from "./_components/button";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";

/** Etiket katalogda iki noktalı ("Hesap:"); tablo sütununda iki nokta düşer. */
const label = (s: string) => s.replace(/[:：]\s*$/, "");

export function makePasswordResetSubject(locale: Locale = DEFAULT_LOCALE): string {
  return emailT(locale)("email.passwordReset.subject");
}

export function PasswordResetEmail(props: PasswordResetData & { locale?: Locale }) {
  const locale = props.locale ?? DEFAULT_LOCALE;
  const t = emailT(locale);

  return (
    <Layout preview={t("email.passwordReset.preview")} locale={locale}>
      <Heading>{t("email.passwordReset.heading")}</Heading>

      <Paragraph>{t("email.passwordReset.greeting", { firstName: props.firstName })}</Paragraph>

      <Paragraph>{t("email.passwordReset.intro")}</Paragraph>

      <InfoRows
        rows={[
          { label: label(t("email.passwordReset.accountLabel")), value: props.email },
          {
            label: label(t("email.passwordReset.validityLabel")),
            value: t("email.passwordReset.validityValue", { minutes: props.expiresInMinutes }),
          },
        ]}
        footer={t("email.passwordReset.onceOnly")}
      />

      <CtaButton href={props.resetUrl}>{t("email.passwordReset.cta")}</CtaButton>

      <Note>{t("email.passwordReset.ignoreNote")}</Note>
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
