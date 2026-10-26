-- 0004: seguridad a nivel de fila y almacen de archivos.
--
-- El backend escribe con la llave maestra de servicio, que esquiva estas reglas.
-- Se activan igual como segunda traba: si algun dia un dato se expone directo al
-- navegador, esto es lo unico que separa a un rol equivocado del expediente ajeno.

-- Funcion de apoyo: el rol del usuario que esta consultando.
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.deals enable row level security;
alter table public.deal_events enable row level security;
alter table public.activities enable row level security;
alter table public.documents enable row level security;
alter table public.communication_logs enable row level security;
alter table public.tags enable row level security;
alter table public.client_tags enable row level security;
alter table public.compliance_items enable row level security;
alter table public.screenings enable row level security;
alter table public.custodial_wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.ecp_daily_usage enable row level security;
alter table public.ecp_parameters enable row level security;
alter table public.audit_events enable row level security;

-- Lectura: todo usuario autenticado y activo ve el conjunto operativo.
create policy profiles_read on public.profiles
  for select to authenticated using (true);

create policy clients_read on public.clients
  for select to authenticated using (deleted_at is null);

create policy clients_write on public.clients
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas')
  );

create policy clients_update on public.clients
  for update to authenticated using (
    public.current_role_name() in ('admin', 'compliance', 'operaciones')
    or owner_id = auth.uid()
  );

create policy contacts_read on public.contacts
  for select to authenticated using (deleted_at is null);

create policy contacts_write on public.contacts
  for all to authenticated using (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas')
  ) with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas')
  );

create policy deals_read on public.deals
  for select to authenticated using (deleted_at is null);

create policy deals_write on public.deals
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas', 'operaciones')
  ) with check (
    public.current_role_name() in ('admin', 'ventas', 'operaciones')
  );

create policy deal_events_read on public.deal_events
  for select to authenticated using (true);

-- Sin politica de insercion a proposito: el unico camino al historico es el disparador
-- deals_stage_change, que es security definer y por tanto puede escribir aunque quien
-- mueve la tarjeta no tenga permiso sobre la tabla.
create policy activities_read on public.activities
  for select to authenticated using (deleted_at is null);

create policy activities_write on public.activities
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas', 'soporte', 'operaciones', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'ventas', 'soporte', 'operaciones', 'compliance')
  );

create policy documents_read on public.documents
  for select to authenticated using (deleted_at is null);

create policy documents_upload on public.documents
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas')
  );

-- Solo cumplimiento y administracion cambian el estado de revision de un documento.
create policy documents_review on public.documents
  for update to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy comms_read on public.communication_logs
  for select to authenticated using (true);

create policy comms_write on public.communication_logs
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'ventas', 'soporte')
  );

create policy tags_read on public.tags for select to authenticated using (true);
create policy client_tags_read on public.client_tags for select to authenticated using (true);

-- Etiquetar una cuenta es trabajo comercial, no de cumplimiento.
create policy tags_write on public.tags
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas')
  ) with check (
    public.current_role_name() in ('admin', 'ventas')
  );

create policy client_tags_write on public.client_tags
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas', 'operaciones', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'ventas', 'operaciones', 'compliance')
  );

create policy compliance_read on public.compliance_items
  for select to authenticated using (true);

-- Al abrir un expediente se crea la plantilla completa de casillas.
create policy compliance_insert on public.compliance_items
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy compliance_write on public.compliance_items
  for update to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy screenings_read on public.screenings
  for select to authenticated using (true);

create policy wallets_read on public.custodial_wallets
  for select to authenticated using (true);

create policy wallets_write on public.custodial_wallets
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'operaciones')
  );

create policy transactions_read on public.transactions
  for select to authenticated using (true);

create policy transactions_write on public.transactions
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'operaciones')
  );

-- Operaciones movio el estado de una transferencia; eso es una edicion, no un alta.
create policy transactions_update on public.transactions
  for update to authenticated using (
    public.current_role_name() in ('admin', 'operaciones')
  ) with check (
    public.current_role_name() in ('admin', 'operaciones')
  );

create policy daily_usage_read on public.ecp_daily_usage
  for select to authenticated using (true);

-- Sin politicas de escritura: la lleva el disparador register_daily_usage.
create policy ecp_parameters_read on public.ecp_parameters
  for select to authenticated using (true);

-- Los topes del Entorno Controlado de Pruebas los fija ASFI; solo administracion los anota.
create policy ecp_parameters_write on public.ecp_parameters
  for update to authenticated using (
    public.current_role_name() = 'admin'
  ) with check (
    public.current_role_name() = 'admin'
  );

-- Auditoria: visible para administracion y cumplimiento, escribible por todos los roles
-- (cada accion deja su asiento), y jamas editable: el disparador lo bloquea y ademas
-- se revoca el permiso a nivel de privilegio, no solo de politica.
create policy audit_read on public.audit_events
  for select to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy audit_insert on public.audit_events
  for insert to authenticated with check (true);

revoke update, delete on public.audit_events from authenticated;
revoke update, delete on public.audit_events from anon;

-- Almacen de archivos del expediente. Se crea vacio; se llena por la interfaz.
-- Nota: storage.objects pertenece a otro dueno dentro de Supabase. Si al correr esta
-- migracion aparece "must be owner of table objects", borra estas cuatro sentencias de
-- aqui abajo y crea el cubo y sus dos politicas desde Almacen de archivos en el panel;
-- el resto de la migracion no depende de ellas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expedientes',
  'expedientes',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create policy expedientes_read on storage.objects
  for select to authenticated using (
    bucket_id = 'expedientes'
    and public.current_role_name() in ('admin', 'compliance', 'operaciones')
  );

create policy expedientes_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'expedientes'
    and public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas')
  );
