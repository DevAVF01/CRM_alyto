# Base de datos del CRM Alyto: diagrama completo y manual de funcionamiento

Supabase (PostgreSQL). Seis migraciones en `migrations/`, datos de arranque en `seed.sql`,
glosario en `0006`, comprobaciones en `chequeos.sql`, `verificacion.sql` y `pruebas-negativas.sql`.

Estado: **diseñado, ejecutado y verificado contra el proyecto `crm-alyto-ecp`** (23/10/2026).
Conteo de tablas en la base real: 4 tras `0001`, 9 tras `0002`, 25 tras `0003`, 26 tras `0004`.
`verificacion.sql` devuelve 19 chequeos y los 19 en `true`.

Inventario: **26 tablas propias + 3 de la plataforma** (`auth.users`, `storage.objects`,
`storage.buckets`), **17 enums**, **25 disparadores**, **20 funciones**, **9 vistas**,
**51 claves ajenas** (el inventario de `information_schema` las lista como 54 filas porque la
compuesta de `cadence_steps` aparece por cada par de columnas), **54 políticas RLS** sobre
`public` y **2** sobre `storage.objects`, más el cubo privado `expedientes`.

Cómo leer esto: la 1 es el inventario rápido, la 2 el mapa de relaciones, la 3 la ficha columna
por columna, la 4 los enums, la 5 las vistas, la 6 las reglas que impone la base, la 7 la
seguridad, la 8 el manual de uso, la 9 cómo se aplica y la 10 lo que falta.

> **No hay una sola tabla de pagos aquí.** La aplicación de transferencias tiene su propia base,
> por indicación expresa de Álvaro en la revisión del 17/10. El puente con ella son dos columnas
> de texto sin clave ajena: `clients.payments_ref` y `claims.transaction_ref`. Guardan el
> identificador del otro sistema, no copian sus datos.

---

## 1. Inventario: qué es cada tabla, en una frase

| # | Tabla | Qué es | Quién la escribe |
| --- | --- | --- | --- |
| 1 | `auth.users` | Cuenta de acceso: correo y contraseña. Es de Supabase, no nuestra | Supabase Auth |
| 2 | `profiles` | El rol real de ese usuario, su nombre y sus equipos | El disparador de alta; el rol lo fija la sección 0 del `seed.sql`; después solo administración |
| 3 | `clients` | **La cuenta atendida.** El centro del modelo | Ventas, operaciones, cumplimiento, y el conector de captura web |
| 4 | `ecp_parameters` | Los topes del Entorno Controlado de Pruebas y el horario del nivel de servicio. Una fila | Administración |
| 5 | `contacts` | Las personas dentro de esa cuenta | Ventas, soporte, operaciones |
| 6 | `blocked_terms` | El glosario de marca: lo que no se puede escribir | Cumplimiento |
| 7 | `templates` | Mensajes preaprobados, con código y versión | Cumplimiento aprueba; los demás leen |
| 8 | `routing_rules` | Qué cola y qué rol recibe cada tipo de consulta | Administración |
| 9 | `conversations` | Un hilo por canal: categoría, estado, asignado, contadores | El conector del canal (entrante), el agente de soporte, y reasignan operaciones y soporte |
| 10 | `messages` | Cada mensaje, entrante o saliente, con su estado de entrega | El conector, el agente y el usuario. Inmutable una vez escrito |
| 11 | `cadence_templates` | La cadencia comercial de 14 días | Administración |
| 12 | `cadence_steps` | Los 6 pasos de la cadencia: día, canal, plantilla | Administración |
| 13 | `cadence_enrollments` | Qué cuenta está dentro de qué cadencia | Ventas y operaciones al inscribir |
| 14 | `cadence_executions` | Qué paso tocaba, cuándo se intentó, si falló | Solo el agente de cadencia |
| 15 | `compliance_item_defs` | El catálogo de casillas del legajo KYC | Administración |
| 16 | `compliance_items` | El estado de cada casilla de cada cuenta (ruta A) | Cumplimiento y administración |
| 17 | `documents` | La ficha de un archivo subido: revisión y caducidad | Cualquiera del equipo sube; revisa cumplimiento |
| 18 | `screenings` | El paso por listas restrictivas, con su resultado | El conector KYC, con llave de servicio |
| 19 | `deal_stages` | Las etapas del embudo | Administración |
| 20 | `deals` | El negocio en curso (ruta B): volumen, etapa, responsable | Ventas y operaciones |
| 21 | `deal_events` | Historia de cada movimiento de etapa | Solo el disparador |
| 22 | `activities` | Llamadas, reuniones, tareas y notas con dueño y vencimiento | Los cinco roles |
| 23 | `tags` | Etiquetas de trabajo | Ventas y administración |
| 24 | `client_tags` | Qué etiqueta tiene cada cuenta | Los cinco roles |
| 25 | `claims` | Reclamo financiero de consumidor, con su plazo | Soporte y operaciones abren; resuelve cumplimiento |
| 26 | `client_ecp_profile` | Tope en bolivianos, cupo y riesgo de la cuenta (ruta C) | Operaciones y cumplimiento |
| 27 | `audit_events` | Prueba de quién hizo qué y cuándo. **Inmutable** | Todos, por inserción. Nadie lo edita |
| 28 | `storage.objects` | Los archivos físicos del cubo `expedientes`. Son de Supabase | Cuatro roles, por subida |

Las 26 tablas propias son las de la lista menos `auth.users` y `storage.objects`.

---

## 2. Mapa de relaciones

Una idea ordena todo: **la cuenta (`clients`) es el centro, y lo demás son satélites suyos o
trabajo alrededor de ella.** Las dos tablas que no cuelgan de una cuenta son la auditoría, que
cuelga de todo lo demás, y las de configuración global, que no cuelgan de nada.

```
   auth.users
        | 1:1, disparador on_auth_user_created
        v
   profiles <---- 17 columnas de "quien" apuntan aqui desde 13 tablas
        |              (dueno de la cuenta, asignado del hilo, gestor del reclamo,
        |               quien reviso, quien subio, quien envio, quien cotejo,
        |               quien movio la casilla, quien inscribio, actor del asiento)
        v
   ecp_parameters ----> CLIENTS <---- el expediente vivo, el centro del CRM
                                |
     +----------+----------+----+----+-----------+-----------+-----------+
     v          v          v         v           v           v           v
  contacts    deals   activities  documents  compliance_  screenings  client_tags
     |          |        ^  ^        |         items                      |
     |          |        |  |        v                                   tags
     |          |     conversations  |                          client_ecp_profile
     |          |        |                                        (ruta C, 1:1)
     |          v        v
     |      deal_events  messages <---- cadence_executions
     |                                        ^
     +-----> conversations                cadence_steps <--- cadence_templates
                                                 ^
                                           cadence_enrollments
                                                 |
                                              clients

   claims ----> clients, conversations, profiles
   routing_rules, blocked_terms, templates, deal_stages, compliance_item_defs,
   cadence_templates, ecp_parameters, audit_events: sin padre, son globales o transversales

   documents -.-> storage.objects   (logica: bucket_id + ruta, no clave ajena)
   clients.payments_ref -.-> LA OTRA BASE (texto, sin restriccion)
```

### Las 51 claves ajenas, todas

`>>` cascada (se borra el hijo con el padre) · `>|` puesto a vacío (el hijo sobrevive) ·
`XR` prohibido borrar el padre mientras existan hijos.

| Hijo.columna | Padre | Borrado |
| --- | --- | --- |
| `profiles.id` | `auth.users.id` | `>>` |
| `clients.owner_id` | `profiles.id` | `>|` |
| `contacts.client_id` | `clients.id` | `>>` |
| `conversations.client_id` | `clients.id` | `>>` |
| `conversations.contact_id` | `contacts.id` | `>|` |
| `conversations.assignee_id` | `profiles.id` | `>|` |
| `messages.conversation_id` | `conversations.id` | `>>` |
| `messages.template_id` | `templates.id` | `>|` |
| `messages.cadence_execution_id` | `cadence_executions.id` | `>|` |
| `messages.sent_by` | `profiles.id` | `>|` |
| `activities.client_id` | `clients.id` | `>>` |
| `activities.deal_id` | `deals.id` | `>|` |
| `activities.contact_id` | `contacts.id` | `>|` |
| `activities.conversation_id` | `conversations.id` | `>|` |
| `activities.owner_id` | `profiles.id` | **XR** |
| `activities.created_by` | `profiles.id` | `>|` |
| `documents.client_id` | `clients.id` | `>>` |
| `documents.checklist_item_key` | `compliance_item_defs.item_key` | `>|` |
| `documents.uploaded_by` | `profiles.id` | `>|` |
| `documents.reviewed_by` | `profiles.id` | `>|` |
| `compliance_items.client_id` | `clients.id` | `>>` |
| `compliance_items.item_key` | `compliance_item_defs.item_key` | sin acción |
| `compliance_items.reviewed_by` | `profiles.id` | `>|` |
| `compliance_items.updated_by` | `profiles.id` | `>|` |
| `client_ecp_profile.client_id` | `clients.id` | `>>` |
| `client_tags.client_id` | `clients.id` | `>>` |
| `client_tags.tag_id` | `tags.id` | `>>` |
| `screenings.client_id` | `clients.id` | `>>` |
| `screenings.contact_id` | `contacts.id` | `>>` |
| `screenings.screened_by` | `profiles.id` | `>|` |
| `deals.client_id` | `clients.id` | `>>` |
| `deals.stage` | `deal_stages.stage` | sin acción |
| `deals.owner_id` | `profiles.id` | `>|` |
| `deal_events.deal_id` | `deals.id` | `>>` |
| `deal_events.from_stage` | `deal_stages.stage` | sin acción |
| `deal_events.to_stage` | `deal_stages.stage` | sin acción |
| `deal_events.actor_id` | `profiles.id` | `>|` |
| `claims.client_id` | `clients.id` | sin acción |
| `claims.conversation_id` | `conversations.id` | `>|` |
| `claims.handler_id` | `profiles.id` | `>|` |
| `claims.created_by` | `profiles.id` | `>|` |
| `cadence_enrollments.cadence_template_id` | `cadence_templates.id` | sin acción |
| `cadence_enrollments.client_id` | `clients.id` | `>>` |
| `cadence_enrollments.contact_id` | `contacts.id` | `>|` |
| `cadence_enrollments.created_by` | `profiles.id` | `>|` |
| `cadence_steps.cadence_template_id` | `cadence_templates.id` | `>>` |
| `cadence_steps.(template_code, template_version)` | `templates.(code, version)` | sin acción |
| `cadence_executions.enrollment_id` | `cadence_enrollments.id` | `>>` |
| `cadence_executions.cadence_step_id` | `cadence_steps.id` | sin acción |
| `templates.approved_by` | `profiles.id` | `>|` |
| `audit_events.actor_id` | `profiles.id` | `>|` |

Grados: `clients` participa en 12 relaciones (11 como padre, 1 como hijo de `profiles`),
`profiles` en 18 (una como hijo de `auth.users` y 17 como padre). Son las dos entidades de mayor
grado y por eso las dos que hay que proteger primero. `routing_rules.route_to_role` parece una
clave ajena y no lo es: apunta al enum `user_role`, que es un tipo, no una tabla.

### Relaciones que no son una columna, sino un disparador

| Disparador | Une | Qué hace |
| --- | --- | --- |
| `on_auth_user_created` | `auth.users` → `profiles` | Al nacer un usuario, crea su perfil |
| `clients_compliance_template` | `clients` → `compliance_items` | Al nacer una cuenta, siembra sus casillas del legajo |
| `deals_stage_change` | `deals` → `deal_events` | Anota cada cambio de etapa, con quién y por qué |
| `messages_sync_conversation` | `messages` → `conversations` | Mantiene `messages_count` y las cuatro fechas del hilo |
| `compliance_items_need_document` | `documents` → `compliance_items` | Impide aprobar una casilla que exige documento sin archivo vigente |
| `documents -.-> storage.objects` | la ruta del archivo | La sostiene `storage_bucket` + `storage_path` y las dos políticas del cubo |

---

## 3. Ficha de cada tabla

Banderas: **PK** clave primaria, **FK** clave ajena, **U** valor único, **NN** obligatorio.
`tstz` = `timestamptz` (fecha con hora y zona), `[]` = array.

### 3.1 Identidad y personas (`0001`)

```
profiles
  id            uuid        PK FK >> auth.users   NN
  email         text        U  NN
  role          user_role   NN  default 'soporte'
  display_name  text        NN  default ''
  phone_e164    text
  teams         text[]      NN  default '{}'
  is_active     boolean     NN  default true
  created_at    tstz        NN
  updated_at    tstz        NN  touch_updated_at
```

Por qué existe: `auth.users` solo sabe correo y contraseña. El rol vive aquí, y lo leen tanto el
backend como las 54 políticas RLS. Sin fila en `profiles`, un usuario inicia sesión y no ve nada.

El valor por defecto `'soporte'` no es un descuido: el alta del panel no puede escribir
`app_metadata`, que es la bolsa de donde el disparador leería el rol declarado (solo la llave de
servicio la toca, y por eso no puede venir del navegador). La sección 0 del `seed.sql` es la que
reparte el rol correcto por correo en la segunda pasada.

```
ecp_parameters                                    (una sola fila, check id = 1)
  id                          smallint  PK NN
  usuarios_por_dia            integer   NN
  operaciones_por_dia         integer   NN
  monto_maximo_operacion_bs   numeric   NN
  duracion_maxima_ecp_meses   integer   NN
  estado_autorizacion         text      NN
  sla_horas_sin_atencion      numeric   NN  (las 2 horas del nivel de servicio)
  horario_atencion_inicio     time      NN  (09:00)
  horario_atencion_fin        time      NN  (17:00)
  dias_laborales              smallint[] NN (1,2,3,4,5)
  zona_horaria                text      NN  (America/La_Paz)
  dominio_corporativo         text      NN
  updated_at                  tstz      NN
```

El horario del nivel de servicio está aquí y no quemado en el código porque el usuario lo definió
como "aproximadamente". Cambiarlo es un `update` de una fila, no una liberación.

```
clients                                            << EL CENTRO >>
  id               uuid        PK                 NN
  account_type     account_type NN  default 'persona_juridica'
  display_name     text        NN
  legal_name       text
  ci               text                           (cédula de identidad, persona natural)
  nit              text
  email            text
  phone_e164       text                           E.164: +59170012345
  company_name     text
  city             text
  sector           text
  source           text                           referido | alyto.io | evento | redes
  onboarding_stage onboarding_stage NN            (ruta A)
  payments_ref     text                           puente con la base de pagos, sin FK
  owner_id         uuid        FK >| profiles
  last_activity_at tstz
  created_at       tstz        NN
  updated_at       tstz        NN  touch_updated_at
  deleted_at       tstz                           borrado logico
```

`ci` y `nit` separados porque la cuenta puede ser persona natural o jurídica, y el expediente de
persona natural se quedó sin documento en el diseño anterior.

```
contacts
  id                uuid       PK                 NN
  client_id         uuid       FK >> clients      NN
  full_name         text       NN
  role_title        text
  email             text
  phone_e164        text
  is_primary        boolean    NN  default false
  is_decision_maker boolean    NN  default false
  notes             text
  created_at / updated_at tstz NN
  deleted_at        tstz
```

Un solo `is_primary` verdadero por cuenta, y el par cuenta + nombre no se repite: eso permite
reejecutar el sembrado sin duplicar personas.

### 3.2 Bandeja omnicanal (`0002`)

```
blocked_terms
  id          smallint  PK                        NN
  term        text      U  NN
  severity    text      NN                        bloqueo | advertencia
  suggestion  text      NN                        la forma correcta de decirlo
  reason      text      NN
  is_active   boolean   NN  default true
  created_at  tstz      NN
```

`severity = 'bloqueo'` hace que el disparador rechace el mensaje. `'advertencia'` lo deja pasar y
lo marca en `vw_messages_flagged`. Son 7 de bloqueo y 3 de advertencia.

```
templates
  id            uuid       PK                     NN
  code          text       NN  \ unico conjunto
  version       smallint   NN  / (code, version)
  name          text       NN
  channel       channel_kind
  subject       text
  body          text       NN
  variables     text[]     NN  default '{}'
  approved_by   uuid       FK >| profiles
  approved_at   tstz
  is_active     boolean    NN  default true
  created_at / updated_at tstz NN
  deleted_at    tstz
```

Versionado porque una plantilla aprobada por cumplimiento no se edita: se retira y nace la
versión 2. Así un mensaje enviado hace tres meses se puede reproducir tal cual salió.

```
routing_rules
  id             smallint  PK                     NN
  query_category query_category NN
  queue          text       NN
  route_to_role  user_role  NN
  priority       smallint   NN
  is_active      boolean    NN  default true
  created_at     tstz       NN
```

```
conversations
  id               uuid       PK                  NN
  client_id        uuid       FK >> clients       NN
  contact_id       uuid       FK >| contacts
  channel          channel_kind NN
  channel_conv_id  text                            el id que usa el canal externo
  subject          text
  query_category   query_category NN
  queue            text       NN
  status           conversation_status NN
  assignee_id      uuid       FK >| profiles
  priority         smallint   NN  default 3
  first_inbound_at tstz
  last_inbound_at  tstz
  last_outbound_at tstz
  last_message_at  tstz
  messages_count   integer    NN  default 0       lo lleva el disparador
  resolved_at      tstz
  created_at / updated_at tstz NN
  deleted_at       tstz
```

`channel_conv_id` es lo que permite que el mismo hilo sobreviva a la reconexión del canal: es la
clave natural del lado de WhatsApp, de Meta o de LinkedIn, no la nuestra.

```
messages
  id                   uuid       PK              NN
  conversation_id      uuid       FK >> conv.     NN
  direction            message_direction NN
  channel              channel_kind NN            debe coincidir con el del hilo
  body                 text       NN
  sender_label         text                       quien lo dice, si no esta en el CRM
  template_id          uuid       FK >| templates
  automated            boolean    NN  default false
  cadence_execution_id uuid       FK >| cadence_executions
  external_msg_id      text
  status               message_status NN
  sent_by              uuid       FK >| profiles
  sent_at              tstz       NN
  created_at           tstz       NN
```

Tres reglas duras sobre esta tabla, las tres por disparador: el canal del mensaje tiene que ser
el del hilo, un mensaje marcado como automático no puede tener `sent_by` de persona, y después de
escrito no se edita ni se borra. Más el filtro del glosario sobre `body`.

### 3.3 Cadencia, alta, comercial y reclamos (`0003`)

```
cadence_templates
  id          uuid  PK                            NN
  name        text  NN
  audience    cadence_audience NN
  is_active   boolean NN default true
  created_at / updated_at tstz NN      deleted_at tstz

cadence_steps
  id                  uuid     PK                 NN
  cadence_template_id uuid     FK >> cadence_templates NN
  step_order          smallint NN                 1..6, sin huecos
  day_number          smallint NN                 dia del ciclo de 14 dias
  channel             channel_kind NN
  template_code       text     NN  \ FK compuesta
  template_version    smallint NN  / a templates(code, version)
  description         text
  created_at          tstz     NN
```

El disparador `cadence_steps_day_order` rechaza un paso cuyo `day_number` no caiga después del
paso anterior. Sin él, una cadencia puede mandar el "último aviso" el día 2 y el "primer
contacto" el día 9, y nadie se entera hasta que un cliente lo reclama.

```
cadence_enrollments
  id                  uuid     PK                 NN
  cadence_template_id uuid     FK cadence_templates NN
  client_id           uuid     FK >> clients      NN
  contact_id          uuid     FK >| contacts
  status              cadence_enrollment_status NN default 'activa'
  started_at          tstz     NN
  finished_at         tstz
  final_outcome       text
  created_by          uuid     FK >| profiles
  created_at / updated_at tstz NN

cadence_executions
  id               uuid     PK                    NN
  enrollment_id    uuid     FK >> enrollments     NN
  cadence_step_id  uuid     FK cadence_steps      NN
  scheduled_for    tstz     NN
  status           cadence_step_status NN default 'pendiente'
  attempted_at     tstz
  sent_at          tstz
  error            text
  created_at       tstz     NN
```

Una fila de `cadence_executions` por paso y por inscripción: es lo que hace la cadencia
recuperable. Si el agente se cae a mitad, las pendientes siguen ahí y `vw_cadence_pending` dice
qué falta.

```
compliance_item_defs
  item_key          text     PK                   NN
  label             text     NN
  description       text
  document_required boolean  NN  default false
  applies_to        account_type[] NN
  order_index       smallint NN
  is_active         boolean  NN  default true

compliance_items
  client_id    uuid     PK FK >> clients          NN
  item_key     text     PK FK compliance_item_defs NN
  status       kyc_status NN default 'Pendiente'
  detail       text
  reviewed_by  uuid     FK >| profiles
  reviewed_at  tstz
  updated_by   uuid     FK >| profiles
  created_at / updated_at tstz NN
```

Entidad débil: la casilla no existe sin cuenta, por eso la clave primaria es compuesta. Nace
sola, sembrada por el disparador `clients_compliance_template`. El sembrado del legajo produce
60 casillas para las 9 cuentas del escenario de demostración.

```
documents
  id                 uuid     PK                  NN
  client_id          uuid     FK >> clients       NN
  checklist_item_key text     FK >| compliance_item_defs
  filename           text     NN
  storage_bucket     text
  storage_path       text
  mime_type          text
  size_bytes         integer
  checksum           text
  review_status      document_review_status NN default 'Pendiente'
  expires_on         date
  uploaded_by        uuid     FK >| profiles
  reviewed_by        uuid     FK >| profiles
  reviewed_at        tstz
  created_at / updated_at tstz NN
  deleted_at         tstz
```

El archivo no está aquí, está en `storage.objects`. `expires_on` existe porque un poder o una
matrícula vencida no puede contar como documento válido.

```
screenings
  id           uuid     PK                        NN
  client_id    uuid     FK >> clients
  contact_id   uuid     FK >> contacts
  list_name    text     NN
  subject      text     NN
  result       text     NN
  detail       text
  screened_by  uuid     FK >| profiles
  created_at   tstz     NN
```

```
deal_stages
  stage       smallint  PK                        NN
  label       text      NN
  order_index smallint  NN

deals
  id                uuid     PK                   NN
  code              text     U  NN                visible: NEG-...
  client_id         uuid     FK >> clients        NN
  stage             smallint FK deal_stages       NN
  deal_type         text     NN
  frequency         text
  monthly_volume    numeric  NN  default 0
  next_step         text
  expected_close_on date
  lost_reason       lost_reason
  owner_id          uuid     FK >| profiles
  created_at / updated_at tstz NN
  deleted_at        tstz

deal_events
  id          bigint   PK identity                NN
  deal_id     uuid     FK >> deals                NN
  from_stage  smallint FK >| deal_stages
  to_stage    smallint FK deal_stages             NN
  actor_id    uuid     FK >| profiles
  actor_email text     NN
  reason      text
  created_at  tstz     NN
```

`from_stage` vacío significa alta de la oportunidad. `actor_email` se guarda aunque exista
`actor_id`: si la persona del equipo se va y su perfil se borra, el asiento conserva quién fue.
Solo escribe el disparador `deals_stage_change`; el intento de escritura directa lo rechaza
`deal_events_no_direct_write`.

```
activities
  id               uuid     PK                    NN
  client_id        uuid     FK >> clients         NN
  deal_id          uuid     FK >| deals
  contact_id       uuid     FK >| contacts
  conversation_id  uuid     FK >| conversations
  type             activity_type NN
  title            text     NN
  body             text
  due_at           tstz
  done_at          tstz
  duration_minutes integer
  owner_id         uuid     FK XR profiles        NN
  participants     uuid[]   NN  default '{}'
  created_by       uuid     FK >| profiles
  created_at / updated_at tstz NN
  deleted_at       tstz
```

`XR` (*restrict*) en `owner_id` es deliberado: una tarea necesita responsable, y borrar a una
persona del equipo con tareas abiertas está prohibido hasta que se reasignen. Es la única
restricción de ese tipo en todo el esquema.

```
tags
  id         uuid     PK                          NN
  name       text     U  NN
  color      text     NN
  created_at tstz     NN

client_tags
  client_id  uuid     PK FK >> clients            NN
  tag_id     uuid     PK FK >> tags               NN
  created_at tstz     NN
```

```
claims
  id               uuid     PK                    NN
  code             text     U  NN                 visible: REC-...
  client_id        uuid     FK clients             NN
  conversation_id  uuid     FK >| conversations
  transaction_ref  text                            puente con la base de pagos
  category         claim_category NN
  status           claim_status   NN default 'recibido'
  summary          text     NN
  description      text
  resolution       text
  received_at      tstz     NN
  due_at           tstz                            plazo legal, configurable
  responded_at     tstz
  asfi_ref         text
  handler_id       uuid     FK >| profiles
  created_by       uuid     FK >| profiles
  created_at / updated_at tstz NN
  deleted_at       tstz
```

`due_at` se deja en `null` a propósito: el plazo legal de respuesta de un reclamo no está
confirmado, y un sistema que inventa un plazo para un regulador miente con buena letra.
`vw_claims_sla` tiene una columna `sin_plazo_definido` para que ese hueco sea visible.

```
client_ecp_profile
  client_id                uuid     PK FK >> clients NN
  usuario_alta_ecp         text
  estado_usuario           text     NN
  tope_operacion_bs        numeric
  cupo_mensual_operaciones integer
  riesgo                   text     NN
  revisado_en              date
  nota                     text
  created_at / updated_at  tstz     NN
```

Uno a uno con `clients`: es la ruta C (riesgo y cupos del ECP) pegada a la cuenta.

### 3.4 Auditoría (`0004`)

```
audit_events
  id          bigint   PK identity                NN
  actor       text     NN                         correo, siempre, aunque se vaya la persona
  actor_id    uuid     FK >| profiles
  action      text     NN
  detail      text
  entity_type text
  entity_id   text
  trace_id    text
  created_at  tstz     NN
```

Sin claves ajenas salientes y con `entity_type` + `entity_id`: es una referencia polimórfica
deliberada. Un asiento tiene que poder hablar de un mensaje, de una plantilla o de un usuario sin
que la base obligue a elegir una tabla. Doble candado contra la reescritura: los permisos
`UPDATE` y `DELETE` revocados, más el disparador `audit_events_no_update`.

---

## 4. Los 17 enums

| Enum | Valores | Dónde |
| --- | --- | --- |
| `user_role` | admin, compliance, operaciones, ventas, soporte | `profiles`, `routing_rules`, y todas las políticas RLS |
| `account_type` | persona_natural, persona_juridica | `clients`, `compliance_item_defs.applies_to` |
| `onboarding_stage` | Lead capturado, Validacion KYC, Vinculacion completada, Primera operacion, Recurrencia | `clients` |
| `channel_kind` | whatsapp, correo, chat_app, web_chat, linkedin, meta, tiktok, formulario, telefonica, interno | `conversations`, `messages`, `templates`, `cadence_steps` |
| `query_category` | soporte_tecnico, registro_kyc, empresa_b2b, reclamo, consulta_saldo, otro | `conversations`, `routing_rules` |
| `conversation_status` | abierta, en_espera_cliente, en_espera_agente, resuelta, cerrada, spam | `conversations` |
| `message_direction` | entrante, saliente | `messages` |
| `message_status` | recibido, enviado, entregado, leido, fallido | `messages` |
| `cadence_audience` | persona_natural, persona_juridica | `cadence_templates` |
| `cadence_enrollment_status` | activa, pausada, convertida, cerrada, cancelada | `cadence_enrollments` |
| `cadence_step_status` | pendiente, enviado, fallido, cancelado, omitido | `cadence_executions` |
| `kyc_status` | Pendiente, En revision, Aprobado, Observado, Rechazado | `compliance_items` |
| `document_review_status` | Pendiente, En revision, Aprobado, Observado | `documents` |
| `activity_type` | llamada, reunion, visita, correo, tarea, nota | `activities` |
| `lost_reason` | precio, plazo, proveedor_actual, sin_presupuesto, sin_decision, no_responde, otro | `deals` |
| `claim_category` | atraso_respuesta, error_operacion, cobro_indebido, cierre_servicio, incumplimiento_normativo, otro | `claims` |
| `claim_status` | recibido, en_analisis, requiere_documentos, respondido, cerrado, elevado_asfi | `claims` |

Dos familias conviven a propósito. Los literales en minúscula y sin tildes (`whatsapp`,
`en_espera_cliente`) son identificadores: el código los compara tal cual. Los que llevan inicial
mayúscula (`Pendiente`, `En revision`) son los que ya existían en la interfaz y el backend antes
del rediseño; cambiarlos habría roto las pantallas sin ganar nada. Un valor fuera de la lista no
se guarda: la base lo rechaza en el momento.

---

## 5. Las 9 vistas

Son `with (security_invoker = true)`, es decir: se ejecutan con los permisos de quien las consulta,
no con los de su dueño. Lo que un usuario de soporte no puede ver en `messages`, no lo ve a través
de la vista. Son lo que leen las pantallas, para que el frontend no arme nueve `join` por su cuenta.

| Vista | Qué responde |
| --- | --- |
| `vw_inbox` | La bandeja: cada hilo con su cuenta, canal, cola, asignado y el último mensaje |
| `vw_conversations_sla` | Cuántas horas hábiles lleva sin atención y cuándo vence |
| `vw_messages_flagged` | Los mensajes que pasaron con una advertencia del glosario |
| `vw_cadence_pending` | Qué paso de cadencia toca mandar, a quién y por qué canal |
| `vw_compliance_progress` | Porcentaje del legajo aprobado por cuenta |
| `vw_funnel_by_stage` | Negocios por etapa y volumen promedio |
| `vw_stage_age` | Cuántos días lleva cada negocio en su etapa |
| `vw_open_activities` | Tareas abiertas y vencidas, con dueño |
| `vw_claims_sla` | Reclamos, su plazo y si se pasó |

---

## 6. Las reglas que impone la base

Veinte funciones propias, veinticinco disparadores. Once de ellos son reglas de negocio, trece
mantienen `updated_at` y uno crea el perfil.

| Regla | Disparador | Tabla | Qué rechaza |
| --- | --- | --- | --- |
| Glosario de marca | `messages_language_guard` | `messages` | Un saliente con un término de severidad `bloqueo`, con el mensaje "El mensaje contiene un termino no autorizado por el glosario: ..." |
| Coherencia de canal | `messages_channel_matches_thread` | `messages` | Un mensaje por un canal que no es el del hilo |
| Automatización honesta | `messages_automation_consistency` | `messages` | Un mensaje marcado como automático firmado por una persona, o al revés |
| Mensaje inmutable | `messages_no_update` | `messages` | Editar o borrar lo ya enviado |
| Contadores del hilo | `messages_sync_conversation` | `messages` | (no rechaza: mantiene `messages_count` y las fechas) |
| Auditoría inmutable | `audit_events_no_update` | `audit_events` | Cualquier `update` o `delete` |
| Historia solo del sistema | `deal_events_no_direct_write` | `deal_events` | Escribir un asiento de etapa sin la marca de sesión del sistema |
| Documento antes de aprobar | `compliance_items_need_document` | `compliance_items` | Aprobar una casilla que exige documento sin archivo vigente |
| Orden de la cadencia | `cadence_steps_day_order` | `cadence_steps` | Un paso que no cae después del anterior |
| Casillas al nacer | `clients_compliance_template` | `clients` | (no rechaza: siembra las casillas del legajo) |
| Perfil al nacer | `on_auth_user_created` | `auth.users` | (no rechaza: crea la fila en `profiles`) |

Las cuatro primeras son las que Álvaro pidió como guardarraíles, y las cuatro están en la base, no
en el backend. Un error de programación en Node puede saltarse una validación de la aplicación; no
puede saltarse un disparador de PostgreSQL.

Funciones de cálculo del nivel de servicio: `business_hours_between`, `business_hours_since`,
`add_business_hours` y `conversation_sla_deadline`. Trabajan con el horario de `ecp_parameters`,
así que el viernes por la tarde no cuenta para el plazo de 2 horas. Son la razón por la que
`pruebas-negativas.sql` comprueba que entre el viernes 16:00 y el lunes 11:00 hay 3 horas hábiles,
no 67.

Funciones de identidad: `current_user_id`, `current_user_email` y `current_role_name`. Leen la
declaración de sesión (el JWT que Supabase pone en cada petición) y son lo que consultan las 54
políticas.

---

## 7. Quién puede qué (RLS, seguridad a nivel de fila)

Cincuenta y cuatro políticas sobre `public`, dos sobre `storage.objects`. Están activadas incluso
sobre las tablas que el backend escribe con la llave de servicio, que las esquiva: son la segunda
traba, la que separa a un rol equivocado del expediente ajeno si algún día un dato se expone
directo al navegador.

| Tabla | Lectura | Escritura |
| --- | --- | --- |
| `profiles` | Autenticados | Solo llave de servicio |
| `clients` | Autenticados, sin borrados | Alta: admin, compliance, operaciones, ventas. Edición: admin, compliance o el dueño |
| `contacts` | Autenticados, sin borrados | admin, compliance, operaciones, ventas |
| `conversations` | Autenticados, sin borrados | Los cinco roles y el conector |
| `messages` | Autenticados | Solo inserción. Update y delete prohibidos |
| `blocked_terms`, `routing_rules`, `templates`, `deal_stages`, `compliance_item_defs`, `cadence_templates`, `cadence_steps`, `ecp_parameters` | Autenticados | admin y, en el glosario y las plantillas, compliance |
| `compliance_items` | Autenticados | admin, compliance |
| `documents` | Autenticados, sin borrados | Alta: los cinco roles. Revisión: admin, compliance |
| `screenings` | Autenticados | Solo llave de servicio |
| `deals` | Autenticados, sin borrados | admin, ventas, operaciones |
| `deal_events`, `cadence_executions` | Autenticados | Solo el sistema |
| `activities` | Autenticados, sin borrados | Los cinco roles |
| `tags` | Autenticados | admin, ventas |
| `client_tags` | Autenticados | admin, ventas, operaciones, compliance |
| `claims` | Autenticados, sin borrados | Alta: soporte, operaciones, admin, compliance. Resolución: compliance y admin |
| `client_ecp_profile` | Autenticados | admin, operaciones, compliance |
| `audit_events` | admin, compliance | Inserción para autenticados. Edición y borrado: prohibidos |
| `storage.objects` (cubo `expedientes`) | admin, compliance, operaciones, y cada quien sus propios archivos | Subida: los cinco roles |

Dos decisiones de privilegios que van más allá de las políticas, en `0004`: `revoke all on all
tables in schema public from anon` (quien no tiene sesión iniciada no lee el CRM por ninguna vía,
incluidas las vistas) y el bloque explícito de `grant select ... to authenticated`, que no se dejó
al detras de la plataforma porque las vistas `security_invoker` lo necesitan para existir.

---

## 8. Manual de funcionamiento

### 8.1 Los cinco roles y su pregunta del día

| Rol | Su pregunta | Tablas que toca |
| --- | --- | --- |
| `soporte` | ¿qué le pasó a este cliente y cuánto lleva esperando | bandeja, mensajes, actividades, reclamos |
| `operaciones` | qué hilos hay que desbloquear hoy y qué cupos están cerca del tope | bandeja, cuentas, legajo, perfil ECP, negocios |
| `ventas` | a quién llamo hoy y qué le propuse | cadencia, negocios, contactos, actividades, etiquetas |
| `compliance` | qué expedientes tienen huecos y qué se dijo que no se debía decir | legajo, documentos, glosario, plantillas, reclamos, auditoría |
| `admin` | todo lo anterior, más usuarios, colas, topes y etapas | todas |

### 8.2 El ciclo de vida de una cuenta, paso a paso

**1. Entra una persona del equipo.** Alta en Auth. El disparador crea su perfil con rol `soporte`
y la sección 0 del `seed.sql` le da su rol real. Si se salta el paso 2, el usuario inicia sesión
y no ve nada.

**2. Entra un lead por cualquiera de los cinco frentes.** Fila en `clients` con `source` y
`onboarding_stage` en *Lead capturado*, y si viene de un canal, su `conversations`. Al nacer la
cuenta, el disparador siembra sus casillas de `compliance_items`.

**3. Se abren las tres rutas en paralelo.** Ruta A: cumplimiento mueve casillas y sube documentos.
Ruta B: ventas inscribe la cuenta en la cadencia e inscribe un `deals` en etapa 1. Ruta C:
operaciones da de alta `client_ecp_profile` con su tope y su riesgo. Las tres avanzan a la vez y
ninguna espera a otra: es la decisión de diseño que pidió Álvaro.

**4. La cadencia trabaja sola.** El agente de cadencia mira `vw_cadence_pending`, escribe una fila
en `cadence_executions` por paso y, al mandar el mensaje, deja su `messages` con
`automated = true` y `cadence_execution_id` puesto. El día 14 es el ciclo completo: 6 pasos.

**5. Un mensaje entra por WhatsApp.** El conector escribe el `messages` entrante, el disparador
sincroniza los contadores del hilo, `routing_rules` decide cola y rol, y `vw_conversations_sla`
empieza a contar horas hábiles desde `last_inbound_at`.

**6. Alguien responde.** El mensaje saliente pasa por el glosario antes de escribirse. Si el
término es de bloqueo, la base lo rechaza y la interfaz muestra la sugerencia correcta. Si es de
advertencia, se escribe y queda en `vw_messages_flagged`.

**7. Llega un reclamo.** Fila en `claims` con `category` y `received_at`. `due_at` queda vacío
hasta que el plazo legal esté confirmado. `vw_claims_sla` lo marca como `sin_plazo_definido`.

**8. Todo deja huella.** Cada acción relevante escribe `audit_events`, y nadie puede corregirla
después. Si un asiento quedó mal, se escribe otro que lo aclara.

### 8.3 Qué pantalla sale de dónde

| Pantalla | Fuente |
| --- | --- |
| Bandeja unificada | `vw_inbox`, con `vw_conversations_sla` encima |
| Detalle del hilo | `conversations` + `messages` + `clients` + `contacts` |
| Cadencia del día | `vw_cadence_pending` |
| Legajo de la cuenta | `vw_compliance_progress` + `compliance_items` + `documents` |
| Embudo | `deals` + `vw_funnel_by_stage` + `vw_stage_age` |
| Tareas | `vw_open_activities` |
| Reclamos | `vw_claims_sla` |
| Ficha 360 | `clients` cruzada con `contacts`, `compliance_items`, `documents`, `deals`, `activities`, `claims`, `client_ecp_profile` y `conversations`. No es una tabla |
| Límites del ECP | `ecp_parameters` + `client_ecp_profile` |
| Auditoría | `audit_events`, solo admin y compliance |

### 8.4 Errores que devuelve la base y qué significan

| Mensaje | Causa | Qué hacer |
| --- | --- | --- |
| "El mensaje contiene un termino no autorizado por el glosario: ..." | Término de bloqueo en un saliente | Reescribir con la sugerencia que devuelve la misma fila del glosario |
| "La casilla ... requiere un documento aprobado antes de aprobarse" | Aprobar sin soporte documental | Subir el archivo, revisarlo, y reintentar |
| "Esta tabla la mantiene el sistema" | Intento de escribir `deal_events` a mano | Mover la tarjeta en la pantalla, que es lo que genera el asiento |
| "El asiento de auditoria es inmutable" | Alguien intentó corregir un asiento | Escribir uno nuevo que lo aclare |
| "El paso N de la cadencia debe caer despues del dia M" | Pasos fuera de orden | Reordenar `day_number`, no el paso |
| "new row violates row-level security policy" | El rol no puede escribir eso, o la política de lectura ocultó la fila recién escrita | Cambiar de usuario o revisar la política |
| `42883 operator does not exist: text = uuid` | Comparar una columna de texto con un identificador | Convertir el identificador con `::text`, nunca el texto a `uuid` |

---

## 9. Cómo se aplica

Orden, en el SQL Editor del panel (cada fichero entero, en una sola pasada, porque el editor
aplica todo en una transacción):

| Paso | Fichero | Control |
| --- | --- | --- |
| 1 a 4 | `0001`, `0002`, `0003`, `0004` | conteo de tablas 4, 9, 25, 26 (`table_type = 'BASE TABLE'`, si no cuenta las 9 vistas) |
| 5 | `0006_glossary_seed.sql` | 10 términos: 7 de bloqueo, 3 de advertencia |
| 6 | cubo `expedientes` desde el panel | privado, 10 MB, cinco tipos de archivo |
| 7 | las dos políticas del cubo, sección Schema del panel | `pg_policies` devuelve `expedientes_read` SELECT y `expedientes_upload` INSERT |
| 8 | `seed.sql`, primera pasada | `Success. No rows returned` |
| 9 | `verificacion.sql` | 19 filas, 17 en verde, las dos de perfiles en `false` |
| 10 | cinco usuarios en Authentication → Users | `profiles` pasa de 0 a 5, todos con rol `soporte` |
| 11 | `seed.sql` segunda pasada | sin errores: el fichero está hecho para repetirse |
| 12 | `verificacion.sql` | **las 19 en `true`** |
| 13 | `pruebas-negativas.sql`, bloque por bloque | 9 bloques: 5 rechazan con el mensaje anunciado, 4 escriben; los conteos dan 18 y 17 |

`0005_storage_bucket.sql` **no se ejecuta en el editor**: `storage.objects` tiene un dueño interno
de Supabase y la sentencia devuelve `must be owner of table objects`. El fichero es la referencia
de lo que hay que poner a mano en el panel.

Los ficheros de lectura (`chequeos.sql`, `verificacion.sql`) se pueden correr cuantas veces se
quieran. `pruebas-negativas.sql` escribe y borra: sus bloques `at)` y `f)` dejan la base como
estaba.

### El control fuera de línea

Antes de entregar un fichero SQL al panel se ejecuta contra un PostgreSQL de verdad en local
(PGlite, que es PostgreSQL compilado a WebAssembly), en
`C:\Users\Denzel C\Documents\Qoder\2026-10-13\647fe3c5\sqlcheck\`:

```
node pglite.mjs "<ruta de backend/supabase>"   # aplica todo, simula Auth, corre las 9 pruebas
node erd.mjs   "<ruta de backend/supabase>"   # vuelca tablas, columnas, claves, enums y disparadores
node check.js / order.js / campos.js / vistas.js / anclas.js / canales.js   # comprobaciones estaticas
```

Este documento salió de `erd.mjs` consultando la base real, no de la memoria ni del texto de las
migraciones. Si cambias una migración, vuelve a correrlo y actualiza la sección 3.

---

## 10. Qué falta todavía

1. **`backend/src/data/repository.js`**: la capa que decide entre el almacén en memoria y
   Supabase, con un cliente por petición que lleve la sesión del usuario (nunca la llave de
   servicio para tráfico de usuario), el identificador visible normalizado por `code` y los
   nombres de columna en camelCase.
2. **La interfaz del conector de canales** y su implementación de demostración detrás. El número
   de WhatsApp Business existe, la conexión real se hace después.
3. **Los tres agentes** sobre las vistas: cumplimiento (glosario y enrutamiento), cadencia
   (`vw_cadence_pending`) y soporte.
4. **El plazo legal del reclamo**: sigue sin dato. `claims.due_at` se deja en `null` hasta que
   Álvaro lo confirme.
5. **El tope del agente de cumplimiento**: `agents/compliance-agent/rules.ts` tiene
   `maxLimitBob = 350000` y el parámetro de la base dice 120.000. Hay que decidir cuál manda y
   que el otro lea de la base.
6. **La CI no ejecuta SQL.** PGlite puede hacerlo; falta conectarlo al flujo de GitHub Actions.
7. **Lo que este esquema no cubre a propósito**: contabilidad doble, cotización de tipo de cambio
   y el detalle de las operaciones de transferencia. Los tres son de la aplicación de pagos.
