"use client";

import { useSearchParams } from "next/navigation";
import { CopyLoader } from "./copy-loader";
import { TenderScopeSelection } from "./tender-scope-selection";
import { TenderTypeSelection } from "./tender-type-selection";
import { TenderWizard } from "./tender-wizard";

/**
 * /dashboard/ihaleler/yeni → kapsam (yurtiçi/uluslararası) seçimi
 * /dashboard/ihaleler/yeni?scope=domestic|international → tip seçimi
 * /dashboard/ihaleler/yeni?scope=...&type=rfq|auction → wizard
 * /dashboard/ihaleler/yeni?from=<id> → kopya akışı
 */
export function YeniIhaleRouter() {
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope");
  const type = searchParams.get("type");
  const from = searchParams.get("from");

  if (from) {
    return <CopyLoader sourceId={from} />;
  }

  const hasScope = scope === "domestic" || scope === "international";

  if (hasScope && (type === "rfq" || type === "auction")) {
    return <TenderWizard mode="create" />;
  }

  if (hasScope) {
    return <TenderTypeSelection />;
  }

  return <TenderScopeSelection />;
}
