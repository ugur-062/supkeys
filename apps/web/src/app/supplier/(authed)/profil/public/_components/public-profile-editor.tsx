"use client";

import { Checkbox } from "@/components/catalyst/checkbox";
import { PanelCard } from "@/components/supplier/panel-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useImportSupplierFromWebsite,
  useSupplierPublicProfile,
  useUpdateSupplierPublicProfile,
} from "@/hooks/use-supplier-profile";
import { cn } from "@/lib/utils";
import { CoverImageSection } from "./cover-image-section";
import { GallerySection } from "./gallery-section";
import { LogoImageSection } from "./logo-image-section";
import { generateSlug } from "@supkeys/shared";
import axios from "axios";
import {
  Award,
  ExternalLink,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function PublicProfileEditor() {
  const { data, isLoading } = useSupplierPublicProfile();
  const update = useUpdateSupplierPublicProfile();
  const importMutation = useImportSupplierFromWebsite();

  const [slug, setSlug] = useState("");
  const [publicEnabled, setPublicEnabled] = useState(true);
  const [aboutText, setAboutText] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [newService, setNewService] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [foundedYear, setFoundedYear] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [newCertification, setNewCertification] = useState("");
  const [mersisNo, setMersisNo] = useState("");
  const [publicShowTaxInfo, setPublicShowTaxInfo] = useState(false);
  const [publicShowMersis, setPublicShowMersis] = useState(false);

  // Backend'den veri gelince form state'i hidrate et
  useEffect(() => {
    if (!data) return;
    // Slug otomatik: şirket adından üretilir, düzenlenemez.
    setSlug(generateSlug(data.companyName).slice(0, 60));
    // Premium profil her zaman yayında — kapatma yok.
    setPublicEnabled(true);
    setAboutText(data.aboutText ?? "");
    setServices(data.services);
    setWebsite(data.website ?? "");
    setLinkedinUrl(data.linkedinUrl ?? "");
    setInstagramUrl(data.instagramUrl ?? "");
    setFoundedYear(data.foundedYear ? String(data.foundedYear) : "");
    setEmployeeCount(data.employeeCount ?? "");
    setCertifications(data.certifications);
    setMersisNo(data.mersisNo ?? "");
    setPublicShowTaxInfo(data.publicShowTaxInfo);
    setPublicShowMersis(data.publicShowMersis);
  }, [data]);

  if (isLoading) {
    return (
      <PanelCard>
        <div className="py-10 flex items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </PanelCard>
    );
  }
  if (!data) return null;

  // PREMIUM gating — STANDARD kullanıcı upgrade banner görür
  if (!data.isPremium) {
    return (
      <PanelCard>
        <div className="text-center py-10">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-yellow-50 border border-yellow-200 flex items-center justify-center mb-3">
            <Award className="h-6 w-6 text-yellow-600" />
          </div>
          <h2 className="font-semibold text-lg text-zinc-900 mb-2">
            PREMIUM gerekli
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-4">
            Herkese açık profil özelliği yalnızca PREMIUM üyelere açıktır.
            Google'da görünür olun, yeni alıcılarla bağlantı kurun.
          </p>
          <Link href="/supplier/ayarlar">
            <Button variant="primary" type="button">
              PREMIUM'a Yükselt
            </Button>
          </Link>
        </div>
      </PanelCard>
    );
  }

  const addService = () => {
    const v = newService.trim();
    if (!v || services.includes(v) || services.length >= 20) return;
    setServices((prev) => [...prev, v]);
    setNewService("");
  };
  const removeService = (s: string) => {
    setServices((prev) => prev.filter((x) => x !== s));
  };

  const resetForm = () => {
    if (!data) return;
    // Slug otomatik: şirket adından üretilir, düzenlenemez.
    setSlug(generateSlug(data.companyName).slice(0, 60));
    // Premium profil her zaman yayında — kapatma yok.
    setPublicEnabled(true);
    setAboutText(data.aboutText ?? "");
    setServices(data.services);
    setWebsite(data.website ?? "");
    setLinkedinUrl(data.linkedinUrl ?? "");
    setInstagramUrl(data.instagramUrl ?? "");
    setFoundedYear(data.foundedYear ? String(data.foundedYear) : "");
    setEmployeeCount(data.employeeCount ?? "");
    setCertifications(data.certifications);
    setMersisNo(data.mersisNo ?? "");
    setPublicShowTaxInfo(data.publicShowTaxInfo);
    setPublicShowMersis(data.publicShowMersis);
  };

  const addCertification = () => {
    const v = newCertification.trim();
    if (!v || certifications.includes(v) || certifications.length >= 20)
      return;
    setCertifications((prev) => [...prev, v]);
    setNewCertification("");
  };
  const removeCertification = (c: string) => {
    setCertifications((prev) => prev.filter((x) => x !== c));
  };

  const onSubmit = async () => {
    // Frontend pre-validation — backend reddetmeden önce kullanıcıya net
    // mesaj ver. Bunlar olmasa da backend yine validate eder; ama UX için
    // burada da kontrol önemli.
    const currentYear = new Date().getFullYear();
    const parsedYear = foundedYear.trim()
      ? parseInt(foundedYear.trim(), 10)
      : null;

    if (parsedYear !== null) {
      if (Number.isNaN(parsedYear)) {
        toast.error("Kuruluş yılı geçerli bir sayı olmalı");
        return;
      }
      if (parsedYear < 1800 || parsedYear > currentYear) {
        toast.error(
          `Kuruluş yılı 1800-${currentYear} arasında olmalı (veya boş bırakın)`,
        );
        return;
      }
    }

    const trimmedMersis = mersisNo.trim();
    if (trimmedMersis && trimmedMersis.length !== 10) {
      toast.error(
        "MERSİS numarası 10 haneli rakam olmalı (boş bırakabilirsiniz)",
      );
      return;
    }

    // Premium profilde web sitesi zorunlu — public profili onunla doldururuz.
    const trimmedSite = website.trim();
    if (!trimmedSite) {
      toast.error("Web sitesi linki zorunludur");
      return;
    }
    if (!/^https?:\/\//i.test(trimmedSite)) {
      toast.error("Web sitesi https:// ile başlamalı");
      return;
    }

    // URL alanlarını backend gönderirken: boşsa "" olarak gönder (service null'a çevirir);
    // doluysa trim ve protocol kontrolü kullanıcıya net hata verir.
    // aboutText/services hep gönder (boş = silindi anlamı taşır).
    try {
      await update.mutateAsync({
        slug: slug.trim(),
        publicEnabled: true,
        aboutText,
        services,
        website: website.trim(),
        linkedinUrl: linkedinUrl.trim(),
        instagramUrl: instagramUrl.trim(),
        foundedYear: parsedYear === null || Number.isNaN(parsedYear) ? null : parsedYear,
        employeeCount: employeeCount.trim(),
        certifications,
        mersisNo: mersisNo.trim(),
        publicShowTaxInfo,
        publicShowMersis,
      });
      toast.success("Profil güncellendi");
    } catch (err) {
      const raw = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : undefined;
      const msg = Array.isArray(raw)
        ? raw.join(", ")
        : (raw ?? "Güncelleme başarısız");
      toast.error(msg);
    }
  };

  const handleImport = async () => {
    const site = website.trim();
    if (!/^https?:\/\//i.test(site)) {
      toast.error("Önce geçerli bir web sitesi (https://...) girin");
      return;
    }
    try {
      const res = await importMutation.mutateAsync(site);
      const got = [
        res.imported.logo ? "logo" : null,
        res.imported.cover ? "kapak" : null,
        res.imported.about ? "açıklama" : null,
        res.imported.services ? "hizmetler" : null,
        res.imported.social ? "sosyal linkler" : null,
        res.imported.gallery > 0 ? `${res.imported.gallery} galeri fotoğrafı` : null,
      ].filter(Boolean);
      toast.success(
        got.length > 0
          ? `✓ Web sitenizden entegre edildi: ${got.join(", ")}`
          : "Web sitesinde uygun görsel/bilgi bulunamadı",
      );
    } catch (err) {
      const msg =
        axios.isAxiosError(err) &&
        (err.response?.data as { message?: string } | undefined)?.message;
      toast.error(msg || "Web sitesinden çekilemedi");
    }
  };

  return (
    <div className="space-y-5">
      {/* Web sitesinden otomatik doldur */}
      <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-zinc-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900">
              Web sitenizden otomatik doldur
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Logo, kapak ve açıklamayı web sitenizden çekeriz. Aşağıdaki "Web
              Sitesi" alanına adresinizi girip butona basın.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleImport}
            loading={importMutation.isPending}
            disabled={importMutation.isPending}
            className="shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            Otomatik Doldur
          </Button>
        </div>
      </div>
      {/* Hero — sade tek satır: avatar + identity + status + Profili Aç */}
      <div className="bg-white rounded-xl border border-surface-border shadow-sm p-4 md:p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div
            className={cn(
              "w-14 h-14 rounded-xl shrink-0",
              "bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-700",
              "flex items-center justify-center text-lg font-bold font-display",
            )}
            aria-hidden
          >
            {initials(data.companyName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-base md:text-lg text-zinc-900 truncate">
                {data.companyName}
              </h2>
              <StatusBadge slug={slug} publicEnabled={publicEnabled} />
            </div>
            {slug ? (
              <p className="font-mono text-xs md:text-sm text-slate-500 mt-0.5 break-all">
                supkeys.com/{slug}
              </p>
            ) : (
              <p className="text-xs md:text-sm text-slate-500 mt-0.5">
                Aşağıdan slug ata; profilinin herkese açık URL'i bu olur.
              </p>
            )}
          </div>
          {slug && publicEnabled && (
            <Link
              href={`/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button type="button" variant="primary" size="sm">
                <ExternalLink className="h-3.5 w-3.5" /> Profili Aç
              </Button>
            </Link>
          )}
        </div>
      </div>


      {/* Hakkımızda */}
      <PanelCard title="Hakkımızda" subtitle="Maks. 2000 karakter">
        <Textarea
          rows={6}
          value={aboutText}
          onChange={(e) => setAboutText(e.target.value)}
          maxLength={2000}
          placeholder="Firmanızı, deneyiminizi ve uzmanlık alanlarınızı kısaca anlatın."
        />
        <p className="text-xs text-slate-400 mt-1 text-right">
          {aboutText.length}/2000
        </p>
      </PanelCard>

      {/* Hizmetler */}
      <PanelCard title="Hizmetler" subtitle="Maks. 20 etiket">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 min-h-[2rem]">
            {services.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz etiket eklenmedi.</p>
            ) : (
              services.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-zinc-50 border border-zinc-200 text-sm text-zinc-700 font-medium"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeService(s)}
                    aria-label={`${s} etiketini kaldır`}
                    className="rounded-full hover:bg-zinc-200 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newService}
              onChange={(e) => setNewService(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addService();
                }
              }}
              placeholder="örn. Hazır Giyim, Tekstil Boyama"
              maxLength={40}
              disabled={services.length >= 20}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={addService}
              disabled={!newService.trim() || services.length >= 20}
            >
              <Plus className="h-4 w-4" /> Ekle
            </Button>
          </div>
        </div>
      </PanelCard>

      {/* Firma detayları — kuruluş, ekip, sertifikalar */}
      <PanelCard
        title="Firma Detayları"
        subtitle="Hero'da ve detaylar bölümünde gösterilir"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field>
              <Label htmlFor="foundedYear">Kuruluş Yılı</Label>
              <Input
                id="foundedYear"
                type="number"
                inputMode="numeric"
                min={1800}
                max={new Date().getFullYear()}
                value={foundedYear}
                onChange={(e) => setFoundedYear(e.target.value)}
                placeholder="örn. 1995"
              />
              <p className="text-xs text-slate-500 mt-1">
                Profilde &ldquo;{new Date().getFullYear() - 1995} yıllık tecrübe&rdquo; etiketi
                oluşturur.
              </p>
            </Field>
            <Field>
              <Label htmlFor="employeeCount">Çalışan Sayısı</Label>
              <Input
                id="employeeCount"
                value={employeeCount}
                onChange={(e) => setEmployeeCount(e.target.value)}
                placeholder="örn. 50-100 veya 10'dan az"
                maxLength={40}
              />
            </Field>
          </div>

          <div className="space-y-3">
            <Label>Sertifikalar / Ödüller (maks. 20)</Label>
            <div className="flex flex-wrap gap-2 min-h-[2rem]">
              {certifications.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Henüz sertifika eklenmedi (örn. ISO 9001, OEKO-TEX, CE).
                </p>
              ) : (
                certifications.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-medium"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => removeCertification(c)}
                      aria-label={`${c} sertifikasını kaldır`}
                      className="rounded-full hover:bg-emerald-200 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCertification}
                onChange={(e) => setNewCertification(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCertification();
                  }
                }}
                placeholder="örn. ISO 9001:2015, OEKO-TEX Standard 100"
                maxLength={60}
                disabled={certifications.length >= 20}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addCertification}
                disabled={
                  !newCertification.trim() || certifications.length >= 20
                }
              >
                <Plus className="h-4 w-4" /> Ekle
              </Button>
            </div>
          </div>
        </div>
      </PanelCard>

      {/* V2-TRUST — Tescil ve Doğrulama */}
      <TrustVerificationSection
        companyType={data.companyType}
        taxNumber={data.taxNumber}
        taxOffice={data.taxOffice}
        mersisNo={mersisNo}
        onMersisNoChange={setMersisNo}
        publicShowTaxInfo={publicShowTaxInfo}
        onPublicShowTaxInfoChange={setPublicShowTaxInfo}
        publicShowMersis={publicShowMersis}
        onPublicShowMersisChange={setPublicShowMersis}
      />

      {/* Web ve sosyal medya */}
      <PanelCard
        title="Web ve Sosyal Medya"
        subtitle="https:// ile başlayan URL'ler"
      >
        <div className="space-y-4">
          <Field>
            <Label htmlFor="website" required>
              <span className="inline-flex items-center gap-2">
                <Globe className="h-4 w-4 text-slate-400" /> Web Sitesi
              </span>
            </Label>
            <Input
              id="website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://www.firma.com"
              hasError={!website.trim()}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Zorunlu — herkese açık profilinizi bu adresten otomatik
              doldurabilirsiniz.
            </p>
          </Field>
          <Field>
            <Label htmlFor="linkedin">
              <span className="inline-flex items-center gap-2">
                <Linkedin className="h-4 w-4 text-slate-400" /> LinkedIn
              </span>
            </Label>
            <Input
              id="linkedin"
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/company/..."
            />
          </Field>
          <Field>
            <Label htmlFor="instagram">
              <span className="inline-flex items-center gap-2">
                <Instagram className="h-4 w-4 text-slate-400" /> Instagram
              </span>
            </Label>
            <Input
              id="instagram"
              type="url"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              placeholder="https://instagram.com/..."
            />
          </Field>
        </div>
      </PanelCard>

      {/* Logo (profil resmi) */}
      <LogoImageSection
        logoImageUrl={data.logoImageUrl}
        initials={initials(data.companyName)}
      />

      {/* Kapak görseli */}
      <CoverImageSection coverImageUrl={data.coverImageUrl} />

      {/* Galeri */}
      <GallerySection photos={data.photos} />

      {/* Submit */}
      <div className="flex items-center justify-end gap-2 sticky bottom-4 z-10 bg-white/90 backdrop-blur p-3 rounded-xl border border-surface-border shadow-sm">
        <Button variant="secondary" type="button" onClick={resetForm}>
          Sıfırla
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={onSubmit}
          disabled={update.isPending}
        >
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Kaydet
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Hero helper'ları
// ============================================================

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function StatusBadge({
  slug,
  publicEnabled,
}: {
  slug: string;
  publicEnabled: boolean;
}) {
  if (slug && publicEnabled) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-success-50 border border-success-500/20 text-xs font-semibold text-success-700">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-success-500"
        />
        Yayında
      </span>
    );
  }
  if (slug && !publicEnabled) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
        Yayın Dışı
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700">
      Slug bekliyor
    </span>
  );
}

// ============================================================
// V2-TRUST — Tescil ve Doğrulama section'ı
// ============================================================

function TrustVerificationSection({
  companyType,
  taxNumber,
  taxOffice,
  mersisNo,
  onMersisNoChange,
  publicShowTaxInfo,
  onPublicShowTaxInfoChange,
  publicShowMersis,
  onPublicShowMersisChange,
}: {
  companyType: "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";
  taxNumber: string;
  taxOffice: string;
  mersisNo: string;
  onMersisNoChange: (v: string) => void;
  publicShowTaxInfo: boolean;
  onPublicShowTaxInfoChange: (v: boolean) => void;
  publicShowMersis: boolean;
  onPublicShowMersisChange: (v: boolean) => void;
}) {
  const isSoleProp = companyType === "SOLE_PROPRIETOR";

  return (
    <PanelCard
      title="Tescil ve Doğrulama"
      subtitle="Vergi numarası ve MERSİS bilgilerinin gösterimi"
    >
      {isSoleProp ? (
        // Şahıs işletmesi — KVKK info banner, hiçbir alan paylaşılamaz
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Shield className="h-4 w-4 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-amber-900 text-sm">
              Şahıs İşletmesi — KVKK koruması
            </h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Şahıs işletmelerinde vergi numarası kişinin TC kimlik
              numarasıdır. Kişisel veri olduğu için herkese açık profilde
              paylaşılması KVKK'ya aykırıdır. Bu nedenle vergi numarası ve
              MERSİS alanları otomatik kapalıdır. Rothern onay sürecinden
              geçtiğin için profilinde otomatik &ldquo;Doğrulanmış
              İşletme&rdquo; rozetin görünür; ayrıca &ldquo;Şahıs
              İşletmesi&rdquo; rozeti de eklenir.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Vergi no + dairesi — read-only, opt-in toggle */}
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field>
                <Label>Vergi Numarası</Label>
                <Input value={taxNumber} disabled readOnly />
              </Field>
              <Field>
                <Label>Vergi Dairesi</Label>
                <Input value={taxOffice} disabled readOnly />
              </Field>
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Kayıt sırasında verildi, buradan değiştirilemez.
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-900">
              <Checkbox
                checked={publicShowTaxInfo}
                onChange={(checked) => onPublicShowTaxInfoChange(checked)}
              />
              <span>
                Vergi numarası ve vergi dairesini herkese açık profilde göster
              </span>
            </div>
          </div>

          {/* MERSİS no + opt-in toggle */}
          <div className="pt-4 border-t border-surface-border">
            <Field>
              <Label htmlFor="mersisNo">MERSİS Numarası</Label>
              <Input
                id="mersisNo"
                value={mersisNo}
                onChange={(e) =>
                  onMersisNoChange(
                    e.target.value.replace(/\D/g, "").slice(0, 10),
                  )
                }
                placeholder="10 haneli MERSİS no"
                maxLength={10}
                inputMode="numeric"
              />
              <p className="text-xs text-slate-500 mt-1">
                Boş bırakırsan profilde gösterilmez.
              </p>
            </Field>
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-900">
              <Checkbox
                checked={publicShowMersis}
                onChange={(checked) => onPublicShowMersisChange(checked)}
                disabled={!mersisNo}
              />
              <span>MERSİS numarasını herkese açık profilde göster</span>
            </div>
          </div>

          <Alert variant="success" title="Bilgi">
            &ldquo;Doğrulanmış İşletme&rdquo; rozeti Rothern onay sürecinden
            geçtiğin için profilinde otomatik görünür. Buradaki seçimler sadece
            vergi numarası ve MERSİS bilgilerinin herkese açık profilde
            gösterilip gösterilmeyeceğini belirler.
          </Alert>
        </div>
      )}
    </PanelCard>
  );
}
