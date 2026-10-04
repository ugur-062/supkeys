import * as React from "react";
import { DEFAULT_LOCALE, emailT, type Locale } from "../i18n";
import type { ReferralInviteData } from "../types";
import { InfoRows, MutedLink, Note, Paragraph } from "./_components/blocks";
import { CtaButton } from "./_components/button";
import { Heading } from "./_components/heading";
import { Layout } from "./_components/layout";

/** Etiket katalogda iki noktalı ("Davet eden:"); tablo sütununda iki nokta düşer. */
const label = (s: string) => s.replace(/[:：]\s*$/, "");

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

      <Paragraph>{t("email.referralInvite.greeting")}</Paragraph>

      <Paragraph>
        {t.rich("email.referralInvite.intro", {
          inviterName: props.inviterName,
          b: bold,
        })}
      </Paragraph>

      <Paragraph>
        {t.rich("email.referralInvite.autoConnect", {
          inviterName: props.inviterName,
          b: bold,
        })}
      </Paragraph>

      <InfoRows
        rows={[
          { label: label(t("email.referralInvite.inviterLabel")), value: props.inviterName },
          { label: label(t("email.referralInvite.inviteeLabel")), value: props.email },
        ]}
        footer={t("email.referralInvite.infoNote")}
      />

      <CtaButton href={props.registerUrl}>{t("email.referralInvite.cta")}</CtaButton>

      <Note>
        {t("email.referralInvite.ignoreNote")}
        {props.optOutUrl ? (
          <>
            <br />
            {t.rich("email.referralInvite.optOut", {
              optout: (chunks: React.ReactNode) => <MutedLink href={props.optOutUrl}>{chunks}</MutedLink>,
            })}
          </>
        ) : null}
      </Note>
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
    ...(props.optOutUrl
      ? [t("email.referralInvite.textOptOut", { url: props.optOutUrl })]
      : []),
    "",
    t("email.layout.textSignature"),
  ].join("\n");
}
