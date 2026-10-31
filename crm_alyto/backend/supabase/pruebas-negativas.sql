-- pruebas-negativas.sql: las trabas del modelo del CRM que no se pueden caer (27/10)
--
-- Estan aca en lugar de dentro del seed.sql para que no haya que descomentar nada. Cada bloque
-- es una prueba suelta: se copia UN bloque al SQL Editor, se corre, y tiene que devolver un ERROR
-- (o Success, cuando se dice). Si un bloque marcado como error dice Success, el guardarrail se
-- cayo y eso es un defecto de verdad.
--
-- Que es un guardarrail: una traba puesta en la base de datos (un disparador o una restriccion)
-- que impide escribir lo que la norma no deja escribir. No depende de que el programador se
-- acuerde: aunque alguien intente la orden correcta por el camino equivocado, la base la rechaza.
--
-- Orden recomendado: despues de correr el seed.sql dos veces (con los cinco usuarios de Auth ya
-- creados), y despues de verificacion.sql, porque la prueba a-bis deja un asiento en el registro.
--
-- Dos cosas que este fichero NO puede probar y hay que probar desde la interfaz, porque el SQL
-- Editor del panel corre sin identidad de usuario:
--   - La ficha del Entorno Controlado de Pruebas la mueve solo Cumplimiento
--     (clients_ficha_solo_cumplimiento, en 0004).
--   - Un usuario ventas no escribe en la cola de reclamos (politica claims_write).
--   - Nadie promociona su propio rol a admin (politica profiles_write).
-- Sin JWT en la peticion, current_user_id() devuelve vacio y el disparador deja pasar: es la
-- excepcion documentada, no un agujero. La prueba real es entrar con ese usuario y mover el campo
-- desde la pantalla.
--
-- Nota sobre la palabra vetada: en este fichero no esta escrita. Se arma el texto de prueba
-- leyendo la propia tabla blocked_terms, que es donde vive definida (0006_glossary_seed.sql).
-- Asi este archivo pasa limpio la auditoria de marca de la integracion continua, que revisa
-- que ningun fichero del proyecto escriba un termino vetado fuera del diccionario.

-- ---------------------------------------------------------------------------
-- a) Mensaje SALIENTE con un termino de severidad 'bloqueo'.
-- Esperado: error 'El mensaje contiene un termino no autorizado por el glosario'
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
--
-- Y deja un asiento en el registro (messages_audit_after_insert, 0002): la bitacora guarda que
-- entro ese mensaje, y ese asiento NO se borra en el bloque siguiente. Es la prueba de que es
-- inmutable, vista desde el otro lado.
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
-- b) Aprobar un requisito del legajo que exige documento, sin documento aprobado.
-- Esperado: error 'El requisito beneficiario_final requiere un documento aprobado'
--
-- La cuenta ...0c1 (Comercializadora del Valle) tiene documentos aprobados de identidad,
-- tributario y origen de fondos, pero ninguno de beneficiario final, y esa casilla sigue en
-- Pendiente. Por eso se eligio esa.
-- ---------------------------------------------------------------------------

update public.document_reviews
set status = 'Aprobado'
where client_id = '00000000-0000-4000-8000-0000000000c1'
  and requirement_code = 'beneficiario_final';

-- ---------------------------------------------------------------------------
-- c) Escribir el historial de las rutas sin la marca del sistema.
-- Esperado: error 'Esta tabla la mantiene el sistema'
--
-- route_events guarda quien movio una ruta y cuando, y con que motivo. Si un usuario pudiera
-- escribir ahi, podria reescribir su propia historia. Lo escribe unicamente el disparador
-- record_route_change, y cuando el backend necesita corregir un asiento pone antes la marca
-- set_config('crm.system_write', 'on', true).
-- ---------------------------------------------------------------------------

insert into public.route_events (route_id, from_estado, to_estado, actor_email)
values ('00000000-0000-4000-8000-000000000621', 'abierta', 'cerrada', 'intruso@correo.demo.bo');

-- ---------------------------------------------------------------------------
-- d) Editar un mensaje ya enviado.
-- Esperado: error 'Esta tabla la mantiene el sistema'
-- ---------------------------------------------------------------------------

update public.messages
set body = 'texto alterado despues del envio'
where id = '00000000-0000-4000-8000-000000000501';

-- ---------------------------------------------------------------------------
-- e) Un paso de viaje fuera de orden.
-- Esperado: error 'El paso 7 del viaje debe caer despues del dia'
--
-- El paso 6 del viaje V-01 (...0301) esta en el dia 14, asi que un paso 7 en el dia 3 no es
-- una secuencia: es un historial reescrito.
-- ---------------------------------------------------------------------------

insert into public.journey_steps
  (id, journey_id, step_order, day_number, channel, template_code)
values (
  '00000000-0000-4000-8000-0000000003ff',
  '00000000-0000-4000-8000-000000000301', 7, 3, 'whatsapp', 'PROSPECTO_B2B'
);

-- ---------------------------------------------------------------------------
-- f) La misma condicion abierta dos veces: la senal duplicada.
-- Esperado: error 'duplicate key value violates unique constraint'
--
-- dedupe_key es la traba anti reitero: un documento observado no puede abrir dos senales
-- abiertas a la vez, porque eso llenaria la bandeja de alertas repetidas. El indice es parcial
-- (solo filas en estado abierta), asi que la condicion SI puede volver a abrirse despues de
-- consumirse: es el caso del documento que se vuelve a vencer en marzo.
-- ---------------------------------------------------------------------------

insert into public.signals (kind, client_id, dedupe_key)
values ('documento_observado', '00000000-0000-4000-8000-0000000000c5',
        'documento_observado|c5|origen_fondos');

-- ---------------------------------------------------------------------------
-- g) Un mensaje automatico sin la ejecucion del viaje que lo genero.
-- Esperado: error 'Un mensaje marcado como automatico debe indicar la ejecucion'
--
-- Es la traba que hace que un mensaje del viaje V-01 se pueda reconstruir: si el sistema mando
-- algo, tiene que decir que paso del viaje lo mando.
-- ---------------------------------------------------------------------------

insert into public.messages
  (conversation_id, direction, channel, body, external_msg_id, automated, journey_run_id)
values ('00000000-0000-4000-8000-000000000401', 'saliente', 'whatsapp',
        'Mensaje automatico de prueba, sin ejecucion que lo respalde.',
        'prueba-automatico-0001', true, null);

-- ---------------------------------------------------------------------------
-- h) Volumen declarado en una ruta que no es la comercial.
-- Esperado: error 'violates check constraint'
--
-- routes_detalle_solo_comercial: el volumen estimado y la frecuencia son datos de la ruta B.
-- Anotarlos en una ruta de riesgo o de documentacion fabrica un numero que nadie pidio, y la
-- Ficha 360 lo mostraria como si fuera un compromiso del cliente.
-- ---------------------------------------------------------------------------

insert into public.routes (code, client_id, kind, monthly_volume_bs)
values ('RTC-9999', '00000000-0000-4000-8000-0000000000c1', 'riesgo', 999999.00);

-- ---------------------------------------------------------------------------
-- h-bis) Bloquear una ruta sin decir por que.
-- Esperado: error 'violates check constraint'
--
-- routes_motivo_obligatorio: una ruta que pasa a 'bloqueada' o a 'cerrada_sin_resultado' tiene
-- que traer el motivo en la misma sentencia, porque el disparador lo copia al asiento del
-- historial y ahi queda. Sin esta traba el tablero se llena de rutas paradas que nadie sabe
-- reabrir, y diez meses despues no hay forma de responder por que se paro esa cuenta.
--
-- Se prueba con la ruta RTA-0008, que esta 'abierta' y no tiene motivo escrito.
-- ---------------------------------------------------------------------------

update public.routes set estado = 'bloqueada'
where id = '00000000-0000-4000-8000-000000000618';

-- ---------------------------------------------------------------------------
-- i) Borrar un asiento del registro.
-- Esperado: error 'El asiento de auditoria es inmutable'
--
-- El registro es la bitacora de quien hizo que y cuando. No se puede editar ni borrar un asiento
-- ya escrito, y la traba esta dos veces: el disparador de aqui y el revoke de privilegios de
-- 0004, para que tampoco funcione siendo dueno de la tabla.
-- ---------------------------------------------------------------------------

delete from public.audit_events where action = 'semilla_aplicada';

-- ---------------------------------------------------------------------------
-- Y una prueba que NO es de error: el unico camino legitimo al historial de las rutas.
-- Mover la ruta RTA-0008 de 'abierta' a 'en_curso' deja el asiento solo, sin escribir en
-- route_events.
-- Esperado: Success en el UPDATE, y el conteo: 37 asientos (los 36 del sembrado mas el que
-- acaba de crear esta movida). El asiento sale con el correo del dueno de la ruta porque en el
-- editor no hay JWT; desde la interfaz sale con el correo de quien entra.
--
-- Se corre AL FINAL, porque toca el conteo que deja la verificacion.
-- ---------------------------------------------------------------------------

update public.routes set estado = 'en_curso'
where id = '00000000-0000-4000-8000-000000000618';

select count(*) as asientos_del_historial from public.route_events;

-- ---------------------------------------------------------------------------
-- j) Revierte la de arriba: la ruta vuelve a su estado y se borran los asientos que dejo la
-- prueba. UN solo Run: la marca de sistema va primero, sin ella no se puede borrar un asiento,
-- que es la traba de la prueba c). La ventana de 10 minutos es para no tocar los asientos del
-- sembrado, que tienen fechas de hace dias.
-- Esperado: Success y el conteo en 36 otra vez. El update que devuelve la ruta a 'abierta'
-- tambien deja su asiento, y ese cae dentro de la ventana, asi que lo alcanza.
-- ---------------------------------------------------------------------------

select set_config('crm.system_write', 'on', true);

update public.routes set estado = 'abierta'
where id = '00000000-0000-4000-8000-000000000618';

delete from public.route_events
where route_id = '00000000-0000-4000-8000-000000000618'
  and created_at > now() - interval '10 minutes';

select count(*) as asientos_del_historial from public.route_events;

-- ---------------------------------------------------------------------------
-- k) Registrar un cliente con un tope por encima del maximo del ECP.
-- Esperado: error 'El tope por operacion de 120001.00 Bs pasa el maximo del Entorno
-- Controlado de Pruebas, que es 120000.00 Bs.' desde la 0012.
--
-- Este es el numero que fija ASFI y el que mas se les escucha preguntar. Antes de la
-- 0012 la columna tenia un check de '> 0' nomas: Cumplimiento podia anotar 500.000 Bs
-- por operacion en una ficha y la base lo guardaba contenta, porque un check de tabla no
-- puede mirar otra tabla. Ahora el disparador lee ecp_parameters y compara.
--
-- Se prueba moviendo la ficha de Grupo Andino (c2), que esta en 80.000 Bs. Un statement
-- que falla no escribe nada, asi que no hay que revertir nada despues de esto.
-- ---------------------------------------------------------------------------

update public.clients set tope_operacion_bs = 120001
where id = '00000000-0000-4000-8000-0000000000c2';

-- ---------------------------------------------------------------------------
-- l) Y la prueba que NO es de error: el techo se cumple con el numero justo.
-- Esperado: Success en el UPDATE, porque 120.000 es el maximo permitido, no un monto
-- prohibido. Devuelve la ficha a su valor del sembrado en la misma carrera.
--
-- Sin esta segunda parte la k) no prueba nada: un disparador mal escrito rechaza tambien
-- lo legitimo y el formulario queda inservible. El update de abajo corre despues del
-- rechazo de arriba y por eso muestra 80000 otra vez.
-- ---------------------------------------------------------------------------

update public.clients set tope_operacion_bs = 120000
where id = '00000000-0000-4000-8000-0000000000c2';

update public.clients set tope_operacion_bs = 80000
where id = '00000000-0000-4000-8000-0000000000c2';

select id, legal_name, tope_operacion_bs from public.clients
where id = '00000000-0000-4000-8000-0000000000c2';
