# Plan de trabajo del CRM Alyto

Documento de parametrización. No es especificación de código ni bitácora: es el mapa de lo que se va a
construir, en qué orden y con qué criterio, para no volver a construir la cosa equivocada. La lista de
funcionalidades con su estado y su criterio de terminación está en `FUNCIONALIDADES.md`.

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

Proyecto Supabase del CRM: `crm-alyto-ecp`, región São Paulo. La URL del proyecto y las llaves no
van en este documento ni en el repositorio: viven en `backend/.env`, que está excluido de Git.
Solo tablas de CRM. Nada de la app de pagos. La remodelación decidida el 27/10 para adaptar la base
al CRM de mensajería está en `documentacion-interna/REMODELADO.md`, fuera de Git a propósito: es la
discusión de diseño, no una instrucción de despliegue.

| Grupo | Tablas | Nota |
| --- | --- | --- |
| Personas | `profiles`, `clients`, `contacts` | `clients` queda reducido a ficha mínima |
| Conversación | `conversations`, `messages`, `routing_rules` | reemplazan a `communication_logs` |
| Automatización | `templates`, `cadence_templates`, `cadence_steps`, `cadence_enrollments`, `cadence_executions` | la secuencia de 14 días |
| Vinculación | `compliance_item_defs`, `compliance_items`, `documents`, `screenings` | las 8 casillas del legajo |
| Comercial | `deals`, `deal_stages`, `deal_events`, `activities`, `tags`, `client_tags` | la RUTA B |
| Reclamos y riesgo | `claims`, `client_ecp_profile`, `ecp_parameters` | RUTA C y consumo financiero |
| Gobernanza | `blocked_terms`, `audit_events` | el filtro de lenguaje y la bitácora inalterable |

Veintiséis tablas, 17 tipos enumerados, 20 funciones, 25 disparadores, 56 políticas de seguridad por
fila (54 sobre las tablas y 2 sobre el cubo de archivos) y 9 vistas. El almacén de archivos del
legajo no es una tabla del CRM: es un cubo de
Supabase Storage que se crea desde el panel, porque `storage.objects` pertenece a un dueño interno.

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
3. El rol vive en `public.profiles`, y de ahí lo leen las políticas de RLS y el backend. El alta
   del panel de Auth no expone `app_metadata` (la bolsa que solo la llave de servicio escribe), así
   que los cinco usuarios nacen con el rol por defecto (`soporte`) y la sección 0 del `seed.sql` los
   coloca en su rol. El backend pregunta `public.current_role_name()` en cada petición; ya no
   interpreta el rol del token, porque un token de panel no trae rol y suponer uno dejaría
   `requireRole` sin significado. Sin perfil activo no hay sesión útil: responde 403.
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

Cerrada el 26/10: las 26 tablas aplicadas en el proyecto de Supabase del CRM, `verificacion.sql` con
sus 19 comprobaciones en `true`, y los nueve guardarraíles probados uno por uno en el panel. El
detalle paso por paso, los defectos que aparecieron al ejecutar y el control fuera de línea están en
`documentacion-interna/PLAN-notas-internas.md`, que no se sube al repositorio.

---

## 9. Orden de trabajo

| Fase | Entrega | Estado |
| --- | --- | --- |
| 0 | Este documento de parametrización | hecho |
| 1 | Reescritura del esquema: 0001 a 0004, más 0005 de almacenamiento y 0006 del diccionario | hecho |
| 2 | Ejecución de las migraciones en `crm-alyto-ecp` | hecho el 26/10 |
| 3 | `seed.sql` de demostración con conversaciones creíbles en los cuatro canales | hecho |
| 4 | Capa de repositorio contra Supabase, con cliente por petición que lleva el JWT | escrito y con pruebas; falta la corrida en vivo contra `crm-alyto-ecp` |
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

Ya cerrado: las sesiones firmadas y el guard de capa de datos están en Git; el tope del agente de
cumplimiento vale Bs 120.000, que es el del ECP; y los datos de demostración ya no citan
identificaciones regulatorias que no existen, sino la etiqueta `ECP de ASFI`.

Sigue abierto, y cada punto está anotado con su detalle en
`documentacion-interna/PLAN-notas-internas.md`: diez ficheros huérfanos por eliminar, dos hojas de
estilo con nombres casi idénticos, dos ficheros de Compose y un vocabulario de roles duplicado. Y
las pantallas siguen servidas por el almacén en memoria hasta que la Fase 8 reoriente las rutas
antiguas sobre las lecturas reales de la base.

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

**Decisiones de la Fase 1 que conviene tener a mano al comparar con el alcance anterior:**

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

---

## 13. La capa de datos: el puente a Supabase

Escrito el 26/10 por la noche, después de cerrar la Fase 2. Son cuatro lecturas y nada más.

**El camino.** `backend/src/data/repository.js` expone `inbox`, `conversacionesSla`,
`cadenciaPendiente` y `reclamosSla`, que son exactamente las cuatro vistas verificadas en el panel.
Cada lectura arma un cliente de Supabase nuevo para esa petición y nada más, con
`SUPABASE_ANON_KEY` como llave y el token de la sesión en la cabecera `Authorization`. Eso es lo
que hace que la seguridad a nivel de fila decida sobre quien mira: con la llave de servicio la base
respondería lo mismo para el administrador que para el agente, y el filtro por rol se perdería.

**Las rutas.** `GET /api/messaging/inbox`, `/sla`, `/cadencia`, `/reclamos` y `/` (que dice qué
lecturas hay y con qué usuario se está leyendo). Todas piden `authenticate` y `requireScopedRead`.
El límite se pasa por consulta con `?limit=`, tope 200 filas.

**Lo que a propósito no hay.** Estas rutas no tienen versión en memoria. Si faltan las variables o
la sesión no es de Supabase, contestan 503 o 401 con el motivo; nunca devuelven datos de
demostración mezclados con los de la base. Las rutas antiguas (`/clients`, `/transfers`, `/deals`
y compañía) siguen leyendo de `store.js` y eso es lo que la Fase 8 tiene que reemplazar.

**Lo que hace falta para correrlo.** En `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
(entrada y tareas de administración) y `SUPABASE_ANON_KEY` (las lecturas). Con esas tres puestas,
el inicio de sesión pasa a Supabase Auth y entra la contraseña real de la cuenta, no la de
demostración. El estado del backend se ve en `GET /api/health`, campo `runtime.dataLayer`, que
entonces dice `supabase (vistas)`; con `DEMO_MODE=true` además dice `y memoria`, que es la verdad
mientras las pantallas antiguas sigan en memoria.

**La salida esperada.** Con el sembrado del 26/10 y las políticas aplicadas: 13 filas en la
bandeja, 7 en nivel de servicio, 2 en cadencia pendiente y 3 en reclamos. Los números no dependen
del rol porque las políticas de lectura de `conversations`, `messages` y `clients` son abiertas para
cualquier usuario autenticado; lo que sí cambia por rol es escribir.

**El chequeo.** `npm run chequeo:datos -- <correo>` dentro de la carpeta `backend`, con el backend
levantado en otra ventana. Pide la contraseña por teclado para que no quede en el historial de la
terminal, y muestra los cuatro conteos de la base, uno por línea. Si algo falla, el motivo sale con
el código de estado y el mensaje que devolvió la base.
