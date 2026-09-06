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

export interface CompanyAreaDef {
  label: string;
  basePath: string;
  nav: PortalNavItem[];
  /** Menüde değil, rota kaydında (breadcrumb/başlık). */
  secondaryNav: PortalNavItem[];
}

export const COMPANY_AREA: CompanyAreaDef = {
  label: "Şirketim",
  basePath: COMPANY_AREA_BASE,
  nav: [
    { icon: BuildingOffice2Icon, label: "Genel Bakış", href: COMPANY_AREA_BASE },
    // Herkese açık profil HER pakete açık (2026-09-06: ücretsiz firma da
    // yayınlar; paketin karşılığı dizinde öncelik + "Doğrulanmış" rozeti).
    { icon: IdentificationIcon, label: "Profil", href: `${COMPANY_AREA_BASE}/profil` },
    // Sayılar herkese açık, kimlikli liste Silver+ (sayfa içinde kilit); menüde
    // "Ziyaret edenler ve iş analizi" tiki (Satışçı/Yönetici/Kurucu setinde).
    { icon: EyeIcon, label: "Ziyaret Edenler", href: `${COMPANY_AREA_BASE}/ziyaretciler`, permission: "insights:view" },
    { icon: ChartBarIcon, label: "Raporlar", href: `${COMPANY_AREA_BASE}/raporlar`, minTier: "GOLD", permission: "buy:reports:view" },
  ],
  secondaryNav: [],
};

export const isCompanyAreaPath = (pathname: string | null): boolean =>
  !!pathname && (pathname === COMPANY_AREA_BASE || pathname.startsWith(`${COMPANY_AREA_BASE}/`));

export const MODULE_LABELS = {
  satinalma: {
    // Portal bağlamı zaten "Satınalma" — menüde kısa biçim yeterli ve
    // "Taleplerim" sol menüde taşıyordu.
    ihalelerim: "Taleplerim",
    // Satıştaki "Bilgi Talepleri" ile karıştırılmamalı: orası ürünlerime
    // GELEN sorular, burası benim GÖNDERDİKLERİM. Ayrımı iyelik kipi taşıyor
    // ("Ürünlerim"/"Ürün Ara" ile aynı kural).
    bilgiTaleplerim: "Bilgi Taleplerim",
    siparisler: "Siparişlerim",
  },
  satis: {
    // Satış portalında BAŞKA firmaların satın alma talepleri "talep"tir
    // ("Açık Talepler"); firmanın kendi sattıkları ÜRÜN kataloğundadır
    // ("Ürünlerim"). Satış ilanı özelliği kaldırıldı (2026-09-04).
    urunler: "Ürünlerim",
    // Misafir ziyaretçilerin ürün sayfalarından gönderdiği sorular (Faz 1) —
    // "mesaj" DEĞİL: mesajlaşma firma↔firma, bu kanalda gönderenin hesabı
    // olmayabilir. Aynı sözcüğü kullanmak iki farklı akışı karıştırırdı.
    bilgiTalepleri: "Bilgi Talepleri",
    // C32: iki portalda aynı H1 ("Tekliflerim") ayırt edilemiyordu — satış
    // tarafı portal-önekli (Satış İlanlarım/Satışlarım deseniyle aynı).
    teklifler: "Satış Tekliflerim",
    siparisler: "Satışlarım",
  },
} as const;

export const PORTALS: Record<PortalKey, PortalDef> = {
  satinalma: {
    key: "satinalma",
    label: "Satınalma",
    role: "SATIN_ALMACI",
    basePath: "/company/satinalma",
    accent: "blue",
    nav: [
      { icon: HomeIcon, label: "Anasayfa", href: "/company/satinalma" },
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
        label: "Bağlantılar",
        href: "/company/satinalma/tedarikcilerim",
      },
    ],
    secondaryNav: [
      // "Ürün Ara" ROTASI YOK (2026-09-05): başka firmaların vitrini
      // satınalma ANASAYFASINA gömülü (arama + kenar süzgeçli liste);
      // ürün detayı `urunler/<firma>/<ürün>` altında yaşamaya devam eder.
      // Raporlar ve Profilim ŞİRKETİM alanına taşındı (2026-09-05, Europages
      // "My Company" kalıbı) — bkz. COMPANY_AREA.
      {
        icon: DocumentDuplicateIcon,
        label: "Şablonlar",
        href: "/company/satinalma/sablonlar",
        minTier: "GOLD",
      },
    ],
  },
  satis: {
    key: "satis",
    label: "Satış",
    role: "SATISCI",
    basePath: "/company/satis",
    accent: "emerald",
    nav: [
      { icon: HomeIcon, label: "Anasayfa", href: "/company/satis" },
      {
        // GAP FIX (2026-09-03): sayfa Faz 2'de yazılmıştı ama menüye HİÇ
        // eklenmemişti — kullanıcı ürününü nereden ekleyeceğini soramaz hâle
        // geldi. Satınalmada "Ürün Ara" görünüp satışta hiçbir şey olmaması
        // ayrımı büsbütün karıştırıyordu.
        icon: CubeIcon,
        label: MODULE_LABELS.satis.urunler,
        href: "/company/satis/urunlerim",
        // Vitrin HER pakete açık (2026-09-06); ücretsizde 10 ürün tavanı,
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
        label: "Bağlantılar",
        href: "/company/satis/musterilerim",
      },
    ],
    // Satışta ikincil sayfa yok: Raporlar ve Şablonlar satış ilanı
    // sihirbazına aitti, o özellikle birlikte kaldırıldı (2026-09-04).
    secondaryNav: [],
  },
};

export const PORTAL_ORDER: PortalKey[] = ["satinalma", "satis"];

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
 * Mesaj GÖNDERME = işlem izni (API `send` aynası): satınalmada "talep açma
 * ve yönetme", satışta "teklif verme". Etiket-only ve görüntüleyici gönderemez.
 */
export function canSendMessages(
  user: PermissionSubject | null | undefined,
  portal: PortalKey,
): boolean {
  return userHasPermission(
    user,
    portal === "satinalma" ? "buy:listing:manage" : "sell:bid:submit",
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
