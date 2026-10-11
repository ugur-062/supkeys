// @vitest-environment jsdom
/**
 * Derin denetim S085 — kalem sorularında 20 tavanı (şema + backend
 * `@ArrayMaxSize(20)`) arayüzde uygulanmıyordu: ekleme sınırsızdı, aşan dizi
 * yayında yalnız genel "eksik" uyarısı veriyordu. Şablon adının varsayılanı
 * (talep başlığı, 200 karaktere kadar) API'nin 120 tavanını aşabiliyordu.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FORM_VALUES, MAX_ITEM_QUESTIONS, type TenderFormData } from "@/lib/tenders/form-schema";

const h = vi.hoisted(() => ({
  /** Şablon listesi sorgusu (gerçek sözleşme: yanıt yokken `data` undefined). */
  templates: { data: [] as unknown[] | undefined, isLoading: false, isPending: false, isError: false, refetch: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/hooks/use-templates", () => ({
  useQuestionTemplates: () => h.templates,
  useQuestionTemplate: () => ({ data: undefined, isLoading: false }),
  useSaveQuestionTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ItemQuestionModal } from "../item-question-modal";
import { SaveTemplateDialog } from "../save-template-dialog";

function Harness({ count }: { count: number }) {
  const f = useForm<TenderFormData>({
    defaultValues: {
      ...DEFAULT_FORM_VALUES,
      items: [
        {
          ...DEFAULT_FORM_VALUES.items[0]!,
          name: "Kalem",
          questions: Array.from({ length: count }, (_, i) => ({ id: `q${i}`, text: `Soru ${i}`, answerType: "TEXT" as const, required: true })),
        },
      ],
    },
  });
  return (
    <FormProvider {...f}>
      <ItemQuestionModal open onClose={() => {}} index={0} />
    </FormProvider>
  );
}

beforeEach(() => {
  h.templates = { data: [], isLoading: false, isPending: false, isError: false, refetch: vi.fn() };
});

describe("ItemQuestionModal — şablon seçici liste durumları (canlı doğrulama 2026-10-09 taraması)", () => {
  const openPicker = async () => {
    render(<Harness count={1} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Şablondan Soru Ekle/ }));
  };

  it("şablonlar okunamadıysa 'Kayıtlı soru şablonunuz yok' değil hata + Tekrar dene", async () => {
    h.templates = { data: undefined, isLoading: false, isPending: false, isError: true, refetch: vi.fn() };
    await openPicker();
    expect(screen.queryByText("Kayıtlı soru şablonunuz yok.")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(h.templates.refetch).toHaveBeenCalledTimes(1);
  });

  it("çevrimdışı duraklayan sorguda (istek yok, hata yok, veri yok) 'yükleniyor'", async () => {
    h.templates = { data: undefined, isLoading: false, isPending: true, isError: false, refetch: vi.fn() };
    await openPicker();
    expect(screen.queryByText("Kayıtlı soru şablonunuz yok.")).toBeNull();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("BAŞARILI ve boş yanıt boş durumu çizer", async () => {
    await openPicker();
    expect(screen.getByText("Kayıtlı soru şablonunuz yok.")).toBeInTheDocument();
  });
});

describe("ItemQuestionModal — soru tavanı (S085)", () => {
  it("tavanın altında 'Soru Ekle' açık; tavana ulaşınca kapanır ve neden yazılır", async () => {
    const user = userEvent.setup();
    render(<Harness count={MAX_ITEM_QUESTIONS - 1} />);
    const add = screen.getByRole("button", { name: /^Soru Ekle$/ });
    expect(add).toBeEnabled();
    expect(screen.queryByText(/en fazla 20 soru/)).toBeNull();
    await user.click(add);
    expect(screen.getByRole("button", { name: /^Soru Ekle$/ })).toBeDisabled();
    expect(screen.getByText(/en fazla 20 soru/)).toBeInTheDocument();
  });
});

describe("SaveTemplateDialog — varsayılan ad tavanı (S085)", () => {
  it("uzun talep başlığı varsayılan adda 100 karaktere kırpılır", () => {
    render(<SaveTemplateDialog open onClose={() => {}} onSave={() => {}} isSaving={false} defaultName={"A".repeat(150)} />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toHaveLength(100);
  });
});
