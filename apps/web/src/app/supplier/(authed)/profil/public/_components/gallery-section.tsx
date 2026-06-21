"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import { Dropzone } from "@/components/ui/dropzone";
import {
  useRemoveProfilePhoto,
  useUploadProfilePhoto,
  type SupplierProfilePhoto,
} from "@/hooks/use-supplier-profile";
import axios from "axios";
import { X } from "lucide-react";
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

  const limitReached = photos.length >= MAX_PHOTOS;

  const onFiles = async (files: File[]) => {
    let added = 0;
    for (const f of files) {
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
    >
      {photos.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden rounded-xl bg-zinc-100"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? "Galeri görseli"}
                className="h-full w-full object-cover"
                loading="lazy"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                  const parent = img.parentElement;
                  if (parent && !parent.querySelector("[data-broken]")) {
                    const div = document.createElement("div");
                    div.setAttribute("data-broken", "true");
                    div.className =
                      "absolute inset-0 flex flex-col items-center justify-center p-3 text-center bg-amber-50 text-amber-800 text-[11px]";
                    div.textContent =
                      "Görsel yüklenemedi — R2 public erişim aktif değil";
                    parent.appendChild(div);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => onRemovePhoto(p.id)}
                aria-label="Fotoğrafı kaldır"
                disabled={remove.isPending}
                className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/80 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {limitReached ? (
        <p className="py-2 text-center text-sm text-zinc-500">
          Galeri dolu ({MAX_PHOTOS}/{MAX_PHOTOS}). Yeni eklemek için önce
          fotoğraf kaldırın.
        </p>
      ) : (
        <Dropzone
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={upload.isPending}
          onFiles={onFiles}
          label={upload.isPending ? "Yükleniyor…" : "Fotoğraf ekle"}
          hint="JPEG / PNG / WebP · maks. 3MB · birden fazla seçebilirsiniz"
        />
      )}
    </PanelCard>
  );
}
