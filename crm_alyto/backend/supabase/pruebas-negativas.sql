-- pruebas-negativas.sql: las cinco trabas que no se pueden caer.
--
-- Estan aca en lugar de dentro del seed.sql para que no haya que descomentar nada. Cada
-- bloque es una prueba suelta: se copia UN bloque al SQL Editor, se corre, y tiene que
-- devolver un ERROR. Si dice Success, o si devuelve filas, el guardarrail se cayo y eso es
-- un defecto de verdad.
--
-- Que es un guardarrail: una traba puesta en la base de datos (un disparador o una
-- restriccion) que impide escribir lo que la norma no deja escribir. No depende de que el
-- programacion se acuerde: aunque alguien intente la orden correcta por el camino equivocado,
-- la base la rechaza.
--
-- Orden recomendado: despues de correr el seed.sql dos veces (con los cinco usuarios de Auth
-- ya creados), porque las pruebas a), b) y c) usan filas que crea el sembrado.
--
-- Nota sobre la palabra vetada: en este fichero no esta escrita. Se arma el texto de prueba
-- leyendo la propia tabla blocked_terms, que es donde vive definida (0006_glossary_seed.sql).
-- Asi este archivo pasa limpio la auditoria de marca de la integracion continua, que revisa
-- que ningun fichero del proyecto escriba un termino vetado fuera del diccionario.

-- ---------------------------------------------------------------------------
-- a) Mensaje SALIENTE con un termino de severidad 'bloqueo'.
-- Esperado: error 'El mensaje contiene un termino no autorizado por el glosario: ...'
-- ---------------------------------------------------------------------------

insert into public.messages (conversation_id, direction, channel, body, external_msg_id)
values (
  '00000000-0000-4000-8000-000000000401',
  'saliente',
  'whatsapp',
  'Texto de prueba que cita el termino '
    || (select bt.term from public.blocked_terms bt
        where bt.severity = 'bloqueo' and bt.is_active
        order by bt.term limit 1),
  'prueba-bloqueo-0001'
);

-- ---------------------------------------------------------------------------
-- a-bis) El MISMO texto pero entrante. Esta si debe escribirse.
-- Esperado: Success. Es el arreglo que se hizo el 21/10 en 0002: lo que escribe el cliente
-- es parte del registro, no una salida nuestra. Bloquearlo perderia el mensaje y dejaria el
-- hilo incompleto justo donde la trazabilidad importa.
--
-- Tambien comprueba el otro guardarrail del mismo disparador: el canal del mensaje tiene que
-- ser el del hilo, y el hilo ...0401 es de whatsapp.
-- ---------------------------------------------------------------------------

insert into public.messages (conversation_id, direction, channel, body, external_msg_id)
values (
  '00000000-0000-4000-8000-000000000401',
  'entrante',
  'whatsapp',
  'Texto de prueba que cita el termino '
    || (select bt.term from public.blocked_terms bt
        where bt.severity = 'bloqueo' and bt.is_active
        order by bt.term limit 1),
  'prueba-entrante-0001'
);

-- ---------------------------------------------------------------------------
-- at) Limpieza de las dos de arriba. Es UN solo Run: la marca de sistema solo vive la
-- transaccion en curso y el editor corre todo lo pegado en una sola. Sin la marca, borrar
-- un mensaje tampoco esta permitido (un mensaje enviado es prueba).
-- Esperado: Success, dos filas borradas.
-- ---------------------------------------------------------------------------

select set_config('crm.system_write', 'on', true);

delete from public.messages
where external_msg_id in ('prueba-bloqueo-0001', 'prueba-entrante-0001');

-- ---------------------------------------------------------------------------
-- b) Aprobar una casilla del legajo que exige documento, sin documento aprobado.
-- Esperado: error 'La casilla beneficiario_final requiere un documento aprobado antes de
-- aprobarse'
--
-- La cuenta ...0c1 (Comercializadora del Valle) tiene documentos aprobados de identidad,
-- tributario y origen de fondos, pero ninguno de beneficiario final, y esa casilla sigue en
-- Pendiente. Por eso se eligio esa.
-- ---------------------------------------------------------------------------

update public.compliance_items
set status = 'Aprobado'::public.kyc_status
where client_id = '00000000-0000-4000-8000-0000000000c1'
  and item_key = 'beneficiario_final';

-- ---------------------------------------------------------------------------
-- c) Escribir el historial del embudo sin la marca del sistema.
-- Esperado: error 'Esta tabla la mantiene el sistema'
--
-- deal_events guarda quien movio una tarjeta de etapa y cuando. Si un usuario pudiera
-- escribir ahi, podria reescribir su propia historia. Lo escribe unicamente el disparador
-- deals_stage_change, y para eso el backend pone antes la marca set_config.
-- ---------------------------------------------------------------------------

insert into public.deal_events (deal_id, from_stage, to_stage, actor_email)
values ('00000000-0000-4000-8000-000000000601', 2, 4, 'intruso@correo.demo.bo');

-- ---------------------------------------------------------------------------
-- d) Editar un mensaje ya enviado.
-- Esperado: error 'Esta tabla la mantiene el sistema'
-- ---------------------------------------------------------------------------

update public.messages
set body = 'texto alterado despues del envio'
where id = '00000000-0000-4000-8000-000000000501';

-- ---------------------------------------------------------------------------
-- e) Un paso de cadencia fuera de orden.
-- Esperado: error 'El paso 7 de la cadencia debe caer despues del dia 14'
--
-- El paso 6 de la plantilla ...0301 esta en el dia 14, asi que un paso 7 en el dia 3 no es
-- una secuencia: es un historial reescrito.
-- ---------------------------------------------------------------------------

insert into public.cadence_steps
  (cadence_template_id, step_order, day_number, channel, template_code)
values ('00000000-0000-4000-8000-000000000301', 7, 3, 'whatsapp', 'PROSPECTO_B2B');

-- ---------------------------------------------------------------------------
-- Y una prueba que NO es de error: el unico camino legitimo al historial del embudo.
-- Mover la tarjeta deja el asiento solo, sin escribir en deal_events.
-- Esperado: Success en el UPDATE, y el conteo: 18 asientos (los 17 del sembrado mas el que
-- acaba de crear esta movida de etapa 2 a 4).
--
-- Se corre AL FINAL, porque toca el conteo de la verificacion. Se revierte en el bloque
-- siguiente y al terminar se vuelve a correr el seed.sql, que deja el embudo en su etapa de
-- demostracion.
-- ---------------------------------------------------------------------------

update public.deals set stage = 4 where id = '00000000-0000-4000-8000-000000000601';

select count(*) as asientos_del_historial from public.deal_events;

-- ---------------------------------------------------------------------------
-- f) Revierte la de arriba: la tarjeta vuelve a su etapa y se borran los asientos que dejo
-- la prueba. UN solo Run: la marca de sistema va primero, sin ella no se puede borrar un
-- asiento, que es la traba de la prueba c). La ventana de 10 minutos es para no tocar los
-- asientos del sembrado, que tienen fechas de hace dias.
-- Esperado: Success y el conteo en 17 otra vez. El update que devuelve la tarjeta a la
-- etapa 2 tambien deja su asiento, y ese cae dentro de la ventana, asi que lo alcanza.
-- ---------------------------------------------------------------------------

select set_config('crm.system_write', 'on', true);

update public.deals set stage = 2 where id = '00000000-0000-4000-8000-000000000601';

delete from public.deal_events
where deal_id = '00000000-0000-4000-8000-000000000601'
  and created_at > now() - interval '10 minutes';

select count(*) as asientos_del_historial from public.deal_events;
