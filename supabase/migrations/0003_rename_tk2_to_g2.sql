-- Renomeia a nomenclatura TK2 para G2 nas colunas de taxa operacional.
--
-- ORDEM DE APLICAÇÃO — importante:
--   1. Rodar este SQL no banco.
--   2. Só então subir o código que usa os nomes novos.
-- O inverso derruba todo registro de pagamento, porque as funções de split
-- gravam nessas colunas em cada transação.
--
-- Todas as instruções são idempotentes: se a coluna já foi renomeada, o
-- bloco é ignorado em vez de dar erro.

do $$
begin
  -- payments: valor da taxa operacional cobrada na transação
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'tk2_op_fee'
  ) then
    alter table public.payments rename column tk2_op_fee to g2_op_fee;
  end if;

  -- platform_fee_config: parâmetros globais
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_fee_config'
      and column_name = 'tk2_operacional_fixo'
  ) then
    alter table public.platform_fee_config rename column tk2_operacional_fixo to g2_operacional_fixo;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'platform_fee_config'
      and column_name = 'tk2_op_percent'
  ) then
    alter table public.platform_fee_config rename column tk2_op_percent to g2_op_percent;
  end if;

  -- tenant_fee_config: mesmos parâmetros, por igreja
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_fee_config'
      and column_name = 'tk2_operacional_fixo'
  ) then
    alter table public.tenant_fee_config rename column tk2_operacional_fixo to g2_operacional_fixo;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_fee_config'
      and column_name = 'tk2_op_percent'
  ) then
    alter table public.tenant_fee_config rename column tk2_op_percent to g2_op_percent;
  end if;

  -- fee_rules: regras por método de pagamento
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fee_rules' and column_name = 'tk2_op_fixed'
  ) then
    alter table public.fee_rules rename column tk2_op_fixed to g2_op_fixed;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fee_rules' and column_name = 'tk2_op_percent'
  ) then
    alter table public.fee_rules rename column tk2_op_percent to g2_op_percent;
  end if;
end $$;

-- Confere o resultado. Deve retornar sete linhas, todas com prefixo g2_.
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and column_name like 'g2\_%'
order by table_name, column_name;
