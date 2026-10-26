-- modelo.sql: el esquema del CRM leido de la base en marcha, no de un diagrama.
--
-- No crea nada ni cambia nada: solo lee. Se puede correr cuantas veces se quiera.
-- Cuatro bloques separados por rayas. Se pega UN bloque a la vez en el SQL Editor del panel
-- y se le da a Run; si pegas los cuatro juntos veras solo el ultimo resultado.
--
-- Para que sirve cada uno:
--   A  el inventario: que tablas hay, cuantas columnas, cuanto cuelga de ellas
--   B  la ficha columna por columna, con su tipo y si es obligatoria
--   C  las claves ajenas: quien cuelga de quien y que pasa al borrar el padre
--   D  enums, vistas y disparadores: las reglas que impone la base
--
-- Los conteos de filas del escenario de demostracion no salen aqui: para eso esta
-- verificacion.sql, que los compara contra el numero esperado y dice true o false.

-- ---------------------------------------------------------------------------
-- BLOQUE A. Inventario.
-- Esperado: 26 filas. "salientes" son las claves ajenas que la tabla declara hacia otra,
-- y "politicas" los permisos por fila que tiene encima (la mayoria, lectura mas escritura).
-- clients y profiles son las de mayor grado: casi todo apunta a ellas.
-- ---------------------------------------------------------------------------

select t.table_name as tabla,
       (select count(*)::int
          from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = t.table_name) as columnas,
       (select count(distinct rc.constraint_name)::int
          from information_schema.referential_constraints rc
          join information_schema.key_column_usage k on k.constraint_name = rc.constraint_name
         where k.table_schema = 'public' and k.table_name = t.table_name) as salientes,
       (select count(*)::int from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.table_name) as politicas
from information_schema.tables t
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by t.table_name;

-- ---------------------------------------------------------------------------
-- BLOQUE B. Columnas.
-- Esperado: unas 300 filas. nn = true significa que la columna no admite vacio.
-- Las que terminan en _at y no son nn son fecha opcional, no un error del diseno.
-- ---------------------------------------------------------------------------

select table_name as tabla,
       ordinal_position as n,
       column_name as columna,
       case when data_type = 'USER-DEFINED' then udt_name else data_type end as tipo,
       is_nullable = 'NO' as nn,
       coalesce(column_default, '') as por_defecto
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- ---------------------------------------------------------------------------
-- BLOQUE C. Claves ajenas.
-- Esperado: 54 filas. on_delete cascade = se borra el hijo con el padre.
-- set null = el hijo sobrevive sin padre. NO ACTION = prohibido borrar el padre
-- mientras existan hijos (solo aparece en activities.owner_id y en las de catalogo).
-- ---------------------------------------------------------------------------

select kcu.table_name as hijo,
       kcu.column_name as columna,
       ccu.table_name as padre,
       ccu.column_name as columna_padre,
       rc.delete_rule as al_borrar
from information_schema.referential_constraints rc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = rc.constraint_name and kcu.table_schema = 'public'
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = rc.constraint_name
order by hijo, columna;

-- ---------------------------------------------------------------------------
-- BLOQUE D. Enums, vistas y disparadores.
-- Esperado: 17 enums, 9 vistas, 25 disparadores (24 sobre tablas propias y 1 sobre auth.users).
-- Las politicas del cubo no salen aqui: viven en el esquema storage, y las comprueba
-- el bloque de pg_policies de chequeos.sql.
-- ---------------------------------------------------------------------------

select 'enum' as clase, t.typname as nombre,
       string_agg(e.enumlabel, ', ' order by e.enumsortorder) as detalle
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
group by t.typname

union all

select 'vista', table_name, ''
from information_schema.views
where table_schema = 'public'

union all

select 'disparador',
       (select relname from pg_class c where c.oid = tg.tgrelid) || '.' || tg.tgname,
       -- El momento se saca del texto de la definicion, no del numero magico tgtype:
       -- los bits de pg_trigger no son evidentes y una lectura al reves diria "antes"
       -- donde hay "tras".
       case (regexp_match(pg_get_triggerdef(tg.oid), '(BEFORE|AFTER|INSTEAD OF) [A-Z ]+ ON '))[1]
         when 'BEFORE' then 'antes de '
         when 'INSTEAD OF' then 'en lugar de '
         else 'tras ' end
       || lower(coalesce((regexp_match(pg_get_triggerdef(tg.oid),
              '(BEFORE|AFTER|INSTEAD OF) ([A-Z ]+) ON '))[2], '?'))
       || case when tg.tgtype::int & 1 = 1 then ', por fila' else ', por sentencia' end
from pg_trigger tg
where not tgisinternal
  and (tg.tgrelid in (select oid from pg_class
                       where relnamespace = 'public'::regnamespace and relkind = 'r')
       or tg.tgrelid = 'auth.users'::regclass)

order by 1, 2;
