-- 0002: nucleo del CRM. Contactos, embudo, actividades, documentos y segmentacion.

-- Contacto: las personas detras de la cuenta. Siempre cuelga de una cuenta.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  full_name text not null,
  role_title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  decision_maker boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index contacts_client_idx on public.contacts (client_id) where deleted_at is null;

create trigger contacts_touch_updated
  before update on public.contacts
  for each row execute function public.touch_updated_at();

-- Un solo interlocutor principal por cuenta.
create unique index contacts_one_primary_idx on public.contacts (client_id)
  where is_primary and deleted_at is null;

-- El par cuenta + nombre no se repite: permite reejecutar el sembrado sin duplicar.
create unique index contacts_client_name_idx on public.contacts (client_id, full_name)
  where deleted_at is null;

-- Oportunidad: el negocio avanzando por las 6 etapas comerciales.
create type public.lost_reason as enum (
  'precio', 'plazo', 'proveedor_actual', 'sin_presupuesto', 'sin_decision', 'no_responde', 'otro'
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  client_id uuid not null references public.clients (id) on delete cascade,
  stage smallint not null default 1 check (stage between 1 and 6),
  deal_type text not null default 'Transferencia Institucional B2B',
  frequency text default 'Por definir',
  monthly_volume numeric(14, 2) not null default 0,
  next_step text,
  expected_close_month text,
  lost_reason public.lost_reason,
  owner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index deals_stage_idx on public.deals (stage) where deleted_at is null;
create index deals_owner_idx on public.deals (owner_id) where deleted_at is null;
create index deals_client_idx on public.deals (client_id) where deleted_at is null;

create trigger deals_touch_updated
  before update on public.deals
  for each row execute function public.touch_updated_at();

-- Historico del embudo: aqui nace toda la medicion (conversion, antiguedad, velocidad).
create table public.deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals (id) on delete cascade,
  from_stage smallint,
  to_stage smallint not null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index deal_events_deal_idx on public.deal_events (deal_id, created_at);

-- Un asiento por cambio real de etapa, incluido el alta (from_stage nulo).
-- Es security definer porque deal_events no admite insercion directa: solo escribe
-- este disparador, y lo hace aunque el usuario que mueve la tarjeta no tenga permiso
-- propio sobre el historico.
create or replace function public.record_deal_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.deal_events (deal_id, from_stage, to_stage, actor_email, reason)
    values (new.id, old.stage, new.stage, coalesce(current_setting('app.actor_email', true), 'sistema'), null);
  end if;
  return new;
end;
$$;

create trigger deals_stage_change
  after update on public.deals
  for each row execute function public.record_deal_stage_change();

-- Actividad: la tabla central de un gestor de relaciones con el cliente.
create type public.activity_type as enum ('llamada', 'reunion', 'visita', 'correo', 'tarea', 'nota');

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  type public.activity_type not null,
  title text not null,
  body text,
  due_at timestamptz,
  done_at timestamptz,
  duration_minutes integer,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  participants text[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint activities_title_length check (char_length(title) between 3 and 200),
  constraint activities_done_needs_date check (done_at is null or done_at >= created_at)
);

-- La consulta "mi jornada": abiertas de un ejecutivo ordenadas por vencimiento.
create index activities_owner_due_idx on public.activities (owner_id, due_at)
  where deleted_at is null and done_at is null;
create index activities_client_timeline_idx on public.activities (client_id, created_at desc)
  where deleted_at is null;
create index activities_deal_idx on public.activities (deal_id) where deal_id is not null;

create trigger activities_touch_updated
  before update on public.activities
  for each row execute function public.touch_updated_at();

-- Documento: metadatos. El archivo fisico vive en el almacen de Supabase Storage,
-- esta tabla solo guarda donde esta y quien lo subio.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  checklist_item_key text,
  filename text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes integer,
  checksum text,
  review_status public.document_review_status not null default 'Pendiente',
  uploaded_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Varios archivos por casilla del checklist: el indice no es unico a proposito.
create index documents_client_idx on public.documents (client_id) where deleted_at is null;
create index documents_item_idx on public.documents (client_id, checklist_item_key)
  where deleted_at is null;

create trigger documents_touch_updated
  before update on public.documents
  for each row execute function public.touch_updated_at();

-- Interaccion comercial: que se le escribio a la cuenta y en que terminos exactos.
create type public.communication_channel as enum ('correo', 'whatsapp', 'llamada', 'interno');

create table public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  activity_id uuid references public.activities (id) on delete set null,
  template_id text,
  channel public.communication_channel not null default 'interno',
  subject text,
  body_snapshot text not null,
  sent_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index communication_logs_client_idx on public.communication_logs (client_id, created_at desc);

-- Segmentacion y filtros. Dos tablas porque una cuenta puede ser a la vez
-- "importador", "Santa Cruz" y "prioridad alta".
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#1E3653',
  created_at timestamptz not null default now()
);

create table public.client_tags (
  client_id uuid not null references public.clients (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, tag_id)
);
