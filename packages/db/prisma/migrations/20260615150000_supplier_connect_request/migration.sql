-- "Tedarikçi Ol" — alıcı public profilinden tedarikçi bağlantı isteği.

CREATE TYPE "ApplicationSource" AS ENUM ('SELF_REGISTER', 'TENANT_INVITE', 'CONNECT_REQUEST');
CREATE TYPE "RelationOrigin" AS ENUM ('ADMIN', 'INVITE', 'CONNECT_REQUEST');

ALTER TABLE "supplier_applications"
  ADD COLUMN "source" "ApplicationSource" NOT NULL DEFAULT 'SELF_REGISTER';

ALTER TABLE "supplier_tenant_relations"
  ADD COLUMN "origin" "RelationOrigin" NOT NULL DEFAULT 'INVITE',
  ADD COLUMN "requestedAt" TIMESTAMP(3),
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "decidedById" TEXT;

CREATE INDEX "supplier_tenant_relations_tenantId_status_origin_idx"
  ON "supplier_tenant_relations"("tenantId", "status", "origin");

ALTER TABLE "suppliers" ADD COLUMN "selfRequestUsedAt" TIMESTAMP(3);
