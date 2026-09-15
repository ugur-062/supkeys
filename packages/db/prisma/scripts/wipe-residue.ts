/**
 * KALINTI TEMİZLİĞİ (2026-09-15) — `wipe-companies.ts`ten SONRA canlıyı
 * "tertemiz" yapmak için (kullanıcı kararı: "evet tertemiz yapalım canlıyı").
 *
 * `wipe-companies` firmaları ve onlara bağlı her şeyi siler ama firmaya BAĞLI
 * OLMAYAN kayıtlar kalır: e-posta gönderim kayıtları ve olayları, denetim
 * günlüğü, AI kullanım/sohbet kayıtları, doğrulama kodları, şifre sıfırlama
 * jetonları, sonuçsuz arama kayıtları, misafir bilgi talepleri… Ayrıca kaydı
 * yarıda bırakılmış kullanıcıların Supabase giriş hesapları.
 *
 * SİLİNEN: aşağıdaki KORUNAN listesi DIŞINDAKİ bütün tablolar (liste şemadan
 * türetilir — yeni tablo eklenince elle güncelleme gerekmez) + hiçbir
 * platform adminine ait olmayan Supabase Auth hesapları.
 *
 * KORUNAN: kategori kataloğu, kategori nitelikleri, döviz kurları, platform
 * adminleri (ve Supabase hesapları), zaman tasarrufu ayarları, migration
 * geçmişi.
 *
 * EMNİYETLER:
 *  1. Varsayılan KURU ÇALIŞMA — sayar, dokunmaz.
 *  2. Silmek için `ONAY=EVET-SIL` + `HEDEF=<supabase-proje-ref>` eşleşmesi.
 *  3. Firma tablosunda kayıt varsa DURUR (önce `wipe-companies` koşulmalı;
 *     canlı firmalar dururken günlükleri silmek iz kaybettirir).
 *  4. FK ön kontrolü (salt okuma, her kipte): veritabanındaki GERÇEK yabancı
 *     anahtarlar okunur; boşaltılmayan bir tablo boşaltılan birine bağlıysa
 *     TRUNCATE Postgres'te hata verir — bu durum silmeden ÖNCE yakalanır.
 *     Prisma şeması dışındaki elle yazılmış kısıtlar da görünür.
 *
 *   ENV_FILE=../../.env.prod.local npx tsx prisma/scripts/wipe-residue.ts                 # kuru
 *   ENV_FILE=../../.env.prod.local ONAY=EVET-SIL HEDEF=<ref> npx tsx prisma/scripts/wipe-residue.ts
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

import { Prisma, PrismaClient } from "@prisma/client";

/** Model adları — bunların tabloları ASLA boşaltılmaz. */
const KORUNAN = new Set(["Category", "CategoryAttribute", "ExchangeRate", "PlatformAdmin", "TimeSavingsConfig"]);
/**
 * Boşaltılmayan ama boş OLMASI şart olan: `time_savings_configs` (korunan)
 * `companies`e FK taşıdığı için TRUNCATE listesine giremez. Firmaları
 * `wipe-companies` zaten siler; burada yalnız boş olduğu doğrulanır.
 */
const BOS_OLMALI = "Company";

const rawUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "";
const url = rawUrl.includes("pgbouncer=")
  ? rawUrl
  : `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}pgbouncer=true&connection_limit=1`;
const prisma = new PrismaClient({ datasources: { db: { url } } });

const SIL = process.env.ONAY === "EVET-SIL";
const ref = (process.env.SUPABASE_URL ?? "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

const tables = Prisma.dmmf.datamodel.models
  .filter((m) => !KORUNAN.has(m.name) && m.name !== BOS_OLMALI)
  .map((m) => ({ model: m.name, table: m.dbName ?? m.name }));

const q = (t: string) => `"${t.replace(/"/g, '""')}"`;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const { table } of tables) {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*)::bigint AS n FROM ${q(table)}`);
    out[table] = Number(rows[0]!.n);
  }
  return out;
}

async function authUsers(): Promise<Array<{ id: string; email: string | null }>> {
  const base = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!base || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY yok");
  const all: Array<{ id: string; email: string | null }> = [];
  for (let page = 1; page <= 100; page++) {
    const res = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`Supabase listUsers ${res.status}`);
    const body = (await res.json()) as { users?: Array<{ id: string; email?: string | null }> };
    const users = body.users ?? [];
    all.push(...users.map((u) => ({ id: u.id, email: u.email ?? null })));
    if (users.length < 200) break;
  }
  return all;
}

async function main() {
  console.log(`🎯 Hedef: Supabase projesi ${ref ?? "?"} · dosya ${envFile}`);

  const firma = await prisma.company.count();
  const once = await counts();
  const dolu = Object.entries(once).filter(([, n]) => n > 0);
  console.log(`🗑️  BOŞALTILACAK tablolar (dolu olanlar): ${dolu.length ? "" : "yok"}`);
  for (const [t, n] of dolu) console.log(`   ${t.padEnd(32)} ${n}`);
  console.log(`   (toplam ${tables.length} tablo taranıyor; boş olanlar listelenmedi)`);

  const admins = await prisma.platformAdmin.findMany({ select: { email: true, authId: true } });
  const adminIds = new Set(admins.map((a) => a.authId).filter((x): x is string => !!x));
  const adminEmails = new Set(admins.map((a) => a.email.toLowerCase()));
  const auth = await authUsers();
  const sahipsiz = auth.filter((u) => !adminIds.has(u.id) && !adminEmails.has((u.email ?? "").toLowerCase()));
  const kalanCompanyAuth = new Set(
    (await prisma.companyUser.findMany({ select: { authId: true } })).map((u) => u.authId).filter(Boolean),
  );
  console.log(`🔐 Supabase Auth: ${auth.length} hesap · admin ${auth.length - sahipsiz.length} (korunur) · silinecek ${sahipsiz.length}`);
  console.log(`🛡️  KORUNAN: kategori ${await prisma.category.count()} · nitelik ${await prisma.categoryAttribute.count()} · kur ${await prisma.exchangeRate.count()} · admin ${admins.length} · zaman ayarı ${await prisma.timeSavingsConfig.count()}`);

  const sql = `TRUNCATE TABLE ${tables.map((t) => q(t.table)).join(", ")}`;

  // FK ÖN KONTROLÜ — salt okuma. Boşaltılmayan tablodan boşaltılana giden
  // kısıt varsa TRUNCATE reddedilir; silmeye başlamadan söyle.
  const hedefler = new Set(tables.map((t) => t.table));
  const fk = await prisma.$queryRawUnsafe<Array<{ from_table: string; to_table: string; name: string }>>(`
    SELECT c.conrelid::regclass::text AS from_table, c.confrelid::regclass::text AS to_table, c.conname AS name
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = current_schema()`);
  const bare = (t: string) => t.replace(/^.*\./, "").replace(/"/g, "");
  const engel = fk.filter((r) => !hedefler.has(bare(r.from_table)) && hedefler.has(bare(r.to_table)));
  if (engel.length) {
    console.error(`❌ FK ön kontrolü: boşaltılmayan tablolar boşaltılanlara bağlı:\n   ${engel.map((e) => `${bare(e.from_table)} → ${bare(e.to_table)} (${e.name})`).join("\n   ")}`);
    process.exit(1);
  }
  console.log(`🔎 FK ön kontrolü geçti (${fk.length} kısıt tarandı).`);

  if (!SIL) {
    console.log("\nKURU ÇALIŞMA — hiçbir şey silinmedi. Silmek için: ONAY=EVET-SIL HEDEF=<supabase-proje-ref>");
    return;
  }

  if (!ref || process.env.HEDEF !== ref) {
    console.error(`❌ HEDEF=${process.env.HEDEF ?? "(yok)"} ile yüklenen proje ${ref ?? "?"} eşleşmiyor — silme başlamadı.`);
    process.exit(1);
  }
  if (firma > 0 || kalanCompanyAuth.size > 0) {
    console.error(`❌ Veritabanında hâlâ ${firma} firma var — önce wipe-companies koşulmalı. Silme başlamadı.`);
    process.exit(1);
  }

  console.log("\n⏳ tablolar boşaltılıyor…");
  await prisma.$executeRawUnsafe(sql);
  console.log("✅ tablolar boşaltıldı");

  const base = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  let silinen = 0;
  for (const u of sahipsiz) {
    const res = await fetch(`${base}/auth/v1/admin/users/${u.id}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).catch(() => null);
    if (res?.ok) silinen += 1;
  }
  console.log(`✅ Supabase Auth: ${silinen}/${sahipsiz.length} sahipsiz hesap silindi`);

  const sonra = Object.entries(await counts()).filter(([, n]) => n > 0);
  console.log(`📊 SONRASI dolu tablo: ${sonra.length ? sonra.map(([t, n]) => `${t}=${n}`).join(", ") : "yok"}`);
  console.log(`🔐 SONRASI Supabase Auth: ${(await authUsers()).length} hesap (yalnız adminler)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
