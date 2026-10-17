// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ segments: [] as string[] }));
vi.mock("next/navigation", () => ({
  useSelectedLayoutSegments: () => h.segments,
}));

import { NEXT_TREE_KEY } from "@/lib/popstate-restore-guard";
import { PopstateRestoreGuard } from "../popstate-restore-guard";

const tree = (leaf: [string, string]) => [
  "",
  {
    children: [
      ["locale", "tr", "d"],
      { children: ["company", { children: [leaf[0], { children: [leaf[1], { children: ["__PAGE__", {}] }] }] }] },
    ],
  },
];
const LIST = tree(["satinalma", "siparisler"]);
const DETAIL = tree(["siparis", "abc"]);
const stateOf = (t: unknown) => ({ __NA: true, [NEXT_TREE_KEY]: t });

afterEach(() => {
  h.segments = [];
});

// D-283: bileşen işlenmiş ağaç değişince denetler; bayat yama listeyi ezince onarır.
describe("PopstateRestoreGuard", () => {
  it("Geri sonrası ağaç detaya dönerse popstate'i listenin ağacıyla yeniden gönderir", () => {
    const seen: unknown[] = [];
    const onPop = (e: PopStateEvent) => seen.push(e.state);
    window.addEventListener("popstate", onPop);
    window.history.replaceState(null, "", "/company/satinalma/siparisler");

    h.segments = ["company", "siparis", "abc"];
    const { rerender, unmount } = render(<PopstateRestoreGuard />);

    window.history.replaceState(stateOf(LIST), "", window.location.href);
    window.dispatchEvent(new PopStateEvent("popstate", { state: stateOf(LIST) }));
    seen.length = 0;

    h.segments = ["company", "satinalma", "siparisler"]; // geri yükleme işlendi
    rerender(<PopstateRestoreGuard />);
    expect(seen).toHaveLength(0);

    window.history.replaceState(stateOf(DETAIL), "", window.location.href); // bayat yama
    h.segments = ["company", "siparis", "abc"];
    rerender(<PopstateRestoreGuard />);
    expect(seen).toHaveLength(1);

    unmount();
    window.removeEventListener("popstate", onPop);
  });
});
