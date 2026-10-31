-- 0007: los privilegios de escritura que 0004 se dejo sin conceder.
--
-- El bloque de privilegios de 0004 concede select a authenticated y nada mas, con el argumento
-- de que "escribir lo gobiernan las politicas". Ese resumen esta incompleto: en PostgreSQL la
-- politica de seguridad por fila decide que filas, y el privilegio de tabla decide si la
-- operacion siquiera se intenta. Sin el GRANT, toda escritura de la aplicacion moria con
-- 42501 "permission denied for table", con rol administrador y sin el.
--
-- Detectado en vivo el 29/10: PATCH /api/crm/casillas/:cliente/:codigo con admin y compliance
-- respondio 403 "modificacion de document_reviews: permission denied for table document_reviews".
-- El sondeo (scripts/sondeo-casilla.mjs) hace la replica: entra como usuario real, toca la fila
-- y muestra el error con su codigo.
--
-- El alcance es insert y update, nada de delete: el borrado es logico con deleted_at y ninguna
-- escritura de la aplicacion pasa por DELETE. La lista de columnas que toca cada escritura vive
-- en backend/src/data/repository.js, en el mapa TABLAS.

-- 1. La escritura que la aplicacion si usa, sobre las tablas de trabajo.
grant insert, update on all tables in schema public to authenticated;

-- 2. La auditoria sigue inmodificable. El blanket de arriba volvio a otorgar update en la tabla
--    donde 0004 lo habia quitado con revoke; se reescribe ese revoke para dejar el criterio
--    intacto. El insert si queda concedido: la politica audit_insert de 0004 lo contempla con
--    check (true), porque los asientos entran desde las rutas de la aplicacion con el usuario
--    por detras.
revoke update on public.audit_events from authenticated;

-- 3. Los asientos de ruta los escribe la base sola: la funcion que registra cada movimiento es
--    security definer y corre con los privilegios de su dueno. Un insert directo desde la
--    aplicacion lo rechaza el disparador route_events_no_direct_write; el revoke lo rechaza una
--    capa antes, por si al disparador un cambio de esquema lo deja pasar.
revoke insert, update on public.route_events from authenticated;

-- 4. El diccionario de terminos y los parametros del ECP se cumplen desde el panel de
--    administracion, no desde la interfaz: quien edita esas filas entra con la llave de
--    servicio. La interfaz las lee y no guarda otra cosa, asi que el grant que el blanket les
--    concedio aca no hace falta y se quita.
revoke insert, update on public.blocked_terms from authenticated;
revoke insert, update on public.ecp_parameters from authenticated;

-- 5. La fila de cada usuario en public.profiles nace por el disparador on_auth_user_created
--    (security definer de la extension auth) y su rol lo fija seed.sql con la llave de
--    servicio. Un usuario no se promociona de rol ni se da de alta el mismo: el guardarraíl 6
--    del catalogo. El revoke cierra esa puerta en privilegio, con la politica por si acaso.
revoke insert, update on public.profiles from authenticated;

-- 5-a. Los privilegios del servicio. Supabase crea el rol service_role con todos los
--      privilegios sobre el esquema, pero esta base fue armada a mano y esa plantilla no
--      quedo escrita para las tablas del remodelado. Sin esta linea, ni la llave de
--      servicio puede reasignar una actividad: el borrado de un usuario de Auth rebotaba en
--      activities.owner_id con 403 antes de llegar a la cascada.
grant all privileges on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;

-- Chequeo mental para correr despues. Con admin en la interfaz: PATCH de una casilla del legajo
-- tiene que entrar; POST de un reclamo, PATCH de una ruta y PATCH de una actividad igual. Con
-- soporte: lo que la politica no autorice rebota con 42501, y eso es una regla que contesta con
-- nombre, no una pantalla ciega. Si algo de esto falta, el sondeo-casilla lo muestra con su
-- codigo HTTP y el mensaje de la base.
