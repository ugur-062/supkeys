import { describe, expect, it } from "vitest";
import {
  coverage,
  flatten,
  hashSource,
  nextBaseline,
  orderLike,
  placeholders,
  placeholdersMatch,
  ratchetViolations,
  unflatten,
} from "../catalog";

describe("catalog helpers", () => {
  it("flatten/unflatten gidiş-dönüş ve sıra", () => {
    const tree = { a: { b: "1", c: { d: "2" } }, e: "3" };
    const flat = flatten(tree);
    expect(Object.keys(flat)).toEqual(["a.b", "a.c.d", "e"]);
    expect(unflatten(flat)).toEqual(tree);
    expect(Object.keys(flatten(tree, "ns"))).toEqual(["ns.a.b", "ns.a.c.d", "ns.e"]);
  });

  it("orderLike kaynak sırasını uygular, orphan'ı sona atar", () => {
    const ordered = orderLike({ z: "z", a: "a", extra: "x" }, { a: "", z: "" });
    expect(Object.keys(ordered)).toEqual(["a", "z", "extra"]);
  });

  it("ICU yer tutucuları ve parite", () => {
    expect(placeholders("En az {n} karakter, {count, plural, one {# öğe} other {# öğe}}")).toEqual(["count", "n"]);
    expect(placeholdersMatch("{n} gün", "{n} days")).toBe(true);
    expect(placeholdersMatch("{n} gün", "{days} days")).toBe(false);
    expect(placeholdersMatch("Kaydet", "Save")).toBe(true);
  });

  it("coverage eksik/bayat/durumsuz ayırır", () => {
    const source = { "a.x": "Merhaba", "a.y": "Dünya", "a.z": "Yeni" };
    const target = { "a.x": "Hello", "a.y": "World", "a.q": "orphan" };
    const status = {
      "a.x": { hash: hashSource("Merhaba"), status: "reviewed" as const, at: "2026-09-23" },
      "a.y": { hash: hashSource("ESKİ"), status: "machine" as const, at: "2026-09-23" },
    };
    const r = coverage(source, target, status);
    expect(r.total).toBe(3);
    expect(r.covered).toBe(1);
    expect(r.missing).toEqual(["a.z"]);
    expect(r.stale).toEqual(["a.y"]);
    expect(r.orphans).toEqual(["a.q"]);
    expect(coverage({ k: "v" }, { k: "t" }, {}).unknown).toEqual(["k"]);
  });

  it("cırcır: artış ihlal, yeni dosya sıfır olmalı, taban yalnız düşer", () => {
    const baseline = { "a.ts": 5, "b.ts": 2 };
    const current = { "a.ts": 6, "b.ts": 1, "c.ts": 1 };
    expect(ratchetViolations(current, baseline)).toEqual([
      { file: "a.ts", count: 6, baseline: 5 },
      { file: "c.ts", count: 1, baseline: 0 },
    ]);
    expect(nextBaseline(current, baseline)).toEqual({ "a.ts": 5, "b.ts": 1 });
    expect(nextBaseline(current, baseline, true)).toEqual({ "a.ts": 6, "b.ts": 1, "c.ts": 1 });
    expect(nextBaseline({ "b.ts": 0 }, baseline)).toEqual({});
  });
});
