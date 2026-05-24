-- V2-7+ — Kalem Sorusu Şablonları + Tedarikçi Şablonları.
-- Alıcı sık kullandığı soruları ve tedarikçi gruplarını şablon olarak saklar;
-- ihale wizard'ından tek tıkla uygular.

-- ----------------------- ENUM -----------------------
CREATE TYPE "QuestionAnswerType" AS ENUM ('TEXT', 'NUMBER', 'YES_NO', 'DATE');

-- ----------------------- QuestionTemplate -----------------------
CREATE TABLE "question_templates" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "autoApply" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "question_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "question_templates_tenantId_idx" ON "question_templates"("tenantId");
CREATE INDEX "question_templates_createdById_idx" ON "question_templates"("createdById");

ALTER TABLE "question_templates"
  ADD CONSTRAINT "question_templates_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "question_templates"
  ADD CONSTRAINT "question_templates_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------- QuestionTemplateItem -----------------------
CREATE TABLE "question_template_items" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "answerType" "QuestionAnswerType" NOT NULL,
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "question_template_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "question_template_items_templateId_idx" ON "question_template_items"("templateId");

ALTER TABLE "question_template_items"
  ADD CONSTRAINT "question_template_items_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "question_templates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------- SupplierTemplate -----------------------
CREATE TABLE "supplier_templates" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "supplier_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_templates_tenantId_idx" ON "supplier_templates"("tenantId");
CREATE INDEX "supplier_templates_createdById_idx" ON "supplier_templates"("createdById");

ALTER TABLE "supplier_templates"
  ADD CONSTRAINT "supplier_templates_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_templates"
  ADD CONSTRAINT "supplier_templates_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ----------------------- SupplierTemplateMember -----------------------
CREATE TABLE "supplier_template_members" (
  "templateId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_template_members_pkey" PRIMARY KEY ("templateId", "supplierId")
);

CREATE INDEX "supplier_template_members_supplierId_idx" ON "supplier_template_members"("supplierId");

ALTER TABLE "supplier_template_members"
  ADD CONSTRAINT "supplier_template_members_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "supplier_templates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_template_members"
  ADD CONSTRAINT "supplier_template_members_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
