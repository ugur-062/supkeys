/**
 * KİMLİK BELİRTECİ KİLİDİ (mobil denetim 2026-10, beşinci tur: s4-misc#v4new0/#v4new1).
 *
 * Inter'in tabular tiresi rakam genişliğinde kutuda sağa yaslanır: `tabular-nums`
 * (ya da `tnum`) ve geniş harf aralığı altında talep numarası "ROT -000846",
 * Rothern ID "RC5M - 2N5T" okunuyordu. Numara / Rothern ID çizen öğe
 * `ID_TOKEN_CLASS` taşır; tabular ya da harf aralıklı bir öğenin İÇİNDE doğrudan
 * çizilen numara bu tarama tarafından kırmızıya çevrilir.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ID_TOKEN_CLASS } from "../id-token";

const SRC = join(__dirname, "..", "..");

/** Tabular rakam ya da geniş harf aralığı veren sınıf (string sınıf adı içinde). */
const SPACING_CLASS = /className=[^\n]*?(?:["'`\s(])(?:tabular-nums|tnum|tracking-wide|tracking-wider|tracking-widest)(?=["'`\s)])/;
/** JSX içinde çizilen kimlik: `{x.number}`, `{o.listingNumber ?? "—"}`, `#{r.tenderNumber}`, `{p.rothernId}`. */
const ID_EXPR = /\{[^{}]*?(?<![\w$])(?:[A-Za-z_$][\w$]*[?!]?\.)*(?:number|listingNumber|tenderNumber|orderNumber|rothernId)\b(?!\s*[(:=])[^{}]*\}/;
/** Kimlik olmayan kullanımlar: anahtar, adres, sayı biçimleyici, öznitelik. */
const NOT_RENDER = /\b(?:key|href|title|aria-[\w-]+)=\{|formatNumber|fmt\.number|\.number\(/;

/** Satır satır: tabular/harf aralıklı sınıflı bir öğenin aynı ya da sonraki iki satırında çizilen kimlik. */
function findIdTokenOffenders(source: string): number[] {
  const lines = source.split("\n");
  const out: number[] = [];
  lines.forEach((line, i) => {
    if (!SPACING_CLASS.test(line)) return;
    for (let j = i; j < Math.min(i + 3, lines.length); j++) {
      const l = lines[j]!;
      if (j > i && /className=/.test(l) && !ID_EXPR.test(l)) break; // başka bir öğeye geçildi
      if (ID_EXPR.test(l) && !NOT_RENDER.test(l)) {
        if (!lines.slice(i, j + 1).join("\n").includes("ID_TOKEN_CLASS")) out.push(i + 1);
        break;
      }
    }
  });
  return out;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" || e.name === "node_modules" ? [] : tsxFiles(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

describe("kimlik belirteci (talep / sipariş numarası, Rothern ID)", () => {
  it("sınıf orantılı rakam, normal harf aralığı ve bölünmezlik verir", () => {
    expect(ID_TOKEN_CLASS.split(" ")).toEqual(
      expect.arrayContaining(["normal-nums", "tracking-normal", "whitespace-nowrap"]),
    );
    expect(ID_TOKEN_CLASS).not.toMatch(/tabular-nums|tnum|tracking-wide|font-mono/);
  });

  it("tarayıcı eski kalıpları yakalar (düzeltmeden önceki satırlar)", () => {
    expect(findIdTokenOffenders(`<span className="tabular-nums font-medium tracking-wide text-zinc-500">{listing.number}</span>`)).toEqual([1]);
    expect(
      findIdTokenOffenders(
        `<span className="rounded-md bg-zinc-100 px-2 py-0.5 tabular-nums font-semibold whitespace-nowrap text-zinc-900">{rothernId ?? "—"}</span>`,
      ),
    ).toEqual([1]);
    expect(findIdTokenOffenders(`<p className="tabular-nums text-xs text-zinc-500">\n  #{competitive.tenderNumber}\n</p>`)).toEqual([1]);
    expect(findIdTokenOffenders(`<span className="tnum text-xs font-medium text-zinc-500">{l.number}</span>`)).toEqual([1]);
    // Düzeltilmiş hâl ve kimlik olmayan sayılar geçer.
    expect(findIdTokenOffenders(`<span className={cn(ID_TOKEN_CLASS, "font-medium")}>{l.number}</span>`)).toEqual([]);
    expect(findIdTokenOffenders(`<span className="tabular-nums">{formatNumber(n, locale)}</span>`)).toEqual([]);
    expect(findIdTokenOffenders(`<li className="tabular-nums" key={l.number}>{l.title}</li>`)).toEqual([]);
  });

  it("kaynak ağacında tabular / harf aralıklı öğe içinde doğrudan çizilen numara ya da Rothern ID yok", () => {
    const offenders = tsxFiles(SRC).flatMap((f) =>
      findIdTokenOffenders(readFileSync(f, "utf8")).map((line) => `${relative(SRC, f)}:${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
