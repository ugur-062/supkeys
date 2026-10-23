/**
 * Faz 3 codemod — NestJS istisna mesajlarını katalog anahtarına çevirir.
 *   npx tsx .tmp-api-codemod.ts [--write] [--catalog <tr/api.json>] <dosya...>
 * `throw new BadRequestException("Türkçe")` → `throw new BadRequestException(i18nMessage("api.<modül>.<anahtar>"))`
 * Şablon dizeler (`${x}`) → ICU yer tutucu. Nesne argümanı ({ message, code }) → message anahtarlanır.
 */
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const WRITE = args.includes("--write"); const CATALOG = opt("--catalog");
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--catalog");
const EXC = /^(BadRequestException|NotFoundException|ForbiddenException|ConflictException|UnauthorizedException|ServiceUnavailableException|UnprocessableEntityException|GoneException|PayloadTooLargeException)$/;
const TR_MAP: Record<string,string> = {ç:"c",ğ:"g",ı:"i",ö:"o",ş:"s",ü:"u",Ç:"C",Ğ:"G",İ:"I",Ö:"O",Ş:"S",Ü:"U",â:"a",î:"i",û:"u"};
const fold = (s: string) => s.replace(/[çğışöüÇĞİŞÖÜâîû]/g, (c) => TR_MAP[c] ?? c);
const LETTER = /[A-Za-zçğışöüÇĞİŞÖÜ]/;
const icuEscape = (s: string) => s.replace(/'/g, "''").replace(/\{/g, "'{'").replace(/\}/g, "'}'");
function keyFor(text: string, used: Map<string,string>): string {
  const norm = text.replace(/\s+/g, " ").trim();
  for (const [k, v] of used) if (v === norm) return k;
  const words = fold(norm).replace(/\{[^}]*\}/g, " ").replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 6);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join("") || "message";
  if (/^[0-9]/.test(base)) base = "n" + base;
  base = base.slice(0, 48); let key = base; let n = 2;
  while (used.has(key)) key = `${base}${n++}`;
  used.set(key, norm); return key;
}
function moduleOf(file: string): string {
  const m = /src\/modules\/([^/]+)\//.exec(file) ?? /src\/common\/([^/]+)\//.exec(file);
  return (m ? m[1]! : "common").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
const catalogAdd: Record<string,string> = {}; const reports: string[] = [];
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const ns = `api.${moduleOf(file)}`; const used = new Map<string,string>();
  const edits: { start: number; end: number; text: string }[] = [];
  let needImport = false;
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  function convert(arg: ts.Expression): string | null {
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
      if (!LETTER.test(arg.text) || arg.text.trim().length < 3) return null;
      const key = keyFor(arg.text, used); catalogAdd[`${ns}.${key}`] = icuEscape(arg.text.trim());
      return `i18nMessage("${ns}.${key}")`;
    }
    if (ts.isTemplateExpression(arg)) {
      const taken = new Set<string>(); const vals: string[] = []; let msg = icuEscape(arg.head.text);
      for (const sp of arg.templateSpans) {
        const e = sp.expression; let name: string | null = null;
        if (ts.isIdentifier(e)) name = e.text; else if (ts.isPropertyAccessExpression(e)) name = e.name.text; else if (ts.isCallExpression(e) && (ts.isIdentifier(e.expression) || ts.isPropertyAccessExpression(e.expression))) name = ts.isIdentifier(e.expression) ? e.expression.text : e.expression.name.text;
        if (!name) return null;
        name = name.replace(/[^A-Za-z0-9]/g, "") || "v"; let nm = name; let i = 2; while (taken.has(nm)) nm = `${name}${i++}`; taken.add(nm);
        vals.push(`${nm}: ${e.getText()}`); msg += `{${nm}}` + icuEscape(sp.literal.text);
      }
      if (!LETTER.test(msg)) return null;
      const key = keyFor(msg, used); catalogAdd[`${ns}.${key}`] = msg.replace(/\s+/g, " ").trim();
      return `i18nMessage("${ns}.${key}", { ${vals.join(", ")} })`;
    }
    return null;
  }
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && EXC.test(node.expression.text) && node.arguments?.length) {
      const a0 = node.arguments[0]!;
      if (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0) || ts.isTemplateExpression(a0)) {
        const rep = convert(a0);
        if (rep) { edits.push({ start: a0.getStart(), end: a0.getEnd(), text: rep }); needImport = true; }
        else reports.push(`${file.split("/").pop()}:${line(a0)} karmaşık: ${a0.getText().slice(0, 80)}`);
        return;
      }
      if (ts.isObjectLiteralExpression(a0)) {
        const msg = a0.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === "message");
        if (msg && (ts.isStringLiteral(msg.initializer) || ts.isTemplateExpression(msg.initializer) || ts.isNoSubstitutionTemplateLiteral(msg.initializer))) {
          const rep = convert(msg.initializer);
          const code = a0.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === "code");
          if (rep) {
            // { message, code, ...rest } → { ...i18nMessage(key, vals, code), ...rest }
            const rest = a0.properties.filter((p) => p !== msg && p !== code).map((p) => p.getText());
            const codeArg = code ? `, ${code.initializer.getText()}` : "";
            const call = rep.replace(/\)$/, "") + (rep.includes(", {") ? "" : ", undefined") + codeArg + ")";
            edits.push({ start: a0.getStart(), end: a0.getEnd(), text: rest.length ? `{ ...${call}, ${rest.join(", ")} }` : call }); needImport = true;
          } else reports.push(`${file.split("/").pop()}:${line(a0)} karmaşık nesne: ${msg.initializer.getText().slice(0, 80)}`);
        }
        return;
      }
      if (ts.isIdentifier(a0) || ts.isCallExpression(a0)) { reports.push(`${file.split("/").pop()}:${line(a0)} ifade: ${a0.getText().slice(0, 80)}`); return; }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) { continue; }
  edits.sort((a, b) => b.start - a.start);
  let out = src; for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (needImport && !/i18nMessage\b[^;]*from "[^"]*http-i18n"/.test(out)) {
    const rel = file.includes("/modules/") ? "../".repeat(file.split("/modules/")[1]!.split("/").length - 1) + "../common/i18n/http-i18n" : "./http-i18n";
    const idx = out.search(/^import /m); out = out.slice(0, idx) + `import { i18nMessage } from "${rel.replace(/^\.\.\/\.\.\/common/, "../../common")}";\n` + out.slice(idx);
  }
  if (WRITE) writeFileSync(file, out);
  console.log(`✔ ${file}: ${edits.length} istisna (${ns})`);
}
if (CATALOG && WRITE) {
  const cat = JSON.parse(readFileSync(CATALOG, "utf8")); let added = 0;
  for (const [k, v] of Object.entries(catalogAdd)) { const parts = k.split(".").slice(1); let node: any = cat; for (const p of parts.slice(0, -1)) { if (typeof node[p] !== "object" || node[p] === null) node[p] = {}; node = node[p]; } if (node[parts.at(-1)!] === undefined) added++; node[parts.at(-1)!] = v; }
  writeFileSync(CATALOG, JSON.stringify(cat, null, 2) + "\n"); console.log(`katalog: ${added} yeni anahtar`);
} else console.log(`--- katalog ${Object.keys(catalogAdd).length} anahtar`);
if (reports.length) { console.log(`--- RAPOR (${reports.length})`); for (const r of reports.slice(0, 40)) console.log("  " + r); }
