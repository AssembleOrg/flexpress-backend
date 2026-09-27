-- Recuperación de contraseña por mail. El token se guarda hasheado (sha256).
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "passwordResetTokenHash" TEXT;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "passwordResetExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_passwordResetTokenHash_key" ON "public"."users"("passwordResetTokenHash");
