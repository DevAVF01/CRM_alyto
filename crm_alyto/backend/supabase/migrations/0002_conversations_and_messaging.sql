-- 0002: conversaciones, mensajes, plantillas, terminos bloqueados y nivel de servicio
--
-- Este es el nucleo del CRM de operaciones y atencion: la bandeja de entrada unificada.
-- Requiere 0001 (tipos, parametros del ECP y funciones de horario laboral).

-- Canales oficiales por los que entra una conversacion. 'interno' es una nota del equipo:
-- no se envia a nadie, por eso no pasa por el filtro de lenguaje.
create type public.channel_kind as enum (
  'whatsapp', 'correo', 'chat_app', 'web_chat', 'linkedin', 'meta', 'tiktok', 'formulario', 'telefonica', 'interno'
);

-- Estado operativo de un hilo.
create type public.conversation_status as enum (
  'abierta', 'en_espera_cliente', 'en_espera_agente', 'resuelta', 'cerrada', 'spam'
);

-- Motivo de la consulta, que decide a que cola va y quien la atiende.
create type public.query_category as enum (
  'soporte_tecnico', 'registro_kyc', 'empresa_b2b', 'reclamo', 'consulta_saldo', 'otro'
);

create type public.message_direction as enum ('entrante', 'saliente');
create type public.message_status as enum ('recibido', 'enviado', 'entregado', 'leido', 'fallido');

-- Diccionario de terminos vetados por el glosario institucional. Vive en la base y no en el
-- codigo para que Cumplimiento pueda ampliarlo sin desplegar nada.
create table public.blocked_terms (
  id smallint generated always as identity primary key,
  term text not null unique,
  severity text not null default 'bloqueo' check (severity in ('advertencia', 'bloqueo')),
  suggestion text not null,
  reason text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- El contenido del diccionario vive en 0006_glossary_seed.sql, escrito con la palabra
-- literal porque asi la exige la comparacion. Ese archivo esta fuera de la auditoria de
-- marca de la integracion continua por la misma razon que brandCopy.ts: citar el termino
-- vetado es justamente su funcion.

-- Plantillas preaprobadas. El codigo identifica la plantilla y la version es inmutable:
-- si cambia el texto, se inserta la version 2 y las conversaciones antiguas siguen
-- apuntando a la version con la que se escribieron.
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version smallint not null default 1,
  name text not null,
  channel public.channel_kind,
  subject text,
  body text not null check (length(body) between 10 and 4000),
  variables text[] not null default '{}',
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint templates_code_version_unique unique (code, version)
);

create index templates_active_idx on public.templates (code) where is_active and deleted_at is null;

create trigger templates_touch_updated
  before update on public.templates
  for each row execute function public.touch_updated_at();

-- Ningun mensaje puede salir con un termino vetado. El disparador corre antes de escribir,
-- asi que la fila nunca llega a existir: es bloqueo, no aviso posterior. Se declara debajo
-- de la tabla messages, junto con el resto de sus disparadores.
--
-- Es security definer porque blocked_terms no debe ser legible desde el navegador para
-- descubrir el diccionario por fuerza bruta; solo el disparador lo consulta.
create or replace function public.block_prohibited_language()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  encontrada text;
begin
  -- Comparacion de subcadena, no expresion regular: armar un patron a partir de texto
  -- guardado en la base abre la puerta a que un termino mal escrito rompa el disparador
  -- o cambie de significado.
  --
  -- Solo la severidad 'bloqueo' impide escribir el mensaje. La 'advertencia' no bloquea el
  -- envio porque la decision final es de Cumplimiento; se ve en vw_messages_flagged.
  select bt.term into encontrada
  from public.blocked_terms bt
  where bt.severity = 'bloqueo'
    and bt.is_active
    and position(lower(bt.term) in lower(new.body)) > 0
  order by bt.term
  limit 1;

  if encontrada is not null then
    raise exception 'El mensaje contiene un termino no autorizado por el glosario: %', encontrada
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Reglas de enrutamiento: la categoria de consulta determina la cola, a que rol se asigna
-- por defecto y con que prioridad entra.
create table public.routing_rules (
  id smallint generated always as identity primary key,
  query_category public.query_category not null,
  queue text not null,
  route_to_role public.user_role not null,
  priority smallint not null default 3 check (priority between 1 and 5),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint routing_rules_categoria_unica unique (query_category)
);

insert into public.routing_rules (query_category, queue, route_to_role, priority) values
  ('soporte_tecnico', 'Soporte tecnico', 'soporte', 2),
  ('registro_kyc', 'Registro y KYC', 'operaciones', 2),
  ('empresa_b2b', 'Empresas B2B', 'ventas', 3),
  ('reclamo', 'Reclamos', 'compliance', 1),
  ('consulta_saldo', 'Soporte tecnico', 'soporte', 3),
  ('otro', 'Bandeja general', 'soporte', 4)
on conflict (query_category) do nothing;

-- Conversacion: el objeto central del CRM. Un hilo por cliente y canal.
--
-- channel_conv_id es el identificador que pone el canal (el thread de un correo, la clave
-- de un chat de WhatsApp). Cuando esta vacio se permite mas de un hilo del mismo canal, que
-- es el caso de la captura de leads en redes sociales.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  channel public.channel_kind not null,
  channel_conv_id text,
  subject text,
  query_category public.query_category not null default 'otro',
  queue text not null default 'Bandeja general',
  status public.conversation_status not null default 'abierta',
  assignee_id uuid references public.profiles (id) on delete set null,
  priority smallint not null default 3 check (priority between 1 and 5),
  first_inbound_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_message_at timestamptz,
  messages_count integer not null default 0,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index conversations_thread_idx on public.conversations (client_id, channel, channel_conv_id)
  where deleted_at is null and channel_conv_id is not null;
create index conversations_inbox_idx on public.conversations (status, last_message_at desc)
  where deleted_at is null;
create index conversations_queue_idx on public.conversations (queue, status) where deleted_at is null;
create index conversations_assignee_idx on public.conversations (assignee_id, status)
  where deleted_at is null and assignee_id is not null;
create index conversations_client_idx on public.conversations (client_id, last_message_at desc)
  where deleted_at is null;

create trigger conversations_touch_updated
  before update on public.conversations
  for each row execute function public.touch_updated_at();

-- Mensaje: cada entrada y salida del hilo.
--
-- No hay columna de contenido cifrado ni de datos de tarjeta: el CRM guarda el texto del
-- mensaje, no lo que el cliente escribe en la app de pagos.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction public.message_direction not null,
  channel public.channel_kind not null,
  body text not null check (length(body) between 1 and 8000),
  sender_label text,
  template_id uuid references public.templates (id) on delete set null,
  automated boolean not null default false,
  cadence_execution_id uuid,
  external_msg_id text,
  status public.message_status not null default 'recibido',
  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index messages_external_idx on public.messages (channel, external_msg_id)
  where external_msg_id is not null;
create index messages_thread_idx on public.messages (conversation_id, sent_at);
create index messages_sent_at_idx on public.messages (sent_at desc);

-- El canal del mensaje tiene que ser el del hilo: un mensaje "whatsapp" dentro de una
-- conversacion de correo rompería el orden del historial en la Ficha 360.
create or replace function public.check_message_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canal public.channel_kind;
begin
  select c.channel into canal from public.conversations c where c.id = new.conversation_id;
  if canal is null then
    raise exception 'La conversacion % no existe', new.conversation_id using errcode = 'foreign_key_violation';
  end if;
  if new.channel <> canal then
    raise exception 'El canal del mensaje (%) no coincide con el de la conversacion (%)', new.channel, canal
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger messages_channel_matches_thread
  before insert or update of channel, conversation_id on public.messages
  for each row execute function public.check_message_channel();

-- Las notas internas no se envian a nadie, asi que no pasan por el filtro de lenguaje.
--
-- El filtro tampoco corre sobre los mensajes entrantes: lo que escribe el cliente es parte
-- del registro, no una salida nuestra. Bloquearlo por contener un termino vetado perderia el
-- mensaje y dejaria el hilo incompleto justo donde la trazabilidad importa.
create trigger messages_language_guard
  before insert or update of body on public.messages
  for each row when (new.direction = 'saliente' and new.channel <> 'interno'::public.channel_kind)
  execute function public.block_prohibited_language();

-- La clave ajena hacia cadence_executions se declara en 0003, que es donde nace esa tabla:
-- una clave foranea no puede apuntar hacia adelante.

-- Contadores del hilo, mantenidos por el sistema.
--
-- Es security definer por dos razones: conversations no admite que un usuario cualquiera
-- mueva sus contadores, y el disparador debe poder escribirlos aunque quien manda el mensaje
-- solo tenga permiso sobre messages.
create or replace function public.sync_conversation_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'entrante' then
    update public.conversations
    set last_inbound_at = new.sent_at,
        last_message_at = new.sent_at,
        messages_count = messages_count + 1,
        first_inbound_at = coalesce(first_inbound_at, new.sent_at),
        -- Un mensaje entrante reactiva un hilo que estaba esperando al cliente.
        status = case when status = 'en_espera_cliente'::public.conversation_status
                      then 'abierta'::public.conversation_status
                      else status end
    where id = new.conversation_id;
  else
    update public.conversations
    set last_outbound_at = new.sent_at,
        last_message_at = new.sent_at,
        messages_count = messages_count + 1
    where id = new.conversation_id;
  end if;
  return new;
end;
$$;

create trigger messages_sync_conversation
  after insert on public.messages
  for each row execute function public.sync_conversation_counters();

-- Bitacora: cada mensaje deja su asiento inalterable, con quien lo mando.
--
-- El actor sale de las declaraciones del JWT de la peticion, no de una variable de sesion
-- que nadie define. Ver public.current_user_email() en 0001.
create or replace function public.log_message_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  correo text;
begin
  correo := coalesce(
    public.current_user_email(),
    (select p.email from public.profiles p where p.id = new.sent_by),
    'sistema'
  );

  insert into public.audit_events (actor, action, entity_type, entity_id, detail)
  values (
    correo,
    'mensaje_' || new.direction,
    'messages',
    new.id::text,
    left(new.body, 240)
  );
  return new;
end;
$$;

-- Nivel de servicio: las conversaciones que ya superaron las horas habiles de garantia.
--
-- Solo cuentan los hilos que esperan al agente: un hilo que esta en espera de respuesta del
-- cliente no es incumplimiento, y marcarlo rojo llenaria la bandeja de falsas alertas.
--
-- Recibe el momento del ultimo mensaje entrante y no la fila entera de conversations. Una
-- funcion declarada sobre el tipo de la tabla solo acepta la fila completa y en el orden de
-- la tabla: cualquier vista que proyecte un subconjunto de columnas, o que agregue el nombre
-- del cliente en el medio, produce "cannot cast type record to conversations".
create or replace function public.conversation_sla_deadline(desde timestamptz)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public.add_business_hours(
    desde,
    (select p.sla_horas_sin_atencion from public.ecp_parameters p where p.id = 1)
  );
$$;

create or replace view public.vw_conversations_sla
with (security_invoker = true) as
with abiertas as (
  select c.id,
         c.client_id,
         cl.display_name as cliente,
         c.channel,
         c.queue,
         c.status,
         c.assignee_id,
         c.last_inbound_at
  from public.conversations c
  join public.clients cl on cl.id = c.client_id
  where c.deleted_at is null
    and cl.deleted_at is null
    and c.status in ('abierta', 'en_espera_agente')
    and c.last_inbound_at is not null
)
select a.id,
       a.client_id,
       a.cliente,
       a.channel,
       a.queue,
       a.status,
       a.assignee_id,
       a.last_inbound_at,
       public.business_hours_since(a.last_inbound_at) as horas_habiles_sin_atencion,
       public.conversation_sla_deadline(a.last_inbound_at) as vence_en,
       (public.business_hours_since(a.last_inbound_at) >=
        (select p.sla_horas_sin_atencion from public.ecp_parameters p where p.id = 1)) as vencida
from abiertas a
order by horas_habiles_sin_atencion desc;

-- Bandeja: lo que ve el agente al abrir el CRM. Un resumen por conversacion, sin agregados
-- calculados en la tabla.
create or replace view public.vw_inbox
with (security_invoker = true) as
select c.id,
       c.client_id,
       cl.display_name as cliente,
       cl.account_type,
       cl.onboarding_stage,
       c.channel,
       c.query_category,
       c.queue,
       c.status,
       c.priority,
       c.assignee_id,
       p.display_name as asignado_a,
       c.messages_count,
       c.last_message_at,
       c.last_inbound_at,
       c.last_outbound_at,
       left(m.body, 140) as ultimo_mensaje,
       m.direction as direccion_ultimo_mensaje,
       m.sent_at as momento_ultimo_mensaje
from public.conversations c
join public.clients cl on cl.id = c.client_id
left join public.profiles p on p.id = c.assignee_id
left join lateral (
  select mm.body, mm.direction, mm.sent_at
  from public.messages mm
  where mm.conversation_id = c.id
  order by mm.sent_at desc
  limit 1
) m on true
where c.deleted_at is null and cl.deleted_at is null
order by c.last_message_at desc nulls last;

-- Mensajes que rozaron un termino de severidad 'advertencia'. No impiden el envio, pero
-- Cumplimiento los ve antes de la siguiente revision normativa.
--
-- Va al final del fichero porque necesita que la tabla messages ya exista: una vista no
-- puede declararse antes de las tablas que consulta.
create or replace view public.vw_messages_flagged
with (security_invoker = true) as
select m.id as message_id,
       m.conversation_id,
       m.direction,
       bt.term,
       bt.suggestion,
       m.sent_at
from public.messages m
join public.blocked_terms bt
  on bt.severity = 'advertencia'
 and bt.is_active
 and position(lower(bt.term) in lower(m.body)) > 0;
