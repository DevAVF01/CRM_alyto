-- 10. Comprobaciones
-- ---------------------------------------------------------------------------

-- Salida esperada al terminar: 19 filas y ok = true en las 19. Solo hay una condicion: que
-- las cinco cuentas de Auth ya esten dadas de alta y el seed.sql se haya corrido una segunda
-- vez despues de eso. Hasta ese momento, perfiles_de_los_cinco_usuarios y
-- roles_alineados_por_la_seccion_0 salen en 0 y son las dos unicas en false.
--
-- hilos_vencidos_de_fondo pide los hilos que tienen garantias de estar vencidos (mas de tres
-- dias naturales, que siempre alcanzan una jornada habil completa). El conteo total de la vista
-- vw_conversations_sla si cambia con la hora y con el dia de la semana en que se corre el
-- sembrado, y puede ir de 3 a 5.
--
-- Que este de 3 depende de una condicion del sembrado, no de esta consulta: el seed.sql ancla
-- la cronologia de demostracion al momento en que se corre. Sin ese anclaje, correr el fichero
-- dias despues de la primera siembra envejecia todo el historial y aqui aparecian 5 en lugar de
-- 3, que fue lo que paso el 26/10. Ver el bloque "El reloj de la demostracion" en el seed.sql.

select v.cheque, v.valor::text, v.esperado, (v.valor::text = v.esperado) as ok
from (values
  ('cuentas',
   (select count(*) from public.clients where id between
     '00000000-0000-4000-8000-0000000000c1'::uuid and '00000000-0000-4000-8000-0000000000c9'::uuid),
   '9'),
  ('contactos',
   (select count(*) from public.contacts), '8'),
  ('plantillas',
   (select count(*) from public.templates), '8'),
  ('conversaciones',
   (select count(*) from public.conversations), '13'),
  ('mensajes',
   (select count(*) from public.messages), '42'),
  ('hilos_en_bandeja_abierta',
   (select count(*) from public.conversations
    where status in ('abierta', 'en_espera_agente')
      and deleted_at is null), '7'),
  ('casillas_del_legajo',
   (select count(*) from public.compliance_items), '60'),
  ('documentos',
   (select count(*) from public.documents), '16'),
  ('ejecuciones_de_cadencia',
   (select count(*) from public.cadence_executions), '24'),
  ('pasos_de_cadencia_por_mandar',
   (select count(*) from public.vw_cadence_pending), '2'),
  ('reclamos',
   (select count(*) from public.claims), '3'),
  ('negocios_en_el_embudo',
   (select count(*) from public.deals), '5'),
  ('asientos_del_historial_del_embudo',
   (select count(*) from public.deal_events), '17'),
  ('terminos_de_bloqueo',
   (select count(*) from public.blocked_terms where severity = 'bloqueo'), '7'),
  ('terminos_de_advertencia',
   (select count(*) from public.blocked_terms where severity = 'advertencia'), '3'),
  ('mensajes_de_advertencia_en_la_bandeja',
   (select count(*) from public.vw_messages_flagged), '1'),
  ('hilos_vencidos_de_fondo',
   (select count(*) from public.vw_conversations_sla
     where vencida and last_inbound_at <= now() - interval '3 days'), '3'),
  ('perfiles_de_los_cinco_usuarios',
   (select count(*) from public.profiles), '5'),
  ('roles_alineados_por_la_seccion_0',
   (select count(*)
    from public.profiles p
    join (values
      ('admin@avfinance.bo', 'admin'),
      ('compliance@avfinance.bo', 'compliance'),
      ('operaciones@avfinance.bo', 'operaciones'),
      ('ventas@avfinance.bo', 'ventas'),
      ('soporte@avfinance.bo', 'soporte')
    ) as v(correo, rol) on p.email = v.correo and p.role = v.rol::public.user_role),
   '5')
) as v(cheque, valor, esperado);
