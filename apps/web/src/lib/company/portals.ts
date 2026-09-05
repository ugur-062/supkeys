import { tierAtLeast } from "@rothern/shared";
import type { CompanyRole } from "@/lib/company-auth/types";
import {
  BuildingStorefrontIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CubeIcon,
  DocumentDuplicateIcon,
  EnvelopeIcon,
  HomeIcon,
  IdentificationIcon,
  InboxArrowDownIcon,
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
  minTier?: "BRONZ" | "SILVER";
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
export const profilePath = (portal: PortalKey) => `/company/${portal}/profilim`;

export const MODULE_LABELS = {
  satinalma: {
    // Portal bağlamı zaten "Satınalma" — menüde kısa biçim yeterli ve
    // "Taleplerim" sol menüde taşıyordu.
    ihalelerim: "Taleplerim",
    // BAŞKA firmaların vitrinleri. Satıştaki "Ürünlerim" firmanın KENDİ
    // kataloğu; ikisi menüde yan yana okunduğunda ayırt edilemiyordu
    // (kullanıcı geri bildirimi 2026-09-03) → burada FİİL kullanıyoruz.
    urunAra: "Ürün Ara",
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
    acikIhaleler: "Açık Talepler",
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
      {
        // Sol menüde DEĞİL (2026-09-05, kullanıcı kararı): anasayfadaki
        // Europages tarzı "Ne arıyorsunuz?" kutusu tek giriş; sonuç sayfası
        // (süzgeçli) burada kayıtlı kalır — breadcrumb, başlık, keşif seçkisi
        // "Tüm ürünler" bağlantısı.
        icon: CubeIcon,
        label: MODULE_LABELS.satinalma.urunAra,
        href: "/company/satinalma/urunler",
      },
      {
        icon: ChartBarIcon,
        label: "Raporlar",
        href: "/company/satinalma/raporlar",
        minTier: "SILVER",
      },
      {
        icon: DocumentDuplicateIcon,
        label: "Şablonlar",
        href: "/company/satinalma/sablonlar",
        minTier: "SILVER",
      },
      {
        icon: IdentificationIcon,
        label: "Profilim",
        href: "/company/satinalma/profilim",
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
        icon: InboxArrowDownIcon,
        label: MODULE_LABELS.satis.acikIhaleler,
        href: "/company/satis/acik-talepler",
      },
      {
        // GAP FIX (2026-09-03): sayfa Faz 2'de yazılmıştı ama menüye HİÇ
        // eklenmemişti — kullanıcı ürününü nereden ekleyeceğini soramaz hâle
        // geldi. Satınalmada "Ürün Ara" görünüp satışta hiçbir şey olmaması
        // ayrımı büsbütün karıştırıyordu.
        icon: CubeIcon,
        label: MODULE_LABELS.satis.urunler,
        href: "/company/satis/urunlerim",
        // Vitrin herkese açık bir yüzey — profil kapısıyla aynı eşik.
        minTier: "BRONZ",
      },
      {
        // Satışta Profilim MENÜDE (2026-09-03): satıcının vitrini ürünleri
        // kadar günlük iş — Ayarlar'ın altında aranması gerekmemeli. Satınalma
        // tarafında hesap menüsünde kalır (orada alıcı profili düzenlemez).
        icon: IdentificationIcon,
        label: "Profilim",
        href: "/company/satis/profilim",
        // Herkese açık profil/dizin görünürlüğü Bronz'dan başlar.
        minTier: "BRONZ",
      },
      {
        icon: EnvelopeIcon,
        label: MODULE_LABELS.satis.bilgiTalepleri,
        href: "/company/satis/bilgi-talepleri",
        minTier: "BRONZ",
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
 * Erişilebilir portallar. Satınalma (alıcı/ihale açma) = **Silver+**;
 * altındaki kademeler yalnızca satış (teklif) tarafına erişir.
 */
export function accessiblePortals(
  roles: CompanyRole[],
  tier?: string,
): PortalKey[] {
  // Kurucu (SAHIP) ⊇ Yönetici — her iki portalı da görür.
  const isManager = roles.includes("YONETICI") || roles.includes("SAHIP");
  const out: PortalKey[] = [];
  if (
    (isManager || roles.includes("SATIN_ALMACI")) &&
    tierAtLeast(tier ?? "STANDART", "SILVER")
  )
    out.push("satinalma");
  if (isManager || roles.includes("SATISCI")) out.push("satis");
  return out;
}

/**
 * Mesajlaşma = operasyon rolü işi: portalın işlem rolü (satınalma→Satın
 * Almacı, satış→Satışçı) olmayan kullanıcı — Kurucu/Yönetici dahil — o
 * portalda mesajlaşamaz ve gelen kutusunu göremez (API aynası: 403).
 */
export function canUseMessaging(
  roles: CompanyRole[],
  portal: PortalKey,
): boolean {
  return roles.includes(PORTALS[portal].role);
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
    profilim: "/company/satinalma/profilim",
    raporlar: "/company/satinalma/raporlar",
    sablonlar: "/company/satinalma/sablonlar",
  },
  satis: {
    profilim: "/company/satis/profilim",
  },
};
