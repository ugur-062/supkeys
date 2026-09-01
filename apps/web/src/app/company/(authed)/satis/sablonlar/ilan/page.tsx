"use client";

import { ListingTemplatesView } from "@/components/company/templates-view";

export default function Page() {
  return (
    <ListingTemplatesView type="SATIS" basePath="/company/satis/sablonlar" />
  );
}
