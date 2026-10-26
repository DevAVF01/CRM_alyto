-- 0003: cumplimiento, pagos y limites del Entorno Controlado de Pruebas.

-- Checklist de debida diligencia: la casilla, con quien la movio.
create table public.compliance_items (
  client_id uuid not null references public.clients (id) on delete cascade,
  item_key text not null,
  label text not null,
  detail text,
  status public.kyc_status not null default 'Pendiente',
  document_required boolean not null default false,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, item_key)
);

create trigger compliance_items_touch_updated
  before update on public.compliance_items
  for each row execute function public.touch_updated_at();

-- Un casilla Aprobada exige al menos un documento adjunto, salvo que no lo requiera.
-- Solo al entrar en aprobado: reeditar una casilla que ya lo esta no debe bloquearse.
create or replace function public.require_document_for_approval()
returns trigger
language plpgsql
as $$
declare
  file_count integer;
begin
  if new.status = 'Aprobado' and new.document_required and old.status is distinct from 'Aprobado' then
    select count(*) into file_count
    from public.documents
    where client_id = new.client_id
      and checklist_item_key = new.item_key
      and deleted_at is null;

    if file_count = 0 then
      raise exception 'La casilla % requiere un documento adjunto antes de aprobarse', new.item_key
        using errcode = 'CHECK_VIOLATION';
    end if;
  end if;
  return new;
end;
$$;

create trigger compliance_items_need_document
  before update on public.compliance_items
  for each row execute function public.require_document_for_approval();

-- Resultado de cotejo contra listas restrictivas, por persona o empresa.
create table public.screenings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  list_name text not null,
  subject text not null,
  result text not null check (result in ('sin coincidencia', 'revisar', 'coincidencia')),
  detail text,
  screened_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index screenings_client_idx on public.screenings (client_id, created_at desc);

-- Carteras custodiales. public_key admite vacio hasta que el conector entregue una
-- direccion real. No existe ninguna columna para la clave privada: que no haya donde
-- guardarla es la primera defensa.
create table public.custodial_wallets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  label text not null,
  public_key text unique,
  asset text not null default 'USDC',
  balance numeric(18, 7) not null default 0,
  network text not null default 'Stellar Testnet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index custodial_wallets_client_idx on public.custodial_wallets (client_id);

-- Dos carteras por expediente, con nombre fijo: reejecutar el sembrado no las duplica.
create unique index custodial_wallets_client_label_idx on public.custodial_wallets (client_id, label);

create trigger custodial_wallets_touch_updated
  before update on public.custodial_wallets
  for each row execute function public.touch_updated_at();

-- Operaciones de transferencias internacionales.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  client_id uuid not null references public.clients (id) on delete cascade,
  activity_id uuid references public.activities (id) on delete set null,
  beneficiary text not null,
  destination text,
  amount_usd numeric(14, 2) not null check (amount_usd > 0),
  -- Los cinco estados canonicos, escritos igual que en la interfaz: una variante con
  -- otra mayuscula dejaria de contar en el uso diario y en la pantalla de limites.
  status text not null default 'En Proceso' check (
    status in ('Completada en ECP', 'En Proceso', 'En Revision ASFI', 'Observada', 'Rechazada')
  ),
  stellar_hash text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_client_idx on public.transactions (client_id, created_at desc);
create index transactions_status_idx on public.transactions (status);

create trigger transactions_touch_updated
  before update on public.transactions
  for each row execute function public.touch_updated_at();

-- Una fila por dia: convierte el tope diario en algo consultable y alertable,
-- en lugar de recorrer todo el historial cada vez que se abre la pantalla.
-- amount_bs_total lo completa el conector de pagos; aqui solo se cuenta en dolares.
create table public.ecp_daily_usage (
  day date primary key,
  operations_count integer not null default 0,
  amount_bs_total numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now()
);

-- Es security definer por la misma razon que el historico del embudo: ecp_daily_usage
-- solo la escribe el sistema, nadie desde la interfaz.
create or replace function public.register_daily_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  completed boolean;
begin
  -- En un alta no existe el registro anterior: hay que preguntar la operacion.
  if tg_op = 'INSERT' then
    completed := new.status = 'Completada en ECP';
  else
    completed := new.status = 'Completada en ECP'
      and old.status is distinct from 'Completada en ECP';
  end if;

  if completed then
    insert into public.ecp_daily_usage (day, operations_count)
    values (current_date, 1)
    on conflict (day)
    do update set operations_count = ecp_daily_usage.operations_count + 1,
                  updated_at = now();
  end if;
  return new;
end;
$$;

-- Alta y edicion comparten disparador: una operacion puede nacer ya completada.
create trigger transactions_daily_usage
  after insert or update on public.transactions
  for each row execute function public.register_daily_usage();

-- Auditoria: prueba de quien hizo que y cuando. Nada de esto se puede editar ni borrar.
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  detail text,
  entity_type text,
  entity_id text,
  trace_id text,
  created_at timestamptz not null default now()
);

create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

create or replace function public.block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El asiento de auditoria es inmutable' using errcode = 'INSUFFICIENT_PRIVILEGE';
end;
$$;

create trigger audit_events_no_update
  before update or delete on public.audit_events
  for each row execute function public.block_audit_mutation();

-- Vistas de medicion: se calculan al vuelo, no se guardan totales que se desactualizan.
create or replace view public.vw_funnel_by_stage as
select d.stage,
       count(*) as deals,
       count(*) filter (where d.created_at >= now() - interval '30 days') as deals_30d,
       round(avg(d.monthly_volume)) as volumen_mensual_promedio_usd
from public.deals d
where d.deleted_at is null
group by d.stage
order by d.stage;

create or replace view public.vw_stage_age as
with last_move as (
  select deal_id, max(created_at) as moved_at
  from public.deal_events
  group by deal_id
)
select d.id as deal_id,
       d.code,
       c.name as cuenta,
       d.stage,
       d.owner_id,
       greatest(0, floor(extract(epoch from (now() - coalesce(lm.moved_at, d.created_at))) / 86400))::integer as dias_en_etapa
from public.deals d
join public.clients c on c.id = d.client_id
left join last_move lm on lm.deal_id = d.id
where d.deleted_at is null and c.deleted_at is null;

create or replace view public.vw_open_activities as
select a.id, a.type, a.title, a.due_at, a.owner_id, a.client_id, c.name as cuenta,
       (a.due_at < now()) as vencida
from public.activities a
join public.clients c on c.id = a.client_id
where a.deleted_at is null and a.done_at is null and c.deleted_at is null
order by a.due_at nulls last;
