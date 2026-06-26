-- CreateTable
CREATE TABLE "listing_question_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_question_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_question_templates_companyId_idx" ON "listing_question_templates"("companyId");

-- AddForeignKey
ALTER TABLE "listing_question_templates" ADD CONSTRAINT "listing_question_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

