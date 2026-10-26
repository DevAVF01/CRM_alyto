-- chequeos.sql: las cuatro consultas que se repiten durante la Fase 2.
--
-- No crea nada ni cambia nada: solo lee. Se puede correr cuantas veces se quiera.
-- Cada bloque tiene arriba, en comentario, en qué paso toca correrlo y qué debe salir.
--
-- Como se usa: abrir este fichero, seleccionar UN bloque (las lineas de SQL entre los
-- separadores), copiarlo con Ctrl+C, pegarlo en el SQL Editor del panel de Supabase y
-- darle a Run. Seleccionar un bloque entero no es obligatorio para el motor, pero si pegas
-- los cuatro juntos veras solo el ultimo resultado y no sabras cual es cual.

-- ---------------------------------------------------------------------------
-- Pasos 3, 5, 6 y 7 del procedimiento. Conteo de tablas.
-- Esperado: 4 despues de 0001, 9 despues de 0002, 25 despues de 0003, 26 despues de 0004.
--
-- El filtro table_type = 'BASE TABLE' es obligatorio: information_schema es el inventario
-- de la base y sin ese filtro cuenta tambien las vistas (consultas guardadas con nombre),
-- que son nueve, y el numero sube sin que nadie haya creado ninguna tabla.
-- ---------------------------------------------------------------------------

select count(*) as tablas
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';

-- ---------------------------------------------------------------------------
-- Paso 4 del procedimiento. Horas habiles entre el viernes 16:00 y el lunes 11:00.
-- Esperado: 3.00.  Una hora del viernes (se cierra a las 17:00), cero del fin de semana,
-- dos del lunes (se abre a las 09:00).
--
-- Si sale 67 el fin de semana no se esta saltando y las alertas de SLA (el plazo de
-- respuesta de 2 horas) se dispararian mal. La zona -04 es la hora de Bolivia.
-- ---------------------------------------------------------------------------

select public.business_hours_between('2026-10-23 16:00:00-04', '2026-10-26 11:00:00-04')
  as horas_habiles;

-- ---------------------------------------------------------------------------
-- Paso 8 del procedimiento. El diccionario del glosario.
-- Esperado: bloqueo 7, advertencia 3.
--
-- severidad 'bloqueo'    : el disparador impide escribir el mensaje.
-- severidad 'advertencia': se escribe y aparece en la vista vw_messages_flagged.
-- ---------------------------------------------------------------------------

select severity, count(*) as cuantos
from public.blocked_terms
group by severity
order by severity;

-- ---------------------------------------------------------------------------
-- Pasos 12 y 13 del procedimiento. Los perfiles del equipo.
-- Esperado despues del paso 12: 5 filas, todas con role = 'soporte'. despues del paso 13, un role distinto por fila.
--
-- Que los cinco nazcan en 'soporte' no es un error: el alta del panel no puede escribir
-- app_metadata (la bolsa que solo la llave de servicio toca), y ahi es donde vive el rol.
-- La seccion 0 del seed.sql lo corrige en la segunda pasada.
-- ---------------------------------------------------------------------------

select email, role, display_name, is_active
from public.profiles
order by email;
