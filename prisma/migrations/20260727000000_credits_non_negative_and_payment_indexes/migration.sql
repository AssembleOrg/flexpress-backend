-- Invariante de negocio a nivel base: el saldo nunca puede quedar negativo.
-- La lógica de la app ya descuenta con el saldo en el WHERE, pero esto es la
-- última red: si alguna vez se agrega un camino de descuento sin esa condición,
-- la transacción falla en vez de dejar créditos en negativo.
-- Verificado antes de aplicar: 0 filas con credits < 0.
ALTER TABLE "users"
  ADD CONSTRAINT "users_credits_non_negative" CHECK ("credits" >= 0);

-- payments se consulta por usuario (getPaymentsByUserId) y por estado
-- (getPendingCount, findAll del panel admin) y no tenía ningún índice.
CREATE INDEX "payments_userId_idx" ON "payments"("userId");
CREATE INDEX "payments_status_idx" ON "payments"("status");
