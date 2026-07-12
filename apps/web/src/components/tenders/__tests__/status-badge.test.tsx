// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  LISTING_STATUS_LABELS,
  TenderStatusBadge,
  TenderTypeBadge,
} from "../status-badge";

describe("TenderStatusBadge", () => {
  it("her durum için TR etiketini gösterir", () => {
    render(<TenderStatusBadge status="OPEN" />);
    expect(screen.getByText(LISTING_STATUS_LABELS.OPEN)).toBeInTheDocument();
  });

  it("CLOSED → 'Teklife Kapalı'", () => {
    render(<TenderStatusBadge status="CLOSED" />);
    expect(
      screen.getByText(LISTING_STATUS_LABELS.CLOSED),
    ).toBeInTheDocument();
  });

  it("bilinmeyen durum DRAFT etiketine düşer (kırılmaz)", () => {
    render(<TenderStatusBadge status={"WAT" as never} />);
    expect(screen.getByText(LISTING_STATUS_LABELS.DRAFT)).toBeInTheDocument();
  });
});

describe("TenderTypeBadge", () => {
  it("RFQ → 'Teklif Toplama'", () => {
    render(<TenderTypeBadge format="RFQ" />);
    expect(screen.getByText("Teklif Toplama")).toBeInTheDocument();
  });

  it("ENGLISH_AUCTION → 'Pazarlık'", () => {
    render(<TenderTypeBadge format="ENGLISH_AUCTION" />);
    expect(screen.getByText("Pazarlık")).toBeInTheDocument();
  });

  it("null format → RFQ varsayılanı", () => {
    render(<TenderTypeBadge format={null} />);
    expect(screen.getByText("Teklif Toplama")).toBeInTheDocument();
  });
});
