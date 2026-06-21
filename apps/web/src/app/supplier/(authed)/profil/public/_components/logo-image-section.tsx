"use client";

import { PanelCard } from "@/components/supplier/panel-card";
import { Button } from "@/components/ui/button";
import { useRemoveLogo, useUploadLogo } from "@/hooks/use-supplier-profile";
import axios from "axios";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2MB — logo küçük, optimize edilmiş olmalı

interface Props {
  logoImageUrl: string | null;
  initials: string;
}

export function LogoImageSection({ logoImageUrl, initials }: Props) {
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    if (!ALLOWED.includes(file.type)) {
      toast.error("Sadece JPEG / PNG / WebP yükleyebilirsiniz");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo 2MB'dan büyük olamaz");
      return;
    }
    try {
      await upload.mutateAsync(file);
      toast.success("Logo güncellendi");
    } catch (err) {
      const raw = axios.isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : (err as Error)?.message;
      const msg = Array.isArray(raw)
        ? raw.join(", ")
        : (raw ?? "Yükleme başarısız");
      toast.error(msg);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onRemove = async () => {
    if (!window.confirm("Logoyu kaldırmak istediğinize emin misiniz?")) return;
    try {
      await remove.mutateAsync();
      toast.success("Logo kaldırıldı");
    } catch {
      toast.error("Kaldırma başarısız");
    }
  };

  const busy = upload.isPending || remove.isPending;

  return (
    <PanelCard
      title="Logo (Profil Resmi)"
      subtitle="JPEG / PNG / WebP, maks. 2MB · kare oran önerilir"
    >
      <div className="flex items-center gap-5 flex-wrap">
        {/* Önizleme — kare yuvarlatılmış (Hero'da bu görünür) */}
        <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-zinc-100 to-zinc-200 border-2 border-surface-border flex items-center justify-center">
          {logoImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoImageUrl}
              alt="Logo"
              className="w-full h-full object-cover"
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = "none";
                const parent = img.parentElement;
                if (parent && !parent.querySelector("[data-broken]")) {
                  const div = document.createElement("div");
                  div.setAttribute("data-broken", "true");
                  div.className =
                    "absolute inset-0 flex items-center justify-center text-amber-700 text-[10px] text-center p-1 bg-amber-50";
                  div.textContent = "Yüklenemedi";
                  parent.appendChild(div);
                }
              }}
            />
          ) : (
            <span className="text-3xl font-bold font-display text-zinc-700">
              {initials}
            </span>
          )}
          {busy && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <p className="text-sm text-slate-600">
            Hero'da firma adının yanında yuvarlatılmış kare olarak görünür.
            Logo yoksa firma adının baş harfleri (
            <span className="font-semibold text-zinc-700">{initials}</span>)
            gösterilir.
          </p>
          <div className="flex gap-2 flex-wrap">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <ImagePlus className="h-4 w-4" />
              {logoImageUrl ? "Değiştir" : "Logo Yükle"}
            </Button>
            {logoImageUrl && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onRemove}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" />
                Kaldır
              </Button>
            )}
          </div>
        </div>
      </div>
    </PanelCard>
  );
}
