"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import { Button } from "@/components/ui/button";
import {
  useRemoveProfilePhoto,
  useUploadProfilePhoto,
  type SupplierProfilePhoto,
} from "@/hooks/use-supplier-profile";
import axios from "axios";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

const MAX_PHOTOS = 12;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 3 * 1024 * 1024; // 3MB

interface Props {
  photos: SupplierProfilePhoto[];
}

export function GallerySection({ photos }: Props) {
  const upload = useUploadProfilePhoto();
  const remove = useRemoveProfilePhoto();
  const inputRef = useRef<HTMLInputElement>(null);

  const limitReached = photos.length >= MAX_PHOTOS;

  const onFiles = async (files: FileList) => {
    let added = 0;
    for (const f of Array.from(files)) {
      if (photos.length + added >= MAX_PHOTOS) {
        toast.error(`Galeri en fazla ${MAX_PHOTOS} fotoğraf içerebilir`);
        break;
      }
      if (!ALLOWED.includes(f.type)) {
        toast.error(`${f.name}: sadece JPEG / PNG / WebP`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name}: maks. 3MB`);
        continue;
      }
      try {
        await upload.mutateAsync({ file: f });
        added += 1;
      } catch (err) {
        const raw = axios.isAxiosError(err)
          ? (err.response?.data as { message?: string | string[] })?.message
          : (err as Error)?.message;
        const msg = Array.isArray(raw)
          ? raw.join(", ")
          : (raw ?? "yükleme başarısız");
        toast.error(`${f.name}: ${msg}`);
      }
    }
    if (added > 0) toast.success(`${added} fotoğraf eklendi`);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onRemovePhoto = async (id: string) => {
    if (!window.confirm("Fotoğrafı kaldırmak istediğinize emin misiniz?"))
      return;
    try {
      await remove.mutateAsync(id);
      toast.success("Fotoğraf kaldırıldı");
    } catch {
      toast.error("Kaldırma başarısız");
    }
  };

  return (
    <PanelCard
      title="Galeri"
      subtitle={`${photos.length}/${MAX_PHOTOS} fotoğraf · JPEG / PNG / WebP, maks. 3MB`}
      action={
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onFiles(e.target.files);
              }
            }}
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={limitReached || upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            Fotoğraf Ekle
          </Button>
        </>
      }
    >
      {photos.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">
          Henüz galeri fotoğrafı eklenmemiş.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {photos.map((p) => (
            <div
              key={p.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-slate-100 group"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? "Galeri görseli"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <button
                type="button"
                onClick={() => onRemovePhoto(p.id)}
                aria-label="Fotoğrafı kaldır"
                disabled={remove.isPending}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}
