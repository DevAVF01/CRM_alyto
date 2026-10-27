# Funcionalidades del CRM Alyto

Documento de alcance. Define qué hace el CRM, con qué criterio se considera terminado y qué
estado tiene cada pieza. El diseño de la base está en `backend/supabase/DIAGRAMA.md`, el orden de
trabajo y las reglas en `PLAN.md`, y las rutas con sus roles en `README.md`. Este fichero es la
lista contra la que se mide el avance.

## 1. Cómo leer los estados

| Estado | Significado |
| --- | --- |
| en uso | Corre sobre el almacén de demostración y se ve en la interfaz |
| escrito sin correr | El código existe y pasa sus pruebas, pero nunca respondió contra la base de Supabase |
| parcial | Una parte funciona y la otra no está |
| modelado sin pantalla | La tabla o la vista está aplicada en la base y verificada; no hay código ni interfaz que la usen |
| por construir | No hay nada: ni código ni modelo |
| aplazada | Definida, pero fuera de los bloques de esta etapa por decisión |

El almacén de demostración es `backend/src/data/store.js`: datos ficticios en memoria para poder
mostrar la interfaz sin base de datos. Ninguna funcionalidad termina en ese almacén; termina
contra las tablas del CRM.

## 2. El límite con la aplicación de pagos

La aplicación de pagos de Alyto ya funciona y sigue su propio camino. El CRM no es otra aplicación
de pagos: es la bandeja de operaciones y servicio de ese negocio. De ahí la regla de separación.

**Es del CRM:** conversaciones y mensajes, contactos y clientes corporativos con su legajo,
cadencias y plantillas, rutas de vinculación, reclamos y nivel de servicio, auditoría, perfiles de
usuario y sus roles, parámetros del entorno de pruebas.

**Es de la aplicación de pagos, y el CRM solo lo lee:** wallets, transacciones, saldos, uso diario,
cupos, tipo de cambio y la contabilidad de la operación.

**Cómo se lee:** por interfaz, con el identificador del cliente como llave, y todo valor que venga
de afuera lleva etiqueta de origen en pantalla. El CRM no copia esas tablas ni las rellena.

**Esta interfaz está aplazada.** El CRM se define y se construye solo, sin depender de la
aplicación de pagos, porque la aplicación de pagos ya funciona y no hay por qué frenar el CRM por
ella. `F-22` queda documentada y fuera de los bloques de trabajo de esta etapa. Cuando llegue el
momento de montar el CRM sobre lo que ya opera, se retoma sin reescribir nada de lo de acá.

Lo que no cambia con la aplazada: la regla de que el CRM no duplica wallets ni transacciones, y la
costumbre de etiquetar el origen de todo dato que venga de afuera.

## 3. Catálogo

### Acceso, seguridad y cuentas

**F-01 Entrar y salir.** Correo y contraseña, sesión que caduca a las 12 horas, roles visibles en la
interfaz. Estado: en uso en modo demostración. Falta la corrida con Supabase Auth. Criterio: los
cinco perfiles entran, un correo que no está en la lista responde 401, y sin credenciales el
servidor no arranca.

**F-02 Roles y permisos.** Cinco roles, cada uno con su cola. La seguridad a nivel de fila está
aplicada y verificada en la base. Estado: escrito sin correr. El defecto que dejaba a todos como
ventas está corregido: el backend lee el rol de la fila `profiles` con `public.current_role_name()`
en cada petición y con el token del propio usuario, así que el guarda de ruta y las políticas opinan
igual. Si la base no devuelve un rol activo responde 403 en lugar de suponer uno. Las sesiones que
firma el CRM, que son las de los agentes, siguen valiendo con la base montada; sin ese arreglo, el
día del cambio compliance-agent y pipeline-agent se quedaban fuera. Falta la corrida en vivo con
Supabase Auth.

**F-03 Administración de cuentas.** Alta, cambio de rol y baja de personal. No hay autorregistro en
la pantalla de acceso, así que la carga la hace la administración. Estado: por construir. Criterio:
el alta deja al usuario con el rol correcto en un solo paso y queda anotada en la auditoría.

### Mensajería, que es el producto

**F-04 Bandeja unificada.** Todas las conversaciones abiertas en una lista con filtros por canal,
rol, cliente y estado, ordenadas por antigüedad del último mensaje. Estado: escrito sin correr. La
lectura existe sobre la vista `vw_inbox` (13 filas de prueba) en `GET /api/messaging/inbox`; no hay
pantalla. Esta es la funcionalidad principal del CRM.

**F-05 Hilo de una conversación.** Ver los mensajes entrantes y salientes de un cliente en orden
cronológico, con su estado de entrega. Estado: por construir. Está modelado en `conversations` y
`messages`, no hay endpoint.

**F-06 Responder.** Composer con plantillas disponibles y bloqueo de términos antes de enviar.
Estado: parcial. `POST /communications/send` renderiza, audita y envía, pero sobre el almacén de
demostración y sin escribir en `messages`. Criterio: la respuesta queda en la base, audita y no
sale si incumple el glosario.

**F-07 Interfaz de canales.** Un solo contrato por el que sale cualquier mensaje, sea correo,
WhatsApp, chat o redes, con su estado de entrega. Estado: por construir. Hoy solo existe el tipo de
dato `channel_kind` en la base y la columna `channel_conv_id` para deduplicar por hilo. Sus tres
implementaciones son F-25, F-26 y F-27. Criterio: añadir un canal nuevo no obliga a tocar el motor
de viajes ni la bandeja.

### Nivel de servicio y cadencia

**F-08 Nivel de servicio de 2 horas.** Alerta cuando un mensaje lleva dos horas sin atención dentro
del horario laboral. Estado: escrito sin correr. La vista `vw_conversations_sla` da 7 filas y su
lectura está hecha; falta la pantalla y el semáforo. El horario vive en la tabla de parámetros, no
quemado en el código.

**F-09 Cadencia de 14 días.** Los seis pasos con sus tres textos preaprobados, fecha del próximo
contacto y cierre de ciclo a "En pausa" o "No contactado". Estado: parcial. Modelado y con vista
`vw_cadence_pending` (2 filas) leíble; no hay generador de pasos ni cola. Criterio: al inscribir un
contacto se crean los seis pasos con su fecha, y al vencer el día 14 la cadencia cierra sola.

**F-10 Plantillas versionadas.** Banco de textos con versión y aprobación de cumplimiento. Estado:
parcial. Las tres plantillas están sembradas y se listan; no hay versionado ni aprobación, y la
pantalla aún toma algunas listas del fichero de datos ficticios.

### Cumplimiento, reclamos y auditoría

**F-11 Filtro de términos de marca.** Estado: escrito sin correr. La contradicción está resuelta en
el código: el guarda de texto lee el diccionario de la tabla `blocked_terms` (con caché de cinco
minutos) y solo usa su lista interna cuando no hay base conectada, que es el caso del modo
demostración y de las pruebas. Del diccionario de la base solo bloquea la severidad `bloqueo`; la
`advertencia` pasa y se ve en `vw_messages_flagged`, que es la misma regla que aplica el disparador
`messages_language_guard` al escribir el mensaje. El guarda está montado en
`POST /communications/send`, delante del envío, porque las variables de una plantilla las escribe
una persona. Criterio: añadir un término en la base lo bloquea sin desplegar, y se comprueba con una
inserción en `blocked_terms` seguida de un intento de envío.

**F-12 Enrutado por tipo de consulta.** Cuatro categorías: Soporte Técnico, Registro y KYC, Empresa
B2B, Reclamos. Estado: parcial. El enum y la lógica del agente existen; el enrutado no decide nada
en la bandeja porque la bandeja no tiene pantalla.

**F-13 Reclamos del consumidor financiero.** Registro por categoría, plazo de respuesta y semáforo.
Estado: escrito sin correr. Vista `vw_claims_sla` con 3 filas y su lectura hecha; sin pantalla. El
plazo legal sigue sin dato confirmado y el campo `due_at` queda vacío a propósito: no se inventa.

**F-14 Cumplimiento y debida diligencia.** Checklist, matriz de riesgo y directrices. Estado: en uso
sobre el almacén de demostración. Criterio de salida: leer las mismas cifras de las tablas reales.

**F-15 Auditoría inalterable.** Quién hizo qué y cuándo, sin edición ni borrado posible. Estado: en
uso sobre el almacén de demostración; el disparador que impide modificar la tabla está aplicado y
verificado en la base. Falta la pantalla.

### Expediente del cliente

**F-16 Ficha 360.** Datos del cliente, legajo, historial de conversación y bloque de operaciones con
etiqueta de origen. Estado: en uso. Falta reorientarla: hoy muestra wallets y transacciones como si
fueran del CRM, y desde la separación de base esos datos llegan por interfaz.

**F-17 Rutas de vinculación en paralelo.** A documentación, B comercial, C riesgo y cupos, las tres a
la vez sobre un mismo cliente. Estado: por construir en pantalla; el modelo está en la base. El
embudo de seis etapas pasa a vivir dentro de la ruta B.

**F-18 Legajo de documentos.** Subida, revisión y trazabilidad de los documentos del expediente.
Estado: por construir. El cubo de almacenamiento existe, creado desde el panel; no hay interfaz de
carga ni de descarga.

### Documentos y notificaciones

**F-19 Documentos en PDF.** Ficha de validación y recibo de transferencia con su código QR. Estado:
en uso sobre el almacén de demostración. Criterio de salida: que se generen desde filas reales.

**F-20 Notificaciones push.** Aviso al personal cuando entra un mensaje o vence un plazo. Estado:
escrito sin correr. Los extremos existen y responden 200 con el conector levantado; sin él, ahora
responden 502 diciendo que notifications-mcp no contesta en su puerto, en lugar del 500 generico
que salia antes y que obligaba a leer el registro para saber que faltaba un proceso. Falta la clave
pública de las notificaciones del entorno de pruebas.

### Agentes

**F-21 Tres agentes.** Cumplimiento (glosario y enrutado), cadencia y soporte. Estado: parcial.
Escritos, con token obligatorio y con el tope por operación alineado al de la base. Falta correrlos
contra las vistas reales y que el tope se lea de la tabla de parámetros en vez de estar escrito.

### Plataforma

**F-22 Interfaz con la aplicación de pagos.** Estado: aplazada a propósito. Un conector con una
única implementación de demostración, que devuelva wallets, transacciones y cupos por cliente. No
entra en los bloques de esta etapa; ver el capítulo 2.

**F-23 Despliegue.** Estado: por construir. El empaque y el servidor web están escritos, la
integración continua corre, y no hay ningún entorno donde el CRM funcione para otra persona que no
sea quien lo levanta en su máquina. Criterio: una dirección accesible desde el navegador del
personal, con sus cuentas propias.

### Motor de viajes y salidas

**F-24 Motor de viajes.** El proceso que despierta, mira qué señal ocurrió y qué paso venció, y
produce el mensaje o la tarea que corresponde. Estado: por construir. En el backend no hay
planificador alguno. El molde existe afuera: `agents/pipeline-agent/src/index.js:72` es un bucle que
despierta cada intervalo y llama a la API. La decisión pendiente es si el motor vive en ese agente o
dentro del backend. Criterio: correr dos veces el mismo día no duplica un mensaje.

**F-25 Salir por correo.** Estado: por construir, y hoy imposible. `backend/package.json` no tiene
SMTP ni ningún servicio de correo. Criterio: un mensaje marcado para correo llega a una bandeja real
y su estado de entrega se anota en `messages`.

**F-26 Salir por WhatsApp Business.** Estado: por construir. El CRM busca ser omnicanal y no hay una
sola línea de código de WhatsApp en el repositorio: el canal vive solo en el tipo `channel_kind` y en
la columna `channel_conv_id`. Criterio: un entrante aparece solo en la bandeja y repetir el
identificador del hilo no duplica la conversación.

**F-27 Salir por chat y redes.** Estado: por construir. El mismo adaptador que F-26 con otro
proveedor. Se deja para el final porque no aporta nada que WhatsApp no cubra en la operación.

**F-28 Rastro de cada ejecución.** Estado: modelado sin uso. La tabla `cadence_executions` existe
para anotar qué viaje corrió, sobre qué fila, con qué resultado. Criterio: cualquier mensaje
automático se puede remontar hasta la señal que lo produjo.

### Operación diaria, que no es mensajería

**F-29 Asignar y traspasar una conversación.** Estado: por construir. `conversations` no tiene
dueño visible en pantalla. Criterio: un soporte puede pasarle un hilo a cumplimiento y los dos ven
quién lo atiende y desde cuándo.

**F-30 Actividades y notas internas.** Llamada, reunión, visita, tarea, con su vencimiento. Estado:
modelado sin pantalla. Existen `activities` y la vista `vw_open_activities` (actividades abiertas).
Criterio: la actividad abierta de hoy aparece en el panel del rol correspondiente.

**F-31 Etiquetas y segmentos.** Estado: modelado sin pantalla. Existen `tags` y `client_tags`.
Criterio: filtrar la bandeja por etiqueta y que el filtro se pueda guardar.

**F-32 Reglas de enrutamiento configurables.** Estado: modelado sin uso. Existe la tabla
`routing_rules`, y es donde debe vivir el enrutado por tipo de consulta en vez de estar escrito en
el agente. Criterio: cambiar la regla en la base cambia a quién le cae la siguiente consulta.

**F-33 Buscador.** Buscar por cliente, por texto de mensaje, por documento y por reclamo. Estado:
por construir. Criterio: desde cualquier pantalla, un resultado por cada cosa que se escriba.

**F-34 Métricas operativas.** Estado: parcialmente en uso. Existen las vistas `vw_funnel_by_stage`,
`vw_stage_age`, `vw_compliance_progress` y `vw_messages_flagged`, y ninguna pantalla las lee.
Criterio: cuatro números en el panel y que al hacer clic lleven a las filas que los forman.

**F-35 Vencimiento de documentos del legajo.** Estado: por construir. `documents` tiene la fila y el
estado; no hay revisión periódica ni aviso antes de vencer. Criterio: un documento por vencer
produce señal, y la señal produce el viaje.

**F-36 Base de conocimiento y respuestas sugeridas.** Estado: parcial. El agente de soporte tiene su
catálogo de objeciones en `agents/support-ai-agent`; no hay un cuerpo de respuestas aprobadas que el
composer sugiera mientras se escribe.

**F-37 Encuesta al cerrar.** Estado: por construir. Al cerrar un reclamo o una ruta, pedir la
calificación del cliente. Criterio: la respuesta queda en el expediente y en la métrica.

**F-38 Fuera de horario y ausencias.** Estado: por construir. El horario vive en `ecp_parameters` y
el nivel de servicio lo respeta, pero nadie responde al cliente que escribe un sábado. Criterio: el
acuse de recibo con plazo sale aunque no haya nadie atendiendo.

## 4. Viajes automáticos

Una funcionalidad del CRM no es una pantalla: es una cadena que ocurre sola. Cuatro piezas:
**señal** (algo pasó), **mensaje** (sale sin que nadie lo pida), **seguimiento** (si no hubo
respuesta, el siguiente toque tiene fecha), **rastro** (la bandeja y la auditoría quedan con lo que
sucedió). Sin la última pieza el viaje no existe, porque nadie puede demostrar lo que mandó.

| Viaje | Señal | Mensaje automático | Seguimiento | Funcionalidades |
| --- | --- | --- | --- | --- |
| V-01 Registro incompleto | Un contacto queda creado sin los datos mínimos o sin documentos | Tutorial de cómo completar el alta, paso a paso, con el enlace de carga | Día 2 recordatorio, día 5 tarea de llamada, día 7 material, día 14 cierre a En pausa | F-04, F-09, F-24, F-25 |
| V-02 Documento observado | Cumplimiento marca un documento como Observado o Rechazado | Qué falta y cómo reponerlo | Revisión a las 48 horas; si sigue observado, aviso al rol de ventas | F-16, F-18, F-24 |
| V-03 Consulta sin respuesta | Un entrante llega a 2 horas dentro del horario | Al cliente el acuse con el plazo; al personal la alerta a la cola del rol dueño | Escala a administración a las 4 horas | F-08, F-20, F-24, F-38 |
| V-04 Cadencia B2B | Un contacto entra a la ruta comercial | Los seis pasos con los tres textos aprobados | Cierre automático al día 14 | F-09, F-17, F-24 |
| V-05 Reclamo recibido | Se registra un reclamo | Acuse con número, categoría y plazo | Semáforo hasta el cierre; el plazo legal queda vacío hasta tener el dato | F-13, F-15, F-24 |
| V-06 Ciclo sin contacto | Vence el día 14 sin respuesta | Aviso de cierre de ciclo | Archivo con motivo y reapertura anotada en auditoría | F-09, F-15, F-24 |

**Qué significa que un viaje "exista" sin canal real.** El recorrido completo está construido: la
señal se registra, el motor produce el paso, el texto sale por el adaptador que haya, el resultado se
anota en `messages` y en `cadence_executions`, y la bandeja lo muestra. Si el adaptador es el de
demostración, el mensaje queda marcado como pendiente de envío en lugar de entregado. Con eso se
puede probar el viaje de punta a punta, y al cambiar el adaptador por uno real el viaje no se
reescribe.

**Cómo se prueba.** Con datos del propio equipo: un correo propio, un número propio de WhatsApp, una
cuenta propia. Nunca con datos de clientes reales, que es el guardarraíl 9. Un viaje probado con el
correo de quien lo construye cuenta como probado.

## 5. Guardarraíles que no son opcionales

1. Ningún texto de interfaz ni mensaje usa los términos vetados por el glosario de marca.
2. El filtro de términos corre antes de enviar, no después.
3. La respuesta regulatoria cierra con la frase literal de que el entorno de pruebas no constituye
   autorización ni licencia definitiva.
4. Dos horas de nivel de servicio dentro del horario laboral, y el horario se lee de la base.
5. La auditoría no se puede editar ni borrar, ni siquiera con rol de administración.
6. Un usuario no puede promocionarse a sí mismo de rol.
7. Sin credenciales el servidor no arranca; no abre en silencio con datos falsos.
8. El tráfico de un usuario nunca lleva la llave que esquiva la seguridad por fila.
9. Los datos personales de clientes reales no entran en chats, ni en modelos externos, ni en el
   repositorio.

## 6. Orden de construcción

| Bloque | Qué entrega | Funcionalidades |
| --- | --- | --- |
| 1. Cerrar Supabase | Que el CRM lea la base real con la sesión del usuario, el rol correcto y el diccionario de términos leído de la tabla | F-01, F-02, F-11 |
| 2. Bandeja e hilo | La pantalla principal: lista, hilo y responder | F-04, F-05, F-06 |
| 3. Motor y primer viaje | El planificador, su rastro y el viaje V-01 completo con adaptador de demostración | F-07, F-24, F-28 |
| 4. Guardarraíles en la escritura | Términos, nivel de servicio, enrutado y auditoría sobre lo que se escribe | F-08, F-12, F-15, F-32 |
| 5. Cadencia y expediente | Los seis pasos generados, rutas en paralelo, legajo y reclamos | F-09, F-10, F-13, F-16, F-17, F-18, F-35 |
| 6. Operación diaria | Asignación, actividades, etiquetas, buscador y métricas | F-29 a F-34, F-36 a F-38 |
| 7. Canales reales y plataforma | Correo, WhatsApp y cuentas administrables, y una dirección donde el personal entre | F-03, F-20, F-25, F-26, F-27, F-23 |

El orden no es decorativo. F-04 necesita la base real, F-06 necesita F-05, y F-24 sin F-05 no tiene
dónde escribir. El bloque 1 está empezado y es el que cierra antes: el puente a las cuatro vistas ya
está escrito y solo falta correrlo contra Supabase.

**Ningún bloque espera la interfaz con la aplicación de pagos.** `F-22` quedó aplazada en el
capítulo 2, así que no forma parte de la secuencia.

## 7. Decisiones que faltan

Preguntas que no se pueden resolver desde el código.

1. Plazo legal de respuesta de un reclamo. Mientras no esté, `due_at` queda vacío.
2. Si el horario de atención es efectivamente lunes a viernes de 09:00 a 17:00.
3. Colores y rótulos de marca, incluido el de la cabecera de la pantalla de acceso.
4. La razón social exacta que va en los documentos.
5. Quién da de alta las cuentas del personal y con qué procedimiento hasta que exista F-03.
6. Si el CRM devuelve algo a la aplicación de pagos, o solo lee. Con la separación de base que está
   en vigor y la aplazada F-22, la respuesta por defecto es que solo lee.
7. Con qué correo, qué número de WhatsApp y qué cuenta se prestan para probar los viajes. Tienen que
   ser cuentas del equipo que construye, nunca de un cliente real (guardarraíl 9).
8. Si los seis viajes de la sección 4 son los que la operación de verdad necesita, y cuáles sobran.
   Están escritos como propuesta propia precisamente para que se poden.
