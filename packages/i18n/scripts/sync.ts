/**
 * Çeviri senkronu — `pnpm i18n:sync [--locale en,ru] [--dry-run] [--limit N]
 * [--model <gemini-model>] [--mark-reviewed <anahtar-öneki>]`
 *
 * Türkçe kaynakta yeni ya da değişen (bayat) anahtarları bulur, sözlükle Gemini
 * çevirisi yazar ve durum dosyasına `machine` olarak işler. İnsan incelemesi
 * `--mark-reviewed` ile aynı dosyaya `reviewed` yazar. Kataloglar kaynak sırasında
 * yazılır (diff'lenebilir). Anahtar `GEMINI_API_KEY` (ortam ya da depo kökü `.env`).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { glossaryFor, findBannedTerm } from "../src/glossary";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "../src/locales";
import { NAMESPACES } from "../src/messages";
import {
  coverage,
  flatten,
  hashSource,
  orderLike,
  placeholdersMatch,
  readJson,
  unflatten,
  writeJson,
  type Flat,
  type StatusMap,
  type Tree,
} from "./lib/catalog";

const PKG = path.resolve(__dirname, "..");
const REPO = path.resolve(PKG, "../..");
const BATCH = 40;
const LANG_NAMES: Record<Locale, string> = { tr: "Turkish", en: "English", ru: "Russian" };

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const limit = Number(opt("--limit") ?? Infinity);
const model = opt("--model") ?? process.env.I18N_SYNC_MODEL ?? "gemini-flash-latest";
const markReviewed = opt("--mark-reviewed");
const targets = (opt("--locale")?.split(",") ?? LOCALES.filter((l) => l !== DEFAULT_LOCALE)).filter(
  (l): l is Locale => (LOCALES as readonly string[]).includes(l) && l !== DEFAULT_LOCALE,
);

function loadFlat(locale: Locale): Flat {
  const out: Flat = {};
  for (const ns of NAMESPACES) {
    Object.assign(out, flatten(readJson<Tree>(path.join(PKG, `src/messages/${locale}/${ns}.json`), {}), ns));
  }
  return out;
}

function saveFlat(locale: Locale, flat: Flat, reference: Flat): void {
  for (const ns of NAMESPACES) {
    const prefix = `${ns}.`;
    const pick = (f: Flat): Flat =>
      Object.fromEntries(
        Object.entries(f)
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, v]) => [k.slice(prefix.length), v]),
      );
    const ordered = orderLike(pick(flat), pick(reference));
    writeJson(path.join(PKG, `src/messages/${locale}/${ns}.json`), unflatten(ordered));
  }
}

function readApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envFile = path.join(REPO, ".env");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = /^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
      if (m) return m[1]!.replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("GEMINI_API_KEY yok (ortam ya da depo kökü .env).");
}

function systemPrompt(locale: Locale): string {
  const g = glossaryFor(locale);
  const terms = Object.entries(g.terms ?? {})
    .map(([tr, target]) => `- "${tr}" → "${target}"`)
    .join("\n");
  const banned = (g.banned ?? []).map((b) => `"${b}"`).join(", ");
  return [
    `You translate user-interface strings of Rothern, a B2B procurement platform (buying requests, quotes, orders, supplier showcase), from Turkish into ${LANG_NAMES[locale]}.`,
    "Rules:",
    "1. Return ONLY a JSON array of objects {key, text}; one entry per input item, same keys, nothing else.",
    "2. Preserve ICU MessageFormat syntax exactly: placeholders such as {n} or {count, plural, one {…} other {…}} and tags such as <b>…</b>. Never translate or rename placeholder names.",
    "3. Preserve line breaks and surrounding punctuation. No explanations, no additions, no quotation marks around the text.",
    `4. Register: ${g.style ?? "formal, plain business language"}.`,
    `5. Glossary (Turkish → ${LANG_NAMES[locale]}); ALWAYS use these renderings when the concept appears:\n${terms}`,
    `6. FORBIDDEN words, never output them: ${banned || "(none)"}. The Turkish "talep" is a buying request, not a tender.`,
    "7. Product names stay as they are: Rothern, Gold, Silver. The plan name \"Standart\" becomes the local word for Standard.",
    "8. The key path hints the context, e.g. \"web.settings.language.label\" is a form label in settings; \"api.validation.*\" are short form validation errors.",
  ].join("\n");
}

interface Item {
  key: string;
  tr: string;
}

async function translateBatch(locale: Locale, items: Item[], apiKey: string): Promise<Record<string, string>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    system_instruction: { parts: [{ text: systemPrompt(locale) }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(items) }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { key: { type: "STRING" }, text: { type: "STRING" } },
          required: ["key", "text"],
        },
      },
    },
  };
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`Gemini HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const parsed = JSON.parse(text) as { key: string; text: string }[];
      const out: Record<string, string> = {};
      for (const row of parsed) {
        if (typeof row?.key === "string" && typeof row?.text === "string") out[row.key] = row.text;
      }
      return out;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function main(): Promise<void> {
  const source = loadFlat(DEFAULT_LOCALE);
  const now = new Date().toISOString().slice(0, 10);

  for (const locale of targets) {
    const target = loadFlat(locale);
    const statusFile = path.join(PKG, `src/status/${locale}.json`);
    const status = readJson<StatusMap>(statusFile, {});

    if (markReviewed !== undefined) {
      let n = 0;
      for (const key of Object.keys(source)) {
        if (!key.startsWith(markReviewed)) continue;
        if (!(key in target)) continue;
        status[key] = { hash: hashSource(source[key]!), status: "reviewed", at: now };
        n++;
      }
      if (!dryRun) writeJson(statusFile, Object.fromEntries(Object.entries(status).sort(([a], [b]) => a.localeCompare(b))));
      console.log(`${locale}: ${n} anahtar "reviewed" işaretlendi (önek "${markReviewed}")`);
      continue;
    }

    const report = coverage(source, target, status);
    const todo = [...report.missing, ...report.stale].slice(0, Number.isFinite(limit) ? limit : undefined);
    console.log(`${locale}: eksik ${report.missing.length}, bayat ${report.stale.length} → ${todo.length} anahtar çevrilecek`);
    if (todo.length === 0) continue;
    if (dryRun) {
      for (const key of todo) console.log(`  ${key}: ${source[key]}`);
      continue;
    }

    const apiKey = readApiKey();
    let applied = 0;
    const rejected: string[] = [];
    for (let i = 0; i < todo.length; i += BATCH) {
      const items: Item[] = todo.slice(i, i + BATCH).map((key) => ({ key, tr: source[key]! }));
      const result = await translateBatch(locale, items, apiKey);
      for (const { key, tr } of items) {
        const text = result[key]?.trim();
        if (!text) {
          rejected.push(`${key} (yanıt yok)`);
          continue;
        }
        if (!placeholdersMatch(tr, text)) {
          rejected.push(`${key} (yer tutucu uyumsuz: "${text}")`);
          continue;
        }
        const banned = findBannedTerm(text, locale);
        if (banned) {
          rejected.push(`${key} (yasaklı terim "${banned}": "${text}")`);
          continue;
        }
        target[key] = text;
        status[key] = { hash: hashSource(tr), status: "machine", at: now };
        applied++;
      }
      console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
    }
    // Orphan'ları düşür (kaynakta olmayan anahtar hedefte kalmasın).
    for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
    for (const key of Object.keys(status)) if (!(key in source)) delete status[key];
    saveFlat(locale, target, source);
    writeJson(statusFile, Object.fromEntries(Object.entries(status).sort(([a], [b]) => a.localeCompare(b))));
    console.log(`${locale}: ${applied} çeviri yazıldı (makine)${rejected.length ? `, ${rejected.length} reddedildi` : ""}`);
    for (const r of rejected) console.log(`  RED ${r}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
