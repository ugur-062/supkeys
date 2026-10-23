import { DEFAULT_LOCALE, emailT, type Locale } from "../i18n";
import type { ReferralInviteData } from "../types";
import { siteHost, type EmailEnv } from "./_components/email-env";
import { letterFooter, type Letter } from "./_components/plain-letter";

/**
 * Kayıtlı olmayan firmaya "katıl" daveti — DÜZ MEKTUP (2026-10-09, bkz.
 * `_components/plain-letter.tsx`): görsel, kart, tablo, düğme yok; tek ana
 * bağlantı (kayıt) + çıkış + aydınlatma metni. Metin olanı söyler: bağlantıyla
 * kaydolunca bağlantı kurulur, sonradan aynı adresle kaydolunca davet kabul
 * edilecek bir istek olarak görünür (koşulsuz "otomatik" vaadi yok).
 */

export function makeReferralInviteSubject(
  props: ReferralInviteData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return emailT(locale)("email.referralInvite.subject", {
    inviterName: props.inviterName,
  });
}

export function buildReferralInviteLetter(
  props: ReferralInviteData,
  locale: Locale = DEFAULT_LOCALE,
  env: EmailEnv = {},
): Letter {
  const t = emailT(locale);
  return {
    blocks: [
      { kind: "text", text: t("email.referralInvite.greeting") },
      { kind: "text", text: t("email.referralInvite.opening", { inviterName: props.inviterName }) },
      { kind: "text", text: t("email.referralInvite.about") },
      {
        kind: "text",
        text: t("email.referralInvite.autoConnect", { inviterName: props.inviterName, email: props.email }),
      },
      { kind: "links", links: [{ label: t("email.referralInvite.cta"), url: props.registerUrl }] },
      { kind: "text", text: t("email.referralInvite.ignoreNote") },
      { kind: "text", text: t("email.layout.textSignature") },
    ],
    footer: letterFooter(
      t,
      locale,
      env,
      t("email.referralInvite.footerReason", { inviterName: props.inviterName, site: siteHost(env.siteUrl) }),
      props.optOutUrl,
    ),
  };
}
