-- 0001: identidad, personas y parametros compartidos
--
-- Modelo del 27/10. Este CRM no persigue ventas: registra lo que un cliente consulta, como se
-- enruta, como se responde y que quedo asentado. Por eso clients lleva adentro la ficha del ECP
-- (antes client_ecp_profile) y no lleva etapa de captacion alguna (antes onboarding_stage).
--
-- Alcance: solo lo que el CRM posee. Las operaciones de transferencias internacionales,
-- las carteras y el consumo diario de cupos viven en la base de la app de pagos, que va
-- aparte por indicacion de Alvaro. Aqui no se copia ninguna de esas tablas.
--
-- Aplica sobre una base limpia (PostgreSQL 15+). Orden: 0001 a 0004, despues 0005 y 0006.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Listas cerradas de valores. La base rechaza cualquier texto fuera de ellas, así que un
-- estado escrito con otra mayuscula o un sinónimo deja de ser posible.
create type public.user_role as enum ('admin', 'compliance', 'operaciones', 'ventas', 'soporte');
create type public.account_type as enum ('persona_natural', 'persona_juridica');
create type public.document_review_status as enum ('Pendiente', 'En revision', 'Aprobado', 'Observado');
-- Estado de una casilla del legajo y de la verificacion de la cuenta. Es la misma escala
-- que usa la interfaz, escrita igual, para que un estado con otra mayuscula no deje de
-- contar en las vistas.
create type public.kyc_status as enum ('Pendiente', 'En revision', 'Aprobado', 'Observado', 'Rechazado');
-- Dos listas que usa la bitacora. Se declaran aqui, junto con las demas, y no en 0004 donde
-- nace la tabla audit_events, porque los disparadores de 0002 ya escriben esos valores: una
-- lista cerrada no puede declararse despues de su primer uso.
create type public.audit_actor_kind as enum ('humano', 'agente', 'sistema');
create type public.audit_outcome as enum ('exito', 'rechazado', 'error');
-- Salió public.onboarding_stage. Las cinco etapas de captación eran el embudo de ventas; el
-- ciclo de un cliente se lee ahora de sus tres rutas en paralelo y de kyc_estado, no de una
-- columna que lo ubica "en la etapa 2".

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

-- Parametros del Entorno Controlado de Pruebas y del horario de atencion: una sola fila de
-- configuracion, en lugar de repetir los valores en cada expediente o quemarlos en el codigo.
-- Los topes los fija ASFI; aqui se anotan como referencia, no como dueo de los datos.
create table public.ecp_parameters (
  id smallint primary key default 1,
  usuarios_por_dia integer not null default 630,
  operaciones_por_dia integer not null default 630,
  monto_maximo_operacion_bs numeric(14, 2) not null default 120000,
  duracion_maxima_ecp_meses integer not null default 12,
  estado_autorizacion text not null default 'En proceso dentro del Entorno Controlado de Pruebas',
  sla_horas_sin_atencion numeric(4, 1) not null default 2,
  horario_atencion_inicio time not null default '09:00',
  horario_atencion_fin time not null default '17:00',
  dias_laborales smallint[] not null default array[1, 2, 3, 4, 5],
  zona_horaria text not null default 'America/La_Paz',
  dominio_corporativo text not null default 'avfinance',
  updated_at timestamptz not null default now(),
  constraint ecp_parameters_single_row check (id = 1),
  constraint ecp_parameters_horario check (horario_atencion_inicio < horario_atencion_fin),
  constraint ecp_parameters_sla check (sla_horas_sin_atencion > 0)
);

insert into public.ecp_parameters (id) values (1)
  on conflict (id) do nothing;

-- Perfiles: el rol real del usuario y las colas que atiende. auth.users de Supabase solo
-- guarda correo y clave; el rol y el resto viven aqui.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role public.user_role not null default 'soporte',
  display_name text not null default '',
  phone_e164 text,
  teams text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where is_active;

create trigger profiles_touch_updated
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Al nacer un usuario de autenticacion se crea su perfil. Sin este disparador hay que
-- insertarlo a mano y es la fuente clasica de "el usuario entra pero no puede hacer nada".
--
-- El rol se lee de app_metadata, NO de raw_user_meta_data. La bolsa raw_user_meta_data la
-- puede escribir el navegador al registrarse: si de alli saliera el rol, cualquiera podria
-- declararse administrador. app_metadata solo la escribe la llave de servicio.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  params public.ecp_parameters%rowtype;
  claimed_role text;
  correo text;
begin
  select * into params from public.ecp_parameters where id = 1;
  correo := coalesce(new.email, '');
  claimed_role := coalesce(new.raw_app_meta_data ->> 'role', '');

  insert into public.profiles (id, email, role, display_name)
  values (
    new.id,
    correo,
    case
      -- Solo se respeta el rol declarado si ademas el correo es del dominio corporativo.
      when correo like '%@' || params.dominio_corporativo || '.bo'
           and claimed_role = any (enum_range(null::public.user_role)::text[])
        then claimed_role::public.user_role
      when correo like '%@' || params.dominio_corporativo || '.net'
           and claimed_role = any (enum_range(null::public.user_role)::text[])
        then claimed_role::public.user_role
      else 'soporte'::public.user_role
    end,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(correo, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reenganche con las cuentas que ya existian. profiles es hija de auth.users y el vinculo se
-- corta en dos casos: un desarme del esquema public (desarmar.sql) y una migracion a otra
-- instancia, que se lleva auth.users y deja la tabla de atras. El disparador solo mira inserciones
-- nuevas, asi que un usuario con sesion valida no tiene quien lo lea y current_user_id() devuelve
-- vacio: las pantallas salen en blanco sin ningun error. Esta sentencia es el unico punto de entrada
-- de auth.users a profiles, y por eso no depende de que alguien se acuerde de correrla.
--
-- Deja el rol en 'soporte' a proposito, sin leer app_metadata: el alta desde el panel no lo
-- escribe, y la seccion 0 del sembrado es la que coloca los cinco roles reales. Aqui se copia
-- display_name del metadata de usuario, que si es publico y no escala privilegios.

insert into public.profiles (id, email, display_name)
select u.id,
       coalesce(u.email, ''),
       coalesce(u.raw_user_meta_data ->> 'display_name', split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
where u.email is not null
on conflict (id) do nothing;

-- Cuenta: la persona o empresa atendida. Aqui vive tambien la ficha del Entorno Controlado de
-- Pruebas, que antes estaba en client_ecp_profile: una tabla separada que obligaba a cuatro
-- saltos para leer una sola pantalla. Leer la ficha de un cliente tiene que ser una fila.
-- Lo que no vive aqui: plata. Solo payments_ref, un identificador de referencia.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  account_type public.account_type not null default 'persona_natural',
  display_name text not null,
  legal_name text,
  ci text,
  nit text,
  email text,
  phone_e164 text,
  company_name text,
  city text,
  sector text,
  -- De donde entro el cliente. Es traza de canal, no de captacion comercial: sirve para saber
  -- si una consulta llego por WhatsApp o por el chat de alyto.io y nada mas.
  origin text not null default 'manual' check (
    origin in ('whatsapp_business', 'correo', 'chat_app', 'web_chat', 'linkedin', 'meta',
               'tiktok', 'derivacion', 'manual')
  ),
  payments_ref text,
  owner_id uuid references public.profiles (id) on delete set null,
  last_activity_at timestamptz,
  -- Ficha del ECP. Nadie del equipo mueve estas columnas salvo cumplimiento, y lo sostiene el
  -- disparador clients_ficha_solo_cumplimiento de 0004, no un permiso de tabla: todos los
  -- usuarios entran por el mismo rol de Postgres, asi que el privilegio no los distingue.
  ecp_account text,
  ecp_status text not null default 'no dado de alta' check (
    ecp_status in ('no dado de alta', 'activo', 'suspendido', 'baja registrada')
  ),
  kyc_estado public.kyc_status not null default 'Pendiente',
  riesgo text not null default 'por clasificar' check (
    riesgo in ('por clasificar', 'bajo', 'medio', 'alto')
  ),
  tope_operacion_bs numeric(14, 2) check (tope_operacion_bs is null or tope_operacion_bs > 0),
  cupo_mensual_operaciones integer check (
    cupo_mensual_operaciones is null or cupo_mensual_operaciones > 0
  ),
  ficha_revisada_en timestamptz,
  ficha_nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Una persona juridica no existe sin sazon social ni NIT. Una natural se identifica con
  -- cedula, o con NIT si es independiente, y puede estar capturada solo con el telefono.
  constraint clients_documento_por_tipo check (
    account_type = 'persona_natural'
    or (legal_name is not null and nit is not null)
  ),
  constraint clients_ci_format check (ci is null or ci ~ '^[0-9]{5,12}$'),
  constraint clients_nit_format check (nit is null or nit ~ '^[0-9]{5,12}$'),
  constraint clients_pago_referencia check (payments_ref is null or length(payments_ref) between 1 and 64),
  -- Sin ningun dato de contacto la ficha no sirve: no se puede abrir una conversacion.
  constraint clients_canal_contacto check (
    phone_e164 is not null or email is not null or ci is not null
  ),
  -- Un tope registrado vacio o en cero no protege de nada: si cumplimiento anotó ficha,
  -- tiene que anotar con que margen opera ese cliente.
  constraint clients_ficha_completa check (
    tope_operacion_bs is null
    or (riesgo <> 'por clasificar' and ficha_revisada_en is not null)
  )
);

create index clients_phone_idx on public.clients (phone_e164) where deleted_at is null and phone_e164 is not null;
create index clients_email_idx on public.clients (lower(email)) where deleted_at is null and email is not null;
create index clients_nit_idx on public.clients (nit) where deleted_at is null and nit is not null;
create index clients_kyc_idx on public.clients (kyc_estado) where deleted_at is null;
create index clients_riesgo_idx on public.clients (riesgo) where deleted_at is null;
create index clients_owner_idx on public.clients (owner_id) where deleted_at is null;
create index clients_nombre_trgm_idx on public.clients using gin (display_name gin_trgm_ops);

create trigger clients_touch_updated
  before update on public.clients
  for each row execute function public.touch_updated_at();

-- Contacto: las personas detras de una cuenta juridica y los interlocutores de una natural.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  full_name text not null,
  role_title text,
  email text,
  phone_e164 text,
  is_primary boolean not null default false,
  is_decision_maker boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index contacts_client_idx on public.contacts (client_id) where deleted_at is null;
create unique index contacts_one_primary_idx on public.contacts (client_id)
  where is_primary and deleted_at is null;
create unique index contacts_client_name_idx on public.contacts (client_id, full_name)
  where deleted_at is null;

create trigger contacts_touch_updated
  before update on public.contacts
  for each row execute function public.touch_updated_at();

-- Identificador del usuario que hace la peticion, leido de las declaraciones del JWT.
--
-- Se prefiere current_setting sobre la funcion auth.uid() por dos razones: una funcion con
-- search_path fijo en public no ve el esquema auth, y request.jwt.claims es la variable que
-- Supabase pone en todas las conexiones, incluso cuando la llamada entra con la llave de
-- servicio. Si la variable no existe, se intenta auth.uid() como respaldo.
create or replace function public.current_user_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'userId'
  )::uuid;
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
$$;

-- Horas de horario laboral transcurridas entre dos momentos, para el calculo del nivel de
-- servicio. Sin esto, un mensaje que llega un viernes a las 16:00 "venceria" el sabado,
-- cuando la garantia de atencion es el mismo dia habil.
create or replace function public.business_hours_between(from_ts timestamptz, to_ts timestamptz)
returns numeric
language plpgsql
stable
as $$
declare
  params public.ecp_parameters%rowtype;
  zona text;
  dia date;
  inicio timestamptz;
  fin timestamptz;
  total_minutes numeric := 0;
begin
  if to_ts <= from_ts then
    return 0;
  end if;

  select * into params from public.ecp_parameters where id = 1;
  zona := params.zona_horaria;

  for dia in
    select generate_series(
      (from_ts at time zone zona)::date,
      (to_ts at time zone zona)::date,
      interval '1 day'
    )::date
  loop
    continue when not (extract(dow from dia) = any (params.dias_laborales));

    inicio := greatest(from_ts, (dia + params.horario_atencion_inicio) at time zone zona);
    fin := least(to_ts, (dia + params.horario_atencion_fin) at time zone zona);

    if fin > inicio then
      total_minutes := total_minutes + extract(epoch from (fin - inicio)) / 60;
    end if;
  end loop;

  return round(total_minutes / 60, 2);
end;
$$;

-- Version "desde hace cuanto": la que usan las vistas de nivel de servicio.
create or replace function public.business_hours_since(since timestamptz)
returns numeric
language sql
stable
as $$
  select public.business_hours_between(since, now());
$$;

-- Suma horas de horario laboral a un momento: el vencimiento del nivel de servicio.
create or replace function public.add_business_hours(from_ts timestamptz, horas numeric)
returns timestamptz
language plpgsql
stable
as $$
declare
  params public.ecp_parameters%rowtype;
  zona text;
  restante_minutes numeric;
  dia date;
  cursor_ts timestamptz;
  inicio timestamptz;
  fin timestamptz;
  disponible numeric;
  resultado timestamptz;
begin
  if from_ts is null or horas is null then
    return null;
  end if;

  select * into params from public.ecp_parameters where id = 1;
  zona := params.zona_horaria;
  restante_minutes := horas * 60;
  cursor_ts := from_ts;

  for dia in
    select generate_series(
      (cursor_ts at time zone zona)::date,
      (cursor_ts at time zone zona)::date + interval '60 days',
      interval '1 day'
    )::date
  loop
    continue when not (extract(dow from dia) = any (params.dias_laborales));

    inicio := (dia + params.horario_atencion_inicio) at time zone zona;
    fin := (dia + params.horario_atencion_fin) at time zone zona;
    if cursor_ts < inicio then
      cursor_ts := inicio;
    end if;
    if cursor_ts >= fin then
      continue;
    end if;

    disponible := extract(epoch from (fin - cursor_ts)) / 60;

    if restante_minutes <= disponible then
      resultado := cursor_ts + (restante_minutes * interval '1 minute');
      return resultado;
    end if;

    restante_minutes := restante_minutes - disponible;
    cursor_ts := fin;
  end loop;

  return null;
end;
$$;
