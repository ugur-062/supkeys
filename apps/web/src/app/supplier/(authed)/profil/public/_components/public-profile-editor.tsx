"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useSupplierPublicProfile,
  useUpdateSupplierPublicProfile,
} from "@/hooks/use-supplier-profile";
import { cn } from "@/lib/utils";
import axios from "axios";
import {
  Award,
  ExternalLink,
  Globe,
  Instagram,
  Linkedin,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function PublicProfileEditor() {
  const { data, isLoading } = useSupplierPublicProfile();
  const update = useUpdateSupplierPublicProfile();

  const [slug, setSlug] = useState("");
  const [publicEnabled, setPublicEnabled] = useState(true);
  const [aboutText, setAboutText] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [newService, setNewService] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");

  // Backend'den veri gelince form state'i hidrate et
  useEffect(() => {
    if (!data) return;
    setSlug(data.slug ?? "");
    setPublicEnabled(data.publicEnabled);
    setAboutText(data.aboutText ?? "");
    setServices(data.services);
    setWebsite(data.website ?? "");
    setLinkedinUrl(data.linkedinUrl ?? "");
    setInstagramUrl(data.instagramUrl ?? "");
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
          <h2 className="font-display font-bold text-lg text-brand-900 mb-2">
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
    setSlug(data.slug ?? "");
    setPublicEnabled(data.publicEnabled);
    setAboutText(data.aboutText ?? "");
    setServices(data.services);
    setWebsite(data.website ?? "");
    setLinkedinUrl(data.linkedinUrl ?? "");
    setInstagramUrl(data.instagramUrl ?? "");
  };

  const onSubmit = async () => {
    try {
      await update.mutateAsync({
        slug,
        publicEnabled,
        aboutText,
        services,
        website,
        linkedinUrl,
        instagramUrl,
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

  return (
    <div className="space-y-5">
      {/* Yayındaki public link */}
      {slug && publicEnabled && (
        <PanelCard className="bg-brand-50/40 border-brand-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold text-brand-700">
                Herkese açık profil
              </p>
              <p className="font-display font-bold text-brand-900 mt-0.5 font-mono">
                /t/{slug}
              </p>
            </div>
            <Link
              href={`/t/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline font-medium"
            >
              Aç <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </PanelCard>
      )}

      {/* Slug + publicEnabled */}
      <PanelCard title="Temel Ayarlar" subtitle="URL slug ve görünürlük">
        <div className="space-y-4">
          <Field>
            <Label htmlFor="slug">Slug (URL)</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 whitespace-nowrap font-mono">
                supkeys.com/t/
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
                }
                placeholder="abc-tekstil"
                pattern="[a-z0-9-]*"
                maxLength={60}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Sadece küçük harf, rakam ve tire. Boş bırakırsanız profil
              yayından kalkar.
            </p>
          </Field>

          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-surface-border">
            <div>
              <p className="text-sm font-semibold text-brand-900">
                Profil yayında
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Kapalıyken /t/{slug || "slug"} sayfası 404 döner
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPublicEnabled((v) => !v)}
              aria-pressed={publicEnabled}
              aria-label="Profil yayında"
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                publicEnabled ? "bg-brand-600" : "bg-slate-300",
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                  publicEnabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        </div>
      </PanelCard>

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
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-brand-50 border border-brand-200 text-sm text-brand-700 font-medium"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => removeService(s)}
                    aria-label={`${s} etiketini kaldır`}
                    className="rounded-full hover:bg-brand-200 p-0.5"
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

      {/* Web ve sosyal medya */}
      <PanelCard
        title="Web ve Sosyal Medya"
        subtitle="https:// ile başlayan URL'ler"
      >
        <div className="space-y-4">
          <Field>
            <Label htmlFor="website">
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
            />
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

      {/* Cover/Gallery placeholder — Adım 4b */}
      <PanelCard title="Kapak Görseli ve Galeri" subtitle="Yakında">
        <p className="text-sm text-slate-500">
          Kapak görseli ve foto galerisi bir sonraki güncellemede aktif olacak.
          Şu an profilde varsayılan bir mavi gradient kapak görünür.
        </p>
      </PanelCard>

      {/* Submit */}
      <div className="flex items-center justify-end gap-2 sticky bottom-4 z-10 bg-white/90 backdrop-blur p-3 rounded-xl border border-surface-border shadow-card">
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
