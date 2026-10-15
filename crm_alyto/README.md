# Alyto CRM | AV Finance S.R.L.

CRM financiero B2B para la operación de AV Finance S.R.L. dentro del Entorno Controlado de Pruebas (ECP) de la ASFI en Bolivia. Cubre tres funciones: embudo comercial de transferencias internacionales, debida diligencia institucional de expedientes corporativos y trazabilidad de pagos transfronterizos sobre Stellar Testnet.

El sistema corre completo sin credenciales externas: si no hay Supabase configurado, el backend usa un almacén en memoria sembrado con datos del ECP y tokens de sesión demo. Es el modo recomendado para revisar la interfaz.

---

## 1. Dónde está el proyecto

```
C:\Users\Denzel C\Documents\Qoder\2026-10-13\647fe3c5\crm_alyto
```

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
│   │   ├── controllers/       auth, clients, deals, compliance, communications, reports, notifications
│   │   ├── data/store.js      Almacén en memoria sembrado (modo demo del ECP)
│   │   ├── middleware/auth.js authenticate y requireRole desde la skill
│   │   ├── routes/            Montaje bajo /api
│   │   └── services/          stellarService, kycService, notificationService
│   ├── supabase/migrations/   Modelo de datos: 4 migraciones, 17 tablas, RLS y Storage
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
├── .github/workflows/ci.yml
└── docker-compose.yml
```

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

### 3.1 Modo demo sin base de datos (por defecto)

Si `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY` están vacíos, `supabase` es `null` y todo se sirve desde `backend/src/data/store.js`: 7 expedientes corporativos, sus deals de 6 etapas, wallets custodiales, transacciones, checklists de debida diligencia y auditoría.

Consecuencias a tener presente:

* Los cambios se ven en la interfaz al instante y persisten mientras el proceso vive.
* Al reiniciar el backend el almacén vuelve al estado sembrado original.
* Los tokens son del formato `demo.<base64url>.<secreto>` y cualquier contraseña habilita la sesión.

### 3.2 Modo Supabase (producción del ECP)

1. Crear el proyecto en el panel de Supabase y copiar la URL del proyecto, la `anon key` y la `service_role key`.
2. Abrir **SQL Editor** y ejecutar los cuatro archivos de `backend/supabase/migrations/` en orden numerado. Cada uno hace una capa: `0001` identidad y cuentas, `0002` núcleo del CRM (contactos, embudo, actividades, documentos, etiquetas), `0003` cumplimiento y pagos, `0004` seguridad a nivel de fila y almacén de archivos. En conjunto crean 17 tablas, 7 enums (listas cerradas de valores), 14 disparadores, 34 políticas de RLS sobre las tablas y 2 sobre el almacén de archivos, más el cubo `expedientes`. Equivale a `supabase db push` si se usa la interfaz de línea de comandos.
3. Ejecutar `backend/supabase/seed.sql`: carga los 7 expedientes del ECP, sus 7 oportunidades, representantes, carteras, las 5 transferencias y las 8 casillas de debida diligencia por expediente. Es idempotente.
4. Dar de alta los usuarios en **Authentication** (panel o `POST /auth/admin/v1/signup` con `user_metadata.role`). El disparador `on_auth_user_created` genera su fila en `public.profiles`; sin perfil no hay rol y el acceso queda vacío.
5. Rellenar `backend/.env`:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role>
SUPABASE_ANON_KEY=<anon>
```

6. Reiniciar el backend.

Consultas directas, si se prefiere cliente SQL:

```bash
psql "$SUPABASE_DB_URL" -c '\d public.clients' -c 'select * from public.audit_events order by id desc limit 10'
```

También se puede consultar desde el panel (Table Editor) o por la API REST que Supabase expone en `<SUPABASE_URL>/rest/v1/clients` con la cabecera `apikey: <anon>`.

Importante: el backend usa la `service_role key`, que esquiva RLS. Las políticas de `0004_security_and_storage.sql` son la segunda traba para cualquier acceso directo con la `anon key`; en el servidor la validación de permisos la hace `requireRole`. Mientras el backend siga leyendo de `store.js`, estas políticas no entran en juego: falta la capa de repositorio.

### 3.3 Matriz RLS resumida

Es lo que hace `0004`, tabla por tabla. "Autenticados" significa rol `authenticated` de Supabase.

| Tabla | Lectura | Escritura |
| --- | --- | --- |
| `profiles` | Autenticados | Solo la `service_role key`; el disparador `on_auth_user_created` la siembra |
| `clients` | Autenticados sin borrados | Alta: admin, compliance, operaciones, ventas. Edición: admin, compliance o el dueño |
| `contacts` | Autenticados sin borrados | admin, compliance, operaciones, ventas |
| `deals` | Autenticados sin borrados | admin, ventas, operaciones |
| `deal_events` | Autenticados | Solo el disparador `deals_stage_change` (función `security definer`) |
| `activities` | Autenticados sin borrados | Los cinco roles |
| `documents` | Autenticados sin borrados | Alta: cuatro roles. Revisión de estado: admin, compliance |
| `communication_logs` | Autenticados | Alta: admin, ventas, soporte |
| `tags` | Autenticados | admin, ventas |
| `client_tags` | Autenticados | admin, ventas, operaciones, compliance |
| `compliance_items` | Autenticados | Alta y edición: admin, compliance |
| `screenings` | Autenticados | Solo la `service_role key` |
| `custodial_wallets` | Autenticados | Alta: admin, operaciones |
| `transactions` | Autenticados | Alta y edición: admin, operaciones |
| `ecp_daily_usage` | Autenticados | Solo el disparador `register_daily_usage` |
| `ecp_parameters` | Autenticados | Edición: admin |
| `audit_events` | admin, compliance | Alta: autenticados. UPDATE y DELETE revocados y bloqueados por disparador |
| `storage.objects` (cubo `expedientes`) | admin, compliance, operaciones | Subida: admin, compliance, operaciones, ventas |

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

* `POST /api/auth/login` devuelve `{data:{token,user}}`. Con Supabase usa `signInWithPassword` y toma el rol de `app_metadata.role`; sin Supabase deriva el rol del prefijo del correo.
* El frontend guarda la sesión en `localStorage` bajo `alyto.ecp.session` y la restaura al recargar.
* Cada petición siguiente lleva `Authorization: Bearer <token>`; `authenticate` reconstruye `req.user` y `requireRole(...)` decide si la ruta procede.

Roles y accesos de demostración (en modo demo la contraseña es irrelevante):

| Correo | Rol | Alcance |
| --- | --- | --- |
| `admin@avfinance.bo` | Administrador | Todo, incluidas las descargas y el push de prueba |
| `compliance@avfinance.bo` | Oficial de Cumplimiento | Checklists, dictámenes, matriz de riesgo, auditoría |
| `operaciones@avfinance.bo` | Operaciones | Wallets, transacciones, fichas |
| `ventas@avfinance.bo` | Fuerza de Ventas B2B | Pipeline y expedientes en lectura |
| `soporte@avfinance.bo` | Atención y Soporte | Comunicaciones y catálogo de objeciones |

El prefijo se reconoce con `@`, `.`, `_`, `+` o `-`, así que `compliance.bolivia@avfinance.bo` también resuelve como Oficial de Cumplimiento. En la pantalla de acceso hay chips que autocompletan cada perfil.

### 4.3 Mapa de API

Todas las respuestas de éxito tienen forma `{data: ...}` y los errores `{error:{code,message}}`.

| Método y ruta | Rols | Propósito |
| --- | --- | --- |
| `POST /api/auth/login` | público | Crear sesión |
| `GET /api/auth/me` | cualquier rol | Sesión vigente |
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

* `compliance-agent`: sondeo cada 30 segundos, revisa expedientes con ítems observados o pendientes y deja asientos de auditoría usando un token de agente con rol `compliance` (mismo formato que `issueAgentToken` de la skill, derivado de `DEMO_AUTH_SECRET`).
* `pipeline-agent`: sondeo cada 45 segundos, audita coherencia entre etapa del deal y estado del checklist.
* `support-ai-agent`: interfaz CLI, `node agents/support-ai-agent/src/index.js "texto de la objeción"`. Devuelve la objeción emparejada del catálogo con verificación de conformidad de marca antes de responder.

Los dos agentes de sondeo se detienen con `Ctrl+C` y respetan `BACKEND_URL`, `POLL_INTERVAL_MS` y `AGENT_TOKEN` (si `AGENT_TOKEN` trae un valor real se usa ese; con `demo` o vacío se autogenera el token del agente).

### 4.7 Documentos PDF y notificaciones

`skills/pdf-generator` compone con pdfkit el membrete institucional, los datos del expediente, el hash de Stellar y un código QR de verificación; el backend responde el binario y el frontend lo guarda con `saveBlob`. `skills/logger-sentry` centraliza Winston (transporte de consola, JSON en producción) y Sentry (`SENTRY_DSN`), y normaliza errores al contrato `{error:{code,message}}`. El push requiere Firebase Admin o, en su defecto, las claves VAPID generadas con `npx web-push generate-vapid-keys`.

### 4.8 Tokens de marca

`frontend/src/styles/tokens.css` fija la paleta: azul principal `#0B1E36`, azul secundario `#1E3653`, amarillo de acento `#F3D014` y fondo `#F4F6F9`.

`frontend/src/utils/brandCopy.ts` y `mcp/notifications-mcp/src/index.js` aplican el glosario: siempre **transferencias internacionales** (nunca el término que el glosario prohíbe), siempre **bajo supervisión de ASFI** o **en el ECP de ASFI** (la licencia sigue en proceso, por lo que no se afirma que existe), siempre **custodia institucional** o **wallets custodiales**, sin comparaciones con otras entidades del ECP y sin guiones largos en los textos de interfaz.

### 4.10 Modelo de datos del CRM (Supabase)

Las cuatro migraciones de `backend/supabase/migrations/` describen el CRM en 17 tablas, agrupadas en cuatro capas. Los identificadores internos son `uuid` (clave primaria aleatoria); el número que ve el usuario (`ECP-BOL-5577`) vive en la columna `code`.

**Identidad y cuentas.** `profiles` (el rol real de cada usuario, creado por el disparador `on_auth_user_created` al nacer en Auth), `clients` (la cuenta o expediente: NIT, tipo de persona, estado KYC - *Know Your Customer*, debida diligencia del cliente, salud, volumen y cupo mensual, dueño del expediente) y `ecp_parameters` (una sola fila con los topes que fija ASFI - *Superintendencia de Bancos* de Bolivia - en el ECP - *Entorno Controlado de Pruebas*).

**Núcleo del CRM.** `contacts` (las personas detrás de la cuenta, con un único interlocutor principal), `deals` (la oportunidad en una de las 6 etapas), `deal_events` (historial de cada movimiento de etapa, alimentado por el disparador `deals_stage_change`; es la base de toda la medición), `activities` (llamada, reunión, visita, correo, tarea o nota, con dueño y vencimiento: la jornada de trabajo), `documents` (solo metadatos; el archivo está en el cubo privado `expedientes` de Storage), `communication_logs` (copia textual de lo enviado, para trazabilidad) y `tags` / `client_tags` (segmentación).

**Cumplimiento y pagos.** `compliance_items` (las 8 casillas de debida diligencia por expediente; una casilla que exige documento no puede aprobarse sin archivo adjunto, lo vigila el disparador `compliance_items_need_document`), `screenings` (cotejo contra listas restrictivas), `custodial_wallets`, `transactions` (transferencias internacionales, con los cinco estados canónicos validados por restricción de tabla), `ecp_daily_usage` (contador diario que convierte el tope en algo alertable, mantenido por `register_daily_usage`) y `audit_events` (asientos inmutables: UPDATE y DELETE están revocados y bloqueados por disparador).

**Medición.** Las vistas `vw_funnel_by_stage` (reparto del embudo), `vw_stage_age` (días que lleva una oportunidad en su etapa actual) y `vw_open_activities` (tareas pendientes ordenadas por vencimiento) se calculan al vuelo; no se guardan totales que se desactualizan.

Tres decisiones de modelado convienen al producto y no son negociables sin cambiar código: borrado lógico con `deleted_at` en las tablas de trabajo (un expediente nunca desaparece), `public_key` de las carteras sin columna para la clave privada (que no haya donde guardarla es la primera defensa), y `owner_id` obligatorio en las actividades (una tarea sin dueño no es una tarea).

Mientras el backend lea de `store.js`, este modelo no interviene. El puente es la capa de repositorio (`backend/src/data/repository.js`) que falta construir.

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
| `DEMO_AUTH_SECRET` | `ecp-demo`; cambiarlo en cualquier despliegue |
| `VITE_API_URL` | Frontend; el proxy de desarrollo ya resuelve `/api` |

---

## 6. Límites conocidos del entorno de demostración

* El almacén en memoria se reinicia con el proceso: no hay persistencia real hasta configurar Supabase.
* `node --watch` no recarga el código de las skills enlazadas por symlink; al editar `skills/*` hay que reiniciar el backend.
* Los pagos corren en **Stellar Testnet**: los montos no tienen valor económico.
* `stellar-connector` devuelve la clave privada de la wallet que crea, decisión válida para probar en Testnet pero que no debe llegar a producción; allí la firma debe quedarse en el servicio custodio y la respuesta exponer solo la clave pública.
* Los datos de expedientes, NIT y montos son ficticios y solo sirven para demostrar el flujo.
