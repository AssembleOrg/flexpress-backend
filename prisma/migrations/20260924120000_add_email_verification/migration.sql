-- Confirmación de email al registrarse. No bloquea el login: las cuentas
-- existentes quedan sin confirmar y pueden pedir el mail desde la app.
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "emailVerificationTokenHash" TEXT;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "emailVerificationExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "users_emailVerificationTokenHash_key" ON "public"."users"("emailVerificationTokenHash");
