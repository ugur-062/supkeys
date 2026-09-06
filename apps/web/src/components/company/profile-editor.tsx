"use client";

import { MissingFields } from "@/components/ui/missing-fields";
import { Thumb } from "@/components/ui/thumb";
import { useCatalogItems } from "@/hooks/use-company-items";
import { companyActivityLabel } from "@rothern/shared";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { profileCompleteness } from "@/lib/company/profile-completeness";
import Link from "next/link";
import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
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
} from "@/hooks/use-company-profile";
import { companyApi } from "@/lib/company-auth/api";
import { PROFILE_IMAGE_LIMITS, resizeImageFile } from "@/lib/image-resize";
import { safeExternalUrl } from "@/lib/safe-url";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { Camera, GripVertical, ImagePlus, Loader2, Pencil, Plus, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const IMG_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_GALLERY = 12;
const MAX_CHIPS = 20;

/** Editörün taslak alanları — PATCH /company/profile ile birebir (public profil alanları). */
interface Draft {
  publicEnabled: boolean;
  visitsVisible: boolean;
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
  photos: string[];
  certificateImages: string[];
}

function toDraft(p: CompanyProfile): Draft {
  return {
    publicEnabled: p.publicEnabled,
    visitsVisible: p.visitsVisible ?? true,
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
    photos: p.photos ?? [],
    certificateImages: p.certificateImages ?? [],
  };
}

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Profilim — YERİNDE düzenleme (2026-08-22). Önizleme/Düzenle sekmeleri
 * kaldırıldı: kullanıcı profili başkalarının gördüğü düzende görür ve her
 * bölgeyi üstünde düzenler (kapak/logo hover-yükle, metin/künye inline,
 * hizmet/sertifika chip'leri, galeri sürükle-sırala). Değişiklik taslakta
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
  const update = useUpdateCompanyProfile();
  const [saved, setSaved] = useState<Draft>(() => toDraft(profile));
  const [draft, setDraft] = useState<Draft>(() => toDraft(profile));
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Sunucudan yeni veri gelince (kayıt sonrası / başka sekme) taslak kirli
  // değilse senkronla; kirliyse kullanıcının değişikliği korunur.
  useEffect(() => {
    const next = toDraft(profile);
    const wasClean = same(draftRef.current, savedRef.current);
    setSaved(next);
    if (wasClean) setDraft(next);
  }, [profile]);
  const dirty = useMemo(() => !same(draft, saved), [draft, saved]);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Kaydedilmemiş değişiklikle sayfadan ayrılma uyarısı.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = async () => {
    const normWebsite = draft.website.trim() ? safeExternalUrl(draft.website) : "";
    const normLinkedin = draft.linkedinUrl.trim() ? safeExternalUrl(draft.linkedinUrl) : "";
    const normInstagram = draft.instagramUrl.trim() ? safeExternalUrl(draft.instagramUrl) : "";
    if (normWebsite === null || normLinkedin === null || normInstagram === null) {
      toast.error("Geçersiz bağlantı — yalnız http/https adresleri kabul edilir");
      return;
    }
    const year = draft.foundedYear.trim();
    if (year && !/^\d{4}$/.test(year)) {
      toast.error("Kuruluş yılı 4 haneli olmalı (ör. 2015)");
      return;
    }
    try {
      await update.mutateAsync({
        publicEnabled: draft.publicEnabled,
        visitsVisible: draft.visitsVisible,
        logoUrl: draft.logoUrl,
        coverImageUrl: draft.coverImageUrl,
        industry: draft.industry,
        aboutText: draft.aboutText,
        website: normWebsite,
        linkedinUrl: normLinkedin,
        instagramUrl: normInstagram,
        employeeCount: draft.employeeCount,
        foundedYear: year ? Number(year) : undefined,
        services: draft.services,
        certifications: draft.certifications,
        photos: draft.photos,
        certificateImages: draft.certificateImages,
      });
      // Başarıda taslak = kayıtlı (çubuk hemen kapanır; refetch gelince de aynı kalır).
      setSaved(draft);
      toast.success("Profil kaydedildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };
  const discard = () => setDraft(saved);

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
    certifications: draft.certifications,
    certificateImages: draft.certificateImages,
    photos: draft.photos,
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
  // Alıcının sizi BULMASI için gerekenler — kapı değil, rehber (backend'de
  // içerik kapısı yok; yayın anahtarı her pakete açık — 2026-09-06).
  const findability = {
    about: !!draft.aboutText.trim(),
    industry: !!draft.industry.trim(),
    category:
      (profile.sellerCategoryIds?.length ?? 0) + (profile.sellerSubCategoryIds?.length ?? 0) > 0,
  };

  if (!canEdit) {
    return (
      <div className="space-y-4">
        <EditorHeader
          profile={profile}
          publicEnabled={saved.publicEnabled}
          onTogglePublic={undefined}
          pct={completeness.pct}
          findability={findability}
        />
        <CompanyProfileView profile={viewData} />
        <p className="text-xs text-zinc-400">Düzenleme için firma yönetimi yetkisi gerekir.</p>
      </div>
    );
  }

  const slots: ProfileEditSlots = {
    // SALT OKUNUR (v2 4c): eşleşmeyi belirleyen kategori/faaliyet beyanı TEK
    // yerde düzenlenir — Ayarlar → Firma Bilgileri. Aynı veriyi burada da
    // düzenletmek "iki yerden iki kayıt" hissi veriyordu (kullanıcı üç sayfa
    // arasında dolaşıyordu); Profilim gösterir, düzenlemeye yönlendirir.
    classification: <ClassificationSummary profile={profile} />,
    aside: <MyProductsCard />,
    cover: (
      <CoverControls
        value={draft.coverImageUrl}
        onChange={(coverImageUrl) => set({ coverImageUrl })}
      />
    ),
    logo: <LogoControls value={draft.logoUrl} onChange={(logoUrl) => set({ logoUrl })} />,
    headline: (
      <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        <Input
          aria-label="Sektör"
          value={draft.industry}
          placeholder="Sektör (ör. Elektrik malzemeleri)"
          onChange={(e) => set({ industry: e.target.value })}
          className="!w-64"
        />
        <span>{[profile.city, profile.country].filter(Boolean).join(", ")}</span>
        {profile.rothernId ? (
          <span className="font-mono text-xs text-zinc-400">{profile.rothernId}</span>
        ) : null}
      </div>
    ),
    stats: (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MiniField label="Kuruluş yılı">
          <Input
            aria-label="Kuruluş yılı"
            inputMode="numeric"
            value={draft.foundedYear}
            placeholder="2015"
            onChange={(e) => set({ foundedYear: e.target.value })}
          />
        </MiniField>
        <MiniField label="Çalışan sayısı">
          <Input
            aria-label="Çalışan sayısı"
            value={draft.employeeCount}
            placeholder="50-100"
            onChange={(e) => set({ employeeCount: e.target.value })}
          />
        </MiniField>
        <MiniField label="Web sitesi">
          <Input
            aria-label="Web sitesi"
            value={draft.website}
            placeholder="ornekfirma.com"
            onChange={(e) => set({ website: e.target.value })}
          />
        </MiniField>
        <MiniField label="LinkedIn">
          <Input
            aria-label="LinkedIn"
            value={draft.linkedinUrl}
            placeholder="linkedin.com/company/…"
            onChange={(e) => set({ linkedinUrl: e.target.value })}
          />
        </MiniField>
        <MiniField label="Instagram">
          <Input
            aria-label="Instagram"
            value={draft.instagramUrl}
            placeholder="instagram.com/…"
            onChange={(e) => set({ instagramUrl: e.target.value })}
          />
        </MiniField>
      </div>
    ),
    about: (
      <AboutEditor
        value={draft.aboutText}
        website={draft.website}
        hasLogo={!!draft.logoUrl}
        onChange={(aboutText) => set({ aboutText })}
        onEnriched={(patch) => set(patch)}
      />
    ),
    services: (
      <ChipEditor
        ariaLabel="Hizmet"
        values={draft.services}
        placeholder="Hizmet ekle, Enter'a bas"
        empty="Henüz hizmet eklenmedi — ne yaptığınızı yazın."
        onChange={(services) => set({ services })}
      />
    ),
    certifications: (
      <div className="space-y-4">
        <ChipEditor
          ariaLabel="Sertifika"
          values={draft.certifications}
          placeholder="Sertifika ekle (ör. ISO 9001), Enter'a bas"
          empty="Henüz sertifika eklenmedi."
          onChange={(certifications) => set({ certifications })}
          variant="list"
        />
        <GalleryEditor
          label="Sertifika görselleri"
          kind="gallery"
          values={draft.certificateImages}
          onChange={(certificateImages) => set({ certificateImages })}
          tile="square"
        />
      </div>
    ),
    gallery: (
      <GalleryEditor
        label="Fotoğraflar"
        kind="gallery"
        values={draft.photos}
        onChange={(photos) => set({ photos })}
        tile="wide"
        hint="Tesis, ürün, ekip fotoğrafları — sürükleyerek sıralayın"
      />
    ),
  };

  return (
    <div className="space-y-4 pb-20">
      <EditorHeader
        profile={profile}
        publicEnabled={draft.publicEnabled}
        onTogglePublic={(v) => set({ publicEnabled: v })}
        pct={completeness.pct}
        findability={findability}
      />
      <MissingFields items={completeness.missing} />

      {/* Gizlilik: Ziyaret Edenler'de karşı tarafa görünürlük (2026-09-05).
          Kapalıysa görüntülemelerim yine sayılır ama adım yazılmaz. */}
      <label className="flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5">
        <input
          type="checkbox"
          checked={draft.visitsVisible}
          disabled={!canEdit}
          onChange={(e) => set({ visitsVisible: e.target.checked })}
          className="mt-0.5 size-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
        />
        <span className="text-sm">
          <span className="font-medium text-zinc-950">Ziyaretlerim karşı tarafa görünsün</span>
          <span className="mt-0.5 block text-xs text-zinc-500">
            İncelediğiniz firmalar, Ziyaret Edenler listesinde firmanızı adıyla görür. Kapatırsanız ziyaretiniz yalnız sayı olarak kalır.
          </span>
        </span>
      </label>

      <CompanyProfileView profile={viewData} edit={slots} />

      {/* Yapışkan kaydet çubuğu — yalnız kirliyken. */}
      {dirty ? (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-950/10 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur sm:pl-72"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 pr-16">
            <span className="text-sm text-zinc-700">Kaydedilmemiş değişiklikler var.</span>
            <div className="flex items-center gap-2">
              <Button plain onClick={discard} disabled={update.isPending}>
                Vazgeç
              </Button>
              <Button onClick={() => void save()} disabled={update.isPending}>
                {update.isPending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- parçalar

function EditorHeader({
  profile,
  publicEnabled,
  onTogglePublic,
  pct,
  findability,
}: {
  profile: CompanyProfile;
  publicEnabled: boolean;
  onTogglePublic?: (v: boolean) => void;
  pct: number;
  /** Alıcının sizi bulması için gerekenler — rehber, kapı değil. */
  findability: { about: boolean; industry: boolean; category: boolean };
}) {
  const need: [string, boolean][] = [
    ["Hakkında", findability.about],
    ["Sektör", findability.industry],
    ["En az 1 kategori", findability.category],
  ];
  return (
    <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Profilim</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Firma sayfanız — başkalarının gördüğü hâli, doğrudan üstünde düzenleyin, sonra Kaydet.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Ticari kayıt (unvan/adres/VKN) AYRI sayfada ve KYC kilidine tabi
            (profile/settings split). Eskiden bu ayrım sayfanın en altındaki
            uzun bir notla anlatılıyordu; kullanıcı unvanını değiştirmek için
            nereye gideceğini bulamıyordu. Başlıkta ikincil bağlantı. */}
        <Link
          href="/company/ayarlar/firma"
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
        >
          Firma bilgileri (unvan, adres, VKN)
        </Link>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
            pct === 100 ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-700",
          )}
          title="Profil tamamlanma"
        >
          %{pct} tamam
        </span>
        {/* Önizleme MEVCUT herkese açık rotaya gider (yeni rota yok); o rota
            yalnız yayındaki profili sunar — yayında değilken bağlantı yerine
            neden olmadığı söylenir. */}
        {profile.publicEnabled && profile.slug ? (
          <a
            href={`/firma/${profile.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-zinc-600 underline hover:text-zinc-900"
          >
            Herkese açık görünümü önizle
          </a>
        ) : (
          <span className="text-xs text-zinc-400" title="Herkese açık sayfa yalnız yayındayken sunulur">
            Önizleme yayına alınca
          </span>
        )}
        <label className="flex items-center gap-2 rounded-lg border border-zinc-950/10 bg-white px-3 py-1.5 text-sm">
          <span className={publicEnabled ? "text-emerald-700" : "text-zinc-600"}>
            {publicEnabled ? "Yayında" : "Yayında değil"}
          </span>
          <Switch
            aria-label="Herkese açık profil"
            checked={publicEnabled}
            disabled={!onTogglePublic}
            onChange={(v: boolean) => onTogglePublic?.(v)}
          />
        </label>
      </div>
    </div>
    {/* Kapı DEĞİL rehber: backend'de içerik kapısı yok (yayın her pakete
        açılır). Olmayan bir kapıyı "yayınlamak için" diye yazmak yalan olurdu;
        bunlar alıcının sizi bulmasını sağlayan üç alan. */}
    {need.some(([, ok]) => !ok) ? (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        <span className="font-medium text-zinc-600">Alıcıların sizi bulması için:</span>
        {need.map(([label, ok]) => (
          <span
            key={label}
            className={ok ? "text-emerald-700 line-through decoration-emerald-300" : ""}
          >
            {ok ? "✓ " : "○ "}
            {label}
          </span>
        ))}
      </p>
    ) : null}
    </div>
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
  const upload = useUploadProfileImage();
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = () => inputRef.current?.click();
  const handle = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    for (const f of list) {
      if (!IMG_MIME.includes(f.type)) {
        toast.error("JPEG, PNG veya WebP yükleyin");
        continue;
      }
      const lim = PROFILE_IMAGE_LIMITS[kind];
      try {
        const small = await resizeImageFile(f, { maxEdge: lim.maxEdge });
        if (small.size > lim.maxBytes) {
          toast.error(`Dosya çok büyük (maks. ${Math.round(lim.maxBytes / 1024 / 1024)}MB)`);
          continue;
        }
        const url = await upload.mutateAsync({ file: small, kind });
        onUrl(url);
      } catch (err) {
        toast.error(extractErrorMessage(err, "Yüklenemedi"));
      }
    }
  };
  return { upload, inputRef, pick, handle };
}

function CoverControls({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { upload, inputRef, pick, handle } = useImagePicker("cover", onChange);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label="Kapak görseli seç"
        onChange={(e) => void handle(e.target.files)}
      />
      {value ? (
        // Tek "Düzenle" menüsü (v2 7g): kapakta iki, logoda iki ayrı overlay
        // düğme üst üste biniyordu.
        <div className="absolute bottom-3 right-3">
          <OverlayMenu
            label="Kapağı düzenle"
            busy={upload.isPending}
            items={[
              { label: "Kapağı değiştir", onClick: pick },
              { label: "Kapağı kaldır", onClick: () => onChange(""), danger: true },
            ]}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={upload.isPending}
          className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium text-white/90 hover:bg-white/10"
        >
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          Kapak görseli ekle <span className="text-white/60">· 16:9, maks. 5MB</span>
        </button>
      )}
    </>
  );
}

function LogoControls({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { upload, inputRef, pick, handle } = useImagePicker("logo", onChange);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label="Logo seç"
        onChange={(e) => void handle(e.target.files)}
      />
      {value ? (
        <div className="absolute -bottom-1 -right-1">
          <OverlayMenu
            label="Logoyu düzenle"
            busy={upload.isPending}
            compact
            items={[
              { label: "Logoyu değiştir", onClick: pick },
              { label: "Logoyu kaldır", onClick: () => onChange(""), danger: true },
            ]}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={upload.isPending}
          title="Logo yükle"
          aria-label="Logo yükle"
          className="absolute -bottom-1 -right-1 inline-flex size-8 items-center justify-center rounded-full bg-zinc-900 text-white shadow ring-2 ring-white hover:bg-zinc-700"
        >
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </button>
      )}
    </>
  );
}

function AboutEditor({
  value,
  website,
  hasLogo,
  onChange,
  onEnriched,
}: {
  value: string;
  website: string;
  hasLogo: boolean;
  onChange: (v: string) => void;
  onEnriched: (patch: Partial<Draft>) => void;
}) {
  const [enriching, setEnriching] = useState(false);
  const [logoCandidate, setLogoCandidate] = useState<string | null>(null);
  const enrich = async () => {
    if (enriching) return;
    setEnriching(true);
    try {
      const { data } = await companyApi.post<{
        aboutText: string;
        services: string[];
        foundedYear: number | null;
        linkedinUrl: string | null;
        instagramUrl: string | null;
        logoCandidateUrl: string | null;
      }>("/company/ai/profile-enrich", {}, { timeout: 90_000 });
      onEnriched({
        aboutText: data.aboutText,
        ...(data.services.length > 0 ? { services: data.services } : {}),
        ...(data.foundedYear ? { foundedYear: String(data.foundedYear) } : {}),
        ...(data.linkedinUrl ? { linkedinUrl: data.linkedinUrl } : {}),
        ...(data.instagramUrl ? { instagramUrl: data.instagramUrl } : {}),
      });
      setLogoCandidate(data.logoCandidateUrl);
      toast.success("Taslak hazır — kontrol edip Kaydet'e basın");
    } catch (err) {
      toast.error(extractErrorMessage(err, "AI profil oluşturamadı — web sitenizi kontrol edin"));
    } finally {
      setEnriching(false);
    }
  };
  return (
    <div className="space-y-2">
      <Textarea
        aria-label="Hakkında"
        rows={5}
        value={value}
        placeholder="Firmanızı kısaca tanıtın — ne üretir/satar, kimlere, hangi bölgede…"
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-zinc-400">{value.length} karakter</span>
        <Button
          outline
          onClick={() => void enrich()}
          disabled={enriching || !website.trim()}
          title={website.trim() ? undefined : "Önce künyeye web sitesi adresini girin"}
        >
          {enriching ? <Loader2 data-slot="icon" className="animate-spin" /> : <Sparkles data-slot="icon" />}
          {enriching ? "Siteniz okunuyor…" : "Web sitemden AI ile doldur"}
        </Button>
      </div>
      {logoCandidate && !hasLogo ? (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoCandidate} alt="Sitenizde bulunan görsel" className="h-9 w-9 rounded bg-white object-contain ring-1 ring-zinc-200" />
          Sitenizde bir logo bulduk — indirip logo olarak yükleyebilirsiniz.
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
}: {
  ariaLabel: string;
  values: string[];
  placeholder: string;
  empty: string;
  onChange: (v: string[]) => void;
  variant?: "chips" | "list";
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v) || values.length >= MAX_CHIPS) return;
    onChange([...values, v]);
    setDraft("");
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
              <button type="button" aria-label={`${v} kaldır`} onClick={() => onChange(values.filter((x) => x !== v))} className="text-zinc-400 hover:text-zinc-700">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {values.map((v) => (
            <li key={v} className="flex items-center gap-2 text-sm text-zinc-700">
              <span className="flex size-5 items-center justify-center rounded-full bg-zinc-950 text-xs text-white">✓</span>
              <span className="flex-1">{v}</span>
              <button type="button" aria-label={`${v} kaldır`} onClick={() => onChange(values.filter((x) => x !== v))} className="text-zinc-400 hover:text-zinc-700">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          aria-label={`${ariaLabel} ekle`}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button outline type="button" onClick={add} disabled={!draft.trim()}>
          <Plus data-slot="icon" />
          Ekle
        </Button>
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
        aria-label={`${label} seç`}
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
              aria-label={`${label} ${i + 1} kaldır`}
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
            {upload.isPending ? "Yükleniyor…" : "Ekle"}
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
  return profileCompleteness({
    ...d,
    city: p.city,
    buyerCategoryIds: p.buyerCategoryIds,
    sellerCategoryIds: p.sellerCategoryIds,
  });
}

/**
 * "Ürünlerim (N)" — Profilim sağ kolonu. Europages'te profil = hakkında +
 * ürünler + iletişim; burada da yayındaki ilk 3 ürün + yönetim bağlantısı.
 * Veri panelin kendi katalog ucundan (herkese açık uç değil); N sunucunun
 * firma-geneli sayacı — Ürünlerim sekmesi ve pano kartıyla aynı sayı.
 */
function MyProductsCard() {
  const { data, isLoading } = useCatalogItems("");
  const published = (data?.items ?? []).filter((i) => i.isPublic).slice(0, 3);
  const n = data?.counts?.published ?? published.length;
  return (
    <section className="card p-6" aria-label="Ürünlerim">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">
          Ürünlerim{isLoading ? "" : ` (${n})`}
        </h2>
        <Link
          href="/company/satis/urunlerim"
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-900"
        >
          Ürünleri yönet
        </Link>
      </div>
      {isLoading ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-zinc-100" aria-hidden />
      ) : published.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          Yayında ürün yok — vitrine çıkan ürünler firma sayfanızda görünür ve
          açık talep eşleşmesini besler.
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
 * Firma türü + faaliyet kategorileri — Profilim'de SALT OKUNUR özet.
 * Veri Firma Bilgileri'ndekiyle aynı kayıttan; düzenleme oraya gider.
 * "Eksik: Faaliyet kategorileri" de aynı veriden beslenir.
 */
function ClassificationSummary({ profile }: { profile: CompanyProfile }) {
  const ids = [...(profile.sellerCategoryIds ?? []), ...(profile.sellerSubCategoryIds ?? [])];
  const cats = useCategoriesByIds(ids);
  const names = ids
    .map((id) => cats.data?.find((c) => c.id === id)?.nameTr)
    .filter((n): n is string => !!n);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-zinc-500">Firma türü</p>
        {profile.activities?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {profile.activities.map((code) => (
              <span
                key={code}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
              >
                {companyActivityLabel(code)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-400">Seçilmedi</p>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-zinc-500">
          Faaliyet kategorileri{ids.length ? ` (${ids.length})` : ""}
        </p>
        {ids.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-400">
            Seçilmedi — açık talep eşleşmesi bu seçime göre yapılır.
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
        Düzenle → Firma Bilgileri
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
        {compact ? null : "Düzenle"}
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
