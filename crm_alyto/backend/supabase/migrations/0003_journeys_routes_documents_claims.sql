-- 0003: señales y viajes, legajo de documentos, rutas en paralelo y reclamos
--
-- Modelo del 27/10. Este fichero sustituye el embudo comercial por las tres piezas que usa un
-- CRM de operaciones: un registro de lo que ocurrio (signals), secuencias automaticas que
-- reaccionan a eso (journeys) y los tres caminos que un cliente recorre a la vez (routes).
--
-- Salen de la base: deals, deal_stages, deal_events, client_ecp_profile, cadence_templates,
-- cadence_steps, cadence_enrollments, cadence_executions, compliance_item_defs y
-- compliance_items. Requiere 0001 y 0002.

-- ============================================================================
-- A. SEÑALES Y VIAJES
-- ============================================================================

-- Senal: el hecho que dispara algo. "A este contacto le faltan datos", "esta consulta lleva dos
-- horas sin respuesta", "este documento quedo observado". Sin esta tabla el motor tendria que
-- deducir el estado del mundo cada vez que corre, que es como se construyen los duplicados: dos
-- pasadas del mismo viaje le mandan al cliente el mismo mensaje dos veces.
create type public.signal_kind as enum (
  'documento_observado',
  'datos_incompletos',
  'consulta_sin_responder',
  'sin_respuesta_cliente',
  'reclamo_recibido',
  'documento_por_vencer'
);

create type public.journey_audience as enum ('persona_natural', 'persona_juridica');
create type public.journey_step_status as enum ('pendiente', 'enviado', 'fallido', 'cancelado', 'omitido');
-- 'convertida' era el final feliz del embudo. Un viaje termina porque se ejecutaron todos los
-- pasos o porque se corto, no porque se concreto una venta.
create type public.journey_enrollment_status as enum ('activa', 'pausada', 'finalizada', 'cancelada');

create table public.signals (
  id uuid primary key default gen_random_uuid(),
  kind public.signal_kind not null,
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  -- Que fila del CRM originó el hecho. Es polimorfica a proposito: una senal puede nacer de un
  -- documento, de un reclamo o de un mensaje, y una clave ajena por cada origen obligaria a
  -- abrir el orden de creacion de las tablas.
  entity_type text,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'abierta' check (status in ('abierta', 'consumida', 'descartada')),
  -- Clave anti duplicado: la misma condicion no genera dos senales abiertas. Se resuelve por
  -- indice parcial, asi que una senal ya consumida no impide que la condicion vuelva a ocurrir.
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint signals_consuma_coherente check (
    (status = 'abierta' and consumed_at is null) or (status <> 'abierta' and consumed_at is not null)
  ),
  constraint signals_entidad_junta check (entity_type is null or entity_id is not null)
);

create unique index signals_open_dedupe_idx on public.signals (dedupe_key) where status = 'abierta';
create index signals_pending_idx on public.signals (kind, created_at) where status = 'abierta';
create index signals_client_idx on public.signals (client_id, created_at desc);

-- Viaje: una secuencia con sus pasos. La cadencia B2B de 14 dias y 6 pasos es un viaje mas
-- (V-01), no una entidad especial del esquema.
create table public.journeys (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^V-[0-9]{2}$'),
  name text not null unique,
  description text,
  audience public.journey_audience not null default 'persona_juridica',
  -- Que senal lo dispara. Un viaje sin disparador solo corre por pedido explicito del equipo.
  trigger_signal public.signal_kind,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger journeys_touch_updated
  before update on public.journeys
  for each row execute function public.touch_updated_at();

-- Paso del viaje: dia numero, canal y plantilla concreta con su version.
create table public.journey_steps (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete cascade,
  step_order smallint not null check (step_order between 1 and 20),
  day_number smallint not null check (day_number between 1 and 90),
  channel public.channel_kind not null,
  template_code text not null,
  template_version smallint not null default 1,
  description text,
  created_at timestamptz not null default now(),
  constraint journey_steps_order_unique unique (journey_id, step_order),
  constraint journey_steps_template_exists foreign key (template_code, template_version)
    references public.templates (code, version)
);

create index journey_steps_journey_idx on public.journey_steps (journey_id, day_number);

-- Los dias del viaje tienen que ir hacia adelante: un paso 5 programado para el dia 3 se
-- enviaria antes que el paso 2 y la secuencia perderia el sentido.
create or replace function public.check_journey_step_day_order()
returns trigger
language plpgsql
as $$
declare
  -- Variable escalar, no record: PostgreSQL no permite escribir en un campo de un record
  -- mientras la variable no haya recibido una fila completa.
  dia_anterior smallint;
begin
  select js.day_number into dia_anterior
  from public.journey_steps js
  where js.journey_id = new.journey_id
    and js.step_order = new.step_order - 1;

  if found and new.day_number <= dia_anterior then
    raise exception 'El paso % del viaje debe caer despues del dia %', new.step_order, dia_anterior
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger journey_steps_day_order
  before insert or update of step_order, day_number on public.journey_steps
  for each row execute function public.check_journey_step_day_order();

-- Inscripcion de un cliente en un viaje, con la senal que la abrio cuando existe.
create table public.journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  signal_id uuid references public.signals (id) on delete set null,
  status public.journey_enrollment_status not null default 'activa',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  final_outcome text check (
    final_outcome is null or final_outcome in ('ruta_abierta', 'en_pausa', 'no_contactado', 'cancelado')
  ),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_enrollments_unique unique (journey_id, client_id),
  -- Una pausa no es un cierre: 'pausada' se deja con finished_at vacio porque la secuencia puede
  -- reactivarse. Lo que si exige fecha es el final real, y ese lo marca 'finalizada' o
  -- 'cancelada'. El motivo del paro vive en final_outcome, no en la fecha.
  constraint journey_enrollments_cierre check (
    (status in ('activa', 'pausada') and finished_at is null)
    or (status in ('finalizada', 'cancelada') and finished_at is not null)
  )
);

create index journey_enrollments_client_idx on public.journey_enrollments (client_id);
create index journey_enrollments_open_idx on public.journey_enrollments (status, started_at)
  where status = 'activa';

create trigger journey_enrollments_touch_updated
  before update on public.journey_enrollments
  for each row execute function public.touch_updated_at();

-- Ejecucion prevista o real de un paso. Es el unico lugar donde se guarda un momento
-- programado, y el rastro de si salio o no: la bandeja y la pantalla de viajes consultan aqui.
create table public.journey_runs (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.journey_enrollments (id) on delete cascade,
  journey_step_id uuid not null references public.journey_steps (id) on delete restrict,
  signal_id uuid references public.signals (id) on delete set null,
  scheduled_for timestamptz not null,
  status public.journey_step_status not null default 'pendiente',
  attempted_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  constraint journey_runs_step_unique unique (enrollment_id, journey_step_id),
  -- Un paso enviado tiene momento de envio; uno fallido tiene por que fallo. Sin esto la
  -- bandeja de salida muestra estados que no se pueden explicar.
  constraint journey_runs_coherencia check (
    (status <> 'enviado' or sent_at is not null)
    and (status <> 'fallido' or error is not null)
  )
);

create index journey_runs_due_idx on public.journey_runs (scheduled_for)
  where status = 'pendiente';
create index journey_runs_signal_idx on public.journey_runs (signal_id) where signal_id is not null;

-- Ahora si se puede cerrar el circulo: un mensaje sabe que paso del viaje lo genero. La columna
-- nace en 0002 y la clave ajena se declara aqui, que es donde nace journey_runs: una clave
-- foranea no puede apuntar hacia adelante.
alter table public.messages
  add constraint messages_journey_run_fk
  foreign key (journey_run_id) references public.journey_runs (id) on delete set null;

-- Un mensaje automatico tiene que venir de una ejecucion, y uno manual no.
create or replace function public.check_message_automation()
returns trigger
language plpgsql
as $$
begin
  if new.automated and new.journey_run_id is null then
    raise exception 'Un mensaje marcado como automatico debe indicar la ejecucion del viaje que lo genero'
      using errcode = 'check_violation';
  end if;
  if not new.automated and new.journey_run_id is not null then
    raise exception 'Un mensaje manual no puede colgar de la ejecucion de un viaje'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger messages_automation_consistency
  before insert or update of automated, journey_run_id on public.messages
  for each row execute function public.check_message_automation();

-- Proximo paso pendiente de cada inscripcion activa: lo que muestra la pantalla de viajes.
-- Conserva el nombre vw_cadence_pending porque es el que lee backend/src/data/repository.js;
-- se renombra junto con el codigo, en su propio cambio.
create or replace view public.vw_cadence_pending
with (security_invoker = true) as
select *
from (
  select e.id as enrollment_id,
         j.name as cadencia,
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
  from public.journey_enrollments e
  join public.journeys j on j.id = e.journey_id
  join public.clients cl on cl.id = e.client_id
  join public.journey_runs x on x.enrollment_id = e.id
  join public.journey_steps s on s.id = x.journey_step_id
  where e.status = 'activa'
    and x.status = 'pendiente'
    and e.finished_at is null
) primero
where primero.posicion = 1
order by primero.scheduled_for;

-- Senales abiertas, con el cliente y el nombre de la condicion en texto para la pantalla.
create or replace view public.vw_signals_open
with (security_invoker = true) as
select g.id,
       g.kind,
       g.client_id,
       cl.display_name as cliente,
       g.conversation_id,
       g.entity_type,
       g.entity_id,
       g.detail,
       g.created_at
from public.signals g
join public.clients cl on cl.id = g.client_id
where g.status = 'abierta'
order by g.created_at;

-- ============================================================================
-- B. RUTA A: LEGAJO DE DOCUMENTOS Y DEBIDA DILIGENCIA
-- ============================================================================

-- Que hace falta y para quien. Se llamaba compliance_item_defs: un nombre oscuro para lo que es
-- un requisito. La etiqueta vive aqui una sola vez; repetirla en cada cliente era la violacion de
-- tercera forma normal que Alvaro pidio corregir.
create table public.document_requirements (
  code text primary key,
  label text not null,
  description text,
  document_required boolean not null default false,
  applies_to public.account_type[] not null default array['persona_natural', 'persona_juridica']::public.account_type[],
  order_index smallint not null default 1,
  is_active boolean not null default true
);

-- Los literales de array van etiquetados: sin el cast, una columna public.account_type[] devuelve
-- "cannot cast type json... / 42804" al insertar.
insert into public.document_requirements
  (code, label, description, document_required, applies_to, order_index) values
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
on conflict (code) do nothing;

-- Estado de cada requisito para una cuenta concreta. Antes compliance_items.
create table public.document_reviews (
  client_id uuid not null references public.clients (id) on delete cascade,
  requirement_code text not null references public.document_requirements (code) on delete restrict,
  status public.kyc_status not null default 'Pendiente',
  detail text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, requirement_code)
);

create index document_reviews_status_idx on public.document_reviews (status);

create trigger document_reviews_touch_updated
  before update on public.document_reviews
  for each row execute function public.touch_updated_at();

-- Al abrir una cuenta se crea la plantilla completa de requisitos que le aplican.
create or replace function public.seed_document_reviews()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.document_reviews (client_id, requirement_code)
  select new.id, d.code
  from public.document_requirements d
  where d.is_active
    and new.account_type = any (d.applies_to)
  on conflict (client_id, requirement_code) do nothing;
  return new;
end;
$$;

create trigger clients_document_reviews_template
  after insert on public.clients
  for each row execute function public.seed_document_reviews();

-- Un requisito no pasa a Aprobado sin documento adjunto, salvo que no lo requiera.
-- Solo al entrar en aprobado: reeditar uno que ya lo esta no debe bloquearse.
create or replace function public.require_document_for_approval()
returns trigger
language plpgsql
as $$
declare
  hace_falta boolean;
  archivos integer;
begin
  select d.document_required into hace_falta
  from public.document_requirements d
  where d.code = new.requirement_code;

  if new.status = 'Aprobado' and coalesce(hace_falta, false) and old.status is distinct from 'Aprobado' then
    select count(*) into archivos
    from public.documents
    where client_id = new.client_id
      and requirement_code = new.requirement_code
      and review_status = 'Aprobado'
      and deleted_at is null;

    if archivos = 0 then
      raise exception 'El requisito % requiere un documento aprobado antes de aprobarse', new.requirement_code
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger document_reviews_need_document
  before update on public.document_reviews
  for each row execute function public.require_document_for_approval();

-- Avance del legajo por cuenta: porcentaje de requisitos aprobados, calculado al vuelo.
create or replace view public.vw_compliance_progress
with (security_invoker = true) as
select c.id as client_id,
       c.display_name as cliente,
       c.account_type,
       count(*) as casillas,
       count(*) filter (where r.status = 'Aprobado') as aprobadas,
       count(*) filter (where r.status = 'Observado') as observadas,
       count(*) filter (where r.status = 'En revision') as en_revision,
       count(*) filter (where r.status = 'Rechazado') as rechazadas,
       round(100.0 * count(*) filter (where r.status = 'Aprobado') / nullif(count(*), 0)) as porcentaje_aprobado
from public.clients c
join public.document_reviews r on r.client_id = c.id
where c.deleted_at is null
group by c.id, c.display_name, c.account_type;

-- Documento: solo metadatos. El archivo fisico vive en el almacen de Supabase Storage.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  requirement_code text references public.document_requirements (code) on delete restrict,
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

-- Varios archivos por requisito a proposito: el indice no es unico.
create index documents_client_idx on public.documents (client_id) where deleted_at is null;
create index documents_requirement_idx on public.documents (client_id, requirement_code)
  where deleted_at is null;
-- La pantalla de vencimientos busca por fecha, no por cliente.
create index documents_expires_idx on public.documents (expires_on)
  where deleted_at is null and expires_on is not null;

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
-- C. LAS TRES RUTAS EN PARALELO
-- ============================================================================

-- Un cliente no recorre seis etapas en linea: tiene a la vez un camino de documentacion, uno
-- comercial y uno de riesgo y cupos, y cada uno avanza, se detiene o se cierra por su cuenta.
create type public.route_kind as enum ('documentacion', 'comercial', 'riesgo');
create type public.route_estado as enum (
  'abierta', 'en_curso', 'en_espera_cliente', 'bloqueada', 'cerrada', 'cerrada_sin_resultado'
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  -- Correlativo legible por tipo de ruta, para poder citar una ruta en un correo o en un
  -- requerimiento: RTA-0001, RTB-0001, RTC-0001.
  code text not null unique check (code ~ '^RT[ABC]-[0-9]{4}$'),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind public.route_kind not null,
  estado public.route_estado not null default 'abierta',
  owner_id uuid references public.profiles (id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Detalle de la ruta B. Se conservan tres datos que el equipo ya carga y que sirven para
  -- responder mejor; lo que se elimino es la etapa, la fecha prevista de cierre y el motivo de
  -- perdida, que eran el embudo.
  operation_type text,
  frequency text,
  monthly_volume_bs numeric(14, 2) check (monthly_volume_bs is null or monthly_volume_bs >= 0),
  next_step text,
  -- Motivo declarado del ultimo movimiento de estado. El disparador lo copia al asiento y ahi
  -- queda para siempre; en la ruta vive porque es lo que hay que leer antes de moverla otra vez
  -- ("porque le falta el tributario", no "porque si").
  motivo text,
  constraint routes_cierre_coherente check (
    estado not in ('cerrada', 'cerrada_sin_resultado') or closed_at is not null
  ),
  -- Una ruta bloqueada o cerrada sin explicacion no responde la pregunta que hace el ECP: por que
  -- se paro esto. Exigirlo en la escritura es la unica forma de que la respuesta exista diez
  -- meses despues.
  constraint routes_motivo_obligatorio check (
    estado not in ('bloqueada', 'cerrada_sin_resultado') or motivo is not null
  ),
  constraint routes_detalle_solo_comercial check (
    kind = 'comercial'
    or (operation_type is null and frequency is null and monthly_volume_bs is null and next_step is null)
  )
);

create unique index routes_client_kind_idx on public.routes (client_id, kind) where deleted_at is null;
create index routes_board_idx on public.routes (estado, opened_at) where deleted_at is null;
create index routes_owner_idx on public.routes (owner_id, estado)
  where deleted_at is null and owner_id is not null;
create index routes_cliente_idx on public.routes (client_id) where deleted_at is null;

create trigger routes_touch_updated
  before update on public.routes
  for each row execute function public.touch_updated_at();

-- El momento de cierre lo pone la base, no el usuario. Es un disparador BEFORE y no un UPDATE
-- dentro del AFTER: la restriccion routes_cierre_coherente se evalua antes de que corra
-- cualquier AFTER, asi que una ruta que llega a 'cerrada' sin closed_at seria rechazada antes
-- de que nadie pudiera completearla.
create or replace function public.routes_set_closed_at()
returns trigger
language plpgsql
as $$
begin
  if new.estado in ('cerrada', 'cerrada_sin_resultado') then
    if new.closed_at is null then new.closed_at := now(); end if;
  else
    -- Reabrir una ruta deja la fecha de cierre anterior sin sentido: una ruta en curso con
    -- closed_at rellenada se lee en cualquier tablero como si estuviera cerrada.
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger routes_close_stamp
  before update of estado on public.routes
  for each row execute function public.routes_set_closed_at();

-- Cada movimiento de una ruta queda asentado con su motivo. Es lo que hacia deal_events, sobre un
-- objeto que ya no es una oportunidad.
create table public.route_events (
  id bigint generated always as identity primary key,
  route_id uuid not null references public.routes (id) on delete cascade,
  from_estado public.route_estado,
  to_estado public.route_estado not null,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_email text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index route_events_route_idx on public.route_events (route_id, created_at);

-- Un asiento por apertura y por cada cambio real de estado.
--
-- El actor sale del JWT de la peticion. En el esquema anterior salia de una variable de sesion
-- que ningun codigo del proyecto establecia nunca: todos los asientos quedaban atribuidos a
-- 'sistema'.
create or replace function public.record_route_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  correo text;
begin
  if (tg_op = 'INSERT') or new.estado is distinct from old.estado then
    -- Marca de escritura del sistema: sin ella, el disparador que prohibe escribir en esta tabla
    -- a mano rechazaria este insert.
    perform set_config('crm.system_write', 'on', true);

    correo := coalesce(
      public.current_user_email(),
      (select p.email from public.profiles p where p.id = new.owner_id),
      'sistema'
    );

    insert into public.route_events (route_id, from_estado, to_estado, actor_id, actor_email, reason)
    values (
      new.id,
      case when tg_op = 'INSERT' then null else old.estado end,
      new.estado,
      public.current_user_id(),
      correo,
      -- El motivo viaja con la movida: quien mueve la ruta lo escribe en la misma sentencia, y el
      -- asiento lo hereda. Asi el historial no depende de que alguien recuerde completarlo despues.
      nullif(btrim(coalesce(new.motivo, '')), '')
    );
  end if;

  return new;
end;
$$;

create trigger routes_event_insert
  after insert on public.routes
  for each row execute function public.record_route_change();

create trigger routes_event_update
  after update of estado on public.routes
  for each row execute function public.record_route_change();

-- Tablero de rutas: las tres de cada cliente en una fila, con su estado. Es la pantalla que
-- sustituye al embudo.
create or replace view public.vw_routes_by_state
with (security_invoker = true) as
select cl.id as client_id,
       cl.display_name as cliente,
       cl.account_type,
       count(*) as rutas_abiertas,
       count(*) filter (where r.estado = 'en_curso') as en_curso,
       count(*) filter (where r.estado = 'en_espera_cliente') as esperando_cliente,
       count(*) filter (where r.estado = 'bloqueada') as bloqueadas,
       count(*) filter (where r.kind = 'documentacion') as tiene_documentacion,
       count(*) filter (where r.kind = 'comercial') as tiene_comercial,
       count(*) filter (where r.kind = 'riesgo') as tiene_riesgo
from public.clients cl
join public.routes r on r.client_id = cl.id
where cl.deleted_at is null and r.deleted_at is null
  and r.estado not in ('cerrada', 'cerrada_sin_resultado')
group by cl.id, cl.display_name, cl.account_type;

-- Tiempo que cada ruta lleva en su estado actual: lo que antes se media "en la etapa".
create or replace view public.vw_route_age
with (security_invoker = true) as
select r.id,
       r.code,
       r.kind,
       r.estado,
       r.client_id,
       cl.display_name as cliente,
       r.owner_id,
       p.display_name as dueno,
       r.motivo,
       public.business_hours_since(
         coalesce((
           select max(re.created_at)
           from public.route_events re
           where re.route_id = r.id
         ), r.opened_at)
       ) as horas_habiles_en_el_estado,
       r.opened_at
from public.routes r
join public.clients cl on cl.id = r.client_id
left join public.profiles p on p.id = r.owner_id
where r.deleted_at is null
  and r.estado not in ('cerrada', 'cerrada_sin_resultado')
order by horas_habiles_en_el_estado desc;

-- Actividad: la agenda del equipo. Los participantes son identificadores de perfil, no
-- correos escritos a mano, para que un cambio de nombre no deje registros colgando.
-- Perdio deal_id: una llamada o una tarea cuelga de un cliente, de un contacto o de un hilo.
create type public.activity_type as enum ('llamada', 'reunion', 'visita', 'correo', 'tarea', 'nota');

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  route_id uuid references public.routes (id) on delete set null,
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
       cl.summary,
       cl.resolution,
       cl.received_at,
       cl.due_at,
       cl.responded_at,
       (cl.due_at is null) as sin_plazo_definido,
       -- Las tres condiciones van escritas: con due_at nulo, 'cl.due_at < now()' da null y la vista
       -- devolveria un vencido que no es ni si ni no. Un reclamo sin plazo no esta vencido, esta sin
       -- plazo, y eso es lo que dice sin_plazo_definido.
       (cl.due_at is not null and cl.due_at < now() and cl.responded_at is null) as vencido,
       greatest(0, floor(extract(epoch from (coalesce(cl.due_at, now()) - cl.received_at)) / 86400))::integer as dias_transcurridos
from public.claims cl
join public.clients ct on ct.id = cl.client_id
where cl.deleted_at is null
order by cl.due_at nulls last;
