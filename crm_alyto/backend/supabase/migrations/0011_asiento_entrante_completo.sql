-- 0011: el asiento del mensaje entrante, completo.
--
-- El archivador (backend/src/data/ingesta.js) abre la puerta de la bandeja: un cliente escribe por un
-- canal que todavia no esta conectado y el personal anota el mensaje. Desde ese dia hay dos clases de
-- mensajes en la tabla, y el asiento de auditoria que pone 0002 fue escrito cuando solo existian los
-- salientes. Le faltan dos cosas que un supervisor pregunta en la misma frase:
--
--   1. Quien lo dejo escrito. El asiento lleva actor (el correo) pero no actor_id, asi que no se puede
--      cruzar contra la cuenta de Auth de esa persona sin leer el correo como texto.
--   2. De quien es el mensaje. El asiento apunta a la fila de messages, y el registro de la Ficha 360
--      busca por la cuenta del cliente: el mensaje entrante de un cliente no aparecia en su propio
--      legajo. Un hilo que nadie ve en la ficha del cliente es una trazabilidad a mitades.
--
-- El cambio es la funcion, no la politica. La politica audit_insert de 0004 no deja que un usuario
-- ordinary escriba en la bitacora; el disparador es security definer y corre con los privilegios de su
-- dueno, que es la unica puerta por la que un asiento puede nacer de una accion de la pantalla. La
-- inmutabilidad sigue intacta: audit_events_no_update sigue bloqueando el update y el delete, y el
-- revoke de privilegios de 0007 sigue puesto.
--
-- Los asientos ya escritos no se tocan. Un asiento de auditoria no se reescribe para que la estadistica
-- quede pareja: desde esta migracion hacia adelante el registro es completo, y lo anterior se queda
-- como esta con su actor de texto.

-- 1. La columna que faltaba para poder nombrar al dueno del mensaje sin perder la fila del mensaje.
alter table public.audit_events
  add column if not exists message_id uuid;

create index if not exists audit_events_message_idx
  on public.audit_events (message_id) where message_id is not null;

-- 2. El asiento, con las tres referencias: quien, de quien, que mensaje.
create or replace function public.log_message_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  correo text;
  actor public.audit_actor_kind := 'sistema';
  dueno uuid;
begin
  correo := coalesce(
    public.current_user_email(),
    (select p.email from public.profiles p where p.id = new.sent_by),
    'sistema'
  );
  if correo <> 'sistema' then
    actor := 'humano';
  end if;

  -- La cuenta detras del hilo. Es una lectura y no un dato que alguien escribio en la peticion: el
  -- dueno sale de la conversacion, asi que nadie puede hacer que el asiento hable de otro cliente.
  select c.client_id into dueno
  from public.conversations c
  where c.id = new.conversation_id;

  -- El detalle lleva las primeras 240 caracteres del cuerpo, no el mensaje completo: la bitacora tiene
  -- que permitir reconstruir que se dijo sin convertirse en una segunda copia del contenido de los
  -- clientes. El prefijo dice la direccion y el mensaje, porque con el archivador hay dos clases de
  -- asiento y 'mensaje_entrante' ya no alcanza para saber de quien era el turno.
  insert into public.audit_events (
    actor, actor_id, actor_kind, action, entity_type, entity_id, message_id, detail, outcome
  )
  values (
    correo,
    new.sent_by,
    actor,
    'mensaje_' || new.direction,
    'messages',
    dueno,
    new.id,
    new.direction || ' ' || new.channel || ' · ' || new.id::text || ' · ' || left(new.body, 240),
    'exito'
  );
  return new;
end;
$$;

-- 3. La lectura del registro no cambia: la pantalla y la Ficha 360 consultan la tabla audit_events por
--    su puente, y el puente filtra por entity_id. Al poner el cliente ahi, el asiento entra solo en el
--    legajo del cliente; no hace falta ninguna vista nueva, y una vista sin security_invoker seria una
--    puerta lateral sobre una tabla que se cierra a la interfaz por politica.

-- Chequeo del camino: anotar una entrada con soporte (scripts/prueba-ingesta.mjs) tiene que dejar en
-- el registro un asiento 'mensaje_entrante' con actor_id puesto y entity_id igual al id de la cuenta
-- del cliente. Ese asiento se ve en el bloque 'registro' de la Ficha 360 de ese cliente, que hasta
-- ahora solo mostraba movimientos de la cuenta, nunca los mensajes.
