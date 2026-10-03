import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Derin denetim MU-21 (gözden geçirme): mutasyon hataları `toastApiError`
 * kapısından geçmeli. Aksi halde interceptor'ın zaten toast'ladığı
 * 403/409/5xx/ağ hatasında ikinci toast çıkar, 400+errors'ta doğrulama sebebi
 * yerine genel metin/ham "Request failed with status code 400" görünür.
 */
const SRC = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const BANNED: Array<[string, RegExp]> = [
  ["onError -> toast.error (use toastApiError)", /onError:\s*\([^)]*\)\s*=>\s*toast\.error\(/],
  ["raw e.message toast (use toastApiError)", /instanceof Error\s*\?\s*\w+\.message\s*:/],
];

describe("admin: raw mutation error toasts", () => {
  it("no page bypasses toastApiError", () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const [label, re] of BANNED) {
          if (re.test(line)) hits.push(`${relative(SRC, file)}:${i + 1} ${label}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});
