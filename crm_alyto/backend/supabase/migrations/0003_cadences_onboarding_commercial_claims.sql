-- 0003: cadencias, vinculacion, comercial y reclamos
--
-- Requiere 0001 y 0002.

-- ============================================================================
-- A. CADENCIA B2B DE 14 DIAS
-- ============================================================================

create type public.cadence_audience as enum ('persona_natural', 'persona_juridica');
create type public.cadence_step_status as enum ('pendiente', 'enviado', 'fallido', 'cancelado', 'omitido');
create type public.cadence_enrollment_status as enum ('activa', 'pausada', 'convertida', 'cerrada', 'cancelada');

-- Secuencia reutilizable. La del documento de contexto es B2B en 6 pasos sobre 14 dias.
create table public.cadence_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  audience public.cadence_audience not null default 'persona_juridica',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger cadence_templates_touch_updated
  before update on public.cadence_templates
  for each row execute function public.touch_updated_at();

-- Paso de la secuencia: dia numero, canal y plantilla concreta con su version.
create table public.cadence_steps (
  id uuid primary key default gen_random_uuid(),
  cadence_template_id uuid not null references public.cadence_templates (id) on delete cascade,
  step_order smallint not null check (step_order between 1 and 20),
  day_number smallint not null check (day_number between 1 and 90),
  channel public.channel_kind not null,
  template_code text not null,
  template_version smallint not null default 1,
  description text,
  created_at timestamptz not null default now(),
  constraint cadence_steps_order_unique unique (cadence_template_id, step_order),
  constraint cadence_steps_template_exists foreign key (template_code, template_version)
    references public.templates (code, version)
);

create index cadence_steps_template_idx on public.cadence_steps (cadence_template_id, day_number);

-- Los dias de la secuencia tienen que ir hacia adelante: un paso 5 programado para el dia 3
-- se enviaria antes que el paso 2 y la cadencia perderia el sentido.
create or replace function public.check_cadence_step_day_order()
returns trigger
language plpgsql
as $$
declare
  -- Variable escalar, no record: PostgreSQL no permite escribir en un campo de un record
  -- mientras la variable no haya recibido una fila completa.
  dia_anterior smallint;
begin
  select cs.day_number into dia_anterior
  from public.cadence_steps cs
  where cs.cadence_template_id = new.cadence_template_id
    and cs.step_order = new.step_order - 1;

  if found and new.day_number <= dia_anterior then
    raise exception 'El paso % de la cadencia debe caer despues del dia %', new.step_order, dia_anterior
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger cadence_steps_day_order
  before insert or update of step_order, day_number on public.cadence_steps
  for each row execute function public.check_cadence_step_day_order();

-- Inscripcion de una cuenta en una secuencia.
create table public.cadence_enrollments (
  id uuid primary key default gen_random_uuid(),
  cadence_template_id uuid not null references public.cadence_templates (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  status public.cadence_enrollment_status not null default 'activa',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  final_outcome text check (final_outcome is null or final_outcome in ('convertida', 'en_pausa', 'no_contactado')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cadence_enrollments_unique unique (cadence_template_id, client_id)
);

create index cadence_enrollments_client_idx on public.cadence_enrollments (client_id);
create index cadence_enrollments_open_idx on public.cadence_enrollments (status, started_at)
  where status = 'activa';

create trigger cadence_enrollments_touch_updated
  before update on public.cadence_enrollments
  for each row execute function public.touch_updated_at();

-- Ejecucion prevista o real de un paso. Es el unico lugar donde se guarda un momento
-- programado: la bandeja y la pantalla de cadencias consultan aqui, no en una columna
-- de la cuenta.
create table public.cadence_executions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.cadence_enrollments (id) on delete cascade,
  cadence_step_id uuid not null references public.cadence_steps (id) on delete restrict,
  scheduled_for timestamptz not null,
  status public.cadence_step_status not null default 'pendiente',
  attempted_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  constraint cadence_executions_step_unique unique (enrollment_id, cadence_step_id)
);

create index cadence_executions_due_idx on public.cadence_executions (scheduled_for)
  where status = 'pendiente';

-- Ahora si se puede cerrar el circulo: un mensaje sabe que paso de cadencia lo genero.
alter table public.messages
  add constraint messages_cadence_execution_fk
  foreign key (cadence_execution_id) references public.cadence_executions (id) on delete set null;

-- Un mensaje automatico tiene que venir de una ejecucion, y uno manual no.
create or replace function public.check_message_automation()
returns trigger
language plpgsql
as $$
begin
  if new.automated and new.cadence_execution_id is null then
    raise exception 'Un mensaje marcado como automatico debe indicar la ejecucion de cadencia que lo genero'
      using errcode = 'check_violation';
  end if;
  if not new.automated and new.cadence_execution_id is not null then
    raise exception 'Un mensaje manual no puede colgar de una ejecucion de cadencia'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger messages_automation_consistency
  before insert or update of automated, cadence_execution_id on public.messages
  for each row execute function public.check_message_automation();

-- Proximo paso pendiente de cada inscripcion activa: lo que muestra la pantalla de cadencias.
-- Los pasos se numeran en orden, asi que el primero pendiente es el que toca.
create or replace view public.vw_cadence_pending
with (security_invoker = true) as
select *
from (
  select e.id as enrollment_id,
         ct.name as cadencia,
         cl.id as client_id,
         cl.display_name as cliente,
         s.step_order,
         s.day_number,
         s.channel,
         s.template_code,
         x.scheduled_for,
         x.status as estado_ejecucion,
         (x.scheduled_for < now()) as vencido,
         row_number() over (
           partition by e.id
           order by s.step_order
         ) as posicion
  from public.cadence_enrollments e
  join public.cadence_templates ct on ct.id = e.cadence_template_id
  join public.clients cl on cl.id = e.client_id
  join public.cadence_executions x on x.enrollment_id = e.id
  join public.cadence_steps s on s.id = x.cadence_step_id
  where e.status = 'activa'
    and x.status = 'pendiente'
    and e.finished_at is null
) primero
where primero.posicion = 1
order by primero.scheduled_for;

-- ============================================================================
-- B. RUTA A: VALIDACION KYC Y DOCUMENTACION
-- ============================================================================

-- Definicion de las casillas del legajo. La etiqueta vive aqui una sola vez: en el esquema
-- anterior se repetia en cada cliente, que es la violacion de tercera forma normal que
-- Alvaro pidio corregir.
create table public.compliance_item_defs (
  item_key text primary key,
  label text not null,
  description text,
  document_required boolean not null default false,
  applies_to public.account_type[] not null default array['persona_natural', 'persona_juridica']::public.account_type[],
  order_index smallint not null default 1,
  is_active boolean not null default true
);

insert into public.compliance_item_defs
  (item_key, label, description, document_required, applies_to, order_index) values
  ('identidad', 'Documento de identidad', 'Cedula de identidad vigente de la persona o del representante legal.', true,
   array['persona_natural', 'persona_juridica']::public.account_type[], 1),
  ('tributario', 'Registro tributario', 'Constancia del NIT emitida por el Servicio de Impuestos Nacionales.', true,
   array['persona_juridica']::public.account_type[], 2),
  ('representacion', 'Poderes de representacion', 'Poder notarial o testimonio que acredita la capacidad de firma.', true,
   array['persona_juridica']::public.account_type[], 3),
  ('beneficiario_final', 'Beneficiario final', 'Identificacion de las personas naturales que controlan la cuenta.', true,
   array['persona_juridica']::public.account_type[], 4),
  ('origen_fondos', 'Origen de fondos', 'Declaracion y respaldo del origen de los recursos a transferir.', true,
   array['persona_natural', 'persona_juridica']::public.account_type[], 5),
  ('listas_restrictivas', 'Cotejo en listas restrictivas', 'Resultado de la verificacion contra listas de prevencion.', false,
   array['persona_natural', 'persona_juridica']::public.account_type[], 6),
  ('perfil_riesgo', 'Perfil de riesgo', 'Clasificacion del cliente segun monto, frecuencia y destino.', false,
   array['persona_natural', 'persona_juridica']::public.account_type[], 7),
  ('terminos_ecp', 'Aceptacion de condiciones del ECP', 'Constancia de que el cliente conoce el caracter supervisado y transitorio de la prueba.', false,
   array['persona_natural', 'persona_juridica']::public.account_type[], 8)
on conflict (item_key) do nothing;

-- Estado de cada casilla para una cuenta concreta.
create table public.compliance_items (
  client_id uuid not null references public.clients (id) on delete cascade,
  item_key text not null references public.compliance_item_defs (item_key) on delete restrict,
  status public.kyc_status not null default 'Pendiente',
  detail text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, item_key)
);

create index compliance_items_status_idx on public.compliance_items (status);

create trigger compliance_items_touch_updated
  before update on public.compliance_items
  for each row execute function public.touch_updated_at();

-- Al abrir una cuenta se crea la plantilla completa de casillas que le aplican.
create or replace function public.seed_compliance_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.compliance_items (client_id, item_key)
  select new.id, d.item_key
  from public.compliance_item_defs d
  where d.is_active
    and new.account_type = any (d.applies_to)
  on conflict (client_id, item_key) do nothing;
  return new;
end;
$$;

create trigger clients_compliance_template
  after insert on public.clients
  for each row execute function public.seed_compliance_items();

-- Una casilla no pasa a Aprobado sin documento adjunto, salvo que no lo requiera.
-- Solo al entrar en aprobado: reeditar una casilla que ya lo esta no debe bloquearse.
create or replace function public.require_document_for_approval()
returns trigger
language plpgsql
as $$
declare
  hace_falta boolean;
  archivos integer;
begin
  select d.document_required into hace_falta
  from public.compliance_item_defs d
  where d.item_key = new.item_key;

  if new.status = 'Aprobado' and coalesce(hace_falta, false) and old.status is distinct from 'Aprobado' then
    select count(*) into archivos
    from public.documents
    where client_id = new.client_id
      and checklist_item_key = new.item_key
      and review_status = 'Aprobado'
      and deleted_at is null;

    if archivos = 0 then
      raise exception 'La casilla % requiere un documento aprobado antes de aprobarse', new.item_key
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger compliance_items_need_document
  before update on public.compliance_items
  for each row execute function public.require_document_for_approval();

-- Avance del legajo por cuenta: porcentaje de casillas aprobadas, calculado al vuelo.
create or replace view public.vw_compliance_progress
with (security_invoker = true) as
select c.id as client_id,
       c.display_name as cliente,
       c.account_type,
       count(*) as casillas,
       count(*) filter (where i.status = 'Aprobado') as aprobadas,
       count(*) filter (where i.status = 'Observado') as observadas,
       count(*) filter (where i.status = 'En revision') as en_revision,
       count(*) filter (where i.status = 'Rechazado') as rechazadas,
       round(100.0 * count(*) filter (where i.status = 'Aprobado') / nullif(count(*), 0)) as porcentaje_aprobado
from public.clients c
join public.compliance_items i on i.client_id = c.id
where c.deleted_at is null
group by c.id, c.display_name, c.account_type;

-- Documento: solo metadatos. El archivo fisico vive en el almacen de Supabase Storage.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  checklist_item_key text references public.compliance_item_defs (item_key) on delete restrict,
  filename text not null,
  storage_bucket text not null default 'expedientes',
  storage_path text not null,
  mime_type text,
  size_bytes integer check (size_bytes is null or size_bytes between 1 and 10485760),
  checksum text check (checksum is null or checksum ~ '^[a-f0-9]{64}$'),
  review_status public.document_review_status not null default 'Pendiente',
  expires_on date,
  uploaded_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint documents_path_unique unique (storage_bucket, storage_path)
);

-- Varios archivos por casilla a proposito: el indice no es unico.
create index documents_client_idx on public.documents (client_id) where deleted_at is null;
create index documents_item_idx on public.documents (client_id, checklist_item_key)
  where deleted_at is null;

create trigger documents_touch_updated
  before update on public.documents
  for each row execute function public.touch_updated_at();

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
  created_at timestamptz not null default now(),
  constraint screenings_algun_sujeto check (client_id is not null or contact_id is not null)
);

create index screenings_client_idx on public.screenings (client_id, created_at desc);

-- ============================================================================
-- C. RUTA B: PIPELINE COMERCIAL B2B
-- ============================================================================

-- Etiquetas de las seis etapas. El numero es la clave; el texto ya no vive en el codigo
-- del frontend ni en una columna de cada negocio.
create table public.deal_stages (
  stage smallint primary key check (stage between 1 and 6),
  label text not null unique,
  order_index smallint not null default 1
);

insert into public.deal_stages (stage, label, order_index) values
  (1, 'Contacto inicial', 1),
  (2, 'Reunion agendada', 2),
  (3, 'Resumen ejecutivo enviado', 3),
  (4, 'Cotizacion de transferencia', 4),
  (5, 'Negociacion', 5),
  (6, 'Ganado o cerrado', 6)
on conflict (stage) do nothing;

create type public.lost_reason as enum (
  'precio', 'plazo', 'proveedor_actual', 'sin_presupuesto', 'sin_decision', 'no_responde', 'otro'
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^B2B-[0-9]{4,8}$'),
  client_id uuid not null references public.clients (id) on delete cascade,
  stage smallint not null default 1 references public.deal_stages (stage),
  deal_type text not null default 'Transferencia Institucional B2B',
  frequency text default 'Por definir',
  monthly_volume numeric(14, 2) not null default 0 check (monthly_volume >= 0),
  next_step text,
  expected_close_on date,
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

-- Historico del embudo: aqui nace toda la medicion.
create table public.deal_events (
  id bigint generated always as identity primary key,
  deal_id uuid not null references public.deals (id) on delete cascade,
  from_stage smallint references public.deal_stages (stage),
  to_stage smallint not null references public.deal_stages (stage),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index deal_events_deal_idx on public.deal_events (deal_id, created_at);

-- Un asiento por cambio real de etapa, incluido el alta (origen nulo).
--
-- El actor sale del JWT de la peticion. En el esquema anterior salia de
-- current_setting('app.actor_email'), una variable de sesion que ningun codigo del
-- proyecto establecia nunca: todos los asientos quedaban atribuidos a 'sistema'.
create or replace function public.record_deal_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  correo text;
begin
  if new.stage is distinct from old.stage then
    -- Marca de escritura del sistema: sin ella, el disparador deal_events_no_direct_write
    -- de la migracion 0004 rechazaria este insert.
    perform set_config('crm.system_write', 'on', true);

    correo := coalesce(
      public.current_user_email(),
      (select p.email from public.profiles p where p.id = new.owner_id),
      'sistema'
    );

    insert into public.deal_events (deal_id, from_stage, to_stage, actor_id, actor_email, reason)
    values (new.id, old.stage, new.stage, public.current_user_id(), correo, null);
  end if;
  return new;
end;
$$;

create trigger deals_stage_change
  after update on public.deals
  for each row execute function public.record_deal_stage_change();

-- Actividad: la agenda del equipo. Los participantes son identificadores de perfil, no
-- correos escritos a mano, para que un cambio de nombre no deje registros colgando.
create type public.activity_type as enum ('llamada', 'reunion', 'visita', 'correo', 'tarea', 'nota');

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  type public.activity_type not null,
  title text not null,
  body text,
  due_at timestamptz,
  done_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  participants uuid[] not null default '{}',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint activities_title_length check (char_length(title) between 3 and 200),
  constraint activities_done_needs_date check (done_at is null or done_at >= created_at)
);

create index activities_owner_due_idx on public.activities (owner_id, due_at)
  where deleted_at is null and done_at is null;
create index activities_client_timeline_idx on public.activities (client_id, created_at desc)
  where deleted_at is null;
create index activities_participants_idx on public.activities using gin (participants);

create trigger activities_touch_updated
  before update on public.activities
  for each row execute function public.touch_updated_at();

-- Segmentacion. Una cuenta puede ser a la vez "importador", "La Paz" y "prioridad alta".
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#1E3653' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create table public.client_tags (
  client_id uuid not null references public.clients (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, tag_id)
);

-- ============================================================================
-- D. RECLAMOS DEL CONSUMIDOR FINANCIERO
-- ============================================================================

create type public.claim_category as enum (
  'atraso_respuesta', 'error_operacion', 'cobro_indebido', 'cierre_servicio', 'incumplimiento_normativo', 'otro'
);

create type public.claim_status as enum ('recibido', 'en_analisis', 'requiere_documentos', 'respondido', 'cerrado', 'elevado_asfi');

-- Plazo de respuesta: sin valor por defecto. El numero lo fija la normativa y hasta que
-- Cumplimiento lo confirme se escribe en cada reclamo; no se inventa aqui.
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^RC-[0-9]{4}-[0-9]{4}$'),
  client_id uuid not null references public.clients (id) on delete restrict,
  conversation_id uuid references public.conversations (id) on delete set null,
  transaction_ref text,
  category public.claim_category not null,
  status public.claim_status not null default 'recibido',
  summary text not null check (char_length(summary) between 10 and 2000),
  description text,
  resolution text,
  received_at timestamptz not null default now(),
  due_at timestamptz,
  responded_at timestamptz,
  asfi_ref text,
  handler_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint claims_respuesta_posterior check (responded_at is null or responded_at >= received_at),
  constraint claims_cerrado_con_resolucion check (status <> 'cerrado' or resolution is not null)
);

create index claims_status_idx on public.claims (status, received_at) where deleted_at is null;
create index claims_client_idx on public.claims (client_id, received_at desc) where deleted_at is null;

create trigger claims_touch_updated
  before update on public.claims
  for each row execute function public.touch_updated_at();

-- Semforo de reclamos: vencidos, por vencer, en curso.
create or replace view public.vw_claims_sla
with (security_invoker = true) as
select cl.id,
       cl.code,
       cl.client_id,
       ct.display_name as cliente,
       cl.category,
       cl.status,
       cl.received_at,
       cl.due_at,
       cl.responded_at,
       (cl.due_at is null) as sin_plazo_definido,
       (cl.due_at < now() and cl.responded_at is null) as vencido,
       greatest(0, floor(extract(epoch from (coalesce(cl.due_at, now()) - cl.received_at)) / 86400))::integer as dias_transcurridos
from public.claims cl
join public.clients ct on ct.id = cl.client_id
where cl.deleted_at is null
order by cl.due_at nulls last;

-- ============================================================================
-- E. RUTA C: CONTROL DE RIESGO Y CUPOS
-- ============================================================================

-- Perfil ECP de la cuenta: lo que el CRM registra y usa para alertar. El consumo real de
-- cupo lo administra la plataforma central de Alyto y no se copia en esta base.
create table public.client_ecp_profile (
  client_id uuid primary key references public.clients (id) on delete cascade,
  usuario_alta_ecp text,
  estado_usuario text not null default 'no dado de alta' check (
    estado_usuario in ('no dado de alta', 'activo', 'suspendido', 'baja registrada')
  ),
  tope_operacion_bs numeric(14, 2),
  cupo_mensual_operaciones integer check (cupo_mensual_operaciones is null or cupo_mensual_operaciones > 0),
  riesgo text not null default 'por clasificar' check (
    riesgo in ('por clasificar', 'bajo', 'medio', 'alto')
  ),
  revisado_en date,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger client_ecp_profile_touch_updated
  before update on public.client_ecp_profile
  for each row execute function public.touch_updated_at();
