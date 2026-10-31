-- desarmar.sql: vacia el esquema public para poder montar el modelo del CRM del 27/10.
--
-- Para que sirve. En el proyecto crm-alyto-ecp sigue viva la estructura anterior, la de las 26
-- tablas con embudo de ventas. Las migraciones nuevas crean con "create table" a secas, asi que
-- con las viejas delante la primera sentencia falla. Este fichero borra el contenido de public y
-- nada mas. Es el unico paso destructivo del montaje, y por eso esta candado: si se corre sin la
-- marca, se niega y no toca nada.
--
-- Que NO toca, y por que importa:
--   * auth, storage, realtime, extensions, pg_catalog: son de la plataforma, no del CRM. Las
--     cinco cuentas de personal viven en auth.users y siguen ahi despues del desarme, que es lo
--     que permite volver a correr el seed.sql sin dar de alta usuarios otra vez.
--   * Las extensiones instaladas dentro de public (pgcrypto, pg_trgm, uuid-ossp y las que esten).
--     Sus objetos pertenecen a la extension, y el filtro pg_depend con deptype = 'e' los deja
--     fuera. Sin ese filtro el desarme arruinaria la base de un portazo.
--   * storage.objects: esta en el esquema storage, y las politicas del cubo expedientes se crearon
--     desde el panel. Esas politicas no se pierden porque el cubo tampoco esta en public.
--
-- Orden de corrida en el SQL Editor (pestanas de https://supabase.com, proyecto crm-alyto-ecp):
--   1. Copiar SOLO el bloque 1 y correrlo. Devuelve el inventario de lo que hay ahora en public.
--      Anotar cuantas tablas salen: es lo que se esta a punto de borrar.
--   2. Copiar el bloque 2 entero, despues de descomentar la linea set_config. Devuelve el reporte
--      con los conteos de lo borrado. El editor solo muestra el primer resultado de una corrida,
--      y ahi ese unico resultado es el reporte.
--   3. Correr en orden 0001, 0002, 0003, 0004 y 0006 (un Run por fichero). En 0001 esta la
--      sentencia que vuelve a enlazar los cinco usuarios de Auth con su perfil: el desarme se
--      lleva profiles por ser tabla de public, y sin ese enlace nadie tendria rol ni nombre.
--   4. Correr seed.sql.
--   5. Correr verificacion.sql: 50 filas y ok = true en las 50.
--
-- Si el reporte sale en cero no habia nada que borrar y el montaje puede correr igual: el desarme
-- no es la condicion de exito, es la limpieza previa.

-- ---------------------------------------------------------------------------
-- 1) Inventario. Solo lectura: no borra absolutamente nada.
-- Esperado: Success y una fila por objeto de public, con su tipo en texto.
-- ---------------------------------------------------------------------------

select case c.relkind
         when 'r' then 'tabla'
         when 'p' then 'tabla particionada'
         when 'v' then 'vista'
         when 'm' then 'vista materializada'
         when 'S' then 'secuencia'
         else c.relkind::text
       end as tipo,
       c.relname as objeto
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm', 'S')
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_class'::regclass
      and d.objid = c.oid
      and d.deptype = 'e'
  )
order by tipo, objeto;

-- ---------------------------------------------------------------------------
-- 2) Desarme. Borra el contenido de public en este orden: tablas y vistas, despues los tipos
--    enumerados, despues las funciones. Cada paso va en cascade porque las vistas dependen de las
--    tablas y los disparadores dependen de las funciones; al reves habria que adivinar el orden.
--
--    Los tipos van aparte: borrar una tabla NO borra el enumerado que usaban sus columnas, y los
--    migradores nuevos vuelven a crear esos enumerados, asi que dejarlos delante produce
--    "type ... already exists".
--
-- Esperado: Success y el reporte con cuatro filas (tablas, vistas, tipos, funciones).
-- ---------------------------------------------------------------------------

-- El candado. Esta comentado a proposito: un pegado accidental del fichero entero tiene que
-- negarse, no borrar la base. Se descomenta solo despues de tener el inventario del bloque 1
-- delante. Es set_config local, asi que vive lo que dure esta corrida y no queda flotando en la
-- conexion para un pegado posterior.
--
select set_config('crm.desarmar', 'si', true);

do $$
declare
  b record;
  n_tablas integer := 0;
  n_vistas integer := 0;
  n_tipos integer := 0;
  n_funciones integer := 0;
begin
  if coalesce(current_setting('crm.desarmar', true), '') <> 'si' then
    raise exception 'El desarme esta protegido a proposito: descomente la linea set_config de crm.desarmar para que borre, y antes corra el inventario del bloque 1';
  end if;

  create temp table desarme (objeto text, borrados integer) on commit drop;

  -- Tablas y vistas. Se recorre una vez por clase para que las vistas se vayan antes que las
  -- tablas que les dan de comer; con cascade el orden no rompe, pero el conteo sale correcto.
  for b in
    select c.oid::regclass as nombre, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
    order by case c.relkind when 'v' then 0 when 'm' then 0 else 1 end, c.relname
  loop
    if b.relkind in ('v', 'm') then
      execute format('drop view %s cascade', b.nombre);
      n_vistas := n_vistas + 1;
    else
      execute format('drop table %s cascade', b.nombre);
      n_tablas := n_tablas + 1;
    end if;
  end loop;

  -- Enumerados y dominios. Se excluyen los tipos compuestos ('c'), que son la fila de una tabla y
  -- ya se fueron con ella.
  for b in
    select t.oid::regtype as nombre
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'd')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_type'::regclass
          and d.objid = t.oid
          and d.deptype = 'e'
      )
  loop
    execute format('drop type %s cascade', b.nombre);
    n_tipos := n_tipos + 1;
  end loop;

  -- Funciones, incluidas las de los disparadores: sin cascade, una funcion referida por un
  -- disparador huesped no se va.
  for b in
    select p.oid::regprocedure as nombre
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format('drop function %s cascade', b.nombre);
    n_funciones := n_funciones + 1;
  end loop;

  insert into desarme values
    ('tablas', n_tablas),
    ('vistas', n_vistas),
    ('tipos', n_tipos),
    ('funciones', n_funciones);
end;
$$;

-- El unico resultado del bloque 2, y por eso va al final: el editor muestra el primero y nada mas.

select objeto, borrados from desarme order by objeto;

-- ---------------------------------------------------------------------------
-- 3) Confirmacion. Despues del desarme public tiene que estar vacio de objetos del CRM. Las
--    columnas salen en 0; si algo no es 0, el bloque 2 no corro entero y hay que volver a correrlo
--    antes de pasar a las migraciones.
-- Esperado: Success y una fila con los cuatro conteos en 0.
-- ---------------------------------------------------------------------------

select (select count(*) from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
          and not exists (select 1 from pg_depend d
                          where d.classid = 'pg_class'::regclass and d.objid = c.oid
                            and d.deptype = 'e')) as tablas_y_vistas,
       (select count(*) from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'public' and t.typtype in ('e', 'd')
          and not exists (select 1 from pg_depend d
                          where d.classid = 'pg_type'::regclass and d.objid = t.oid
                            and d.deptype = 'e')) as tipos,
       (select count(*) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and not exists (select 1 from pg_depend d
                          where d.classid = 'pg_proc'::regclass and d.objid = p.oid
                            and d.deptype = 'e')) as funciones,
       (select count(*) from auth.users) as cuentas_de_auth_intactas;
