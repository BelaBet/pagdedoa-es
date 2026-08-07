-- Renomeia a coluna de taxa da plataforma, removendo o resíduo da marca antiga.
--
-- APLICAR APENAS NO BANCO NOVO, antes de existir dado em produção.
-- Depois de rodar, é obrigatório:
--   1. regenerar src/integrations/supabase/types.ts
--   2. trocar `ticketto_fee` por `platform_fee` em:
--        src/lib/recipient.functions.ts   (linhas ~325, 333, 338, 421, 427, 438, 476)
--        src/lib/payments.functions.ts    (linha ~198)
--        src/lib/boleto.functions.ts      (linha ~171)
--
-- Confirme os nomes das tabelas antes de rodar — ajuste se o schema novo divergir.

alter table public.payments
  rename column ticketto_fee to platform_fee;

-- A coluna tk2_op_fee também carrega nome de terceiro (TK2). Se a operação
-- desse produto não passa mais pelo TK2, considere renomear ou remover:
-- alter table public.payments rename column tk2_op_fee to operator_fee;
