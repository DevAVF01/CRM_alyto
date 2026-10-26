-- 0004: seguridad a nivel de fila, privilegios y vistas
--
-- Requiere 0001, 0002 y 0003.
--
-- Las politicas de Row Level Security (seguridad a nivel de fila) solo tienen efecto sobre
-- conexiones que viajan con la identidad del usuario. Cuando el backend escriba con la llave
-- de servicio, estas reglas se saltan: por eso la capa de repositorio debe construir un
-- cliente por peticion con el JWT del usuario, no uno global con la llave maestra.

-- Funcion de apoyo: el rol del usuario que esta consultando.
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = public.current_user_id() and p.is_active;
$$;

-- Escriben solo los disparadores del sistema, nunca un usuario desde la interfaz. El
-- disparador que mantiene cada tabla pone la marca crm.system_write antes de insertar; sin
-- esa marca el intento viene de una persona y se rechaza.
create or replace function public.denies_direct_write()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('crm.system_write', true), '') <> 'on' then
    raise exception 'Esta tabla la mantiene el sistema' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

alter table public.ecp_parameters enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.blocked_terms enable row level security;
alter table public.templates enable row level security;
alter table public.routing_rules enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.cadence_templates enable row level security;
alter table public.cadence_steps enable row level security;
alter table public.cadence_enrollments enable row level security;
alter table public.cadence_executions enable row level security;
alter table public.compliance_item_defs enable row level security;
alter table public.compliance_items enable row level security;
alter table public.documents enable row level security;
alter table public.screenings enable row level security;
alter table public.deal_stages enable row level security;
alter table public.deals enable row level security;
alter table public.deal_events enable row level security;
alter table public.activities enable row level security;
alter table public.tags enable row level security;
alter table public.client_tags enable row level security;
alter table public.claims enable row level security;
alter table public.client_ecp_profile enable row level security;

-- ---------------------------------------------------------------------------
-- Identidad y parametros
-- ---------------------------------------------------------------------------

create policy profiles_read on public.profiles
  for select to authenticated using (true);

-- El rol y la activacion de un usuario los mueve solo la administracion. Sin esta traba,
-- un perfil con permiso de escritura podria promocionarse a si mismo a admin.
create policy profiles_write on public.profiles
  for update to authenticated using (
    public.current_role_name() = 'admin'
  ) with check (
    public.current_role_name() = 'admin'
  );

create policy ecp_parameters_read on public.ecp_parameters
  for select to authenticated using (true);

-- Los topes del Entorno Controlado de Pruebas los fija ASFI; solo administracion los anota.
create policy ecp_parameters_write on public.ecp_parameters
  for update to authenticated using (
    public.current_role_name() = 'admin'
  ) with check (
    public.current_role_name() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- Cuentas y contactos
-- ---------------------------------------------------------------------------

-- Lectura abierta entre los roles del equipo: es un solo equipo y la bandeja requiere ver
-- el hilo completo. Es una decision, no un descuido; si algun dia entra un usuario externo
-- hay que filtrar por owner_id.
create policy clients_read on public.clients
  for select to authenticated using (deleted_at is null);

create policy clients_insert on public.clients
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas', 'soporte')
  );

create policy clients_update on public.clients
  for update to authenticated using (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'soporte')
    or owner_id = public.current_user_id()
  ) with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'soporte')
    or owner_id = public.current_user_id()
  );

create policy contacts_read on public.contacts
  for select to authenticated using (deleted_at is null);

create policy contacts_write on public.contacts
  for all to authenticated using (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas', 'soporte')
  ) with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas', 'soporte')
  );

-- ---------------------------------------------------------------------------
-- Guardarrailes y plantillas
-- ---------------------------------------------------------------------------

-- El diccionario se lee para poder avisar al agente antes de que escriba el termino; lo
-- mantiene solo Cumplimiento.
create policy blocked_terms_read on public.blocked_terms
  for select to authenticated using (true);

create policy blocked_terms_write on public.blocked_terms
  for all to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy templates_read on public.templates
  for select to authenticated using (deleted_at is null);

create policy templates_write on public.templates
  for all to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy routing_rules_read on public.routing_rules
  for select to authenticated using (true);

create policy routing_rules_write on public.routing_rules
  for all to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'compliance')
  );

-- ---------------------------------------------------------------------------
-- Bandeja: conversaciones y mensajes
-- ---------------------------------------------------------------------------

create policy conversations_read on public.conversations
  for select to authenticated using (deleted_at is null);

create policy conversations_insert on public.conversations
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas', 'soporte')
  );

-- Quien atiende un hilo puede mover su estado y asignarselo, aunque no sea del rol habitual
-- de la cola: es el caso del agente que toma un reclamo desbordado.
create policy conversations_update on public.conversations
  for update to authenticated using (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'soporte')
    or assignee_id = public.current_user_id()
  ) with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'soporte')
    or assignee_id = public.current_user_id()
  );

create policy messages_read on public.messages
  for select to authenticated using (true);

-- Un mensaje saliente lo escribe el usuario que esta en la bandeja; los automaticos los
-- manda el sistema con la llave de servicio, que no pasa por esta politica.
create policy messages_insert on public.messages
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas', 'soporte')
  );

-- ---------------------------------------------------------------------------
-- Cadencias
-- ---------------------------------------------------------------------------

create policy cadence_templates_read on public.cadence_templates
  for select to authenticated using (deleted_at is null);

create policy cadence_templates_write on public.cadence_templates
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas')
  ) with check (
    public.current_role_name() in ('admin', 'ventas')
  );

create policy cadence_steps_read on public.cadence_steps
  for select to authenticated using (true);

create policy cadence_steps_write on public.cadence_steps
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas')
  ) with check (
    public.current_role_name() in ('admin', 'ventas')
  );

create policy cadence_enrollments_read on public.cadence_enrollments
  for select to authenticated using (true);

create policy cadence_enrollments_write on public.cadence_enrollments
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas', 'soporte')
  ) with check (
    public.current_role_name() in ('admin', 'ventas', 'soporte')
  );

create policy cadence_executions_read on public.cadence_executions
  for select to authenticated using (true);

-- Las ejecuciones las programa y las cierra el motor de cadencias, no un agente.
create policy cadence_executions_write on public.cadence_executions
  for all to authenticated using (
    public.current_role_name() = 'admin'
  ) with check (
    public.current_role_name() = 'admin'
  );

-- ---------------------------------------------------------------------------
-- Ruta A: legajo y documentacion
-- ---------------------------------------------------------------------------

create policy compliance_defs_read on public.compliance_item_defs
  for select to authenticated using (is_active);

create policy compliance_defs_write on public.compliance_item_defs
  for all to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy compliance_read on public.compliance_items
  for select to authenticated using (true);

-- Al abrir una cuenta se crea la plantilla completa de casillas: lo hace un disparador
-- security definer, pero ventas y soporte tambien necesitan crearlas por la interfaz.
create policy compliance_insert on public.compliance_items
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas', 'soporte')
  );

-- Cambiar el estado de una casilla es trabajo de cumplimiento.
create policy compliance_write on public.compliance_items
  for update to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy documents_read on public.documents
  for select to authenticated using (deleted_at is null);

create policy documents_upload on public.documents
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones', 'ventas', 'soporte')
  );

-- Solo cumplimiento y administracion cambian el estado de revision de un documento.
create policy documents_review on public.documents
  for update to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy screenings_read on public.screenings
  for select to authenticated using (true);

create policy screenings_write on public.screenings
  for insert to authenticated with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones')
  );

-- ---------------------------------------------------------------------------
-- Ruta B: comercial
-- ---------------------------------------------------------------------------

create policy deal_stages_read on public.deal_stages
  for select to authenticated using (true);

create policy deals_read on public.deals
  for select to authenticated using (deleted_at is null);

create policy deals_write on public.deals
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas', 'operaciones')
  ) with check (
    public.current_role_name() in ('admin', 'ventas', 'operaciones')
  );

-- Sin politica de insercion a proposito: el unico camino al historico es el disparador
-- deals_stage_change, que es security definer y por tanto puede escribir aunque quien mueve
-- la tarjeta no tenga permiso propio sobre la tabla.
create policy deal_events_read on public.deal_events
  for select to authenticated using (true);

create policy activities_read on public.activities
  for select to authenticated using (deleted_at is null);

create policy activities_write on public.activities
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas', 'soporte', 'operaciones', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'ventas', 'soporte', 'operaciones', 'compliance')
  );

-- Etiquetar una cuenta es trabajo comercial, no de cumplimiento.
create policy tags_read on public.tags for select to authenticated using (true);

create policy tags_write on public.tags
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas')
  ) with check (
    public.current_role_name() in ('admin', 'ventas')
  );

create policy client_tags_read on public.client_tags for select to authenticated using (true);

create policy client_tags_write on public.client_tags
  for all to authenticated using (
    public.current_role_name() in ('admin', 'ventas', 'operaciones', 'compliance')
  ) with check (
    public.current_role_name() in ('admin', 'ventas', 'operaciones', 'compliance')
  );

-- ---------------------------------------------------------------------------
-- Reclamos y ruta C
-- ---------------------------------------------------------------------------

-- Un reclamo es material de trabajo de Cumplimiento y Soporte; el resto del equipo lo ve
-- resumido en la Ficha 360 a traves de esta vista, no editandolo.
create policy claims_read on public.claims
  for select to authenticated using (deleted_at is null);

create policy claims_write on public.claims
  for all to authenticated using (
    public.current_role_name() in ('admin', 'compliance', 'soporte')
  ) with check (
    public.current_role_name() in ('admin', 'compliance', 'soporte')
  );

create policy ecp_profile_read on public.client_ecp_profile
  for select to authenticated using (true);

create policy ecp_profile_write on public.client_ecp_profile
  for all to authenticated using (
    public.current_role_name() in ('admin', 'compliance', 'operaciones')
  ) with check (
    public.current_role_name() in ('admin', 'compliance', 'operaciones')
  );

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

-- Bitacora de quien hizo que y cuando. Nada de esto se puede editar ni borrar.
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

-- Va aqui y no en el bloque del principio: la tabla nace en este fichero, mas abajo de
-- donde estaban las otras reglas de seguridad.
alter table public.audit_events enable row level security;

create index audit_events_created_idx on public.audit_events (created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

create or replace function public.block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'El asiento de auditoria es inmutable' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_events_no_update
  before update or delete on public.audit_events
  for each row execute function public.block_audit_mutation();

-- Visible para administracion y cumplimiento, escribible por todos los roles (cada accion
-- deja su asiento) y jamas editable: el disparador lo bloquea y ademas se revoca el permiso
-- a nivel de privilegio, no solo de politica.
create policy audit_read on public.audit_events
  for select to authenticated using (
    public.current_role_name() in ('admin', 'compliance')
  );

create policy audit_insert on public.audit_events
  for insert to authenticated with check (true);

-- Traba de privilegio, no solo de politica: aunque alguien sea dueno de la tabla, no puede
-- modificar ni borrar un asiento ya escrito.
revoke update, delete on public.audit_events from authenticated;
revoke update, delete on public.audit_events from anon;

-- El historico del embudo y los contadores de la bandeja los mueven unicamente los
-- disparadores. Un usuario no puede reescribir quien movio una tarjeta ni cuando.
create trigger deal_events_no_direct_write
  before insert or update or delete on public.deal_events
  for each row
  when (coalesce(current_setting('crm.system_write', true), '') <> 'on')
  execute function public.denies_direct_write();

-- Un mensaje ya enviado no se edita: es prueba de lo que se le dijo al cliente. Lo unico que
-- cambia es el estado de entrega, y eso lo hace el conector poniendo antes la marca de
-- sistema set_config('crm.system_write', 'on', true).
create trigger messages_no_update
  before update or delete on public.messages
  for each row
  when (coalesce(current_setting('crm.system_write', true), '') <> 'on')
  execute function public.denies_direct_write();

-- ---------------------------------------------------------------------------
-- Vistas de medicion
-- ---------------------------------------------------------------------------

-- Embudo por etapa, con el volumen previsto promedio.
create or replace view public.vw_funnel_by_stage
with (security_invoker = true) as
select d.stage,
       ds.label,
       count(*) as deals,
       count(*) filter (where d.created_at >= now() - interval '30 days') as deals_30d,
       round(avg(d.monthly_volume)) as volumen_mensual_promedio_usd
from public.deals d
join public.deal_stages ds on ds.stage = d.stage
where d.deleted_at is null
group by d.stage, ds.label
order by d.stage;

-- Dias que lleva cada negocio en su etapa actual, segun el historial.
create or replace view public.vw_stage_age
with (security_invoker = true) as
with ultimo_movimiento as (
  select deal_id, max(created_at) as moved_at
  from public.deal_events
  group by deal_id
)
select d.id as deal_id,
       d.code,
       c.display_name as cuenta,
       d.stage,
       ds.label as etapa,
       d.owner_id,
       greatest(0, floor(extract(epoch from (now() - coalesce(um.moved_at, d.created_at))) / 86400))::integer as dias_en_etapa
from public.deals d
join public.clients c on c.id = d.client_id
join public.deal_stages ds on ds.stage = d.stage
left join ultimo_movimiento um on um.deal_id = d.id
where d.deleted_at is null and c.deleted_at is null;

-- La jornada del ejecutivo: tareas abiertas ordenadas por vencimiento.
create or replace view public.vw_open_activities
with (security_invoker = true) as
select a.id, a.type, a.title, a.due_at, a.owner_id, a.client_id, c.display_name as cuenta,
       (a.due_at < now()) as vencida
from public.activities a
join public.clients c on c.id = a.client_id
where a.deleted_at is null and a.done_at is null and c.deleted_at is null
order by a.due_at nulls last;

-- Las vistas se consultan con los mismos permisos que el llamador: sin esto, la seguridad
-- por fila de las tablas de base no se hereda y cualquiera veria todo por la vista.
grant select on public.vw_inbox, public.vw_conversations_sla, public.vw_messages_flagged,
  public.vw_cadence_pending, public.vw_compliance_progress, public.vw_claims_sla,
  public.vw_funnel_by_stage, public.vw_stage_age, public.vw_open_activities
  to authenticated;

-- ---------------------------------------------------------------------------
-- Capa de privilegios, escrita a proposito en lugar de dejada al detras de la plataforma
-- ---------------------------------------------------------------------------
--
-- Al crear una tabla, Supabase le otorga select, insert, update y delete a anon y a
-- authenticated sin que nadie lo escriba. Ese default es invisible y no esta garantizado en
-- otro Postgres, y de el dependen dos cosas: las vistas con security_invoker (el llamador
-- necesita select tambien sobre la tabla de base, no solo sobre la vista) y el portarse como
-- toca cuando no hay sesion iniciada. Se pone aqui para que el esquema se comporte igual en
-- la base que se elija el 30/10. Fallar hacia cerrado: lo que no esta otorgado no se puede
-- leer, aunque la politica por fila se equivque.

grant usage on schema public to anon, authenticated, service_role;

-- Quien no tiene sesion iniciada no lee el CRM por ninguna via.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- El usuario con sesion lee; cuales filas ve lo decide la seguridad por fila. Escribir sigue
-- gobernado por las politicas y por los disparadores, que es donde esta la regla de negocio.
grant select on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
