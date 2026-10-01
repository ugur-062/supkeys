import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import {
  userHasPermission,
  type PermissionSubject,
} from "@/lib/company/permissions";
import type { CompanyRole } from "@/lib/company-auth/types";
import {
  BuildingOffice2Icon,
  EyeIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  DocumentDuplicateIcon,
  EnvelopeIcon,
  HomeIcon,
  IdentificationIcon,
  ShoppingBagIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";
import type { ComponentType, SVGProps } from "react";

type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { "data-slot"?: string }>;

export type PortalKey = "satinalma" | "satis";

export interface PortalNavItem {
  icon: NavIcon;
  label: string;
  href: string;
  /** En az bu kademede aktif (altındakine kilitli teaser). Faz T. */
  minTier?: "SILVER" | "GOLD";
  /** Yetki tablosu Faz 3: bu izin(ler)den biri yoksa satır menüde HİÇ çizilmez. */
  permission?: string | readonly string[];
  /**
   * Kilit kademesi kişinin İZNİNE göre (rol kontrolü paket kontrolünün
   * İÇİNDE — arayüz testi O-043): satır birden çok izinle açılıyorsa, kişinin
   * sahip olduğu izinlerin en düşük kademesi geçerli. Varsa `minTier`'ı ezer.
   */
  tierByPermission?: Readonly<Record<string, "SILVER" | "GOLD">>;
}

/**
 * Satırın bu kullanıcı için kilit kademesi (`tierByPermission` varsa izne
 * göre, yoksa sabit `minTier`). Sol menü kilidi buradan okur.
 */
export function navItemMinTier(
  item: PortalNavItem,
  user: PermissionSubject | null | undefined,
): "SILVER" | "GOLD" | undefined {
  if (!item.tierByPermission) return item.minTier;
  const tiers = Object.entries(item.tierByPermission)
    .filter(([perm]) => userHasPermission(user, perm))
    .map(([, tier]) => tier);
  if (tiers.length === 0) return item.minTier;
  return tiers.includes("SILVER") ? "SILVER" : "GOLD";
}

/** Satır bu kullanıcı + kademe için kilitli mi (teaser kilidi). */
export function isNavItemLocked(
  item: PortalNavItem,
  user: PermissionSubject | null | undefined,
  tier: string,
): boolean {
  const min = navItemMinTier(item, user);
  return !!min && !tierAtLeast(tier, min);
}

export interface PortalDef {
  key: PortalKey;
  label: string;
  /** Bu portala erişim veren operasyon rolü. */
  role: CompanyRole;
  basePath: string;
  accent: "blue" | "emerald";
  /** Sol menüde görünen satırlar (düz liste, iç içe yok). */
  nav: PortalNavItem[];
  /**
   * Menüde GÖRÜNMEYEN ama portala ait ikincil sayfalar (2026-08-22 menü
   * sadeleştirmesi): Raporlar + Şablonlar → İhalelerim sayfası başlığından,
   * Profilim → Ayarlar hub'ından açılır. Breadcrumb/routeLabel sözlüğü
   * (nav-config, terms) nav+secondaryNav'ı birlikte tarar — sayfa başlığı ve
   * geri linki adını kaybetmez.
   */
  secondaryNav: PortalNavItem[];
}

/**
 * B10 — modül adları TEK sözlükten: sidebar, sayfa başlığı (PageHeader),
 * breadcrumb ve geri linki (fromLabel) hep buradan okur; ad değişikliği tek
 * satırdır ve yüzeyler birbirinden kopamaz.
 */
/**
 * PROFİLİM artık SAĞ ÜST hesap menüsünde (2026-09-03 kullanıcı kararı).
 *
 * `secondaryNav` kaydı KALDIRILMADI: o liste sol menüyü DEĞİL rota kaydını
 * (breadcrumb + sayfa başlığı + tier kapısı) besliyor — silinseydi profil
 * sayfasının başlığı "Anasayfa"ya düşerdi. Değişen yalnız GİRİŞ NOKTASI:
 * eskiden yalnız Ayarlar kartından bulunuyordu, şimdi avatar menüsünde.
 */
export const profilePath = (_portal: PortalKey) => `${COMPANY_AREA_BASE}/profil`;

/**
 * ŞİRKETİM — firma alanı (2026-09-05, Europages "My Company" kalıbı, kullanıcı
 * kararı). Üst çubuktaki firma adı bu alana girer; içindeyken sol menü
 * DEĞİŞİR: Genel Bakış · Profil · Ziyaret Edenler · Raporlar.
 * Satınalma | Satış geçişi üstte kalır (panele tek tıkla dönüş). Portal-nötr
 * rota (`/company/sirketim/*`); Profilim'in iki portal adresi ve satınalma
 * raporları buraya taşındı (eski adresler 308).
 */
export const COMPANY_AREA_BASE = "/company/sirketim";

/**
 * Herkese açık profil sayfasının (Şirketim › Profil) izinleri — API
 * `GET company/profile` aynası. Menü satırı, Ayarlar "Firma Profili" kartı
 * ve sayfa kapısı bu TEK sabitten okur (arayüz testi O-101/O-108).
 */
export const COMPANY_PROFILE_PERMISSIONS = ["company:manage", "buy:view", "sell:view"] as const;

/**
 * Şirketim ALANI kapısı: alandaki sayfalardan en az birini açan her izin
 * (Genel Bakış yönetim/portal izinleriyle, Ziyaret Edenler `insights:view`,
 * Raporlar `insights:view` / `buy:reports:view`). Alt sayfalar kendi
 * kapılarını ayrıca taşır (2026-09-17 sayfa bazında kapı; arayüz testi O-062).
 */
export const COMPANY_AREA_PERMISSIONS = [
  "users:manage",
  ...COMPANY_PROFILE_PERMISSIONS,
  "insights:view",
  "buy:reports:view",
] as const;

export interface CompanyAreaDef {
  label: string;
  basePath: string;
  nav: PortalNavItem[];
  /** Menüde değil, rota kaydında (breadcrumb/başlık). */
  secondaryNav: PortalNavItem[];
}

export const COMPANY_AREA: CompanyAreaDef = {
  label: "sirketim.title",
  basePath: COMPANY_AREA_BASE,
  nav: [
    { icon: BuildingOffice2Icon, label: "sirketim.overview", href: COMPANY_AREA_BASE, permission: COMPANY_AREA_PERMISSIONS },
    // Herkese açık profil HER pakete açık (2026-09-06: ücretsiz firma da
    // yayınlar; paketin karşılığı dizinde öncelik + "Doğrulanmış" rozeti).
    // İzin API profil ucuyla aynı (yalnız "Kullanıcı ve yetki" tikli kişi 403
    // alıyordu — arayüz testi O-101).
    { icon: IdentificationIcon, label: "sirketim.profile", href: `${COMPANY_AREA_BASE}/profil`, permission: COMPANY_PROFILE_PERMISSIONS },
    // Sayılar herkese açık, kimlikli liste Silver+ (sayfa içinde kilit); menüde
    // "Ziyaret edenler ve iş analizi" tiki (Satışçı/Yönetici/Kurucu setinde).
    { icon: EyeIcon, label: "sirketim.visitors", href: `${COMPANY_AREA_BASE}/ziyaretciler`, permission: "insights:view" },
    // Raporlar iki tarafın da girişi (2026-09-17): satınalma raporları
    // (Gold + buy:reports:view) VE İş Analizi (Silver + insights:view). Satır
    // ikisinden biri varsa çizilir; hub içeride yetkili kartı (paketi
    // yetmiyorsa kilitli) gösterir. Kilit kademesi kişinin iznine göre: yalnız
    // satınalma raporu izni olana Gold (arayüz testi O-043).
    {
      icon: ChartBarIcon,
      label: "sirketim.reports",
      href: `${COMPANY_AREA_BASE}/raporlar`,
      minTier: "SILVER",
      permission: ["buy:reports:view", "insights:view"],
      tierByPermission: { "insights:view": "SILVER", "buy:reports:view": "GOLD" },
    },
  ],
  secondaryNav: [],
};

export const isCompanyAreaPath = (pathname: string | null): boolean =>
  !!pathname && (pathname === COMPANY_AREA_BASE || pathname.startsWith(`${COMPANY_AREA_BASE}/`));

/**
 * MENÜ ETİKETLERİ KATALOG ANAHTARIDIR (i18n Faz 2, 2026-09-24): değerler
 * `web.panel.nav.*` altındaki anahtar; çizim yeri `useTranslations("web.panel.nav")`
 * ile çevirir (`tn(item.label)`). Türkçe metin katalogda, burada değil.
 */
export const MODULE_LABELS = {
  satinalma: {
    // Portal bağlamı zaten "Satınalma" — menüde kısa biçim yeterli ve
    // "Taleplerim" sol menüde taşıyordu.
    ihalelerim: "satinalma.taleplerim",
    // Satıştaki "Bilgi Talepleri" ile karıştırılmamalı: orası ürünlerime
    // GELEN sorular, burası benim GÖNDERDİKLERİM. Ayrımı iyelik kipi taşıyor
    // ("Ürünlerim"/"Ürün Ara" ile aynı kural).
    bilgiTaleplerim: "satinalma.bilgiTaleplerim",
    siparisler: "satinalma.siparisler",
  },
  satis: {
    // Satış portalında BAŞKA firmaların satın alma talepleri "talep"tir
    // ("Açık Talepler"); firmanın kendi sattıkları ÜRÜN kataloğundadır
    // ("Ürünlerim"). Satış ilanı özelliği kaldırıldı (2026-09-04).
    urunler: "satis.urunlerim",
    // Misafir ziyaretçilerin ürün sayfalarından gönderdiği sorular (Faz 1) —
    // "mesaj" DEĞİL: mesajlaşma firma↔firma, bu kanalda gönderenin hesabı
    // olmayabilir. Aynı sözcüğü kullanmak iki farklı akışı karıştırırdı.
    bilgiTalepleri: "satis.bilgiTalepleri",
    // 2026-09-17, kullanıcı kararı: "sadece Tekliflerim olsun" — portal öneki
    // kalktı (satınalma tarafında bu adla sayfa yok; üst çubuk zaten portalı
    // söylüyor).
    teklifler: "satis.tekliflerim",
    siparisler: "satis.satislarim",
  },
} as const;

export const PORTALS: Record<PortalKey, PortalDef> = {
  satinalma: {
    key: "satinalma",
    label: "portal.satinalma",
    role: "SATIN_ALMACI",
    basePath: "/company/satinalma",
    accent: "blue",
    nav: [
      { icon: HomeIcon, label: "common.home", href: "/company/satinalma" },
      {
        icon: ClipboardDocumentListIcon,
        label: MODULE_LABELS.satinalma.ihalelerim,
        href: "/company/satinalma/taleplerim",
      },
      {
        // Bilgi talepleri "ürünü buldum, sordum, yanıtı nerede?" sorusunun
        // cevabı. Paket kapısı YOK: soru sormak satılan bir özellik değil,
        // satıcı için gelen taleptir. ("Ürün Ara" menüde DEĞİL — anasayfadaki
        // arama kutusu, 2026-09-05; rota secondaryNav'da.)
        icon: EnvelopeIcon,
        label: MODULE_LABELS.satinalma.bilgiTaleplerim,
        href: "/company/satinalma/bilgi-taleplerim",
      },
      {
        icon: ShoppingBagIcon,
        label: MODULE_LABELS.satinalma.siparisler,
        href: "/company/satinalma/siparisler",
      },
      {
        icon: UsersIcon,
        label: "common.connections",
        href: "/company/satinalma/tedarikcilerim",
      },
    ],
    secondaryNav: [
      // PAZAR BÖLGESİ (2026-09-07): ürün ve firma dizinleri ile kategori
      // sayfaları SOL MENÜDE DEĞİL — anasayfadaki arama, kategori kartları
      // ve pazar bandındaki Ürünler|Firmalar sekmeleri oraya götürür. Sol
      // menü panel kimliğidir (Taleplerim, Siparişlerim, Bağlantılar); pazar
      // onun sağında yaşayan ikinci bölgedir. Burada durmalarının sebebi
      // rota KAYDI: breadcrumb, sayfa başlığı ve tier kapısı bu listeden
      // beslenir (`allPortalRoutes`).
      { icon: CubeIcon, label: "satinalma.urunler", href: "/company/satinalma/urunler" },
      { icon: BuildingOffice2Icon, label: "common.companies", href: "/company/satinalma/firmalar" },
      // Raporlar ve Profilim ŞİRKETİM alanına taşındı (2026-09-05, Europages
      // "My Company" kalıbı) — bkz. COMPANY_AREA.
      {
        icon: DocumentDuplicateIcon,
        label: "satinalma.sablonlar",
        href: "/company/satinalma/sablonlar",
        minTier: "GOLD",
      },
    ],
  },
  satis: {
    key: "satis",
    label: "portal.satis",
    role: "SATISCI",
    basePath: "/company/satis",
    accent: "emerald",
    nav: [
      { icon: HomeIcon, label: "common.home", href: "/company/satis" },
      {
        // GAP FIX (2026-09-03): sayfa Faz 2'de yazılmıştı ama menüye HİÇ
        // eklenmemişti — kullanıcı ürününü nereden ekleyeceğini soramaz hâle
        // geldi. Satınalmada "Ürün Ara" görünüp satışta hiçbir şey olmaması
        // ayrımı büsbütün karıştırıyordu.
        icon: CubeIcon,
        label: MODULE_LABELS.satis.urunler,
        href: "/company/satis/urunlerim",
        // Vitrin HER pakete açık (2026-09-06); ücretsizde PRODUCT_LIMITS tavanı,
        // belge/video Silver — kapı sayfa içinde ve API'de, menüde değil.
      },
      // Profilim ŞİRKETİM alanına taşındı (2026-09-05) — bkz. COMPANY_AREA.
      {
        icon: EnvelopeIcon,
        label: MODULE_LABELS.satis.bilgiTalepleri,
        href: "/company/satis/bilgi-talepleri",
        // Her pakete açık (2026-09-06): ücretsiz firma gelen soruyu görür,
        // alıcı kimliği ve yanıt Silver (kilit sayfa içinde).
      },
      {
        icon: ClipboardDocumentListIcon,
        label: MODULE_LABELS.satis.teklifler,
        href: "/company/satis/tekliflerim",
      },
      {
        icon: ShoppingBagIcon,
        label: MODULE_LABELS.satis.siparisler,
        href: "/company/satis/siparisler",
      },
      {
        icon: BuildingStorefrontIcon,
        label: "common.connections",
        href: "/company/satis/musterilerim",
      },
    ],
    // Raporlar ve Şablonlar satış ilanı sihirbazına aitti, o özellikle
    // birlikte kaldırıldı (2026-09-04). Firma dizini (2026-09-10): satış da
    // "kime satabilirim"i arar — anasayfa arama anahtarı ve Bağlantılar ›
    // Keşfet oraya götürür; sol menüde DEĞİL (satınalmadaki kuralla aynı).
    secondaryNav: [
      { icon: BuildingOffice2Icon, label: "common.companies", href: "/company/satis/firmalar" },
    ],
  },
};

export const PORTAL_ORDER: PortalKey[] = ["satinalma", "satis"];

/**
 * Gold altındaki firmada (paket düştü ya da süresi bitti) Satınalma'nın AÇIK
 * kalan sayfaları (2026-10-01 kullanıcı kararı T-06, arayüz testi O-008):
 * mevcut talepleri ve siparişleri görüp sonuçlandırmak için listeler. Yeni iş
 * (talep açma, şablon, pano) Gold kapısında kalır; liste sayfaları üstte
 * paket bandı taşır. Tam eşleşme — `/taleplerim/yeni` gibi alt yollar DEĞİL.
 */
export const BUYING_WIND_DOWN_PATHS: readonly string[] = [
  "/company/satinalma/taleplerim",
  "/company/satinalma/siparisler",
];

/**
 * Paket/rol kapısından BAĞIMSIZ geçen eski adresler: yalnız yönlendirici
 * (birleşik gelen kutusu kendi kapısını uygular — arayüz testi D-264).
 */
export const PORTAL_PASSTHROUGH_PATHS: readonly string[] = ["/company/satinalma/mesajlar"];

/**
 * "Kategorileri düzenle" hedefi — açık talep/ilan eşleşmesi firmanın
 * kategori beyanına dayanır ve o beyan TEK yerde: Ayarlar → Firma Bilgileri
 * "Ne alırım / Ne satarım" bölümü (v2 4c). Pano seçkileri ve liste boş
 * durumları buradan okur; "profilinizde güncelleyin" denmez — veri orada değil.
 */
export const SECTOR_EDIT_HREF = "/company/ayarlar/firma#kategoriler";

/** URL'den aktif portalı türetir (kaynak: pathname). */
export function activePortalFromPath(pathname: string | null): PortalKey | null {
  if (!pathname) return null;
  if (pathname.startsWith("/company/satinalma")) return "satinalma";
  if (pathname.startsWith("/company/satis")) return "satis";
  return null;
}

/**
 * Kullanıcının rollerine göre erişebildiği portallar. YONETICI ikisini de görür;
 * SATIN_ALMACI → satınalma, SATISCI → satış. Bir kişi YÖNETİCİ olmadan iki role
 * birden sahip olabilir (ikisi de açılır).
 */
/**
 * Erişilebilir portallar. Üç paket (2026-09-06): satınalma paneli = **Gold**
 * (BUYING_TIER); Standart ve Silver yalnız satış tarafına erişir.
 */
export function accessiblePortals(
  user: PermissionSubject | null | undefined,
  tier?: string,
): PortalKey[] {
  // Yetki tablosu (2026-09-05): portal = o tarafın GÖRÜNTÜLEME izni
  // (işlem izni görüntülemeyi örtük içerir; Kurucu/Yönetici hazır setinde
  // ikisi de var). Satınalma ayrıca paket kuralına tabi (Silver+).
  const out: PortalKey[] = [];
  if (
    userHasPermission(user, "buy:view") &&
    tierAtLeast(tier ?? "STANDART", BUYING_TIER)
  )
    out.push("satinalma");
  if (userHasPermission(user, "sell:view")) out.push("satis");
  return out;
}

/**
 * Mesaj kutusunu OKUMA = portalı görüntüleme izni (API `listThreads` aynası:
 * Kurucu/Yönetici/görüntüleyici de okur). GÖNDERME ayrı: `canSendMessages`.
 */
export function canUseMessaging(
  user: PermissionSubject | null | undefined,
  portal: PortalKey,
): boolean {
  return userHasPermission(
    user,
    portal === "satinalma" ? "buy:view" : "sell:view",
  );
}

/**
 * Mesajlaşma YÖNÜ paketle açık mı? ALICI yönü (satinalma) satınalma panelidir
 * → Gold (BUYING_TIER); satıcı yönü her pakete açık. Paketi düşen firma eski
 * alıcı konuşmalarını OKUR (`canUseMessaging` paket sormaz) ama yeni alıcı
 * konuşması açamaz, yazamaz (API `send` aynası, arayüz testi O-123).
 */
export function messagingDirectionOpen(
  portal: PortalKey,
  tier: string | null | undefined,
): boolean {
  return portal !== "satinalma" || tierAtLeast(tier ?? "STANDART", BUYING_TIER);
}

/**
 * Mesaj GÖNDERME = paket (alıcı yönü Gold) + işlem izni (API `send` aynası):
 * satınalmada "talep açma ve yönetme", satışta "teklif verme". Etiket-only ve
 * görüntüleyici gönderemez. Rol denetimi paket denetiminin İÇİNDE.
 */
export function canSendMessages(
  user: PermissionSubject | null | undefined,
  portal: PortalKey,
  tier: string | null | undefined,
): boolean {
  return (
    messagingDirectionOpen(portal, tier) &&
    userHasPermission(
      user,
      portal === "satinalma" ? "buy:listing:manage" : "sell:bid:submit",
    )
  );
}

export function isPortalItemActive(
  href: string,
  pathname: string | null,
): boolean {
  if (!pathname) return false;
  const base =
    href === "/company/satinalma" || href === "/company/satis";
  if (base) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Portalın tüm rotaları (menü + ikincil) — breadcrumb/etiket sözlükleri için. */
export function allPortalRoutes(def: PortalDef): PortalNavItem[] {
  return [...def.nav, ...def.secondaryNav];
}

/**
 * Portala göre Profilim / Raporlar / Şablonlar adresleri (Ayarlar kartı,
 * hesap menüsü, sayfa başlıkları). Satışta Profilim artık ana menüde de var;
 * bu tablo giriş noktalarının ORTAK adres kaynağı olmaya devam eder.
 * Raporlar/Şablonlar yalnız satınalmada (satış ilanı kaldırıldı, 2026-09-04).
 */
export const PORTAL_SECONDARY_HREFS: {
  satinalma: { profilim: string; raporlar: string; sablonlar: string };
  satis: { profilim: string };
} = {
  satinalma: {
    profilim: "/company/sirketim/profil",
    raporlar: "/company/sirketim/raporlar",
    sablonlar: "/company/satinalma/sablonlar",
  },
  satis: {
    profilim: "/company/sirketim/profil",
  },
};
