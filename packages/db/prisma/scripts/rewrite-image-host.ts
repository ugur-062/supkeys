/**
 * GÖRSEL ADRESİNİN KONAĞINI DEĞİŞTİRİR (2026-09-16).
 *
 * Staging CDN'i `cdn.staging.rothern.com`dan `cdn.staging.supkeys.com`a
 * taşındığında kayıtlı adresler eski konağı göstermeye devam eder. Dosyalar
 * AYNI R2 kovasında durduğu için taşınacak bir şey yok — yalnız veritabanındaki
 * adres yazımı değişir.
 *
 * Değişen alanlar: firma logosu/kapağı/galerisi/sertifika görselleri ve ürün
 * görselleri. Yalnız ESKİ konakla başlayan adresler dokunulur; başka konaklar
 * (kategori fotoğrafı gibi göreli yollar dahil) değişmez.
 *
 * Kullanım:
 *   ESKI=https://cdn.staging.rothern.com YENI=https://cdn.staging.supkeys.com \
 *     pnpm --filter @rothern/db rewrite-image-host              # kuru çalışma
 *   ... ONAY=EVET-YAZ pnpm --filter @rothern/db rewrite-image-host
 *   Başka ortam için: ENV_FILE=../../.env.prod.local (dosyayı BETİK okur —
 *   kabukta `source` etmeyin, tırnaksız & değişkeni sessizce düşürüyor).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = process.env.ENV_FILE
  ? resolve(process.cwd(), process.env.ENV_FILE)
  : resolve(__dirname, "../../.env");
const override = !!process.env.ENV_FILE;
for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trimStart().startsWith("#")) {
    const k = line.slice(0, i).trim();
    if (override || !process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
}

import { PrismaClient } from "@prisma/client";

const ESKI = (process.env.ESKI ?? "").replace(/\/$/, "");
const YENI = (process.env.YENI ?? "").replace(/\/$/, "");
const YAZ = process.env.ONAY === "EVET-YAZ";

if (!/^https:\/\/[a-z0-9.-]+$/i.test(ESKI) || !/^https:\/\/[a-z0-9.-]+$/i.test(YENI)) {
  console.error("❌ ESKI ve YENI tam adres olmalı (ör. https://cdn.staging.rothern.com)");
  process.exit(1);
}
if (ESKI === YENI) {
  console.error("❌ ESKI ile YENI aynı — yapılacak bir şey yok");
  process.exit(1);
}

const rawUrl = process.env.DATABASE_URL ?? "";
const url = rawUrl.includes("pgbouncer=")
  ? rawUrl
  : `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}pgbouncer=true&connection_limit=1`;
const prisma = new PrismaClient({ datasources: { db: { url } } });

const değiştir = (v: string | null): string | null =>
  v && v.startsWith(`${ESKI}/`) ? `${YENI}${v.slice(ESKI.length)}` : v;
const dizi = (list: string[]): string[] => list.map((v) => değiştir(v) ?? v);
const farklı = (a: string[], b: string[]) => a.length !== b.length || a.some((v, i) => v !== b[i]);

async function main() {
  const ref = (process.env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "?";
  console.log(`🎯 Supabase projesi ${ref} · dosya ${envFile}`);
  console.log(`🔁 ${ESKI} → ${YENI}${YAZ ? "" : "  (KURU ÇALIŞMA)"}`);

  let firmaSayı = 0;
  const firmalar = await prisma.company.findMany({
    select: { id: true, name: true, logoUrl: true, coverImageUrl: true, photos: true, certificateImages: true },
  });
  for (const c of firmalar) {
    const next = {
      logoUrl: değiştir(c.logoUrl),
      coverImageUrl: değiştir(c.coverImageUrl),
      photos: dizi(c.photos),
      certificateImages: dizi(c.certificateImages),
    };
    if (
      next.logoUrl === c.logoUrl &&
      next.coverImageUrl === c.coverImageUrl &&
      !farklı(next.photos, c.photos) &&
      !farklı(next.certificateImages, c.certificateImages)
    ) {
      continue;
    }
    firmaSayı++;
    if (YAZ) await prisma.company.update({ where: { id: c.id }, data: next });
  }

  let ürünSayı = 0;
  const ürünler = await prisma.companyItem.findMany({ select: { id: true, images: true } });
  for (const p of ürünler) {
    const images = dizi(p.images);
    if (!farklı(images, p.images)) continue;
    ürünSayı++;
    if (YAZ) await prisma.companyItem.update({ where: { id: p.id }, data: { images } });
  }

  console.log(`🏢 firma kaydı: ${firmaSayı}`);
  console.log(`📦 ürün kaydı: ${ürünSayı}`);
  console.log(YAZ ? "✅ yazıldı" : "KURU ÇALIŞMA — hiçbir şey yazılmadı. Yazmak için: ONAY=EVET-YAZ");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
