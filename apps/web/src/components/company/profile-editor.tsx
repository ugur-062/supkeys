"use client";

import { MissingFields } from "@/components/ui/missing-fields";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { Thumb } from "@/components/ui/thumb";
import { useShowcaseItems } from "@/hooks/use-company-items";
import { EMPLOYEE_BUCKET_LABELS, categorySegment, deepestCategoryPicks, visibleCompanyCategorySelection } from "@rothern/shared";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { profileCompleteness, type ProfileCompletenessKey } from "@/lib/company/profile-completeness";
import { SearchVisibilityCard } from "@/components/seo/search-visibility-card";
import { useAiSeoEnrich } from "@/hooks/use-ai-seo-enrich";
import { companySeo } from "@/lib/seo/entities";
import { snippetFromMetadata } from "@/lib/seo/snippet";
import { cityDisplayName, useActivityLabel, useSeoT } from "@/i18n/domain";
import { CountryLabel } from "@/components/ui/country-flag";
import { MapPinIcon } from "@heroicons/react/20/solid";
import { useLocale, useTranslations } from "next-intl";
import {
  COMPANY_PROFILE_LIMITS,
  COMPANY_SERVICE_MAX_LENGTH,
  COMPANY_SERVICES_MAX,
  companySeoReadiness,
  generateSlug,
  tierAtLeast,
} from "@rothern/shared";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { hasAnySeatPermission } from "@/lib/company/permissions";
import { accessiblePortals } from "@/lib/company/portals";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { Switch } from "@/components/catalyst/switch";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Textarea } from "@/components/catalyst/textarea";
import {
  CompanyProfileView,
  type ProfileEditSlots,
  type ProfileViewData,
} from "@/components/company/company-profile-view";
import {
  useUpdateCompanyProfile,
  useUploadProfileImage,
  type CompanyProfile,
  type CompanyProfileUpdate,
} from "@/hooks/use-company-profile";
import { companyApi } from "@/lib/company-auth/api";
import {
  clearProfileAboutDraft,
  readProfileAboutDraft,
  saveProfileAboutDraft,
  type ProfileAboutAiResult,
} from "@/lib/company/profile-about-draft";
import { PROFILE_IMAGE_LIMITS, resizeImageFile } from "@/lib/image-resize";
import { clampLinkInput, linkInputMaxLength, safeExternalUrl } from "@/lib/safe-url";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { Camera, GripVertical, ImagePlus, Loader2, Pencil, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const IMG_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_GALLERY = 12;
const LIMITS = COMPANY_PROFILE_LIMITS;

/**
 * Editörün taslak alanları — PATCH /company/profile'ın public profil alanları.
 * `visitsVisible` BİLİNÇLİ YOK (arayüz testi O-103): anahtar Ziyaret Edenler
 * sayfasında (`VisitsVisibilityCard`); burada kontrolü olmayan alanı yüklemedeki
 * değerle göndermek, başka sekmede/başka yöneticinin kapattığı ayarı geri açıyordu.
 */
interface Draft {
  publicEnabled: boolean;
  logoUrl: string;
  coverImageUrl: string;
  industry: string;
  aboutText: string;
  website: string;
  linkedinUrl: string;
  instagramUrl: string;
  employeeCount: string;
  foundedYear: string;
  services: string[];
  certifications: string[];
  certificateImages: string[];
}

function toDraft(p: CompanyProfile): Draft {
  return {
    publicEnabled: p.publicEnabled,
    logoUrl: p.logoUrl ?? "",
    coverImageUrl: p.coverImageUrl ?? "",
    industry: p.industry ?? "",
    aboutText: p.aboutText ?? "",
    website: p.website ?? "",
    linkedinUrl: p.linkedinUrl ?? "",
    instagramUrl: p.instagramUrl ?? "",
    employeeCount: p.employeeCount ?? "",
    foundedYear: p.foundedYear ? String(p.foundedYear) : "",
    services: p.services ?? [],
    certifications: p.certifications ?? [],
    certificateImages: p.certificateImages ?? [],
  };
}

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
const sameField = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Sunucudan yeni profil gelince taslağı YENİDEN TABANLA: kullanıcının
 * dokunmadığı alan (taslak = eski kayıt) yeni sunucu değerini alır, dokunduğu
 * alan korunur. Eskiden kirli taslak bütünüyle eski kalıyor ve Kaydet
 * başka sekmede değişen alanları da eski değerle eziyordu (arayüz testi O-103).
 */
function rebaseDraft(cur: Draft, prev: Draft, next: Draft): Draft {
  const out = { ...cur } as Record<keyof Draft, unknown>;
  for (const k of Object.keys(next) as (keyof Draft)[]) {
    if (sameField(cur[k], prev[k])) out[k] = next[k];
  }
  return out as unknown as Draft;
}

/**
 * Profilim — YERİNDE düzenleme (2026-08-22). Önizleme/Düzenle sekmeleri
 * kaldırıldı: kullanıcı profili başkalarının gördüğü düzende görür ve her
 * bölgeyi üstünde düzenler (kapak/logo hover-yükle, metin/künye inline,
 * hizmet/sertifika chip'leri; galeri KALDIRILDI 2026-09-10). Değişiklik taslakta
 * anında görünür; KAYDET tek PATCH (API değişmedi). Görseller yüklenmeden
 * tarayıcıda küçültülür (resizeImageFile). `canEdit=false` → salt görünüm.
 */
export function ProfileEditor({
  profile,
  canEdit,
}: {
  profile: CompanyProfile;
  canEdit: boolean;
}) {
  const t = useTranslations("web.panel.company.profileEditor");
  const update = useUpdateCompanyProfile();
  const locale = useLocale();
  const seoT = useSeoT();
  const [saved, setSaved] = useState<Draft>(() => toDraft(profile));
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Sunucudan yeni veri gelince (kayıt sonrası / başka sekme) taslağı
  // yeniden tabanla: kullanıcının değiştirdiği alanlar korunur, gerisi yenilenir.
  useEffect(() => {
    const next = toDraft(profile);
    const prev = savedRef.current;
    setSaved(next);
    setDraft(rebaseDraft(draftRef.current, prev, next));
  }, [profile]);
  const dirty = useMemo(() => !same(draft, saved), [draft, saved]);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  /**
   * "HAKKINDA" TASLAĞI SAYFADAN ÇIKINCA KAYBOLMAZ (canlı doğrulama PD-01).
   *
   * Aşağıdaki koruma bağlantı tıklamasını, yenilemeyi ve sekme kapatmayı sorar;
   * tarayıcının Geri düğmesini, dil değişimini ve bildirim tıklamasını sormaz.
   * O çıkışlarda AI taslağı — harcanan denemeyle birlikte — siliniyordu. Ortak
   * kanca DEĞİŞMEDİ; taslak sürekli `sessionStorage`a yazılır (kullanıcıya bağlı
   * anahtar, `lib/company/profile-about-draft.ts`) ve Profilim yeniden açılınca
   * geri yüklenir: kaydet çubuğu açık, kutunun altında tek satır not.
   *
   * Sonuç notu (ürünsüz yazıldı, kalan hak, "Önceki metne dön") da BURADA
   * yaşar ve taslakla birlikte saklanır: eskiden `AboutEditor`ın yerel
   * durumuydu ve Vazgeç kutuyu boşaltınca not altında kalıyordu (PD-05).
   *
   * NOT TASLAKLA YAŞAR, TASLAKLA GİDER (gözden geçirme REV-1): `aboutResult`
   * yalnız anlattığı AI taslağı kutuda KAYDEDİLMEMİŞ dururken vardır. Taslağın
   * kutudan çıktığı HER yol notu da siler — yalnız Vazgeç değil:
   *  - metin kayıtlı hâline döndü (elle silme / geri yazma, "Önceki metne dön",
   *    Kaydet, başka sekmede kayıt) → aşağıdaki tek kural;
   *  - "Önceki metne dön" kaydedilmemiş bir metne döndü → `onUndo`.
   * Eskiden yalnız Vazgeç siliyordu: "Önceki metne dön"den ya da kutuyu elle
   * boşalttıktan sonra "…taslak yalnız firma bilgilerinizden yazıldı…" notu
   * kayıtlı metnin / boş kutunun altında kalıyordu. Not bir kez gidince metin
   * yeniden değişse de geri gelmez (kutudaki artık o taslak değildir).
   */
  const { user } = useCompanyAuth();
  const userId = canEdit ? (user?.id ?? "") : "";
  const [aboutResult, setAboutResult] = useState<ProfileAboutAiResult | null>(null);
  const [aboutRestored, setAboutRestored] = useState(false);
  // Depo bir kez OKUNMADAN yazılmaz/silinmez (ilk çizimde taslak = kayıtlı;
  // yazma efekti saklanan taslağı okunmadan silerdi).
  const [aboutStoreRead, setAboutStoreRead] = useState(false);
  useEffect(() => {
    if (!userId || aboutStoreRead) return;
    const stored = readProfileAboutDraft(userId, profile.id);
    // Yalnız kutu KAYITLI metni gösterirken ve taslak ondan farklıyken: bu arada
    // yazılmış metin ezilmez, kaydedilmiş metnin aynısı "taslak" sayılmaz
    // (öyle bir kayıt aşağıdaki efektte silinir).
    if (
      stored &&
      stored.text !== savedRef.current.aboutText &&
      draftRef.current.aboutText === savedRef.current.aboutText
    ) {
      setDraft((d) => ({ ...d, aboutText: stored.text }));
      setAboutResult(stored.result);
      setAboutRestored(true);
    }
    setAboutStoreRead(true);
  }, [userId, aboutStoreRead, profile.id]);
  const aboutDirty = draft.aboutText !== saved.aboutText;
  // Çizim sırasında durum düzeltme (efekt değil): not tek kare bile bayat
  // çizilmez. Taslak ve notu HER ZAMAN aynı güncellemede yazılır (AI yanıtı,
  // geri yükleme), bu yüzden taze not burada yanlışlıkla silinmez.
  if (!aboutDirty && aboutResult) setAboutResult(null);
  // "Geri yüklendi" işareti de taslakla gider (canlı doğrulama PD-R1): metin
  // kayıtlı hâline döndüyse geri yüklenen taslak kutuda DEĞİLDİR. Eskiden
  // yalnız Kaydet / Vazgeç / yeni AI taslağı siliyordu; kutu elle boşaltılıp
  // yeni metin yazılınca "taslağınız geri yüklendi" notu taze metnin altında
  // yeniden çıkıyordu.
  if (!aboutDirty && aboutRestored) setAboutRestored(false);
  useEffect(() => {
    if (!userId || !aboutStoreRead) return;
    if (aboutDirty) saveProfileAboutDraft(userId, profile.id, { text: draft.aboutText, result: aboutResult });
    else clearProfileAboutDraft(userId);
  }, [userId, aboutStoreRead, profile.id, aboutDirty, draft.aboutText, aboutResult]);

  // Kaydedilmemiş değişiklikle sayfadan ayrılma uyarısı — sekme kapatma VE
  // uygulama içi bağlantı (ortak kanca; sayfada tek guard). Eskiden yalnız
  // `beforeunload` vardı: AI tanıtım taslağı kaydedilmemiş editör durumudur
  // (sunucu kopyasını tutmaz) ve hemen altındaki "Ürünleri yönet" bağlantısı
  // sormadan gidip taslağı — ömürlük ve günlük haktan biriyle birlikte — siliyordu.
  //
  // DİYALOGDA "AYRIL" = SAKLANAN TASLAK DA GİDER (canlı doğrulama PD-R3).
  // Diyalog "ayrılırsanız kaybolur" der; kullanıcı bunu onayladıysa Hakkında
  // metni dönüşte geri gelmemeli (geliyor, ikinci kez Vazgeç'e bastırıyordu).
  // Saklanan kopya yalnız diyaloğun SORULMADIĞI çıkışlar içindir (Geri düğmesi,
  // dil değişimi, bildirim tıklaması) — orada kullanıcı hiçbir şeyi onaylamadı.
  useUnsavedChangesGuard(dirty, { onDiscard: () => clearProfileAboutDraft(userId) });

  /** Alan anahtarı → etiket: istemci ve sunucu hataları alan adıyla basılır (D-054). */
  const fieldLabels: Record<string, string> = {
    industry: t("sektor"),
    aboutText: t("hakkinda"),
    website: t("webSitesi"),
    linkedinUrl: t("linkedin"),
    instagramUrl: t("instagram"),
    foundedYear: t("kurulusYili"),
    employeeCount: t("calisanSayisi"),
    services: t("hizmet"),
    publicEnabled: t("herkeseAcikProfil"),
  };

  const save = async () => {
    // YALNIZ DEĞİŞEN ALANLAR gider (O-103): başka sekmede/başka yöneticinin
    // değiştirdiği, burada dokunulmamış alan eski değerle ezilmesin.
    const changed = (k: keyof Draft) => !sameField(draft[k], saved[k]);
    const body: CompanyProfileUpdate = {};
    const tooLong: [string, number][] = [];
    const text = (k: "industry" | "aboutText", max: number) => {
      if (!changed(k)) return;
      if (draft[k].length > max) tooLong.push([fieldLabels[k]!, max]);
      body[k] = draft[k];
    };
    text("industry", LIMITS.industry);
    text("aboutText", LIMITS.aboutText);
    const links = [
      ["website", LIMITS.website],
      ["linkedinUrl", LIMITS.linkedinUrl],
      ["instagramUrl", LIMITS.instagramUrl],
    ] as const;
    for (const [k, max] of links) {
      if (!changed(k)) continue;
      const norm = draft[k].trim() ? safeExternalUrl(draft[k]) : "";
      if (norm === null) {
        toast.error(t("gecersizBaglantiYalnizHttpHttps"));
        return;
      }
      if (norm.length > max) tooLong.push([fieldLabels[k]!, max]);
      body[k] = norm;
    }
    if (tooLong.length > 0) {
      const [label, max] = tooLong[0]!;
      toast.error(t("alanCokUzun", { label, max }));
      return;
    }
    if (changed("foundedYear")) {
      const year = draft.foundedYear.trim();
      if (year && !/^\d{4}$/.test(year)) {
        toast.error(t("kurulusYili4HaneliOlmali"));
        return;
      }
      if (year && (Number(year) < LIMITS.foundedYearMin || Number(year) > LIMITS.foundedYearMax)) {
        toast.error(
          t("kurulusYiliAraligi", { min: String(LIMITS.foundedYearMin), max: String(LIMITS.foundedYearMax) }),
        );
        return;
      }
      // Boş yıl `null` (temizle): `undefined` JSON'dan düşüyor, servis
      // alanı hiç yazmıyor ve refetch eski yılı geri getiriyordu.
      body.foundedYear = year ? Number(year) : null;
    }
    if (changed("publicEnabled")) body.publicEnabled = draft.publicEnabled;
    if (changed("logoUrl")) body.logoUrl = draft.logoUrl;
    if (changed("coverImageUrl")) body.coverImageUrl = draft.coverImageUrl;
    if (changed("employeeCount")) body.employeeCount = draft.employeeCount;
    if (changed("services")) body.services = draft.services;
    try {
      if (Object.keys(body).length > 0) await update.mutateAsync(body);
      // Başarıda taslak = kayıtlı (çubuk hemen kapanır; refetch gelince de aynı kalır).
      setSaved(draft);
      // Kaydedilen metin artık taslak değil: saklanan kopya ve "geri yüklendi" notu gider.
      setAboutRestored(false);
      clearProfileAboutDraft(userId);
      toast.success(t("profilKaydedildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaydedilemedi"), fieldLabels));
    }
  };
  const discard = () => {
    setDraft(saved);
    // Taslakla birlikte notu da gider (PD-05: boş kutunun altında "taslak
    // firma bilgilerinizden yazıldı" kalıyordu) ve saklanan kopya silinir.
    setAboutResult(null);
    setAboutRestored(false);
    clearProfileAboutDraft(userId);
  };

  /**
   * LOGO/KAPAK ANINDA KAYDEDİLİR (2026-09-15, kullanıcı: "profil fotoğrafı
   * ekledim ama durmadı" · "kaydet en altta oluyor, görmedim bile").
   *
   * Eskiden yüklenen görsel yalnız TASLAĞA yazılıyordu; kalıcı olması için
   * sayfanın en altındaki çubuktan "Kaydet"e basmak gerekiyordu. Görsel seçmek
   * zaten bilinçli bir eylem ve kırpma penceresinin kendi "Kaydet"i var →
   * orada basılınca yalnız o alan sunucuya yazılır. Taslaktaki DİĞER
   * kaydedilmemiş değişikliklere dokunulmaz.
   */
  const persistImage = async (field: "logoUrl" | "coverImageUrl", url: string) => {
    await update.mutateAsync(field === "logoUrl" ? { logoUrl: url } : { coverImageUrl: url });
    setSaved((cur) => ({ ...cur, [field]: url }));
    setDraft((cur) => ({ ...cur, [field]: url }));
  };

  const viewData: ProfileViewData = {
    name: profile.name,
    rothernId: profile.rothernId,
    industry: draft.industry || null,
    activities: profile.activities,
    verified: profile.companyVerificationStatus === "VERIFIED",
    city: profile.city,
    country: profile.country,
    logoUrl: draft.logoUrl || null,
    coverImageUrl: draft.coverImageUrl || null,
    aboutText: draft.aboutText || null,
    services: draft.services,
    foundedYear: draft.foundedYear ? Number(draft.foundedYear) : null,
    employeeCount: draft.employeeCount || null,
    website: draft.website || null,
    linkedinUrl: draft.linkedinUrl || null,
    instagramUrl: draft.instagramUrl || null,
    trade: {
      legalName: profile.legalName,
      taxNumber: profile.taxNumber,
      taxOffice: profile.taxOffice,
      mersisNo: profile.mersisNo,
      tradeRegistryNo: profile.tradeRegistryNo,
      kepAddress: profile.kepAddress,
    },
  };

  const completeness = completenessOf(draft, profile);
  const seoEnrich = useAiSeoEnrich();
  // AI güçlendirme = API `assertAiAccess`in aynası: paket (Silver+) VE koltuk
  // (herhangi bir işlem izni). Yönetici hazır seti işlem izni taşımaz → düğme
  // açık görünüp 403 veriyordu (arayüz testi O-105). Rol kontrolü paket
  // kontrolünün İÇİNDE; neden ayrı metinle söylenir.
  const enrichTierOk = tierAtLeast(profile.tier, "SILVER");
  const enrichSeatOk = hasAnySeatPermission(user);
  // Ürünlerim kartı yalnız satış paneline girebilene (D-053: Satın Almacı
  // "Ürünleri yönet"e basıp "Satış paneline erişim yetkiniz yok"a düşüyordu).
  const canSeeSales = accessiblePortals(user).includes("satis");
  // Alıcının sizi BULMASI için gerekenler — kapı değil, rehber (backend'de
  // içerik kapısı yok; yayın anahtarı her pakete açık — 2026-09-06).
  // Beyanın GÖRÜNÜR kısmı, eksen başına iki dizi BİRLİKTE (2026-10-10): gizli
  // kodlar ve yalnız gizli bir seçimin atası olarak saklanmış sektör / aile
  // düşer — özet kartı, sayılar ve "kategori var mı" aynı kümeyi okur.
  const sellerDeclared = visibleCompanyCategorySelection(profile.sellerCategoryIds, profile.sellerSubCategoryIds);
  const buyerDeclared = visibleCompanyCategorySelection(profile.buyerCategoryIds, profile.buyerSubCategoryIds);
  const findability = {
    about: !!draft.aboutText.trim(),
    industry: !!draft.industry.trim(),
    // Yalnız GÖRÜNÜR beyan sayılır (2026-10-09): gizli bir dalın altındaki eski
    // kod özet kartında çizilmez; "en az 1 kategori" de onu tamam saymaz.
    category: sellerDeclared.mainIds.length + sellerDeclared.subIds.length > 0,
  };

  if (!canEdit) {
    return (
      <div className="space-y-4">
        <EditorHeader profile={profile} publicEnabled={saved.publicEnabled} onTogglePublic={undefined} canEdit={false} />
        <div className={FRAME}>
          <div className="min-w-0">
            <CompanyProfileView profile={viewData} layout="stacked" />
          </div>
          <aside className={RAIL}>
            <StatusCard pct={completeness.pct} missingKeys={completeness.missingKeys} findability={findability} />
            {canSeeSales ? <MyProductsCard /> : null}
          </aside>
        </div>
        <p className="text-xs text-zinc-400">{t("duzenlemeIcinFirmaYonetimiYetkisi")}</p>
      </div>
    );
  }

  const slots: ProfileEditSlots = {
    // SALT OKUNUR (v2 4c): eşleşmeyi belirleyen kategori/faaliyet beyanı TEK
    // yerde düzenlenir — Ayarlar → Firma Bilgileri. Aynı veriyi burada da
    // düzenletmek "iki yerden iki kayıt" hissi veriyordu (kullanıcı üç sayfa
    // arasında dolaşıyordu); Profilim gösterir, düzenlemeye yönlendirir.
    classification: <ClassificationSummary profile={profile} />,
    cover: (
      <CoverControls
        value={draft.coverImageUrl}
        onSave={(url) => persistImage("coverImageUrl", url)}
      />
    ),
    logo: <LogoControls value={draft.logoUrl} onSave={(url) => persistImage("logoUrl", url)} />,
    headline: (
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        <Input
          aria-label={t("sektor")}
          value={draft.industry}
          placeholder={t("sektorOrElektrikMalzemeleri")}
          onChange={(e) => set({ industry: e.target.value })}
          maxLength={LIMITS.industry}
          className="!w-64"
        />
        {/* Konum herkese açık profille AYNI çizim (son toparlama 2026-10-04):
            ülke bayrakla (ortak `CountryLabel`), şehir yanında — eskiden düz
            metin "Bursa, Türkiye" bayraksızdı. */}
        {profile.country ? <CountryLabel code={profile.country} size="md" className="font-medium text-zinc-800" /> : null}
        {profile.city ? (
          <span className="inline-flex items-center gap-1">
            <MapPinIcon aria-hidden className="size-4 text-zinc-400" />
            {cityDisplayName(profile.city, locale)}
          </span>
        ) : null}
        {profile.rothernId ? (
          <span className="tabular-nums text-xs text-zinc-400">{profile.rothernId}</span>
        ) : null}
      </div>
    ),
    stats: (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniField label={t("kurulusYili")}>
          <Input
            aria-label={t("kurulusYili")}
            inputMode="numeric"
            maxLength={4}
            value={draft.foundedYear}
            placeholder="2015"
            onChange={(e) => set({ foundedYear: e.target.value })}
          />
        </MiniField>
        <MiniField label={t("calisanSayisi")}>
          {/* KOVA SEÇİMİ (2026-09-07): eskiden serbest metindi ("50-100",
              "yaklaşık 30") ve ürün dizinindeki "Çalışan sayısı" süzgeci onu
              güvenilir kovalayamıyordu. Kolon `String` kaldı (migration yok);
              yeni kayıtlar bu dört etiketten birini yazar, eskiler
              `employeeBucket` ile ayrıştırılır.
              ESKİ DEĞER KAYBOLMAZ: listede yoksa kendi seçeneği olarak
              eklenir — kaydetmeden profil sessizce değişmesin. */}
          <Select
            aria-label={t("calisanSayisi")}
            value={draft.employeeCount}
            onChange={(e) => set({ employeeCount: e.target.value })}
          >
            <option value="">{t("secilmedi")}</option>
            {EMPLOYEE_BUCKET_LABELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
            {draft.employeeCount && !EMPLOYEE_BUCKET_LABELS.includes(draft.employeeCount) ? (
              <option value={draft.employeeCount}>{t("eskiKayit", { employeeCount: draft.employeeCount })}</option>
            ) : null}
          </Select>
        </MiniField>
        <MiniField label={t("webSitesi")}>
          <Input
            aria-label={t("webSitesi")}
            value={draft.website}
            placeholder={t("ornekfirmaCom")}
            maxLength={linkInputMaxLength(draft.website, LIMITS.website)}
            onChange={(e) => set({ website: clampLinkInput(e.target.value, LIMITS.website) })}
          />
        </MiniField>
        <MiniField label={t("linkedin")}>
          <Input
            aria-label={t("linkedin")}
            value={draft.linkedinUrl}
            placeholder={t("linkedinComCompany")}
            maxLength={linkInputMaxLength(draft.linkedinUrl, LIMITS.linkedinUrl)}
            onChange={(e) => set({ linkedinUrl: clampLinkInput(e.target.value, LIMITS.linkedinUrl) })}
          />
        </MiniField>
        <MiniField label={t("instagram")}>
          <Input
            aria-label={t("instagram")}
            value={draft.instagramUrl}
            placeholder={t("instagramCom")}
            maxLength={linkInputMaxLength(draft.instagramUrl, LIMITS.instagramUrl)}
            onChange={(e) => set({ instagramUrl: clampLinkInput(e.target.value, LIMITS.instagramUrl) })}
          />
        </MiniField>
      </div>
    ),
    about: (
      <AboutEditor
        value={draft.aboutText}
        industry={draft.industry}
        services={draft.services}
        verified={profile.companyVerificationStatus === "VERIFIED"}
        canSeeSales={canSeeSales}
        onChange={(aboutText) => set({ aboutText })}
        result={aboutResult}
        // Not yalnız kutu hâlâ kaydedilmemiş metni gösterirken: metin kayıtlı
        // hâline döndüyse (elle ya da "Önceki metne dön") geri yüklenen taslak kalmamıştır.
        restored={aboutRestored && aboutDirty}
        onAiDraft={(aboutText, result) => {
          set({ aboutText });
          setAboutResult(result);
          setAboutRestored(false);
          // Yazım birkaç saniye sürer; yanıt kullanıcı sayfadan ÇIKTIKTAN sonra
          // gelirse yukarıdaki güncellemeler boşa düşer ve saklama efekti
          // çalışmaz. Deneme harcandı: taslak burada doğrudan da saklanır,
          // dönüşte geri yüklenir.
          if (aboutText !== saved.aboutText) {
            saveProfileAboutDraft(userId, profile.id, { text: aboutText, result });
          }
        }}
        onUndo={() => {
          if (aboutResult?.previous == null) return;
          set({ aboutText: aboutResult.previous });
          // Taslak kutudan çıktı: notu da gider — dönülen metin kaydedilmemiş
          // olsa bile (kutu hâlâ "kirli", ama içindeki artık AI taslağı değil).
          setAboutResult(null);
        }}
      />
    ),
    services: (
      <ChipEditor
        ariaLabel={t("hizmet")}
        values={draft.services}
        placeholder={t("hizmetEkleEnterABas")}
        empty={t("henuzHizmetEklenmediNeYaptiginizi")}
        onChange={(services) => set({ services })}
        maxLength={COMPANY_SERVICE_MAX_LENGTH}
        maxItems={COMPANY_SERVICES_MAX}
      />
    ),
    // Galeri/Fotoğraflar slotu KALDIRILDI (2026-09-10, kullanıcı kararı).
  };

  return (
    <div className="space-y-4 pb-20">
      <EditorHeader
        profile={profile}
        publicEnabled={draft.publicEnabled}
        onTogglePublic={(v) => set({ publicEnabled: v })}
        canEdit
      />

      {/* YENİ DÜZEN (2026-09-10, kullanıcı kararı: "profil çok aşağıda
          kalıyor, analiz çok yukarıda"): SOLDA profil (başkalarının gördüğü
          hâli, tek sütun, yerinde düzenleme), SAĞDA yapışkan ray — profil
          durumu, arama görünürlüğü, ürünler, gizlilik. Ürün formuyla aynı
          kalıp. Dar ekranda ray profilin altına iner. */}
      <div className={FRAME}>
        <div className="min-w-0">
          <CompanyProfileView profile={viewData} edit={slots} layout="stacked" />
        </div>

        <aside className={RAIL}>
          <StatusCard pct={completeness.pct} missingKeys={completeness.missingKeys} findability={findability} />

          {/* ÜCRETSİZ DOĞRULAMA ÇAĞRISI (2026-09-15, kullanıcı kararı):
              doğrulamaya paket satarak değil ROZETLE teşvik ediyoruz — rozet
              `companyVerificationStatus`tan gelir ve ücretsiz pakette de
              görünür. Doğrulanmış firmada bu kart hiç çizilmez. Yalnız
              DÜZENLEME dalında: bağlantı (`/company/ayarlar/dogrulama`) da
              `company:manage` kapılı; salt-okunur kullanıcıya çizmek onu
              yetki ekranına düşürürdü (derin denetim S069). */}
          <VerificationCallout status={profile.companyVerificationStatus} />

          {/* ARAMA GÖRÜNÜRLÜĞÜ (SEO Parça 8) — parçacık `companySeo` şablonundan. */}
          <SearchVisibilityCard
            readiness={companySeoReadiness({
              aboutText: draft.aboutText,
              logoUrl: draft.logoUrl || null,
              coverImageUrl: draft.coverImageUrl || null,
              industry: draft.industry || null,
              city: profile.city,
              website: draft.website || null,
              linkedinUrl: draft.linkedinUrl || null,
              foundedYear: draft.foundedYear || null,
              employeeCount: draft.employeeCount || null,
              services: draft.services,
              certifications: draft.certifications,
              categoryCount:
                buyerDeclared.mainIds.length +
                sellerDeclared.mainIds.length +
                buyerDeclared.subIds.length +
                sellerDeclared.subIds.length,
            })}
            snippet={snippetFromMetadata(
              companySeo({
                // Önizleme firmanın KAYITLI adresini gösterir (kayıt denetimi
                // 2026-10 resignup-7): aynı adlı ikinci firma `…-2` alır; addan
                // yeniden üretilen adres öteki firmanın sayfasıydı. Henüz
                // yayınlanmamış profilde (slug yok) addan türetilen taslak.
                slug: profile.slug || generateSlug(profile.name) || "firma",
                name: profile.name,
                industry: draft.industry || null,
                city: profile.city,
                country: profile.country,
                aboutText: draft.aboutText || null,
                logoUrl: draft.logoUrl || null,
                coverImageUrl: draft.coverImageUrl || null,
                foundedYear: draft.foundedYear ? Number(draft.foundedYear) : null,
                employeeCount: draft.employeeCount || null,
                categories: [],
                certifications: draft.certifications,
                productCount: 0,
                website: draft.website || null,
                linkedinUrl: draft.linkedinUrl || null,
              }, { locale, t: seoT }).metadata,
            )}
            enrich={{
              available: enrichTierOk && enrichSeatOk,
              unavailableReason: enrichTierOk
                ? t("aiIleGuclendirmeIslemYetkisi")
                : t("aiIleGuclendirmeDogrulama"),
              run: () =>
                seoEnrich.mutateAsync({
                  kind: "company",
                  name: profile.name,
                  description: draft.aboutText,
                  facts: [
                    ...draft.services.map((s) => t("hizmetDeger", { value: s })),
                    ...draft.certifications.map((c) => t("sertifikaDeger", { value: c })),
                    ...(draft.foundedYear ? [t("kurulus", { foundedYear: draft.foundedYear })] : []),
                    ...(draft.employeeCount ? [t("calisan", { employeeCount: draft.employeeCount })] : []),
                  ],
                  city: profile.city,
                  industry: draft.industry || null,
                }),
              apply: (r) => {
                set({ aboutText: r.description });
                toast.success(t("taslakUygulandiKontrolEdipKaydet"));
              },
            }}
          />

          {canSeeSales ? <MyProductsCard /> : null}

          {/* Gizlilik anahtarı Ziyaret Edenler sayfasına TAŞINDI (2026-09-19,
              kullanıcı: "profil kısmında saçma duruyor") — `VisitsVisibilityCard`. */}
        </aside>
      </div>

      {/* Yapışkan kaydet çubuğu — yalnız kirliyken. */}
      {dirty ? (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-20 mb-0 border-t border-zinc-950/10 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur sm:pl-72"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 pr-16">
            {/* GERİ YÜKLENEN TASLAK ÇUBUKTA DA SÖYLENİR (canlı doğrulama PD-R4).
                Sayfa en üstten açılır; ayrıntılı not Hakkında kutusunun altında,
                görünür alanın dışındadır (1440×900'de y = 999 px; telefonda
                birkaç ekran aşağıda). Çubuk her zaman görünür: kullanıcı neden
                kaydedilmemiş değişiklik olduğunu indiği yerde okur. */}
            <p className="min-w-0 text-sm text-zinc-700">
              <span>{t("kaydedilmemisDegisikliklerVar")}</span>
              {aboutRestored && aboutDirty ? (
                <>
                  {" "}
                  <span className="font-medium text-zinc-900">{t("aboutAi.restoredBar")}</span>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-2">
              <Button plain onClick={discard} disabled={update.isPending}>
                {t("vazgec")}
              </Button>
              <Button onClick={() => void save()} disabled={update.isPending}>
                {update.isPending ? t("kaydediliyor") : t("kaydet")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- parçalar

/** Sayfa düzeni — sol profil + sağ yapışkan ray (xl altında alt alta). */
const FRAME = "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]";
const RAIL = "space-y-4 xl:sticky xl:top-20 xl:self-start";

function EditorHeader({
  profile,
  publicEnabled,
  onTogglePublic,
  canEdit,
}: {
  profile: CompanyProfile;
  publicEnabled: boolean;
  onTogglePublic?: (v: boolean) => void;
  /** Salt-okur kullanıcı (company:manage yok): düzenleme dili ve Firma Bilgileri bağlantısı çizilmez (D-052). */
  canEdit: boolean;
}) {
  const t = useTranslations("web.panel.company.profileEditor");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">{t("profilim")}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {canEdit ? t("firmaSayfanizBaskalarininGorduguHali") : t("firmaSayfanizSaltOkur")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Ticari kayıt (unvan/adres/VKN) AYRI sayfada ve KYC kilidine tabi
            (profile/settings split). Eskiden bu ayrım sayfanın en altındaki
            uzun bir notla anlatılıyordu; kullanıcı unvanını değiştirmek için
            nereye gideceğini bulamıyordu. Başlıkta ikincil bağlantı. Sayfa
            `company:manage` kapılı → salt-okur kullanıcıya çizilmez (D-052). */}
        {canEdit ? (
          <Link
            href="/company/ayarlar/firma"
            className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
          >
            {t("firmaBilgileriUnvanAdresVkn")}
          </Link>
        ) : null}
        {/* ÖNİZLEME PANEL İÇİNDE (2026-09-17, kullanıcı: "önizleme yapınca
            sistemden çıkıp anasayfaya dönüyor"): eskiden herkese açık
            /firma/<slug> yeni sekmede açılıyordu — pazarlama üst çubuğu
            (Giriş Yap / Kaydol) oturum kapanmış hissi veriyordu. Artık üyenin
            gördüğü profil sayfası (/company/firma/<RothernID>, aynı
            CompanyProfileView, panel kabuğu içinde) aynı sekmede açılır. */}
        {profile.rothernId ? (
          <Link
            href={`/company/firma/${profile.rothernId}`}
            className="text-sm font-medium text-zinc-600 underline hover:text-zinc-900"
          >
            {t("profilimiOnizle")}
          </Link>
        ) : null}
        {/* Salt-okurda anahtar ÇİZİLMEZ (D-138): pasif açık anahtar gri
            görünüp "kapalı" gibi okunuyordu — yalnız durum yazısı. */}
        {onTogglePublic ? (
          <label className="flex items-center gap-2 rounded-lg border border-zinc-950/10 bg-white px-3 py-1.5 text-sm">
            <span className={publicEnabled ? "text-emerald-700" : "text-zinc-600"}>
              {publicEnabled ? t("yayinda") : t("yayindaDegil")}
            </span>
            <Switch
              aria-label={t("herkeseAcikProfil")}
              checked={publicEnabled}
              onChange={(v: boolean) => onTogglePublic(v)}
            />
          </label>
        ) : (
          <span
            className={
              publicEnabled
                ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700"
                : "rounded-lg border border-zinc-950/10 bg-white px-3 py-1.5 text-sm text-zinc-600"
            }
          >
            {publicEnabled ? t("yayinda") : t("yayindaDegil")}
          </span>
        )}
      </div>
    </div>
  );
}

/** Ücretsiz doğrulama çağrısı — yalnız `company:manage`li düzenleme dalında çizilir. */
function VerificationCallout({ status }: { status: string }) {
  const t = useTranslations("web.panel.company.profileEditor");
  if (status === "VERIFIED") return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-sm font-semibold text-zinc-950">
        {t("ucretsizDogrulanin")}
      </p>
      <p className="mt-1 text-xs text-zinc-600">
        {status === "PENDING"
          ? t("belgelerinizInceleniyorSonucBildirilecek")
          : t("profilinizdeDogrulanmisRozetiGorunurVe")}
      </p>
      {status !== "PENDING" ? (
        <Link
          href="/company/ayarlar/dogrulama"
          className="mt-2 inline-flex text-sm font-semibold text-zinc-900 underline underline-offset-2"
        >
          {t("belgeleriYukle")}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * PROFİL DURUMU — sağ rayın ilk kartı: tamamlanma yüzdesi + çubuk, eksik
 * alan çipleri, "alıcıların sizi bulması için" rehberi. Kapı DEĞİL rehber:
 * backend'de içerik kapısı yok (yayın her pakete açık); olmayan bir kapıyı
 * "yayınlamak için" diye yazmak yalan olurdu.
 */
function StatusCard({
  pct,
  missingKeys,
  findability,
}: {
  pct: number;
  /** Eksik madde KODLARI (`profileCompleteness`); metin katalogdan. */
  missingKeys: ProfileCompletenessKey[];
  findability: { about: boolean; industry: boolean; category: boolean };
}) {
  const t = useTranslations("web.panel.company.profileEditor");
  const tItem = useTranslations("web.domain.profileItem");
  const missing = missingKeys.map((k) => tItem(k));
  const need: [string, boolean][] = [
    [t("hakkinda"), findability.about],
    [t("sektor"), findability.industry],
    [t("enAz1Kategori"), findability.category],
  ];
  return (
    <section aria-label={t("profilDurumu")} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-zinc-950/5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-950">{t("profilDurumu")}</h3>
        <p className="text-sm text-zinc-600" title={t("profilTamamlanma")}>
          {t.rich("yuzdeTamam", {
            pct,
            strong: (chunks) => (
              <span className={cn("text-lg font-semibold tabular-nums", pct === 100 ? "text-emerald-700" : "text-zinc-950")}>{chunks}</span>
            ),
          })}
        </p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100" aria-hidden>
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", pct === 100 ? "bg-emerald-500" : "bg-blue-600")}
          style={{ width: `${pct}%` }}
        />
      </div>
      {missing.length > 0 ? (
        <MissingFields className="mt-3" items={missing} />
      ) : (
        <p className="mt-3 text-xs text-emerald-700">{t("tumAlanlarDolu")}</p>
      )}
      {need.some(([, ok]) => !ok) ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-zinc-950/5 pt-3 text-xs text-zinc-500">
          <span className="font-medium text-zinc-600">{t("alicilarinSiziBulmasiIcin")}</span>
          {need.map(([label, ok]) => (
            <span key={label} className={ok ? "text-emerald-700 line-through decoration-emerald-300" : ""}>
              {ok ? "✓ " : "○ "}
              {label}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      {children}
    </div>
  );
}

/** Tek görsel seçme + küçültme + yükleme — kapak/logo ortak. */
function useImagePicker(kind: "logo" | "cover" | "gallery", onUrl: (url: string) => void) {
  const t = useTranslations("web.panel.company.profileEditor");
  const upload = useUploadProfileImage();
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = () => inputRef.current?.click();
  const handle = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    for (const f of list) {
      if (!IMG_MIME.includes(f.type)) {
        toast.error(t("jpegPngVeyaWebpYukleyin"));
        continue;
      }
      const lim = PROFILE_IMAGE_LIMITS[kind];
      try {
        const small = await resizeImageFile(f, { maxEdge: lim.maxEdge });
        if (small.size > lim.maxBytes) {
          toast.error(t("dosyaCokBuyukMaksMb", { round: Math.round(lim.maxBytes / 1024 / 1024) }));
          continue;
        }
        const url = await upload.mutateAsync({ file: small, kind });
        onUrl(url);
      } catch (err) {
        toast.error(extractErrorMessage(err, t("yuklenemedi")));
      }
    }
  };
  return { upload, inputRef, pick, handle };
}

/**
 * Logo/kapak seçici: dosya seç → KIRP VE ODAKLA penceresi → penceredeki
 * "Kaydet" yükler ve profile hemen yazar (`onSave`). Kaldırma da anında kaydedilir.
 */
function useCroppedImage(kind: "logo" | "cover", onSave: (url: string) => Promise<void>) {
  const t = useTranslations("web.panel.company.profileEditor");
  const upload = useUploadProfileImage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const label = kind === "logo" ? t("logo") : t("kapakGorseli");
  const pick = () => inputRef.current?.click();
  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!f) return;
    if (!IMG_MIME.includes(f.type)) {
      toast.error(t("jpegPngVeyaWebpYukleyin"));
      return;
    }
    setPending(f);
  };
  const confirm = async (cropped: File) => {
    const lim = PROFILE_IMAGE_LIMITS[kind];
    if (cropped.size > lim.maxBytes) {
      toast.error(t("dosyaCokBuyukMaksMb", { round: Math.round(lim.maxBytes / 1024 / 1024) }));
      throw new Error("too-large");
    }
    try {
      const url = await upload.mutateAsync({ file: cropped, kind });
      await onSave(url);
      setPending(null);
      toast.success(t("etiketKaydedildi", { label }));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("etiketKaydedilemedi", { label })));
      throw err;
    }
  };
  const remove = async () => {
    setRemoving(true);
    try {
      await onSave("");
      toast.success(t("kaldirildi", { label: label }));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaldirilamadi", { label: label })));
    } finally {
      setRemoving(false);
    }
  };
  const dialog = (
    <ImageCropDialog
      file={pending}
      aspect={kind === "logo" ? 1 : COVER_ASPECT}
      shape={kind === "logo" ? "rounded" : "rect"}
      title={kind === "logo" ? t("logoyuAyarla") : t("kapakGorseliniAyarla")}
      hint={
        kind === "cover"
          ? t("kapakEkranGenisligineGoreKenarlardan")
          : undefined
      }
      maxEdge={PROFILE_IMAGE_LIMITS[kind].maxEdge}
      onCancel={() => setPending(null)}
      onConfirm={confirm}
    />
  );
  const busy = upload.isPending || removing;
  return { inputRef, pick, onFiles, remove, busy, dialog };
}

/** Kapak kırpma oranı — profilde şerit olarak çizilir (telefonda ~3:1, masaüstünde daha geniş). */
const COVER_ASPECT = 4;

function CoverControls({ value, onSave }: { value: string; onSave: (url: string) => Promise<void> }) {
  const t = useTranslations("web.panel.company.profileEditor");
  const { inputRef, pick, onFiles, remove, busy, dialog } = useCroppedImage("cover", onSave);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label={t("kapakGorseliSec")}
        onChange={(e) => onFiles(e.target.files)}
      />
      {dialog}
      {value ? (
        // Tek "Düzenle" menüsü (v2 7g): kapakta iki, logoda iki ayrı overlay
        // düğme üst üste biniyordu.
        <div className="absolute bottom-3 right-3">
          <OverlayMenu
            label={t("kapagiDuzenle")}
            busy={busy}
            items={[
              { label: t("kapagiDegistir"), onClick: pick },
              { label: t("kapagiKaldir"), onClick: () => void remove(), danger: true },
            ]}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          // Telefonda yazı sağ üstte ve ipucusuz: ortalanmış uzun satır logoyla
          // çakışıyordu (D-138); sm+ ortada, ipucuyla.
          className="absolute inset-0 flex items-start justify-end gap-2 p-3 text-sm font-medium text-white/90 hover:bg-white/10 sm:items-center sm:justify-center sm:p-0"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {t("kapakGorseliEkle")} <span className="hidden text-white/60 sm:inline">{t("genisGorselMaks5mb")}</span>
        </button>
      )}
    </>
  );
}

function LogoControls({ value, onSave }: { value: string; onSave: (url: string) => Promise<void> }) {
  const t = useTranslations("web.panel.company.profileEditor");
  const { inputRef, pick, onFiles, remove, busy, dialog } = useCroppedImage("logo", onSave);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label={t("logoSec")}
        onChange={(e) => onFiles(e.target.files)}
      />
      {dialog}
      {value ? (
        <div className="absolute -bottom-1 -right-1">
          <OverlayMenu
            label={t("logoyuDuzenle")}
            busy={busy}
            compact
            items={[
              { label: t("logoyuDegistir"), onClick: pick },
              { label: t("logoyuKaldir"), onClick: () => void remove(), danger: true },
            ]}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          title={t("logoYukle")}
          aria-label={t("logoYukle")}
          className="absolute -bottom-1 -right-1 inline-flex size-8 items-center justify-center rounded-full bg-blue-600 text-white shadow ring-2 ring-white hover:bg-blue-700"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </button>
      )}
    </>
  );
}

/**
 * Kutunun büyüyebileceği en büyük yükseklik: görünür alanın %70'i, en az 240 px.
 * Üstünde metin kutunun İÇİNDE kayar (2000 karakterlik elle yazılmış bir
 * tanıtım sayfayı kutuya boğmasın).
 */
const ABOUT_MAX_VIEWPORT_RATIO = 0.7;
const ABOUT_MAX_HEIGHT_FLOOR = 240;

/**
 * Kutuyu İÇERİĞİNE göre boyutlandırır (PD-06): 390 px'te ~260 karakterlik
 * taslağın 9 satırından 5'i görünüyor, kullanıcı "kontrol edip kaydedin"
 * denen metnin yarısını kutu içinde kaydırarak okuyordu. Alt sınır `rows`
 * (5 satır: `height: auto` kutuyu ona indirir), üst sınır yukarıdaki tavan.
 * Ölçülemeyen kutuya (gizli / jsdom: scrollHeight 0) dokunulmaz.
 */
function fitAboutBox(el: HTMLTextAreaElement): void {
  // Ölçüm için kutu bir an 5 satıra iner. Sarmalayıcısının yüksekliği o an
  // sabitlenmezse sayfa kısalır ve sonuna yakın kaydırılmış görünüm zıplar.
  const wrap = el.parentElement;
  if (wrap) wrap.style.minHeight = `${wrap.offsetHeight}px`;
  el.style.height = "auto";
  const content = el.scrollHeight;
  if (content > 0) {
    // scrollHeight kenarlığı saymaz; kutu `border-box` olduğu için eklenir.
    const wanted = content + (el.offsetHeight - el.clientHeight);
    const max = Math.max(ABOUT_MAX_HEIGHT_FLOOR, Math.round(window.innerHeight * ABOUT_MAX_VIEWPORT_RATIO));
    el.style.height = `${Math.min(wanted, max)}px`;
    el.style.overflowY = wanted > max ? "auto" : "hidden";
  }
  if (wrap) wrap.style.minHeight = "";
}

/**
 * HAKKINDA KUTUSU + AI TANITIM ÖNERİSİ (sahip kararı 2026-10-08).
 *
 * AI artık web sitesini OKUMAZ ve yalnız tanıtım metnini yazar: firmanın
 * platformdaki verisinden (vitrindeki ürünler, sektör, hizmetler, faaliyet
 * tipi, kategoriler). Hizmet/yıl/sosyal bağlantı/logo alanlarına DOKUNMAZ,
 * site adresi sormaz. Kutu BOŞKEN öneri açıkça teklif edilir (başlıklı kart +
 * dolu düğme); doluyken aynı eylem sakin bir satırdır. Sonuç kutuya TASLAK
 * olarak yazılır — kullanıcı düzenler ve Kaydet'e basar; yerine yazılan önceki
 * metin "Önceki metne dön" ile geri gelir.
 *
 * Sektör ve hizmetler aynı taslakta düzenlendiği için GÖVDEDE gider: kullanıcı
 * onları kaydetmeden "yaz" derse sunucu DB'deki eski değeri okurdu.
 *
 * Sonuç notunun durumu ÜST bileşende (`ProfileEditor`): taslakla birlikte
 * saklanır / geri yüklenir (PD-01) ve taslak kutudan çıkınca — Vazgeç, Kaydet,
 * "Önceki metne dön", metnin kayıtlı hâline dönmesi — onunla birlikte silinir
 * (PD-05, REV-1).
 */
function AboutEditor({
  value,
  industry,
  services,
  verified,
  canSeeSales,
  onChange,
  result,
  restored,
  onAiDraft,
  onUndo,
}: {
  value: string;
  industry: string;
  services: string[];
  verified: boolean;
  canSeeSales: boolean;
  onChange: (v: string) => void;
  /** Son önerinin yan bilgisi: ürünsüz yazıldı mı, kalan hak, yerine yazılan metin. */
  result: ProfileAboutAiResult | null;
  /** Kutudaki metin önceki ziyaretten geri yüklenen kaydedilmemiş taslak mı. */
  restored: boolean;
  /** AI taslağı geldi: metin + sonuç notu birlikte. */
  onAiDraft: (text: string, result: ProfileAboutAiResult) => void;
  /** "Önceki metne dön". */
  onUndo: () => void;
}) {
  const t = useTranslations("web.panel.company.profileEditor");
  const [writing, setWriting] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  // Yanıt sayfadan çıkıldıktan sonra gelirse "taslak hazır" bildirimi başka
  // sayfada çıkmasın (taslak yine saklanır ve dönüşte geri yüklenir).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Kutu içeriğiyle büyür (PD-06): metin her değiştiğinde (AI taslağı, geri
  // yükleme, yazım, Vazgeç) ve satır kırılımını değiştiren genişlik / görünür
  // alan değişiminde yeniden ölçülür.
  useLayoutEffect(() => {
    if (boxRef.current) fitAboutBox(boxRef.current);
  }, [value]);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const refit = () => fitAboutBox(el);
    window.addEventListener("resize", refit);
    // Kutu genişliği pencere değişmeden de değişir (kenar çubuğu açılır/kapanır).
    // Yalnız GENİŞLİK değişimi yeniden ölçtürür: yüksekliği biz değiştiriyoruz.
    let width = el.clientWidth;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (el.clientWidth === width) return;
            width = el.clientWidth;
            refit();
          });
    observer?.observe(el);
    // Yazı tipi ilk ölçümden SONRA yüklenirse satır kırılımı değişir; kutu eski
    // yükseklikte kalıp son satırı kırpmasın.
    let active = true;
    void document.fonts?.ready.then(() => {
      if (active) refit();
    });
    return () => {
      active = false;
      window.removeEventListener("resize", refit);
      observer?.disconnect();
    };
  }, []);
  const empty = !value.trim();
  const write = async () => {
    if (writing) return;
    setWriting(true);
    try {
      const { data } = await companyApi.post<{
        aboutText: string;
        productCount: number;
        remainingSuggestions: number | null;
      }>(
        "/company/ai/profile-enrich",
        {
          industry: industry.trim().slice(0, LIMITS.industry),
          services: services.map((x) => x.slice(0, COMPANY_SERVICE_MAX_LENGTH)).slice(0, COMPANY_SERVICES_MAX),
        },
        // Hata TEK toast'ta ve sunucunun metniyle (hak doldu / günlük sınır / AI
        // şu an yanıt veremedi): interceptor ayrıca basarsa 5xx'te iki farklı
        // metin çıkıyordu (arayüz testi D-255).
        { timeout: 90_000, skipErrorToast: true },
      );
      onAiDraft(data.aboutText, {
        productCount: data.productCount,
        remaining: data.remainingSuggestions,
        previous: value.trim() ? value : null,
      });
      if (mountedRef.current) toast.success(t("taslakHazirKontrolEdipKaydet"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("aboutAi.failed")));
    } finally {
      setWriting(false);
    }
  };
  const label = (
    <>
      {writing ? <Loader2 data-slot="icon" className="animate-spin" /> : <Sparkles data-slot="icon" />}
      {writing ? t("aboutAi.writing") : empty ? t("aboutAi.write") : t("aboutAi.rewrite")}
    </>
  );
  // Boş kutuda dolu (birincil) düğme, dolu kutuda çerçeveli (ikincil) düğme.
  const button = empty ? (
    <Button onClick={() => void write()} disabled={writing}>
      {label}
    </Button>
  ) : (
    <Button outline onClick={() => void write()} disabled={writing}>
      {label}
    </Button>
  );
  // Not satırları. Hiçbiri yoksa kap da çizilmez: ürünlü, tam erişimli firmada
  // boş kutuya yazılan taslak BOŞ bir `role="status"` bırakıyordu (PD-05).
  const undoable = result?.previous != null;
  const noProducts = result?.productCount === 0;
  const remaining = result?.remaining ?? null;
  const hasNotes = restored || undoable || noProducts || remaining != null;
  return (
    <div className="space-y-2">
      {/* ÖNERİ METİN KUTUSUNUN ÜSTÜNDE: boş bir kutuya bakarken ilk görülmesi
          gereken şey "elle yazın" değil "sizin için yazalım mı". */}
      {empty ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3">
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-sm font-semibold text-zinc-950">{t("aboutAi.offerTitle")}</p>
            <p className="mt-0.5 text-xs text-zinc-600">{t("aboutAi.offerBody")}</p>
          </div>
          {button}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
          <p className="min-w-0 flex-1 basis-64 text-xs text-zinc-600">{t("aboutAi.rewriteHint")}</p>
          {button}
        </div>
      )}
      <Textarea
        ref={boxRef}
        aria-label={t("hakkinda")}
        rows={5}
        // Yükseklik içerikten gelir; elle boyutlandırma tutamağı onunla çekişirdi.
        resizable={false}
        value={value}
        placeholder={t("firmaniziKisacaTanitinNeUretir")}
        maxLength={LIMITS.aboutText}
        // Taslak yazılırken kutu kilitli: araya yazılan metin taslakla ezilip
        // "Önceki metne dön"de de bulunmazdı.
        disabled={writing}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Tavan DTO'yla aynı sabit (D-054); sayaç tavanı aşan metinde kırmızıya döner. */}
        <span
          className={cn("text-xs tabular-nums", value.length > LIMITS.aboutText ? "text-rose-700" : "text-zinc-500")}
        >
          {t("karakterSayaci", { n: value.length, max: LIMITS.aboutText })}
        </span>
      </div>
      {hasNotes ? (
        <div role="status" className="space-y-1 text-xs text-zinc-600">
          {restored ? <p className="font-medium text-zinc-800">{t("aboutAi.restored")}</p> : null}
          {undoable ? (
            <p>
              {t("aboutAi.undoHint")}{" "}
              <button
                type="button"
                className="font-semibold text-zinc-900 underline underline-offset-2"
                onClick={onUndo}
              >
                {t("aboutAi.undo")}
              </button>
            </p>
          ) : null}
          {noProducts ? (
            <p>
              {t("aboutAi.noProducts")}{" "}
              {canSeeSales ? (
                <Link
                  href="/company/satis/urunlerim"
                  className="font-semibold text-zinc-900 underline underline-offset-2"
                >
                  {t("urunleriYonet")}
                </Link>
              ) : null}
            </p>
          ) : null}
          {remaining != null ? (
            <p>
              {t("aboutAi.remaining", { n: remaining })}
              {verified ? null : <> {t("aboutAi.remainingVerify")}</>}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ChipEditor({
  ariaLabel,
  values,
  placeholder,
  empty,
  onChange,
  variant = "chips",
  maxLength,
  maxItems,
}: {
  ariaLabel: string;
  values: string[];
  placeholder: string;
  empty: string;
  onChange: (v: string[]) => void;
  variant?: "chips" | "list";
  /** Çip başına karakter tavanı — kayıt DTO'suyla aynı sabit (derin denetim S069). */
  maxLength?: number;
  /** Çip adedi tavanı — DTO `@ArrayMaxSize` ile aynı sabit. */
  maxItems: number;
}) {
  const t = useTranslations("web.panel.company.profileEditor");
  const [draft, setDraft] = useState("");
  // Eklenmeyen çip SESSİZ kalmaz (arayüz testi D-294): tekrar ve tavan ipucu.
  const [notice, setNotice] = useState<string | null>(null);
  const full = values.length >= maxItems;
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (full) {
      setNotice(t("enFazlaCip", { max: maxItems }));
      return;
    }
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setNotice(t("buCipZatenEkli", { v }));
      return;
    }
    if (maxLength != null && v.length > maxLength) return;
    onChange([...values, v]);
    setDraft("");
    setNotice(null);
  };
  return (
    <div className="space-y-2">
      {values.length === 0 ? (
        <p className="text-sm text-zinc-400">{empty}</p>
      ) : variant === "chips" ? (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1 text-sm font-medium text-zinc-700">
              {v}
              <button type="button" aria-label={t("kaldir", { v: v })} onClick={() => onChange(values.filter((x) => x !== v))} className="text-zinc-400 hover:text-zinc-700">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {values.map((v) => (
            <li key={v} className="flex items-center gap-2 text-sm text-zinc-700">
              <span className="flex size-5 items-center justify-center rounded-full bg-blue-600 text-xs text-white">✓</span>
              <span className="flex-1">{v}</span>
              <button type="button" aria-label={t("kaldir", { v: v })} onClick={() => onChange(values.filter((x) => x !== v))} className="text-zinc-400 hover:text-zinc-700">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={t("etiketEkle", { label: ariaLabel })}
          value={draft}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={full}
          onChange={(e) => {
            setDraft(e.target.value);
            setNotice(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button outline type="button" onClick={add} disabled={!draft.trim() || full}>
          <Plus data-slot="icon" />
          {t("ekle")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p role="status" className="text-amber-700">
          {notice ?? (full ? t("enFazlaCip", { max: maxItems }) : null)}
        </p>
        <span className="tabular-nums text-zinc-500">{t("cipSayaci", { n: values.length, max: maxItems })}</span>
      </div>
    </div>
  );
}

/** Galeri — ekle (çoklu), kaldır, sürükle-sırala (HTML5 DnD, kütüphanesiz). */
function GalleryEditor({
  label,
  kind,
  values,
  onChange,
  tile,
  hint,
}: {
  label: string;
  kind: "gallery";
  values: string[];
  onChange: (v: string[]) => void;
  tile: "wide" | "square";
  hint?: string;
}) {
  const t = useTranslations("web.panel.company.profileEditor");
  const { upload, inputRef, pick, handle } = useImagePicker(kind, (url) => {
    onChange([...latest.current, url].slice(0, MAX_GALLERY));
  });
  // Çoklu yüklemede ardışık onUrl çağrıları aynı "values" kopyasını ezmesin.
  const latest = useRef(values);
  latest.current = values;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= values.length || to >= values.length) return;
    const next = [...values];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</span>
        <span className="text-xs text-zinc-400">
          {values.length}/{MAX_GALLERY}
          {hint ? ` · ${hint}` : ""}
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label={t("sec", { label: label })}
        onChange={(e) => void handle(e.target.files)}
      />
      <div className={cn("grid gap-3", tile === "wide" ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3")}>
        {values.map((src, i) => (
          <div
            key={src}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIdx != null) move(dragIdx, i);
              setDragIdx(null);
            }}
            onDragEnd={() => setDragIdx(null)}
            className={cn(
              "group relative overflow-hidden rounded-xl ring-1 ring-zinc-950/5",
              tile === "wide" ? "aspect-[4/3]" : "aspect-square",
              dragIdx === i && "opacity-50",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${label} ${i + 1}`} className="h-full w-full object-cover" />
            <span className="absolute left-1.5 top-1.5 rounded bg-black/40 p-0.5 text-white opacity-0 transition group-hover:opacity-100" aria-hidden>
              <GripVertical className="size-3.5" />
            </span>
            <button
              type="button"
              aria-label={t("kaldir", { v: `${label} ${i + 1}` })}
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-zinc-700 shadow hover:bg-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        {values.length < MAX_GALLERY ? (
          <button
            type="button"
            onClick={pick}
            disabled={upload.isPending}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 text-xs font-medium text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-800",
              tile === "wide" ? "aspect-[4/3]" : "aspect-square",
            )}
          >
            {upload.isPending ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {upload.isPending ? t("yukleniyor") : t("ekle")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Taslak (düzenlenen) + profil (salt okunur alanlar) → ORTAK hesap. Pano
 * "Profil sağlığı" kartı aynı fonksiyonu API profiliyle çağırır; hesap tek
 * yerde (`lib/company/profile-completeness.ts`).
 */
function completenessOf(d: Draft, p: CompanyProfile) {
  // Dört dizi HAM verilir: görünürlük kuralı (gizli kod + yalnız gizli seçimin
  // atası olan sektör sayılmaz) hesabın kendisindedir.
  return profileCompleteness({
    ...d,
    city: p.city,
    buyerCategoryIds: p.buyerCategoryIds,
    sellerCategoryIds: p.sellerCategoryIds,
    buyerSubCategoryIds: p.buyerSubCategoryIds,
    sellerSubCategoryIds: p.sellerSubCategoryIds,
  });
}

/**
 * "Ürünlerim (N)" — Profilim sağ rayı. Europages'te profil = hakkında +
 * ürünler + iletişim; burada da yayındaki ilk 3 ürün + yönetim bağlantısı.
 * Veri panelin kendi katalog ucundan (herkese açık uç değil); N sunucunun
 * firma-geneli sayacı — Ürünlerim sekmesi ve pano kartıyla aynı sayı.
 */
function MyProductsCard() {
  const t = useTranslations("web.panel.company.profileEditor");
  // Süzgeç ve "en yeni üstte" SUNUCUDA (Ürünlerim "Yayında" sekmesiyle aynı
  // sorgu): katalog ucunun varsayılanı kullanım sıralı ilk 50 satırdı; talep
  // kalemi çok olan firmada vitrin ürünleri o 50'ye girmiyor, başlık "(5)"
  // derken gövde "Yayında ürün yok" diyordu.
  // YANIT GELMEDEN "YOK" DENMEZ (gözden geçirme REV-2 ile aynı kural): sayı ve
  // "Yayında ürün yok" yalnız BAŞARILI yanıtta. İskelet `isPending`e bağlı —
  // çevrimdışı cihazda sorgu duraklar (`isLoading` false, veri yok); liste
  // okunamadıysa (kesinti) kart yalnız başlık + yönetim bağlantısıyla kalır.
  // Eskiden iki durumda da "Ürünlerim (0)" + "Yayında ürün yok" çiziliyordu.
  const { data, isPending } = useShowcaseItems("", "published");
  const first = data?.pages[0];
  const published = (first?.items ?? []).filter((i) => i.isPublic).slice(0, 3);
  const n = first?.counts?.published ?? published.length;
  return (
    <section className="card p-6" aria-label={t("urunlerim")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">
          {first ? t("urunlerimSayili", { n }) : t("urunlerim")}
        </h2>
        <Link
          href="/company/satis/urunlerim"
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
        >
          {t("urunleriYonet")}
        </Link>
      </div>
      {isPending ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-zinc-100" aria-hidden />
      ) : !first ? null : published.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          {t("yayindaUrunYokVitrineCikan")}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-950/5">
          {published.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <Thumb src={p.thumbnailUrl} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">{p.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Faaliyet tipi + faaliyet kategorileri — Profilim'de SALT OKUNUR özet.
 * Veri Firma Bilgileri'ndekiyle aynı kayıttan; düzenleme oraya gider.
 * "Eksik: Faaliyet kategorileri" de aynı veriden beslenir.
 */
function ClassificationSummary({ profile }: { profile: CompanyProfile }) {
  const t = useTranslations("web.panel.company.profileEditor");
  const activityLabel = useActivityLabel();
  // Yalnız KULLANICININ SEÇTİKLERİ (CLAUDE.md kategori gösterim kuralı):
  // depoda ata zinciri de duruyor (segment + L2/L3); hepsi çip olsaydı tek
  // yaprak "(4)" ve dört çip görünürdü. Altında yaprağı olmayan ("Sektör
  // geneli") segmentler ayrıca eklenir.
  // Gizli bir dalın altındaki eski beyan (2026-10-09) ne çip ne de "(n)"
  // sayısına girer — sahibine de gösterilmez; yalnız gizli kodu olan firma
  // "seçilmedi" görür ve Firma Bilgileri'nden güncel bir kategori seçer.
  // Yalnız gizli bir seçimin atası olarak saklanmış sektör de "Sektör geneli"
  // çipi OLMAZ (2026-10-10, `visibleCompanyCategorySelection`).
  const ids = useMemo(() => {
    const declared = visibleCompanyCategorySelection(profile.sellerCategoryIds, profile.sellerSubCategoryIds);
    const leaves = deepestCategoryPicks(declared.subIds);
    const covered = new Set(leaves.map((id) => categorySegment(id)));
    const bareSegments = declared.mainIds.filter((id) => !covered.has(id));
    return [...bareSegments, ...leaves];
  }, [profile.sellerCategoryIds, profile.sellerSubCategoryIds]);
  const cats = useCategoriesByIds(ids);
  const names = ids
    .map((id) => cats.data?.find((c) => c.id === id)?.nameTr)
    .filter((n): n is string => !!n);
  return (
    <div className="space-y-4">
      <div>
        {/* Faaliyet tipi (üretici/toptancı…) — onboarding'deki "Firma türü"
            (hukuki yapı) DEĞİL (arayüz testi D-088). */}
        <p className="text-xs font-medium text-zinc-500">{t("faaliyetTipi")}</p>
        {profile.activities?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {profile.activities.map((code) => (
              <span
                key={code}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
              >
                {activityLabel(code)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-400">{t("secilmedi")}</p>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-zinc-500">
          {ids.length ? t("faaliyetKategorileriSayili", { n: ids.length }) : t("faaliyetKategorileri")}
        </p>
        {ids.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-400">
            {t("secilmediAcikTalepEslesmesiBu")}
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {names.slice(0, 8).map((n) => (
              <span
                key={n}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
              >
                {n}
              </span>
            ))}
            {ids.length > 8 ? <span className="text-xs text-zinc-400">+{ids.length - 8}</span> : null}
          </div>
        )}
      </div>
      <Link
        href="/company/ayarlar/firma#kategoriler"
        className="inline-flex items-center text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
      >
        {t("duzenleFirmaBilgileri")}
      </Link>
    </div>
  );
}

/**
 * Görsel üstü TEK menü — "Düzenle" düğmesi açılır: değiştir / kaldır.
 * Headless UI Menu (Catalyst ile aynı kütüphane); klavye ve odak yerleşik.
 */
function OverlayMenu({
  label,
  items,
  busy,
  compact,
}: {
  label: string;
  items: { label: string; onClick: () => void; danger?: boolean }[];
  busy?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("web.panel.company.profileEditor");
  return (
    <Menu>
      <MenuButton
        aria-label={label}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1.5 bg-white/95 text-xs font-medium text-zinc-800 shadow ring-1 ring-zinc-950/10 hover:bg-white",
          compact ? "size-8 justify-center rounded-full" : "rounded-md px-2.5 py-1.5",
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
        {compact ? null : t("duzenle")}
      </MenuButton>
      {/* modal={false}: Headless UI v2 varsayılanı sayfanın kalanını inert
          yapar (FilterSelect'teki ListboxOptions ile aynı karar). */}
      <MenuItems
        modal={false}
        anchor="bottom end"
        className="z-50 mt-1 w-44 rounded-xl border border-zinc-950/10 bg-white p-1 shadow-lg focus:outline-none"
      >
        {items.map((it) => (
          <MenuItem key={it.label}>
            <button
              type="button"
              onClick={it.onClick}
              className={cn(
                "block w-full rounded-lg px-2.5 py-1.5 text-left text-sm data-focus:bg-zinc-100",
                it.danger ? "text-rose-700" : "text-zinc-800",
              )}
            >
              {it.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
