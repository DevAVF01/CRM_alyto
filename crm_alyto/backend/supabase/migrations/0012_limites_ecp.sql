-- 0012: los topes del Entorno Controlado de Pruebas dejan de ser decoracion.
--
-- La fila de ecp_parameters (0001) trae los numeros que fijo ASFI: 630 usuarios y 630 operaciones
-- por dia, un maximo de 120.000 Bs por operacion y 12 meses de duracion. Hasta hoy la base los
-- guardaba y el CRM los leia, pero ninguno de los dos los exigia. El que mas importa es el monto:
-- la ficha del cliente tiene la columna tope_operacion_bs y Cumplimiento puede escribir en ella
-- cualquier numero mayor que cero. O sea que se podia registrar, desde la pantalla y sin que nadie
-- avisara, un cliente autorizado a operar 500.000 Bs por operacion dentro de un entorno que tiene
-- un tope de 120.000. Un guardarrailes que se puede romper con el formulario no es un guardarrailes.
--
-- Por que un disparador y no un check: un check de tabla solo puede mirar su propia fila. Comparar
-- contra otra tabla necesita leer ecp_parameters, y eso es funcion. El raise sale con el codigo
-- P0001, que el puente del backend ya traduce a 400 con el prefijo "La base lo impuso:", asi que el
-- mensaje que ve Cumplimiento es el mismo texto de aqui abajo, no un error generico.
--
-- Lo que NO se impone en esta migracion, con proposito: 630 usuarios y 630 operaciones por dia son
-- topes del ambiente de pagos, y las operaciones no corren por el CRM. El CRM no puede contar lo que
-- no ejecuta; lo que si puede hacer es tener esos numeros a la vista, y eso es la segunda parte del
-- cambio (la franja del Panel). Inventar un conteo propio para un tope ajeno seria peor: dos cifras
-- distintas conviviendo y ninguna mandando.
--
-- Y la duracion. Doce meses es un plazo que corre desde que ASFI autoriza, y en la base no estaba
-- por ningun lado: sin fecha de inicio el numero era incomputable. Se agrega inicio_ecp, una sola
-- vez y a mano. La fila de parametros se lee por la interfaz y no se edita por ella (0007 quito el
-- update y el puente del CRM lo declara de solo lectura), asi que la fecha se anota desde el editor
-- SQL con la sentencia del final de este archivo.

-- ---------------------------------------------------------------------------
-- 1. El techo del ECP accesible como funcion, para poder compararlo con la ficha.
-- ---------------------------------------------------------------------------

create or replace function public.ecp_monto_maximo_operacion_bs()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select monto_maximo_operacion_bs from public.ecp_parameters where id = 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. La traba sobre la ficha del cliente.
-- ---------------------------------------------------------------------------

create or replace function public.clients_tope_dentro_del_ecp()
returns trigger
language plpgsql
as $$
declare
  tope_ecp numeric;
begin
  -- Un cliente sin tope anotado no esta declarando ninguno: la columna es nullable a proposito,
  -- porque el legajo arranca antes de que Cumplimiento defina el margen. No se rechaza.
  if new.tope_operacion_bs is null then
    return new;
  end if;

  tope_ecp := public.ecp_monto_maximo_operacion_bs();

  -- Sin la fila de parametros no hay con que comparar. Es el escenario del editor SQL contra una
  -- base recien creada; se deja pasar y la falta se ve en el Panel, que avisa cuando no lee la fila.
  if tope_ecp is null then
    return new;
  end if;

  if new.tope_operacion_bs > tope_ecp then
    raise exception
      'El tope por operacion de % Bs pasa el maximo del Entorno Controlado de Pruebas, que es % Bs. El numero lo fija ASFI en la fila de parametros.',
      new.tope_operacion_bs, tope_ecp
      using errcode = 'raise_exception';
  end if;

  return new;
end;
$$;

-- Insert ademas de update: la 0004 cerro la ficha contra el resto del equipo con un disparador de
-- update nada mas, y un alta nueva con el tope arriba del techo entraba igual. Los cinco roles del
-- CRM pueden crear cuentas por la interfaz, asi que el alta es exactamente por donde entra.
create trigger clients_tope_dentro_del_ecp
  before insert or update on public.clients
  for each row execute function public.clients_tope_dentro_del_ecp();

-- ---------------------------------------------------------------------------
-- 3. La fecha que hacia falta para poder contar los doce meses.
-- ---------------------------------------------------------------------------

alter table public.ecp_parameters
  add column if not exists inicio_ecp date;

comment on column public.ecp_parameters.inicio_ecp is
  'Fecha en que ASFI autorizo el Entorno Controlado de Pruebas. Con duracion_maxima_ecp_meses da el vencimiento. Se anota una vez desde el editor SQL.';

-- El vencimiento se calcula, no se guarda: si alguien mueve la duracion maxima, una columna copiada
-- quedaria discutiendo con el parametro del que salio.
create or replace function public.ecp_vencimiento_ecp()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.inicio_ecp is null then null
    else p.inicio_ecp + make_interval(months => p.duracion_maxima_ecp_meses)
  end
  from public.ecp_parameters p
  where p.id = 1;
$$;

-- ---------------------------------------------------------------------------
-- 4. Los privilegios. La funcion de lectura del techo se arma security definer, asi que se la deja
--    ejecutable para quien ya puede leer la ficha; no abre ninguna puerta nueva porque solo devuelve
--    un numero que la politica ecp_parameters_read de 0004 ya deja ver a todo el equipo.
-- ---------------------------------------------------------------------------

grant execute on function public.ecp_monto_maximo_operacion_bs() to authenticated;
grant execute on function public.ecp_vencimiento_ecp() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. La sentencia que anota la fecha de inicio. Reemplazar la fecha por la de la autorizacion real.
--    Corre el dueno de la tabla en el editor SQL del panel; el update de un usuario de la interfaz
--    lo bloquean a la vez la marca de sistema de 0007 y el revoke de privilegios.
--
--    select set_config('crm.system_write', 'on', true);
--    update public.ecp_parameters set inicio_ecp = date '2026-05-01' where id = 1;
--
--    Sin la marca, el update rebota: es la traba de la prueba c) de pruebas-negativas.sql.
-- ---------------------------------------------------------------------------
