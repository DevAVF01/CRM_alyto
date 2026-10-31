-- seed.sql: datos de demostracion del CRM de operaciones y atencion de Alyto.
--
-- IMPORTANTE: este archivo es material de prueba.
--   * Ningun nombre, cedula, NIT, telefono, correo, hilo o identificador de mensaje
--     corresponde a un cliente real. Son valores generados para que la interfaz tenga de
--     donde leer dentro del Entorno Controlado de Pruebas (ECP).
--   * No hay datos de operaciones. Las transferencias internacionales, las carteras y el
--     consumo de cupos viven en la base de la app de pagos, que va aparte por indicacion de
--     Alvaro. Por eso payments_ref, transaction_ref, asfi_ref y checksum quedan vacios: el
--     sembrado no inventa identificadores de otro sistema.
--   * Debe aplicarse solo con DEMO_MODE=true en el backend.
--
-- Como aplicar todo, en orden:
--   1) Crear el proyecto en el panel de Supabase.
--   2) Ejecutar en el SQL Editor, en este orden:
--        migrations/0001_identity_and_people.sql
--        migrations/0002_conversations_and_messaging.sql
--        migrations/0003_journeys_routes_documents_claims.sql
--        migrations/0004_security_and_privileges.sql
--        migrations/0006_glossary_seed.sql
--      0005 no va aqui: crea el bucket de almacen, y storage.objects pertenece a otro rol,
--      asi que el bucket se arma desde el panel de Storage.
--   3) Dar de alta las cinco cuentas de acceso en Auth. Este archivo NO crea usuarios: nacen
--      en auth.users y el disparador on_auth_user_created genera su perfil. Correos esperados:
--      admin@, compliance@, operaciones@, ventas@ y soporte@ en el dominio avfinance.bo.
--      El rol se manda en app_metadata, nunca en user_metadata: user_metadata lo escribe el
--      navegador y seria una escalada de privilegios. El panel de Auth no expone app_metadata
--      al crear al usuario, asi que los cinco nacen con el rol por defecto y la seccion 0 de
--      este archivo los coloca en su rol real.
--   4) Ejecutar este archivo.
--   5) Volver a ejecutarlo despues de crear los usuarios. Los campos de atribucion
--      (asignado a, dueno de la cuenta, quien aprueba) se resuelven por correo y quedan
--      vacios si el usuario todavia no existe; la segunda pasada los rellena.
--
-- Como esta armado:
--   * Las columnas calculadas (last_inbound_at, last_message_at, messages_count, el avance
--     del legajo) no se escriben a mano: las producen los disparadores y las vistas.
--   * La lista de requisitos del legajo la genera el disparador clients_document_reviews_template
--     al insertar la cuenta. Aqui solo se cambia el estado de cada requisito.
--   * El historial de las rutas tampoco se escribe a mano: lo arma el disparador
--     routes_event_insert con la apertura y routes_event_update con cada cambio de estado.
--   * Las identificaciones son literales fijos, no gen_random_uuid(), para poder volver a
--     correr el archivo sin duplicar filas.

-- ---------------------------------------------------------------------------
-- 0. Alinear el rol de las cinco cuentas de demostracion
-- ---------------------------------------------------------------------------
--
-- El formulario de alta en Auth solo acepta correo, contrasena y user_metadata: app_metadata
-- no se puede escribir desde el panel. El disparador de 0001, al no encontrar rol declarado,
-- deja a los cinco en 'soporte'. Esta pasada lo corrige por correo. Sin ella la cadencia,
-- las tareas y las aprobaciones buscan un perfil con rol 'ventas' o 'compliance', no lo
-- encuentran, y el sembrado pierde filas en silencio en lugar de fallar.
--
-- Va por UPDATE directo porque el SQL Editor corre como dueno de la tabla: la politica
-- profiles_write (0004, solo administracion) no aplica aqui. Un usuario normal no puede
-- promocionarse a si mismo por esta via, y el backend nunca ejecuta este archivo.

update public.profiles p
set role = v.rol::public.user_role
from (values
  ('admin@avfinance.bo',       'admin'),
  ('compliance@avfinance.bo',  'compliance'),
  ('operaciones@avfinance.bo', 'operaciones'),
  ('ventas@avfinance.bo',      'ventas'),
  ('soporte@avfinance.bo',     'soporte')
) as v(correo, rol)
where p.email = v.correo;

-- ---------------------------------------------------------------------------
-- 1. Plantillas preaprobadas
-- ---------------------------------------------------------------------------

-- Los tres textos del banco de plantillas van escritos de forma literal porque la pantalla
-- de plantillas tiene que mostrar lo que Cumplimiento aprobo, no una parodia. Ninguno usa
-- los terminos vetados: la palabra prohibida esta definida en 0006_glossary_seed.sql.

insert into public.templates (id, code, version, name, channel, subject, body, variables,
                              approved_by, approved_at, is_active)
values
  ('00000000-0000-4000-8000-0000000002d1', 'BIENVENIDA_NATURAL', 1,
   'Alta de usuario, persona natural', 'whatsapp', null,
   'Hola, [Nombre]. Te damos la bienvenida a Alyto. Ya operamos en el Entorno Controlado de Pruebas de ASFI para que envíes dinero al exterior de forma simple desde tu celular. Para empezar, ingresa a alyto.io y completa tu registro.',
   array['nombre'],
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '30 days', true),

  ('00000000-0000-4000-8000-0000000002d2', 'PROSPECTO_B2B', 1,
   'Prospecto empresa, persona juridica', 'whatsapp', null,
   'Hola, [Nombre]. Te contacto de AV Finance, la empresa detrás de Alyto. Estamos invitando a empresas a probar nuestro servicio de transferencias internacionales en el ECP de ASFI. ¿Podemos conversar 20 minutos esta semana para mostrarte cómo optimizar tus pagos al exterior?',
   array['nombre'],
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '30 days', true),

  -- channel vacío: respuesta regulatoria que sirve en cualquier canal, no una plantilla
  -- atada a WhatsApp o al correo.
  ('00000000-0000-4000-8000-0000000002d3', 'ACLARACION_ECP', 1,
   'Respuesta regulatoria sobre el regimen de prueba', null, null,
   'Alyto opera dentro del Entorno Controlado de Pruebas (ECP) de ASFI, una etapa supervisada de prueba con usuarios reales y condiciones controladas. El ECP no constituye una autorización ni licencia definitiva.',
   '{}',
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '30 days', true),

  ('00000000-0000-4000-8000-0000000002d4', 'CAD_B2B_D2_CORREO', 1,
   'Cadencia B2B, dia 2: resumen ejecutivo', 'correo',
   'Alyto: resumen ejecutivo para [Empresa]',
   'Hola, [Nombre]. Como conversamos, te adjunto el resumen ejecutivo de nuestro servicio de transferencias internacionales para empresas. El enlace de agendamiento esta al final: una reunion de 20 minutos para revisar tus pagos al exterior dentro del ECP de ASFI. [EnlaceAgendamiento]',
   array['nombre', 'empresa', 'enlace_agendamiento'],
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '28 days', true),

  ('00000000-0000-4000-8000-0000000002d5', 'CAD_B2B_D4_LINKEDIN', 1,
   'Cadencia B2B, dia 4: valor y conexion', 'linkedin', null,
   'Hola, [Nombre]. Comparto un dato corto: las empresas que pagan proveedores al exterior concentran su costo en los tiempos de confirmacion, no en la comision. Alyto trabaja ese punto dentro del ECP de ASFI. Te envio la solicitud de conexion para seguir por aqui.',
   array['nombre'],
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '28 days', true),

  ('00000000-0000-4000-8000-0000000002d6', 'CAD_B2B_D7_MATERIAL', 1,
   'Cadencia B2B, dia 7: material educativo', 'whatsapp', null,
   'Hola, [Nombre]. Te dejo el video corto de como se opera en Alyto dentro del ECP: captura de la solicitud, validacion de datos y confirmacion. [EnlaceVideo]. Si preferis, lo vemos en la reunion.',
   array['nombre', 'enlace_video'],
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '28 days', true),

  ('00000000-0000-4000-8000-0000000002d7', 'CAD_B2B_D10_AGENDA', 1,
   'Cadencia B2B, dia 10: recordatorio con horarios', 'correo',
   '[Empresa]: dos horarios propuestos para la reunion',
   'Hola, [Nombre]. Te proponemos dos horarios concretos para la reunion de 20 minutos: [OpcionA] u [OpcionB]. Si ninguno funciona, indicanos uno y lo confirmamos por este medio.',
   array['nombre', 'empresa', 'opcion_a', 'opcion_b'],
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '28 days', true),

  ('00000000-0000-4000-8000-0000000002d8', 'CAD_B2B_D14_CIERRE', 1,
   'Cadencia B2B, dia 14: cierre de ciclo', 'whatsapp', null,
   'Hola, [Nombre]. Cerramos el ciclo de contacto iniciado hace dos semanas. Dejamos la cuenta en pausa y el equipo queda disponible cuando retomen la evaluacion de pagos al exterior. Saludos desde Alyto.',
   array['nombre'],
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '28 days', true),

  ('00000000-0000-4000-8000-0000000002d9', 'REQ_DOCUMENTOS_CORREO', 1,
   'Requerimiento de documentos pendientes', 'correo',
   'Alyto: documentos pendientes en tu legajo',
   'Hola, [Nombre]. Al revisar tu legajo quedaron documentos pendientes: [ListaDocumentos]. Puedes subirlos desde alyto.io o responder este correo con los archivos adjuntos. El equipo de Cumplimiento los revisa dentro de un dia habil.',
   array['nombre', 'lista_documentos'],
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '12 days', true),

  ('00000000-0000-4000-8000-0000000002da', 'SEGUIMIENTO_CONSULTA', 1,
   'Seguimiento de consulta sin respuesta', 'whatsapp', null,
   'Hola, [Nombre]. Retomo la consulta que dejaste abierta hace dos dias. Tu respuesta nos permite seguir avanzando; si preferis hablar con una persona, responde este mensaje y te conectamos con el equipo.',
   array['nombre'],
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '12 days', true)

on conflict (id) do update set
  name = excluded.name,
  channel = excluded.channel,
  subject = excluded.subject,
  body = excluded.body,
  variables = excluded.variables,
  approved_by = excluded.approved_by,
  approved_at = excluded.approved_at,
  is_active = excluded.is_active;

-- ---------------------------------------------------------------------------
-- 2. Cuentas
-- ---------------------------------------------------------------------------

-- Cinco personas juridicas y cuatro naturales. Las juridicas llevan razon social y NIT
-- porque la restriccion clients_documento_por_tipo los exige; los numeros son sinteticos y
-- siguen el formato validado (de 5 a 12 digitos).

insert into public.clients
  (id, account_type, display_name, legal_name, ci, nit, email, phone_e164, company_name,
   city, sector, origin, payments_ref, owner_id, last_activity_at)
values
  ('00000000-0000-4000-8000-0000000000c1', 'persona_juridica',
   'Comercializadora del Valle S.A.', 'Comercializadora del Valle S.A.', null, '9000000001',
   'compras@valle.demo.bo', '+59122445501', 'Comercializadora del Valle S.A.',
   'La Paz', 'Comercio exterior', 'linkedin', null,
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '25 minutes'),

  ('00000000-0000-4000-8000-0000000000c2', 'persona_juridica',
   'Grupo Andino S.R.L.', 'Grupo Andino S.R.L.', null, '9000000002',
   'finanzas@andino.demo.bo', '+59122445502', 'Grupo Andino S.R.L.',
   'La Paz', 'Pago a proveedores', 'correo', null,
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '4 minutes'),

  ('00000000-0000-4000-8000-0000000000c3', 'persona_juridica',
   'Importadora Pacifico S.A.', 'Importadora Pacifico S.A.', null, '9000000003',
   'operaciones@pacifico.demo.bo', '+59133445503', 'Importadora Pacifico S.A.',
   'Santa Cruz de la Sierra', 'Comercio exterior', 'meta', null,
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '9 days'),

  ('00000000-0000-4000-8000-0000000000c4', 'persona_juridica',
   'Logistica Mercosur S.R.L.', 'Logistica Mercosur S.R.L.', null, '9000000004',
   'administracion@mercosur.demo.bo', '+59144445504', 'Logistica Mercosur S.R.L.',
   'Cochabamba', 'Pago a proveedores', 'derivacion', null,
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '3 days'),

  ('00000000-0000-4000-8000-0000000000c5', 'persona_juridica',
   'Agroindustrial del Oriente S.A.', 'Agroindustrial del Oriente S.A.', null, '9000000005',
   'comex@oriente.demo.bo', '+59133445505', 'Agroindustrial del Oriente S.A.',
   'Santa Cruz de la Sierra', 'Comercio exterior', 'derivacion', null,
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '2 days'),

  ('00000000-0000-4000-8000-0000000000c6', 'persona_natural',
   'Maria Fernanda Quispe', null, '90000001', null,
   'mf.quispe@correo.demo.bo', '+59170010001', null,
   'La Paz', null, 'whatsapp_business', null,
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '3 days'),

  ('00000000-0000-4000-8000-0000000000c7', 'persona_natural',
   'Jorge Andres Mendoza', null, '90000002', null,
   'ja.mendoza@correo.demo.bo', '+59170010002', null,
   'El Alto', null, 'chat_app', null,
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '1 day'),

  ('00000000-0000-4000-8000-0000000000c8', 'persona_natural',
   'Lucia Fernandez Rocha', null, null, null,
   null, '+59170010003', null,
   'Cochabamba', null, 'web_chat', null,
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '1 hour'),

  ('00000000-0000-4000-8000-0000000000c9', 'persona_natural',
   'Roberto Carlos Salazar', null, '90000004', null,
   'rc.salazar@correo.demo.bo', '+59170010004', null,
   'Santa Cruz de la Sierra', null, 'tiktok', null,
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '6 hours')

on conflict (id) do update set
  account_type = excluded.account_type,
  display_name = excluded.display_name,
  legal_name = excluded.legal_name,
  ci = excluded.ci,
  nit = excluded.nit,
  email = excluded.email,
  phone_e164 = excluded.phone_e164,
  company_name = excluded.company_name,
  city = excluded.city,
  sector = excluded.sector,
  origin = excluded.origin,
  owner_id = excluded.owner_id,
  last_activity_at = excluded.last_activity_at;
-- cuentas-nueve-demo

-- Ficha del Entorno Controlado de Pruebas.
--
-- ecp_account queda vacio en las nueve cuentas: ese numero lo emite la app de pagos, y el
-- sembrado no inventa identificadores de otro sistema (la misma regla que deja vacios
-- payments_ref, transaction_ref y asfi_ref). Lo que si se llena es el estado del legajo y el
-- perfil de riesgo, porque eso es trabajo de Cumplimiento dentro de este CRM.
--
-- Tres situaciones distintas, para que la Ficha 360 tenga de donde mostrar:
--   c2 Grupo Andino: legajo aprobado y clasificado, con tope y cupo anotados.
--   c6 Maria Fernanda: observada por cumplimiento, todavia sin clasificar.
--   c9 Roberto Salazar: aprobado con riesgo medio.
-- El resto se queda en 'Pendiente' y 'por clasificar', que es el estado real de una cuenta
-- recien capturada.
--
-- La restriccion clients_ficha_completa exige que un tope anotado venga con riesgo clasificado
-- y con fecha de revision, así que los tres van juntos o ninguno.

update public.clients c
set ecp_status = v.alta,
    kyc_estado = v.kyc::public.kyc_status,
    riesgo = v.riesgo,
    tope_operacion_bs = v.tope,
    cupo_mensual_operaciones = v.cupo,
    ficha_revisada_en = v.revisada,
    ficha_nota = v.nota
from (values
  ('00000000-0000-4000-8000-0000000000c1'::uuid, 'no dado de alta', 'En revision',
   'por clasificar', null::numeric, null::integer, null::timestamptz,
   'Falta el poder de representacion firmado por la representante legal.'),
  ('00000000-0000-4000-8000-0000000000c2'::uuid, 'activo', 'Aprobado',
   'bajo', 80000, 40, now() - interval '20 days',
   'Legajo completo. Los pagos a proveedores salen cada 15 dias.'),
  ('00000000-0000-4000-8000-0000000000c5'::uuid, 'no dado de alta', 'En revision',
   'por clasificar', null::numeric, null::integer, null::timestamptz,
   'Origen de fondos declarado pero sin respaldo adjunto.'),
  ('00000000-0000-4000-8000-0000000000c6'::uuid, 'activo', 'Observado',
   'por clasificar', null::numeric, null::integer, now() - interval '5 days',
   'La cedula vence en quince dias; se pidio la vigente.'),
  ('00000000-0000-4000-8000-0000000000c9'::uuid, 'activo', 'Aprobado',
   'medio', 30000, 20, now() - interval '10 days',
   'Riesgo medio por la frecuencia, no por el monto.')
) as v(id, alta, kyc, riesgo, tope, cupo, revisada, nota)
where c.id = v.id;
-- cuentas-nueve-demo

-- ---------------------------------------------------------------------------
-- 3. Contactos
-- ---------------------------------------------------------------------------

-- En una cuenta juridica la ficha no es la empresa: son las personas que hablan. Un solo
-- interlocutor puede marcar is_primary, y el que decide el gasto se marca como tomador de
-- decision porque es el que tiene que recibir la cadencia.

insert into public.contacts (id, client_id, full_name, role_title, email, phone_e164,
                             is_primary, is_decision_maker, notes)
values
  ('00000000-0000-4000-8000-0000000001d1', '00000000-0000-4000-8000-0000000000c1',
   'Lic. Gonzalo Arze', 'Representante legal', 'g.arze@valle.demo.bo', '+59171010101',
   true, true, 'Firma los poderes. Prefiere WhatsApp antes que correo.'),

  ('00000000-0000-4000-8000-0000000001d2', '00000000-0000-4000-8000-0000000000c1',
   'Lic. Andrea Colodro', 'Comercio exterior', 'a.colodro@valle.demo.bo', '+59171010102',
   false, false, 'Prepara la documentacion de cada envio.'),

  ('00000000-0000-4000-8000-0000000001d3', '00000000-0000-4000-8000-0000000000c2',
   'Lic. Marcela Quiroga', 'Gerencia financiera', 'm.quiroga@andino.demo.bo', '+59171010103',
   true, true, 'Define el calendario de pagos al exterior.'),

  ('00000000-0000-4000-8000-0000000001d4', '00000000-0000-4000-8000-0000000000c2',
   'Sr. Diego Villalba', 'Administracion', 'd.villalba@andino.demo.bo', '+59171010104',
   false, false, null),

  ('00000000-0000-4000-8000-0000000001d5', '00000000-0000-4000-8000-0000000000c3',
   'Lic. Fernando Salinas', 'Comercio exterior', 'f.salinas@pacifico.demo.bo', '+59171010105',
   true, false, 'Lead capturado por Meta; falta confirmar el poder de representacion.'),

  ('00000000-0000-4000-8000-0000000001d6', '00000000-0000-4000-8000-0000000000c4',
   'Sra. Paola Arteaga', 'Direccion general', 'p.arteaga@mercosur.demo.bo', '+59171010106',
   true, true, null),

  ('00000000-0000-4000-8000-0000000001d7', '00000000-0000-4000-8000-0000000000c5',
   'Lic. Rodrigo Céspedes', 'Administracion', 'r.cespedes@oriente.demo.bo', '+59171010107',
   true, true, null),

  ('00000000-0000-4000-8000-0000000001d8', '00000000-0000-4000-8000-0000000000c5',
   'Lic. Carmen Lujan', 'Gerencia financiera', 'c.lujan@oriente.demo.bo', '+59171010108',
   false, false, null)

on conflict (id) do update set
  full_name = excluded.full_name,
  role_title = excluded.role_title,
  email = excluded.email,
  phone_e164 = excluded.phone_e164,
  is_primary = excluded.is_primary,
  is_decision_maker = excluded.is_decision_maker,
  notes = excluded.notes;

-- ---------------------------------------------------------------------------
-- 4. Senales y viajes automaticos
-- ---------------------------------------------------------------------------

-- Primero las senales: el hecho que el CRM registro. Despues los viajes, que son la secuencia
-- que reacciona a ese hecho, y por ultimo las ejecuciones de cada paso.
--
-- dedupe_key es la clave anti duplicado: la misma condicion no abre dos senales abiertas a la
-- vez. Por eso las dos consumidas llevan status distinto de 'abierta' y su consumed_at.

insert into public.signals
  (id, kind, client_id, contact_id, conversation_id, entity_type, entity_id, detail,
   status, dedupe_key, created_at, consumed_at)
values
  -- Abiertas: la condicion sigue vigente y alguien tiene que resolverla.
  ('00000000-0000-4000-8000-000000000401', 'documento_observado',
   '00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000001d7', null,
   'document_reviews', '00000000-0000-4000-8000-0000000000c5',
   jsonb_build_object('requisito', 'origen_fondos', 'motivo', 'El respaldo no aclara el origen del ultimo envio.'),
   'abierta', 'documento_observado|c5|origen_fondos', now() - interval '4 days', null),

  ('00000000-0000-4000-8000-000000000402', 'datos_incompletos',
   '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000001d1', null,
   'clients', '00000000-0000-4000-8000-0000000000c1',
   jsonb_build_object('faltan', 'poder de representacion'),
   'abierta', 'datos_incompletos|c1', now() - interval '3 days', null),

  ('00000000-0000-4000-8000-000000000403', 'consulta_sin_responder',
   '00000000-0000-4000-8000-0000000000c8', null, null,
   'conversations', '00000000-0000-4000-8000-000000000406',
   jsonb_build_object('horas_sin_respuesta', 6),
   'abierta', 'consulta_sin_responder|c8-hilo', now() - interval '6 hours', null),

  ('00000000-0000-4000-8000-000000000404', 'sin_respuesta_cliente',
   '00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000001d5', null,
   'clients', '00000000-0000-4000-8000-0000000000c3',
   jsonb_build_object('dias', 9),
   'abierta', 'sin_respuesta_cliente|c3', now() - interval '2 days', null),

  ('00000000-0000-4000-8000-000000000405', 'documento_por_vencer',
   '00000000-0000-4000-8000-0000000000c3', null, null,
   'documents', '00000000-0000-4000-8000-00000000090a',
   jsonb_build_object('vence_en_dias', 12, 'requisito', 'representacion'),
   'abierta', 'documento_por_vencer|c3|representacion', now() - interval '1 day', null),

  -- Consumidas: el viaje ya abrio con esta senal, asi que no vuelve a disparar.
  ('00000000-0000-4000-8000-000000000406', 'documento_observado',
   '00000000-0000-4000-8000-0000000000c6', null, null,
   'document_reviews', '00000000-0000-4000-8000-0000000000c6',
   jsonb_build_object('requisito', 'identidad', 'motivo', 'La cedula vence en quince dias.'),
   'consumida', 'documento_observado|c6|identidad', now() - interval '3 days', now() - interval '2 days'),

  ('00000000-0000-4000-8000-000000000407', 'reclamo_recibido',
   '00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000001d5', null,
   'claims', '00000000-0000-4000-8000-000000000801',
   jsonb_build_object('categoria', 'atraso_respuesta', 'codigo', 'RC-2026-0001'),
   'consumida', 'reclamo_recibido|c3-rc0001', now() - interval '9 days', now() - interval '9 days')

on conflict (id) do update set
  kind = excluded.kind,
  detail = excluded.detail,
  status = excluded.status,
  consumed_at = excluded.consumed_at;
-- senales-siete

-- ---------------------------------------------------------------------------
-- 4b. Los dos viajes
-- ---------------------------------------------------------------------------

-- V-01 es la secuencia B2B de 14 dias y 6 pasos del documento de contexto. V-02 es el
-- requerimiento de documentos pendientes, disparado por la senal del mismo tipo: muestra que
-- un viaje puede reaccionar a una senal o correr por pedido explicito del equipo.
-- La clave (template_code, template_version) apunta a la plantilla preaprobada, asi que
-- cambiar el texto sin versionar no altera las ejecuciones ya enviadas.

insert into public.journeys (id, code, name, description, audience, trigger_signal, is_active)
values
  ('00000000-0000-4000-8000-000000000301', 'V-01',
   'Cadencia B2B 14 dias, pagos al exterior',
   'Secuencia de presentacion para empresas: seis pasos en catorce dias por WhatsApp, correo y LinkedIn.',
   'persona_juridica', null, true),
  ('00000000-0000-4000-8000-000000000302', 'V-02',
   'Legajo pendiente: requerimiento de documentos',
   'Dos pasos cuando un requisito del legajo queda observado o pendiente.',
   'persona_natural', 'documento_observado', true)
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  description = excluded.description,
  audience = excluded.audience,
  trigger_signal = excluded.trigger_signal;

insert into public.journey_steps
  (id, journey_id, step_order, day_number, channel, template_code, template_version, description)
values
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000301', 1, 1,
   'whatsapp', 'PROSPECTO_B2B', 1, 'Primer mensaje de presentacion y propuesta de llamada breve en el ECP.'),
  ('00000000-0000-4000-8000-000000000312', '00000000-0000-4000-8000-000000000301', 2, 2,
   'correo', 'REQ_DOCUMENTOS_CORREO', 1, 'Resumen ejecutivo y enlace de agendamiento para una reunion de 20 minutos.'),
  ('00000000-0000-4000-8000-000000000313', '00000000-0000-4000-8000-000000000301', 3, 4,
   'linkedin', 'CAD_B2B_D4_LINKEDIN', 1, 'Mensaje corto de valor y solicitud de conexion profesional.'),
  ('00000000-0000-4000-8000-000000000314', '00000000-0000-4000-8000-000000000301', 4, 7,
   'whatsapp', 'CAD_B2B_D7_MATERIAL', 1, 'Video explicativo o material educativo sobre el funcionamiento en el ECP.'),
  ('00000000-0000-4000-8000-000000000315', '00000000-0000-4000-8000-000000000301', 5, 10,
   'correo', 'CAD_B2B_D10_AGENDA', 1, 'Recordatorio formal de agenda con dos horarios concretos.'),
  ('00000000-0000-4000-8000-000000000316', '00000000-0000-4000-8000-000000000301', 6, 14,
   'whatsapp', 'CAD_B2B_D14_CIERRE', 1, 'Cierre del ciclo y actualizacion del estado del contacto.'),
  ('00000000-0000-4000-8000-000000000321', '00000000-0000-4000-8000-000000000302', 1, 1,
   'correo', 'REQ_DOCUMENTOS_CORREO', 1, 'Requerimiento formal de lo que falta en el legajo.'),
  ('00000000-0000-4000-8000-000000000322', '00000000-0000-4000-8000-000000000302', 2, 4,
   'whatsapp', 'SEGUIMIENTO_CONSULTA', 1, 'Seguimiento corto si el cliente no respondio el requerimiento.')
on conflict (id) do update set
  day_number = excluded.day_number,
  channel = excluded.channel,
  template_code = excluded.template_code,
  template_version = excluded.template_version,
  description = excluded.description;

-- Cinco inscripciones, cada una contando una situacion distinta:
--   E1 activa con un paso vencido sin ejecutar (lo que hay que mandar hoy)
--   E2 finalizada, con los seis pasos enviados
--   E3 recien inscrita, con el paso 2 vencido
--   E4 pausada: un paso fallido y el resto cancelado
--   E5 del viaje V-02, abierta por la senal consumida de Maria Fernanda
-- started_at se escribe explicitamente porque las fechas de las ejecuciones se derivan de el.

insert into public.journey_enrollments
  (id, journey_id, client_id, contact_id, signal_id, status, started_at, finished_at,
   final_outcome, created_by)
values
  ('00000000-0000-4000-8000-000000000331', '00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000001d1', null,
   'activa', now() - interval '6 days', null, null,
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000332', '00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000001d3', null,
   'finalizada', now() - interval '16 days', now() - interval '2 days', 'ruta_abierta',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000333', '00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000001d5', null,
   'activa', now() - interval '2 days', null, null,
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000334', '00000000-0000-4000-8000-000000000301',
   '00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000001d6', null,
   'pausada', now() - interval '12 days', null, 'en_pausa',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000335', '00000000-0000-4000-8000-000000000302',
   '00000000-0000-4000-8000-0000000000c6', null,
   '00000000-0000-4000-8000-000000000406',
   'activa', now() - interval '2 days', null, null, null)

on conflict (id) do update set
  signal_id = excluded.signal_id,
  status = excluded.status,
  started_at = excluded.started_at,
  finished_at = excluded.finished_at,
  final_outcome = excluded.final_outcome;

-- Las ejecuciones. scheduled_for = inicio de la inscripcion + (dia del paso - 1) dias, para
-- que la pantalla de viajes muestre un calendario coherente con started_at.
--
-- El paso 2 de V-01 usa la plantilla de requerimiento de documentos: en la demostracion el
-- mismo hilo sirve para pedir la documentacion que falta, que es lo que hace una secuencia B2B
-- dentro de un CRM de operaciones.

insert into public.journey_runs
  (id, enrollment_id, journey_step_id, signal_id, scheduled_for, status, attempted_at,
   sent_at, error)
values
  -- E1 Comercializadora del Valle: pasos 1 y 2 enviados, el paso 3 (linkedin) vencio sin
  -- ejecutarse, y los dias 7, 10 y 14 todavia al frente.
  ('00000000-0000-4000-8000-000000000341', '00000000-0000-4000-8000-000000000331',
   '00000000-0000-4000-8000-000000000311', null, now() - interval '6 days', 'enviado',
   now() - interval '6 days', now() - interval '6 days' + interval '20 minutes', null),
  ('00000000-0000-4000-8000-000000000342', '00000000-0000-4000-8000-000000000331',
   '00000000-0000-4000-8000-000000000312', null, now() - interval '5 days', 'enviado',
   now() - interval '5 days', now() - interval '5 days', null),
  ('00000000-0000-4000-8000-000000000343', '00000000-0000-4000-8000-000000000331',
   '00000000-0000-4000-8000-000000000313', null, now() - interval '3 days', 'pendiente',
   null, null, null),
  ('00000000-0000-4000-8000-000000000344', '00000000-0000-4000-8000-000000000331',
   '00000000-0000-4000-8000-000000000314', null, now() + interval '1 day', 'pendiente',
   null, null, null),
  ('00000000-0000-4000-8000-000000000345', '00000000-0000-4000-8000-000000000331',
   '00000000-0000-4000-8000-000000000315', null, now() + interval '4 days', 'pendiente',
   null, null, null),
  ('00000000-0000-4000-8000-000000000346', '00000000-0000-4000-8000-000000000331',
   '00000000-0000-4000-8000-000000000316', null, now() + interval '8 days', 'pendiente',
   null, null, null),

  -- E2 Grupo Andino: los seis pasos enviados y la inscripcion cerrada por el motor.
  ('00000000-0000-4000-8000-000000000351', '00000000-0000-4000-8000-000000000332',
   '00000000-0000-4000-8000-000000000311', null, now() - interval '16 days', 'enviado',
   now() - interval '16 days', now() - interval '16 days', null),
  ('00000000-0000-4000-8000-000000000352', '00000000-0000-4000-8000-000000000332',
   '00000000-0000-4000-8000-000000000312', null, now() - interval '15 days', 'enviado',
   now() - interval '15 days', now() - interval '15 days', null),
  ('00000000-0000-4000-8000-000000000353', '00000000-0000-4000-8000-000000000332',
   '00000000-0000-4000-8000-000000000313', null, now() - interval '13 days', 'enviado',
   now() - interval '13 days', now() - interval '13 days', null),
  ('00000000-0000-4000-8000-000000000354', '00000000-0000-4000-8000-000000000332',
   '00000000-0000-4000-8000-000000000314', null, now() - interval '10 days', 'enviado',
   now() - interval '10 days', now() - interval '10 days', null),
  ('00000000-0000-4000-8000-000000000355', '00000000-0000-4000-8000-000000000332',
   '00000000-0000-4000-8000-000000000315', null, now() - interval '7 days', 'enviado',
   now() - interval '7 days', now() - interval '7 days', null),
  ('00000000-0000-4000-8000-000000000356', '00000000-0000-4000-8000-000000000332',
   '00000000-0000-4000-8000-000000000316', null, now() - interval '3 days', 'enviado',
   now() - interval '3 days', now() - interval '3 days', null),

  -- E3 Importadora Pacifico: solo el dia 1 salio; el dia 2 vencio sin ejecutarse.
  ('00000000-0000-4000-8000-000000000361', '00000000-0000-4000-8000-000000000333',
   '00000000-0000-4000-8000-000000000311', null, now() - interval '2 days', 'enviado',
   now() - interval '2 days', now() - interval '2 days', null),
  ('00000000-0000-4000-8000-000000000362', '00000000-0000-4000-8000-000000000333',
   '00000000-0000-4000-8000-000000000312', null, now() - interval '1 day', 'pendiente',
   null, null, null),
  ('00000000-0000-4000-8000-000000000363', '00000000-0000-4000-8000-000000000333',
   '00000000-0000-4000-8000-000000000313', null, now() + interval '2 days', 'pendiente',
   null, null, null),
  ('00000000-0000-4000-8000-000000000364', '00000000-0000-4000-8000-000000000333',
   '00000000-0000-4000-8000-000000000314', null, now() + interval '5 days', 'pendiente',
   null, null, null),
  ('00000000-0000-4000-8000-000000000365', '00000000-0000-4000-8000-000000000333',
   '00000000-0000-4000-8000-000000000315', null, now() + interval '8 days', 'pendiente',
   null, null, null),
  ('00000000-0000-4000-8000-000000000366', '00000000-0000-4000-8000-000000000333',
   '00000000-0000-4000-8000-000000000316', null, now() + interval '12 days', 'pendiente',
   null, null, null),

  -- E4 Logistica Mercosur: el paso 2 fallo porque el conector de correo todavia no esta
  -- configurado, y el resto se cancelo al pausar la secuencia. Es el unico caso 'fallido'
  -- del sembrado y deja visible el criterio de construir con interfaz de conector.
  ('00000000-0000-4000-8000-000000000371', '00000000-0000-4000-8000-000000000334',
   '00000000-0000-4000-8000-000000000311', null, now() - interval '12 days', 'enviado',
   now() - interval '12 days', now() - interval '12 days', null),
  ('00000000-0000-4000-8000-000000000372', '00000000-0000-4000-8000-000000000334',
   '00000000-0000-4000-8000-000000000312', null, now() - interval '11 days', 'fallido',
   now() - interval '11 days', null,
   'El conector de correo comercial aun no esta configurado en este entorno.'),
  ('00000000-0000-4000-8000-000000000373', '00000000-0000-4000-8000-000000000334',
   '00000000-0000-4000-8000-000000000313', null, now() - interval '9 days', 'omitido',
   null, null, null),
  ('00000000-0000-4000-8000-000000000374', '00000000-0000-4000-8000-000000000334',
   '00000000-0000-4000-8000-000000000314', null, now() - interval '6 days', 'cancelado',
   null, null, null),
  ('00000000-0000-4000-8000-000000000375', '00000000-0000-4000-8000-000000000334',
   '00000000-0000-4000-8000-000000000315', null, now() - interval '3 days', 'cancelado',
   null, null, null),
  ('00000000-0000-4000-8000-000000000376', '00000000-0000-4000-8000-000000000334',
   '00000000-0000-4000-8000-000000000316', null, now() + interval '1 day', 'cancelado',
   null, null, null),

  -- E5 Maria Fernanda (V-02): la senal de documento observado abrio la inscripcion y queda
  -- asientada en la primera ejecucion. El paso 2 todavia no vence.
  ('00000000-0000-4000-8000-000000000381', '00000000-0000-4000-8000-000000000335',
   '00000000-0000-4000-8000-000000000321', '00000000-0000-4000-8000-000000000406',
   now() - interval '2 days', 'enviado', now() - interval '2 days', now() - interval '2 days', null),
  ('00000000-0000-4000-8000-000000000382', '00000000-0000-4000-8000-000000000335',
   '00000000-0000-4000-8000-000000000322', null, now() + interval '2 days', 'pendiente',
   null, null, null)

on conflict (id) do update set
  signal_id = excluded.signal_id,
  scheduled_for = excluded.scheduled_for,
  status = excluded.status,
  attempted_at = excluded.attempted_at,
  sent_at = excluded.sent_at,
  error = excluded.error;
-- ejecuciones-cinco-inscripciones

-- ---------------------------------------------------------------------------
-- 5. Bandeja unificada: hilos y mensajes
-- ---------------------------------------------------------------------------

-- Once canales del enum quedan cubiertos asi: whatsapp (4), correo (3), chat_app, web_chat,
-- linkedin, meta, tiktok e interno. Formulario y telefonica se dejan sin hilo porque hoy no
-- tienen conector; la captura de esos leads se modela al conectarlos.
--
-- Las columnas de contadores se dejan vacios a proposito: las llena el disparador
-- messages_sync_conversation y al final de este bloque se recalculan desde el historial.

insert into public.conversations
  (id, client_id, contact_id, channel, channel_conv_id, subject, query_category, queue,
   status, assignee_id, priority)
values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000c1',
   '00000000-0000-4000-8000-0000000001d1', 'whatsapp', 'hilo-wa-valle-0001',
   'Pagos a proveedores en Chile y Peru', 'empresa_b2b', 'Empresas B2B', 'abierta',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'), 2),

  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-0000000000c1',
   '00000000-0000-4000-8000-0000000001d1', 'correo', 'thread-mail-valle-0001',
   'Resumen ejecutivo de Alyto', 'empresa_b2b', 'Empresas B2B', 'en_espera_cliente',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'), 3),

  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-0000000000c2',
   '00000000-0000-4000-8000-0000000001d3', 'whatsapp', 'hilo-wa-andino-0001',
   'Agenda de operaciones y estado de pagos', 'consulta_saldo', 'Soporte tecnico', 'abierta',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'), 3),

  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-0000000000c3',
   '00000000-0000-4000-8000-0000000001d5', 'correo', 'thread-mail-pacifico-0001',
   'Reclamo por demora en la respuesta', 'reclamo', 'Reclamos', 'en_espera_agente',
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), 1),

  ('00000000-0000-4000-8000-000000000405', '00000000-0000-4000-8000-0000000000c6',
   null, 'chat_app', 'inapp-chat-0006',
   'Registro y validacion de identidad', 'registro_kyc', 'Registro y KYC', 'resuelta',
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'), 2),

  ('00000000-0000-4000-8000-000000000406', '00000000-0000-4000-8000-0000000000c8',
   null, 'web_chat', 'webchat-0008',
   'Duda sobre el regimen de supervision', 'soporte_tecnico', 'Soporte tecnico', 'en_espera_cliente',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'), 3),

  ('00000000-0000-4000-8000-000000000407', '00000000-0000-4000-8000-0000000000c2',
   '00000000-0000-4000-8000-0000000001d3', 'linkedin', 'linkedin-andino-0001',
   'Conexion profesional y reunion de 20 minutos', 'empresa_b2b', 'Empresas B2B', 'resuelta',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'), 3),

  ('00000000-0000-4000-8000-000000000408', '00000000-0000-4000-8000-0000000000c4',
   '00000000-0000-4000-8000-0000000001d6', 'whatsapp', 'hilo-wa-mercosur-0001',
   'Seguimiento de propuesta para pagos al exterior', 'empresa_b2b', 'Empresas B2B', 'abierta',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'), 2),

  ('00000000-0000-4000-8000-000000000409', '00000000-0000-4000-8000-0000000000c6',
   null, 'interno', 'nota-interna-0006',
   'Nota de llamada de seguimiento', 'otro', 'Bandeja general', 'resuelta',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'), 4),

  ('00000000-0000-4000-8000-000000000410', '00000000-0000-4000-8000-0000000000c3',
   null, 'meta', 'meta-lead-pacifico-0001',
   'Lead capturado desde la publicacion oficial', 'otro', 'Bandeja general', 'abierta',
   null, 4),

  ('00000000-0000-4000-8000-000000000411', '00000000-0000-4000-8000-0000000000c9',
   null, 'tiktok', 'tiktok-lead-0009',
   'Comentario recibido por TikTok', 'otro', 'Bandeja general', 'abierta', null, 4),

  ('00000000-0000-4000-8000-000000000412', '00000000-0000-4000-8000-0000000000c2',
   '00000000-0000-4000-8000-0000000001d3', 'correo', 'thread-mail-andino-0001',
   'Alyto: reunion de 20 minutos', 'empresa_b2b', 'Empresas B2B', 'resuelta',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'), 3),

  ('00000000-0000-4000-8000-000000000413', '00000000-0000-4000-8000-0000000000c7',
   null, 'whatsapp', 'hilo-wa-mendoza-0001',
   'Duda con la carga de documentos', 'registro_kyc', 'Registro y KYC', 'abierta',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'), 2)

on conflict (id) do update set
  client_id = excluded.client_id,
  contact_id = excluded.contact_id,
  channel = excluded.channel,
  channel_conv_id = excluded.channel_conv_id,
  subject = excluded.subject,
  query_category = excluded.query_category,
  queue = excluded.queue,
  assignee_id = excluded.assignee_id,
  priority = excluded.priority;

-- Mensajes. Cada uno lleva external_msg_id, que es la llave que pone el canal: el conector
-- real la reutiliza y asi un mismo mensaje nunca se guarda dos veces.
--
-- automated = true exige journey_run_id (lo comprueba el disparador
-- messages_automation_consistency), y un mensaje manual no puede llevarlo.

insert into public.messages
  (id, conversation_id, direction, channel, body, sender_label, template_id, automated,
   journey_run_id, external_msg_id, status, sent_by, sent_at)
values
  -- Hilo 0401: WhatsApp de Comercializadora del Valle, el B2B que recien respondio.
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000401', 'entrante',
   'whatsapp',
   'Hola, vi la publicacion de Alyto en LinkedIn. Somos una comercializadora en La Paz y pagamos proveedores en Chile y Peru. Como es el proceso para una empresa?',
   'Comercializadora del Valle S.A.', null, false, null, 'wamid.demoval0001', 'recibido', null,
   now() - interval '6 days'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000401', 'saliente',
   'whatsapp',
   'Hola, Gonzalo. Te contacto de AV Finance, la empresa detrás de Alyto. Estamos invitando a empresas a probar nuestro servicio de transferencias internacionales en el ECP de ASFI. ¿Podemos conversar 20 minutos esta semana para mostrarte cómo optimizar tus pagos al exterior?',
   'Secuencia B2B de Alyto',
   (select t.id from public.templates t where t.code = 'PROSPECTO_B2B' and t.version = 1),
   true, '00000000-0000-4000-8000-000000000341', 'wamid.demoval0002', 'leido', null,
   now() - interval '6 days' + interval '20 minutes'),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000401', 'entrante',
   'whatsapp',
   'Perfecto. Lo comento con la gerencia financiera. Podemos reunirnos el jueves?',
   'Comercializadora del Valle S.A.', null, false, null, 'wamid.demoval0003', 'recibido', null,
   now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000401', 'saliente',
   'whatsapp',
   'Anotado el jueves. Te envio el resumen ejecutivo por correo para que lleguen con la consulta lista.',
   'Fuerza B2B', null, false, null, 'wamid.demoval0004', 'entregado',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '5 days' + interval '3 hours'),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000401', 'entrante',
   'whatsapp',
   'El jueves nos queda bien. Una consulta antes de la reunion: cuanto tarda en confirmarse un pago al proveedor?',
   'Comercializadora del Valle S.A.', null, false, null, 'wamid.demoval0005', 'recibido', null,
   now() - interval '25 minutes'),

  -- Hilo 0402: el correo del paso 2 de la cadencia del mismo cliente.
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000402', 'saliente',
   'correo',
   'Hola, Gonzalo. Como conversamos, te adjunto el resumen ejecutivo de nuestro servicio de transferencias internacionales para empresas. El enlace de agendamiento esta al final: una reunion de 20 minutos para revisar tus pagos al exterior dentro del ECP de ASFI. https://alyto.io/agendar',
   'Secuencia B2B de Alyto',
   (select t.id from public.templates t where t.code = 'CAD_B2B_D2_CORREO' and t.version = 1),
   true, '00000000-0000-4000-8000-000000000342', 'message-id-valle-0006', 'enviado', null,
   now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000507', '00000000-0000-4000-8000-000000000402', 'entrante',
   'correo',
   'Recibido el resumen. Falta que la gerencia confirme el volumen mensual estimado antes de agendar.',
   'Lic. Gonzalo Arze', null, false, null, 'message-id-valle-0007', 'recibido', null,
   now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000000508', '00000000-0000-4000-8000-000000000402', 'saliente',
   'correo',
   'Quedamos a la espera del numero. Con el volumen estimado preparamos la simulacion de costos de la transferencia internacional.',
   'Fuerza B2B', null, false, null, 'message-id-valle-0008', 'entregado',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '4 days' + interval '2 hours'),
  ('00000000-0000-4000-8000-000000000509', '00000000-0000-4000-8000-000000000402', 'entrante',
   'correo',
   'Perfecto, gracias.',
   'Lic. Gonzalo Arze', null, false, null, 'message-id-valle-0009', 'recibido', null,
   now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000510', '00000000-0000-4000-8000-000000000402', 'saliente',
   'correo',
   'Con gusto. Quedamos disponible para el jueves.',
   'Fuerza B2B', null, false, null, 'message-id-valle-0010', 'enviado',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '3 days' + interval '1 hour'),

  -- Hilo 0403: WhatsApp de Grupo Andino. Muestra las dos caras del mismo canal: los pasos
  -- automaticos de la cadencia conviven con la consulta operativa del dia a dia, porque en
  -- WhatsApp el hilo de un cliente es uno solo.
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000403', 'saliente',
   'whatsapp',
   'Hola, Marcela. Te contacto de AV Finance, la empresa detrás de Alyto. Estamos invitando a empresas a probar nuestro servicio de transferencias internacionales en el ECP de ASFI. ¿Podemos conversar 20 minutos esta semana para mostrarte cómo optimizar tus pagos al exterior?',
   'Secuencia B2B de Alyto',
   (select t.id from public.templates t where t.code = 'PROSPECTO_B2B' and t.version = 1),
   true, '00000000-0000-4000-8000-000000000351', 'wamid.demoand0001', 'leido', null,
   now() - interval '16 days'),
  ('00000000-0000-4000-8000-000000000512', '00000000-0000-4000-8000-000000000403', 'entrante',
   'whatsapp',
   'Hola. Ya somos clientes, asi que por este medio les pido el estado del pago de esta semana.',
   'Lic. Marcela Quiroga', null, false, null, 'wamid.demoand0002', 'recibido', null,
   now() - interval '14 days'),
  ('00000000-0000-4000-8000-000000000513', '00000000-0000-4000-8000-000000000403', 'saliente',
   'whatsapp',
   'Confirmado: el pago del proveedor en Peru salio hoy y la confirmacion llega al correo de administracion. Cualquier duda operativa seguimos por aqui.',
   'Soporte Alyto', null, false, null, 'wamid.demoand0003', 'leido',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '14 days' + interval '12 minutes'),
  ('00000000-0000-4000-8000-000000000514', '00000000-0000-4000-8000-000000000403', 'saliente',
   'whatsapp',
   'Hola, Marcela. Te dejo el video corto de como se opera en Alyto dentro del ECP: captura de la solicitud, validacion de datos y confirmacion. https://alyto.io/material. Si preferis, lo vemos en la reunion.',
   'Secuencia B2B de Alyto',
   (select t.id from public.templates t where t.code = 'CAD_B2B_D7_MATERIAL' and t.version = 1),
   true, '00000000-0000-4000-8000-000000000354', 'wamid.demoand0004', 'leido', null,
   now() - interval '10 days'),
  ('00000000-0000-4000-8000-000000000515', '00000000-0000-4000-8000-000000000403', 'saliente',
   'whatsapp',
   'Hola, Marcela. Cerramos el ciclo de contacto iniciado hace dos semanas. Dejamos la cuenta en pausa y el equipo queda disponible cuando retomen la evaluacion de pagos al exterior. Saludos desde Alyto.',
   'Secuencia B2B de Alyto',
   (select t.id from public.templates t where t.code = 'CAD_B2B_D14_CIERRE' and t.version = 1),
   true, '00000000-0000-4000-8000-000000000356', 'wamid.demoand0005', 'entregado', null,
   now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000516', '00000000-0000-4000-8000-000000000403', 'entrante',
   'whatsapp',
   'Buen dia. Para la operacion de esta quincena necesito confirmar el horario limite de carga.',
   'Lic. Marcela Quiroga', null, false, null, 'wamid.demoand0006', 'recibido', null,
   now() - interval '4 minutes'),

  -- Hilo 0404: el reclamo. Entra por correo, se enruta solo a la cola de Reclamos con
  -- prioridad 1 y alimenta el reclamo RC-2026-0001. El ultimo mensaje del cliente tiene
  -- nueve dias, asi que esta conversacion siempre sale vencida en vw_conversations_sla.
  ('00000000-0000-4000-8000-000000000517', '00000000-0000-4000-8000-000000000404', 'entrante',
   'correo',
   'Escribimos porque hace nueve dias consultamos por la documentacion que falta para habilitar la cuenta y no recibimos respuesta. Solicitamos una respuesta formal.',
   'Importadora Pacifico S.A.', null, false, null, 'message-id-pacif0001', 'recibido', null,
   now() - interval '9 days'),
  ('00000000-0000-4000-8000-000000000518', '00000000-0000-4000-8000-000000000404', 'saliente',
   'correo',
   'Recibimos su consulta y registramos el reclamo con codigo RC-2026-0001. El area de Cumplimiento esta revisando el legajo y responde con el detalle de las casillas pendientes.',
   'Oficina de Cumplimiento', null, false, null, 'message-id-pacif0002', 'enviado',
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '8 days'),
  ('00000000-0000-4000-8000-000000000519', '00000000-0000-4000-8000-000000000404', 'entrante',
   'correo',
   'Adjuntamos el poder de representacion que pidieron. Queda pendiente la constancia del beneficiario final.',
   'Lic. Fernando Salinas', null, false, null, 'message-id-pacif0003', 'recibido', null,
   now() - interval '8 days' + interval '5 hours'),
  ('00000000-0000-4000-8000-000000000520', '00000000-0000-4000-8000-000000000404', 'entrante',
   'correo',
   'Volvemos a escribir: siguen sin confirmar la fecha de respuesta y necesitamos habilitar el pago al proveedor.',
   'Importadora Pacifico S.A.', null, false, null, 'message-id-pacif0004', 'recibido', null,
   now() - interval '9 days' + interval '2 hours'),

  -- Hilo 0405: chat dentro de la app durante el registro de una persona natural.
  ('00000000-0000-4000-8000-000000000521', '00000000-0000-4000-8000-000000000405', 'saliente',
   'chat_app',
   'Hola, Maria Fernanda. Te damos la bienvenida a Alyto. Ya operamos en el Entorno Controlado de Pruebas de ASFI para que envíes dinero al exterior de forma simple desde tu celular. Para empezar, ingresa a alyto.io y completa tu registro.',
   'Asistente de alta de Alyto',
   (select t.id from public.templates t where t.code = 'BIENVENIDA_NATURAL' and t.version = 1),
   false, null, 'inapp-0006-0001', 'entregado',
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   now() - interval '20 days'),
  ('00000000-0000-4000-8000-000000000522', '00000000-0000-4000-8000-000000000405', 'entrante',
   'chat_app',
   'Ya subi la cedula. Me pide tambien el formulario de origen de fondos y no se cual es.',
   'Maria Fernanda Quispe', null, false, null, 'inapp-0006-0002', 'recibido', null,
   now() - interval '20 days' + interval '10 minutes'),
  ('00000000-0000-4000-8000-000000000523', '00000000-0000-4000-8000-000000000405', 'saliente',
   'chat_app',
   'Es la declaracion jurada simple que esta en el paso tres del registro. Con la boleta de tu ultimo trabajo queda conforme.',
   'Operaciones Alyto', null, false, null, 'inapp-0006-0003', 'leido',
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   now() - interval '20 days' + interval '18 minutes'),
  ('00000000-0000-4000-8000-000000000524', '00000000-0000-4000-8000-000000000405', 'entrante',
   'chat_app',
   'Listo, ya lo envie. Gracias!',
   'Maria Fernanda Quispe', null, false, null, 'inapp-0006-0004', 'recibido', null,
   now() - interval '19 days'),

  -- Hilo 0406: web chat de alyto.io. El cliente pregunta con una palabra marcada como
  -- advertencia; la respuesta usa la plantilla regulatoria. Es el caso que se ve en
  -- vw_messages_flagged sin impedir el envio.
  ('00000000-0000-4000-8000-000000000525', '00000000-0000-4000-8000-000000000406', 'entrante',
   'web_chat',
   'Vi la publicidad y me interesa. Una amiga me dijo que ustedes son regulados por la ASFI, es asi?',
   'Lucia Fernandez Rocha', null, false, null, 'webchat-0008-0001', 'recibido', null,
   now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000526', '00000000-0000-4000-8000-000000000406', 'saliente',
   'web_chat',
   'Alyto opera dentro del Entorno Controlado de Pruebas (ECP) de ASFI, una etapa supervisada de prueba con usuarios reales y condiciones controladas. El ECP no constituye una autorización ni licencia definitiva.',
   'Soporte Alyto',
   (select t.id from public.templates t where t.code = 'ACLARACION_ECP' and t.version = 1),
   false, null, 'webchat-0008-0002', 'entregado',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '2 days' + interval '6 minutes'),
  ('00000000-0000-4000-8000-000000000527', '00000000-0000-4000-8000-000000000406', 'entrante',
   'web_chat',
   'Ah, entendido. Entonces por ahora puedo probar con montos chicos?',
   'Lucia Fernandez Rocha', null, false, null, 'webchat-0008-0003', 'recibido', null,
   now() - interval '2 days' + interval '9 minutes'),
  ('00000000-0000-4000-8000-000000000528', '00000000-0000-4000-8000-000000000406', 'saliente',
   'web_chat',
   'Si. El entorno tiene condiciones y topes de operacion controlados; te paso el registro y el equipo valida tus datos antes de habilitar la cuenta.',
   'Soporte Alyto', null, false, null, 'webchat-0008-0004', 'enviado',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '2 days' + interval '15 minutes'),

  -- Hilo 0407: el paso 4 de la cadencia de Grupo Andino, que en la secuencia es LinkedIn.
  ('00000000-0000-4000-8000-000000000529', '00000000-0000-4000-8000-000000000407', 'saliente',
   'linkedin',
   'Hola, Marcela. Comparto un dato corto: las empresas que pagan proveedores al exterior concentran su costo en los tiempos de confirmacion, no en la comision. Alyto trabaja ese punto dentro del ECP de ASFI. Te envio la solicitud de conexion para seguir por aqui.',
   'Secuencia B2B de Alyto',
   (select t.id from public.templates t where t.code = 'CAD_B2B_D4_LINKEDIN' and t.version = 1),
   true, '00000000-0000-4000-8000-000000000353', 'linkedin-andino-0001-msg1', 'entregado', null,
   now() - interval '13 days'),
  ('00000000-0000-4000-8000-000000000530', '00000000-0000-4000-8000-000000000407', 'entrante',
   'linkedin',
   'Acepto la conexion. Prefiero que lo veamos por correo, ese es mi canal.',
   'Lic. Marcela Quiroga', null, false, null, 'linkedin-andino-0001-msg2', 'recibido', null,
   now() - interval '12 days'),

  -- Hilo 0408: cadencia pausada de Logistica Mercosur y el reclamo de falta de respuesta.
  ('00000000-0000-4000-8000-000000000531', '00000000-0000-4000-8000-000000000408', 'saliente',
   'whatsapp',
   'Hola, Paola. Te contacto de AV Finance, la empresa detrás de Alyto. Estamos invitando a empresas a probar nuestro servicio de transferencias internacionales en el ECP de ASFI. ¿Podemos conversar 20 minutos esta semana para mostrarte cómo optimizar tus pagos al exterior?',
   'Secuencia B2B de Alyto',
   (select t.id from public.templates t where t.code = 'PROSPECTO_B2B' and t.version = 1),
   true, '00000000-0000-4000-8000-000000000371', 'wamid.demomer0001', 'leido', null,
   now() - interval '12 days'),
  ('00000000-0000-4000-8000-000000000532', '00000000-0000-4000-8000-000000000408', 'entrante',
   'whatsapp',
   'Hola. Por ahora no tenemos presupuesto aprobado, pero sigan enviando la informacion.',
   'Sra. Paola Arteaga', null, false, null, 'wamid.demomer0002', 'recibido', null,
   now() - interval '11 days'),
  ('00000000-0000-4000-8000-000000000533', '00000000-0000-4000-8000-000000000408', 'entrante',
   'whatsapp',
   'Paso tres dias y nadie me confirmo el horario de la llamada. Sigue en pie?',
   'Sra. Paola Arteaga', null, false, null, 'wamid.demomer0003', 'recibido', null,
   now() - interval '3 days'),

  -- Hilo 0409: nota interna. Es el unico canal que no pasa por el filtro de lenguaje porque
  -- no se envia a nadie: lo excluye la clausula when del disparador messages_language_guard.
  -- Su estado es 'enviado' y no 'entregado': una nota no sale a ningun proveedor de canal, asi
  -- que no tiene entrega que confirmar.
  ('00000000-0000-4000-8000-000000000534', '00000000-0000-4000-8000-000000000409', 'saliente',
   'interno',
   'Llamada de seguimiento: la clienta confirmo que subio la cedula y el formulario de origen de fondos. Falta revisar el perfil de riesgo antes de habilitar la primera operacion.',
   'Soporte Alyto', null, false, null, null, 'enviado',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '3 days'),

  -- Hilo 0410: captura de lead desde la publicacion oficial en Meta.
  ('00000000-0000-4000-8000-000000000535', '00000000-0000-4000-8000-000000000410', 'entrante',
   'meta',
   'Comentario en la publicacion: mi empresa paga proveedores en Brasil, como hago para probar el servicio?',
   'Importadora Pacifico S.A.', null, false, null, 'meta-comment-pacif-0001', 'recibido', null,
   now() - interval '10 days'),

  -- Hilo 0411: captura de lead desde TikTok.
  ('00000000-0000-4000-8000-000000000536', '00000000-0000-4000-8000-000000000411', 'entrante',
   'tiktok',
   'Mensaje directo: vi el video sobre pagos al exterior y quiero saber si sirve para uso personal.',
   'Roberto Carlos Salazar', null, false, null, 'tiktok-dm-0009-0001', 'recibido', null,
   now() - interval '6 hours'),

  -- Hilo 0412: el correo de la cadencia de Grupo Andino, pasos 2 y 10.
  ('00000000-0000-4000-8000-000000000537', '00000000-0000-4000-8000-000000000412', 'saliente',
   'correo',
   'Hola, Marcela. Como conversamos, te adjunto el resumen ejecutivo de nuestro servicio de transferencias internacionales para empresas. El enlace de agendamiento esta al final: una reunion de 20 minutos para revisar tus pagos al exterior dentro del ECP de ASFI. https://alyto.io/agendar',
   'Secuencia B2B de Alyto',
   (select t.id from public.templates t where t.code = 'CAD_B2B_D2_CORREO' and t.version = 1),
   true, '00000000-0000-4000-8000-000000000352', 'message-id-and0002', 'leido', null,
   now() - interval '15 days'),
  ('00000000-0000-4000-8000-000000000538', '00000000-0000-4000-8000-000000000412', 'entrante',
   'correo',
   'Interesante. Agendemos el miercoles.',
   'Lic. Marcela Quiroga', null, false, null, 'message-id-and0003', 'recibido', null,
   now() - interval '14 days'),
  ('00000000-0000-4000-8000-000000000539', '00000000-0000-4000-8000-000000000412', 'saliente',
   'correo',
   'Hola, Marcela. Te proponemos dos horarios concretos para la reunion de 20 minutos: miercoles 10:00 o jueves 15:30. Si ninguno funciona, indicanos uno y lo confirmamos por este medio.',
   'Secuencia B2B de Alyto',
   (select t.id from public.templates t where t.code = 'CAD_B2B_D10_AGENDA' and t.version = 1),
   true, '00000000-0000-4000-8000-000000000355', 'message-id-and0004', 'enviado', null,
   now() - interval '7 days'),

  -- Hilo 0413: WhatsApp de una persona natural con el registro a medias. El saliente usa
  -- estado 'fallido' para mostrar el caso en que el canal no confirma la entrega.
  ('00000000-0000-4000-8000-000000000540', '00000000-0000-4000-8000-000000000413', 'entrante',
   'whatsapp',
   'Buenas tardes. Subi la cedula dos veces y el sistema me dice que no se lee.',
   'Jorge Andres Mendoza', null, false, null, 'wamid.demomdz0001', 'recibido', null,
   now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000541', '00000000-0000-4000-8000-000000000413', 'saliente',
   'whatsapp',
   'Hola, Jorge. Proba una foto con luz directa y sin flash, encuadrando la cedula completa. Si sigue sin leerse, te pedimos el respaldo por el chat de la app.',
   'Soporte Alyto', null, false, null, 'wamid.demomdz0002', 'fallido',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '1 day' + interval '40 minutes'),
  ('00000000-0000-4000-8000-000000000542', '00000000-0000-4000-8000-000000000413', 'entrante',
   'whatsapp',
   'Ahora si, ya aparece aprobado. Queda algo mas por hacer?',
   'Jorge Andres Mendoza', null, false, null, 'wamid.demomdz0003', 'recibido', null,
   now() - interval '20 hours')

on conflict do nothing;

-- El reloj de la demostracion se vuelve a anclar aqui.
--
-- Sin este bloque el fichero parecia repetible pero no lo era: los mensajes entran con
-- "on conflict do nothing", asi que la segunda pasada dejaba intacto el sent_at de la primera
-- y toda la cronologia envejecia lo que hubieran pasado los dias. Paso el 26/10, tres dias
-- despues de la siembra del 23: el cheque hilos_vencidos_de_fondo de verificacion.sql paso de
-- 3 a 5 porque dos hilos cruzaron sin querer la linea de los tres dias naturales.
--
-- Se corrige moviendo TODOS los mensajes el mismo desfase, asi que el orden relativo entre
-- ellos no se toca y el ultimo queda otra vez a veinte horas de distancia, que es donde lo
-- escribe este fichero. En la primera pasada el desfase sale cero y el bloque no escribe nada.
--
-- Va entero en un solo DO porque la marca de sistema es local a la transaccion: el disparador
-- messages_no_update (0004) rechaza cualquier update sobre messages sin ella, y un set_config
-- suelto en la sentencia anterior ya no estaria cuando llegara el update.
do $$
declare
  desfase interval;
begin
  perform set_config('crm.system_write', 'on', true);
  select (now() - interval '20 hours') - max(sent_at) into desfase from public.messages;
  if desfase > interval '1 minute' then
    update public.messages set sent_at = sent_at + desfase;
  end if;
end $$;

-- Estados finales del hilo. Van despues de los mensajes porque el disparador
-- messages_sync_conversation reabre un hilo en espera de cliente cada vez que entra un
-- mensaje entrante: si el estado se fijara en el insert, el ultimo mensaje lo pisaria.
update public.conversations as c
set status = v.status::public.conversation_status,
    resolved_at = v.resolved_at
from (values
  ('00000000-0000-4000-8000-000000000401'::uuid, 'abierta'::text, null::timestamptz),
  ('00000000-0000-4000-8000-000000000402', 'en_espera_cliente', null),
  ('00000000-0000-4000-8000-000000000403', 'abierta', null),
  ('00000000-0000-4000-8000-000000000404', 'en_espera_agente', null),
  ('00000000-0000-4000-8000-000000000405', 'resuelta', now() - interval '19 days'),
  ('00000000-0000-4000-8000-000000000406', 'en_espera_cliente', null),
  ('00000000-0000-4000-8000-000000000407', 'resuelta', now() - interval '12 days'),
  ('00000000-0000-4000-8000-000000000408', 'abierta', null),
  ('00000000-0000-4000-8000-000000000409', 'resuelta', now() - interval '3 days'),
  ('00000000-0000-4000-8000-000000000410', 'abierta', null),
  ('00000000-0000-4000-8000-000000000411', 'abierta', null),
  ('00000000-0000-4000-8000-000000000412', 'resuelta', now() - interval '7 days'),
  ('00000000-0000-4000-8000-000000000413', 'abierta', null)
) as v(id, status, resolved_at)
where c.id = v.id;

-- Contadores del hilo, recalculados desde el historial real. El disparador los mantiene
-- mensaje a mensaje; esta pasada los deja exactos sin depender del orden de insercion, y
-- corrige cualquier siembra que se haya corrido dos veces.
update public.conversations c
set first_inbound_at = h.primero,
    last_inbound_at = h.ultimo_entrante,
    last_outbound_at = h.ultimo_saliente,
    last_message_at = h.ultimo,
    messages_count = h.total
from (
  select m.conversation_id,
         min(m.sent_at) filter (where m.direction = 'entrante') as primero,
         max(m.sent_at) filter (where m.direction = 'entrante') as ultimo_entrante,
         max(m.sent_at) filter (where m.direction = 'saliente') as ultimo_saliente,
         max(m.sent_at) as ultimo,
         count(*)::integer as total
  from public.messages m
  where m.conversation_id in (select id from public.conversations where id between
    '00000000-0000-4000-8000-000000000401'::uuid and '00000000-0000-4000-8000-000000000413'::uuid)
  group by m.conversation_id
) h
where h.conversation_id = c.id;

-- ---------------------------------------------------------------------------
-- 6. Ruta A: legajo digital
-- ---------------------------------------------------------------------------

-- Primero los documentos y despues los estados de las casillas. El orden no es capricho: el
-- disparador document_reviews_need_document rechaza una casilla que pase a Aprobado sin un
-- documento aprobado encima, asi que invertirlo haria fallar el sembrado.
--
-- La tabla guarda metadatos. El archivo fisico no se sube aqui: tiene que entrar por la
-- pantalla de la Ficha 360 hacia el bucket expedientes, y una ruta de Storage inventada daria
-- la sensacion de un documento que no existe. checksum queda vacio por la misma razon.

insert into public.documents
  (id, client_id, requirement_code, filename, storage_bucket, storage_path, mime_type,
   size_bytes, review_status, expires_on, uploaded_by, reviewed_by, reviewed_at)
values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-0000000000c1', 'identidad',
   'cedula-representante.pdf', 'expedientes', 'demo/valle/identidad.pdf', 'application/pdf',
   248000, 'Aprobado', current_date + 400,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '5 days'),

  ('00000000-0000-4000-8000-000000000902', '00000000-0000-4000-8000-0000000000c1', 'tributario',
   'constancia-nit.pdf', 'expedientes', 'demo/valle/tributario.pdf', 'application/pdf',
   131000, 'Aprobado', null,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '5 days'),

  ('00000000-0000-4000-8000-000000000903', '00000000-0000-4000-8000-0000000000c1', 'origen_fondos',
   'declaracion-origen.pdf', 'expedientes', 'demo/valle/origen-fondos.pdf', 'application/pdf',
   96000, 'En revision', null,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'), null, null)
on conflict (id) do update set
  filename = excluded.filename,
  storage_path = excluded.storage_path,
  mime_type = excluded.mime_type,
  size_bytes = excluded.size_bytes,
  review_status = excluded.review_status,
  expires_on = excluded.expires_on,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at;

insert into public.documents
  (id, client_id, requirement_code, filename, storage_bucket, storage_path, mime_type,
   size_bytes, review_status, expires_on, uploaded_by, reviewed_by, reviewed_at)
values
  ('00000000-0000-4000-8000-000000000904', '00000000-0000-4000-8000-0000000000c2', 'identidad',
   'cedula-representante.pdf', 'expedientes', 'demo/andino/identidad.pdf', 'application/pdf',
   205000, 'Aprobado', current_date + 620,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '15 days'),

  ('00000000-0000-4000-8000-000000000905', '00000000-0000-4000-8000-0000000000c2', 'tributario',
   'constancia-nit.pdf', 'expedientes', 'demo/andino/tributario.pdf', 'application/pdf',
   122000, 'Aprobado', null,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '15 days'),

  ('00000000-0000-4000-8000-000000000906', '00000000-0000-4000-8000-0000000000c2', 'representacion',
   'poder-notarial.pdf', 'expedientes', 'demo/andino/representacion.pdf', 'application/pdf',
   540000, 'Aprobado', current_date + 240,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '14 days'),

  ('00000000-0000-4000-8000-000000000907', '00000000-0000-4000-8000-0000000000c2', 'beneficiario_final',
   'declaracion-beneficiario.pdf', 'expedientes', 'demo/andino/beneficiario-final.pdf', 'application/pdf',
   118000, 'Aprobado', null,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '14 days'),

  -- Grupo Andino tiene el legajo completo: es la cuenta que ya se convirtio y da la primera
  -- operacion acompañada, así que necesita las cinco casillas documentales aprobadas.
  ('00000000-0000-4000-8000-000000000908', '00000000-0000-4000-8000-0000000000c2', 'origen_fondos',
   'estados-contables.pdf', 'expedientes', 'demo/andino/origen-fondos.pdf', 'application/pdf',
   890000, 'Aprobado', current_date + 120,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '13 days')
on conflict (id) do update set
  filename = excluded.filename,
  storage_path = excluded.storage_path,
  size_bytes = excluded.size_bytes,
  review_status = excluded.review_status,
  expires_on = excluded.expires_on,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at;
-- documento-andino-fin

insert into public.documents
  (id, client_id, requirement_code, filename, storage_bucket, storage_path, mime_type,
   size_bytes, review_status, expires_on, uploaded_by, reviewed_by, reviewed_at)
values
  -- Importadora Pacifico: identidad y poder ya revisados; falta el beneficiario final, que es
  -- justo lo que bloquea su vinculacion y alimenta el reclamo RC-2026-0001.
  ('00000000-0000-4000-8000-000000000909', '00000000-0000-4000-8000-0000000000c3', 'identidad',
   'cedula-representante.pdf', 'expedientes', 'demo/pacifico/identidad.pdf', 'application/pdf',
   212000, 'Aprobado', current_date + 500,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '8 days'),

  ('00000000-0000-4000-8000-00000000090a', '00000000-0000-4000-8000-0000000000c3', 'representacion',
   'poder-notarial.pdf', 'expedientes', 'demo/pacifico/representacion.pdf', 'application/pdf',
   615000, 'Aprobado', current_date + 12,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '8 days'),

  -- Logistica Mercosur: el unico documento Observado del sembrado.
  ('00000000-0000-4000-8000-00000000090b', '00000000-0000-4000-8000-0000000000c4', 'identidad',
   'cedula-representante.pdf', 'expedientes', 'demo/mercosur/identidad.pdf', 'application/pdf',
   174000, 'Observado', null,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '10 days'),

  ('00000000-0000-4000-8000-00000000090c', '00000000-0000-4000-8000-0000000000c5', 'identidad',
   'cedula-representante.pdf', 'expedientes', 'demo/oriente/identidad.pdf', 'application/pdf',
   221000, 'Aprobado', current_date + 700,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '20 days'),

  ('00000000-0000-4000-8000-00000000090d', '00000000-0000-4000-8000-0000000000c5', 'tributario',
   'constancia-nit.pdf', 'expedientes', 'demo/oriente/tributario.pdf', 'application/pdf',
   118000, 'Aprobado', null,
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '20 days'),

  -- Personas naturales: cinco casillas por cuenta, de las cuales dos piden documento.
  ('00000000-0000-4000-8000-00000000090e', '00000000-0000-4000-8000-0000000000c6', 'identidad',
   'cedula.pdf', 'expedientes', 'demo/quispe/identidad.pdf', 'application/pdf',
   143000, 'Observado', current_date + 15,
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '2 days'),

  ('00000000-0000-4000-8000-00000000090f', '00000000-0000-4000-8000-0000000000c6', 'origen_fondos',
   'declaracion-origen.pdf', 'expedientes', 'demo/quispe/origen-fondos.pdf', 'application/pdf',
   88000, 'Aprobado', null,
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '18 days'),

  ('00000000-0000-4000-8000-000000000910', '00000000-0000-4000-8000-0000000000c7', 'identidad',
   'cedula.pdf', 'expedientes', 'demo/mendoza/identidad.pdf', 'application/pdf',
   156000, 'Aprobado', current_date + 800,
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'), now() - interval '1 day')
on conflict (id) do update set
  filename = excluded.filename,
  storage_path = excluded.storage_path,
  size_bytes = excluded.size_bytes,
  review_status = excluded.review_status,
  expires_on = excluded.expires_on,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at;
-- documentos-naturales-fin

-- Los requisitos los creo el disparador clients_document_reviews_template al insertar cada
-- ocho para las personas juridicas y cinco para las naturales. Se vuelven a Pendiente y despues
-- se escribe el estado de la demostracion, para que correr el archivo dos veces deje el mismo
-- resultado.
update public.document_reviews
set status = 'Pendiente'::public.kyc_status,
    detail = null,
    reviewed_by = null,
    reviewed_at = null
where client_id in (
  '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2',
  '00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c4',
  '00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000c6',
  '00000000-0000-4000-8000-0000000000c7', '00000000-0000-4000-8000-0000000000c8',
  '00000000-0000-4000-8000-0000000000c9'
);
-- casillas-reiniciadas

-- Estado del legajo de las tres cuentas juridicas con trabajo abierto. Las casillas que
-- quedan fuera de esta lista siguen en Pendiente, que es como empieza una cuenta real.
update public.document_reviews as ci
set status = v.status::public.kyc_status,
    detail = v.detail,
    reviewed_by = (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
    reviewed_at = now() - make_interval(days => v.hace_dias)
from (values
  ('00000000-0000-4000-8000-0000000000c1'::uuid, 'identidad'::text, 'Aprobado'::text,
   'Cedula vigente del representante legal.', 5),
  ('00000000-0000-4000-8000-0000000000c1', 'tributario', 'Aprobado', 'Constancia del NIT al dia.', 5),
  ('00000000-0000-4000-8000-0000000000c1', 'representacion', 'En revision',
   'Poder recibido; falta verificar la vigencia en el registro.', 2),
  ('00000000-0000-4000-8000-0000000000c1', 'origen_fondos', 'En revision',
   'Declaracion presentada; se pide el respaldo del ultimo periodo.', 2),
  ('00000000-0000-4000-8000-0000000000c1', 'listas_restrictivas', 'Aprobado',
   'Cotejo sin coincidencia.', 5),
  ('00000000-0000-4000-8000-0000000000c1', 'perfil_riesgo', 'Aprobado',
   'Riesgo medio por el volumen declarado.', 5),

  ('00000000-0000-4000-8000-0000000000c2', 'identidad', 'Aprobado', 'Cedula vigente.', 15),
  ('00000000-0000-4000-8000-0000000000c2', 'tributario', 'Aprobado', 'Constancia del NIT al dia.', 15),
  ('00000000-0000-4000-8000-0000000000c2', 'representacion', 'Aprobado', 'Poder notarial vigente.', 14),
  ('00000000-0000-4000-8000-0000000000c2', 'beneficiario_final', 'Aprobado',
   'Dos beneficiarios declarados, ambos con cedula.', 14),
  ('00000000-0000-4000-8000-0000000000c2', 'origen_fondos', 'Aprobado',
   'Estados contables del ultimo ejercicio.', 13),
  ('00000000-0000-4000-8000-0000000000c2', 'listas_restrictivas', 'Aprobado',
   'Cotejo sin coincidencia.', 15),
  ('00000000-0000-4000-8000-0000000000c2', 'perfil_riesgo', 'Aprobado', 'Riesgo bajo.', 15),
  ('00000000-0000-4000-8000-0000000000c2', 'terminos_ecp', 'Aprobado',
   'Constancia de aceptacion firmada por la gerencia.', 13),

  ('00000000-0000-4000-8000-0000000000c3', 'identidad', 'Aprobado',
   'Cedula vigente del representante.', 8),
  ('00000000-0000-4000-8000-0000000000c3', 'representacion', 'Aprobado',
   'Poder recibido por correo.', 8),
  ('00000000-0000-4000-8000-0000000000c3', 'listas_restrictivas', 'En revision',
   'Cotejo en curso: aparece un nombre parecido, hay que descartar.', 1)
) as v(client_id, requirement_code, status, detail, hace_dias)
where ci.client_id = v.client_id and ci.requirement_code = v.requirement_code;
-- casillas-juridicas-avanzadas

update public.document_reviews as ci
set status = v.status::public.kyc_status,
    detail = v.detail,
    reviewed_by = (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
    reviewed_at = now() - make_interval(days => v.hace_dias)
from (values
  -- Logistica Mercosur: la cedula observada es la que dejaron sin resolver cuando la
  -- cuenta paso a no_responde.
  ('00000000-0000-4000-8000-0000000000c4'::uuid, 'identidad'::text, 'Observado'::text,
   'La imagen de la cedula no se lee; se pide una nueva.', 10),

  ('00000000-0000-4000-8000-0000000000c5', 'identidad', 'Aprobado', 'Cedula vigente.', 20),
  ('00000000-0000-4000-8000-0000000000c5', 'tributario', 'Aprobado', 'Constancia del NIT al dia.', 20),
  ('00000000-0000-4000-8000-0000000000c5', 'origen_fondos', 'Observado',
   'El respaldo no aclara el origen del ultimo envio.', 3),
  ('00000000-0000-4000-8000-0000000000c5', 'listas_restrictivas', 'Aprobado',
   'Cotejo sin coincidencia.', 20),

  -- Maria Fernanda: la cedula queda observada por vencimiento. Es la senal que abrio el
  -- viaje V-02 de requerimiento de documentos.
  ('00000000-0000-4000-8000-0000000000c6', 'identidad', 'Observado',
   'La cedula vence en quince dias; se pidio la vigente.', 2),
  ('00000000-0000-4000-8000-0000000000c6', 'origen_fondos', 'Aprobado',
   'Declaracion jurada simple.', 18),
  ('00000000-0000-4000-8000-0000000000c6', 'listas_restrictivas', 'Aprobado',
   'Cotejo sin coincidencia.', 18),
  ('00000000-0000-4000-8000-0000000000c6', 'perfil_riesgo', 'Aprobado',
   'Riesgo bajo: montos pequenos y un solo destino.', 17),

  -- Jorge Andres: acabo de subir la cedula legible despues del segundo intento.
  ('00000000-0000-4000-8000-0000000000c7', 'identidad', 'Aprobado',
   'Cedula readable al segundo intento.', 1),
  ('00000000-0000-4000-8000-0000000000c7', 'origen_fondos', 'En revision',
   'Declaracion presentada; falta el respaldo.', 1),
  ('00000000-0000-4000-8000-0000000000c7', 'listas_restrictivas', 'Aprobado',
   'Cotejo sin coincidencia.', 1),

  ('00000000-0000-4000-8000-0000000000c9', 'listas_restrictivas', 'Aprobado',
   'Cotejo sin coincidencia.', 6)
) as v(client_id, requirement_code, status, detail, hace_dias)
where ci.client_id = v.client_id and ci.requirement_code = v.requirement_code;

-- Cotejo en listas restrictivas. El resultado es texto cerrado ('sin coincidencia',
-- 'revisar', 'coincidencia'), no un numero: un cero sin contexto no significa lo mismo en
-- dos listas distintas.
insert into public.screenings (id, client_id, contact_id, list_name, subject, result, detail, screened_by)
values
  ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-0000000000c1',
   '00000000-0000-4000-8000-0000000001d1', 'OFAC Lista SDN', 'Comercializadora del Valle S.A.',
   'sin coincidencia', 'Cotejo del representante legal.',
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-0000000000c1',
   null, 'Lista ONU', 'Comercializadora del Valle S.A.', 'sin coincidencia', null,
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000a03', '00000000-0000-4000-8000-0000000000c2',
   '00000000-0000-4000-8000-0000000001d3', 'OFAC Lista SDN', 'Grupo Andino S.R.L.',
   'sin coincidencia', null,
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000a04', '00000000-0000-4000-8000-0000000000c3',
   '00000000-0000-4000-8000-0000000001d5', 'OFAC Lista SDN', 'Importadora Pacifico S.A.',
   'revisar', 'Coincidencia parcial de nombre: verificar ortografia antes de habilitar.',
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000a05', '00000000-0000-4000-8000-0000000000c5',
   null, 'Lista UE', 'Agroindustrial del Oriente S.A.', 'sin coincidencia', null,
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'))
on conflict (id) do update set
  result = excluded.result,
  detail = excluded.detail,
  screened_by = excluded.screened_by;
-- casillas-naturales-fin

-- ---------------------------------------------------------------------------
-- 7. Las tres rutas que cada cuenta mueve en paralelo
-- ---------------------------------------------------------------------------

-- Ruta A documentacion, ruta B comercial B2B y ruta C riesgo y cupos del Entorno Controlado de
-- Pruebas. No es un embudo: las tres avanzan a la vez sobre la misma cuenta, cada una con su
-- estado propio, y el cierre de una no cierra las otras dos.
--
-- El estado final se aplica con un UPDATE y no en el INSERT. La razon es el disparador
-- routes_event_insert: el asiento de apertura siempre se escribe, pero el de movimiento solo
-- corre cuando el estado cambia de verdad. Insertar directamente en 'cerrada' dejaria una ruta
-- cerrada sin historial.
--
-- monthly_volume_bs es una estimacion mensual de la cuenta, en bolivianos, y no una operacion. El
-- tope por operacion del ECP (Bs 120.000) lo administra la plataforma de pagos y solo se recuerda
-- aqui a traves de ecp_parameters. Ningun valor de este archivo es una transferencia real.

insert into public.routes
  (id, code, client_id, kind, owner_id, opened_at, operation_type, frequency,
   monthly_volume_bs, next_step)
values
  -- Ruta A: legajo y documentacion.
  ('00000000-0000-4000-8000-000000000611', 'RTA-0001',
   '00000000-0000-4000-8000-0000000000c1', 'documentacion',
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   now() - interval '26 days', null::text, null::text, null::numeric, null::text),

  ('00000000-0000-4000-8000-000000000612', 'RTA-0002',
   '00000000-0000-4000-8000-0000000000c2', 'documentacion',
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   now() - interval '34 days', null, null, null, null),

  ('00000000-0000-4000-8000-000000000613', 'RTA-0003',
   '00000000-0000-4000-8000-0000000000c3', 'documentacion',
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   now() - interval '21 days', null, null, null, null),

  ('00000000-0000-4000-8000-000000000614', 'RTA-0004',
   '00000000-0000-4000-8000-0000000000c4', 'documentacion',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '15 days', null, null, null, null),

  ('00000000-0000-4000-8000-000000000615', 'RTA-0005',
   '00000000-0000-4000-8000-0000000000c5', 'documentacion',
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '11 days', null, null, null, null),

  ('00000000-0000-4000-8000-000000000616', 'RTA-0006',
   '00000000-0000-4000-8000-0000000000c6', 'documentacion',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '24 days', null, null, null, null),

  ('00000000-0000-4000-8000-000000000617', 'RTA-0007',
   '00000000-0000-4000-8000-0000000000c7', 'documentacion',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '7 days', null, null, null, null),

  -- Sin ningun movimiento todavia: es la unica ruta que queda en 'abierta' de la ruta A y
  -- demuestra el estado inicial real, no un estado decorativo.
  ('00000000-0000-4000-8000-000000000618', 'RTA-0008',
   '00000000-0000-4000-8000-0000000000c8', 'documentacion',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '4 hours', null, null, null, null),

  ('00000000-0000-4000-8000-000000000619', 'RTA-0009',
   '00000000-0000-4000-8000-0000000000c9', 'documentacion',
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo'),
   now() - interval '18 days', null, null, null, null),

  -- Ruta B: comercial B2B. Es el unico tipo de ruta que lleva volumen, frecuencia y paso
  -- siguiente; la restriccion routes_detalle_solo_comercial lo exige asi.
  ('00000000-0000-4000-8000-000000000621', 'RTB-0001',
   '00000000-0000-4000-8000-0000000000c1', 'comercial',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '6 days', 'Transferencia internacional B2B', 'Quincenal',
   1250000.00, 'Reunion de 20 minutos para repasar el calendario de pagos al exterior'),

  ('00000000-0000-4000-8000-000000000622', 'RTB-0002',
   '00000000-0000-4000-8000-0000000000c2', 'comercial',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '16 days', 'Transferencia internacional B2B', 'Mensual',
   2800000.00, 'Acompanar la primera operacion y coordinar la recurrencia'),

  ('00000000-0000-4000-8000-000000000623', 'RTB-0003',
   '00000000-0000-4000-8000-0000000000c3', 'comercial',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '9 days', 'Transferencia internacional B2B', 'Por definir',
   800000.00, 'Enviar el resumen ejecutivo cuando se cierre la constancia del beneficiario final'),

  ('00000000-0000-4000-8000-000000000624', 'RTB-0004',
   '00000000-0000-4000-8000-0000000000c4', 'comercial',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '22 days', 'Transferencia internacional B2B', 'Por definir',
   0.00, null),

  ('00000000-0000-4000-8000-000000000625', 'RTB-0005',
   '00000000-0000-4000-8000-0000000000c5', 'comercial',
   (select p.id from public.profiles p where p.email = 'ventas@avfinance.bo'),
   now() - interval '30 days', 'Transferencia internacional B2B', 'Mensual',
   3500000.00, 'Cotizacion de transferencias ajustada al volumen real'),

  -- Ruta C: riesgo y condiciones del ECP. Ficha y alerta, sin detalle comercial.
  ('00000000-0000-4000-8000-000000000631', 'RTC-0001',
   '00000000-0000-4000-8000-0000000000c1', 'riesgo',
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '5 days', null, null, null, null),

  ('00000000-0000-4000-8000-000000000632', 'RTC-0002',
   '00000000-0000-4000-8000-0000000000c3', 'riesgo',
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   now() - interval '8 days', null, null, null, null),

  ('00000000-0000-4000-8000-000000000633', 'RTC-0003',
   '00000000-0000-4000-8000-0000000000c4', 'riesgo',
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '7 days', null, null, null, null),

  ('00000000-0000-4000-8000-000000000634', 'RTC-0004',
   '00000000-0000-4000-8000-0000000000c7', 'riesgo',
   (select p.id from public.profiles p where p.email = 'operaciones@avfinance.bo'),
   now() - interval '7 days', null, null, null, null),

  ('00000000-0000-4000-8000-000000000635', 'RTC-0005',
   '00000000-0000-4000-8000-0000000000c5', 'riesgo',
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   now() - interval '3 days', null, null, null, null)
on conflict (id) do update set
  code = excluded.code,
  client_id = excluded.client_id,
  kind = excluded.kind,
  owner_id = excluded.owner_id,
  opened_at = excluded.opened_at,
  operation_type = excluded.operation_type,
  frequency = excluded.frequency,
  monthly_volume_bs = excluded.monthly_volume_bs,
  next_step = excluded.next_step;
-- Sin estado en la lista de conflicto: correr el sembrado dos veces no debe devolver una ruta
-- ya movida a su estado inicial, porque eso escribira un asiento falso en el historial.

-- Cada movimiento de estado, con su motivo. Son 17 porque las dos rutas que quedan en 'abierta'
-- (RTA-0008 y RTC-0004) todavia no se movieron.
do $$
declare
  movimiento record;
begin
  -- El disparador pone la marca por si mismo, pero esta escritura directa del created_at la
  -- necesita igual: route_events rechaza todo lo que no llegue marcado por el sistema.
  perform set_config('crm.system_write', 'on', true);

  for movimiento in
    select v.id::uuid as ruta_id,
           v.estado::public.route_estado as estado,
           v.momento::timestamptz as momento,
           v.motivo::text as motivo
    from (values
      ('00000000-0000-4000-8000-000000000611'::uuid, 'cerrada',
       (now() - interval '8 days')::timestamptz,
       'Los ocho documentos del legajo quedaron aprobados'),
      ('00000000-0000-4000-8000-000000000612', 'cerrada',
       (now() - interval '16 days'),
       'Legajo completo antes de la primera solicitud'),
      ('00000000-0000-4000-8000-000000000613', 'bloqueada',
       (now() - interval '4 days'),
       'Falta la constancia del beneficiario final'),
      ('00000000-0000-4000-8000-000000000614', 'en_espera_cliente',
       (now() - interval '2 days'),
       'Se pidio la cedula vigente; se espera el archivo del cliente'),
      ('00000000-0000-4000-8000-000000000615', 'en_curso',
       (now() - interval '30 minutes'),
       'El formulario de origen de fondos quedo observado'),
      ('00000000-0000-4000-8000-000000000616', 'cerrada_sin_resultado',
       (now() - interval '6 days'),
       'La clienta pidio el cierre de cuenta y la baja de datos'),
      ('00000000-0000-4000-8000-000000000617', 'en_espera_cliente',
       (now() - interval '20 hours'),
       'Pendiente el respaldo de origen de fondos'),
      ('00000000-0000-4000-8000-000000000619', 'cerrada',
       (now() - interval '9 days'),
       'Cuenta de uso personal con legajo completo'),
      ('00000000-0000-4000-8000-000000000621', 'en_curso',
       (now() - interval '1 day'),
       'El cliente confirmo el volumen estimado y pidio la reunion'),
      ('00000000-0000-4000-8000-000000000622', 'cerrada',
       (now() - interval '2 days'),
       'Vinculacion completada: la cuenta ya opera en el entorno de pruebas'),
      ('00000000-0000-4000-8000-000000000623', 'en_espera_cliente',
       (now() - interval '5 days'),
       'La propuesta queda en espera hasta cerrar la documentacion'),
      ('00000000-0000-4000-8000-000000000624', 'cerrada_sin_resultado',
       (now() - interval '7 days'),
       'Sin presupuesto aprobado este semestre; se retoma en tres meses'),
      ('00000000-0000-4000-8000-000000000625', 'en_curso',
       (now() - interval '6 hours'),
       'La gerencia financiera confirmo el volumen real'),
      ('00000000-0000-4000-8000-000000000631', 'en_curso',
       (now() - interval '2 days'),
       'Volumen declarado por encima del promedio del entorno'),
      ('00000000-0000-4000-8000-000000000632', 'bloqueada',
       (now() - interval '1 day'),
       'No se da de alta hasta cerrar el reclamo y el beneficiario final'),
      ('00000000-0000-4000-8000-000000000633', 'en_curso',
       (now() - interval '3 days'),
       'Usuario suspendido por documento de identidad observado'),
      ('00000000-0000-4000-8000-000000000635', 'en_espera_cliente',
       (now() - interval '40 hours'),
       'Se espera el formulario corregido de origen de fondos')
    ) as v(id, estado, momento, motivo)
  loop
    update public.routes r
       set estado = movimiento.estado,
           motivo = movimiento.motivo,
           closed_at = case
                         when movimiento.estado in ('cerrada', 'cerrada_sin_resultado')
                         then movimiento.momento
                       end
     where r.id = movimiento.ruta_id;

    -- El motivo ya vino solo: el disparador lo copia de la ruta al asiento en la misma movida.
    -- Aca queda atrasarle la fecha, que es lo que el disparador no puede saber.
    update public.route_events e
       set created_at = movimiento.momento
     where e.route_id = movimiento.ruta_id
       and e.from_estado is not null;
  end loop;

  -- El asiento de apertura lleva la fecha de apertura, no la del sembrado: si no, las 19 rutas
  -- partirian del mismo minuto y el tablero de antiguedad no mediria nada.
  update public.route_events e
     set created_at = (select r.opened_at from public.routes r where r.id = e.route_id)
   where e.from_estado is null;
end;
$$;
-- rutas-tres-hilos-listas

-- ---------------------------------------------------------------------------
-- 8. Agenda del equipo y etiquetas
-- ---------------------------------------------------------------------------

-- owner_id no admite vacio, asi que la actividad solo se escribe si ya existe un perfil con
-- ese rol: el join lateral elimina la fila en lugar de fallar. Por eso el encabezado pide
-- volver a correr este archivo despues de dar de alta los cinco usuarios de Auth.
insert into public.activities
  (id, client_id, route_id, conversation_id, type, title, body, due_at, done_at,
   duration_minutes, owner_id, participants, created_by, created_at)
select v.id, v.client_id, r.id, v.conversation_id, v.type::public.activity_type, v.title, v.body,
       v.due_at, v.done_at, v.duration_minutes, o.id, array[o.id], o.id, v.created_at
from (values
  ('00000000-0000-4000-8000-000000000701'::uuid,
   '00000000-0000-4000-8000-0000000000c1'::uuid, 'RTB-0001'::text,
   '00000000-0000-4000-8000-000000000401'::uuid, 'reunion'::text,
   'Reunion de presentacion de 20 minutos',
   'Repasar el volumen mensual estimado y el calendario de pagos al exterior.',
   (now() + interval '2 days')::timestamptz, null::timestamptz, null::integer,
   'ventas'::text, (now() - interval '5 days')::timestamptz),

  ('00000000-0000-4000-8000-000000000702',
   '00000000-0000-4000-8000-0000000000c4', 'RTB-0004',
   '00000000-0000-4000-8000-000000000408', 'tarea',
   'Reactivar la propuesta cuando aprueben el presupuesto',
   'La cuenta quedo en pausa por falta de presupuesto; hay que volver en tres meses.',
   (now() + interval '10 days')::timestamptz, null, null,
   'ventas', (now() - interval '3 days')::timestamptz),

  ('00000000-0000-4000-8000-000000000703',
   '00000000-0000-4000-8000-0000000000c3', 'RTA-0003',
   '00000000-0000-4000-8000-000000000404', 'tarea',
   'Solicitar la constancia del beneficiario final',
   'Es el documento que bloquea la ruta A y el motivo del reclamo abierto.',
   (now() - interval '1 day')::timestamptz, null, null,
   'operaciones', (now() - interval '8 days')::timestamptz),

  ('00000000-0000-4000-8000-000000000704',
   '00000000-0000-4000-8000-0000000000c6', 'RTA-0006',
   '00000000-0000-4000-8000-000000000409', 'nota',
   'Llamada de seguimiento del registro',
   'Confirmo que subio la cedula y el formulario de origen de fondos.',
   null, (now() - interval '3 days')::timestamptz, 18,
   'soporte', (now() - interval '3 days')::timestamptz),

  ('00000000-0000-4000-8000-000000000705',
   '00000000-0000-4000-8000-0000000000c2', 'RTB-0002', null, 'reunion',
   'Capacitacion de operaciones para la primera transferencia',
   'Se reviso con el cliente el ingreso de la solicitud y el aviso de confirmacion.',
   null, (now() - interval '5 days')::timestamptz, 45,
   'operaciones', (now() - interval '9 days')::timestamptz),

  ('00000000-0000-4000-8000-000000000706',
   '00000000-0000-4000-8000-0000000000c5', 'RTB-0005', null, 'correo',
   'Enviar la cotizacion de transferencias ajustada',
   'Ajustar el costo al volumen real que confirmo la gerencia financiera.',
   (now() + interval '1 day')::timestamptz, null, null,
   'ventas', (now() - interval '2 days')::timestamptz),

  -- Sin ruta: la cuenta apenas escribio una consulta y todavia no abrio ninguna de las tres.
  ('00000000-0000-4000-8000-000000000707',
   '00000000-0000-4000-8000-0000000000c9', null,
   '00000000-0000-4000-8000-000000000411', 'llamada',
   'Llamar a la persona que pregunto por TikTok',
   'Preguntar si el interes es para uso personal o para pagos de su negocio.',
   (now() + interval '4 hours')::timestamptz, null, null,
   'soporte', (now() - interval '6 hours')::timestamptz),

  ('00000000-0000-4000-8000-000000000708',
   '00000000-0000-4000-8000-0000000000c3', 'RTC-0002', null, 'tarea',
   'Clasificar el riesgo antes de dar de alta la cuenta',
   'La ruta C queda bloqueada mientras el reclamo este abierto y falte el beneficiario final.',
   (now() + interval '3 days')::timestamptz, null, null,
   'compliance', (now() - interval '1 day')::timestamptz)
) as v(id, client_id, route_code, conversation_id, type, title, body, due_at, done_at,
       duration_minutes, owner_role, created_at)
left join public.routes r on r.code = v.route_code
join lateral (
  select p.id
  from public.profiles p
  where p.role = v.owner_role::public.user_role and p.is_active
  order by p.created_at
  limit 1
) o on true
on conflict (id) do update set
  title = excluded.title,
  body = excluded.body,
  route_id = excluded.route_id,
  due_at = excluded.due_at,
  done_at = excluded.done_at,
  duration_minutes = excluded.duration_minutes,
  owner_id = excluded.owner_id;
-- agenda-del-equipo-lista

-- Segmentacion: una cuenta puede ser a la vez importadora, de La Paz y prioridad alta.
insert into public.tags (id, name, color)
values
  ('00000000-0000-4000-8000-000000000b01', 'Comercio exterior', '#0B1E36'),
  ('00000000-0000-4000-8000-000000000b02', 'Pago a proveedores', '#1E3653'),
  ('00000000-0000-4000-8000-000000000b03', 'Prioridad alta', '#F3D014'),
  ('00000000-0000-4000-8000-000000000b04', 'Riesgo documental', '#B42318'),
  ('00000000-0000-4000-8000-000000000b05', 'Seguimiento activo', '#1E3653')
on conflict (id) do update set name = excluded.name, color = excluded.color;

insert into public.client_tags (client_id, tag_id)
values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000b01'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000b05'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000b02'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000b03'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000b01'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000b04'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-000000000b02'),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-000000000b04'),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-000000000b01'),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-000000000b03')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 9. Reclamos del consumidor financiero y ruta C
-- ---------------------------------------------------------------------------

-- Tres reclamos en tres estados distintos. due_at queda vacio en el primero a proposito: el
-- plazo legal lo fija la normativa y Cumplimiento aun no lo confirmo, asi que no se inventa.
-- Es el caso que vw_claims_sla marca como sin_plazo_definido.
insert into public.claims
  (id, code, client_id, conversation_id, transaction_ref, category, status, summary,
   description, resolution, received_at, due_at, responded_at, asfi_ref, handler_id, created_by)
values
  ('00000000-0000-4000-8000-000000000801', 'RC-2026-0001',
   '00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000404', null,
   'atraso_respuesta', 'en_analisis',
   'Demora en la respuesta sobre la documentacion pendiente de vinculacion',
   'La empresa consulta el 8 de octubre y vuelve a escribir sin recibir respuesta. Reclama por el tiempo transcurrido y por el impacto en su pago al proveedor.',
   null, now() - interval '9 days', null, null, null,
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000802', 'RC-2026-0002',
   '00000000-0000-4000-8000-0000000000c2', null, null,
   'error_operacion', 'respondido',
   'Solicitud rechazada por un dato del beneficiario',
   'El cliente ingreso un beneficiario con el nombre abreviado y la solicitud quedo rechazada sin aviso claro. Pide que se explique el motivo.',
   'Se revalido el dato con el cliente y se le explico el campo que faltaba. Se abrio la correccion en la plataforma de pagos.',
   now() - interval '14 days', now() - interval '4 days', now() - interval '3 days', null,
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'soporte@avfinance.bo')),

  ('00000000-0000-4000-8000-000000000803', 'RC-2026-0003',
   '00000000-0000-4000-8000-0000000000c6', null, null,
   'cierre_servicio', 'cerrado',
   'Pedido de cierre de cuenta y baja de datos',
   'La clienta pide que se cierre su cuenta del entorno de prueba y se le confirme la baja.',
   'Cuenta dada de baja en el CRM del ECP y confirmacion enviada por correo el dia 7. No hay saldo pendiente.',
   now() - interval '20 days', now() - interval '6 days', now() - interval '7 days', null,
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'),
   (select p.id from public.profiles p where p.email = 'compliance@avfinance.bo'))
on conflict (id) do update set
  status = excluded.status,
  summary = excluded.summary,
  description = excluded.description,
  resolution = excluded.resolution,
  due_at = excluded.due_at,
  responded_at = excluded.responded_at,
  handler_id = excluded.handler_id;
-- reclamos-tres-estados

-- Ruta C: la ficha del Entorno Controlado de Pruebas ya no tiene tabla propia. El riesgo, el
-- tope por operacion, el cupo mensual y la fecha de revision viven en clients (seccion 2),
-- porque son datos de la cuenta y no un expediente paralelo: la Ficha 360 los lee de una sola
-- fila y el guardarrailes que reserva esa ficha a Cumplimiento se aplica sobre esa misma fila.
--
-- El consumo real del cupo lo administra la plataforma central de Alyto y no se copia en esta
-- base. tope_operacion_bs es una referencia del mismo tope que vive en ecp_parameters
-- (Bs 120.000 por operacion), y ecp_account queda vacio a proposito: ese numero lo entrega la
-- app de pagos cuando la cuenta se da de alta alli.

-- La senal de consulta sin responder apunta al hilo que la origino. Se resuelve aqui, y no en la
-- seccion 4, porque los hilos y sus mensajes se insertan despues.
update public.signals
   set conversation_id = '00000000-0000-4000-8000-000000000406'::uuid
 where id = '00000000-0000-4000-8000-000000000403'::uuid
   and conversation_id is null;

-- El registro (la bitacora de quien hizo que y cuando) no arranca vacio y muestra los tres tipos
-- de actor: una escritura del sistema, una deteccion de un agente y un intento humano rechazado
-- por un guardarrailes. La tabla no tiene una llave natural donde hacer un on conflict, asi que
-- cada asiento se protege con un not exists: sin esa traba, cada ejecucion agregaria filas.
insert into public.audit_events
  (actor, actor_kind, action, entity_type, entity_id, detail, outcome, created_at)
select v.actor, v.actor_kind::public.audit_actor_kind, v.action, v.entity_type, v.entity_id,
       v.detail, v.outcome::public.audit_outcome,
       (now() - v.hace::interval)::timestamptz
from (values
  ('sistema'::text, 'sistema'::text, 'semilla_aplicada', 'seed'::text, null::text,
   'Bandeja, senales, viajes, legajo, rutas y reclamos de demostracion cargados desde seed.sql',
   'exito'::text, '1 hour'::interval),

  ('agente-cumplimiento', 'agente', 'senal_detectada', 'signals',
   '00000000-0000-4000-8000-000000000401',
   'Documento de origen de fondos observado en Agroindustrial del Oriente S.A.',
   'exito', '4 days'),

  ('soporte@avfinance.bo', 'humano', 'mensaje_rechazado_por_glosario', 'messages', null,
   'El envio contenia una expresion vetada; el mensaje no salio y la cuenta fue avisada por otro canal.',
   'rechazado', '2 days')
) as v(actor, actor_kind, action, entity_type, entity_id, detail, outcome, hace)
where not exists (
  select 1 from public.audit_events a
  where a.action = v.action
    and a.entity_id is not distinct from v.entity_id
);
-- registro-tres-actores

-- ---------------------------------------------------------------------------
-- 10. Comprobaciones
-- ---------------------------------------------------------------------------

-- A proposito no hay una lista de conteos aqui: vive en verificacion.sql, que es el fichero que
-- se corre despues del sembrado y el unico que hay que cerrar en verde. Dos listas de conteos en
-- dos ficheros distintos se desalinean en cuanto se cambia el sembrado, y el desalineamiento no
-- lo detecta nadie.

-- ---------------------------------------------------------------------------
-- 11. Pruebas que deben fallar
-- ---------------------------------------------------------------------------
--
-- No hay recetas escritas a mano aca: viven en pruebas-negativas.sql, que es un fichero
-- ejecutable bloque por bloque y donde se agrego una traba nueva no se olvide de probarla. Dos
-- listas de pruebas en dos ficheros distintos se desalinean en cuanto se cambia el modelo, que es
-- exactamente el motivo por el que la seccion 10 tampoco lleva conteos.
--
-- Lo unico que pruebas-negativas.sql no puede cubrir es la traba de la ficha del Entorno
-- Controlado de Pruebas, y no por falta de ganas: el disparador
-- clients_ficha_solo_cumplimiento (0004) mira quien escribe, y el SQL Editor del panel corre sin
-- JWT, asi que current_user_id() devuelve vacio y la traba deja pasar por la excepcion que ella
-- misma documenta. La prueba real lleva token de usuario y se hace desde la interfaz:
--
--   update public.clients set riesgo = 'alto'
--   where id = '00000000-0000-4000-8000-0000000000c1';
--
--   Entrando como ventas u operaciones, esperado: error 'La ficha del Entorno Controlado de
--   Pruebas la mueve solo Cumplimiento'. Entrando como admin o compliance, esperado: la fila
--   cambia. Las ocho columnas que revisa son riesgo, tope, cupo, estado del usuario, estado del
--   legajo, fecha de revision y nota.
