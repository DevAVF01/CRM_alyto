# Plan de trabajo del CRM Alyto

Documento de parametrización. No es especificación de código ni bitácora: es el mapa de lo que se va a
construir, en qué orden y con qué criterio, para no volver a construir la cosa equivocada.

Actualizado el 2026-10-20. Fuentes: el encargo original con la pila técnica fija, el documento
`contexto_alyto_av_finance_s_r_l.md` del escritorio (las funcionalidades), y las correcciones de Álvaro
del 17/10.

---

## 1. Las dos capas del proyecto

Hay que dejar separadas dos cosas que antes se mezclaron.

**La estructura no cambia.** La pila y el árbol de carpetas son los del encargo original:

| Pieza | Tecnología |
| --- | --- |
| Interfaz | React 18 con Vite |
| Servidor | Node.js con Express 5 |
| Base de datos y autenticación | Supabase (PostgreSQL) |
| Notificaciones | Firebase con VAPID |
| Documentos | pdfkit y qrcode |
| Trazas y errores | Sentry y Winston |
| Despliegue | Docker y Nginx |
| Integración continua | GitHub Actions en `.github/workflows/` |
| Carpetas | `.github/ docker/ mcp/ agents/ skills/ backend/ frontend/` |
| Agentes | cumplimiento, pipeline, soporte |
| Habilidades reutilizables | generador de pdf, registro con Sentry, autenticación |

**El alcance funcional sí cambia.** Lo construido hasta ahora era un CRM de ventas con expediente de
cumplimiento. Lo que se pidió es un centro de atención omnicanal. El objeto principal deja de ser el
negocio y pasa a ser la conversación.

---

## 2. Criterio de construcción

El producto se construye completo y funcionando por dentro, con las integraciones externas detrás de una
interfaz de conector.

Ahora entra el conector de demostración, que genera datos realistas en la estructura exacta del canal
verdadero y quedan etiquetados como demostración. Cuando llegue la conexión real se cambia el conector,
no la pantalla.

| Canal | Hoy | Después |
| --- | --- | --- |
| WhatsApp Business | Conector de demostración. El número ya existe | API de Meta o el proveedor que se elija |
| Correo comercial | Conector de demostración | SMTP e IMAP |
| Chat dentro de la app y web de `alyto.io` | Conector de demostración | Endpoint propio de la plataforma |
| LinkedIn, Meta, TikTok | Conector de demostración de captura de leads | Webhooks de cada red |

Las operaciones de transferencia no son un conector del CRM. Pertenecen a la base de la app de pagos, que
va aparte por orden de Álvaro. En la Ficha 360 se muestran como bloque con etiqueta de origen, sin copiar
ni una columna en esta base.

Principio rector de las revisiones: **fallar hacia cerrado**. Si algo no está configurado, el sistema se
niega a arrancar o responde 503. Nunca finge que funciona.

---

## 3. Los tres objetos del dominio

**Conversación.** Un hilo por cliente y canal. Tiene estado, cola, agente asignado y vencimiento de nivel
de servicio. Es lo que se ve al abrir el CRM.

**Mensaje.** Cada entrada y salida dentro de una conversación. Tiene dirección, plantilla usada, si fue
automática o manual, y la advertencia del filtro de lenguaje cuando el texto toca un término prohibido.

**Rutas paralelas.** Un lead entrante avanza por tres vías simultáneas e independientes, no por un embudo
de seis pasos:

```
┌── [ RUTA A ] Validación KYC y documentación (legajo digital, cédula, NIT, poderes)
│
LEAD ──────── [ RUTA B ] Pipeline comercial B2B (reunión, cotización de transferencia)
│
└── [ RUTA C ] Control de riesgo y cupos del ECP
```

Encima de las tres, los cinco módulos del ciclo de vida: captura, validación, vinculación completada,
primera operación acompañada, y recurrencia.

---

## 4. Base de datos

Proyecto Supabase del CRM: `crm-alyto-ecp`, región São Paulo, URL `https://getrfpkybmqebxcpxhcn.subabase.co`.
Solo tablas de CRM. Nada de la app de pagos.

| Grupo | Tablas | Nota |
| --- | --- | --- |
| Personas | `profiles`, `clients`, `contacts` | `clients` queda reducido a ficha mínima |
| Conversación | `conversations`, `messages`, `routing_rules` | reemplazan a `communication_logs` |
| Automatización | `templates`, `cadence_templates`, `cadence_steps`, `cadence_enrollments`, `cadence_executions` | la secuencia de 14 días |
| Vinculación | `compliance_item_defs`, `compliance_items`, `documents`, `screenings` | las 8 casillas del legajo |
| Comercial | `deals`, `deal_stages`, `deal_events`, `activities`, `tags`, `client_tags` | la RUTA B |
| Reclamos y riesgo | `claims`, `client_ecp_profile`, `ecp_parameters` | RUTA C y consumo financiero |
| Gobernanza | `blocked_terms`, `audit_events` | el filtro de lenguaje y la bitácora inalterable |

Veintiséis tablas, 17 tipos enumerados, 18 funciones, 25 disparadores, 54 políticas de seguridad por
fila y 9 vistas. El almacen de archivos del legajo no es una tabla del CRM: es un cubo de
Supabase Storage que se crea desde el panel, porque `storage.objects` pertenece a un dueno interno.

Fuera del esquema: `transactions`, `custodial_wallets`, `ecp_daily_usage`.

Ficheros: `0001_identity_and_people`, `0002_conversations_and_messaging`,
`0003_cadences_onboarding_commercial_claims`, `0004_security_and_privileges`,
`0005_storage_bucket` (se ejecuta desde el panel, no desde el editor) y `0006_glossary_seed`.
Los cuatro ficheros anteriores a esta reescritura (`0001_identity_and_accounts`, `0002_crm_core`,
`0003_compliance_and_payments`, `0004_security_and_storage`) quedan huérfanos y hay que borrarlos
antes de ejecutar nada, para no aplicar dos veces el mismo esquema.

Reglas de modelado aplicadas en la reescritura:

1. Tercera forma normal. No se guarda nada derivable: ni totales, ni conteos, ni estados calculados.
   Se exponen por vista (`vw_compliance_progress`, `vw_funnel_by_stage`, `vw_stage_age`).
2. El actor de cada asiento sale de las declaraciones del JWT de la peticion
   (`current_setting('request.jwt.claims')`), nunca de una variable de sesion que nadie define.
3. El rol se lee de `app_metadata`, la bolsa que solo la llave de servicio puede escribir. El
   formulario de alta del panel de Auth no expone `app_metadata`, así que los cinco usuarios
   nacen con el rol por defecto (`soporte`) y la sección 0 del `seed.sql` los coloca en su rol.
4. Los valores por defecto que contradicen los parámetros del ECP se eliminan.
5. Campos de identificación nullable con formato validado, sin texto de relleno haciendo de dato.
6. Borrado lógico con columna de fecha de eliminación, sin política de borrado físico.

Convención de escritura del sistema. Dos tablas las mantiene únicamente un disparador:
`deal_events` (el historial del embudo) y `messages` (un mensaje enviado no se edita). El que
escriba por esas vías tiene que poner antes la marca de sistema:

```sql
select set_config('crm.system_write', 'on', true);
```

La marca vale solo para la transacción en curso. La capa de repositorio y el conector de
mensajería deben respetarla; un usuario desde la interfaz no puede ponerla porque no tiene
acceso directo a la conexión.

---

## 5. Pantallas

| Pantalla | Qué resuelve | Estado |
| --- | --- | --- |
| Acceso | Login con roles y sesión firmada | construida, falta conectar a Supabase Auth |
| Bandeja unificada | Lista de conversaciones con filtros, panel de hilo, composer con plantillas y bloqueo de términos | nueva, es la principal |
| Ficha 360 | Datos, legajo, historial de conversación, bloque de operaciones con etiqueta de origen | existe, hay que reorientarla |
| Rutas de vinculación | A, B y C en paralelo con los cinco módulos | nueva |
| Cadencias y plantillas | Banco de plantillas versionado y seguimiento de la secuencia | nueva |
| Reclamos y nivel de servicio | Registro, categorías, plazos y semáforo de las 2 horas | nueva |
| Cumplimiento y auditoría | Checklist, matriz de riesgo, historial inalterable | existe, se amplía |

El embudo de ventas deja de ser pantalla propia y vive dentro de Rutas de vinculación.

---

## 6. Reglas de negocio

**Cadencia B2B de 14 días.** Día 1 mensaje de presentación por WhatsApp o llamada. Día 2 correo con
resumen ejecutivo y enlace de agendamiento para 20 minutos. Día 4 mensaje corto y conexión en LinkedIn.
Día 7 video explicativo o material educativo. Día 10 correo formal con dos horarios concretos. Día 14
aviso de cierre de ciclo y el paso a "En pausa" o "No contactado".

**Nivel de servicio.** Alerta cuando un mensaje lleva 2 horas sin atención dentro del horario laboral.
Horario acordado: lunes a viernes de 09:00 a 17:00, hora de La Paz. Va en la fila de parámetros, no
quemado en el código, porque el usuario lo definió como aproximado.

**Filtro de términos prohibidos.** "Remesas", "exchange", "plataforma de inversión", y cualquier promesa
de licencia o autorización definitiva. El diccionario vive en la base, no en el código, para que
cumplimiento pueda ampliarlo sin desplegar.

**Plantillas.** Los tres textos literales del documento de contexto, incluidos en la respuesta
regulatoria que cierra con: "El ECP no constituye una autorización ni licencia definitiva."

**Clasificación de consulta para enrutamiento.** Soporte Técnico, Registro y KYC, Empresa B2B, Reclamos.

**Plazo legal de respuesta de reclamos.** Sin dato confirmado. Queda como campo obligatorio sin valor por
defecto hasta que Álvaro lo proporcione. No se inventa.

---

## 7. Roles

| Rol | Cola que atiende |
| --- | --- |
| administración | todo |
| soporte | bandeja, reclamos, catálogo de objeciones |
| operaciones | RUTA C, cupos, fichas |
| ventas | RUTA B, pipeline y expedientes en lectura |
| cumplimiento | legajo, dictámenes, matriz de riesgo, auditoría |

---

## 8. Lista de verificación de la Fase 2

Ejecuta en el editor de SQL del proyecto `getrfpkybmqebxcpxhcn`, un fichero por vez.

Los cuatro ficheros huérfanos ya están movidos a `backend/supabase/legacy/` (21/10), así que el
paso 1 está hecho. Para no copiar consultas a mano hay cuatro ficheros de ayuda en
`backend/supabase/`: `chequeos.sql` (los conteos y las dos consultas de verificación
recurrentes), `verificacion.sql` (las 19 comprobaciones del sembrado, extraídas del propio
`seed.sql`; se regenera con el `sed` de la lista), `pruebas-negativas.sql` (las cinco trabas,
ya descomentadas y con su limpieza) y `modelo.sql` (el esquema leído de la base en marcha:
tablas, columnas, claves ajenas, enums, vistas y disparadores).

| Paso | Qué se ejecuta | Qué debe salir |
| --- | --- | --- |
| 1 | Borrar los cuatro ficheros huérfanos de `backend/supabase/migrations/` | hecho el 21/10: `ls` muestra solo `0001_identity_and_people` a `0006_glossary_seed` |
| 2 | `0001` | `Success. No rows returned`. **Ya corrido el 21/10**, no repetirlo en la vía corta |
| 3 | conteo de tablas | `4` |
| 4 | prueba de horas hábiles | `3.00` |
| 5 | `0002` | conteo de tablas `9`. **Ya corrido, pero ver la nota de las dos funciones del 23/10** |
| 6 | `0003` | conteo de tablas `25` |
| 7 | `0004` | conteo de tablas `26` (suma `audit_events`), 54 políticas |
| 8 | `0006` | `select term, severity from public.blocked_terms` devuelve 10 filas, 7 de bloqueo |
| 9 | cubo `expedientes` desde el panel | **Hecho el 23/10**: 10 MB, privado, cinco tipos de archivo. Las dos políticas se crean en Storage → Files → **Policies** → sección **Schema** → New policy → *Create a policy from scratch* (el asistente de la sección Buckets no admite condiciones con funciones) |
| 10 | `backend/supabase/seed.sql` | **Hecho el 23/10**: `Success. No rows returned` |
| 11 | `verificacion.sql` | **Hecho el 23/10**: 19 filas, 17 con `ok = true` y las dos de perfiles en `0`, como tocaba |
| 12 | cinco usuarios de Auth en Authentication → Users → Add user (`admin@avfinance.bo` y los otros cuatro de `backend/src/data/demoAccounts.js`) | **Hecho el 23/10**: `profiles` pasó de 0 a 5, todos con rol `soporte` |
| 13 | volver a correr `seed.sql` (la sección 0 fija los roles, el resto rellena las atribuciones) | **Hecho el 26/10**, dos veces: una con la versión vieja del fichero (dejaba la cronología anclada al 23, defecto 9) y otra con la corregida |
| 14 | `verificacion.sql` otra vez | **Hecho el 26/10**: **19 filas con `ok = true`**. Es el control de la Fase 2 y está cerrado. Nota: el propio `seed.sql` termina con estas mismas 19 comprobaciones, así que correr el sembrado ya muestra la rejilla; `verificacion.sql` es la extracción de esa sección final para correrla sola |
| 15 | `pruebas-negativas.sql` bloque por bloque, en el orden del fichero | **Hecho el 26/10**: los nueve bloques, uno por vez con *Run selected*. Las cinco trabas rechazaron con el mensaje prometido (`23514` las dos de glosario y legajo, `42501` las tres de `denies_direct_write`), los cuatro bloques de escritura entraron, y los conteos dieron 18 y 17 |

### Cómo se aplicó al final: la vía corta bastó

El 23/10 se cerró sin tocar el esquema ya aplicado. `0001` y `0002` estaban corridos, `0002` había
cambiado después (las siete funciones con el `errcode` en minúsculas) y bastó con volver a pegar las
dos funciones que cambiaron: `0002_conversations_and_messaging.sql` líneas 75 a 104
(`block_prohibited_language`) y 198 a 217 (`check_message_channel`). Los disparadores apuntan a los
mismos nombres, así que pasan a la versión corregida sin crear nada. Después `0003`, `0004` y `0006`
en orden, con los conteos `25` y `26` entre medio.

El camino destructivo queda anotado por si hace falta rehacer la base definitiva (el viernes 30 se
decide la base):

```sql
drop schema public cascade;
create schema public;
alter schema public owner to postgres;
grant all on schema public to postgres, anon, authenticated, service_role;
```

`auth` y `storage` no se tocan: los usuarios de Auth y el cubo `expedientes` sobreviven. Sale
`Success` y el conteo de tablas vuelve a `0`. Correr `0001`, `0002`, `0003`, `0004` y `0006` en
orden, con los conteos `4`, `9`, `25`, `26` entre medio. Es destructivo sobre las tablas del
CRM: solo sirve mientras no haya trabajo real que perder, que es el caso hasta el 27/11.

### Los nueve defectos que aparecieron al ejecutar, y cómo se cerraron

Notas del 22/10, del 23/10 y del 26/10. Los cuatro primeros los devolvió el editor de Supabase o los sacó
la auditoría de orden entre ficheros; los cinco últimos salen solo cuando un PostgreSQL de verdad
**ejecuta** el código, o cuando el panel de Storage la compara contra la columna real:

- `0002` tenía la vista `vw_messages_flagged` declarada antes de la tabla `messages`. Una
  vista no puede consultar una tabla que todavía no existe (error `42P01`), así que la vista
  se movió al final del fichero, junto a `vw_inbox`.
- `0004` hacía `alter table public.audit_events enable row level security` en el bloque de
  arriba, pero la tabla nace más abajo en el mismo fichero. La línea se movió justo después
  del `create table`.
- `0002` llamaba a `conversation_sla_deadline(a.*)` pasando la fila de un CTE. La función
  estaba declarada con un parámetro de tipo `public.conversations`, así que PostgreSQL
  intentaba convertir aquella fila de ocho columnas en una fila de la tabla y reventaba con
  `42846: cannot cast type record to conversations`. La función ahora recibe un
  `timestamptz` (el último mensaje entrante) y la vista le pasa `a.last_inbound_at`. Un
  parámetro de tipo de tabla solo sirve para la fila completa y en el orden de la tabla.
- `0003` escribía `array['persona_natural', 'persona_juridica']` en la columna
  `applies_to public.account_type[]`, tanto en el `default` de la tabla como en los nueve
  valores del `insert`. Un array de literales es `text[]` y PostgreSQL lo rechaza con `42804`
  si no se le etiqueta: ahora todos llevan `::public.account_type[]`.
- `0003` declaraba `paso_anterior record` y escribía `select cs.day_number into
  paso_anterior.day_number`. PostgreSQL no permite asignar un campo de un `record` mientras la
  variable no haya recibido una fila completa, y el disparador reventaba con `record "..." is
  not assigned yet` **en el primer insert del sembrado**, no al crear la función. La variable
  ahora es un `smallint` a secas.
- Siete funciones de disparador usaban `using errcode = '...'` con el nombre en mayúsculas
  (`CHECK_VIOLATION`, `FOREIGN_KEY_VIOLATION`, `INSUFFICIENT_PRIVILEGE`). El buscador de
  condiciones de PostgreSQL no reconoce ninguno de esos escritos en mayúsculas: el rechazo salía
  con `unrecognized exception condition` en lugar del mensaje español que toca. Ahora los nombres
  van en minúsculas, que es como los acepta. Están en `block_prohibited_language`,
  `check_message_channel`, `check_message_automation`, `check_cadence_step_day_order`,
  `require_document_for_approval`, `denies_direct_write` y `block_audit_mutation`.
- `pruebas-negativas.sql` insertaba en `deal_events` cuatro columnas con tres valores, así que
  la prueba c) fallaba por el motivo equivocado. Corregida la fila de valores.
- La política de lectura del cubo comparaba `owner_id = public.current_user_id()`. El panel la
  rechazó al guardarla con `42883: operator does not exist: text = uuid`: en `storage.objects`
  la columna `owner_id` es `text`, mientras que la nuestra devuelve `uuid`. Hay que escribir
  `owner_id = (public.current_user_id())::text`. El simulador local tenía la columna declarada
  como `uuid`, y por eso nunca lo vio: **el `mock` tiene que llevar el tipo de la plataforma, no
  el cómodo.** Corregido en `harness.mjs` y en `0005`.
- El `seed.sql` no era repetible en el tiempo (nota del 26/10). Los mensajes entraban con
  `on conflict do nothing` y con `sent_at` calculado contra `now()`, así que la segunda pasada
  dejaba intacta la hora de la primera: correr el sembrado tres días después envejecía toda la
  cronología de demostración y `hilos_vencidos_de_fondo` de `verificacion.sql` pasó de 3 a 5 en
  el panel. El control fuera de línea no lo veía nunca, porque sus dos pasadas caen en el mismo
  instante. Se cerró con un bloque que recalcula el desfase y mueve los 42 mensajes juntos, en
  una sola sentencia `do` (la marca de sistema es local a la transacción, y un `set_config`
  suelto en la sentencia anterior ya no está cuando llega el `update`). El simulador ahora
  inyecta el salto de reloj antes de la segunda pasada, y `verificacion.sql` dejó de ser un
  informe: cualquier fila sin cerrar hace que el control salga con código de error.

Ninguno de los nueve se veía con un control de gramática: los cinco últimos son de semántica de
PostgreSQL y solo aparecen cuando la base de verdad ejecuta el objeto. Por eso el control ahora
es **ejecutar** (ver abajo), no leer.

El editor de SQL aplica todo lo pegado en una sola transacción: cuando una sentencia falla, no
queda nada del fichero aplicado. Por eso el conteo del paso 3 vuelve a servir para confirmar en
qué punto se está antes de seguir.

### Las dos decisiones de privilegios que se tomaron el 23/10

- `0004` cierra con un bloque explícito de permisos sobre las tablas. Supabase otorga
  `select`, `insert`, `update` y `delete` a `anon` y `authenticated` por detrás, sin que nadie
  lo escriba; de ese default depende que funcionen las vistas con `security_invoker` (el
  llamador necesita `select` también sobre la tabla de base). Ahora el fichero lo dice a las
  claras: `anon` no puede leer nada del CRM y `authenticated` puede leer. Fallar hacia cerrado
  también es que lo que no está otorgado no se pueda leer, aunque una política se equivoque.
- `0005` (el cubo) tenía la política de lectura solo para `admin`, `compliance` y
  `operaciones`, y la de subida para los cinco roles. Al subir desde ventas o soporte, el
  cliente de Storage pide la fila recién escrita y, como no podía leerla, la subida fallaba con
  `new row violates row-level security policy`. La lectura acepta ahora también al dueño del
  archivo: `owner_id = (public.current_user_id())::text`. En proyectos antiguos esa columna se
  llama `owner`; si el panel avisara de que no existe, cambiar el nombre en las dos políticas.
- Las dos políticas del cubo **no se pueden crear desde el SQL Editor**: `storage.objects` tiene
  un dueño interno de Supabase y la sentencia devuelve `must be owner of table objects` aunque
  quien ejecute sea el administrador del proyecto. Van por el panel, en la sección **Schema** de
  Storage → Files → Policies, con *Create a policy from scratch*. El asistente de la sección
  **Buckets** no sirve: escribe políticas por carpeta y no admite funciones en la condición.

### El control fuera de línea

En `Documents/Qoder/2026-10-13/647fe3c5/sqlcheck/` está `pglite.mjs`, que levanta un PostgreSQL
de verdad (PGlite: el motor compilado a WebAssembly, sin Docker), crea lo que en Supabase pone
la plataforma (los roles `anon` y `authenticated`, `auth.users`, `storage.objects`) y ejecuta el
esquema y el sembrado ficha por ficha. Se corre así:

```
node pglite.mjs "C:/Users/Denzel C/OneDrive/crm_project/crm_alyto/backend/supabase"
```

Lo que comprueba, en este orden: los cinco ficheros aplican sentencia por sentencia con los
conteos `4`, `9`, `25`, `26`; el alta simulada de los cinco usuarios de Auth dispara
`handle_new_user`; la segunda pasada del `seed.sql` alinea los roles; `verificacion.sql` sale con
las 19 filas en `true`; las nueve vistas se leen con el rol `authenticated` y con las
declaraciones de sesión puestas, y `anon` no lee ninguna; las dos políticas del cubo se prueban
por rol, lectura y subida; y los nueve bloques de `pruebas-negativas.sql` dan el resultado que
prometen, mensaje de error incluido.

Estado del control al 23/10: 259 sentencias aplicadas en la primera pasada y 287 con la segunda
del sembrado, 19 de 19 comprobaciones en `true`, 9 de 9 bloques negativos dando lo que prometen,
9 de 9 vistas legibles como usuario con sesión y ninguna como `anon`, y las dos políticas del cubo
comportándose rol por rol (admin, cumplimiento y operaciones ven los dos archivos de prueba;
ventas ninguno; soporte solo el suyo). Los cinco controles estáticos (gramática, orden de objetos,
columnas, enums,
anclas UUID y canales) siguen corriendo y no encuentran nada, salvo dos falsos positivos de
sombreado de alias en la sección 10.

En la misma carpeta está `erd.mjs`, que no comprueba nada: **vuelca el modelo desde la base
ejecutada**. Saca las 26 tablas con sus columnas y tipos, las 54 claves ajenas con su regla de
borrado, los 17 enums con sus valores, los 25 disparadores con su momento, las 9 vistas y los
54 permisos por fila. De ahí salió el `backend/supabase/DIAGRAMA.md` reescrito el 23/10, que ya
describe el CRM y no la aplicación de pagos.

```
node erd.mjs "C:/Users/Denzel C/OneDrive/crm_project/crm_alyto/backend/supabase"
```

Su equivalente dentro del panel es `backend/supabase/modelo.sql`: cuatro bloques de solo lectura
que leen `information_schema` y `pg_trigger` sobre la base en marcha. Conteos esperados, y con
eso se comprueba que lo que hay en el proyecto es lo que se diseñó: **26** tablas en el bloque A,
**369** columnas en el B, **54** claves ajenas en el C y **51** filas en el D (17 enums + 9 vistas
+ 25 disparadores).

La consulta del conteo (`BASE TABLE` excluye las vistas; sin ese filtro el número sube y no
significa nada):

```sql
select count(*) as tablas from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
```

La prueba de horario, que es la que más se puede romper en silencio:

```sql
select public.business_hours_between('2026-10-23 16:00:00-04', '2026-10-26 11:00:00-04') as horas_habiles;
```

Viernes 16:00 a lunes 11:00. Cuentan la hora del viernes y las dos del lunes. Si sale `67`, el
fin de semana no se está saltando y hay que revisar `dias_laborales` en `ecp_parameters`.

---

## 9. Orden de trabajo

| Fase | Entrega | Estado |
| --- | --- | --- |
| 0 | Este documento de parametrización | hecho |
| 1 | Reescritura del esquema: 0001 a 0004, más 0005 de almacenamiento y 0006 del diccionario | hecho |
| 2 | Ejecución de las migraciones en `crm-alyto-ecp` | pendiente |
| 3 | `seed.sql` de demostración con conversaciones creíbles en los cuatro canales | hecho |
| 4 | Capa de repositorio contra Supabase, con cliente por petición que lleva el JWT | pendiente |
| 5 | Interfaz de conector y conector de demostración de mensajes | pendiente |
| 6 | Rutas de API: conversaciones, mensajes, plantillas, cadencias, reclamos, guardarraíles | pendiente |
| 7 | Agentes: filtro de términos, enrutamiento y nivel de servicio, RUTA B | pendiente |
| 8 | Pantallas nuevas y reorientación de las existentes | pendiente |
| 9 | Notificaciones, pdf del legajo, código QR | pendiente |
| 10 | Docker, Nginx, integración continua y variables de entorno | la estructura existe, se ajusta |
| 11 | Pruebas unitarias, de integración y recorrido en vivo | parcial |
| 12 | Demostración del viernes 23 | mínimo: login |

---

## 10. Lo que hay que subsanar del trabajo anterior

- El repositorio sigue público y contiene material de cumplimiento del ECP.
- La tanda del 20/10 (sesiones firmadas, `DEMO_MODE`, guard de capa de datos) todavía no está confirmada
  en Git.
- Diez ficheros huérfanos por eliminar, dos hojas de estilo con nombres casi idénticos, dos ficheros de
  Compose, y un vocabulario de roles duplicado.
- Identificadores regulatorios inventados en los datos de demostración.
- El agente de cumplimiento tiene un tope de Bs 350.000 que contradice los Bs 120.000 reales.
- Ninguna consulta se ha ejecutado todavía contra la base: todo lo que corre lo hace en memoria.

---

## 11. Glosario

| Sigla | Significado completo |
| --- | --- |
| ASFI | Autoridad de Supervisión del Sistema Financiero, el regulador boliviano |
| ECP | Entorno Controlado de Pruebas: etapa supervisada de prueba con usuarios reales y condiciones controladas. No es autorización ni licencia definitiva |
| KYC | Know Your Customer, "conoce a tu cliente": verificación de identidad y documentación |
| AML | Anti-Money Laundering, contra el lavado de activos |
| NIT | Número de Identificación Tributaria |
| CI | Cédula de Identidad |
| B2B | Business to Business, empresa a empresa |
| SLA | Service Level Agreement, acuerdo de nivel de servicio |
| JWT | JSON Web Token: el token firmado que Supabase emite al iniciar sesión y viaja en cada petición |
| RLS | Row Level Security, seguridad a nivel de fila en PostgreSQL |
| HMAC | Hash-based Message Authentication Code: firma de mensajes con clave, usada en las sesiones |
| 3FN | Tercera forma normal: no guardar datos derivables de otros datos ya guardados |
| SMTP | Simple Mail Transfer Protocol, envío de correo |
| IMAP | Internet Message Access Protocol, lectura de correo |
| VAPID | Voluntary Application Server Identification, autenticación de notificaciones web |
| API | Application Programming Interface, la interfaz de un servicio |
| CRUD | Create, Read, Update, Delete: las cuatro operaciones básicas sobre un recurso |
| CI | En el contexto de herramientas: Continuous Integration, integración continua. No confundir con cédula de identidad |

---

## 12. Traza de decisiones y exclusiones de la auditoría

**Exclusiones del trabajo `brand-audit`** en `.github/workflows/ci.yml`. La auditoría recorre
todos los `.js .ts .json .sql .md .html .css` del proyecto y falla si aparece un término vetado.
Hay ficheros que citan esos términos **por trabajo**, y por eso están fuera:

| Fichero | Por qué está excluido |
| --- | --- |
| `frontend/src/utils/brandCopy.ts` | Define el glosario |
| `backend/src/middleware/brandLinterMiddleware.js` | Define el glosario |
| `agents/compliance-agent/rules.ts` | Define el glosario |
| `agents/support-ai-agent/objectionsCatalog.ts` | Define el glosario |
| `backend/supabase/migrations/0006_glossary_seed.sql` | Es el diccionario de la base |
| `PLAN.md` | Este documento, que nombra los términos al explicar la regla |
| `*.test.js`, `*.test.ts`, `*.test.tsx` | Las pruebas tienen que escribir el término para comprobar que se detecta |

Si se crea un fichero nuevo que cite el glosario, hay que añadirlo a `EXCLUDED` o la integración
continua falla de forma falsa.

**Decisiones de la Fase 1 que conviene tener a mano al comparar con el trabajo de Efraín:**

- El objeto central es la conversación, no el negocio. Un esquema centrado en `deals` con
  `stage 1..6` responde al alcance viejo.
- No hay ninguna tabla de operaciones, carteras ni uso diario en esta base.
- El tope de Bs 120.000 vive en `ecp_parameters` como referencia; el CRM no puede imponérselo a
  datos que no posee.
- El plazo legal de respuesta de reclamos está sin valor por defecto a propósito. No se inventó.
- Las etiquetas de las ocho casillas del legajo y de las seis etapas comerciales están en la
  base, no duplicadas en el código de la interfaz.
- El nivel de servicio se calcula en horas hábiles con tres funciones de PostgreSQL, no con un
  `now() + interval '2 hours'` que contaría el fin de semana.
