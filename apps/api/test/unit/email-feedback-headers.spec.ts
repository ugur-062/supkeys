jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));
jest.mock("@rothern/email", () => ({
  ...jest.requireActual("@rothern/email"),
  renderEmail: jest.fn().mockResolvedValue({ subject: "S", html: "<p>p</p>", text: "p" }),
}));

import { EmailService } from "../../src/modules/email/email.service";
import {
  FEEDBACK_FALLBACK_TYPE,
  FEEDBACK_FIELD_MAX_LENGTH,
  FEEDBACK_ID_HEADER,
  FEEDBACK_SENDER_ID,
  MAILRU_MSGTYPE_HEADER,
  feedbackEnvironment,
  feedbackHeaders,
  sanitizeFeedbackToken,
} from "../../src/modules/email/email-feedback-headers";
import {
  EMAIL_STREAMS,
  INVITE_CONTEXT_TYPES,
  NOTIFICATION_EMAIL_CLASS,
  PRIVACY_NOTICE_TRANSACTIONAL_CONTEXT_TYPES,
  streamForContext,
} from "../../src/modules/email/email-streams";
import { CRITICAL_EMAIL_CONTEXTS } from "../../src/modules/email/critical-contexts";

/**
 * ŞİKÂYET GERİ BİLDİRİM BAŞLIKLARI sözleşmesi (canlı öncesi sağlamlaştırma):
 *  - her e-posta `Feedback-ID: <tip>:<akış>:<ortam>:rothern` (Gmail FBL / Yandex)
 *    ve `X-Mailru-Msgtype: <tip>` (Mail.ru) taşır
 *  - değerler yalnız [A-Za-z0-9_-], sınırlı uzunluk, KİŞİSEL VERİ YOK
 *  - çıkış başlığı kuralı değişmez (ACTIVITY / işlem: `List-Unsubscribe` YOK)
 */
const TOKEN = /^[A-Za-z0-9_-]+$/;
const FEEDBACK_ID = /^[A-Za-z0-9_-]+:[A-Z]+:(prod|staging|dev):rothern$/;

describe("email-feedback-headers (saf)", () => {
  it("SenderId Gmail FBL kuralına uyar (5–15 karakter, sabit)", () => {
    expect(FEEDBACK_SENDER_ID).toBe("rothern");
    expect(FEEDBACK_SENDER_ID.length).toBeGreaterThanOrEqual(5);
    expect(FEEDBACK_SENDER_ID.length).toBeLessThanOrEqual(15);
    expect(FEEDBACK_SENDER_ID).toMatch(TOKEN);
  });

  it("her akış için biçim a:b:c:SenderId ve Mail.ru türü aynı belirteç", () => {
    for (const stream of EMAIL_STREAMS) {
      const h = feedbackHeaders({ contextType: "listing_invitation", stream, environment: "prod" });
      expect(h[FEEDBACK_ID_HEADER]).toBe(`listing_invitation:${stream}:prod:rothern`);
      expect(h[FEEDBACK_ID_HEADER]).toMatch(FEEDBACK_ID);
      expect(h[FEEDBACK_ID_HEADER].split(":")).toHaveLength(4);
      expect(h[MAILRU_MSGTYPE_HEADER]).toBe("listing_invitation");
      expect(Object.keys(h).sort()).toEqual([FEEDBACK_ID_HEADER, MAILRU_MSGTYPE_HEADER].sort());
    }
  });

  it("bilinen BÜTÜN bağlam tipleri temizlemeden aynen geçer (kısalmaz, değişmez)", () => {
    const known = [
      ...Object.keys(NOTIFICATION_EMAIL_CLASS),
      ...INVITE_CONTEXT_TYPES,
      ...PRIVACY_NOTICE_TRANSACTIONAL_CONTEXT_TYPES,
      ...CRITICAL_EMAIL_CONTEXTS,
      "lifecycle_welcome",
      "lifecycle_weekly",
      "tender_invite_digest",
      "listing_category_digest",
      "order_status_changed",
    ];
    expect(known.length).toBeGreaterThan(20);
    for (const type of known) {
      expect(sanitizeFeedbackToken(type)).toBe(type);
      const h = feedbackHeaders({ contextType: type, stream: streamForContext(type), environment: "prod" });
      expect(h[FEEDBACK_ID_HEADER]).toMatch(FEEDBACK_ID);
      // Tek satır, kısa başlık (katlama gerektirmez).
      expect(h[FEEDBACK_ID_HEADER].length).toBeLessThanOrEqual(76);
    }
  });

  it("bağlam yoksa şablon adı, o da yoksa 'other'", () => {
    expect(feedbackHeaders({ template: "verify-email", stream: "TRANSACTIONAL", environment: "dev" })).toEqual({
      [FEEDBACK_ID_HEADER]: "verify-email:TRANSACTIONAL:dev:rothern",
      [MAILRU_MSGTYPE_HEADER]: "verify-email",
    });
    expect(feedbackHeaders({ stream: "TRANSACTIONAL", environment: "dev" })[MAILRU_MSGTYPE_HEADER]).toBe(
      FEEDBACK_FALLBACK_TYPE,
    );
    expect(
      feedbackHeaders({ contextType: "", template: "notification", stream: "TRANSACTIONAL", environment: "dev" })[
        MAILRU_MSGTYPE_HEADER
      ],
    ).toBe("notification");
  });

  it("temizleme: yalnız [A-Za-z0-9_-]; ':' / CRLF / boşluk / Türkçe harf başlığa giremez", () => {
    const cases: Array<[string, string]> = [
      ["a:b:c:evil", "a_b_c_evil"],
      ["x\r\nBcc: kurban@firma.com", FEEDBACK_FALLBACK_TYPE], // '@' → kişisel veri şüphesi
      ["x\r\nX-Injected: 1", "x_X-Injected_1"],
      ["teklif elendi", "teklif_elendi"],
      ["şifre_sıfırla", "ifre_s_f_rla"],
      ["__bid.lost__", "bid_lost"],
      ["---", FEEDBACK_FALLBACK_TYPE],
      ["", FEEDBACK_FALLBACK_TYPE],
      ["   ", FEEDBACK_FALLBACK_TYPE],
    ];
    for (const [raw, expected] of cases) {
      const out = sanitizeFeedbackToken(raw);
      expect(out).toBe(expected);
      expect(out).toMatch(TOKEN);
    }
    expect(sanitizeFeedbackToken(undefined)).toBe(FEEDBACK_FALLBACK_TYPE);
    expect(sanitizeFeedbackToken(null)).toBe(FEEDBACK_FALLBACK_TYPE);
    expect(sanitizeFeedbackToken(42 as never)).toBe(FEEDBACK_FALLBACK_TYPE);
  });

  it("temizleme: uzunluk sınırı ve kırpma sonrası kenar ayırıcısı yok", () => {
    const long = sanitizeFeedbackToken("a".repeat(200));
    expect(long).toHaveLength(FEEDBACK_FIELD_MAX_LENGTH);
    const cut = sanitizeFeedbackToken(`${"a".repeat(FEEDBACK_FIELD_MAX_LENGTH - 1)}__tail`);
    expect(cut).toBe("a".repeat(FEEDBACK_FIELD_MAX_LENGTH - 1));
    const h = feedbackHeaders({ contextType: "z".repeat(500), stream: "NOTIFICATION", environment: "staging" });
    expect(h[FEEDBACK_ID_HEADER].length).toBeLessThanOrEqual(FEEDBACK_FIELD_MAX_LENGTH + ":NOTIFICATION:staging:rothern".length);
    expect(h[FEEDBACK_ID_HEADER]).toMatch(FEEDBACK_ID);
  });

  it("e-posta adresine benzeyen tip başlığa YAZILMAZ (kişisel veri)", () => {
    const h = feedbackHeaders({ contextType: "ali.veli@firma.com", stream: "INVITE", environment: "prod" });
    expect(h[FEEDBACK_ID_HEADER]).toBe("other:INVITE:prod:rothern");
    expect(h[MAILRU_MSGTYPE_HEADER]).toBe("other");
    expect(JSON.stringify(h)).not.toMatch(/ali|veli|firma/);
  });

  it("ortam: APP_ENV > SENTRY_ENVIRONMENT > NODE_ENV; tanınmayan / boş → dev", () => {
    const env = (vars: Record<string, string | undefined>) => feedbackEnvironment((k) => vars[k]);
    expect(env({})).toBe("dev");
    expect(env({ NODE_ENV: "production" })).toBe("prod");
    expect(env({ NODE_ENV: "development" })).toBe("dev");
    expect(env({ NODE_ENV: "test" })).toBe("dev");
    // Staging de NODE_ENV=production ile koşar → açık ortam adı kazanır.
    expect(env({ NODE_ENV: "production", SENTRY_ENVIRONMENT: "staging" })).toBe("staging");
    expect(env({ NODE_ENV: "production", SENTRY_ENVIRONMENT: "production" })).toBe("prod");
    expect(env({ NODE_ENV: "production", SENTRY_ENVIRONMENT: "production", APP_ENV: "staging" })).toBe("staging");
    expect(env({ APP_ENV: " PROD " })).toBe("prod");
    expect(env({ APP_ENV: "  ", NODE_ENV: "production" })).toBe("prod");
    expect(env({ APP_ENV: "qa-7; rm -rf" })).toBe("dev");
  });
});

describe("EmailService — geri bildirim başlıkları gönderimde", () => {
  const SECRET = "unit-secret";

  function makeService(vars: Record<string, string | undefined> = {}) {
    const prisma = {
      emailLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "log1" }),
        update: jest.fn().mockResolvedValue({}),
      },
      emailOptOut: { findFirst: jest.fn().mockResolvedValue(null) },
      referralOptOut: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const all: Record<string, string | undefined> = {
      JWT_SECRET: SECRET,
      WEB_URL: "https://www.rothern.com",
      ...vars,
    };
    const config = { get: jest.fn((k: string) => all[k]), getOrThrow: jest.fn() };
    const send = jest.fn().mockResolvedValue({ providerMessageId: "pm1" });
    const svc = new EmailService(config as never, prisma as never);
    (svc as unknown as { client: unknown }).client = { send };
    (svc as unknown as { providerName: string }).providerName = "resend";
    return { svc, send };
  }

  const mail = (to: string, type: string | undefined, id = "ctx_cuid_12345") =>
    ({
      to: { email: to, name: "Demir Çelik" },
      subject: "S",
      templateData: {
        template: "notification" as const,
        data: { subject: "S", heading: "H", paragraphs: ["p"] },
      },
      ...(type ? { context: { type, id } } : {}),
    }) as never;

  const headersOf = (send: jest.Mock) => send.mock.calls[0][0].headers as Record<string, string>;

  const PER_STREAM: Array<[string, string, boolean]> = [
    ["email_verify", "TRANSACTIONAL", false],
    ["bid_eliminated", "ACTIVITY", false],
    ["listing_invitation", "ACTIVITY", false],
    ["listing_category_match", "NOTIFICATION", true],
    ["tender_external_invite", "INVITE", true],
    ["lifecycle_welcome", "LIFECYCLE", true],
  ];

  it.each(PER_STREAM)("%s → %s: iki başlık da var, çıkış başlığı kuralı aynı", async (type, stream, oneClick) => {
    const { svc, send } = makeService({ NODE_ENV: "production" });
    const res = await svc.send(mail("tedarik@firma.com", type));
    expect(res.sent).toBe(true);
    const h = headersOf(send);
    expect(h[FEEDBACK_ID_HEADER]).toBe(`${type}:${stream}:prod:rothern`);
    expect(h[MAILRU_MSGTYPE_HEADER]).toBe(type);
    const unsubKeys = Object.keys(h).filter((k) => k.toLowerCase().startsWith("list-unsubscribe"));
    if (oneClick) {
      expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
      expect(h["List-Unsubscribe"]).toMatch(/^<https:\/\/www\.rothern\.com\/api\/email\/unsubscribe\?t=[A-Za-z0-9_-]+>$/);
      expect(Object.keys(h).sort()).toEqual(
        [FEEDBACK_ID_HEADER, MAILRU_MSGTYPE_HEADER, "List-Unsubscribe", "List-Unsubscribe-Post"].sort(),
      );
    } else {
      // ACTIVITY ve işlem akışı: `List-Unsubscribe` YOK (Gmail Promosyonlar kararı).
      expect(unsubKeys).toEqual([]);
      expect(Object.keys(h).sort()).toEqual([FEEDBACK_ID_HEADER, MAILRU_MSGTYPE_HEADER].sort());
    }
  });

  it("bağlamsız gönderim: tür şablon adından, akış TRANSACTIONAL", async () => {
    const { svc, send } = makeService();
    await svc.send(mail("u@firma.com", undefined));
    expect(headersOf(send)).toEqual({
      [FEEDBACK_ID_HEADER]: "notification:TRANSACTIONAL:dev:rothern",
      [MAILRU_MSGTYPE_HEADER]: "notification",
    });
  });

  it("staging ortamı başlığa 'staging' yazar (NODE_ENV=production olsa da)", async () => {
    const { svc, send } = makeService({ NODE_ENV: "production", SENTRY_ENVIRONMENT: "staging" });
    await svc.send(mail("u@firma.com", "email_verify"));
    expect(headersOf(send)[FEEDBACK_ID_HEADER]).toBe("email_verify:TRANSACTIONAL:staging:rothern");
  });

  it("KİŞİSEL VERİ YOK: alıcı adresi, adı ve bağlam kimliği geri bildirim başlıklarına girmez", async () => {
    const { svc, send } = makeService({ NODE_ENV: "production" });
    await svc.send(mail("ozel.kisi@gizlifirma.com", "listing_category_match", "cmf9secretcontextid"));
    const h = headersOf(send);
    const feedback = `${h[FEEDBACK_ID_HEADER]}|${h[MAILRU_MSGTYPE_HEADER]}`;
    for (const leak of ["ozel", "kisi", "gizlifirma", "@", "Demir", "cmf9secretcontextid"]) {
      expect(feedback).not.toContain(leak);
    }
    expect(h[MAILRU_MSGTYPE_HEADER]).toMatch(TOKEN);
    expect(h[FEEDBACK_ID_HEADER]).toMatch(FEEDBACK_ID);
  });

  it("bozuk bağlam tipi başlık enjekte edemez", async () => {
    const { svc, send } = makeService();
    await svc.send(mail("u@firma.com", "x\r\nBcc: baska:deger"));
    const h = headersOf(send);
    expect(Object.keys(h).sort()).toEqual([FEEDBACK_ID_HEADER, MAILRU_MSGTYPE_HEADER].sort());
    expect(h[MAILRU_MSGTYPE_HEADER]).toBe("x_Bcc_baska_deger");
    expect(h[FEEDBACK_ID_HEADER]).toBe("x_Bcc_baska_deger:TRANSACTIONAL:dev:rothern");
    expect(h[FEEDBACK_ID_HEADER]).not.toMatch(/[\r\n ]/);
  });
});
