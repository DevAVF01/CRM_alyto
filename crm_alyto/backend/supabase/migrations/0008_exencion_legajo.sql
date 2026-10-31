-- 0008: la exencion de documento para aprobar una casilla del legajo.
--
-- Esta es la funcionalidad que el administrador pidio el 29/10: la potestad de aprobar una
-- casilla que exige documento aunque el documento todavia no este, sin romper el guardarraíl,
-- y dejando asiento inmutable de que la exencion existio.
--
-- Por que la regla se queda puesta: una casilla "Aprobado" sin respaldo es la clase de hueco
-- que el ECP no perdona. Por eso no se relaja el disparador require_document_for_approval y no
-- se abre una puerta amplia: se abre una sola, con dos cheques (rol autorizado, motivo por
-- escrito), que escribe la fila y el asiento en la misma transaccion adentro de la base.
--
-- El camino es una funcion RPC: el backend la llama con el token del usuario, la base hace
-- todo (exencion, actualizacion, asiento) y devuelve la fila. La pantalla solo la pinta.

-- 1. La exencion adentro del guardián de aprobacion. Con la marca puesta por la funcion,
-- el documento ya no hace falta para pasar. La marca vive solo para esa transaccion.
create or replace function public.require_document_for_approval()
returns trigger
language plpgsql
as $$
declare
  hace_falta boolean;
  archivos integer;
begin
  -- La exencion es una decision explicita, tal y como la definimos: no es una puerta
  -- abierta, es un salvoconducto que la funcion de abajo emite fila por fila.
  if coalesce(current_setting('crm.exempt_document', true), '') = 'on' then
    return new;
  end if;

  select d.document_required into hace_falta
  from public.document_requirements d
  where d.code = new.requirement_code;

  if new.status = 'Aprobado' and coalesce(hace_falta, false) and old.status is distinct from 'Aprobado' then
    select count(*) into archivos
    from public.documents
    where client_id = new.client_id
      and requirement_code = new.requirement_code
      and review_status = 'Aprobado'
      and deleted_at is null;

    if archivos = 0 then
      raise exception 'El requisito % requiere un documento aprobado antes de aprobarse', new.requirement_code
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- 2. La funcion que decide la exencion, escribe la casilla y el asiento en un paso.
create or replace function public.aprobar_casilla_con_exencion(
  p_client_id uuid,
  p_requirement_code text,
  p_detail text
) returns public.document_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fila public.document_reviews;
  v_requiere boolean;
begin
  -- El motivo no es opcional: una exencion sin razon es un hueco con otro nombre.
  if p_detail is null or length(trim(p_detail)) < 3 then
    raise exception 'La exencion exige el motivo por escrito'
      using errcode = 'check_violation';
  end if;

  if public.current_role_name() not in ('admin', 'compliance') then
    raise exception 'Aprobar con exencion es de administracion y de cumplimiento'
      using errcode = 'insufficient_privilege';
  end if;

  select d.document_required into v_requiere
  from public.document_requirements d
  where d.code = p_requirement_code;

  if v_requiere is distinct from true then
    raise exception 'El requisito % no exige documento: use la revision normal', p_requirement_code
      using errcode = 'check_violation';
  end if;

  perform set_config('crm.exempt_document', 'on', true);

  update public.document_reviews fr
     set status = 'Aprobado',
         detail = p_detail,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where fr.client_id = p_client_id
     and fr.requirement_code = p_requirement_code
  returning * into v_fila;

  if v_fila is null then
    raise exception 'La casilla % no existe para esta cuenta', p_requirement_code
      using errcode = 'no_data_found';
  end if;

  insert into public.audit_events (actor, actor_id, actor_kind, action, entity_type, entity_id, detail, outcome)
  values (
    coalesce(public.current_user_email(), 'desconocido'),
    auth.uid(),
    'humano',
    'aprobacion_con_exencion',
    'document_review',
    p_client_id::text || ':' || p_requirement_code,
    p_detail,
    'exito'
  );

  return v_fila;
end;
$$;

-- 3. El permiso de entrar a la funcion entra con el usuario autenticado: el chequeo del rol
--    se hace adentro, con la misma funcion que la barra de policies.
grant execute on function public.aprobar_casilla_con_exencion(uuid, text, text) to authenticated;

-- Chequeo del camino: con admin y la ficha de una casilla 'Observado' de un requisito con
-- documento, la llamada tiene que pasar la casilla a 'Aprobado' y el registro tiene que mostrar
-- el asiento 'aprobacion_con_exencion'. Con soporte, la misma llamada tiene que rebotar con el
-- mensaje del rol. Sin motivo (o con menos de 3 letras), rechazo de valor.
