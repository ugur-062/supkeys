/**
 * FREE-MAIL PROVIDERS — single source (round 5, D6).
 *
 * The domain of a mailbox identifies the COMPANY behind it only when the
 * company owns that domain. `satis@firma.com` and `ihracat@firma.com` are the
 * same company; `firma1@gmail.com` and `firma2@gmail.com` are not. Every rule
 * that compares two addresses by domain ("is this company already invited to
 * this request?") must ignore the providers listed here and fall back to the
 * exact address.
 *
 * A domain that is listed here by mistake only loses the domain rule (the
 * exact-address rule still applies), so the list is generous. A provider that
 * is MISSING makes every mailbox of that provider look like one company for
 * the same request once one of them is invited: add it here.
 *
 * THE LIST IS NOT THE ONLY GUARD (round 5 review, R5-02): no list covers every
 * provider a foreign supplier may use (Chinese portals, Italian certified mail,
 * national ISPs). A caller that also knows the company's own site must ask for
 * OWNERSHIP as well - the mail domain belongs to the site, or is named after
 * the company (`ownsMailDomain`) - and fall back to the exact address
 * otherwise. See `candidateCompanyKeys` in the supplier discovery service.
 *
 * A SUB-DOMAIN of a provider is the provider (`vip.163.com`, `vip.qq.com`,
 * `vip.sina.com`, `pec.libero.it`): the walk below tries every parent domain.
 */
const FREE_MAIL_DOMAINS = new Set<string>([
  // Google / Microsoft / Apple / Yahoo (country variants: FREE_MAIL_BRANDS)
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "windowslive.com",
  "icloud.com", "me.com", "mac.com", "yahoo.com", "ymail.com", "rocketmail.com", "aol.com", "aim.com",
  // Privacy / paid-free mix
  "protonmail.com", "protonmail.ch", "proton.me", "pm.me", "tutanota.com", "tutanota.de", "tuta.io", "tuta.com",
  "fastmail.com", "fastmail.fm", "hey.com", "zoho.com", "zohomail.com", "zohomail.eu", "mail.com", "email.com",
  "gmx.com", "gmx.net", "gmx.de", "gmx.at", "gmx.ch", "web.de", "t-online.de", "freenet.de", "mail.de",
  "arcor.de", "online.de", "posteo.de", "posteo.net", "mailbox.org", "inbox.com", "mailfence.com", "runbox.com",
  "hushmail.com", "lycos.com",
  // Russia / CIS
  "yandex.ru", "yandex.com", "yandex.com.tr", "yandex.kz", "yandex.by", "yandex.ua", "ya.ru",
  "mail.ru", "bk.ru", "inbox.ru", "list.ru", "internet.ru", "rambler.ru", "ro.ru", "lenta.ru",
  "mail.kz", "mail.ua", "ukr.net", "i.ua", "meta.ua", "tut.by", "qip.ru", "pochta.ru",
  // Turkey
  "mynet.com", "superonline.com", "ttmail.com", "ttnet.net.tr", "turk.net", "windowslive.com.tr", "yaani.com",
  // Europe
  "orange.fr", "wanadoo.fr", "free.fr", "laposte.net", "sfr.fr", "neuf.fr", "bbox.fr", "libero.it", "virgilio.it",
  "tiscali.it", "alice.it", "tin.it", "fastwebnet.it", "email.it", "poste.it",
  // Italy - certified mail (PEC) providers: one domain, thousands of companies
  "pec.it", "legalmail.it", "arubapec.it", "postecert.it", "pecimprese.it", "registerpec.it", "mypec.eu",
  "gigapec.it", "sicurezzapostale.it", "lamiapec.it",
  "seznam.cz", "centrum.cz", "email.cz", "post.cz", "volny.cz", "atlas.cz", "azet.sk", "zoznam.sk", "centrum.sk",
  "post.sk", "wp.pl", "o2.pl", "op.pl", "interia.pl", "interia.eu", "onet.pl", "onet.eu", "poczta.fm", "gazeta.pl",
  "tlen.pl", "vp.pl", "go2.pl", "abv.bg", "mail.bg", "inbox.lv", "mail.ee", "freemail.hu", "citromail.hu",
  "btinternet.com", "sky.com", "talktalk.net", "virginmedia.com", "ntlworld.com", "telenet.be", "skynet.be",
  "bluewin.ch", "ziggo.nl", "kpnmail.nl", "planet.nl", "xs4all.nl", "hetnet.nl", "home.nl", "telia.com",
  "sapo.pt", "terra.es", "telefonica.net", "otenet.gr",
  // Americas / Asia-Pacific
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net",
  "earthlink.net", "optonline.net", "juno.com", "shaw.ca", "rogers.com", "bigpond.com", "optusnet.com.au",
  "uol.com.br", "bol.com.br", "terra.com.br", "ig.com.br", "globo.com", "globomail.com", "r7.com",
  // China
  "qq.com", "foxmail.com", "163.com", "163.net", "126.com", "188.com", "yeah.net", "sina.com", "sina.cn",
  "sina.com.cn", "sohu.com", "aliyun.com", "139.com", "189.cn", "wo.cn", "21cn.com", "tom.com", "263.net",
  "china.com", "chinaren.com", "eyou.com",
  // Korea / Japan / India
  "naver.com", "daum.net", "hanmail.net", "nate.com", "kakao.com", "docomo.ne.jp", "ezweb.ne.jp",
  "softbank.ne.jp", "nifty.com", "rediffmail.com", "indiatimes.com", "sify.com",
]);

/**
 * Providers that run the same mailbox service under many country domains
 * (`yandex.com.tr`, `yahoo.co.uk`, `hotmail.fr`, `outlook.de`, `live.nl`,
 * `gmx.es`). Matched only as `<brand>.<public suffix>`: `live.firma.com` is a
 * company host, not the provider.
 */
const FREE_MAIL_BRANDS = new Set<string>([
  "gmail", "googlemail", "yandex", "yahoo", "ymail", "hotmail", "outlook", "live", "msn", "gmx", "icloud", "aol",
  "protonmail", "zoho", "zohomail",
]);

/** Second-level labels of two-part public suffixes (`com.tr`, `co.uk`, `net.au`). */
const SUFFIX_SECOND_LEVEL = new Set(["com", "co", "net", "org"]);

/** Second-level labels skipped when reading a domain's own name (`firma.gen.tr` -> `firma`). */
const NAME_SUFFIX_SECOND_LEVEL = new Set([...SUFFIX_SECOND_LEVEL, "gov", "edu", "gen", "biz", "info", "ac", "or", "ne"]);

/** A name must be at least this long to prove anything by being CONTAINED in another. */
const MIN_NAME_EVIDENCE = 4;

/** Domain part of an address, lower case; null when the text is not an address. */
export function emailDomain(email: string | null | undefined): string | null {
  const at = (email ?? "").lastIndexOf("@");
  if (at < 1) return null;
  const domain = (email as string).slice(at + 1).trim().toLowerCase();
  return domain.includes(".") ? domain : null;
}

/** Exactly this domain: a listed provider, or `<brand>.<public suffix>`. */
function isProviderDomain(labels: readonly string[]): boolean {
  if (FREE_MAIL_DOMAINS.has(labels.join("."))) return true;
  if (!FREE_MAIL_BRANDS.has(labels[0]!)) return false;
  if (labels.length === 2) return /^[a-z]{2,}$/.test(labels[1]!);
  return labels.length === 3 && SUFFIX_SECOND_LEVEL.has(labels[1]!) && /^[a-z]{2}$/.test(labels[2]!);
}

/**
 * Is this the domain of a free-mail / ISP mailbox provider (not owned by the
 * company that uses it)? The domain itself or any PARENT of it: `vip.163.com`
 * is a mailbox of 163.com. A company host that merely starts with a provider's
 * name (`live.firma.com`, `mail.firma.ru`) is not.
 */
export function isFreeMailDomain(domain: string | null | undefined): boolean {
  const d = (domain ?? "").trim().toLowerCase();
  if (!d) return false;
  const labels = d.split(".");
  for (let i = 0; i + 2 <= labels.length; i++) {
    if (isProviderDomain(labels.slice(i))) return true;
  }
  return false;
}

/**
 * The domain that identifies the COMPANY behind an address: the mailbox domain,
 * or null for a free-mail provider (and for text that is not an address).
 */
export function companyMailDomain(email: string | null | undefined): string | null {
  const domain = emailDomain(email);
  return domain && !isFreeMailDomain(domain) ? domain : null;
}

/** The domain's own name without its public suffix: `mail.firma.com.tr` -> `firma`. */
export function domainOwnName(domain: string | null | undefined): string | null {
  const labels = (domain ?? "").trim().toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return null;
  let tld = labels.length - 1;
  if (labels.length >= 3 && labels[tld]!.length === 2 && NAME_SUFFIX_SECOND_LEVEL.has(labels[tld - 1]!)) tld -= 1;
  return labels[tld - 1] ?? null;
}

const compact = (text: string): string => text.replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * DOES THE COMPANY OWN ITS MAILBOX DOMAIN (round 5 review, R5-02)?
 *
 * A candidate with its own site and a mailbox on ANOTHER domain is the usual
 * shape of a shared mailbox (`sales@<provider>` next to `www.firma.cn`): that
 * domain says nothing about the company and must not be compared. It still is
 * the company's own when
 *  - it is the site's domain (sub-domains count in both directions),
 *  - it carries the site's name (`silkarendas.com` next to `endas.com`,
 *    `firma.com` next to `firma.com.tr`), or
 *  - it is named after the company (`silkarendas.com` for "Silkar Endas").
 * `foldedName`: the company name, already folded to plain lower-case letters
 * by the caller (this file knows nothing about search folding).
 */
export function ownsMailDomain(mailDomain: string, siteHost: string, foldedName?: string | null): boolean {
  const domain = mailDomain.trim().toLowerCase();
  const host = siteHost.trim().toLowerCase();
  if (!domain || !host) return false;
  if (domain === host || domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`)) return true;
  const mailName = compact(domainOwnName(domain) ?? "");
  if (!mailName) return false;
  const siteName = compact(domainOwnName(host) ?? "");
  if (siteName) {
    if (siteName === mailName) return true;
    const [short, long] = siteName.length <= mailName.length ? [siteName, mailName] : [mailName, siteName];
    if (short.length >= MIN_NAME_EVIDENCE && long.includes(short)) return true;
  }
  return mailName.length >= MIN_NAME_EVIDENCE && compact(foldedName ?? "").includes(mailName);
}
