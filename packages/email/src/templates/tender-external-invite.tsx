import { DEFAULT_LOCALE, emailT, type EmailMessageKey, type EmailTranslator, type Locale } from "../i18n";
import type { TenderExternalInviteData, TenderExternalInviteItem } from "../types";
import { siteHost, type EmailEnv } from "./_components/email-env";
import { letterFooter, type Letter, type LetterBlock, type LetterLink } from "./_components/plain-letter";

/**
 * Faz C — dış tedarikçi daveti ("X sizden teklif istiyor").
 *
 * DÜZ MEKTUP (2026-10-09, sahip: "AI'ın bulduğu, hiç kayıt olmamış firmalara
 * giden davet Promosyonlar'a ya da spam'e düşmemeli"): logo/görsel, kart,
 * renkli kutu, düğme YOK — bkz. `_components/plain-letter.tsx`. Mektup tek
 * `Letter` modelinden çizilir; HTML ve düz metin aynı şeyi söyler.
 *
 * İçerik BEYAZ LİSTE (2026-09-27): davet eden firmanın adı (izinliyse), talep
 * başlığı + numara, ilk kalemler ("ad — miktar birim", birim ve sayı biçimi
 * ALICININ dilinde), toplam kalem sayısı, teslim yeri (yalnız şehir + ülke),
 * son teklif tarihi, kategori(ler), aranan tedarikçi tipi. Hedef fiyat, marka,
 * şartname, belge, ticari şart ve tam adres yükte YOK (bkz. types.ts).
 * Bağlantılar: kayıt (ana), kayıtsız önizleme (yoksa vitrindeki herkese açık
 * sayfa), tek çıkış bağlantısı, aydınlatma metni — en fazla dört.
 * Metin olgusal: ünlem, emoji, vurgu için büyük harf, pazarlama sözcüğü yok.
 */

/**
 * "1.200 m" / "1,200 pieces" / "1 200 рулонов" — sayı ve birim TEK ICU
 * mesajında (çoğul uyumu dile göre). Katalogda olmayan birim (serbest metin)
 * olduğu gibi yazılır.
 */
export function formatInviteQuantity(t: EmailTranslator, item: TenderExternalInviteItem): string {
  const n = Number.isFinite(item.quantity) ? item.quantity : 0;
  const key = `email.domain.qty.${item.unitCode ?? ""}` as EmailMessageKey;
  if (item.unitCode && t.has(key)) return t(key, { n });
  return t("email.domain.qty.other", { n, unit: item.unit });
}

/** Faaliyet kodu → alıcının dilinde etiket; bilinmeyen kod düşer. */
function supplierTypeLabels(t: EmailTranslator, codes: readonly string[] | undefined): string[] {
  return (codes ?? [])
    .map((c) => `email.domain.activity.${c}` as EmailMessageKey)
    .filter((k) => t.has(k))
    .map((k) => t(k));
}

/** Talebin bilgi satırları (tekli davet ve özet ortak). */
export function infoLines(
  t: EmailTranslator,
  props: Pick<TenderExternalInviteData, "supplierTypes" | "tenderNumber" | "categories" | "deliveryPlace" | "closesAt">,
): string[] {
  const types = supplierTypeLabels(t, props.supplierTypes);
  return [
    ...(props.tenderNumber ? [t("email.tenderExternalInvite.numberLine", { number: props.tenderNumber })] : []),
    ...(props.categories.length > 0
      ? [
          t("email.tenderExternalInvite.categoryLine", {
            count: props.categories.length,
            categories: props.categories.join(", "),
          }),
        ]
      : []),
    ...(props.deliveryPlace ? [t("email.tenderExternalInvite.deliveryLine", { place: props.deliveryPlace })] : []),
    ...(props.closesAt ? [t("email.tenderExternalInvite.closesAtLine", { closesAt: props.closesAt })] : []),
    ...(types.length > 0 ? [t("email.tenderExternalInvite.supplierTypeLine", { types: types.join(", ") })] : []),
  ];
}

/**
 * Kalem satırları ("- ad — miktar birim") + gösterilmeyenler için "+N kalem
 * daha". `limit` verilirse yalnız ilk `limit` kalem (özet e-postası).
 */
export function itemLines(
  t: EmailTranslator,
  props: Pick<TenderExternalInviteData, "items" | "itemCount">,
  limit?: number,
): { lines: string[]; total: number } {
  const all = props.items ?? [];
  const items = limit === undefined ? all : all.slice(0, limit);
  const total = Math.max(props.itemCount ?? all.length, all.length);
  const more = total - items.length;
  return {
    lines: [
      ...items.map(
        (i) => `- ${t("email.tenderExternalInvite.itemLine", { name: i.name, qty: formatInviteQuantity(t, i) })}`,
      ),
      ...(items.length > 0 && more > 0 ? [t("email.tenderExternalInvite.moreItems", { count: more })] : []),
    ],
    total,
  };
}

/**
 * SUBJECT LENGTH - one rule for every invitation subject (round 5, AI-MAIL-1;
 * owner: these mails must not look like advertising). Two ordinary item names
 * made a 142-155 character subject: inboxes cut it and a long, list-like
 * subject reads as promotion. Limits:
 *  - an item name in a subject is at most `SUBJECT_ITEM_NAME_MAX` characters
 *    (cut at a word boundary, ellipsis);
 *  - the whole subject is at most `SUBJECT_MAX_LENGTH` characters: when two
 *    names do not fit, one name is used and the "+N" count grows by one; a
 *    name is shortened further only when even one does not fit, and a very
 *    long company name gives way last.
 * The body is not affected (it always carries the full names). Lengths are
 * counted in characters (code points), not UTF-16 units.
 */
export const SUBJECT_MAX_LENGTH = 110;
export const SUBJECT_ITEM_NAME_MAX = 40;
/** A name is not cut below this to make room for another part of the subject. */
const SUBJECT_NAME_FLOOR = 20;
const ELLIPSIS = "…";

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();
const textLength = (text: string): number => Array.from(text).length;

/**
 * `text` in at most `max` characters: cut at the last word boundary (a single
 * long word is cut inside), separators left hanging at the cut are dropped
 * and an ellipsis marks the cut. Text that fits is returned as it is (white
 * space collapsed).
 */
export function truncateAtWord(text: string, max: number): string {
  const chars = Array.from(oneLine(text));
  if (chars.length <= max) return chars.join("");
  if (max <= 0) return "";
  const head = chars.slice(0, max - 1);
  let cut = head.length;
  if (chars[max - 1] !== " ") {
    const lastSpace = head.lastIndexOf(" ");
    // A boundary in the first half would drop most of the name: cut inside the word.
    if (lastSpace >= Math.ceil(head.length / 2)) cut = lastSpace;
  }
  const kept = head
    .slice(0, cut)
    .join("")
    .replace(/[\s,;:\-–—/(&+]+$/u, "");
  return `${kept}${ELLIPSIS}`;
}

/**
 * The name to print in a subject that carries ONE free name (company name):
 * unchanged when `render(name)` fits, otherwise shortened to the room the
 * fixed text leaves. Callers that render the subject themselves (API
 * notification subjects from a catalog key) pass the result as the parameter.
 */
export function subjectName(render: (name: string) => string, name: string, max: number = SUBJECT_MAX_LENGTH): string {
  const clean = oneLine(name);
  if (textLength(render(clean)) <= max) return clean;
  return truncateAtWord(clean, Math.max(SUBJECT_NAME_FLOOR, max - textLength(render(""))));
}

/** `render(name)` within the subject limit (see `subjectName`). */
export function fitSubject(render: (name: string) => string, name: string, max: number = SUBJECT_MAX_LENGTH): string {
  const subject = render(subjectName(render, name, max));
  // Unreachable with today's catalogs (fixed text is short); a later, longer
  // sentence must still not produce an over-long subject.
  return textLength(subject) <= max ? subject : truncateAtWord(subject, max);
}

/**
 * Konudaki kalem özeti: ilk iki kalem adı + "+N kalem" ("M6 cıvata, Rulman +1
 * kalem"). Kalem yoksa talep başlığı. Konu kişiye özel ve somut olsun diye
 * (2026-09-27, kullanıcı: "şirket adı ve kalemler daha etkili olur").
 *
 * `budget` = characters the rest of the subject leaves for the summary (see
 * SUBJECT LENGTH above): two names -> one name with the count adjusted -> one
 * name shortened to the room left (never below the floor; the caller then
 * shortens the company name).
 */
export function inviteSubjectItems(
  t: EmailTranslator,
  props: Pick<TenderExternalInviteData, "items" | "itemCount" | "tenderTitle">,
  budget: number = Number.POSITIVE_INFINITY,
): string {
  const items = props.items ?? [];
  if (items.length === 0) return truncateAtWord(props.tenderTitle, Math.max(SUBJECT_NAME_FLOOR, budget));
  const total = Math.max(props.itemCount ?? items.length, items.length);
  const names = items.slice(0, 2).map((i) => truncateAtWord(i.name, SUBJECT_ITEM_NAME_MAX));
  const summary = (shown: string[]): string => {
    const more = total - shown.length;
    return more > 0
      ? `${shown.join(", ")} ${t("email.tenderExternalInvite.subjectMore", { count: more })}`
      : shown.join(", ");
  };
  for (let n = names.length; n >= 1; n--) {
    const text = summary(names.slice(0, n));
    if (textLength(text) <= budget) return text;
  }
  const tail = textLength(summary([""]));
  return summary([truncateAtWord(names[0], Math.max(SUBJECT_NAME_FLOOR, budget - tail))]);
}

export function makeTenderExternalInviteSubject(
  props: TenderExternalInviteData,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const t = emailT(locale);
  const key = props.reminder ? "email.tenderExternalInvite.reminderSubject" : "email.tenderExternalInvite.subjectItems";
  const render = (inviterName: string, items: string): string => t(key, { inviterName, items });
  const inviter = oneLine(props.inviterName);
  const items = inviteSubjectItems(t, props, SUBJECT_MAX_LENGTH - textLength(render(inviter, "")));
  return fitSubject((name) => render(name, items), inviter);
}

/** Gönderenin görünen adı: "ABC İnşaat (Rothern üzerinden)" — alıcının dilinde. */
export function inviteFromName(inviterName: string, locale: Locale = DEFAULT_LOCALE): string {
  return emailT(locale)("email.tenderExternalInvite.fromName", { inviterName });
}

/**
 * Davet mektubu (hatırlatmada yalnız açılış cümlesi değişir). Selamdan sonraki
 * ilk cümle olgunun kendisidir — gelen kutusu önizlemesi de odur.
 */
export function buildTenderExternalInviteLetter(
  props: TenderExternalInviteData,
  locale: Locale = DEFAULT_LOCALE,
  env: EmailEnv = {},
): Letter {
  const t = emailT(locale);
  const items = itemLines(t, props);
  // Önizleme bağlantısı varsa herkese açık sayfa basılmaz (iki içerik bağlantısı).
  const second: LetterLink | null = props.previewUrl
    ? { label: t("email.tenderExternalInvite.previewLabel"), url: props.previewUrl }
    : props.publicUrl
      ? { label: t("email.tenderExternalInvite.publicLabel"), url: props.publicUrl }
      : null;
  const blocks: LetterBlock[] = [
    { kind: "text", text: t("email.tenderExternalInvite.greeting") },
    {
      kind: "text",
      text: t(props.reminder ? "email.tenderExternalInvite.reminderOpening" : "email.tenderExternalInvite.opening", {
        inviterName: props.inviterName,
      }),
    },
    {
      kind: "lines",
      lines: [t("email.tenderExternalInvite.titleLine", { title: props.tenderTitle }), ...infoLines(t, props)],
    },
    ...(items.lines.length > 0
      ? [
          {
            kind: "lines" as const,
            lines: [t("email.tenderExternalInvite.itemsTitle", { count: items.total }), ...items.lines],
          },
        ]
      : []),
    { kind: "text", text: t("email.tenderExternalInvite.howTo", { inviterName: props.inviterName }) },
    {
      kind: "lines",
      lines: [t("email.tenderExternalInvite.sealedBid"), t("email.tenderExternalInvite.freeToQuote")],
    },
    {
      kind: "links",
      links: [{ label: t("email.tenderExternalInvite.cta"), url: props.registerUrl }, ...(second ? [second] : [])],
    },
    { kind: "text", text: t("email.layout.textSignature") },
  ];
  return {
    blocks,
    footer: letterFooter(
      t,
      locale,
      env,
      t("email.tenderExternalInvite.footerReason", { inviterName: props.inviterName, site: siteHost(env.siteUrl) }),
      props.optOutUrl,
    ),
  };
}
