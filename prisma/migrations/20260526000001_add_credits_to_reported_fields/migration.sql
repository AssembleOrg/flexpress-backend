ALTER TABLE "public"."reports" ADD COLUMN IF NOT EXISTS "creditsToReported" INTEGER;
ALTER TABLE "public"."reports" ADD COLUMN IF NOT EXISTS "creditsFromReporter" INTEGER;
