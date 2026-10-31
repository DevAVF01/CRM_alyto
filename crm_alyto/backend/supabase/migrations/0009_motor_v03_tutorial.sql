-- 0009: el viaje del tutorial para el registro incompleto.
--
-- Pedido explicito del propietario el 29/10: cuando alguien entra con datos incompletos, el
-- CRM tiene que mandarle solo el mensaje de tutorial con la plantilla preaprobada de
-- bienvenida, sin que un agente lo escriba a mano.
--
-- El motor (backend/src/motor/planificador.js) no sabe nada de este viaje en concreto: lee los
-- viajes activos con su senal disparadora, y por eso agregar uno aqui es todo lo que hace
-- falta. El texto viene de la plantilla BIENVENIDA_NATURAL, ya aprobada por Cumplimiento, para
-- no inventar redaccion fuera del glosario.

insert into public.journeys (id, code, name, description, audience, trigger_signal, is_active)
values
  ('00000000-0000-4000-8000-000000000303', 'V-03',
   'Registro incompleto: tutorial de acceso',
   'Un toque cuando el legajo entra con datos incompletos: mensaje de tutorial con la plantilla de bienvenida para que el usuario complete su registro en alyto.io.',
   'persona_natural', 'datos_incompletos', true)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  audience = excluded.audience,
  trigger_signal = excluded.trigger_signal,
  is_active = true;

insert into public.journey_steps
  (id, journey_id, step_order, day_number, channel, template_code, template_version, description)
values
  ('00000000-0000-4000-8000-000000000323', '00000000-0000-4000-8000-000000000303', 1, 1,
   'whatsapp', 'BIENVENIDA_NATURAL', 1, 'Tutorial: como completar el registro en alyto.io, con indicaciones para subir lo que falta.')
on conflict (id) do update set
  day_number = excluded.day_number,
  channel = excluded.channel,
  template_code = excluded.template_code,
  template_version = excluded.template_version,
  description = excluded.description;

-- Chequeo del camino: con una senal abierta del tipo datos_incompletos y la corrida del motor
-- manual (POST /api/crm/motor/corrida), tiene que aparecer la inscripcion en V-03, el mensaje
-- en la Bandeja de salida con la plantilla de bienvenida, la senal marcada como consumida y el
-- asiento 'mensaje_automatico' en el Registro. Un segundo toque de corrida no repite nada.
