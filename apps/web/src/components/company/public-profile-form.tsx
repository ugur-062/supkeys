"use client";

import { Button } from "@/components/catalyst/button";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Switch } from "@/components/catalyst/switch";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import { Dropzone } from "@/components/ui/dropzone";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useCompanyProfile,
  useUpdateCompanyProfile,
  useUploadProfileImage,
} from "@/hooks/use-company-profile";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { ExternalLink, Lock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const IMG_MIME = ["image/jpeg", "image/png", "image/webp"];

/** Herkese açık profil düzenleme — Bağlantılar > Profilim sekmesi. */
export function PublicProfileForm() {
  const { user } = useCompanyAuth();
  const { data: profile, isLoading } = useCompanyProfile();
  const update = useUpdateCompanyProfile();
  const canEdit =
    !!user &&
    (user.isOwner ||
      user.roles.includes("SAHIP") ||
      user.roles.includes("YONETICI"));

  const [form, setForm] = useState({
    aboutText: "",
    publicEnabled: false,
    logoUrl: "",
    coverImageUrl: "",
    linkedinUrl: "",
    instagramUrl: "",
    employeeCount: "",
    foundedYear: "",
    services: [] as string[],
    certifications: [] as string[],
    photos: [] as string[],
    certificateImages: [] as string[],
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      aboutText: profile.aboutText ?? "",
      publicEnabled: profile.publicEnabled,
      logoUrl: profile.logoUrl ?? "",
      coverImageUrl: profile.coverImageUrl ?? "",
      linkedinUrl: profile.linkedinUrl ?? "",
      instagramUrl: profile.instagramUrl ?? "",
      employeeCount: profile.employeeCount ?? "",
      foundedYear: profile.foundedYear ? String(profile.foundedYear) : "",
      services: profile.services ?? [],
      certifications: profile.certifications ?? [],
      photos: profile.photos ?? [],
      certificateImages: profile.certificateImages ?? [],
    });
  }, [profile]);

  const set = (patch: Partial<typeof form>) =>
    setForm((f) => ({ ...f, ...patch }));

  const handleSave = async () => {
    const { foundedYear, ...rest } = form;
    try {
      await update.mutateAsync({
        ...rest,
        foundedYear: foundedYear.trim() ? Number(foundedYear) : undefined,
      });
      toast.success("Profil güncellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  if (isLoading || !profile) {
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  }

  if (profile.tier !== "PAKET") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <Lock className="mx-auto mb-2 h-7 w-7 text-amber-500" />
        <p className="font-medium text-amber-900">
          Herkese açık profil premium özelliği
        </p>
        <p className="mt-1 text-sm text-amber-800">
          Premium üyelikle Google&apos;da bulunabilir bir firma profili
          oluşturabilir, yeni firmalarla bağlantı kurabilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Üst başlık + görüntüle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Subheading>Herkese Açık Profilim</Subheading>
          <Text className="mt-0.5 text-sm text-zinc-500">
            Bu bilgiler firma profilinde ve Google&apos;da görünür.
          </Text>
        </div>
        {form.publicEnabled && profile.slug ? (
          <a
            href={`/firma/${profile.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
          >
            Profili görüntüle
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      {/* Yayın anahtarı */}
      <Field className="flex items-center justify-between rounded-2xl border border-zinc-950/10 bg-white p-4">
        <div>
          <Label>Herkese açık profil yayında</Label>
          <Text className="text-xs text-zinc-500">
            Kapalıyken profilin kimseye / Google&apos;a görünmez.
          </Text>
        </div>
        <Switch
          checked={form.publicEnabled}
          disabled={!canEdit}
          onChange={(v: boolean) => set({ publicEnabled: v })}
        />
      </Field>

      <section className="space-y-5 rounded-2xl border border-zinc-950/10 bg-white p-5">
        {/* Logo + kapak */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <ImageUpload
            kind="logo"
            label="Logo"
            aspect="square"
            hint="kare · maks. 2MB"
            value={form.logoUrl}
            disabled={!canEdit}
            onChange={(logoUrl) => set({ logoUrl })}
          />
          <div className="min-w-0 flex-1">
            <ImageUpload
              kind="cover"
              label="Kapak görseli"
              aspect="wide"
              hint="16:9 · maks. 5MB"
              value={form.coverImageUrl}
              disabled={!canEdit}
              onChange={(coverImageUrl) => set({ coverImageUrl })}
            />
          </div>
        </div>

        <Field>
          <Label>Hakkında</Label>
          <Textarea
            rows={4}
            value={form.aboutText}
            disabled={!canEdit}
            placeholder="Firmanızı kısaca tanıtın…"
            onChange={(e) => set({ aboutText: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label>Kuruluş yılı</Label>
            <Input
              type="number"
              value={form.foundedYear}
              disabled={!canEdit}
              placeholder="Örn. 2015"
              onChange={(e) => set({ foundedYear: e.target.value })}
            />
          </Field>
          <Field>
            <Label>Çalışan sayısı</Label>
            <Input
              value={form.employeeCount}
              disabled={!canEdit}
              placeholder="Örn. 50-100"
              onChange={(e) => set({ employeeCount: e.target.value })}
            />
          </Field>
          <Field>
            <Label>LinkedIn</Label>
            <Input
              value={form.linkedinUrl}
              disabled={!canEdit}
              placeholder="https://linkedin.com/company/…"
              onChange={(e) => set({ linkedinUrl: e.target.value })}
            />
          </Field>
          <Field>
            <Label>Instagram</Label>
            <Input
              value={form.instagramUrl}
              disabled={!canEdit}
              placeholder="https://instagram.com/…"
              onChange={(e) => set({ instagramUrl: e.target.value })}
            />
          </Field>
        </div>

        <ChipInput
          label="Hizmetler"
          values={form.services}
          disabled={!canEdit}
          placeholder="Hizmet ekle, Enter'a bas"
          onChange={(services) => set({ services })}
        />
        <ChipInput
          label="Sertifikalar"
          values={form.certifications}
          disabled={!canEdit}
          placeholder="Sertifika ekle, Enter'a bas"
          onChange={(certifications) => set({ certifications })}
        />

        <GalleryUpload
          label="Sertifika Görselleri"
          hint="Sertifika belgelerinin görselleri (JPEG/PNG/WebP, maks. 12)."
          values={form.certificateImages}
          disabled={!canEdit}
          onChange={(certificateImages) => set({ certificateImages })}
        />

        <GalleryUpload
          values={form.photos}
          disabled={!canEdit}
          onChange={(photos) => set({ photos })}
        />
      </section>

      {canEdit ? (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </div>
      ) : (
        <Text className="text-right text-xs text-zinc-400">
          Düzenleme için Yönetici rolü gerekir
        </Text>
      )}
    </div>
  );
}

function ImageUpload({
  kind,
  label,
  hint,
  aspect,
  value,
  disabled,
  onChange,
}: {
  kind: "logo" | "cover";
  label: string;
  hint?: string;
  aspect: "square" | "wide";
  value: string;
  disabled?: boolean;
  onChange: (url: string) => void;
}) {
  const upload = useUploadProfileImage();

  const onFile = async (file: File) => {
    if (!IMG_MIME.includes(file.type)) {
      toast.error("JPEG, PNG veya WebP yükleyin");
      return;
    }
    const max = kind === "logo" ? 2 : 5;
    if (file.size > max * 1024 * 1024) {
      toast.error(`Dosya çok büyük (maks. ${max}MB)`);
      return;
    }
    try {
      const url = await upload.mutateAsync({ file, kind });
      onChange(url);
      toast.success(`${label} yüklendi — kaydetmeyi unutma`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yüklenemedi"));
    }
  };

  return (
    <div className={aspect === "wide" ? "w-full" : undefined}>
      <span className="block text-sm font-medium text-zinc-950">{label}</span>
      <div className="mt-2">
        {value ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className={cn(
                "rounded-lg border border-zinc-950/10 object-cover",
                aspect === "square" ? "h-24 w-24" : "h-28 w-full max-w-md",
              )}
            />
            {!disabled ? (
              <button
                type="button"
                onClick={() => onChange("")}
                className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow ring-1 ring-zinc-950/10 hover:bg-zinc-50"
                aria-label="Kaldır"
              >
                <X className="h-3.5 w-3.5 text-zinc-600" />
              </button>
            ) : null}
          </div>
        ) : disabled ? (
          <Text className="text-sm text-zinc-400">—</Text>
        ) : (
          <Dropzone
            accept="image/jpeg,image/png,image/webp"
            disabled={upload.isPending}
            onFiles={(files) => files[0] && onFile(files[0])}
            label={upload.isPending ? "Yükleniyor…" : `${label} yükle`}
            hint={hint}
            className={aspect === "square" ? "w-40" : "max-w-md"}
          />
        )}
      </div>
    </div>
  );
}

function GalleryUpload({
  values,
  onChange,
  disabled,
  label = "Fotoğraf Galerisi",
  hint = "Tesis, ürün, ekip fotoğrafları — profilde görünür (maks. 12).",
}: {
  values: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const upload = useUploadProfileImage();

  const onFiles = async (files: File[]) => {
    let next = [...values];
    for (const file of files) {
      if (!IMG_MIME.includes(file.type)) {
        toast.error("JPEG, PNG veya WebP yükleyin");
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Dosya çok büyük (maks. 5MB)");
        continue;
      }
      if (next.length >= 12) {
        toast.error("En fazla 12 fotoğraf");
        break;
      }
      try {
        const url = await upload.mutateAsync({ file, kind: "gallery" });
        next = [...next, url];
        onChange(next);
      } catch (err) {
        toast.error(extractErrorMessage(err, "Yüklenemedi"));
      }
    }
  };

  return (
    <div>
      <span className="block text-sm font-medium text-zinc-950">{label}</span>
      <Text className="mt-0.5 text-xs text-zinc-400">{hint}</Text>
      <div className="mt-2 flex flex-wrap gap-3">
        {values.map((url) => (
          <div key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              className="h-24 w-24 rounded-lg border border-zinc-950/10 object-cover"
            />
            {!disabled ? (
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== url))}
                className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow ring-1 ring-zinc-950/10 hover:bg-zinc-50"
                aria-label="Kaldır"
              >
                <X className="h-3.5 w-3.5 text-zinc-600" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {!disabled && values.length < 12 ? (
        <div className="mt-2">
          <Dropzone
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={upload.isPending}
            onFiles={onFiles}
            label={upload.isPending ? "Yükleniyor…" : "Fotoğraf ekle"}
            hint="JPEG/PNG/WebP · maks. 5MB"
            className="max-w-md"
          />
        </div>
      ) : null}
    </div>
  );
}

function ChipInput({
  label,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v) || values.length >= 20) return;
    onChange([...values, v]);
    setDraft("");
  };
  return (
    <Field>
      <Label>{label}</Label>
      <div className="mt-1 flex flex-wrap gap-2">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-sm text-zinc-700"
          >
            {v}
            {!disabled ? (
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {!disabled ? (
        <div className="mt-2 flex gap-2">
          <Input
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="max-w-xs"
          />
          <Button outline type="button" onClick={add}>
            Ekle
          </Button>
        </div>
      ) : null}
    </Field>
  );
}
