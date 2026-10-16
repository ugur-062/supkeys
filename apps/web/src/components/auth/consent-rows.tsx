"use client";

import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { ErrorMessage, Label } from "@/components/catalyst/fieldset";
import { Link } from "@/i18n/navigation";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export interface Consents {
  terms: boolean;
  mediation: boolean;
  kvkk: boolean;
  marketing: boolean;
  profile: boolean;
}

/**
 * Sözleşme onay satırları — kayıt ve davet kabul formlarının ORTAK parçası.
 * Metin katalogdan (`web.auth.consents`). Erişilebilir ad görünen metnin
 * kendisidir (Field/Label ilişkisi); eski ayrı kısa aria-label görünen
 * metni tam içermiyordu (WCAG "label in name").
 *
 * Satır Catalyst `CheckboxField` + `Label` (arayüz testi O-120): Headless
 * Checkbox gerçek <input> çizmediği için eski native <label> sarmalayıcısı
 * metne tıklamayı kutuya iletmiyordu — yalnız 16 px'lik kutu çalışıyordu.
 * Headless `Label` tıklamayı kutuya iletir.
 *
 * Sözleşme bağlantısı ETİKETİN DIŞINDA, kendi satırında (mobil denetim
 * 2026-10, g03-auth-consent-link): bağlantı eskiden etiket metninin içindeydi
 * ve ikinci satırda etiketin %41'ini kaplıyordu; telefonda etiketin ortasına
 * dokunmak (Chromium / Android WebView dokunma düzeltmesi yakındaki bağlantıya
 * kayar) kutuyu işaretlemek yerine sözleşmeyi yeni sekmede açıyordu. Artık
 * etiket düz metindir (katalogdaki `<a>` parçası düz yazılır, erişilebilir ad
 * aynı kalır), bağlantı altında kısa ve ayrı bir satırdır. Kutunun dokunma
 * hedefi görünmeyen çerçeveyle 38 px'e büyür (`TICK_HIT`).
 *
 * `requiredError` (arayüz testi 2026-10 signup-tr-8): gönder düğmesi sessizce
 * pasif kalmaz; basılınca işaretlenmemiş ZORUNLU her kutu `aria-invalid` olur
 * ve altında bu ileti çizilir (Headless `Description` → kutunun
 * `aria-describedby`ı). İsteğe bağlı iki kutu hiçbir zaman hata almaz.
 */
export function ConsentRows({
  consents,
  onChange,
  showProviders = false,
  requiredError,
}: {
  consents: Consents;
  onChange: (next: Consents) => void;
  /** KVKK satırında yurt dışı sağlayıcı parantezi (kayıt formunda). */
  showProviders?: boolean;
  /** Doluysa işaretlenmemiş zorunlu kutuların altında gösterilir. */
  requiredError?: string | null;
}) {
  const t = useTranslations("web.auth.consents");
  // Katalog metni sözleşme adını `<a>` ile işaretler; etikette bağlantı YOK,
  // ad düz metin olarak akar (bağlantı satırın altında ayrı).
  const plain = (chunks: ReactNode) => chunks;
  const setKey = (k: keyof Consents) => (v: boolean) => onChange({ ...consents, [k]: v });
  return (
    <div className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 sm:space-y-2">
      <CheckRow
        checked={consents.terms}
        onChange={setKey("terms")}
        error={requiredError}
        doc={{ href: "/sozlesmeler/kullanici", label: t("readTerms") }}
      >
        {t.rich("terms", { a: plain })}
      </CheckRow>
      <CheckRow
        checked={consents.mediation}
        onChange={setKey("mediation")}
        error={requiredError}
        doc={{ href: "/sozlesmeler/aracilik", label: t("readMediation") }}
      >
        {t.rich("mediation", { a: plain })}
      </CheckRow>
      <CheckRow
        checked={consents.kvkk}
        onChange={setKey("kvkk")}
        error={requiredError}
        doc={{ href: "/sozlesmeler/kvkk", label: t("readKvkk") }}
      >
        {t.rich("kvkk", { a: plain })}
        {showProviders ? <> {t("kvkkProviders")}</> : null}
      </CheckRow>
      <div className="space-y-3 border-t border-zinc-200/70 pt-2 sm:space-y-2">
        <CheckRow checked={consents.profile} onChange={setKey("profile")}>
          <span className="text-zinc-500">{t("profile")}</span>
        </CheckRow>
        <CheckRow checked={consents.marketing} onChange={setKey("marketing")}>
          <span className="text-zinc-500">{t("marketing")}</span>
        </CheckRow>
      </div>
    </div>
  );
}

/**
 * Kutunun dokunma hedefi: görünen kutu 18 px (geniş ekranda 16). Kutu ızgara
 * satırı boyunca uzamasın diye `self-start` (uzarsa görünmeyen çerçeve alttaki
 * belge bağlantısının üstüne biner). Çerçeve solda 12 px (kutunun iç
 * boşluğuna), dikeyde 10 px (geniş ekranda 8 px), sağda 8 px büyür: sağ kenar
 * tam etiketin / bağlantının başladığı yerde biter, ikisine de binmez →
 * telefonda 38×38 px. Satırlar arası boşluk telefonda 12 px (`space-y-3`):
 * çerçeve üst satırın bağlantısına da değmez.
 */
const TICK_HIT =
  "relative self-start after:absolute after:-left-3 after:-right-2 after:-inset-y-2.5 sm:after:-inset-y-2";

function CheckRow({
  checked,
  onChange,
  error,
  doc,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Zorunlu kutu işaretsizken gösterilecek ileti (yalnız zorunlu satırlar verir). */
  error?: string | null;
  /** Satırın belgesi — etiketin altında ayrı bağlantı (yeni sekmede açılır). */
  doc?: { href: string; label: string };
  children: ReactNode;
}) {
  const invalid = !checked && !!error;
  return (
    <CheckboxField className="gap-x-2!">
      <Checkbox
        checked={checked}
        onChange={onChange}
        aria-invalid={invalid ? true : undefined}
        className={TICK_HIT}
      />
      {/* `active:` biçimi: basılınca koyulaşır (dokunma geri bildirimi). Ek
          güvence: Chromium / Android WebView dokunma düzeltmesi :active biçimi
          olan öğeyi "dokunulabilir" sayar → etiketin alt kenarına düşen dokunuş
          alttaki bağlantıya kaymaz (360 px'te ölçüldü: etiketin ortası ve son
          satırı kutuyu işaretliyor, bağlantı yalnız kendi satırında açılıyor). */}
      <Label className="cursor-pointer text-xs/5! text-zinc-700! active:text-zinc-950!">{children}</Label>
      {doc ? (
        // Izgarada etiketin altına (2. sütun, 2. satır). Dokunma hedefi 32 px
        // (`min-h-8`); eksi kenar boşluğu satırı 24 px'ten fazla uzatmaz.
        // `data-shell-browser`: mobil kabukta belge uygulama içi tarayıcıda
        // açılır — WebView'de açılsaydı yarım form (şifreler dahil) kaybolurdu.
        <Link
          href={doc.href}
          target="_blank"
          rel="noopener noreferrer"
          data-shell-browser=""
          className="col-start-2 row-start-2 -my-1 inline-flex min-h-8 items-center gap-1 justify-self-start text-xs/5 font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-950"
        >
          {doc.label}
          <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
        </Link>
      ) : null}
      {invalid ? (
        // Izgarada en altta (2. sütun; belge bağlantısı varsa 3. satır).
        <ErrorMessage
          className={`col-start-2 text-xs/5! sm:text-xs/5! ${doc ? "row-start-3" : "row-start-2"}`}
        >
          {error}
        </ErrorMessage>
      ) : null}
    </CheckboxField>
  );
}
