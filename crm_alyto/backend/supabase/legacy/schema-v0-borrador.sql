-- ESQUEMA V0, BORRADOR INICIAL. NO EJECUTAR.
-- Las siete tablas de este archivo son un borrador inicial. El modelo real esta en
-- ../migrations/ (17 tablas) y los datos de arranque en ../seed.sql. Correr este
-- archivo contra un proyecto donde ya se aplicaron las migraciones falla porque
-- reutiliza los mismos nombres de enum, y al reves pisa el modelo nuevo.
-- Conservado solo como referencia del primer borrador.

create extension if not exists "uuid-ossp";

create type public.user_role as enum ('admin', 'compliance', 'operaciones', 'ventas', 'soporte');
create type public.kyc_status as enum ('Pendiente', 'En revision', 'Aprobado', 'Observado');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role public.user_role not null default 'ventas',
  created_at timestamptz not null default now()
);

create table public.clients (
  id text primary key,
  name text not null,
  nit text not null,
  country text not null default 'Bolivia',
  sector text,
  representative text,
  regime text not null default 'Resolución ASFI 2024',
  kyc_status public.kyc_status not null default 'Pendiente',
  health text not null default 'En evaluacion',
  volume_processed numeric(14, 2) not null default 0,
  monthly_limit numeric(14, 2) not null default 250000,
  frequency integer not null default 0,
  custodial_protocol text not null default 'Stellar AlyPay',
  vault text,
  created_at timestamptz not null default now()
);

create table public.deals (
  id text primary key,
  client_id text not null references public.clients (id) on delete cascade,
  stage smallint not null default 1 check (stage between 1 and 6),
  deal_type text not null,
  frequency text,
  monthly_volume numeric(14, 2) not null default 0,
  owner text not null default 'Fuerza de Ventas B2B',
  updated_at timestamptz not null default now()
);

create table public.custodial_wallets (
  id uuid primary key default uuid_generate_v4(),
  client_id text not null references public.clients (id) on delete cascade,
  label text not null,
  public_key text not null unique,
  asset text not null default 'USDC',
  balance numeric(18, 7) not null default 0,
  network text not null default 'Stellar Testnet'
);

create table public.transactions (
  id text primary key,
  client_id text not null references public.clients (id) on delete cascade,
  beneficiary text not null,
  destination text,
  amount_usd numeric(14, 2) not null,
  status text not null default 'En Proceso',
  stellar_hash text,
  created_at timestamptz not null default now()
);

create table public.compliance_items (
  client_id text not null references public.clients (id) on delete cascade,
  item_key text not null,
  label text not null,
  detail text,
  status public.kyc_status not null default 'Pendiente',
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (client_id, item_key)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.deals enable row level security;
alter table public.custodial_wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.compliance_items enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy clients_read on public.clients
  for select to authenticated using (true);
create policy clients_insert on public.clients
  for insert to authenticated with check (public.current_user_role() in ('admin', 'compliance', 'operaciones'));
create policy clients_update on public.clients
  for update to authenticated using (public.current_user_role() in ('admin', 'compliance'))
  with check (public.current_user_role() in ('admin', 'compliance'));

create policy deals_read on public.deals
  for select to authenticated using (true);
create policy deals_insert on public.deals
  for insert to authenticated with check (public.current_user_role() in ('admin', 'ventas', 'operaciones'));
create policy deals_update on public.deals
  for update to authenticated using (public.current_user_role() in ('admin', 'ventas', 'operaciones'))
  with check (public.current_user_role() in ('admin', 'ventas', 'operaciones'));

create policy wallets_read on public.custodial_wallets
  for select to authenticated using (true);
create policy wallets_write on public.custodial_wallets
  for insert to authenticated with check (public.current_user_role() in ('admin', 'operaciones'));

create policy transactions_read on public.transactions
  for select to authenticated using (true);
create policy transactions_insert on public.transactions
  for insert to authenticated with check (public.current_user_role() in ('admin', 'operaciones'));

create policy compliance_read on public.compliance_items
  for select to authenticated using (true);
create policy compliance_write on public.compliance_items
  for update to authenticated using (public.current_user_role() in ('admin', 'compliance'))
  with check (public.current_user_role() in ('admin', 'compliance'));

create policy audit_read on public.audit_events
  for select to authenticated using (public.current_user_role() in ('admin', 'compliance'));
create policy audit_insert on public.audit_events
  for insert to authenticated with check (true);
