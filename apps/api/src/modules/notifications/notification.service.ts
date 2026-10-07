import { localizeAppPath } from "../../common/company/app-routes";
import { Injectable, Optional, Logger } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import {
  DEFAULT_LOCALE,
  isLocale,
  translateRoutePath,
  type Locale,
} from "@rothern/i18n";
import { RealtimeService } from "../realtime/realtime.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isNotificationEnabled } from "../../common/notifications/notification-prefs";
import { tApi, type ApiMessageKey } from "../../common/i18n/i18n.service";
import { currentLocale } from "../../common/i18n/locale-context";
import {
  parseStoredI18n,
  renderStoredNotification,
  storedListingTitleRefs,
  toStoredI18n,
  usableListingTitles,
} from "./notification-i18n";
import {
  formatNotificationParams,
  ListingTitleResolver,
  type NotificationParams,
} from "../../common/notifications/notification-params";
import { ContentTranslationService } from "../content-translation/content-translation.service";
import {
  hasCompanyPermission,
  type PermissionSubject,
} from "../company-auth/permissions/company-permissions.constants";

export type NotificationPortal = "satinalma" | "satis";

/**
 * In-app bildirim içeriği (e-posta ile paralel kanal).
 *
 * DİL (i18n Faz 3): bildirim satırı DB'ye METİN olarak yazılır, yani metin
 * yazma anında ve ALICININ dilinde üretilmelidir. Tek bir payload N kullanıcıya
 * fan-out edildiği için çağıranın metni ÖNCEDEN çevirmesi yanlıştır — çağıran
 * katalog ANAHTARI verir (`titleKey`/`bodyKey`/`ctaLabelKey`), metin her alıcı
 * için o kişinin `CompanyUser.locale` değeriyle `renderPayload` içinde çıkar.
 * Düz `title`/`body` alanları eski yol olarak durur (testler payload'ı elle
 * kuruyor); anahtar verilmişse düz metin YOK SAYILIR.
 *
 * OKUMA (2026-10-07): satır üretim GİRDİLERİNİ de saklar (`Notification.i18n`:
 * anahtarlar + tipli parametreler + `ctaPath`) ve `listForUser` her satırı
 * OKUYANIN güncel diliyle yeniden üretir (`notification-i18n.ts`). Yazılan
 * metin kolonları yedektir. Bu yüzden yeni çağıran ANAHTAR + `ctaPath` verir;
 * düz metinle yazılan satır dil değişince çevrilmez.
 */
export interface InAppPayload {
  type: string;
  /** Doğrudan metin (eski yol). Anahtar verilmişse YOK SAYILIR. */
  title?: string;
  body?: string;
  ctaLabel?: string | null;
  /** Katalog anahtarı — metin ALICININ diliyle üretilir (tercih edilen yol). */
  titleKey?: ApiMessageKey;
  bodyKey?: ApiMessageKey;
  ctaLabelKey?: ApiMessageKey;
  /**
   * Üç anahtarın ORTAK ICU parametre sözlüğü. Tarih/tutar/sayı ve talep
   * başlığı TİPLİ verilir (`notification-params.ts`) — biçim alıcının dilinde
   * seçilir; önceden "tr-TR" ile biçimlenmiş dize VERME.
   */
  params?: NotificationParams;
  /** Tam adres (eski yol) — `ctaPath` verilmişse YOK SAYILIR. */
  ctaUrl?: string | null;
  /**
   * Türkçe İÇ yol (ör. `/company/ilan/abc`) — alıcının diline çevrilir
   * (`/en/company/request/abc`). Mutlak adres gerekiyorsa çağıran başına
   * WEB_URL'i koyar (`${webUrl}/company/ilan/abc`); köken korunur, yalnız
   * yol çevrilir. Bugünkü `ctaUrl`ler mutlaktır, o biçim bozulmaz.
   */
  ctaPath?: string | null;
  listingId?: string | null;
  /**
   * Bildirimin ait olduğu portal. Verilirse alıcılar o portalı GÖRÜNTÜLEME
   * izni taşıyanlarla süzülür (satış bildirimi saf satın almacıya hiç
   * yazılmaz, ve tersine). Belirtilmezse ORTAK (null) — her iki portalda
   * görünür (ör. bağlantı istekleri); kimin alacağını `audience` söyler.
   */
  portal?: NotificationPortal;
  /**
   * Yetki tablosu (2026-09-05): portal-dışı bildirimin alıcı kümesi — bu
   * izinlerden HERHANGİ BİRİNİ taşıyan aktif üyeler (kurucu örtük izinleri
   * dahil). Verilmezse ve portal da yoksa firmanın TÜM aktif üyeleri alır
   * (yalnız hesap/güvenlik sınıfı bildirimler böyle olmalı — onaylayıcı-only
   * üye pazar bildirimi almasın).
   */
  audience?: readonly string[];
}

/** Portalın görüntüleme izni — fan-out + e-posta alıcı seçimi (tek kaynak). */
export function viewPermissionForPortal(portal: NotificationPortal): string {
  return portal === "satis" ? "sell:view" : "buy:view";
}

/**
 * DB'deki serbest dil dizesini (`CompanyUser.locale`) desteklenen dile indirger.
 * Tanınmayan/boş değer → varsayılan. Bildirim ve e-posta alıcı çözümleyen her
 * yol bunu kullanır ki tek bir bozuk satır metni patlatmasın.
 */
export function localeOf(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * İÇ (Türkçe, ön eksiz) yol → alıcının dilindeki DIŞ adres. Mutlak adres
 * verilirse köken ayrılır, yalnız yol çevrilir ve köken geri eklenir.
 * `common/company/app-routes.ts` içindeki `localize` ile AYNI kuralı uygular
 * (ön ek yalnız Türkçe dışında); o dosya yardımcıyı dışa aktardığında burası
 * ona bağlanmalı — iki kopya ayrışmasın.
 */
const ABSOLUTE_URL = /^(https?:\/\/[^/]+)(\/[\s\S]*)?$/i;


/** `listForUser` yanıt satırı — metin OKUYANIN dilinde; `i18n` kolonu taşınmaz. */
export interface NotificationRow {
  id: string;
  companyUserId: string;
  companyId: string;
  type: string;
  portal: string | null;
  title: string;
  body: string;
  ctaUrl: string | null;
  ctaLabel: string | null;
  listingId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** Bildirim satırına YAZILACAK metinler — tek alıcının dilinde. */
export interface RenderedNotification {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

/**
 * Payload → o alıcının dilindeki metin (SAF fonksiyon, testlenebilir).
 * Anahtar varsa katalogdan üretir (ICU parametreleri `payload.params`; tipli
 * tarih/tutar/sayı alıcının dilinde biçimlenir, talep başlığı `titles`ten),
 * yoksa düz metni aynen geçirir; `ctaPath` varsa adresi dile çevirir.
 */
export function renderPayload(
  p: InAppPayload,
  locale: Locale,
  titles?: ReadonlyMap<string, string>,
): RenderedNotification {
  const params = formatNotificationParams(p.params, locale, titles);
  const text = (
    key: ApiMessageKey | undefined,
    plain: string | null | undefined,
  ): string | null => (key ? tApi(key, params, locale) : (plain ?? null));
  return {
    title: text(p.titleKey, p.title) ?? "",
    body: text(p.bodyKey, p.body) ?? "",
    ctaLabel: text(p.ctaLabelKey, p.ctaLabel),
    ctaUrl: p.ctaPath ? localizeAppPath(p.ctaPath, locale) : (p.ctaUrl ?? null),
  };
}

/**
 * Payload → satıra yazılacak `i18n` JSON'u (yoksa `undefined`: düz metinli eski
 * yol, kolon NULL kalır). Anahtar verilmişse düz metin yok sayıldığı için
 * (`renderPayload`) girdiler de yalnız anahtarları taşır.
 */
function storedI18nJson(p: InAppPayload): Prisma.InputJsonObject | undefined {
  const stored = toStoredI18n({
    titleKey: p.titleKey,
    bodyKey: p.bodyKey,
    ctaLabelKey: p.ctaLabelKey,
    params: p.params,
    ctaPath: p.ctaPath,
  });
  return stored ? (stored as unknown as Prisma.InputJsonObject) : undefined;
}

/**
 * Bir bildirim yazımı, referans verilen alıcı satırının (companyUser) okuma ile
 * yazma arasında kaybolmasından mı düştü? In-app bildirim en-iyi-çabadır; alıcı
 * kullanıcı yarış içinde silinmişse (FK ihlali / kayıt yok) sessizce atlanır.
 * companyUserId'ler daima kendi sorgumuzdan geldiği için bu kod-hatası değil,
 * yalnız eşzamanlılık yarışıdır. (Prod'da kullanıcı soft-delete edilir → pratikte
 * olmaz; teardown/hard-delete testlerinde görülür.)
 */
function isMissingRecipientError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2003" || err.code === "P2025")
  );
}

/** Firma e-posta alıcısı — billingEmail ya da izinli ilk aktif üye. */
export interface CompanyRecipient {
  email: string;
  name: string;
  /** null = firma fatura adresi (kullanıcı tercihi uygulanmaz). */
  prefs: Record<string, boolean> | null;
  /**
   * E-posta metninin dili. Kullanıcı dalında o kişinin `locale`'i; fatura
   * adresi dalında kullanıcı çözülmediği için KURUCUNUN dili (kurucu yoksa
   * varsayılan).
   */
  locale: Locale;
}

type RecipientCandidate = {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  notificationPrefs: unknown;
  permissions: string[];
  roles: string[];
  locale: string;
};

/**
 * Firmaların e-posta alıcısını çözer (N+1 yerine sabit sayıda sorgu):
 * `billingEmail` olanlar doğrudan; olmayanlarda `preferAnyOf` izinlerinden
 * birini taşıyan en eski aktif üye, o da yoksa `fallbackAnyOf` (ör. önce
 * gönderme izni, sonra görüntüleme). İzin listesi `null` → ilk aktif üye
 * (kısıtsız). Her alıcı DİLİNİ de taşır (e-posta metni alıcının dilinde).
 */
export async function pickCompanyRecipients(
  prisma: PrismaService,
  companyIds: readonly string[],
  preferAnyOf: readonly string[] | null,
  fallbackAnyOf: readonly string[] | null = null,
): Promise<Map<string, CompanyRecipient>> {
  const ids = [...new Set(companyIds.filter(Boolean))];
  const out = new Map<string, CompanyRecipient>();
  if (ids.length === 0) return out;
  const companies = await prisma.company.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, billingEmail: true, ownerUserId: true },
  });
  const ownerOf = new Map(companies.map((c) => [c.id, c.ownerUserId]));
  const billing = companies.filter((c) => c.billingEmail);
  const needUser = companies.filter((c) => !c.billingEmail).map((c) => c.id);
  if (billing.length > 0) {
    // Fatura adresi dalında kullanıcı satırı çözülmez → dil yok. Firmanın
    // KURUCUSUNUN dilini kullanırız (tek ek sorgu; kurucu yoksa varsayılan).
    const ownerIds = [
      ...new Set(
        billing.map((c) => c.ownerUserId).filter((id): id is string => !!id),
      ),
    ];
    const owners =
      ownerIds.length > 0
        ? await prisma.companyUser.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, locale: true },
          })
        : [];
    const localeOfOwner = new Map(
      owners.map((o) => [o.id, localeOf(o.locale)] as const),
    );
    for (const c of billing) {
      out.set(c.id, {
        email: c.billingEmail!,
        name: c.name,
        prefs: null,
        locale:
          (c.ownerUserId ? localeOfOwner.get(c.ownerUserId) : undefined) ??
          DEFAULT_LOCALE,
      });
    }
  }
  if (needUser.length === 0) return out;
  const users: RecipientCandidate[] = await prisma.companyUser.findMany({
    where: { companyId: { in: needUser }, isActive: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      companyId: true,
      email: true,
      firstName: true,
      lastName: true,
      notificationPrefs: true,
      permissions: true,
      roles: true,
      locale: true,
    },
  });
  const subject = (u: RecipientCandidate): PermissionSubject => ({
    isOwner: ownerOf.get(u.companyId) === u.id,
    permissions: u.permissions,
    roles: u.roles,
  });
  const pick = (anyOf: readonly string[] | null) => {
    for (const u of users) {
      if (out.has(u.companyId)) continue;
      if (anyOf && !hasCompanyPermission(subject(u), anyOf)) continue;
      out.set(u.companyId, {
        email: u.email,
        name: `${u.firstName} ${u.lastName}`.trim(),
        prefs: u.notificationPrefs as Record<string, boolean> | null,
        locale: localeOf(u.locale),
      });
    }
  };
  pick(preferAnyOf);
  if (fallbackAnyOf) pick(fallbackAnyOf);
  return out;
}

/**
 * Okuma tarafı süzgeci: istenen portal (+ ORTAK) ∩ kişinin GÖREBİLDİĞİ
 * portallar. Rol/izin değişince eski satırlar görünmez olur (silinmez).
 */
function portalReadFilter(
  viewer: PermissionSubject | undefined,
  portal?: NotificationPortal,
): Prisma.NotificationWhereInput {
  const allowed: NotificationPortal[] = viewer
    ? (["satinalma", "satis"] as const).filter((p) =>
        hasCompanyPermission(viewer, viewPermissionForPortal(p)),
      )
    : ["satinalma", "satis"];
  const visible = portal ? allowed.filter((p) => p === portal) : allowed;
  return { OR: [{ portal: null }, { portal: { in: visible } }] };
}

/**
 * Uygulama-içi bildirim servisi — KULLANICI bazında. Bir firmaya bildirim, o
 * firmanın YALNIZCA ilgili portalı görebilen (ya da `audience` iznini taşıyan)
 * aktif kullanıcılarına fan-out edilir. Her kullanıcının `notificationPrefs`
 * tercihi ayrı kontrol edilir; transactional tipler her zaman gider. E-posta
 * gönderimi ayrı kanaldır (EmailService).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  /** Talep başlığı alıcının dilinde (`$listingTitle` parametresi). */
  private readonly titles = new ListingTitleResolver(() => this.translations);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly realtime?: RealtimeService,
    /** İçerik çevirisi (global modül) — SONDA ve isteğe bağlı; yoksa kaynak başlık. */
    @Optional() private readonly translations?: ContentTranslationService,
  ) {}

  /** Tek firmanın (izinli) aktif kullanıcılarına in-app bildirim. */
  async pushToCompany(companyId: string, payload: InAppPayload): Promise<number> {
    return this.pushToCompanies([companyId], payload);
  }

  /** Belirli bir kullanıcıya in-app bildirim (aktifse + tercihi açıksa). */
  async pushToUser(
    companyUserId: string,
    payload: InAppPayload,
  ): Promise<number> {
    const user = await this.prisma.companyUser.findUnique({
      where: { id: companyUserId },
      select: {
        id: true,
        companyId: true,
        isActive: true,
        deletedAt: true,
        notificationPrefs: true,
        locale: true,
      },
    });
    if (!user || !user.isActive || user.deletedAt) return 0;
    if (
      !isNotificationEnabled(
        user.notificationPrefs as Record<string, boolean> | null,
        payload.type,
      )
    ) {
      return 0;
    }
    // Metin ALICININ dilinde üretilir (anahtar verilmediyse düz metin geçer).
    const locale = localeOf(user.locale);
    const text = renderPayload(
      payload,
      locale,
      await this.titles.forParams(payload.params, locale),
    );
    // Üretim girdileri: okuma yolu satırı okuyanın güncel diliyle yeniden üretir.
    const i18n = storedI18nJson(payload);
    try {
      await this.prisma.notification.create({
        data: {
          companyUserId: user.id,
          companyId: user.companyId,
          type: payload.type,
          portal: payload.portal ?? null,
          title: text.title,
          body: text.body,
          ctaUrl: text.ctaUrl,
          ctaLabel: text.ctaLabel,
          ...(i18n ? { i18n } : {}),
          listingId: payload.listingId ?? null,
        },
      });
    } catch (err) {
      if (isMissingRecipientError(err)) {
        this.logger.debug(
          `In-app bildirim atlandı (alıcı kayboldu): ${payload.type}`,
        );
        return 0;
      }
      throw err;
    }
    this.realtime?.pingNotification(user.companyId);
    return 1;
  }

  /**
   * Çok firmanın aktif kullanıcılarına in-app bildirim (2 sorgu, fan-out).
   * Alıcı kümesi: `audience` verildiyse o izinlerden birini taşıyanlar; yoksa
   * `portal` verildiyse o portalı görüntüleyenler; ikisi de yoksa herkes.
   */
  async pushToCompanies(
    companyIds: string[],
    payload: InAppPayload,
  ): Promise<number> {
    const ids = [...new Set(companyIds.filter(Boolean))];
    if (ids.length === 0) return 0;
    const required: readonly string[] | null =
      payload.audience ??
      (payload.portal ? [viewPermissionForPortal(payload.portal)] : null);
    const [users, companies] = await Promise.all([
      this.prisma.companyUser.findMany({
        where: { companyId: { in: ids }, isActive: true, deletedAt: null },
        select: {
          id: true,
          companyId: true,
          notificationPrefs: true,
          permissions: true,
          roles: true,
          locale: true,
        },
      }),
      required
        ? this.prisma.company.findMany({
            where: { id: { in: ids } },
            select: { id: true, ownerUserId: true },
          })
        : Promise.resolve([] as { id: string; ownerUserId: string | null }[]),
    ]);
    const ownerOf = new Map(companies.map((c) => [c.id, c.ownerUserId]));
    const recipients = users
      .filter(
        (u) =>
          !required ||
          hasCompanyPermission(
            {
              isOwner: ownerOf.get(u.companyId) === u.id,
              permissions: u.permissions,
              roles: u.roles,
            },
            required,
          ),
      )
      .filter((u) =>
        isNotificationEnabled(
          u.notificationPrefs as Record<string, boolean> | null,
          payload.type,
        ),
      );
    // Metin ALICI BAŞINA, o kişinin diliyle. Dil başına bir kez üretilir
    // (aynı dildeki 200 kullanıcı için 200 çeviri koşumu gereksizdir); talep
    // başlığı çevirisi de dil başına bir kez okunur.
    const byLocale = new Map<Locale, RenderedNotification>();
    for (const locale of new Set(recipients.map((u) => localeOf(u.locale)))) {
      byLocale.set(
        locale,
        renderPayload(
          payload,
          locale,
          await this.titles.forParams(payload.params, locale),
        ),
      );
    }
    // Üretim girdileri alıcıdan BAĞIMSIZDIR (dil okuma anında seçilir).
    const i18n = storedI18nJson(payload);
    const rows = recipients.map((u) => {
      const text = byLocale.get(localeOf(u.locale))!;
      return {
        companyUserId: u.id,
        companyId: u.companyId,
        type: payload.type,
        portal: payload.portal ?? null,
        title: text.title,
        body: text.body,
        ctaUrl: text.ctaUrl,
        ctaLabel: text.ctaLabel,
        ...(i18n ? { i18n } : {}),
        listingId: payload.listingId ?? null,
      };
    });
    if (rows.length === 0) return 0;
    try {
      await this.prisma.notification.createMany({ data: rows });
    } catch (err) {
      // Alıcı satırlarından biri okuma↔yazma arasında kaybolduysa (FK ihlali)
      // toplu insert atomik olduğundan tümü düşer — en-iyi-çaba: sessizce atla.
      if (isMissingRecipientError(err)) {
        this.logger.debug(
          `In-app bildirim atlandı (alıcı kayboldu): ${payload.type}`,
        );
        return 0;
      }
      throw err;
    }
    // WS: zil anında güncellensin (bildirim yazılan her firmaya sinyal).
    for (const c of new Set(rows.map((r) => r.companyId))) {
      this.realtime?.pingNotification(c);
    }
    return rows.length;
  }

  /**
   * Kullanıcının bildirimleri (görebildiği portallar + ortak; en yeni önce).
   * `viewer` verilirse portal süzgeci kişinin GÜNCEL izinleriyle kesişir.
   *
   * DİL: metin OKUYANIN güncel diliyle döner (`locale`; verilmezse istek dili —
   * web kullanıcının o anki seçimini `Accept-Language` ile yollar, yoksa kayıtlı
   * dili). Üretim girdisi saklanmış satırlar yeniden üretilir, eski satırlar
   * saklanan metinle döner (bkz. `localizeRows`).
   */
  async listForUser(
    userId: string,
    opts: {
      unreadOnly?: boolean;
      take?: number;
      portal?: NotificationPortal;
      /** Bu satırdan ESKİsini getir (sayfalama imleci). */
      before?: { createdAt: Date; id: string };
    } = {},
    viewer?: PermissionSubject,
    locale: Locale = currentLocale(),
  ): Promise<NotificationRow[]> {
    const take = Math.min(Math.max(opts.take ?? 30, 1), 100);
    // Dalga B (P7): `before` imleci eklendi. Eskiden yalnız son 30 satır
    // dönüyordu ve daha eskisine ULAŞACAK hiçbir yüzey yoktu — bildirim
    // kalıcı bir kayıt olmasına rağmen 31. satırdan itibaren erişilemezdi.
    // İmleç (createdAt, id) çiftinden ilerler: eşit damgalarda id ile kırılır,
    // yoksa aynı satır iki sayfada görünür ya da hiç görünmez.
    const rows = await this.prisma.notification.findMany({
      where: {
        companyUserId: userId,
        ...(opts.unreadOnly ? { readAt: null } : {}),
        // Portal süzgeci de imleç de `OR` taşır → AYNI nesneye yayılırsa
        // imleç portal/izin süzgecini ezer (derin denetim MU-10). `AND` ile.
        AND: [
          portalReadFilter(viewer, opts.portal),
          ...(opts.before
            ? [
                {
                  OR: [
                    { createdAt: { lt: opts.before.createdAt } },
                    {
                      createdAt: opts.before.createdAt,
                      id: { lt: opts.before.id },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
    });
    return this.localizeRows(rows, locale);
  }

  /**
   * Bildirim satırları → OKUYANIN dilinde metin (TEK okuma yolu; bildirim
   * satırı döndüren her yüzey buradan geçer). Talep başlıkları sayfa başına TEK
   * toplu çözümlemeyle okunur (N+1 yok); çeviri yalnız talebin kaynak başlığı
   * bildirim anındakiyle aynıysa kullanılır (yeniden adlandırılan/silinen
   * talepte saklanan başlık). `i18n` kolonu yanıta YAZILMAZ (iç
   * ayrıntı; yanıt biçimi eski istemciyle aynı). Fail-open: başlık okunamazsa
   * kaynak başlık, satır üretilemezse saklanan metin döner.
   */
  async localizeRows<
    T extends {
      title: string;
      body: string;
      ctaLabel: string | null;
      ctaUrl: string | null;
      i18n?: unknown;
    },
  >(rows: T[], locale: Locale = currentLocale()): Promise<Omit<T, "i18n">[]> {
    const refs = new Set<string>();
    for (const r of rows) {
      for (const id of storedListingTitleRefs(parseStoredI18n(r.i18n))) {
        refs.add(id);
      }
    }
    let titles: Map<string, string> | undefined;
    // Talebin GÜNCEL kaynak başlığı: çeviri yalnız satırda saklanan başlıkla
    // aynıysa kullanılır (bkz. `usableListingTitles`). Yalnız çevirisi bulunan
    // talepler için, sayfa başına TEK sorgu; okunamazsa saklanan başlık basılır.
    let sourceTitles: Map<string, string> | undefined;
    if (refs.size > 0) {
      titles = await this.titles
        .resolve([...refs], locale)
        .catch(() => undefined);
      if (titles && titles.size > 0) {
        try {
          const listings = await this.prisma.listing.findMany({
            where: { id: { in: [...titles.keys()] } },
            select: { id: true, title: true },
          });
          sourceTitles = new Map(listings.map((l) => [l.id, l.title] as const));
        } catch {
          sourceTitles = undefined;
        }
      }
    }
    return rows.map((r) => {
      const { i18n: _i18n, ...rest } = r;
      void _i18n;
      let text;
      try {
        text = renderStoredNotification(
          r,
          locale,
          usableListingTitles(parseStoredI18n(r.i18n), titles, sourceTitles),
        );
      } catch {
        text = {
          title: r.title,
          body: r.body,
          ctaLabel: r.ctaLabel,
          ctaUrl: r.ctaUrl,
        };
      }
      return { ...rest, ...text };
    });
  }

  async unreadCount(
    userId: string,
    portal?: NotificationPortal,
    viewer?: PermissionSubject,
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        companyUserId: userId,
        readAt: null,
        ...portalReadFilter(viewer, portal),
      },
    });
  }

  /** Verilen (ve kullanıcıya ait) bildirimleri okundu işaretle. */
  async markRead(userId: string, ids: string[]): Promise<number> {
    const clean = [...new Set((ids ?? []).filter(Boolean))];
    if (clean.length === 0) return 0;
    const res = await this.prisma.notification.updateMany({
      where: { companyUserId: userId, id: { in: clean }, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }

  /** Tümünü okundu — portal verilirse yalnız o portal (+ ortak) kapsamında. */
  async markAllRead(
    userId: string,
    portal?: NotificationPortal,
    viewer?: PermissionSubject,
  ): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: {
        companyUserId: userId,
        readAt: null,
        ...portalReadFilter(viewer, portal),
      },
      data: { readAt: new Date() },
    });
    return res.count;
  }
}
