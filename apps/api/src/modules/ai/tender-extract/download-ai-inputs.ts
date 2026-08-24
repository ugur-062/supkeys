import { BadRequestException } from "@nestjs/common";
import { assertUploadedObjectValid } from "../../../common/helpers/upload-validation";
import type { StorageService } from "../../storage/storage.service";
import { MAX_FILE_BYTES, MAX_TOTAL_INPUT_BYTES } from "./ai-extract-router";

/**
 * AI belge girdilerini R2'dan GÜVENLE indirir (denetim 2026-08-24 Parça 6, HIGH).
 *
 * Neden ayrı yardımcı: presigned PUT imzasında ContentLength koşulu yok ve
 * `upload-url` aşamasındaki `assertReportedSize` yalnız İSTEMCİNİN bildirdiği
 * (opsiyonel!) boyutu kontrol ediyor. Doğrulamasız `getObject` nesnenin
 * TAMAMINI belleğe aldığı için, presigned URL'e konan GB'lık bir dosya tek
 * istekte süreci OOM ile düşürebiliyordu (NestJS tek süreç → tüm kiracılar
 * için kesinti). Kardeş modüllerin hepsi ingest'ten ÖNCE
 * `assertUploadedObjectValid` çağırıyor; AI yolu bu tek-kaynak kapıyı
 * atlıyordu.
 *
 * - HEAD ile boyut doğrulanır (tek dosya tavanı) — tavanı aşan nesne silinir.
 * - Toplam bayt tavanı indirme SIRASINDA uygulanır (dosya sayısı × tek tavan
 *   kadar bellek ayrılamaz).
 * - İndirme SERİ yapılır: 20 dosya paralel indirilip aynı anda bellekte
 *   tutulmaz.
 */
export async function downloadAiInputs(
  storage: StorageService,
  keys: string[],
): Promise<{ key: string; buffer: Buffer }[]> {
  const files: { key: string; buffer: Buffer }[] = [];
  let total = 0;
  for (const key of keys) {
    await assertUploadedObjectValid(storage, "private", key, MAX_FILE_BYTES);
    let buffer: Buffer;
    try {
      buffer = await storage.getObject("private", key);
    } catch {
      throw new BadRequestException(
        "Dosya yüklenmemiş görünüyor — lütfen tekrar deneyin",
      );
    }
    total += buffer.length;
    if (total > MAX_TOTAL_INPUT_BYTES) {
      throw new BadRequestException(
        "Seçilen dosyaların toplam boyutu çok büyük — daha az dosya seçin",
      );
    }
    files.push({ key, buffer });
  }
  return files;
}
