// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FormProvider, useForm } from "react-hook-form";
import {
  DEFAULT_FORM_VALUES,
  type TenderFormData,
} from "@/lib/tenders/form-schema";

vi.mock("@/hooks/use-company-connections", () => ({
  useConnections: () => ({ data: [] }),
}));

import { Step4Review } from "../step-4-review";

function Harness({ values }: { values: Partial<TenderFormData> }) {
  const form = useForm<TenderFormData>({
    defaultValues: { ...DEFAULT_FORM_VALUES, ...values },
  });
  return (
    <FormProvider {...form}>
      <Step4Review onEditStep={vi.fn()} />
    </FormProvider>
  );
}

const ITEMS: TenderFormData["items"] = [
  { name: "Çelik Boru", quantity: 100, unit: "adet", targetUnitPrice: 25 },
  { name: "Bakır Tel", quantity: 50, unit: "kg", targetUnitPrice: 40 },
] as TenderFormData["items"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Step4Review — özet tablosu", () => {
  it("kalemler tabloda satır satır render edilir", () => {
    render(<Harness values={{ title: "Test Satın Alma Talebi", items: ITEMS }} />);
    expect(screen.getByText("Çelik Boru")).toBeInTheDocument();
    expect(screen.getByText("Bakır Tel")).toBeInTheDocument();
    // Başlık satırı da özette görünür.
    expect(screen.getByText("Test Satın Alma Talebi")).toBeInTheDocument();
  });

  it("kalem tablosu overflow-x-auto sarmalayıcı içinde (yatay kaydırma)", () => {
    const { container } = render(<Harness values={{ items: ITEMS }} />);
    const wrapper = container.querySelector(".overflow-x-auto");
    expect(wrapper).not.toBeNull();
    // Sarmalayıcı içinde gerçek tablo var.
    expect(wrapper?.querySelector("table")).not.toBeNull();
  });

  it("kalem başlığı kalem sayısını gösterir", () => {
    render(<Harness values={{ items: ITEMS }} />);
    expect(screen.getByText("Kalemler (2)")).toBeInTheDocument();
  });
});
