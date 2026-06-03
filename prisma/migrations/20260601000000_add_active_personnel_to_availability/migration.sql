-- Active executor config on charter availability:
-- which extra driver (if any) and helpers represent the account while available.
-- activeDriverId null = the account owner (titular) is the active driver.
ALTER TABLE "public"."charter_availability" ADD COLUMN IF NOT EXISTS "activeDriverId" TEXT;
ALTER TABLE "public"."charter_availability" ADD COLUMN IF NOT EXISTS "activeHelperIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "public"."charter_availability" ADD CONSTRAINT "charter_availability_activeDriverId_fkey" FOREIGN KEY ("activeDriverId") REFERENCES "public"."charter_drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
