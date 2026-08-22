/* eslint-disable no-console */
/**
 * Profil görsellerini engelli `pub-*.r2.dev` adresinden custom domain'e taşır
 * (2026-08-22). Türkiye'de `r2.dev` alan adı TLS seviyesinde engellenmiş
 * görünüyor (bu makineden "Recv failure: Connection reset by peer"); prod'da
 * logo/kapak/galeri URL'leri bu host'la SAKLANDIĞI için kullanıcılar görselleri
 * göremiyor. Yol: docs/r2-bucket-split.md (PUBLIC bucket + cdn.rothern.com).
 *
 * Bu script iki şey yapar (idempotent, varsayılan DRY-RUN):
 *  1) Eski bucket'taki `{env}/tenant-profile/**` nesnelerini yeni PUBLIC
 *     bucket'a kopyalar (CopyObject, aynı key) — yeni bucket'ta zaten varsa atlar.
 *  2) DB'deki logoUrl/coverImageUrl/photos[]/certificateImages[] değerlerinde
 *     ESKİ public base host'unu YENİ base ile değiştirir (yalnız eşleşen URL'ler).
 *
 * Kullanım (API .env'i / Render env'i yüklü olmalı):
 *   pnpm --filter @rothern/api migrate:public-images                 # dry-run
 *   pnpm --filter @rothern/api migrate:public-images -- --apply      # uygula
 *   Gerekli env: R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY
 *                OLD_PUBLIC_BASE_URL (ör. https://pub-xxxx.r2.dev)
 *                R2_PUBLIC_BASE_URL  (yeni, ör. https://cdn.rothern.com)
 *                SOURCE_BUCKET (eski; yoksa R2_PRIVATE_BUCKET ?? R2_BUCKET)
 *                R2_PUBLIC_BUCKET (hedef)
 *                DATABASE_URL
 *   İsteğe bağlı: ENV_PREFIX=prod|dev (varsayılan NODE_ENV'e göre)
 *
 * GÜVENLİK: yalnız `tenant-profile` prefix'i kopyalanır (INV-STORAGE-1 — hassas
 * belgeler public bucket'a ASLA taşınmaz). DB'de yalnız OLD host'lu değerler
 * değişir; başka host'lar dokunulmaz. Önce dry-run çıktısını okuyun.
 */
import "dotenv/config";
import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@rothern/db";

const apply = process.argv.includes("--apply");
const env = (k: string): string | undefined => process.env[k]?.trim() || undefined;

const endpoint = env("R2_ENDPOINT");
const accessKeyId = env("R2_ACCESS_KEY_ID");
const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
const oldBase = env("OLD_PUBLIC_BASE_URL")?.replace(/\/$/, "");
const newBase = env("R2_PUBLIC_BASE_URL")?.replace(/\/$/, "");
const sourceBucket = env("SOURCE_BUCKET") ?? env("R2_PRIVATE_BUCKET") ?? env("R2_BUCKET");
const targetBucket = env("R2_PUBLIC_BUCKET");
const envPrefix = env("ENV_PREFIX") ?? (env("NODE_ENV") === "production" ? "prod" : "dev");
const prefix = `${envPrefix}/tenant-profile/`;

function fail(msg: string): never {
  console.error(`HATA: ${msg}`);
  process.exit(1);
}
if (!endpoint || !accessKeyId || !secretAccessKey) fail("R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY gerekli");
if (!oldBase || !newBase) fail("OLD_PUBLIC_BASE_URL ve R2_PUBLIC_BASE_URL gerekli");
if (oldBase === newBase) fail("OLD ve YENİ base aynı — yapılacak bir şey yok");
if (!sourceBucket || !targetBucket) fail("SOURCE_BUCKET (veya R2_PRIVATE_BUCKET/R2_BUCKET) ve R2_PUBLIC_BUCKET gerekli");

const s3 = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey }, forcePathStyle: false });
const prisma = new PrismaClient();

async function exists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function copyObjects(): Promise<{ copied: number; skipped: number; total: number }> {
  let token: string | undefined;
  let copied = 0;
  let skipped = 0;
  let total = 0;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: sourceBucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) {
      if (!o.Key) continue;
      total++;
      if (sourceBucket !== targetBucket && (await exists(targetBucket!, o.Key))) {
        skipped++;
        continue;
      }
      if (sourceBucket === targetBucket) {
        skipped++;
        continue;
      }
      console.log(`${apply ? "COPY" : "[dry] COPY"} ${o.Key} (${o.Size ?? "?"} B)`);
      if (apply) {
        await s3.send(
          new CopyObjectCommand({
            Bucket: targetBucket,
            Key: o.Key,
            CopySource: `/${sourceBucket}/${encodeURIComponent(o.Key).replace(/%2F/g, "/")}`,
            MetadataDirective: "COPY",
          }),
        );
      }
      copied++;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return { copied, skipped, total };
}

const swap = (v: string | null): string | null =>
  v && v.startsWith(`${oldBase}/`) ? `${newBase}${v.slice(oldBase!.length)}` : v;

async function rewriteDb(): Promise<{ companies: number; fields: number }> {
  const rows = await prisma.company.findMany({
    where: {
      OR: [
        { logoUrl: { startsWith: oldBase } },
        { coverImageUrl: { startsWith: oldBase } },
        { photos: { hasSome: [] } }, // placeholder — diziler aşağıda filtrelenir
      ],
    },
    select: { id: true, name: true, logoUrl: true, coverImageUrl: true, photos: true, certificateImages: true },
  });
  // Diziler için DB filtresi yok (prefix sorgusu) → bellekte süz.
  const all = await prisma.company.findMany({
    where: { OR: [{ photos: { isEmpty: false } }, { certificateImages: { isEmpty: false } }] },
    select: { id: true, name: true, logoUrl: true, coverImageUrl: true, photos: true, certificateImages: true },
  });
  const byId = new Map<string, (typeof rows)[number]>();
  for (const r of [...rows, ...all]) byId.set(r.id, r);

  let companies = 0;
  let fields = 0;
  for (const c of byId.values()) {
    const next = {
      logoUrl: swap(c.logoUrl),
      coverImageUrl: swap(c.coverImageUrl),
      photos: c.photos.map((p) => swap(p) ?? p),
      certificateImages: c.certificateImages.map((p) => swap(p) ?? p),
    };
    const changed =
      next.logoUrl !== c.logoUrl ||
      next.coverImageUrl !== c.coverImageUrl ||
      next.photos.some((p, i) => p !== c.photos[i]) ||
      next.certificateImages.some((p, i) => p !== c.certificateImages[i]);
    if (!changed) continue;
    companies++;
    fields +=
      Number(next.logoUrl !== c.logoUrl) +
      Number(next.coverImageUrl !== c.coverImageUrl) +
      next.photos.filter((p, i) => p !== c.photos[i]).length +
      next.certificateImages.filter((p, i) => p !== c.certificateImages[i]).length;
    console.log(`${apply ? "DB" : "[dry] DB"} ${c.name}: ${JSON.stringify({ logo: next.logoUrl !== c.logoUrl, cover: next.coverImageUrl !== c.coverImageUrl, photos: next.photos.filter((p, i) => p !== c.photos[i]).length, certs: next.certificateImages.filter((p, i) => p !== c.certificateImages[i]).length })}`);
    if (apply) await prisma.company.update({ where: { id: c.id }, data: next });
  }
  return { companies, fields };
}

(async () => {
  console.log(`${apply ? "UYGULAMA" : "DRY-RUN"} — prefix=${prefix} source=${sourceBucket} target=${targetBucket}`);
  console.log(`old=${oldBase} → new=${newBase}`);
  const c = await copyObjects();
  console.log(`Nesne: toplam ${c.total}, kopyalandı ${c.copied}, atlandı ${c.skipped}`);
  const d = await rewriteDb();
  console.log(`DB: ${d.companies} firma, ${d.fields} alan ${apply ? "güncellendi" : "güncellenecek"}`);
  if (!apply) console.log("Uygulamak için: -- --apply");
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
