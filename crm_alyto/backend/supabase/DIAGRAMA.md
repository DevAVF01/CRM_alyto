# Base de datos del CRM: diagrama completo y manual de funcionamiento

Supabase (PostgreSQL). Cuatro migraciones en `migrations/`, datos de arranque en `seed.sql`.

Estado: **diseñado y revisado en estático, todavía no ejecutado contra un proyecto real.** El backend sigue leyendo de `backend/src/data/store.js`; el puente que falta es `backend/src/data/repository.js`.

Inventario: **17 tablas propias + 2 de Supabase** (`auth.users`, `storage.objects`), **7 enums**, **14 disparadores**, **7 funciones**, **3 vistas**, **34 políticas RLS** sobre tablas, **2** sobre el almacén, y el cubo privado `expedientes`.

Cómo leer este archivo: la sección 1 es el inventario rápido, la 2 el mapa de relaciones, la 3 la ficha columna por columna, la 4 las reglas que impone la base, la 5 la seguridad, la 6 el manual de cómo se usa, la 7 lo que falta y la 8 el modelo entidad-relación con su matriz completa.

---

## 1. Inventario: qué es cada tabla, en una frase

| # | Tabla | Qué es | Quién la escribe |
| --- | --- | --- | --- |
| 1 | `auth.users` | Cuenta de acceso: correo y contraseña. Es de Supabase, no nuestra | Supabase Auth |
| 2 | `profiles` | El rol real de ese usuario y su nombre visible | El disparador de alta; después solo administración |
| 3 | `clients` | **El expediente.** Una empresa o persona natural con NIT, KYC y cupo | Ventas, cumplimiento, operaciones |
| 4 | `ecp_parameters` | Los topes que fija ASFI en el Entorno Controlado de Pruebas. Una fila | administración |
| 5 | `contacts` | Las personas detrás del expediente | Ventas, cumplimiento, operaciones |
| 6 | `deals` | El negocio en curso: etapa 1 a 6, tipo, volumen esperado | Ventas, operaciones |
| 7 | `deal_events` | Historia de cada movimiento de etapa | Solo el disparador |
| 8 | `activities` | Llamadas, reuniones, visitas, correos, tareas y notas con dueño | Los cinco roles |
| 9 | `documents` | Ficha de un archivo del expediente (el archivo está en Storage) | Alta: cuatro roles. Revisión: cumplimiento y administración |
| 10 | `communication_logs` | Copia exacta de lo que se envió a un cliente | Ventas, soporte, administración |
| 11 | `tags` | Etiquetas de trabajo | Ventas, administración |
| 12 | `client_tags` | Qué etiqueta tiene cada expediente | Cuatro roles |
| 13 | `compliance_items` | Las 8 casillas de debida diligencia del expediente | Cumplimiento y administración |
| 14 | `screenings` | Resultado del cotejo contra listas restrictivas | El conector KYC/AML |
| 15 | `custodial_wallets` | Billeteras de custodia institucional. **Sin columna de clave privada** | Operaciones, administración |
| 16 | `transactions` | Transferencias internacionales | Operaciones, administración |
| 17 | `ecp_daily_usage` | Contador del día: operaciones completadas y monto en bolivianos | Solo el disparador |
| 18 | `audit_events` | Prueba de quién hizo qué y cuándo. **Inmutable** | Todos, por inserción |
| 19 | `storage.objects` | Los archivos físicos del cubo `expedientes`. Es de Supabase | Cuatro roles, por subida |

---

## 2. Mapa de relaciones

Una sola idea ordena todo: **el expediente (`clients`) es el centro, y lo demás son satélites suyos.** La única tabla que no cuelga de un expediente es la auditoría, que cuelga de todo lo demás.

```
   auth.users ──1:1── profiles
                        │
      ┌─────────────────┴───────────────────┐
      │ 12 columnas de "quien" apuntan      │
      │ a profiles desde 10 tablas          │
      └─────────────────┬───────────────────┘
                        │ owner_id
                        ▼
   ecp_parameters ──► CLIENTS ◄── (el expediente, el centro)
                        │
     ┌──────┬──────┬────┴────┬──────┬──────┬──────┬──────┐
     ▼      ▼      ▼         ▼      ▼      ▼      ▼      ▼
 contacts deals activities docs comms client_  comply  screens
     │      │      ▲  ▲    │   │   tags   _items   │    wallets
     │      │      │  └────┼───┼────────────────────┤    transactions
     │      │      └───────┘   └────────────────────┘         │
     │    deal_events (lo escribe el disparador)              ▼
     │                                            ecp_daily_usage
   documents ── storage.objects (cubo expedientes)
   compliance_items ◄── vigila ── documents (regla del documento)
   audit_events  (sin dueño: registra todo, no se borra nunca)
```

Relaciones forzadas por columna clave foránea, con qué pasa si el padre se borra:

| Origen | Hacia | Cardinalidad | Al borrar el padre |
| --- | --- | --- | --- |
| `profiles.id` | `auth.users.id` | 1:1 | se borra el perfil |
| `clients.owner_id` | `profiles` | N:1 | el expediente queda sin dueño |
| `contacts.client_id` | `clients` | N:1 | se borran los contactos |
| `deals.client_id` | `clients` | N:1 | se borra la oportunidad y su historial |
| `deals.owner_id` | `profiles` | N:1 | oportunidad sin dueño |
| `deal_events.deal_id` | `deals` | N:1 | se borra la historia de esa oportunidad |
| `deal_events.actor_id` | `profiles` | N:1 | se conserva el asiento con el correo |
| `activities.client_id` | `clients` | N:1 | se borran las actividades |
| `activities.deal_id` | `deals` | N:1 | la actividad sobrevive sin oportunidad |
| `activities.contact_id` | `contacts` | N:1 | la actividad sobrevive sin contacto |
| `activities.owner_id` | `profiles` | N:1 | **PROHIBIDO borrar ese usuario** |
| `activities.created_by` | `profiles` | N:1 | queda vacío, el registro sigue |
| `documents.client_id` | `clients` | N:1 | se borra la ficha del archivo |
| `communication_logs.client_id` | `clients` | N:1 | se borra la copia enviada |
| `client_tags` | `clients` y `tags` | N:M | se borra el vínculo, la etiqueta vive |
| `compliance_items.client_id` | `clients` | N:1 | se borran las casillas |
| `screenings.client_id` | `clients` | N:1 | se borra el cotejo |
| `custodial_wallets.client_id` | `clients` | N:1 | se borra la ficha de la cartera |
| `transactions.client_id` | `clients` | N:1 | se borra la operación |
| `transactions.activity_id` | `activities` | N:1 | la operación sobrevive sin actividad |
| `audit_events.actor_id` | `profiles` | N:1 | el asiento conserva el correo del actor |

Relaciones que **no** son una columna, sino un disparador:

| Disparador | Une | Qué hace |
| --- | --- | --- |
| `on_auth_user_created` | `auth.users` → `profiles` | Al nacer un usuario, crea su perfil con el rol declarado |
| `deals_stage_change` | `deals` → `deal_events` | Anota cada cambio de etapa, con quién y cuándo |
| `transactions_daily_usage` | `transactions` → `ecp_daily_usage` | Suma uno al día cuando una operación nace o pasa a completada |
| `compliance_items_need_document` | `documents` → `compliance_items` | Impide aprobar una casilla que exige documento sin archivo |
| `touch_updated_at` | 9 tablas consigo mismas | Mantiene `updated_at` real, no el que escriba la aplicación |
| `audit_events_no_update` | `audit_events` | Rechaza cualquier intento de editar o borrar un asiento |

---

## 3. Ficha de cada tabla

Las banderas: **PK** clave primaria, **FK** clave foránea, **U** valor único, **NN** obligatorio.

### `profiles`, quién es quién dentro del CRM

```
id             uuid   PK FK >> auth.users (>>= cascade)
email          text   U  NN
role           user_role   NN  default 'ventas'
display_name   text        NN  default ''
team           text
is_active      boolean     NN  default true
created_at     timestamptz NN  now()
updated_at     timestamptz NN  touch_updated_at
```

Por qué existe: `auth.users` solo sabe correo y contraseña. El rol vive aquí, y tanto el backend como las políticas RLS lo leen de esta tabla. Sin fila en `profiles`, un usuario entra pero no puede hacer nada.

### `clients`, el expediente

```
id                uuid   PK gen_random_uuid()
code              text   U  NN   ECP-BOL-5577, lo que ve la interfaz
name              text      NN
nit               text      NN  default 'Pendiente'
account_type      account_type NN  default 'persona_juridica'
country           text      NN  default 'Bolivia'
city              text
sector            text
source            text      referido | alyto.io | evento
kyc_status        kyc_status NN default 'Pendiente'
health            text      NN default 'En evaluacion'
volume_processed  numeric(14,2) NN default 0
monthly_limit     numeric(14,2) NN default 250000
frequency         integer   NN default 0
custodial_protocol text     NN default 'Stellar AlyPay'
owner_id          uuid FK >| profiles
next_step_at      timestamptz   cuando hay que volver a llamar
created_at / updated_at timestamptz NN
deleted_at        timestamptz   borrado logico
```

Dos reglas de diseño: `id` (cadena de 36 caracteres aleatoria) es interno e inmutable, `code` es el número visible y editable; y `deleted_at` en vez de borrar, porque un expediente del ECP no desaparece, se retira.

### `ecp_parameters`, los topes del Entorno Controlado de Pruebas

```
id                        smallint PK check (id = 1)
usuarios_por_dia          integer     NN 630
operaciones_por_dia       integer     NN 630
monto_maximo_operacion_bs numeric(14,2) NN 120000
duracion_maxima_ecp_meses integer     NN 12
estado_autorizacion       text        NN 'En proceso dentro del Entorno
                                            Controlado de Pruebas'
updated_at                timestamptz NN
```

Una sola fila con restricción explícita. Antes el régimen se repetía como texto en cada expediente; ahora se declara una vez.

### `contacts`, las personas

```
id             uuid PK        client_id   uuid FK >> clients NN
full_name      text NN        role_title  text
email          text           phone       text
is_primary     boolean NN     decision_maker boolean NN
notes          text           created_at / updated_at NN   deleted_at
```

Reglas: un solo `is_primary` verdadero por expediente, y el par expediente + nombre no se repite (eso permite reejecutar el sembrado sin duplicar).

### `deals`, el negocio en curso

```
id            uuid PK        code        text U NN
client_id     uuid FK >> clients NN
stage         smallint NN  default 1  check between 1 and 6
deal_type     text NN  'Transferencia Institucional B2B'
frequency     text   default 'Por definir'
monthly_volume numeric(14,2) NN default 0
next_step     text           expected_close_month text
lost_reason   lost_reason    owner_id  uuid FK >| profiles
created_at / updated_at timestamptz NN      deleted_at
```

Las seis etapas son el embudo canónico: 1 contacto, 2 calificación, 3 propuesta, 4 negociación, 5 compromiso, 6 operación activa.

### `deal_events`, la memoria del embudo

```
id          bigint PK identity     deal_id   uuid FK >> deals NN
from_stage  smallint               to_stage  smallint NN
actor_id    uuid FK >| profiles    actor_email text NN
reason      text                   created_at timestamptz NN
```

Solo lo escribe el disparador `deals_stage_change`, que es `security definer` (se ejecuta con los permisos del dueño de la función, no del usuario). `from_stage` vacío significa alta de la oportunidad. Sin esta tabla no hay conversión, ni antigüedad por etapa, ni velocidad del embudo: hay solo una foto del día de hoy.

### `activities`, la jornada

```
id            uuid PK        client_id  uuid FK >> clients NN
deal_id       uuid FK >| deals          contact_id uuid FK >| contacts
type          activity_type NN
title         text NN  check char_length between 3 and 200
body          text
due_at        timestamptz    done_at  timestamptz  check done_at >= created_at
duration_minutes integer
owner_id      uuid FK XR profiles NN      participants text[] NN default '{}'
created_by    uuid FK >| profiles
created_at / updated_at timestamptz NN    deleted_at
```

`XR` (*restrict*) en `owner_id` es deliberado: una tarea necesita responsable, y borrar un usuario con tareas abiertas está prohibido hasta que se reasignen. Un expediente sin actividades se oxida en silencio; por eso es la tabla que convierte el tablero en una herramienta de trabajo.

### `documents`, la ficha del archivo

```
id              uuid PK     client_id  uuid FK >> clients NN
checklist_item_key text              filename     text NN
storage_path    text U NN            mime_type    text
size_bytes      integer              checksum     text
review_status   document_review_status NN default 'Pendiente'
uploaded_by     uuid FK >| profiles  reviewed_by uuid FK >| profiles
created_at / updated_at timestamptz NN            deleted_at
```

El archivo no está aquí: está en `storage.objects`, dentro del cubo privado `expedientes`, límite 10 megabytes, tipos pdf, docx, png y jpg. Caben varios archivos por casilla, por eso el índice `checklist_item_key` **no** es único.

### `communication_logs`, qué se dijo exactamente

```
id            uuid PK     client_id   uuid FK >> clients NN
contact_id    uuid FK >| contacts     activity_id uuid FK >| activities
template_id   text        channel     communication_channel NN default 'interno'
subject       text        body_snapshot text NN
sent_by       uuid FK >| profiles     created_at timestamptz NN
```

`body_snapshot` guarda el texto tal como salió, no una referencia a la plantilla: la plantilla puede cambiar mañana, la prueba no.

### `tags` y `client_tags`, segmentación

```
tags:         id uuid PK | name text U NN | color text NN | created_at
client_tags:  client_id uuid FK >> clients | tag_id uuid FK >> tags
              PK (client_id, tag_id) | created_at
```

Muchas etiquetas por expediente y una etiqueta en muchos expedientes. Un expediente puede ser a la vez comercio exterior, Santa Cruz y prioridad alta.

### `compliance_items`, la lista de verificación

```
client_id  uuid FK >> clients NN  ┐ clave primaria conjunta
item_key   text NN               ┘
label      text NN     detail  text
status     kyc_status NN default 'Pendiente'
document_required boolean NN default false
updated_by uuid FK >| profiles
created_at / updated_at timestamptz NN
```

Las ocho casillas: personería y persona jurídica, origen de fondos, contrato de adhesión al ECP, protocolo de transparencia, beneficiarios finales (UBO, *Ultimate Beneficial Owner*), listas restrictivas, perfil transaccional declarado y autorización de operación de prueba. Cuatro de ellas marcan `document_required`.

### `screenings`, cotejo contra listas restrictivas

```
id uuid PK | client_id uuid FK >> clients | contact_id uuid FK >> contacts
list_name text NN | subject text NN | detail text
result text NN check in ('sin coincidencia','revisar','coincidencia')
screened_by uuid FK >| profiles | created_at timestamptz NN
```

### `custodial_wallets`, custodia institucional

```
id uuid PK | client_id uuid FK >> clients NN | label text NN
public_key text U (admite vacio) | asset text NN USDC|XLM
balance numeric(18,7) NN | network text NN 'Stellar Testnet'
created_at / updated_at timestamptz NN
```

Lo importante es lo que falta: **no existe ninguna columna donde guardar la clave privada**, y `public_key` admite vacío hasta que el conector de Stellar entregue una dirección real. Ningún valor inventado debe escribirse ahí.

### `transactions`, las transferencias internacionales

```
id uuid PK | code text U NN (TX-90031) | client_id uuid FK >> clients NN
activity_id uuid FK >| activities
beneficiary text NN | destination text
amount_usd numeric(14,2) NN check (amount_usd > 0)
status text NN check in ('Completada en ECP','En Proceso',
                         'En Revision ASFI','Observada','Rechazada')
stellar_hash text | created_by uuid FK >| profiles
created_at / updated_at timestamptz NN
```

El `check` de estado existe porque una variante con tilde o en minúscula dejaría de contar en el contador diario y en la pantalla de límites, y eso es invisible hasta que duele.

### `ecp_daily_usage`, el cuentagotas del día

```
day date PK | operations_count integer NN | amount_bs_total numeric(14,2) NN
updated_at timestamptz NN
```

Lo mantiene `register_daily_usage`. Convertir el tope en algo consultable día a día es lo que hace posible alertar antes de chocar contra él, en lugar de enterarse después.

### `audit_events`, la prueba

```
id bigint PK identity | actor text NN | actor_id uuid FK >| profiles
action text NN | detail text
entity_type text | entity_id text | trace_id text
created_at timestamptz NN
```

Doble candado: los permisos `UPDATE` y `DELETE` están revocados a los roles `authenticated` y `anon`, y además un disparador lanza "El asiento de auditoria es inmutable". Si un asiento quedó mal, no se corrige: se escribe otro que lo aclara.

---

## 4. Los siete enums

| Enum | Valores | Dónde se usa |
| --- | --- | --- |
| `user_role` | admin, compliance, operaciones, ventas, soporte | `profiles`, y todas las políticas RLS |
| `account_type` | persona_juridica, persona_natural | `clients` |
| `kyc_status` | Pendiente, En revision, Aprobado, Observado, Rechazado | `clients` y `compliance_items` |
| `document_review_status` | Pendiente, En revision, Aprobado, Observado | `documents` |
| `lost_reason` | precio, plazo, proveedor_actual, sin_presupuesto, sin_decision, no_responde, otro | `deals` |
| `activity_type` | llamada, reunion, visita, correo, tarea, nota | `activities` |
| `communication_channel` | correo, whatsapp, llamada, interno | `communication_logs` |

Los literales de enum se escriben sin tildes porque son identificadores: el código los compara tal cual. Los textos libres (nombres de expedientes, etiquetas del checklist, destinos) sí llevan su ortografía completa.

Un valor fuera de la lista no se guarda: la base lo rechaza en el momento, con error legible. Eso es más barato que descubrir dentro de un año que el embudo tiene una etapa 7 fantasma.

---

## 5. Quién puede qué (RLS, seguridad a nivel de fila)

El backend escribe con la llave maestra de servicio, que esquiva estas reglas. Se activan igual, como segunda traba: si algún día un dato se expone directo al navegador, esto es lo único que separa a un rol equivocado del expediente ajeno.

| Tabla | Lectura | Escritura |
| --- | --- | --- |
| `profiles` | Autenticados | Solo llave de servicio; la siembra el disparador de alta |
| `clients` | Autenticados sin borrados | Alta: admin, compliance, operaciones, ventas. Edición: admin, compliance o el dueño |
| `contacts` | Autenticados sin borrados | admin, compliance, operaciones, ventas |
| `deals` | Autenticados sin borrados | admin, ventas, operaciones |
| `deal_events` | Autenticados | Solo el disparador |
| `activities` | Autenticados sin borrados | Los cinco roles |
| `documents` | Autenticados sin borrados | Alta: cuatro roles. Revisión: admin, compliance |
| `communication_logs` | Autenticados | Alta: admin, ventas, soporte |
| `tags` | Autenticados | admin, ventas |
| `client_tags` | Autenticados | admin, ventas, operaciones, compliance |
| `compliance_items` | Autenticados | Alta y edición: admin, compliance |
| `screenings` | Autenticados | Solo llave de servicio |
| `custodial_wallets` | Autenticados | Alta: admin, operaciones |
| `transactions` | Autenticados | Alta y edición: admin, operaciones |
| `ecp_daily_usage` | Autenticados | Solo el disparador |
| `ecp_parameters` | Autenticados | Edición: admin |
| `audit_events` | admin, compliance | Alta: autenticados. Edición y borrado: prohibidos |
| `storage.objects` | admin, compliance, operaciones | Subida: admin, compliance, operaciones, ventas |

---

## 6. Manual de funcionamiento

Esta sección responde cómo se usa la base en el día a día, no cómo está construida.

### 6.1 Los cinco roles y qué hacen

| Rol | Su pregunta del día | Tablas que toca |
| --- | --- | --- |
| `ventas` | ¿a quién llamo hoy y qué le propuse | expedientes, oportunidades, actividades, contactos, etiquetas, comunicación |
| `compliance` | ¿qué expedientes tienen huecos documentales | casillas del checklist, documentos, cotejos, auditoría, parámetros (lectura) |
| `operaciones` | ¿qué se va a ejecutar hoy y cuánto va | transacciones, carteras, actividades, uso diario |
| `admin` | todo lo anterior más usuarios y topes | todas, incluidas `profiles` y `ecp_parameters` |
| `soporte` | ¿qué le pasó a este cliente | actividades, comunicación, lectura general |

### 6.2 El ciclo de vida de un expediente, paso a paso

**Paso 1. Entra una persona del equipo.** Se crea en Auth declarando su rol en los metadatos. El disparador genera su fila en `profiles`. Consecuencia si se salta el paso: el usuario inicia sesión y no ve nada, porque el rol no existe.

**Paso 2. Se abre el expediente.** Fila en `clients` con `code`, NIT, tipo de persona, sector y `kyc_status` en Pendiente. Se le asigna dueño (`owner_id`) y se fijan sus fechas. En el mismo movimiento se siembran las 8 filas de `compliance_items`.

**Paso 3. Se cargan los documentos.** El archivo va a Storage; en `documents` queda la ruta, el tamaño, la huella, quién lo subió y a qué casilla satisface. Estado inicial: Pendiente.

**Paso 4. Cumplimiento revisa.** Cambia `review_status` de cada ficha (solo admin y compliance pueden). Después mueve la casilla de `compliance_items` a Aprobado o a Observado. Aquí actúa la regla dura: si la casilla exige documento y no hay ningún archivo vigente, la base rechaza la escritura con el mensaje "La casilla ... requiere un documento adjunto antes de aprobarse".

**Paso 5. Pasa al embudo.** Se crea la `deal` en etapa 1. Desde ese momento cada arrastre de tarjeta genera un `deal_events`.

**Paso 6. Se trabaja la relación.** Cada interacción real deja su `activities`: llamada de 15 minutos, tarea con vencimiento, nota de reunión. `done_at` vacío significa pendiente; por eso la vista `vw_open_activities` puede responder "qué hay que hacer hoy".

**Paso 7. Se comunica uno.** El mensaje se valida contra el glosario de marca, se envía por el conector de notificaciones y deja `communication_logs` con el texto exacto, además de su asiento en `audit_events`.

**Paso 8. Se opera.** `transactions` con beneficiario, destino, monto en dólares y estado En Proceso. El conector de Stellar devuelve el hash y, cuando la operación se confirma, el estado pasa a Completada en ECP y el disparador suma una unidad en `ecp_daily_usage` del día.

**Paso 9. Se mide y se avisa.** La pantalla de límites compara `ecp_daily_usage` contra `ecp_parameters` y avisa antes de llegar al tope. Las vistas del embudo dicen en qué etapa se atasca un sector.

**Paso 10. Todo deja huella.** Cada acción relevante escribe `audit_events`, y nadie puede corregirlo después.

### 6.3 Escenarios concretos, con lo que se escribe en cada tabla

**Un prospecto llega desde el sitio web**
`clients` (una fila, KYC Pendiente, origen alyto.io) + 8 filas en `compliance_items` + `activities` (tarea de primer contacto) + `audit_events` (acción `client_creado`).

**Un ejecutivo mueve una tarjeta de propuesta a negociación**
UPDATE en `deals.stage` + INSERT automático en `deal_events` (con el correo del usuario tomado del contexto de la sesión) + `audit_events`. El usuario no escribe en `deal_events`: lo hace la base.

**Cumplimiento aprueba origen de fondos**
UPDATE en `compliance_items.status`. Si `document_required` es verdadero y no hay ninguna fila vigente en `documents` con esa casilla, el disparador aborta la operación y la interfaz muestra el error.

**Subida de un contrato escaneado**
INSERT del archivo en Storage + fila en `documents` (ruta, huella, quien lo subió, casilla `contrato-ecp`) + `audit_events`.

**No hay respuesta del cliente en tres semanas**
No hay ninguna escritura nueva: `vw_stage_age` muestra la oportunidad con 21 días en la misma etapa, y `vw_open_activities` tiene la tarea vencida. La antigüedad y el vencimiento son señales que ya están en los datos, no campañas que haya que inventar.

**El cliente ejecuta una transferencia a Chile**
INSERT en `transactions` (estado En Proceso, sin hash) + UPDATE posterior al confirmar + `ecp_daily_usage` del día sube + `audit_events` en ambos movimientos.

**Se revoca el acceso de una persona del equipo**
`profiles.is_active` a falso. No se borra el usuario: sus actividades tienen `owner_id` con restricción de borrado, así que hay que reasignar antes de eliminar.

### 6.4 Qué pantalla del CRM sale de dónde

| Pantalla | Datos | Fuente |
| --- | --- | --- |
| Panel del día | tareas abiertas y vencidas | `vw_open_activities` |
| Embudo | tarjetas por etapa | `deals` donde `deleted_at` es nulo |
| Antigüedad del embudo | días en etapa | `vw_stage_age` sobre `deal_events` |
| Expediente 360 | encabezado, contactos, casillas, carteras, operaciones | `clients`, `contacts`, `compliance_items`, `custodial_wallets`, `transactions` |
| Cronología del expediente | qué pasó y cuándo | `activities` + `deal_events` + `communication_logs` + `audit_events` |
| Comunicaciones | plantillas y lo enviado | `communication_logs` |
| Límites del ECP | tope y consumo | `ecp_parameters` + `ecp_daily_usage` + `transactions` |
| Informe de validación | casillas y documentos | `compliance_items` + `documents` |

### 6.5 Errores que devuelve la base y qué significan

| Mensaje | Causa | Qué hacer |
| --- | --- | --- |
| "La casilla X requiere un documento adjunto antes de aprobarse" | Aprobar sin soporte documental | Subir el archivo y reintentar |
| "El asiento de auditoria es inmutable" | Alguien intentó corregir un asiento | Escribir un asiento nuevo que lo aclare |
| "invalid input value for enum activity_type" | El texto no está en la lista cerrada | Usar uno de los seis valores válidos |
| "new row violates row-level security policy" | El rol no puede escribir esa tabla | Cambiar de usuario o revisar la política |
| "no existe el perfil del usuario" (la app devuelve vacío) | Auth tiene el usuario pero `profiles` no | Crear el perfil con la llave de servicio o reejecutar el alta |

---

## 7. Qué falta todavía

1. **Ejecutarlo una vez.** Este SQL no ha corrido contra PostgreSQL. La primera pasada dirá si queda algo.
2. **La capa de repositorio** (`backend/src/data/repository.js`) que decida entre el almacén en memoria y Supabase, y devuelva el contrato que el frontend ya espera: el identificador visible como texto y los nombres de columna en formato camelCase (con mayúsculas internas).
3. **Puente de identidades**: la interfaz hoy usa `ECP-BOL-5577` como identificador; eso es la columna `code`, no `id`. Toda la lectura debe normalizar por `code`.
4. **Usuarios de Auth**: el sembrado no crea cuentas de acceso a propósito. Las cinco cuentas hay que darlas de alta con su rol en los metadatos.
5. **Prueba de la regla documental**: falta un caso real que suba un archivo al cubo y apruebe una casilla.
6. **Lo que este esquema no cubre todavía**: cotización de tipo de cambio, contabilidad doble, y el expediente de persona natural con documento de identidad por número en vez de NIT. Ninguno es necesario para la primera versión del CRM.

---

## 8. Modelo entidad-relación

### 8.1 Notación

Se usa pata de cuervo (**crow's foot**), el estándar de diagrama lógico de datos. El símbolo de la izquierda describe al padre visto desde el hijo; el de la derecha, al hijo visto desde el padre.

| Símbolo | Lectura | Equivalente `(mín,máx)` |
| --- | --- | --- |
| `‖` | uno y solo uno, obligatorio | `(1,1)` |
| `o\|` | cero o uno | `(0,1)` |
| `\|<` | uno o muchos | `(1,N)` |
| `o<` | cero o muchos | `(0,N)` |

`(mín,máx)` es la cardinalidad mínima y máxima: cuántas filas como mínimo y como máximo puede tener un extremo de la relación.

### 8.2 Inventario de entidades

| Entidad | Tipo | Clave primaria |
| --- | --- | --- |
| `auth.users` | externa (la administra Supabase) | `id` sustrogada (cadena aleatoria) |
| `profiles` | dependiente de `auth.users`: su clave es a la vez foránea | `id` = la del usuario |
| `clients` | fuerte, y centro del modelo | `id` sustrogada + `code` natural única |
| `contacts` | fuerte, dependencia en cascada | `id` sustrogada |
| `deals` | fuerte, dependencia en cascada | `id` sustrogada + `code` natural única |
| `deal_events` | fuerte con dependencia total de `deals` | `id` autonumérica |
| `activities` | fuerte | `id` sustrogada |
| `documents` | fuerte | `id` sustrogada + `storage_path` natural única |
| `communication_logs` | fuerte | `id` sustrogada |
| `tags` | fuerte | `id` sustrogada + `name` natural única |
| `client_tags` | **débil**, tabla de asociación muchos a muchos | compuesta `(client_id, tag_id)` |
| `compliance_items` | **débil**: la casilla no existe sin expediente | compuesta `(client_id, item_key)` |
| `screenings` | fuerte | `id` sustrogada |
| `custodial_wallets` | fuerte | `id` sustrogada + natural `(client_id, label)` |
| `transactions` | fuerte | `id` sustrogada + `code` natural única |
| `ecp_daily_usage` | de agregación: contador mantenido por el sistema | `day`, clave natural |
| `ecp_parameters` | de configuración, fila única | `id` con restricción `= 1` |
| `audit_events` | fuerte, transversal, inmutable | `id` autonumérica |
| `storage.objects` | externa (Storage de Supabase) | `(bucket_id, name)` |

Entidad **débil**: no tiene clave propia; su identificador incluye el de su padre, por eso la relación es identificadora y el borrado es en cascada.

### 8.3 Diagrama: las cuatro familias de relaciones

**Familia A, identidad.** Todo lo que se sabe de una persona del equipo vive en un solo sitio.

```
auth.users ‖——‖‖ profiles
                  ‖
                  ‖ 12 relaciones en total, todas del tipo "quién"
                  ‖
   ├─o< clients ............ dueño del expediente            >|
   ├─o< deals ............. ejecutivo responsable            >|
   ├─|< activities ........ responsable de la tarea          XR  (obligatoria)
   ├─o< activities ........ quien la creó                    >|  (la misma
   │                                                           entidad dos veces)
   ├─o< deal_events ...... quien movió la tarjeta            >|
   ├─o< documents ........ quien subió el archivo            >|
   ├─o< documents ........ quien lo revisó                  >|
   ├─o< compliance_items .. quien movió la casilla           >|
   ├─o< communication_logs quien envió                       >|
   ├─o< screenings ....... quien ejecutó el cotejo           >|
   ├─o< transactions ...... quien registró la operación      >|
   └─o< audit_events ...... actor del asiento                >|
```

`XR` (*restrict*, prohibido borrar) solo aparece una vez: en la tarea con responsable. Es la única relación cuyo padre no puede desaparecer sin antes reasignar a los hijos.

**Familia B, el expediente y sus satélites.** Diez relaciones de un mismo padre:

```
                              clients ‖   (1,1) para todos los hijos
                                 │
   ┌────────┬────────┬────────┬──┴────┬────────┬────────┬────────┬────────┐
   ▼        ▼        ▼        ▼       ▼        ▼        ▼        ▼        ▼
 contacts  deals  activities documents comms  comply  screenings wallets  trans-
                                          logs   _items                          actions

   todos (0,N)   ·   además: clients ‖——< client_tags >——‖ tags  (muchos a muchos)
```

Cada satélite apunta a `clients` con `(1,1)`: ningún contacto, actividad ni operación existe sin expediente. El expediente puede tener cero de cualquiera: `(0,N)`.

**Familia C, el embudo y la jornada.**

```
deals ‖——o< deal_events        (1:N en cascada, solo la escribe el disparador)
deals o|——o< activities        (una actividad puede no referirse a ninguna oportunidad)
contacts o|——o< activities     (ídem)
clients ‖——|< compliance_items (débil: clave compuesta, en cascada)
tags ‖——|< client_tags |——‖‖ clients   (muchos a muchos resuelto en tabla aparte)
```

**Familia D, pagos, medida y prueba.**

```
clients ‖——o< custodial_wallets        (dirección pública, nunca clave privada)
clients ‖——o< transactions >|——o| activities
transactions ─┈┈> ecp_daily_usage      (lógica, la une el disparador por fecha)
ecp_parameters ┈┈> ecp_daily_usage     (lógica: consumo contra tope)
documents ┈┈> storage.objects          (lógica: la ruta)
documents ┈┈> compliance_items         (lógica: la casilla que satisface)
audit_events ┈┈> cualquier entidad     (polimórfico deliberado, ver 8.5)
```

### 8.4 Matriz completa de las 31 relaciones impuestas

| # | Padre | Cardinalidad | Hijo | Rol que juega el padre | Borrado |
| --- | --- | --- | --- | --- | --- |
| 1 | `auth.users` | `(1,1)—(1,1)` | `profiles` | la cuenta de acceso | cascada |
| 2 | `profiles` | `(0,1)—(0,N)` | `clients` | dueño del expediente | puesto a vacío |
| 3 | `profiles` | `(0,1)—(0,N)` | `deals` | ejecutivo de la oportunidad | puesto a vacío |
| 4 | `profiles` | `(1,1)—(0,N)` | `activities` | responsable | **prohibido** |
| 5 | `profiles` | `(0,1)—(0,N)` | `activities` | autor | puesto a vacío |
| 6 | `profiles` | `(0,1)—(0,N)` | `deal_events` | quien movió la etapa | puesto a vacío |
| 7 | `profiles` | `(0,1)—(0,N)` | `documents` | quien subió | puesto a vacío |
| 8 | `profiles` | `(0,1)—(0,N)` | `documents` | quien revisó | puesto a vacío |
| 9 | `profiles` | `(0,1)—(0,N)` | `compliance_items` | quien movió la casilla | puesto a vacío |
| 10 | `profiles` | `(0,1)—(0,N)` | `communication_logs` | quien envió | puesto a vacío |
| 11 | `profiles` | `(0,1)—(0,N)` | `screenings` | quien cotejó | puesto a vacío |
| 12 | `profiles` | `(0,1)—(0,N)` | `transactions` | quien registró | puesto a vacío |
| 13 | `profiles` | `(0,1)—(0,N)` | `audit_events` | actor del asiento | puesto a vacío |
| 14 | `clients` | `(1,1)—(0,N)` | `contacts` | la cuenta del contacto | cascada |
| 15 | `clients` | `(1,1)—(0,N)` | `deals` | la cuenta comercial | cascada |
| 16 | `clients` | `(1,1)—(0,N)` | `activities` | la cuenta atendida | cascada |
| 17 | `clients` | `(1,1)—(0,N)` | `documents` | el expediente del archivo | cascada |
| 18 | `clients` | `(1,1)—(0,N)` | `communication_logs` | a quien se escribió | cascada |
| 19 | `clients` | `(1,1)—(0,N)` | `client_tags` | lado cuenta de la asociación | cascada |
| 20 | `clients` | `(1,1)—(1,N)` | `compliance_items` | expediente de la casilla | cascada |
| 21 | `clients` | `(1,1)—(0,N)` | `screenings` | expediente cotejado | cascada |
| 22 | `clients` | `(1,1)—(0,N)` | `custodial_wallets` | titular de la cartera | cascada |
| 23 | `clients` | `(1,1)—(0,N)` | `transactions` | ordenante | cascada |
| 24 | `tags` | `(1,1)—(0,N)` | `client_tags` | lado etiqueta de la asociación | cascada |
| 25 | `deals` | `(1,1)—(0,N)` | `deal_events` | oportunidad historizada | cascada |
| 26 | `deals` | `(0,1)—(0,N)` | `activities` | oportunidad de la actividad | puesto a vacío |
| 27 | `contacts` | `(0,1)—(0,N)` | `activities` | interlocutor atendido | puesto a vacío |
| 28 | `contacts` | `(0,1)—(0,N)` | `communication_logs` | destinatario | puesto a vacío |
| 29 | `contacts` | `(0,1)—(0,N)` | `screenings` | persona cotejada | cascada |
| 30 | `activities` | `(0,1)—(0,N)` | `communication_logs` | actividad que originó el mensaje | puesto a vacío |
| 31 | `activities` | `(0,1)—(0,N)` | `transactions` | actividad que originó la operación | puesto a vacío |

Lectura de la matriz: son **12 aristas hacia `profiles`** (la pregunta "quién"), **10 hacia `clients`** (la pregunta "de qué expediente"), 3 hacia `contacts`, 2 hacia `deals`, 2 hacia `activities` y 1 hacia `tags`. `clients` es la entidad de mayor grado: participa en 11 relaciones, 10 como padre y 1 como hijo.

### 8.5 Las seis relaciones lógicas, que la base no impone

No todas las uniones van por clave foránea. Estas seis existen en el diseño pero no están garantizadas por el motor:

| Unión | Cómo se sostiene | Por qué no es clave foránea |
| --- | --- | --- |
| `transactions` → `ecp_daily_usage` | disparador `transactions_daily_usage`, por fecha | es una agregación, no una fila padre |
| `documents` → `compliance_items` | coincidencia de `checklist_item_key`, vigilada por el disparador de aprobación | varios archivos por casilla: no hay columna donde poner la foránea |
| `documents.storage_path` → `storage.objects` | la ruta, más las políticas del cubo | la tabla destino es de Supabase, en otro esquema |
| `ecp_daily_usage` → `ecp_parameters` | comparación en la capa de consulta | son un contador y un tope, no dos entidades relacionadas |
| `audit_events.entity_id` → cualquier tabla | `entity_type` + `entity_id` escritos por la aplicación | **referencia polimórfica deliberada**: un asiento debe poder hablar de una cartera, una plantilla o un usuario sin que la base obligue a elegir una tabla |
| `communication_logs.template_id` → plantillas | texto libre, las plantillas viven en el conector de notificaciones | no son datos del CRM |

### 8.6 Claves

- **Sustrogada** (`id uuid`): todas las entidades de trabajo. No significa nada, no cambia, no se muestra.
- **Natural única**: `code` en expedientes, oportunidades y operaciones; `storage_path` en fichas de archivo; `name` en etiquetas; `email` en perfiles.
- **Compuesta, señal de entidad débil**: `compliance_items (client_id, item_key)` y `client_tags (client_id, tag_id)`.
- **Autonumerica de evento**: `deal_events.id` y `audit_events.id` son `bigint identity`, porque se leen en orden y no se referencian desde otra tabla.
- **De fila única**: `ecp_parameters` con `check (id = 1)` y `ecp_daily_usage` con `day` como clave.

### 8.7 Resumen en notación Chen

```
        ┌──────────┐   registra   ┌──────────┐
        │ profiles │─────────────<│ clients  │
        └────┬─────┘  (1:N)       └────┬─────┘
             │                         │
        atiende (1:N)            ┌────┴───────────────────────────┐
             │                   │        │        │       │      │
        ┌────▼─────┐         contacta   abre    atiende archiva revisa
        │activities│        (0:N)     (1:N)    (1:N)   (0:N)   (0:N)
        └──────────┘
   Verbos del modelo: registra (expediente), contacta (personas), abre
   (oportunidad), mueve (etapa), atiende (actividad), archiva (documento),
   satisface (casilla), aprueba (cumplimiento), custodia (cartera), ejecuta
   (transferencia), envía (comunicación), etiqueta (segmentación), deja
   asiento (auditoría).
```
