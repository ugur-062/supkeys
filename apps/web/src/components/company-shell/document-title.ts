"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useNavLabel } from "@/i18n/domain";
import { getCompanyBreadcrumb } from "@/lib/company/nav-config";
import { COMPANY_AREA, PORTALS } from "@/lib/company/portals";
import { SETTINGS_PAGES, type SettingsPageKey } from "@/lib/company/settings-pages";
import { SITE_NAME, TITLE_SUFFIX } from "@/lib/seo/meta";

/**
 * PANEL SEKME BAŞLIĞI (kayıt denetimi 2026-10 signup-tr-23).
 *
 * Panel sayfaları istemci bileşenidir ve `metadata` taşıyamaz; hepsi kök
 * düzenin yedek başlığıyla ("Rothern") açılıyordu — kayıt ve onboarding
 * ("Kaydol · Rothern", "Şirket bilgileri · Rothern") sonrasında sekme adı
 * kayboluyor, yan yana açık panel sekmeleri birbirinden ayırt edilemiyordu.
 *
 * Başlık kabukta, VAR OLAN rota etiketi kaynağından üretilir: menü/rota
 * kaydı (`getCompanyBreadcrumb` → `web.panel.nav.*`), Ayarlar alt sayfaları
 * (`SETTINGS_PAGES` → sayfanın kendi başlığı) ve rota kaydında olmayan birkaç
 * panel sayfası için var olan etiketler. Metin arayüz dilinde; biçim kök
 * şablonla aynı (`<sayfa adı> · Rothern`).
 */
export type PanelTitleRef =
  | { source: "nav"; key: string }
  | { source: "settings"; key: SettingsPageKey }
  | { source: "messages" };

/** `getCompanyBreadcrumb`ın tanımadığı yol için döndürdüğü yedek anahtar. */
const UNKNOWN_ROUTE = "common.home";

const SETTINGS_BY_HREF = new Map<string, SettingsPageKey>(
  Object.values(SETTINGS_PAGES)
    // "Firma Profili" kartı Şirketim › Profil'e köprüdür; o sayfanın adı rota kaydında.
    .filter((p) => p.href.startsWith("/company/ayarlar/"))
    .map((p) => [p.href, p.key]),
);

/** Rota kaydında olmayan panel sayfaları (önek eşleşmesi) — var olan etiketlerle. */
const UNREGISTERED: ReadonlyArray<readonly [prefix: string, ref: PanelTitleRef]> = [
  ["/company/mesajlar", { source: "messages" }],
  ["/company/firma-dizini", { source: "nav", key: "common.companies" }],
  ["/company/firma", { source: "nav", key: "common.companies" }],
  ["/company/urun", { source: "nav", key: "satinalma.urunler" }],
];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/** Üst yolun etiketi: portal/alan kökünde "· Anasayfa" değil alanın adı. */
function ancestorKey(path: string, key: string): string {
  const portal = Object.values(PORTALS).find((p) => p.basePath === path);
  if (portal) return portal.label;
  return path === COMPANY_AREA.basePath ? COMPANY_AREA.label : key;
}

/**
 * İç (Türkçe) panel yolu → başlığın kaynağı. Tam eşleşme yoksa en yakın üst
 * yolun etiketi kullanılır (`…/taleplerim/yeni` → Taleplerim, tanınmayan
 * Ayarlar alt sayfası → Ayarlar). Hiçbir etiket yoksa `null` (yalnız marka).
 */
export function panelTitleRef(pathname: string | null | undefined): PanelTitleRef | null {
  if (!pathname) return null;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const settings = SETTINGS_BY_HREF.get(path);
  if (settings) return { source: "settings", key: settings };
  const extra = UNREGISTERED.find(([prefix]) => under(path, prefix));
  if (extra) return extra[1];
  for (let p = path; p.startsWith("/company/"); p = p.slice(0, p.lastIndexOf("/"))) {
    const key = getCompanyBreadcrumb(p);
    if (key !== UNKNOWN_ROUTE) return { source: "nav", key: p === path ? key : ancestorKey(p, key) };
  }
  return null;
}

/** Sekme başlığı metni: `<sayfa adı> · Rothern`; sayfa adı yoksa yalnız marka. */
export function panelDocumentTitle(label: string | null): string {
  return label ? `${label}${TITLE_SUFFIX}` : SITE_NAME;
}

/**
 * Sekme başlığını etkin panel sayfasına göre kurar. Next kendi `<title>`
 * öğesini bizden SONRA da yazabilir (meta sınırının geç hidrasyonu, akışla
 * gelen meta, gezinmede yeniden takılan öğe) — o yüzden başlık yalnız bir kez
 * atanmaz: `<head>` izlenir ve başlık her sapmada geri yazılır. Kabuk
 * söküldüğünde (panel dışına istemci gezinmesi) başlık hâlâ bizimkiyse markaya
 * döner — yeni sayfa kendi başlığını yazdıysa dokunulmaz.
 */
export function useCompanyDocumentTitle(pathname: string | null | undefined): void {
  const tn = useNavLabel();
  const ts = useTranslations("web.panel.settings.settingsPages");
  const tm = useTranslations("web.panel.shell.messagesPopover");
  const ref = panelTitleRef(pathname);
  const label =
    ref === null
      ? null
      : ref.source === "settings"
        ? ts(`${ref.key}.title` as never)
        : ref.source === "messages"
          ? tm("mesajlar")
          : tn(ref.key);
  const title = panelDocumentTitle(label);

  useEffect(() => {
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = typeof MutationObserver === "undefined" ? null : new MutationObserver(apply);
    const watch = { childList: true, subtree: true, characterData: true };
    observer?.observe(document.head, watch);
    // `document.title` belgedeki İLK `<title>`ı okur; akışla gelen meta onu
    // `<head>` dışına yazmış olabilir — o öğenin metni de izlenir.
    const current = document.querySelector("title");
    if (current && !document.head.contains(current)) observer?.observe(current, watch);
    return () => {
      observer?.disconnect();
      if (document.title === title) document.title = SITE_NAME;
    };
  }, [title]);
}
