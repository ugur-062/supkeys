// @vitest-environment jsdom
/**
 * Derin denetim LU-31: yükleme bitince sonuç açılıştaki `images` kopyasına
 * ekleniyordu — yükleme sürerken silinen görsel geri geliyordu; yükleme
 * sürerken bırakılan ikinci parti de aynı bayat listeyle başlıyordu.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  resolvers: [] as Array<(url: string) => void>,
  mutateAsync: vi.fn(),
}));

vi.mock("@/hooks/use-company-items", () => ({
  useUploadProductImage: () => ({ mutateAsync: h.mutateAsync }),
}));
vi.mock("@/lib/image-resize", () => ({
  resizeImageFile: async (f: File) => f,
  ImageProcessingError: class extends Error {},
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { ImageUploader } from "../image-uploader";

let latest: string[] = [];
function Harness({ initial }: { initial: string[] }) {
  const [images, setImages] = useState(initial);
  latest = images;
  return <ImageUploader images={images} onChange={setImages} />;
}

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

beforeEach(() => {
  h.resolvers = [];
  h.mutateAsync.mockReset();
  h.mutateAsync.mockImplementation(
    () => new Promise<string>((res) => h.resolvers.push(res)),
  );
  // jsdom görsel çözmez — boyut okuma null'a düşsün (akışı kesmez).
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("ImageUploader — yükleme sürerken değişiklikler", () => {
  it("yükleme sürerken silinen görsel, yükleme bitince geri gelmez", async () => {
    const { container } = render(<Harness initial={["https://cdn/a.jpg", "https://cdn/b.jpg"]} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("c.jpg")] } });
    await flush();
    expect(h.resolvers).toHaveLength(1);

    // Yükleme sürerken ilk görsel kaldırılır.
    fireEvent.click(screen.getAllByTitle("Kaldır")[0]!);
    expect(latest).toEqual(["https://cdn/b.jpg"]);

    await act(async () => h.resolvers[0]!("https://cdn/c.jpg"));
    await flush();
    expect(latest).toEqual(["https://cdn/b.jpg", "https://cdn/c.jpg"]);
  });

  it("yükleme sürerken bırakılan ikinci parti yok sayılır", async () => {
    const { container } = render(<Harness initial={[]} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("a.jpg")] } });
    await flush();
    expect(h.resolvers).toHaveLength(1);

    const dropZone = container.querySelector("[class*='border-dashed']") as HTMLElement;
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [file("b.jpg")], types: ["Files"] },
    });
    await flush();
    expect(h.mutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => h.resolvers[0]!("https://cdn/a.jpg"));
    await flush();
    expect(latest).toEqual(["https://cdn/a.jpg"]);
  });
});
