# Remodelación de la base del CRM

Documento de diseño. Aquí se decide qué va a haber en la base y si eso tiene sentido para el CRM
que estamos construyendo. No ejecuta nada: las migraciones se escriben después, cuando esto esté
discutido. El esquema hoy aplicado está descrito en `DIAGRAMA.md` y `modelo.sql`.

## 1. Para qué es esta base

Una frase que se puede usar de prueba: la base guarda **lo que pasó entre el equipo y un cliente, y
lo que el CRM decidió hacer solo**. No guarda plata. El dinero lo maneja la aplicación de pagos, que
ya funciona, y de aquí solo entran identificadores de referencia.

De esa frase se desprende todo lo demás. Si un dato describe dinero en movimiento, no va acá. Si
describe una conversación, una decisión de cumplimiento, un viaje automático o quién hizo qué, va
acá.

## 2. Las diez cajas

| Caja | Tablas | Qué guarda |
| --- | --- | --- |
| Personas | `profiles`, `clients`, `contacts` | El equipo con su rol, la empresa o persona cliente con su ficha ECP dentro, y las personas de esa empresa |
| Conversación | `conversations`, `messages` | El hilo por canal y cada mensaje con su estado de entrega |
| Viajes | `signals`, `journeys`, `journey_steps`, `journey_enrollments`, `journey_runs` | La señal que ocurrió, el viaje definido, sus pasos, quién está inscrito y qué se ejecutó |
| Configurar sin programar | `ecp_parameters`, `blocked_terms`, `routing_rules`, `document_requirements` | Límites y horarios, diccionario de marca, a dónde cae cada tipo de consulta y qué exige cada checklist |
| Mensajes escritos | `templates` | Los textos con versión, canal y aprobación de cumplimiento |
| Legajo | `documents`, `document_reviews`, `screenings` | El archivo, su revisión y los chequeos de listas |
| Rutas | `routes`, `route_events` | Las tres rutas en paralelo de un cliente y cada cambio de estado |
| Quehacer | `activities`, `tags`, `client_tags` | Llamadas, reuniones y tareas con su vencimiento, y las etiquetas |
| Reclamos | `claims` | El reclamo con su categoría, su semáforo y su plazo |
| Rastro | `audit_events` | Quién hizo qué y cuándo, inalterable |

Veinticinco tablas, contra las veintiséis de hoy. Las notas de diseño por caja están en la sección 4.

## 3. Qué se va, qué llega, qué se queda

**Se va (10):**

| Tabla que desaparece | Por qué | Dónde vive ahora |
| --- | --- | --- |
| `deals` | El negocio no es el objeto del CRM; la conversación lo reemplazó | `routes` con tipo B, y su volumen y frecuencia como detalle |
| `deal_stages` | Las seis etapas eran el embudo viejo | `routes.estado` |
| `deal_events` | Mismo motivo | `route_events` |
| `client_ecp_profile` | Era uno a uno con `clients`; cuatro saltos para leer una ficha | columnas de `clients`, escritas solo por cumplimiento |
| `cadence_templates` | Se llamaba plantilla y no lo era | `journeys` |
| `cadence_steps` | | `journey_steps` |
| `cadence_enrollments` | | `journey_enrollments` |
| `cadence_executions` | | `journey_runs` |
| `compliance_item_defs` | Nombre oscuro para lo que es un requisito | `document_requirements` |
| `compliance_items` | Nombre oscuro para lo que es una revisión | `document_reviews` |

**Llega (3):** `signals`, `routes`, `route_events`. Las dos primeras sustituyen al embudo y la
tercera es la pieza que faltaba: hoy no hay dónde anotar que algo ocurrió.

**Se queda igual (16):** `profiles`, `clients`, `contacts`, `conversations`, `messages`, `templates`,
`blocked_terms`, `routing_rules`, `ecp_parameters`, `documents`, `screenings`, `activities`, `tags`,
`client_tags`, `claims`, `audit_events`. Con retoques de columnas, sin cambiar de concepto.

## 4. Las decisiones de diseño, una por una

**Señales antes que viajes.** Una señal es un hecho: "a este contacto le faltan datos", "este
documento quedó observado", "esta consulta lleva dos horas sin respuesta". `signals` guarda el hecho
con la fila que lo originó y si ya fue consumida. Un viaje lee señales pendientes y produce pasos.
Sin esta tabla el motor tendría que deducir el estado del mundo cada vez, que es como se construyen
los duplicados. Con ella, repetir el viaje no manda dos veces el mismo mensaje.

**Viaje no es cadencia.** `cadence_templates` solo servía para la secuencia comercial de 14 días.
`journeys` sirve para las seis cadenas del catálogo, incluidas las que no son comerciales. Un viaje
define su señal disparadora, sus pasos, el canal y la plantilla de cada paso. Los seis pasos de la
cadencia B2B son un viaje más, no una entidad especial.

**Ficha en una fila.** El estado de vinculación KYC, el nivel de riesgo, el tope por operación y el
cupo mensual pasan a `clients`. Se mantiene la separación de permisos: cumplimiento escribe esos
campos y nadie más. Lo que se gana es directo: leer la ficha de un cliente es una fila.

**Rutas en paralelo, no embudo.** `routes` tiene una fila por ruta (A documentación, B comercial, C
riesgo y cupos) y por cliente, con estado, dueño y fechas. Las tres pueden estar abiertas a la vez,
que es lo que el producto pide, y el tablero se arma con una sola consulta. `route_events` anota cada
movimiento con su motivo, que es lo que hacía `deal_events`.

**Requisitos y revisiones separados, con nombre claro.** `document_requirements` es configuración:
qué hace falta y para quién. `document_reviews` es estado por cliente. Se llama requisitos y
revisiones porque eso es.

**Referencias a la plata, solo referencias.** `clients.payments_ref` y `claims.transaction_ref`
siguen siendo texto. Sirven para señalar una operación de la app de pagos sin copiarla. El origen
del dato se etiqueta en pantalla.

**Nada de datos reales de clientes.** Todas las filas de prueba son ficticias, con dominio
`.demo.bo`. El guardarraíl 9 del catálogo aplica a la base: no se cargan prospectos ni clientes
reales para probar.

## 5. La prueba de coherencia

El test es simple: cada funcionalidad del catálogo tiene dónde vivir, y cada tabla responde por al
menos una funcionalidad.

| Funcionalidad o viaje | Dónde vive |
| --- | --- |
| F-04 bandeja, F-05 hilo, F-06 responder | `conversations`, `messages` |
| F-07 canales y F-25 a F-27 salidas | `messages.canal` y `messages.estado`; el adaptador afuera de la base |
| F-08 nivel de servicio | `ecp_parameters` (horario y horas) y `vw_conversations_sla` |
| F-09 cadencia y los seis viajes | `signals`, `journeys`, `journey_steps`, `journey_enrollments`, `journey_runs` |
| F-10 plantillas versionadas | `templates` |
| F-11 filtro de términos | `blocked_terms` |
| F-12 y F-32 enrutado | `routing_rules` |
| F-13 reclamos | `claims` |
| F-14 debida diligencia | `document_requirements`, `document_reviews`, `screenings` |
| F-15 auditoría | `audit_events` |
| F-16 ficha 360 | `clients`, `contacts`, `routes`, `documents` |
| F-17 rutas paralelas | `routes`, `route_events` |
| F-18 y F-35 legajo y vencimientos | `documents` con `expires_on` |
| F-28 rastro de cada ejecución | `journey_runs` |
| F-29 asignar y traspasar | `conversations.assignee_id`, con su evento en `audit_events` |
| F-30 actividades | `activities` |
| F-31 etiquetas | `tags`, `client_tags` |
| F-34 métricas | las vistas, sobre todo lo anterior |
| F-38 fuera de horario | `ecp_parameters` |

Ninguna de las 25 tablas sobra: las diez que se van eran justamente las que no aparecían en esta
lista con un papel propio.

## 6. Vistas, seguridad y disparadores

**Las cuatro vistas que ya lee el código conservan su nombre** (`vw_inbox`, `vw_conversations_sla`,
`vw_cadence_pending`, `vw_claims_sla`) aunque cambien de tabla por dentro, para no mover
`backend/src/data/repository.js` ni sus pruebas. `vw_cadence_pending` pasa a leer `journey_runs`, y
en algún momento se renombrará a `vw_journey_pending` junto con el código, en su propio cambio.

**Entran tres vistas nuevas:** `vw_signals_open` (señales sin consumir), `vw_outbox_pending` (lo que
hay que enviar y no se pudo) y `vw_route_board` (las tres rutas de cada cliente en una fila).
`vw_funnel_by_stage` y `vw_stage_age` se transforman en `vw_routes_by_state` y `vw_route_age`.

**La seguridad se hereda entera:** las políticas por fila evaluadas con el rol efectivo
(`current_role_name()` sobre `profiles`), el disparador que impide editar o borrar la auditoría, la
prohibición de que un usuario se promocione de rol, las vistas con `security_invoker`, y el cubo de
archivos creado desde el panel porque `storage.objects` no es tabla del CRM.

**Tipos enumerados:** de 17 se pasa a unos 19. Salen `onboarding_stage` y `lost_reason`, entran
`signal_kind`, `route_kind` y `route_estado`. Se revisa cada uno contra los literales del catálogo.

## 7. Cómo se aplica

Rehacer desde cero sobre una base limpia, no `alter table` encima de lo aplicado. Los tres motivos:
el contenido es ficticio, el resultado se lee de una pasada, y el control fuera de línea lo verifica
antes de tocar el panel. Es la opción destructiva: borra el esquema aplicado el 26/10 y con él las
filas sembradas. El procedimiento con su orden está escrito en
`documentacion-interna/PLAN-notas-internas.md`, que no va al repositorio.

Secuencia y puertas de verificación:

1. Escribir el nuevo `modelo.sql` y las migraciones, con las cajas de la sección 2.
2. Correrlas fuera de línea contra `sqlcheck` con PGlite (PostgreSQL dentro de WebAssembly). Puerta:
   las comprobaciones nuevas en `true` y las negativas rechazadas.
3. Reescribir `seed.sql`: cinco perfiles con su rol, los viajes V-01 a V-06, las tres plantillas, las
   señales y las conversaciones de prueba. Puerta: los conteos esperados por vista.
4. Aplicar en el panel de Supabase, que corresponde a ti. Puerta: `verificacion.sql` en verde.
5. Correr el puente ya escrito (`npm run chequeo:datos`), que espera 13, 7, 2 y 3. Si los números
   cambian por el remodelado, se actualizan aquí y en `repository.js` en el mismo cambio.
6. Ajustar el código que nombraba tablas viejas: `store.js`, los tres agentes, la pantalla de embudo
   que pasa a ser de rutas, y las cifras de `README.md` y `DIAGRAMA.md`.

## 8. Lo que queda abierto

Tres cosas que no se resuelven escribiendo SQL, y una que sí hay que decidir antes del punto 1.

- **Decisión previa:** si dentro de la ruta B queda un registro de la oportunidad (tipo de operación,
  frecuencia, volumen mensual) o la ruta B es solo estado y fechas. Recomiendo conservarlo como
  detalle de `routes`: es información que el equipo ya carga hoy y cuesta poco.
- El plazo legal del reclamo, que deja `due_at` vacío hasta que Álvaro lo confirme.
- Qué señales existen de verdad en la operación. Las seis del catálogo son propuesta nuestra.
- El horario de atención, que vive en `ecp_parameters` y aún nadie confirmó.
