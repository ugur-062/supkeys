"use client";

import { useSearchParams } from "next/navigation";
import { CopyLoader } from "./copy-loader";
import { TemplateLoader } from "./template-loader";
import { TenderScopeSelection } from "./tender-scope-selection";
import { TenderTypeSelection } from "./tender-type-selection";
import { TenderWizard } from "./tender-wizard";

/**
 * /dashboard/ihaleler/yeni → kapsam (yurtiçi/uluslararası) seçimi
 * /dashboard/ihaleler/yeni?scope=domestic|international → tip seçimi
 * /dashboard/ihaleler/yeni?scope=...&type=rfq|auction → wizard
 * /dashboard/ihaleler/yeni?from=<id> → kopya akışı
 * /dashboard/ihaleler/yeni?template=<id> → şablondan başlatma (madde 34)
 */
export function YeniIhaleRouter() {
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope");
  const type = searchParams.get("type");
  const from = searchParams.get("from");
  const template = searchParams.get("template");

  if (template) {
    return <TemplateLoader templateId={template} />;
  }

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
