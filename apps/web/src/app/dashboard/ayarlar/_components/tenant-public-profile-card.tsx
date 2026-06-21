"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useImportFromWebsite,
  useRemoveTenantCover,
  useRemoveTenantLogo,
  useTenantPublicProfile,
  useUpdateTenantPublicProfile,
  useUploadTenantCover,
  useUploadTenantLogo,
} from "@/hooks/use-tenant-public-profile";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  ExternalLink,
  Globe,
  ImagePlus,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface DraftState {
  aboutText: string;
  website: string;
  linkedinUrl: string;
  instagramUrl: string;
  foundedYear: string;
  employeeCount: string;
  services: string[];
  certifications: string[];
}

export function TenantPublicProfileCard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading } = useTenantPublicProfile();
  const updateMutation = useUpdateTenantPublicProfile();
  const uploadLogo = useUploadTenantLogo();
  const uploadCover = useUploadTenantCover();
  const removeLogo = useRemoveTenantLogo();
  const removeCover = useRemoveTenantCover();
  const importMutation = useImportFromWebsite();

  const [draft, setDraft] = useState<DraftState>({
    aboutText: "",
    website: "",
    linkedinUrl: "",
    instagramUrl: "",
    foundedYear: "",
    employeeCount: "",
    services: [],
    certifications: [],
  });

  useEffect(() => {
    if (data) {
      setDraft({
        aboutText: data.aboutText ?? "",
        website: data.website ?? "",
        linkedinUrl: data.linkedinUrl ?? "",
        instagramUrl: data.instagramUrl ?? "",
        foundedYear: data.foundedYear ? String(data.foundedYear) : "",
        employeeCount: data.employeeCount ?? "",
        services: data.services ?? [],
        certifications: data.certifications ?? [],
      });
    }
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Yükleniyor…
      </div>
    );
  }

  const publicUrl = `/firma/${data.slug}`;

  const togglePublic = async (next: boolean) => {
    try {
      await updateMutation.mutateAsync({ publicEnabled: next });
      toast.success(next ? "Public profil açıldı" : "Public profil kapatıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  const handleImport = async () => {
    const site = draft.website.trim();
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
        res.imported.social ? "sosyal linkler" : null,
      ].filter(Boolean);
      toast.success(
        got.length > 0
          ? `✓ Web sitenizden entegre edildi: ${got.join(", ")}`
          : "Web sitesinde uygun görsel/bilgi bulunamadı",
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Web sitesinden çekilemedi"));
    }
  };

  const handleSave = async () => {
    const year = draft.foundedYear.trim()
      ? Number(draft.foundedYear.trim())
      : null;
    if (year !== null && (!Number.isInteger(year) || year < 1800)) {
      toast.error("Geçerli bir kuruluş yılı girin");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        aboutText: draft.aboutText.trim(),
        website: draft.website.trim(),
        linkedinUrl: draft.linkedinUrl.trim(),
        instagramUrl: draft.instagramUrl.trim(),
        foundedYear: year,
        employeeCount: draft.employeeCount.trim(),
        services: draft.services,
        certifications: draft.certifications,
      });
      toast.success("Public profil güncellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50">
            <Globe className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h2 className="font-semibold text-lg text-brand-900">
              Herkese Açık Profil
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Tedarikçilerin gördüğü sayfa. Açıkken firmanıza "Tedarikçi Ol"
              isteği gönderilebilir.
            </p>
          </div>
        </div>
        {data.publicEnabled ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline shrink-0"
          >
            Görüntüle
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      {/* Yayın durumu */}
      <div className="flex items-center justify-between rounded-xl border border-surface-border p-4">
        <div>
          <p className="text-sm font-semibold text-brand-900">
            Profil yayında {data.publicEnabled ? "(Açık)" : "(Kapalı)"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.publicEnabled
              ? `Adres: app.supkeys.com${publicUrl}`
              : "Açtığınızda firmanız tedarikçilere görünür olur."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={data.publicEnabled}
          disabled={!isAdmin || updateMutation.isPending}
          onClick={() => togglePublic(!data.publicEnabled)}
          className={
            "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 " +
            (data.publicEnabled ? "bg-brand-600" : "bg-slate-200")
          }
        >
          <span
            className={
              "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform " +
              (data.publicEnabled ? "translate-x-5" : "translate-x-0.5")
            }
          />
        </button>
      </div>

      {/* Web sitesinden otomatik doldur */}
      {isAdmin ? (
        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-900">
                Web sitenizden otomatik doldur
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Logo, kapak görseli ve açıklamayı web sitenizden çekip profile
                ekleriz. Aşağıdaki "Web Sitesi" alanına adresinizi girin.
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
      ) : null}

      {/* Görseller */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ImagePicker
          label="Logo"
          url={data.logoUrl}
          uploading={uploadLogo.isPending}
          removing={removeLogo.isPending}
          disabled={!isAdmin}
          aspect="square"
          onPick={async (f) => {
            try {
              await uploadLogo.mutateAsync(f);
              toast.success("Logo yüklendi");
            } catch (err) {
              toast.error(extractErrorMessage(err, "Yüklenemedi"));
            }
          }}
          onRemove={async () => {
            await removeLogo.mutateAsync();
            toast.success("Logo kaldırıldı");
          }}
        />
        <ImagePicker
          label="Kapak Görseli"
          url={data.coverImageUrl}
          uploading={uploadCover.isPending}
          removing={removeCover.isPending}
          disabled={!isAdmin}
          aspect="cover"
          onPick={async (f) => {
            try {
              await uploadCover.mutateAsync(f);
              toast.success("Kapak yüklendi");
            } catch (err) {
              toast.error(extractErrorMessage(err, "Yüklenemedi"));
            }
          }}
          onRemove={async () => {
            await removeCover.mutateAsync();
            toast.success("Kapak kaldırıldı");
          }}
        />
      </div>

      {/* Metin alanları */}
      <div className="space-y-4">
        <Field>
          <Label htmlFor="tpp-about">Hakkında / Tanıtım</Label>
          <Textarea
            id="tpp-about"
            rows={4}
            maxLength={2000}
            placeholder="Firmanızı kısaca tanıtın."
            value={draft.aboutText}
            onChange={(e) => setDraft((d) => ({ ...d, aboutText: e.target.value }))}
            disabled={!isAdmin}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field>
            <Label htmlFor="tpp-founded">Kuruluş Yılı</Label>
            <Input
              id="tpp-founded"
              type="number"
              placeholder="Örn. 2010"
              value={draft.foundedYear}
              onChange={(e) =>
                setDraft((d) => ({ ...d, foundedYear: e.target.value }))
              }
              disabled={!isAdmin}
            />
          </Field>
          <Field>
            <Label htmlFor="tpp-emp">Çalışan Sayısı</Label>
            <Input
              id="tpp-emp"
              placeholder="Örn. 50-100"
              value={draft.employeeCount}
              onChange={(e) =>
                setDraft((d) => ({ ...d, employeeCount: e.target.value }))
              }
              disabled={!isAdmin}
            />
          </Field>
        </div>

        <TagInput
          label="Hizmet / Uzmanlık"
          placeholder="Ekle ve Enter'a bas (örn. Lojistik)"
          values={draft.services}
          disabled={!isAdmin}
          onChange={(services) => setDraft((d) => ({ ...d, services }))}
        />
        <TagInput
          label="Sertifikalar"
          placeholder="Ekle ve Enter'a bas (örn. ISO 9001)"
          values={draft.certifications}
          disabled={!isAdmin}
          onChange={(certifications) =>
            setDraft((d) => ({ ...d, certifications }))
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field>
            <Label htmlFor="tpp-web">Web Sitesi</Label>
            <Input
              id="tpp-web"
              placeholder="https://firmaniz.com"
              value={draft.website}
              onChange={(e) =>
                setDraft((d) => ({ ...d, website: e.target.value }))
              }
              disabled={!isAdmin}
            />
          </Field>
          <Field>
            <Label htmlFor="tpp-li">LinkedIn</Label>
            <Input
              id="tpp-li"
              placeholder="https://linkedin.com/company/..."
              value={draft.linkedinUrl}
              onChange={(e) =>
                setDraft((d) => ({ ...d, linkedinUrl: e.target.value }))
              }
              disabled={!isAdmin}
            />
          </Field>
          <Field>
            <Label htmlFor="tpp-ig">Instagram</Label>
            <Input
              id="tpp-ig"
              placeholder="https://instagram.com/..."
              value={draft.instagramUrl}
              onChange={(e) =>
                setDraft((d) => ({ ...d, instagramUrl: e.target.value }))
              }
              disabled={!isAdmin}
            />
          </Field>
        </div>

        {isAdmin ? (
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            >
              Kaydet
            </Button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Düzenleme yalnızca firma yöneticileri içindir.
          </p>
        )}
      </div>
    </div>
  );
}

function ImagePicker({
  label,
  url,
  uploading,
  removing,
  disabled,
  aspect,
  onPick,
  onRemove,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  removing: boolean;
  disabled: boolean;
  aspect: "square" | "cover";
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = uploading || removing;
  return (
    <div>
      <Label>{label}</Label>
      <div
        className={
          "mt-1 relative overflow-hidden rounded-xl border-2 border-dashed border-surface-border bg-slate-50 flex items-center justify-center " +
          (aspect === "square" ? "aspect-square max-w-[160px]" : "aspect-[3/1]")
        }
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-slate-400">Görsel yok</span>
        )}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      {!disabled ? (
        <div className="mt-2 flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <ImagePlus className="h-4 w-4" />
            {url ? "Değiştir" : "Yükle"}
          </Button>
          {url ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="text-xs text-slate-400 hover:text-danger-600 disabled:opacity-50"
            >
              Kaldır
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TagInput({
  label,
  placeholder,
  values,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (!v || values.includes(v) || values.length >= 20) {
      setInput("");
      return;
    }
    onChange([...values, v]);
    setInput("");
  };
  return (
    <Field>
      <Label>{label}</Label>
      {values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-md bg-brand-50 border border-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700"
            >
              {v}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  className="text-brand-400 hover:text-danger-600"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {!disabled ? (
        <div className="flex gap-2">
          <Input
            value={input}
            placeholder={placeholder}
            maxLength={80}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={add}>
            <Plus className="h-4 w-4" />
            Ekle
          </Button>
        </div>
      ) : null}
    </Field>
  );
}
