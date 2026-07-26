// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistantMarkdown } from "../assistant-markdown";

describe("AssistantMarkdown", () => {
  it("**kalın** metni strong olarak render eder, ham yıldız bırakmaz", () => {
    const { container } = render(
      <AssistantMarkdown text="Sonuç: **ROT-000051** hazır." />,
    );
    expect(screen.getByText("ROT-000051").tagName).toBe("STRONG");
    expect(container.textContent).not.toContain("**");
  });

  it("- ve * satırlarını tek ul altında toplar", () => {
    const { container } = render(
      <AssistantMarkdown text={"Liste:\n- birinci\n* ikinci"} />,
    );
    const uls = container.querySelectorAll("ul");
    expect(uls).toHaveLength(1);
    expect(uls[0]!.querySelectorAll("li")).toHaveLength(2);
  });

  it("numaralı satırları ol olarak render eder, madde listesinden ayırır", () => {
    const { container } = render(
      <AssistantMarkdown text={"1. bir\n2. iki\n- madde"} />,
    );
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
    expect(container.querySelectorAll("ul li")).toHaveLength(1);
  });

  it("liste maddesi içindeki kalını da işler", () => {
    render(<AssistantMarkdown text={"1. **ROT-000045:** Geçiş testi"} />);
    expect(screen.getByText("ROT-000045:").tagName).toBe("STRONG");
  });

  it("**Başlık:** ile başlayan satırı madde sanmaz (paragraf kalır)", () => {
    const { container } = render(
      <AssistantMarkdown text="**Açık İhaleler:**" />,
    );
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("p strong")).not.toBeNull();
  });

  it("boş satırları blok ayracı sayar, kapsam dışı işareti düz metin bırakır", () => {
    const { container } = render(
      <AssistantMarkdown text={"İlk paragraf\n\n# başlık değil"} />,
    );
    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.textContent).toContain("# başlık değil");
  });
});
