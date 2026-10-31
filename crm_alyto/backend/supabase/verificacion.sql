-- Verificacion del modelo del CRM (27/10)
-- ---------------------------------------------------------------------------
--
-- Se corre DESPUES del seed.sql, en el SQL Editor del panel, y es la unica lista que tiene que
-- dar todo en verde. Son dos bloques en uno: la estructura del modelo (cuantas tablas hay, si
-- todas tienen seguridad por fila, si quedan restos del embudo de ventas) y el contenido de la
-- demostracion (cuantas senales, rutas, casillas e hilos dejaron las migraciones y el sembrado).
--
-- Salida esperada: 50 filas y ok = true en las 50.
--
-- Unicas dos en false si aun no se dio de alta a los cinco usuarios de Auth y se volvio a correr
-- el seed.sql: perfiles_de_los_cinco_usuarios y roles_alineados_por_la_seccion_0.
--
-- hilos_vencidos_de_fondo pide los hilos que tienen garantias de estar vencidos (mas de tres dias
-- naturales, que siempre alcanzan una jornada habil completa). El conteo total de la vista
-- vw_conversations_sla si cambia con la hora y con el dia de la semana en que se corre el
-- sembrado. Que este de 3 depende del ancla del seed.sql al momento de la corrida: sin ese ancla,
-- correr el fichero dias despues envejecia todo el historial y aparecian 5 en lugar de 3, que fue
-- lo que paso el 26/10.

select v.cheque, v.valor::text, v.esperado, (v.valor::text = v.esperado) as ok
from (values
  -- ----------------------------------------------------------- estructura del modelo
  ('tablas_base_del_modelo',
   (select count(*) from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'), '25'),

  -- El embudo viejo ya no esta: deals, deal_stages, deal_events, cadence_*, compliance_item_*,
  -- client_ecp_profile. Si alguna aparece aqui, el borrado del panel no se completo.
  ('tablas_del_embudo_restantes',
   (select count(*) from information_schema.tables
    where table_schema = 'public'
      and table_name in ('deals', 'deal_stages', 'deal_events', 'cadence_templates',
                         'cadence_steps', 'cadence_enrollments', 'cadence_executions',
                         'compliance_item_defs', 'compliance_items', 'client_ecp_profile')),
   '0'),

  ('vistas_del_modelo',
   (select count(*) from information_schema.views
    where table_schema = 'public'
      and table_name in ('vw_inbox', 'vw_conversations_sla', 'vw_messages_flagged',
                         'vw_cadence_pending', 'vw_compliance_progress', 'vw_claims_sla',
                         'vw_signals_open', 'vw_outbox_pending', 'vw_routes_by_state',
                         'vw_route_age', 'vw_open_activities')),
   '11'),

  ('tablas_sin_seguridad_por_fila',
   (select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false), '0'),

  ('columnas_del_embudo_en_clients',
   (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'clients'
      and column_name in ('onboarding_stage', 'source')), '0'),

  ('la_ficha_del_ecp_vive_en_clients',
   (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'clients'
      and column_name in ('riesgo', 'tope_operacion_bs', 'cupo_mensual_operaciones',
                          'ficha_revisada_en', 'kyc_estado', 'ecp_status')), '6'),

  ('el_registro_distingue_al_actor',
   (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_events'
      and column_name in ('actor_kind', 'outcome', 'changed_before', 'changed_after')), '4'),

  -- ------------------------------------------------------------------- contenido: cuentas
  ('cuentas',
   (select count(*) from public.clients where id between
     '00000000-0000-4000-8000-0000000000c1'::uuid and '00000000-0000-4000-8000-0000000000c9'::uuid),
   '9'),
  ('contactos',
   (select count(*) from public.contacts), '8'),
  ('plantillas',
   (select count(*) from public.templates), '10'),
  ('fichas_del_ecp_completadas',
   (select count(*) from public.clients where ficha_revisada_en is not null), '3'),
  ('cuentas_clasificadas_con_riesgo',
   (select count(*) from public.clients where riesgo <> 'por clasificar'), '2'),

  -- ------------------------------------------------------------- contenido: bandeja y SLA
  ('conversaciones',
   (select count(*) from public.conversations), '13'),
  ('mensajes',
   (select count(*) from public.messages), '42'),
  ('hilos_en_bandeja_abierta',
   (select count(*) from public.conversations
    where status in ('abierta', 'en_espera_agente')
      and deleted_at is null), '7'),
  ('hilos_vencidos_de_fondo',
   (select count(*) from public.vw_conversations_sla
     where vencida and last_inbound_at <= now() - interval '3 days'), '3'),
  ('mensajes_de_advertencia_en_la_bandeja',
   (select count(*) from public.vw_messages_flagged), '1'),
  ('mensajes_por_reintentar_en_la_salida',
   (select count(*) from public.vw_outbox_pending), '1'),

  -- ------------------------------------------------------ contenido: senales y viajes
  ('senales_registradas',
   (select count(*) from public.signals), '7'),
  ('senales_abiertas_en_la_vista',
   (select count(*) from public.vw_signals_open), '5'),
  ('viajes',
   (select count(*) from public.journeys), '2'),
  ('pasos_de_viaje',
   (select count(*) from public.journey_steps), '8'),
  ('inscripciones',
   (select count(*) from public.journey_enrollments), '5'),
  ('pasos_por_mandar',
   (select count(*) from public.vw_cadence_pending), '3'),

  -- --------------------------------------------------- contenido: legajo y documentacion
  ('requisitos_del_legajo',
   (select count(*) from public.document_requirements), '8'),
  ('casillas_del_legajo',
   (select count(*) from public.document_reviews), '60'),
  ('casillas_observadas',
   (select count(*) from public.document_reviews where status = 'Observado'), '3'),
  ('documentos',
   (select count(*) from public.documents), '16'),
  ('cotejos_en_listas',
   (select count(*) from public.screenings), '5'),

  -- ----------------------------------------------------------- contenido: las tres rutas
  ('rutas',
   (select count(*) from public.routes), '19'),
  ('rutas_abiertas_o_en_curso',
   (select count(*) from public.routes where estado in ('abierta', 'en_curso')), '7'),
  ('rutas_en_espera_del_cliente',
   (select count(*) from public.routes where estado = 'en_espera_cliente'), '4'),
  ('rutas_bloqueadas',
   (select count(*) from public.routes where estado = 'bloqueada'), '2'),
  ('rutas_cerradas',
   (select count(*) from public.routes
    where estado in ('cerrada', 'cerrada_sin_resultado')), '6'),
  ('cuentas_con_rutas_vivas_en_el_tablero',
   (select count(*) from public.vw_routes_by_state), '6'),
  ('rutas_sin_asiento_de_apertura',
   (select count(*) from public.routes r
    where not exists (select 1 from public.route_events e
                      where e.route_id = r.id and e.from_estado is null)), '0'),
  ('asientos_del_historial_de_rutas',
   (select count(*) from public.route_events), '36'),
  ('asientos_de_ruta_con_motivo',
   (select count(*) from public.route_events where reason is not null), '17'),
  ('rutas_paradas_sin_motivo',
   (select count(*) from public.routes
    where estado in ('bloqueada', 'cerrada_sin_resultado') and motivo is null), '0'),

  -- ------------------------------------------------------ contenido: agenda y reclamos
  ('actividades',
   (select count(*) from public.activities), '8'),
  ('tareas_pendientes_de_hoy',
   (select count(*) from public.vw_open_activities), '6'),
  ('reclamos',
   (select count(*) from public.claims), '3'),
  ('reclamos_sin_plazo_definido',
   (select count(*) from public.vw_claims_sla where sin_plazo_definido), '1'),

  -- ------------------------------------------------------------- contenido: glosario y registro
  ('terminos_de_bloqueo',
   (select count(*) from public.blocked_terms where severity = 'bloqueo'), '7'),
  ('terminos_de_advertencia',
   (select count(*) from public.blocked_terms where severity = 'advertencia'), '3'),
  ('asientos_del_registro',
   (select count(*) from public.audit_events), '45'),
  ('el_registro_distingue_los_tres_actores',
   (select count(distinct actor_kind) from public.audit_events), '3'),
  ('el_registro_guarda_un_rechazo',
   (select count(*) from public.audit_events where outcome = 'rechazado'), '1'),

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
