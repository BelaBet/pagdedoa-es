# Migrations

O schema deste projeto viveu por muito tempo apenas dentro do painel do
Supabase, sem estar versionado aqui. Isso ja custou caro: banco e codigo
divergiram (a coluna `ticketto_fee` virou `platform_fee` no banco e o codigo
continuou lendo o nome antigo), e o trigger `on_auth_user_created` sumiu ao
provisionar um projeto novo, quebrando todo cadastro sem aviso.

A partir de `0002`, toda mudanca de schema entra aqui antes de ir para o
banco. Numeracao sequencial, nunca editar migration ja aplicada.

## Aplicadas fora deste diretorio

Feitas direto no SQL Editor antes de comecar o versionamento:

- `on_auth_user_created`: trigger em `auth.users` que chama `handle_new_user()`.
  Estava ausente no projeto provisionado pelo Lovable.
- `handle_new_user()`: passou a so aceitar `is_tenant_founder` quando o tenant
  ainda nao tem nenhum admin. Antes, qualquer pessoa que descobrisse o
  `tenant_id` de uma igreja podia se cadastrar como admin dela.

## Pendencias conhecidas de schema

- A taxa da plataforma tem cinco definicoes e tres valores diferentes
  (`cost_centers` 4,15%, trigger de `tenant_financial_config` 3,52%,
  `fee_rules` 3,5%), e `platform_fee_config` e ignorada por um `LIMIT 0`
  no lugar de `LIMIT 1`.
- `fee_rules`, `tenant_payment_settings` e `tenant_invoices` nao tem FK para
  `tenants`; `impersonation_sessions` nao tem FK alguma.
- `email_queue_dispatch` e `email_queue_wake` apontam para uma URL de preview
  do Lovable.
