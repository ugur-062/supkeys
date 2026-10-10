import { renderEmail } from "@rothern/email";
import {
  COLD_INVITE_LIST_UNSUBSCRIBE_HEADER_ENV,
  EMAIL_STREAMS,
  NOTIFICATION_EMAIL_CLASS,
  carriesOneClickUnsubscribe,
  carriesUnsubscribeLink,
  coldInviteListUnsubscribeHeaderEnabled,
  notificationEmailClass,
  privacyNoticeFor,
  resolveStreamSenders,
  streamForContext,
  unclassifiedPrefKeyedTypes,
  unsubscribeScopeFor,
} from "../../src/modules/email/email-streams";
import {
  NOTIFICATION_PREF_KEYS,
  PREF_KEYED_NOTIFICATION_TYPES,
  PREF_KEY_PARENT,
  gatingPrefKeysForType,
  isNotificationEnabled,
  prefKeyForType,
} from "../../src/common/notifications/notification-prefs";
import {
  isUnsubscribeScope,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../../src/modules/email/unsubscribe-token";
import { maskEmail } from "../../src/modules/email/email-unsubscribe.service";
import {
  OPTIONAL_STREAM_SENDER_ENVS,
  assertProdStreamSenders,
  checkProdSenderDomain,
} from "../../src/common/config/email-sender";

/**
 * E-POSTA AKIŞLARI + TEK TIK ÇIKIŞ JETONU sözleşmesi (2026-09-27).
 * Akış bağlam tipinden türer; işlem e-postası (kod/şifre/sipariş) ASLA çıkış
 * bağlantısı taşımaz, kullanıcının kapatabildiği her tür taşır.
 */
describe("email-streams", () => {
  it("işlem e-postaları TRANSACTIONAL ve çıkış kapsamı YOK", () => {
    for (const t of ["email_verify", "password_reset", "login_2fa", "order_status_changed", "bid_awarded", undefined]) {
      expect(streamForContext(t)).toBe("TRANSACTIONAL");
      expect(unsubscribeScopeFor(t)).toBeNull();
    }
  });

  it("kullanıcının kapatabildiği tür NOTIFICATION, kapsam = tercih anahtarı", () => {
    expect(streamForContext("listing_category_match")).toBe("NOTIFICATION");
    expect(unsubscribeScopeFor("listing_category_match")).toBe("categoryMatch");
    expect(unsubscribeScopeFor("listing_invitation")).toBe("invitation");
    expect(unsubscribeScopeFor("admin_announcement")).toBe("announcement");
  });

  it("kayıtsız adrese davet INVITE akışında, kapsam 'invite'", () => {
    expect(streamForContext("tender_external_invite")).toBe("INVITE");
    expect(streamForContext("referral_invite")).toBe("INVITE");
    expect(unsubscribeScopeFor("tender_external_invite")).toBe("invite");
  });

  it("lifecycle_* LIFECYCLE akışında", () => {
    expect(streamForContext("lifecycle_welcome")).toBe("LIFECYCLE");
    expect(unsubscribeScopeFor("lifecycle_digest")).toBe("lifecycle");
  });

  it("KVKK aydınlatma: işlem dışı her akış + üye olmayan adrese işlem e-postası (derin denetim boşluk taraması GA2)", () => {
    for (const t of ["tender_external_invite", "referral_invite", "lifecycle_welcome", "listing_category_match"]) {
      expect(privacyNoticeFor(t)).toBe(true);
    }
    // Çıkış bağlantısı yok ama ilk temas: ekip daveti, misafir bilgi talebi doğrulaması.
    expect(privacyNoticeFor("company_user_invitation")).toBe(true);
    expect(privacyNoticeFor("public_inquiry_verify")).toBe(true);
    for (const t of ["email_verify", "password_reset", "login_2fa", "order_status_changed", undefined]) {
      expect(privacyNoticeFor(t)).toBe(false);
    }
  });
});

/**
 * ACTIVITY / DISCOVERY ayrımı (sahip kararı 2026-10-05): bildirim e-postaları
 * Gmail Promosyonlar sekmesine düşüyordu. Alıcının kendi işlemine dair
 * bildirim çıkış başlığı taşımaz, işlem göndericisinden çıkar; keşif/öneri/özet
 * değişmez.
 */
describe("bildirim e-posta sınıfı (ACTIVITY / DISCOVERY)", () => {
  const ACTIVITY = [
    "listing_invitation",
    "listing_reminder",
    "bid_eliminated",
    "bid_lost",
    "listing_closed",
    "listing_closed_owner",
    "listing_closing_changed",
    "listing_evaluation",
    "listing_evaluation_reminder",
    "approval_pending",
  ];
  const DISCOVERY = [
    "listing_category_match",
    "listing_category_digest",
    "listing_ai_match_locked",
    "listing_invitation_ai",
    "listing_invitation_digest",
    "listing_reminder_ai",
    "ai_supplier_suggestions",
    "listing_zero_bid",
    "admin_announcement",
  ];

  it("tercih anahtarlı HER tip sınıflı; haritada tercih anahtarı olmayan tip yok", () => {
    expect(PREF_KEYED_NOTIFICATION_TYPES.length).toBeGreaterThan(0);
    expect(unclassifiedPrefKeyedTypes()).toEqual([]);
    for (const t of Object.keys(NOTIFICATION_EMAIL_CLASS)) expect(prefKeyForType(t)).not.toBeNull();
    // Beklenen liste haritayla birebir: yeni tip bilinçli sınıflanmalı.
    expect([...ACTIVITY, ...DISCOVERY].sort()).toEqual([...PREF_KEYED_NOTIFICATION_TYPES].sort());
  });

  it("alıcının kendi işlemi ACTIVITY akışında: çıkış başlığı yok, çıkış kapsamı (kapı için) korunur", () => {
    for (const t of ACTIVITY) {
      expect(notificationEmailClass(t)).toBe("ACTIVITY");
      expect(streamForContext(t)).toBe("ACTIVITY");
      expect(carriesOneClickUnsubscribe(streamForContext(t))).toBe(false);
      expect(carriesUnsubscribeLink(streamForContext(t))).toBe(false);
      expect(unsubscribeScopeFor(t)).toBe(prefKeyForType(t));
    }
  });

  it("keşif / öneri / özet / duyuru NOTIFICATION akışında kalır ve tek tık çıkış taşır", () => {
    for (const t of DISCOVERY) {
      expect(notificationEmailClass(t)).toBe("DISCOVERY");
      expect(streamForContext(t)).toBe("NOTIFICATION");
      expect(carriesOneClickUnsubscribe(streamForContext(t))).toBe(true);
    }
    expect(streamForContext("listing_category_match")).toBe("NOTIFICATION");
  });

  it("bilinmeyen tip DISCOVERY'ye düşer (güvenli taraf); prototip adları tercih sayılmaz", () => {
    expect(notificationEmailClass("yeni_bilinmeyen_tip")).toBe("DISCOVERY");
    expect(notificationEmailClass("constructor")).toBe("DISCOVERY");
    expect(prefKeyForType("constructor")).toBeNull();
    expect(streamForContext("constructor")).toBe("TRANSACTIONAL");
  });

  /**
   * İKİ AYRI SORU (2026-10-10, sahip: "davetler reklama düşmemeli"): alt bilgi
   * çıkış bağlantısı ≠ `List-Unsubscribe` başlıkları. Kayıtsız adrese giden
   * davet (INVITE, düz mektup) bağlantıyı ve `invite` kapsamını korur ama
   * toplu posta başlıklarını varsayılan olarak TAŞIMAZ.
   */
  it("akış başına alt bilgi çıkış bağlantısı kuralı (INVITE dahil)", () => {
    expect(carriesUnsubscribeLink("TRANSACTIONAL")).toBe(false);
    expect(carriesUnsubscribeLink("ACTIVITY")).toBe(false);
    expect(carriesUnsubscribeLink("NOTIFICATION")).toBe(true);
    expect(carriesUnsubscribeLink("INVITE")).toBe(true);
    expect(carriesUnsubscribeLink("LIFECYCLE")).toBe(true);
  });

  it("akış başına çıkış başlığı kuralı: INVITE varsayılan olarak başlıksız", () => {
    expect(carriesOneClickUnsubscribe("TRANSACTIONAL")).toBe(false);
    expect(carriesOneClickUnsubscribe("ACTIVITY")).toBe(false);
    expect(carriesOneClickUnsubscribe("NOTIFICATION")).toBe(true);
    expect(carriesOneClickUnsubscribe("INVITE")).toBe(false);
    expect(carriesOneClickUnsubscribe("INVITE", { coldInviteListHeader: false })).toBe(false);
    expect(carriesOneClickUnsubscribe("LIFECYCLE")).toBe(true);
  });

  it("operatör anahtarı YALNIZ INVITE'ı değiştirir; başlık taşıyan her akış bağlantı da taşır", () => {
    const on = { coldInviteListHeader: true };
    expect(carriesOneClickUnsubscribe("INVITE", on)).toBe(true);
    for (const stream of EMAIL_STREAMS) {
      if (stream !== "INVITE") {
        expect(carriesOneClickUnsubscribe(stream, on)).toBe(carriesOneClickUnsubscribe(stream));
      }
      // Bağlantısız akışta başlık olamaz (anahtar açıkken de).
      if (carriesOneClickUnsubscribe(stream, on)) expect(carriesUnsubscribeLink(stream)).toBe(true);
    }
    // ACTIVITY / işlem anahtarla da başlıksız.
    expect(carriesOneClickUnsubscribe("ACTIVITY", on)).toBe(false);
    expect(carriesOneClickUnsubscribe("TRANSACTIONAL", on)).toBe(false);
  });

  it("COLD_INVITE_LIST_UNSUBSCRIBE_HEADER: yalnız tam olarak 'true' açar", () => {
    expect(COLD_INVITE_LIST_UNSUBSCRIBE_HEADER_ENV).toBe("COLD_INVITE_LIST_UNSUBSCRIBE_HEADER");
    expect(coldInviteListUnsubscribeHeaderEnabled("true")).toBe(true);
    for (const raw of [undefined, null, "", "false", "TRUE", "True", " true", "true ", "1", "yes", "on", true, 1]) {
      expect(coldInviteListUnsubscribeHeaderEnabled(raw)).toBe(false);
    }
  });

  it("INVITE bağlam tipleri: kapsam 'invite' ve aydınlatma satırı başlık kararından etkilenmez", () => {
    for (const t of ["tender_external_invite", "referral_invite"]) {
      expect(streamForContext(t)).toBe("INVITE");
      expect(unsubscribeScopeFor(t)).toBe("invite");
      expect(carriesUnsubscribeLink(streamForContext(t))).toBe(true);
      expect(carriesOneClickUnsubscribe(streamForContext(t))).toBe(false);
      expect(privacyNoticeFor(t)).toBe(true);
    }
    expect(carriesOneClickUnsubscribe(streamForContext("lifecycle_welcome"))).toBe(true);
  });

  it("kullanıcı tercihi ACTIVITY tipinde de aynen uygulanır (kapalıysa gönderilmez)", () => {
    expect(isNotificationEnabled({ bidElimination: false }, "bid_eliminated")).toBe(false);
    expect(isNotificationEnabled({ listingClosed: false }, "listing_closed")).toBe(false);
    expect(isNotificationEnabled({ approvalPending: false }, "approval_pending")).toBe(false);
    expect(isNotificationEnabled({ invitation: false }, "listing_invitation")).toBe(false);
    expect(isNotificationEnabled({}, "bid_eliminated")).toBe(true);
    expect(isNotificationEnabled(null, "listing_reminder")).toBe(true);
  });

  it("tercih anahtarı ACTIVITY ve DISCOVERY tipleri arasında PAYLAŞILMAZ (keşifte tek tık çıkış kendi işlem e-postasını kapatmaz)", () => {
    const classesOf = new Map<string, Set<string>>();
    for (const t of PREF_KEYED_NOTIFICATION_TYPES) {
      const k = prefKeyForType(t)!;
      if (!classesOf.has(k)) classesOf.set(k, new Set());
      classesOf.get(k)!.add(notificationEmailClass(t));
    }
    const mixed = [...classesOf].filter(([, classes]) => classes.size > 1).map(([key]) => key);
    expect(mixed).toEqual([]);
    // Alt tercih anahtarları ve üstleri katalogda.
    for (const [child, parent] of Object.entries(PREF_KEY_PARENT)) {
      expect(NOTIFICATION_PREF_KEYS).toContain(child);
      expect(NOTIFICATION_PREF_KEYS).toContain(parent);
    }
    expect(unsubscribeScopeFor("listing_invitation_ai")).toBe("aiInvitation");
    expect(unsubscribeScopeFor("listing_invitation_digest")).toBe("aiInvitation");
    expect(unsubscribeScopeFor("listing_reminder_ai")).toBe("aiInvitation");
    expect(unsubscribeScopeFor("listing_zero_bid")).toBe("growthNudges");
  });

  it("keşif alt tercihinden çıkmak işlem e-postasını kapatmaz; üst tercih ana şalterdir", () => {
    // AI davetinden çıkan kullanıcıya alıcının adıyla davet ve hatırlatma gider.
    expect(isNotificationEnabled({ aiInvitation: false }, "listing_invitation_ai")).toBe(false);
    expect(isNotificationEnabled({ aiInvitation: false }, "listing_invitation")).toBe(true);
    expect(isNotificationEnabled({ growthNudges: false }, "listing_zero_bid")).toBe(false);
    expect(isNotificationEnabled({ growthNudges: false }, "listing_reminder")).toBe(true);
    expect(isNotificationEnabled({ growthNudges: false }, "listing_evaluation_reminder")).toBe(true);
    // Eskiden paylaşılan anahtarı kapatmış kullanıcı keşif e-postası almaya başlamaz.
    expect(isNotificationEnabled({ invitation: false }, "listing_invitation_ai")).toBe(false);
    expect(isNotificationEnabled({ invitation: false }, "listing_invitation_digest")).toBe(false);
    expect(isNotificationEnabled({ reminder: false }, "listing_zero_bid")).toBe(false);
    // AI davetlisine hatırlatma: davet ve hatırlatma şalterlerinin ikisi de kapatır.
    expect(isNotificationEnabled({ reminder: false }, "listing_reminder_ai")).toBe(false);
    expect(isNotificationEnabled({ invitation: false }, "listing_reminder_ai")).toBe(false);
    expect(gatingPrefKeysForType("listing_reminder_ai").sort()).toEqual(["aiInvitation", "invitation", "reminder"]);
    expect(gatingPrefKeysForType("listing_invitation")).toEqual(["invitation"]);
    expect(gatingPrefKeysForType("bid_awarded")).toEqual([]);
  });

  it("ACTIVITY KVKK aydınlatma satırını korur (işlem dışı akış)", () => {
    expect(privacyNoticeFor("bid_eliminated")).toBe(true);
  });
});

describe("akış göndericisi seçimi", () => {
  const FROM = "no-reply@rothern.com";

  it("akış değişkeni yoksa (ya da boşsa) her akış EMAIL_FROM_ADDRESS'ten çıkar", () => {
    const s = resolveStreamSenders((k) => (k === "EMAIL_FROM_ADDRESS_ACTIVITY" ? "   " : undefined), FROM, "Rothern");
    for (const stream of ["TRANSACTIONAL", "ACTIVITY", "NOTIFICATION", "INVITE", "LIFECYCLE"] as const) {
      expect(s[stream]).toEqual({ email: FROM, name: "Rothern" });
    }
  });

  it("EMAIL_FROM_ADDRESS_ACTIVITY doluysa ACTIVITY ondan, keşif bildirimi kendi göndericisinden çıkar", () => {
    const env: Record<string, string> = {
      EMAIL_FROM_ADDRESS_ACTIVITY: " hesap@rothern.com ",
      EMAIL_FROM_ADDRESS_NOTIFICATION: "bildirim@rothern.com",
      EMAIL_FROM_ADDRESS_INVITE: "davet@rothern.com",
      EMAIL_FROM_ADDRESS_LIFECYCLE: "haber@rothern.com",
    };
    const s = resolveStreamSenders((k) => env[k], FROM);
    expect(s.TRANSACTIONAL.email).toBe(FROM);
    expect(s.ACTIVITY.email).toBe("hesap@rothern.com");
    expect(s.NOTIFICATION.email).toBe("bildirim@rothern.com");
    expect(s.INVITE.email).toBe("davet@rothern.com");
    expect(s.LIFECYCLE.email).toBe("haber@rothern.com");
  });

  it("canlı açılış kapısı EMAIL_FROM_ADDRESS_ACTIVITY'yi de denetler", () => {
    expect(OPTIONAL_STREAM_SENDER_ENVS).toContain("EMAIL_FROM_ADDRESS_ACTIVITY");
    const cfg = (v: string) =>
      ({
        get: (k: string) =>
          ({ NODE_ENV: "production", WEB_URL: "https://www.rothern.com", EMAIL_FROM_ADDRESS_ACTIVITY: v })[k],
      }) as never;
    expect(() => assertProdStreamSenders(cfg("hesap@rothern.com"))).not.toThrow();
    expect(() => assertProdStreamSenders(cfg("hesap@resend.dev"))).toThrow(/EMAIL_FROM_ADDRESS_ACTIVITY/);
  });
});

describe("alt bilgi: ACTIVITY yalnız bildirim ayarları bağlantısı", () => {
  const spec = {
    template: "notification",
    data: { subject: "S", heading: "Teklifiniz elendi", paragraphs: ["Merhaba,"] },
  } as const;
  const env = { siteUrl: "https://www.rothern.com", now: new Date("2026-10-05T09:00:00Z") };
  const prefs = "https://www.rothern.com/company/ayarlar/bildirimler";

  it.each([
    ["tr", "Bildirim ayarlarınızı", "Bildirim ayarları:"],
    ["en", "notification settings", "Notification settings:"],
    ["ru", "Настройки уведомлений", "Настройки уведомлений:"],
  ] as const)("%s: tercih bağlantısı var, çıkış satırı yok (HTML + düz metin)", async (locale, html, text) => {
    const out = await renderEmail(spec, locale, { ...env, preferencesUrl: prefs, privacyNotice: true });
    expect(out.html).toContain(html);
    expect(out.html).toContain(`href="${prefs}"`);
    expect(out.html).not.toMatch(/abonelikten çıkın|Unsubscribe|Отпишитесь/);
    expect(out.text).toContain(`${text} ${prefs}`);
    expect(out.text).not.toMatch(/Abonelikten çıkmak|Unsubscribe:|Отписаться:/);
  });

  it("DISCOVERY: çıkış + tercih satırı (eski varyant), sessiz varyant basılmaz", async () => {
    const out = await renderEmail(spec, "tr", {
      ...env,
      unsubscribeUrl: "https://www.rothern.com/e-posta-tercihleri?t=x",
      preferencesUrl: prefs,
    });
    expect(out.html).toContain("abonelikten çıkın");
    expect(out.html).not.toContain("hesabınızdaki bir işlem");
    expect(out.text).toContain("Abonelikten çıkmak için:");
    expect(out.text).not.toContain("Bildirim ayarları:");
  });

  it("işlem e-postası: ne çıkış ne tercih bağlantısı", async () => {
    const out = await renderEmail(spec, "tr", env);
    expect(out.html).not.toContain(prefs);
    expect(out.text).not.toContain(prefs);
  });
});

describe("unsubscribe-token", () => {
  const SECRET = "test-secret-please-change";

  it("gidiş-dönüş: adres küçük harfe iner, kapsam ve dil korunur", () => {
    const t = signUnsubscribeToken({ email: "Ayse@Firma.com", scope: "categoryMatch", locale: "en" }, SECRET);
    expect(verifyUnsubscribeToken(t, SECRET)).toEqual({
      email: "ayse@firma.com",
      scope: "categoryMatch",
      locale: "en",
    });
  });

  it("jeton adresi AÇIK taşımaz (şifreli) ve URL güvenli", () => {
    const t = signUnsubscribeToken({ email: "gizli@firma.com", scope: "invite", locale: "tr" }, SECRET);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(t, "base64url").toString("latin1")).not.toContain("gizli");
  });

  it("başka anahtar, bozulmuş jeton ve çöp girdi → null", () => {
    const t = signUnsubscribeToken({ email: "a@b.com", scope: "all", locale: "ru" }, SECRET);
    expect(verifyUnsubscribeToken(t, "baska-anahtar")).toBeNull();
    const flipped = `${t.slice(0, 20)}${t[20] === "A" ? "B" : "A"}${t.slice(21)}`;
    expect(verifyUnsubscribeToken(flipped, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("abc.def", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(undefined, SECRET)).toBeNull();
  });

  it("kapsam beyaz listesi", () => {
    expect(isUnsubscribeScope("categoryMatch")).toBe(true);
    expect(isUnsubscribeScope("aiInvitation")).toBe(true);
    expect(isUnsubscribeScope("growthNudges")).toBe(true);
    expect(isUnsubscribeScope("invite")).toBe(true);
    expect(isUnsubscribeScope("all")).toBe(true);
    expect(isUnsubscribeScope("password_reset")).toBe(false);
    expect(isUnsubscribeScope("")).toBe(false);
  });

  it("maskEmail adresi ifşa etmez", () => {
    expect(maskEmail("ayse.kaya@firma.com")).toBe("ay•••@firma.com");
    expect(maskEmail("a@b.com")).toBe("a•••@b.com");
  });
});

describe("akış göndericisi alan adı kuralı", () => {
  it("alt alan adı kabul, başka alan adı red (canlıda)", () => {
    const base = { nodeEnv: "production", webUrl: "https://www.rothern.com" };
    expect(checkProdSenderDomain({ ...base, fromAddress: "davet@invite.rothern.com" })).toBeNull();
    expect(checkProdSenderDomain({ ...base, fromAddress: "davet@resend.dev" })).toBe("not_canonical");
  });
});
