// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SAFE_AREA_INSET_PROPS, keepSafeAreaInsets } from "./native-shell";

/**
 * Güvenli alan bekçisi (mobil denetim smoke-public#new0): 404 kabuğunda React
 * `<html>` tekilini devralırken bütün öznitelikleri siler (`style` dahil);
 * kabuğun yazdığı `--safe-area-inset-*` geri yazılmalı.
 */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function freshRoot(): HTMLElement {
  // Her test kendi kökünü kullanır (bekçi kök başına bir kez kurulur).
  const el = document.createElement("html");
  return el;
}

describe("keepSafeAreaInsets", () => {
  it("çağrıdan ÖNCE yazılmış değer, React özniteliği silince geri yazılır", async () => {
    const root = freshRoot();
    root.setAttribute("id", "__next_error__");
    root.style.setProperty("--safe-area-inset-top", "47px");
    root.style.setProperty("--safe-area-inset-bottom", "34px");
    keepSafeAreaInsets(root);
    // React `acquireSingletonInstance`: bütün öznitelikleri siler, sonra kendi özniteliklerini yazar.
    while (root.attributes.length) root.removeAttributeNode(root.attributes[0]);
    root.setAttribute("lang", "tr");
    root.setAttribute("class", "font");
    await flush();
    expect(root.style.getPropertyValue("--safe-area-inset-top")).toBe("47px");
    expect(root.style.getPropertyValue("--safe-area-inset-bottom")).toBe("34px");
    expect(root.getAttribute("lang")).toBe("tr");
    expect(root.getAttribute("class")).toBe("font");
    expect(root.hasAttribute("id")).toBe(false);
  });

  it("çağrıdan SONRA yazılan değer de izlenir; kabuğun yeni değeri (döndürme) kazanır", async () => {
    const root = freshRoot();
    keepSafeAreaInsets(root);
    root.style.setProperty("--safe-area-inset-top", "47px");
    await flush();
    root.style.setProperty("--safe-area-inset-top", "0px");
    root.style.setProperty("--safe-area-inset-left", "47px");
    await flush();
    root.removeAttribute("style");
    await flush();
    expect(root.style.getPropertyValue("--safe-area-inset-top")).toBe("0px");
    expect(root.style.getPropertyValue("--safe-area-inset-left")).toBe("47px");
  });

  it("pay hiç yazılmadıysa (tarayıcı) hiçbir şey yazmaz; başka stil özellikleri ellenmez", async () => {
    const root = freshRoot();
    keepSafeAreaInsets(root);
    root.style.setProperty("overflow", "hidden");
    await flush();
    root.removeAttribute("style");
    await flush();
    expect(root.getAttribute("style")).toBeNull();
    for (const prop of SAFE_AREA_INSET_PROPS) expect(root.style.getPropertyValue(prop)).toBe("");
  });

  it("aynı kökte tekrar çağrı ikinci gözlemci kurmaz; geçersiz kök sessizce geçilir", async () => {
    const root = freshRoot();
    root.style.setProperty("--safe-area-inset-top", "20px");
    keepSafeAreaInsets(root);
    keepSafeAreaInsets(root);
    keepSafeAreaInsets(null);
    keepSafeAreaInsets(undefined);
    root.removeAttribute("style");
    await flush();
    expect(root.style.getPropertyValue("--safe-area-inset-top")).toBe("20px");
  });
});
