# Alyto CRM | AV Finance S.R.L.

CRM financiero B2B para la operación de AV Finance S.R.L. dentro del Entorno Controlado de Pruebas (ECP) de la ASFI en Bolivia. Cubre tres funciones: embudo comercial de transferencias internacionales, debida diligencia institucional de expedientes corporativos y trazabilidad de pagos transfronterizos sobre Stellar Testnet.

El sistema corre completo sin credenciales externas: si no hay Supabase configurado, el backend usa un almacén en memoria sembrado con datos del ECP y tokens de sesión demo. Es el modo recomendado para revisar la interfaz.

---

## 1. Dónde está el proyecto

La carpeta `crm_alyto` del repositorio `DevAVF01/CRM_alyto`, en la rama `main`.

Árbol:

```
crm_alyto/
├── agents/
│   ├── compliance-agent/      Monitoreo de directrices ASFI y checklists
│   ├── pipeline-agent/        Automatización y auditoría del embudo en 6 etapas
│   └── support-ai-agent/      Catálogo de objeciones B2B con conformidad de marca
├── backend/                   Express 5, ESM, puerto 4000
│   ├── src/
│   │   ├── app.js             Middlewares, Sentry, Winston, rutas
│   │   ├── server.js          Punto de entrada
│   │   ├── config/            supabase.js, firebase.js
│   │   ├── controllers/       auth, clients, deals, compliance, communications, messaging, reports, notifications
│   │   ├── data/store.js      Almacén en memoria sembrado (modo demo del ECP)
│   │   ├── data/repository.js Las cuatro lecturas sobre las vistas, con la sesión del usuario
│   │   ├── middleware/auth.js authenticate y requireRole desde la skill
│   │   ├── routes/            Montaje bajo /api
│   │   └── services/          stellarService, kycService, notificationService
│   ├── supabase/migrations/   Modelo de datos: 6 migraciones, 26 tablas, RLS y Storage
│   ├── supabase/seed.sql      Datos de arranque del expediente del ECP
│   ├── supabase/legacy/       Borrador de esquema anterior, no se ejecuta
│   └── .env.example
├── docker/                    Dockerfile.backend, Dockerfile.frontend, nginx/default.conf
├── frontend/                  React 18 + Vite + TypeScript, puerto 5173
│   └── src/
│       ├── api/client.ts      Cliente HTTP con unwrap de {data} y descargas
│       ├── auth/AuthContext   Sesión, rol y persistencia en localStorage
│       ├── components/        Shell (sidebar/topbar) y primitivas ui
│       ├── data/mock.ts       Datos de demostración para el modo sin backend
│       ├── hooks/useApiData   Datos live con fallback y reinicio manual
│       ├── screens/           Login, Dashboard, Pipeline, Client360, Communications, Compliance
│       ├── styles/            tokens.css (paleta institucional) y global.css
│       └── utils/brandCopy.ts Glosario de marca y textos del ECP
├── mcp/
│   ├── stellar-connector/     Wallets custodiales y pagos, puerto 4601
│   ├── kyc-aml-connector/     Screening, checklist y directrices, puerto 4602
│   └── notifications-mcp/     Push VAPID, plantillas y guard de marca, puerto 4603
├── skills/
│   ├── pdf-generator/         pdfkit + qrcode
│   ├── logger-sentry/         Winston + Sentry + errorHandler
│   └── security-auth/         Tokens, RBAC y requireRole
├── docker-compose.yml
├── FUNCIONALIDADES.md         Alcance: las 38 funcionalidades, los 6 viajes y su orden
└── PLAN.md                    Mapa de trabajo, reglas de negocio y glosario
```

La integración continua no está dentro de esta carpeta: el repositorio de Git tiene su raíz un
nivel arriba, y GitHub solo lee los flujos de `.github/workflows` desde esa raíz. El flujo vive en
`../.github/workflows/ci.yml` y todas sus rutas llevan el prefijo `crm_alyto/`.

Requisitos: Node.js 20 o superior (verificado en v24.18.0) y npm.

---

## 2. Cómo correr la app

### 2.1 Instalación

`backend/package.json` declara las skills como dependencias locales (`file:../skills/*`), y npm las enlaza con symlinks. Por eso cada skill necesita sus propias dependencias instaladas antes de arrancar el backend.

```bash
cd crm_alyto

npm --prefix skills/security-auth install
npm --prefix skills/pdf-generator install
npm --prefix skills/logger-sentry install

npm --prefix backend install
npm --prefix frontend install

npm --prefix mcp/stellar-connector install
npm --prefix mcp/kyc-aml-connector install
npm --prefix mcp/notifications-mcp install
```

### 2.2 Arranque en desarrollo (cuatro terminales)

```bash
# Terminal 1: backend
npm --prefix backend run dev

# Terminal 2: conectores MCP
npm --prefix mcp/stellar-connector run dev
npm --prefix mcp/kyc-aml-connector run dev
npm --prefix mcp/notifications-mcp run dev

# Terminal 3: frontend
npm --prefix frontend run dev

# Terminal 4: agentes (opcional, son ciclos de sondeo)
node agents/compliance-agent/src/index.js
node agents/pipeline-agent/src/index.js
```

Abrir **http://localhost:5173**.

Para no repetir esas cinco órdenes cada día, `.vscode/tasks.json` ya trae la tarea compuesta **`crm_alyto: levantar todo`**, que abre los cinco servidores en terminales de respaldo. Se ejecuta con `Ctrl+Shift+P` → *Tasks: Run Task* → `crm_alyto: levantar todo`, o asignándole una clave en *Teclas de acceso rápido del menú de aplicaciones*. Para apagar: *Terminal: cerrar todo* (cierra las cinco terminales). La tarea usa `npm.cmd` a propósito: evita el error de PowerShell "la ejecución de scripts está deshabilitada", que bloquea `npm.ps1`. Las otras dos tareas útiles son **`crm_alyto: comprobar que el backend arranca`** y **`crm_alyto: comprobar tipos del frontend`**. No hay tarea de apagado automático: matar todos los procesos de Node de la máquina cerraría también VS Code.

En Windows Vite enlaza en `[::1]:5173`, así que usa `localhost` y no `127.0.0.1`. El proxy de Vite envía `/api` a `http://localhost:4000` (ver `frontend/vite.config.ts`), por lo que no hay que configurar CORS ni una URL base.

Puertos:

| Servicio | Puerto |
| --- | --- |
| Backend Express | 4000 |
| stellar-connector | 4601 |
| kyc-aml-connector | 4602 |
| notifications-mcp | 4603 |
| Frontend Vite | 5173 |
| Nginx (Docker) | 8080 |

### 2.3 Arranque con Docker

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

App en **http://localhost:8080**. Nginx sirve el bundle del frontend y hace proxy de `/api/` hacia `backend:4000` (ver `docker/nginx/default.conf`). El compose resuelve los conectores por nombre de servicio, no por `localhost`.

Nota: Docker no está disponible en el entorno donde se desarrolló este proyecto, así que las imágenes se escribieron y validaron por sintaxis, pero no se construyeron aquí.

### 2.4 Verificaciones

```bash
npm --prefix backend run verify      # importa la app sin levantar el servidor
npm --prefix frontend run typecheck  # tsc --noEmit
npm --prefix frontend run build      # bundle de producción
```

---

## 3. Acceso a la base de datos

Hay dos caminos y el backend decide cuál usar en tiempo de arranque (`backend/src/config/supabase.js`).

### 3.1 Modo demostración del ECP (`DEMO_MODE=true`)

El modo demostración es explícito. Sin `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, y sin `DEMO_MODE=true` escrito literalmente, `backend/src/server.js` imprime `[ARRANQUE RECHAZADO]` y termina con código 1: una credencial mal escrita en un despliegue no abre el CRM en silencio.

Con `DEMO_MODE=true` activo, `backend/src/data/store.js` sirve 7 expedientes corporativos, sus oportunidades de 6 etapas, wallets custodiales, transacciones, checklists de debida diligencia y auditoría. El arranque lo avisa por log, `/api/health` lo reporta en `runtime`, y la interfaz lo muestra en una franja bajo la cabecera y en cada pastilla de estado.

Consecuencias a tener presente:

* Los cambios se ven en la interfaz al instante y persisten mientras el proceso vive; al reiniciar, el almacén vuelve al estado sembrado.
* Los datos sembrados son ficticios y varios identificadores regulatorios están pendientes de corregir (ver la lista de tareas abiertas). No ingresar información real de clientes en este modo.
* Las sesiones se firman con HMAC sobre `AUTH_SECRET` y caducan a las 12 horas. Solo entran los cinco correos de `backend/src/data/demoAccounts.js`, y solo con la contraseña de `DEMO_PASSWORD`. Ningún otro correo accede, aunque empiece con `admin`.
* Con `DEMO_MODE=false` las rutas antiguas responden `503 DATA_LAYER_NOT_CONFIGURED`: esos datos solo existen en el almacén en memoria. Las lecturas reales de la base (`/api/messaging`) no dependen de `DEMO_MODE` y piden las tres variables de Supabase.

### 3.2 Modo Supabase (producción del ECP)

1. Crear el proyecto en el panel de Supabase y copiar la URL del proyecto, la `anon key` (también llamada publishable) y la `service_role key`.
2. Abrir **SQL Editor** y ejecutar los seis archivos de `backend/supabase/migrations/` en orden numerado. Cada uno hace una capa: `0001` personas y cuentas, `0002` conversaciones y mensajería, `0003` cadencias, legajo, comercial y reclamos, `0004` seguridad a nivel de fila y privilegios, `0005` el cubo de archivos, `0006` el glosario de términos. En conjunto crean 26 tablas, 17 enums (listas cerradas de valores), 25 disparadores, 20 funciones, 56 políticas de RLS (54 sobre las tablas y 2 sobre el cubo de archivos) y 9 vistas. Equivale a `supabase db push` si se usa la interfaz de línea de comandos.
3. Ejecutar `backend/supabase/seed.sql`: carga los 9 clientes del ECP, sus contactos, las 13 conversaciones con los 42 mensajes, las cadencias con sus ejecuciones, el legajo de ocho casillas por cliente, los documentos, los reclamos y el diccionario de términos. Es idempotente, y termina con las 19 comprobaciones de `verificacion.sql`.
4. Dar de alta los usuarios en **Authentication** (panel o `POST /auth/admin/v1/signup` con `app_metadata.role`; nunca `user_metadata`, porque ese campo lo puede escribir el navegador). El disparador `on_auth_user_created` genera su fila en `public.profiles`; sin perfil no hay rol y el acceso queda vacío. El alta desde el formulario del panel no rellena `app_metadata`, así que la fila nace con el rol por defecto y `seed.sql` deja los cinco correos corporativos con el rol que corresponde.
5. Rellenar `backend/.env`:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role>
SUPABASE_ANON_KEY=<anon>
DEMO_MODE=false
AUTH_SECRET=<hex de 64, sigue siendo obligatorio para emitir tokens de agente>
```

6. Reiniciar el backend.

Consultas directas, si se prefiere cliente SQL:

```bash
psql "$SUPABASE_DB_URL" -c '\d public.clients' -c 'select * from public.audit_events order by id desc limit 10'
```

También se puede consultar desde el panel (Table Editor) o por la API REST que Supabase expone en `<SUPABASE_URL>/rest/v1/clients` con la cabecera `apikey: <anon>`.

Importante: la `service_role key` esquiva la seguridad a nivel de fila, así que el backend solo la
usa para iniciar sesión y para las tareas de administración. Las lecturas del CRM de mensajería
(`/api/messaging`, ver `PLAN.md` sección 13) arma un cliente por petición con la `anon key` y el
token del usuario, de modo que lo que cada agente ve es lo que sus permisos dejan ver. La
validación de permisos de ruta la hace `requireRole`, y la de filas la base.

### 3.3 Seguridad a nivel de fila

Son 54 políticas sobre las 26 tablas más las dos del cubo de archivos, y están escritas en
`0004_security_and_privileges.sql`. La matriz tabla por tabla, generada desde la base ya ejecutada,
está en `backend/supabase/DIAGRAMA.md`. "Autenticados" significa rol `authenticated` de Supabase.

Las cuatro trabas que conviene tener claras, porque son las que respondió Álvaro en la revisión:

- `audit_events` no se puede modificar ni borrar: el disparador lo rechaza, y revocar el permiso es
  la segunda capa.
- `deal_events` y las filas ya escritas de `messages` las mantiene el sistema; una edición directa
  contesta `Esta tabla la mantiene el sistema`.
- Un mensaje saliente con un término del glosario en severidad de bloqueo no se escribe, y el mismo
  texto entrante sí, porque hay que conservar lo que dijo el cliente.
- Una casilla del legajo que pide documento no se puede aprobar sin documento.

El historial de las nueve pruebas negativas corridas en el panel, con el código de error de cada
una, está en `backend/supabase/pruebas-negativas.sql`.

---

## 4. Cómo funciona el sistema

### 4.1 Flujo general

```
Navegador (React)
  └─ /api/*  ── Vite proxy o Nginx ──▶ Backend Express 5 (4000)
                ├─ skill security-auth .... authenticate + requireRole
                ├─ skill logger-sentry .... Winston + Sentry + errorHandler
                ├─ skill pdf-generator .... comprobantes y fichas PDF
                ├─ data/store.js .......... almacén demo del ECP
                └─ Supabase (si está configurado)
                     ├─ HTTP ──▶ stellar-connector (4601) wallets y pagos Testnet
                     ├─ HTTP ──▶ kyc-aml-connector (4602) screening y directrices ASFI
                     └─ HTTP ──▶ notifications-mcp (4603) push VAPID y plantillas
```

Las pantallas nunca llaman a los conectores: siempre pasan por el backend, que es donde se valida el rol y se deja asiento de auditoría.

### 4.2 Autenticación y roles

* `POST /api/auth/login` devuelve `{data:{token,user}}`. Con Supabase usa `signInWithPassword` y el `token` es el JWT que la base reconoce. El rol no sale del token: se lee de la fila `profiles` con `public.current_role_name()`, una vez por petición y con el token del propio usuario, que es lo que hace que `requireRole` y las políticas de RLS opinen lo mismo. Si la base no devuelve un rol activo, el acceso responde 403 con `PROFILE_WITHOUT_ROLE` en lugar de suponer uno. En modo demostración busca el correo en `demoAccounts.js` y verifica `DEMO_PASSWORD`. Si el correo no está en la lista, o la contraseña no coincide, responde 401. No hay tercer camino: sin Supabase y sin `DEMO_MODE` responde 503.
* Las sesiones que firma el propio CRM (los cinco correos en demostración y los tokens de agente, que empiezan con `v1.`) se validan con `AUTH_SECRET` y siguen validando con Supabase montado. Un JWT de Supabase nunca lleva ese prefijo, así que los dos caminos no se confunden.
* El frontend guarda la sesión en `localStorage` bajo `alyto.ecp.session` y la restaura al recargar, pero la valida contra `GET /api/auth/me`; ante un 401 la descarta y devuelve al formulario de acceso.
* Cada petición siguiente lleva `Authorization: Bearer <token>`. En modo demostración el token es `v1.<base64url de la carga>.<firma HMAC SHA-256>` y se verifica con comparación de tiempo constante antes de poblar `req.user`; `requireRole(...)` decide si la ruta procede.

Roles y accesos de demostración (los cinco correos, con la contraseña de `DEMO_PASSWORD`):

| Correo | Rol | Alcance |
| --- | --- | --- |
| `admin@avfinance.bo` | Administrador | Todo, incluidas las descargas y el push de prueba |
| `compliance@avfinance.bo` | Oficial de Cumplimiento | Checklists, dictámenes, matriz de riesgo, auditoría |
| `operaciones@avfinance.bo` | Operaciones | Wallets, transacciones, fichas |
| `ventas@avfinance.bo` | Fuerza de Ventas B2B | Pipeline y expedientes en lectura |
| `soporte@avfinance.bo` | Atención y Soporte | Comunicaciones y catálogo de objeciones |

La lista es cerrada y el rol sale de ella, no del texto del correo: `admin@atacante.com` recibe 401. En la pantalla de acceso hay chips que autocompletan cada perfil, sin autocompletar la contraseña.

### 4.3 Mapa de API

Todas las respuestas de éxito tienen forma `{data: ...}` y los errores `{error:{code,message}}`.

| Método y ruta | Roles | Propósito |
| --- | --- | --- |
| `POST /api/auth/login` | público | Crear sesión |
| `GET /api/auth/me` | cualquier rol | Sesión vigente |
| `GET /api/messaging` | cualquier rol | Qué lecturas hay y con qué usuario se leen |
| `GET /api/messaging/inbox` | cualquier rol | Bandeja real: la vista `vw_inbox` de la base |
| `GET /api/messaging/sla` | cualquier rol | Hilos abiertos con sus horas hábiles sin atención |
| `GET /api/messaging/cadencia` | cualquier rol | El paso pendiente de cada cadencia activa |
| `GET /api/messaging/reclamos` | cualquier rol | Reclamos con su plazo y su semáforo |
| `GET /api/meta/stages` | cualquier rol | Las 6 etapas del embudo |
| `GET /api/clients` | cualquier rol | Expedientes corporativos |
| `GET /api/clients/:id` | cualquier rol | Detalle 360: wallets, transacciones y deal |
| `GET /api/transfers` | cualquier rol | Transferencias internacionales registradas |
| `GET /api/deals`, `POST /api/deals` | ventas, operaciones, admin | Embudo |
| `PATCH /api/deals/:id/stage` | ventas, operaciones, admin | Mover tarjeta de etapa |
| `GET /api/compliance/summary` | cualquier rol | KPIs de debida diligencia |
| `GET /api/compliance/limits` | cualquier rol | Límites del ECP y matriz de riesgo UIF |
| `GET /api/compliance/directrices` | cualquier rol | Directrices desde el conector KYC/AML |
| `GET /api/compliance/checklist/:clientId` | cualquier rol | Checklist del expediente |
| `POST /api/compliance/checklist/:clientId/items/:itemKey` | admin, compliance | Cambiar estado de un ítem |
| `GET /api/compliance/audit` | cualquier rol | Asientos de auditoría |
| `POST /api/compliance/audit` | admin, compliance | Registrar asiento |
| `GET /api/communications/templates`, `/objections` | cualquier rol | Plantillas y catálogo de objeciones |
| `POST /api/communications/send` | admin, ventas, soporte | Renderizar plantilla, auditar y enviar push |
| `POST /api/reports/transfer-receipt` | admin, operaciones, ventas | Comprobante PDF de la operación test |
| `GET /api/reports/validation-sheet/:clientId` | admin, compliance | Ficha de validación documental en PDF |
| `GET /api/notifications/vapid-public-key` | cualquier rol | Clave pública VAPID |
| `POST /api/notifications/subscriptions`, `/test-push` | cualquier rol | Suscripción y prueba de push |

### 4.4 Las cuatro vistas y su fuente de datos

Cada pantalla llama a la API real y, si el backend no responde, cae a `frontend/src/data/mock.ts`. La pastilla del encabezado indica en todo momento **API conectada** o **Modo demostración**, y el topbar ofrece recargar.

* **Dashboard**: transferencias y expedientes en vivo, con cuatro filtros por estado y navegación directa a las demás vistas.
* **Pipeline**: tablero Kanban de las 6 etapas, con cambio de etapa optimista (si la API rechaza, la tarjeta vuelve a su columna y se muestra el motivo) y alta de prospectos.
* **Cliente 360**: ficha del expediente con edición del checklist documental, descarga de la ficha de validación y registro de la operación test con su comprobante.
* **Comunicaciones**: selección de destinatario, plantilla u objeción, variables y canal; el envío devuelve el número de asiento de auditoría generado en el backend.
* **Cumplimiento**: resumen de debida diligencia, directrices del conector KYC/AML, límites operativos del ECP (630 usuarios y 630 operaciones por día, monto máximo por operación), matriz de riesgo UIF calculada sobre los expedientes reales y registro de auditoría.

### 4.5 Conectores MCP

* **stellar-connector (4601)**: `POST /wallets` crea la wallet custodial y financia con friendbot en Testnet, `GET /wallets/:publicKey` consulta balances, `POST /payments` ejecuta la transferencia y devuelve hash, `GET /payments` lista la trazabilidad.
* **kyc-aml-connector (4602)**: `POST /screening` contra listas restrictivas, `POST /due-diligence/checklist` construye el checklist del expediente, `GET /directrices/asfi-ecp` entrega las directrices que muestra la pantalla de Cumplimiento.
* **notifications-mcp (4603)**: `GET /vapid-public-key`, `POST /push/subscribe`, `POST /push/send`, `GET /templates`, `POST /templates/render`. Este conector además rechaza textos que incumplen el glosario de marca con `BRAND_VIOLATION` (400).

Para probar un conector aislado: `curl http://localhost:4602/health`.

### 4.6 Agentes

* `compliance-agent`: sondeo cada 30 segundos, revisa expedientes con ítems observados o pendientes y deja asientos de auditoría usando el token que le entrega `AGENT_TOKEN`. El agente no conoce la clave de firma: si falta `AGENT_TOKEN` el proceso se detiene. El token se emite desde el backend con `npm run agent-token compliance-agent`.
* `pipeline-agent`: sondeo cada 45 segundos, audita coherencia entre etapa del deal y estado del checklist.
* `support-ai-agent`: interfaz CLI, `node agents/support-ai-agent/src/index.js "texto de la objeción"`. Devuelve la objeción emparejada del catálogo con verificación de conformidad de marca antes de responder.

Los dos agentes de sondeo se detienen con `Ctrl+C` y respetan `BACKEND_URL`, `POLL_INTERVAL_MS` y
`AGENT_TOKEN`. Ese token no se autogenera: hay que firmándolo con `npm run agent-token --
<agente>` dentro de `backend` y ponerlo en el `.env` del agente. Sin token, o con un token que no
pasa la firma, el agente no llama a la API.

### 4.7 Documentos PDF y notificaciones

`skills/pdf-generator` compone con pdfkit el membrete institucional, los datos del expediente, el hash de Stellar y un código QR de verificación; el backend responde el binario y el frontend lo guarda con `saveBlob`. `skills/logger-sentry` centraliza Winston (transporte de consola, JSON en producción) y Sentry (`SENTRY_DSN`), y normaliza errores al contrato `{error:{code,message}}`. El push requiere Firebase Admin o, en su defecto, las claves VAPID generadas con `npx web-push generate-vapid-keys`.

### 4.8 Tokens de marca

`frontend/src/styles/tokens.css` fija la paleta: azul principal `#0B1E36`, azul secundario `#1E3653`, amarillo de acento `#F3D014` y fondo `#F4F6F9`.

`frontend/src/utils/brandCopy.ts` y `mcp/notifications-mcp/src/index.js` aplican el glosario: siempre **transferencias internacionales** (nunca el término que el glosario prohíbe), siempre **bajo supervisión de ASFI** o **en el ECP de ASFI** (la licencia sigue en proceso, por lo que no se afirma que existe), siempre **custodia institucional** o **wallets custodiales**, sin comparaciones con otras entidades del ECP y sin guiones largos en los textos de interfaz.

### 4.10 Modelo de datos del CRM (Supabase)

Las seis migraciones de `backend/supabase/migrations/` describen el CRM de mensajería en 26 tablas:
17 tipos enumerados, 20 funciones, 25 disparadores, 56 políticas de seguridad por fila y 9 vistas.
Los identificadores internos son `uuid` (clave primaria aleatoria); el número que ve el usuario
vive en la columna `code`. La matriz completa, generada desde la base ya ejecutada, está en
`backend/supabase/DIAGRAMA.md`.

**Personas.** `profiles` (el rol real de cada usuario, creado por el disparador `on_auth_user_created`
al nacer en Auth), `clients` (la cuenta, con el identificador visible, el tipo de persona y la etapa
de ingreso) y `contacts` (las personas detrás de la cuenta, con un único interlocutor principal).

**Conversación, que es el objeto central.** `conversations` (un hilo por cliente y canal, con cola,
prioridad, asignación y los marcadores de tiempo que alimentan el nivel de servicio), `messages`
(cada mensaje entrante o saliente, con su canal y su marca de glosario) y `routing_rules` (qué tipo
de consulta va a qué cola).

**Automatización comercial.** `templates` (las plantillas auditadas, con su texto literal aprobado),
`cadence_templates`, `cadence_steps`, `cadence_enrollments` y `cadence_executions`: la secuencia de
14 días en seis pasos, con el disparador que no deja escribir un paso antes del día del anterior.

**Rutas A y C.** `compliance_item_defs` y `compliance_items` (las ocho casillas del legajo; una que
exige documento no se aprueba sin archivo, lo vigila `require_document_for_approval`), `documents`,
`screenings`, `client_ecp_profile` (estado del usuario en el ECP, riesgo y topes declarados) y
`ecp_parameters` (una sola fila con los topes y el horario hábil; el tope por operación es
Bs 120.000).

**Comercial y reclamos.** `deals`, `deal_stages`, `deal_events` (el historial de etapas lo escribe el
sistema, nunca una inserción directa), `activities`, `tags`, `client_tags` y `claims` (con su plazo,
su semáforo y la traba de cerrarlos con resolución escrita).

**Gobernanza.** `blocked_terms` (el diccionario del glosario, severidad de bloqueo o advertencia) y
`audit_events` (asientos inmutables: UPDATE y DELETE están revocados y bloqueados por disparador).

**Medición.** `vw_inbox`, `vw_conversations_sla`, `vw_cadence_pending`, `vw_claims_sla`,
`vw_messages_flagged`, `vw_compliance_progress`, `vw_funnel_by_stage`, `vw_stage_age` y
`vw_open_activities` se calculan al vuelo; no se guardan totales que se desactualizan.

Tres decisiones de modelado convienen al producto y no son negociables sin cambiar código: borrado
lógico con `deleted_at` en las tablas de trabajo (un hilo nunca desaparece), las etiquetas del legajo
y de las etapas en la base y no repetidas en la interfaz, y `owner_id` obligatorio en las
actividades (una tarea sin dueño no es una tarea).

Las lecturas de la base ya están construidas (`backend/src/data/repository.js`, sección 13 de
`PLAN.md`). Las pantallas siguen leyendo de `store.js` hasta la Fase 8.

---

## 5. Configuración opcional

`backend/.env.example` documenta todas las variables. Resumen:

| Variable | Efecto si se deja vacía |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Modo demo con el almacén en memoria |
| `FIREBASE_*` | Sin push por FCM; queda VAPID si defines las claves |
| `SENTRY_DSN` | Sin reporte de errores a Sentry, Winston sigue activo |
| `MCP_*_URL` | Apunta a `localhost:4601/4602/4603` |
| `VAPID_*` | El push de prueba informa que no hay canal configurado |
| `DEMO_MODE` | `true` solo para el almacén en memoria; sin él y sin Supabase el backend no arranca |
| `AUTH_SECRET` | obligatorio con `DEMO_MODE=true`, mínimo 32 caracteres; firma las sesiones y los tokens de agente |
| `DEMO_PASSWORD` | contraseña única de las cinco cuentas de demostración, mínimo 8 caracteres |
| `VITE_API_URL` | Frontend; el proxy de desarrollo ya resuelve `/api` |

---

## 6. Límites conocidos del entorno de demostración

* El almacén en memoria se reinicia con el proceso: no hay persistencia real hasta configurar Supabase.
* `node --watch` no recarga el código de las skills enlazadas por symlink; al editar `skills/*` hay que reiniciar el backend.
* Los pagos corren en **Stellar Testnet**: los montos no tienen valor económico.
* `stellar-connector` devuelve la clave privada de la wallet que crea, decisión válida para probar en Testnet pero que no debe llegar a producción; allí la firma debe quedarse en el servicio custodio y la respuesta exponer solo la clave pública.
* Los datos de expedientes, NIT y montos son ficticios y solo sirven para demostrar el flujo.
