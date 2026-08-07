-- Meta de doação por evento, padrinhos e doação de itens.
--
-- Padrinhos e doação de comida são a mesma estrutura: alguém se compromete
-- com uma necessidade da festa. A diferença é apenas se o compromisso é em
-- dinheiro (padrinho do som) ou em item (20 bolos). Por isso: uma tabela de
-- necessidades e uma de promessas, não quatro tabelas paralelas.
--
-- DECISÃO IMPORTANTE: promessa NÃO é doação. Quem promete um bolo pode não
-- trazer. Se isso entrasse em `donations`, o total do tesoureiro deixaria de
-- bater com o extrato bancário. Ficam separadas de propósito.

-- ---------------------------------------------------------------
-- 1. Meta de arrecadação no evento
-- ---------------------------------------------------------------
alter table public.events
  add column if not exists goal_amount numeric(10,2)
  check (goal_amount is null or goal_amount > 0);

comment on column public.events.goal_amount is
  'Meta de arrecadação. NULL = evento sem meta. O arrecadado vem de donations.campaign_id.';

-- ---------------------------------------------------------------
-- 2. Tipos
-- ---------------------------------------------------------------
do $$ begin
  create type public.event_need_kind as enum ('sponsorship', 'item');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_pledge_status as enum ('promised', 'fulfilled', 'cancelled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
-- 3. Necessidades da festa
-- ---------------------------------------------------------------
create table if not exists public.event_needs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  event_id          uuid not null references public.events(id) on delete cascade,
  kind              public.event_need_kind not null,
  title             text not null,
  description       text,
  -- Para 'item': quantas unidades a festa precisa. Para 'sponsorship':
  -- quantas cotas existem (1 = padrinho único).
  target_quantity   integer not null default 1 check (target_quantity >= 1),
  unit              text,
  -- Só para 'sponsorship': valor de cada cota.
  amount_per_unit   numeric(10,2) check (amount_per_unit is null or amount_per_unit > 0),
  display_order     integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint event_needs_sponsorship_has_amount
    check (kind <> 'sponsorship' or amount_per_unit is not null)
);

create index if not exists event_needs_event_idx on public.event_needs (event_id);
create index if not exists event_needs_tenant_idx on public.event_needs (tenant_id);

-- ---------------------------------------------------------------
-- 4. Promessas
-- ---------------------------------------------------------------
create table if not exists public.event_pledges (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  event_id       uuid not null references public.events(id) on delete cascade,
  need_id        uuid not null references public.event_needs(id) on delete cascade,
  -- Preenchido pelo próprio voluntário na página pública. profile_id fica
  -- nulo quando quem promete não tem conta.
  profile_id     uuid references public.profiles(id) on delete set null,
  pledger_name   text not null check (length(btrim(pledger_name)) between 2 and 120),
  pledger_phone  text check (pledger_phone is null or length(pledger_phone) <= 20),
  pledger_email  text check (pledger_email is null or pledger_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  quantity       integer not null default 1 check (quantity between 1 and 999),
  amount         numeric(10,2) check (amount is null or amount > 0),
  note           text check (note is null or length(note) <= 500),
  status         public.event_pledge_status not null default 'promised',
  confirmed_at   timestamptz,
  confirmed_by   uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists event_pledges_need_idx on public.event_pledges (need_id);
create index if not exists event_pledges_event_idx on public.event_pledges (event_id);
create index if not exists event_pledges_tenant_idx on public.event_pledges (tenant_id);

-- ---------------------------------------------------------------
-- 5. Triggers de manutenção
-- ---------------------------------------------------------------
drop trigger if exists event_needs_set_updated_at on public.event_needs;
create trigger event_needs_set_updated_at
  before update on public.event_needs
  for each row execute function public.set_updated_at();

drop trigger if exists event_pledges_set_updated_at on public.event_pledges;
create trigger event_pledges_set_updated_at
  before update on public.event_pledges
  for each row execute function public.set_updated_at();

-- Coerência: o tenant e o evento da promessa têm de ser os da necessidade.
-- Sem isto, um POST anônimo poderia associar a promessa a outra igreja.
create or replace function public.event_pledges_enforce_parent()
returns trigger language plpgsql security definer set search_path to 'public'
as $eape$
declare _tenant uuid; _event uuid; _ativo boolean;
begin
  select n.tenant_id, n.event_id, n.is_active
    into _tenant, _event, _ativo
  from public.event_needs n where n.id = NEW.need_id;

  if _tenant is null then
    raise exception 'Necessidade inexistente.';
  end if;
  if not _ativo then
    raise exception 'Esta necessidade não está mais aberta.';
  end if;

  NEW.tenant_id := _tenant;
  NEW.event_id  := _event;
  return NEW;
end; $eape$;

drop trigger if exists event_pledges_enforce_parent_trg on public.event_pledges;
create trigger event_pledges_enforce_parent_trg
  before insert or update on public.event_pledges
  for each row execute function public.event_pledges_enforce_parent();

-- ---------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------
alter table public.event_needs   enable row level security;
alter table public.event_pledges enable row level security;

-- Necessidades: visitante vê as ativas de eventos publicados.
drop policy if exists event_needs_public_select on public.event_needs;
create policy event_needs_public_select on public.event_needs
  for select to anon, authenticated
  using (
    is_active
    and exists (
      select 1 from public.events e
      where e.id = event_needs.event_id and e.status <> 'draft'::public.event_status
    )
  );

drop policy if exists event_needs_staff_all on public.event_needs;
create policy event_needs_staff_all on public.event_needs
  for all to authenticated
  using (public.is_tenant_staff(auth.uid(), tenant_id) or public.is_platform_admin(auth.uid()))
  with check (public.is_tenant_staff(auth.uid(), tenant_id) or public.is_platform_admin(auth.uid()));

-- Promessas: qualquer pessoa pode se oferecer, mas NINGUÉM anônimo lê.
-- Nome e telefone de quem promete são dados pessoais; a página pública
-- mostra apenas o total agregado, via a função da seção 7.
drop policy if exists event_pledges_public_insert on public.event_pledges;
create policy event_pledges_public_insert on public.event_pledges
  for insert to anon, authenticated
  with check (
    status = 'promised'::public.event_pledge_status
    and confirmed_at is null
    and confirmed_by is null
    and exists (
      select 1
      from public.event_needs n
      join public.events e on e.id = n.event_id
      where n.id = event_pledges.need_id
        and n.is_active
        and e.status <> 'draft'::public.event_status
    )
  );

drop policy if exists event_pledges_staff_read on public.event_pledges;
create policy event_pledges_staff_read on public.event_pledges
  for select to authenticated
  using (public.is_tenant_staff(auth.uid(), tenant_id) or public.is_platform_admin(auth.uid()));

drop policy if exists event_pledges_staff_write on public.event_pledges;
create policy event_pledges_staff_write on public.event_pledges
  for update to authenticated
  using (public.is_tenant_staff(auth.uid(), tenant_id) or public.is_platform_admin(auth.uid()))
  with check (public.is_tenant_staff(auth.uid(), tenant_id) or public.is_platform_admin(auth.uid()));

drop policy if exists event_pledges_staff_delete on public.event_pledges;
create policy event_pledges_staff_delete on public.event_pledges
  for delete to authenticated
  using (public.is_tenant_staff(auth.uid(), tenant_id) or public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------
-- 7. Progresso público (agregado, sem dado pessoal)
-- ---------------------------------------------------------------
create or replace function public.event_public_progress(_event_id uuid)
returns table (
  need_id           uuid,
  title             text,
  kind              public.event_need_kind,
  unit              text,
  amount_per_unit   numeric,
  target_quantity   integer,
  pledged_quantity  integer,
  display_order     integer
)
language sql stable security definer set search_path to 'public'
as $eppr$
  select
    n.id, n.title, n.kind, n.unit, n.amount_per_unit, n.target_quantity,
    coalesce((
      select sum(p.quantity)::int from public.event_pledges p
      where p.need_id = n.id
        and p.status <> 'cancelled'::public.event_pledge_status
    ), 0),
    n.display_order
  from public.event_needs n
  join public.events e on e.id = n.event_id
  where n.event_id = _event_id
    and n.is_active
    and e.status <> 'draft'::public.event_status
  order by n.display_order, n.title;
$eppr$;

grant execute on function public.event_public_progress(uuid) to anon, authenticated;

-- Arrecadado de um evento: soma das doações confirmadas ligadas a ele.
create or replace function public.event_raised_amount(_event_id uuid)
returns numeric language sql stable security definer set search_path to 'public'
as $eram$
  select coalesce(sum(d.amount), 0)
  from public.donations d
  join public.payments pay on pay.id = d.payment_id
  where d.campaign_id = _event_id
    and d.deleted_at is null
    and pay.status = 'confirmed'::public.payment_status;
$eram$;

grant execute on function public.event_raised_amount(uuid) to anon, authenticated;
