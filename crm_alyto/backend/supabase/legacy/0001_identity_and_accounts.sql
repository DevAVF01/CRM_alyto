-- 0001: identidad, cuentas base y funciones compartidas
-- Aplica sobre un proyecto Supabase nuevo (PostgreSQL 15+).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Listas cerradas de valores. La base rechaza cualquier texto fuera de ellas.
create type public.user_role as enum ('admin', 'compliance', 'operaciones', 'ventas', 'soporte');
create type public.account_type as enum ('persona_juridica', 'persona_natural');
create type public.kyc_status as enum ('Pendiente', 'En revision', 'Aprobado', 'Observado', 'Rechazado');
create type public.document_review_status as enum ('Pendiente', 'En revision', 'Aprobado', 'Observado');

-- Funcion compartida: mantiene actualizada la columna updated_at de toda tabla que la use.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Perfiles: el rol real del usuario. auth.users de Supabase solo guarda correo y clave.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role public.user_role not null default 'ventas',
  display_name text not null default '',
  team text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_touch_updated
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Al nacer un usuario de autenticacion, se crea su perfil con el rol declarado en sus
-- metadatos. Sin este disparador hay que insertar el perfil a mano y es la fuente de
-- "el usuario entra pero no puede hacer nada".
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'role', 'ventas')::public.user_role,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cuenta: el centro del abanico. Toda actividad, documento y operacion cuelga de aqui.
-- id es interno e inmutable; code es el numero de expediente visible (ECP-BOL-5577).
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  nit text not null default 'Pendiente',
  account_type public.account_type not null default 'persona_juridica',
  country text not null default 'Bolivia',
  city text,
  sector text,
  source text,
  kyc_status public.kyc_status not null default 'Pendiente',
  health text not null default 'En evaluacion',
  volume_processed numeric(14, 2) not null default 0,
  monthly_limit numeric(14, 2) not null default 250000,
  frequency integer not null default 0,
  custodial_protocol text not null default 'Stellar AlyPay',
  owner_id uuid references public.profiles (id) on delete set null,
  next_step_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index clients_owner_idx on public.clients (owner_id) where deleted_at is null;
create index clients_kyc_idx on public.clients (kyc_status) where deleted_at is null;
create index clients_name_trgm_idx on public.clients using gin (name gin_trgm_ops);

create trigger clients_touch_updated
  before update on public.clients
  for each row execute function public.touch_updated_at();

-- Parametros del Entorno Controlado de Pruebas: una sola fila de configuracion,
-- en lugar de repetirla en cada expediente como hacia la columna regime.
create table public.ecp_parameters (
  id smallint primary key default 1,
  usuarios_por_dia integer not null default 630,
  operaciones_por_dia integer not null default 630,
  monto_maximo_operacion_bs numeric(14, 2) not null default 120000,
  duracion_maxima_ecp_meses integer not null default 12,
  estado_autorizacion text not null default 'En proceso dentro del Entorno Controlado de Pruebas',
  updated_at timestamptz not null default now(),
  constraint ecp_parameters_single_row check (id = 1)
);

insert into public.ecp_parameters (id) values (1)
  on conflict (id) do nothing;
