// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUARD_WINDOW_MS,
  MAX_REPAIRS,
  NEXT_TREE_KEY,
  installPopstateRestoreGuard,
  treeSegmentPath,
  type PopstateRestoreGuard,
} from "../popstate-restore-guard";

// Next'in FlightRouterState biçimi: [segment, { children: alt }, url?, marker?]
const page = (marker?: string) => ["__PAGE__", {}, ...(marker ? ["/x", marker] : [])];
const LIST_TREE = [
  "",
  {
    children: [
      ["locale", "tr", "d"],
      {
        children: [
          "company",
          { children: ["(authed)", { children: ["satinalma", { children: ["siparisler", { children: page() }] }] }] },
        ],
      },
    ],
  },
];
const DETAIL_TREE = [
  "",
  {
    children: [
      ["locale", "tr", "d"],
      {
        children: [
          "company",
          {
            children: [
              "(authed)",
              { children: ["siparis", { children: [["id", "abc", "d"], { children: page("refresh") }] }] },
            ],
          },
        ],
      },
    ],
  },
];
const LIST = ["company", "(authed)", "satinalma", "siparisler"];
const DETAIL = ["company", "(authed)", "siparis", "abc"];

const stateOf = (tree: unknown) => ({ __NA: true, [NEXT_TREE_KEY]: tree });

/** Next'in HistoryUpdater'ı gibi: işlenen ağacı geçerli girdiye yazar. */
function commit(tree: unknown) {
  window.history.replaceState(stateOf(tree), "", window.location.href);
}

describe("treeSegmentPath", () => {
  it("useSelectedLayoutSegments ile aynı yolu verir (dinamik → değer, __PAGE__'de durur)", () => {
    expect(treeSegmentPath(LIST_TREE)).toEqual(["tr", ...LIST]);
    expect(treeSegmentPath(DETAIL_TREE)).toEqual(["tr", ...DETAIL]);
  });

  it("tanınmayan girdi → null", () => {
    expect(treeSegmentPath(undefined)).toBeNull();
    expect(treeSegmentPath("x")).toBeNull();
    expect(treeSegmentPath([""])).toBeNull();
  });
});

describe("installPopstateRestoreGuard (D-283)", () => {
  let segments: string[];
  let guard: PopstateRestoreGuard;
  let restores: Array<unknown>;
  const nextListener = (e: PopStateEvent) => restores.push(e.state);

  beforeEach(() => {
    vi.useFakeTimers();
    restores = [];
    window.history.replaceState(null, "", "/company/satinalma/siparisler");
    segments = DETAIL; // Geri'ye basıldığı an ekranda detay var
    // Next'in kendi popstate dinleyicisini temsil eder.
    window.addEventListener("popstate", nextListener);
    guard = installPopstateRestoreGuard({ getSegments: () => segments, depth: 1 });
  });

  afterEach(() => {
    guard.dispose();
    window.removeEventListener("popstate", nextListener);
    vi.useRealTimers();
  });

  /** Tarayıcı Geri'yi işler: adres liste, olay listenin ağacını taşır. */
  function back() {
    commit(LIST_TREE);
    window.dispatchEvent(new PopStateEvent("popstate", { state: stateOf(LIST_TREE) }));
    restores.length = 0; // gerçek olayı sayma, yalnız onarımı say
  }

  it("bayat yama listeyi detayla ezerse aynı geri yüklemeyi yeniden tetikler", () => {
    back();
    // Geri yükleme işlendi: liste.
    segments = LIST;
    guard.check();
    expect(restores).toHaveLength(0);
    // Bayat sunucu yaması: ağaç detaya döner, Next girdiye detay ağacını yazar, adres liste kalır.
    commit(DETAIL_TREE);
    segments = DETAIL;
    guard.check();
    expect(restores).toHaveLength(1);
    expect(treeSegmentPath((restores[0] as Record<string, unknown>)[NEXT_TREE_KEY])).toEqual(["tr", ...LIST]);
    // Geçmiş girdisi popstate'in ağacına geri yazıldı.
    expect(treeSegmentPath((window.history.state as Record<string, unknown>)[NEXT_TREE_KEY])).toEqual([
      "tr",
      ...LIST,
    ]);
  });

  it("ara durum hiç çizilmese de (toplu geçiş) zamanlayıcı yakalar", () => {
    back();
    commit(DETAIL_TREE); // segmentler hiç değişmedi (hep detay)
    vi.advanceTimersByTime(400);
    expect(restores).toHaveLength(1);
  });

  it("geri yükleme henüz sürüyorsa (geçmiş durumu popstate'inkiyle aynı) dokunmaz", () => {
    back();
    vi.advanceTimersByTime(5000); // liste verisi yükleniyor, ekran hâlâ detay
    expect(restores).toHaveLength(0);
  });

  it("doğru geri yüklemede hiçbir şey yapmaz", () => {
    back();
    segments = LIST;
    guard.check();
    vi.advanceTimersByTime(5000);
    expect(restores).toHaveLength(0);
  });

  it("yol değiştiyse (yeni gezinme) ya da pencere kapandıysa durur", () => {
    back();
    window.history.pushState(stateOf(DETAIL_TREE), "", "/company/siparis/abc");
    guard.check();
    expect(restores).toHaveLength(0);

    window.history.replaceState(null, "", "/company/satinalma/siparisler");
    back();
    vi.advanceTimersByTime(GUARD_WINDOW_MS + 1);
    commit(DETAIL_TREE);
    guard.check();
    expect(restores).toHaveLength(0);
  });

  it("döngüye girmez: bir Geri için en çok MAX_REPAIRS onarım", () => {
    back();
    for (let i = 0; i < MAX_REPAIRS + 3; i++) {
      commit(DETAIL_TREE);
      segments = DETAIL;
      guard.check();
    }
    expect(restores).toHaveLength(MAX_REPAIRS);
  });

  it("Next dışı durumlu popstate (state yok / __NA yok) yok sayılır", () => {
    window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    window.dispatchEvent(new PopStateEvent("popstate", { state: { foo: 1 } }));
    commit(DETAIL_TREE);
    guard.check();
    vi.advanceTimersByTime(5000);
    expect(restores.filter((s) => s && (s as { __NA?: boolean }).__NA)).toHaveLength(0);
  });

  it("dispose sonrası dinlemez", () => {
    guard.dispose();
    back();
    commit(DETAIL_TREE);
    vi.advanceTimersByTime(5000);
    expect(restores).toHaveLength(0);
  });
});
