"use client";

import {
  printHtml as printHtmlRaw,
  saveFile as saveFileRaw,
  type PrintOutcome,
  type SaveFileOutcome,
} from "@/lib/save-file";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";

/** `failed`: yerel kaydetme / paylaşma düştü — toast basıldı. */
export type SaveFileResult = SaveFileOutcome | "failed";
/** `failed`: yerel yazdırma düştü — toast basıldı. */
export type PrintResult = PrintOutcome | "failed";

export type SaveFileFn = (blob: Blob, filename: string, opts?: { title?: string }) => Promise<SaveFileResult>;
export type PrintHtmlFn = (html: string, name: string) => Promise<PrintResult>;

interface FileExport {
  saveFile: SaveFileFn;
  printHtml: PrintHtmlFn;
}

/**
 * `lib/save-file.ts`in panel sarmalayıcısı — çağıran tek satır kalsın diye
 * kabuk kaynaklı sonuçları BURADA söyler:
 *  - `unsupported` (eklentisiz eski uygulama sürümü) → "bu sürümde yok,
 *    rothern.com'dan yapın" bilgisi;
 *  - yerel hata → çevrilmiş hata toast'ı, sonuç `failed` (fırlatmaz — ham
 *    yerel ileti kullanıcıya basılmaz);
 *  - `cancelled` (paylaşım kapatıldı) sessiz.
 * Tarayıcı açılır pencere engeli (`blocked`) çağırana kalır (kendi metni var).
 */
export function useSaveFile(): FileExport {
  const t = useTranslations("web.panel.shell.fileExport");
  return useMemo<FileExport>(() => {
    const unsupported = () => toast.info(t("uygulamaSurumundeYok"));
    return {
      saveFile: async (blob, filename, opts) => {
        try {
          const outcome = await saveFileRaw(blob, filename, opts);
          if (outcome === "unsupported") unsupported();
          return outcome;
        } catch {
          toast.error(t("dosyaKaydedilemedi"));
          return "failed";
        }
      },
      // Tarayıcı yolu pencereyi ilk `await`ten önce açar: sarmalayıcı da
      // çağrıyı EŞZAMANLI başlatır (tıklamanın kullanıcı etkinliği korunur).
      printHtml: async (html, name) => {
        try {
          const outcome = await printHtmlRaw(html, name);
          if (outcome === "unsupported") unsupported();
          return outcome;
        } catch {
          toast.error(t("yazdirilamadi"));
          return "failed";
        }
      },
    };
  }, [t]);
}
