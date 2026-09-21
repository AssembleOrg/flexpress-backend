-- Actividad de auditoría: último login por usuario + eventos semánticos de negocio.

ALTER TABLE "users" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

ALTER TABLE "audit_logs" ADD COLUMN "feature" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "status" TEXT;

CREATE INDEX "audit_logs_feature_idx" ON "audit_logs"("feature");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
