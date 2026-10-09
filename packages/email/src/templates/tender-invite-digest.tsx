import { DEFAULT_LOCALE, emailT, type Locale } from "../i18n";
import type { TenderInviteDigestData, TenderInviteDigestEntry } from "../types";
import { siteHost, type EmailEnv } from "./_components/email-env";
import { letterFooter, type Letter, type LetterBlock } from "./_components/plain-letter";
import { fitSubject, infoLines, itemLines } from "./tender-external-invite";

/**
 * BİRDEN ÇOK TALEP DAVETİ, TEK E-POSTA (2026-09-27, teslim edilebilirlik Faz 0b).
 *
 * Kayıtsız bir adrese 7 günde en fazla bir davet e-postası gider; o sürede
 * başka alıcılar da davet ettiyse davetler kaybolmaz, burada birlikte gelir
 * ("ABC İnşaat ve 2 alıcı daha sizden teklif istiyor"). Her talep tekli
 * davetin içerik kurallarıyla aynı: davet eden firma, başlık, numara, teslim
 * yeri (şehir + ülke), son tarih, ilk kalemler; hedef fiyat/şartname/belge YOK.
 *
 * DÜZ MEKTUP (2026-10-09, bkz. `_components/plain-letter.tsx`): talepler
 * numaralı düz satırlar. TEK ana bağlantı var — ilk talebin önizlemesi (o
 * davet edenin jetonu; oradan kayıt). Talep başına bağlantı BASILMAZ: soğuk
 * e-postada en fazla dört bağlantı (ana + çıkış + aydınlatma). Adres
 * doğrulanınca bu adrese gelmiş açık talep davetlerinin hepsi hesaba bağlanır
 * (`attachExternalListingInvites`), mektup da bunu söyler.
 */

/** Özette talep başına kalem önizlemesi — mektup kısa kalsın. */
export const DIGEST_ITEM_PREVIEW = 3;

/**
 * Farklı davet edenlerin görünen adları; adı görünenler önce (konuda "ilk ad"
 * olarak nötr "Bir alıcı firma" yerine gerçek ad tercih edilsin). Anahtar
 * yoksa ada göre tekilleşir (geriye dönük).
 */
function distinctInviters(invites: TenderInviteDigestEntry[]): string[] {
  const byKey = new Map<string, TenderInviteDigestEntry>();
  for (const i of invites) {
    const key = i.inviterKey ?? `name:${i.inviterName}`;
    if (!byKey.has(key)) byKey.set(key, i);
  }
  const all = [...byKey.values()];
  return [...all.filter((i) => !i.inviterAnonymous), ...all.filter((i) => i.inviterAnonymous)].map(
    (i) => i.inviterName,
  );
}

export function makeTenderInviteDigestSubject(
  data: TenderInviteDigestData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = emailT(locale);
  const inviters = distinctInviters(data.invites);
  // Same length rule as the single invitation (round 5, AI-MAIL-1): this
  // subject lists no item names, its only free part is the company name - a
  // very long one is shortened so the whole subject stays within the limit.
  return fitSubject(
    (first) =>
      inviters.length <= 1
        ? t("email.tenderInviteDigest.subjectSameBuyer", { first, count: data.invites.length })
        : t("email.tenderInviteDigest.subject", { first, count: inviters.length - 1 }),
    inviters[0] ?? "",
  );
}

export function buildTenderInviteDigestLetter(
  data: TenderInviteDigestData,
  locale: Locale = DEFAULT_LOCALE,
  env: EmailEnv = {},
): Letter {
  const t = emailT(locale);
  const first = data.invites[0];
  const blocks: LetterBlock[] = [
    { kind: "text", text: t("email.tenderExternalInvite.greeting") },
    { kind: "text", text: t("email.tenderInviteDigest.opening", { count: data.invites.length }) },
    ...data.invites.map((e, idx) => ({
      kind: "lines" as const,
      lines: [
        t("email.tenderInviteDigest.entryLine", {
          index: idx + 1,
          inviterName: e.inviterName,
          tenderTitle: e.tenderTitle,
        }),
        ...infoLines(t, {
          tenderNumber: e.tenderNumber,
          categories: [],
          deliveryPlace: e.deliveryPlace,
          closesAt: e.closesAt,
          supplierTypes: [],
        }),
        ...itemLines(t, e, DIGEST_ITEM_PREVIEW).lines,
      ],
    })),
    { kind: "text", text: t("email.tenderInviteDigest.howTo") },
    {
      kind: "lines",
      lines: [t("email.tenderExternalInvite.sealedBid"), t("email.tenderExternalInvite.freeToQuote")],
    },
    ...(first ? [{ kind: "links" as const, links: [{ label: t("email.tenderInviteDigest.cta"), url: first.ctaUrl }] }] : []),
    { kind: "text", text: t("email.layout.textSignature") },
  ];
  return {
    blocks,
    footer: letterFooter(
      t,
      locale,
      env,
      t("email.tenderInviteDigest.footerReason", { site: siteHost(env.siteUrl) }),
      data.optOutUrl,
    ),
  };
}
