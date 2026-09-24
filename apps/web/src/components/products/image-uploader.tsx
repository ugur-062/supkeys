"use client";

import { useTranslations } from "next-intl";
import { useUploadProductImage } from "@/hooks/use-company-items";
import { resizeImageFile, ImageProcessingError } from "@/lib/image-resize";
import { PhotoIcon, StarIcon, TrashIcon } from "@heroicons/react/20/solid";
import { useRef, useState } from "react";
import { toast } from "sonner";

/** Vitrin kartında iyi görünen asgari kenar — Europages'in eşiğiyle aynı. */
const MIN_EDGE = 800;
const MAX_IMAGES = 8;
/** Kural metniyle aynı sayı; üstü reddedilmez, küçültülür (uyarıyla). */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * ÜRÜN GÖRSELLERİ — ilki KAPAK.
 *
 * Yükleme akışı: tarayıcıda küçült/EXIF temizle → presigned PUT ile
 * doğrudan R2 → `resolve` ile doğrula ve kalıcı URL al.
 *
 * `resizeImageFile` FAIL-CLOSED: EXIF (GPS koordinatı, cihaz seri no)
 * temizlenemezse dosya YÜKLENMEZ. Ürün görselleri public CDN'den servis
 * edildiği için bu, kullanıcının fabrika/şantiye konumunun yayımlanmasını
 * engelliyor.
 *
 * Küçük görsel UYARIR ama ENGELLEMEZ: 800px altı kartta bulanık çıkar, yine
 * de "görselsiz ürün"den iyidir — kullanıcıyı yayımlayamaz hâle getirmek
 * kataloğu boş bırakmaktan kötüdür.
 */
export function ImageUploader({
  images,
  onChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("web.panel.trade.imageUploader");
  const upload = useUploadProductImage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  /**
   * Satır altı uyarılar (v2): toast kaybolunca kullanıcı hangi dosyanın
   * neden reddedildiğini göremiyordu. Kural metni alanın altında, hatalar
   * dosya adıyla listelenir; yeni seçimde temizlenir.
   */
  const [notices, setNotices] = useState<string[]>([]);
  /** Sürükle-bırak: dosya bırakma vurgusu + görsel sıralama (HTML5 DnD). */
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      toast.error(t("enFazlaGorselEklenebilir", { max: MAX_IMAGES }));
      return;
    }
    setBusy(true);
    const added: string[] = [];
    const next: string[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      try {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
          next.push(t("yalnizJpgPngVeyaWebp", { name: file.name }));
          continue;
        }
        if (file.size > MAX_BYTES) {
          // Telefon fotoğrafı sık sık 5 MB'ı aşar; reddetmek yerine küçültüp
          // yüklüyoruz, kullanıcıya söylüyoruz.
          next.push(
            t("mb5MbUstuOtomatik", { name: file.name, size: (file.size / 1024 / 1024).toFixed(1) }),
          );
        }
        const dims = await readDimensions(file);
        if (dims && (dims.w < MIN_EDGE || dims.h < MIN_EDGE * 0.75)) {
          next.push(
            t("kucukGorselKarttaBulanik", { name: file.name, w: dims.w, h: dims.h, minW: MIN_EDGE, minH: MIN_EDGE * 0.75 }),
          );
        }
        const resized = await resizeImageFile(file, { maxEdge: 1600 });
        added.push(await upload.mutateAsync(resized));
      } catch (e) {
        next.push(
          e instanceof ImageProcessingError
            ? t("dosyaVeHata", { name: file.name, message: e.message })
            : t("yuklenemedi", { name: file.name }),
        );
      }
    }
    setNotices(next);
    setBusy(false);
    if (added.length) onChange([...images, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-900">
          {t("gorseller")}
          <span className="ml-1 font-normal text-zinc-500">
            ({images.length}/{MAX_IMAGES})
          </span>
        </p>
        <p className="text-xs text-zinc-500">
          {images.length > 0 ? t("ilkGorselKapakGorselOnerilir") : t("gorselOnerilir")}
        </p>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {t("jpgPngVeyaWebpEnAz", { minW: MIN_EDGE, minH: MIN_EDGE * 0.75 })}
      </p>

      {/* BIRAKMA ALANI: dosyaları buraya sürükleyin — telefon/masaüstü fark etmez. */}
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.files?.length) return;
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        data-dragover={dragOver || undefined}
        className="mt-3 rounded-2xl border-2 border-dashed border-transparent p-1 transition data-[dragover]:border-zinc-900 data-[dragover]:bg-zinc-50"
      >
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((src, i) => (
          <li
            key={src}
            draggable
            onDragStart={(e) => {
              setDragIndex(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (dragIndex != null) e.preventDefault();
            }}
            onDrop={(e) => {
              if (dragIndex == null) return;
              e.preventDefault();
              e.stopPropagation();
              move(dragIndex, i);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            title={t("surukleyerekSirala")}
            className={`group relative aspect-square cursor-grab overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-950/5 active:cursor-grabbing ${
              dragIndex === i ? "opacity-50" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="size-full object-cover" />
            {i === 0 ? (
              <span className="absolute top-1.5 left-1.5 rounded-full bg-zinc-950/80 px-2 py-0.5 text-[10px] font-medium text-white">
                {t("kapak")}
              </span>
            ) : null}
            <div className="absolute inset-x-1 bottom-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
              {i > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const next = [...images];
                    next.splice(i, 1);
                    onChange([src, ...next]);
                  }}
                  title={t("kapakYap")}
                  className="flex-1 rounded-md bg-white/90 py-1 text-zinc-700 hover:bg-white"
                >
                  <StarIcon aria-hidden className="mx-auto size-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onChange(images.filter((_, x) => x !== i))}
                title={t("kaldir")}
                className="flex-1 rounded-md bg-white/90 py-1 text-zinc-700 hover:bg-white"
              >
                <TrashIcon aria-hidden className="mx-auto size-3.5" />
              </button>
            </div>
          </li>
        ))}

        {images.length < MAX_IMAGES ? (
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-50"
            >
              <PhotoIcon aria-hidden className="size-6" />
              <span className="text-xs font-medium">
                {busy ? t("yukleniyor") : t("gorselEkle")}
              </span>
              <span className="text-[10px] text-zinc-500">{t("yaDaSurukleyipBirakin")}</span>
            </button>
          </li>
        ) : null}
      </ul>
      </div>
      {notices.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-amber-800" role="status">
          {notices.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}

/** Görsel boyutunu okur (uyarı için). Okunamazsa null — akışı kesmez. */
function readDimensions(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
