-- F-03 (cuentas del personal): reabre en privilegio el UPDATE de profiles para authenticated.
--
-- La politica profiles_write (0004) ya limita el cambio al rol admin de la base:
--   for update to authenticated using (public.current_role_name() = 'admin')
-- 0007 habia puesto un revoke por si acaso para proteger la fila que nace del disparador
-- on_auth_user_created. Sin este grant, el administrador no puede aceptar, suspender ni
-- promover a nadie desde la interfaz: la base contesta permission denied aun siendo admin.
-- El INSERT sigue revocado a proposito: el perfil se escribe una sola vez y lo escribe el
-- disparador; la solicitud de cuenta tambien lo hace con la llave de servicio, nunca con un
-- token de persona.
--
-- Idempotente: grant repetido no cambia nada. Contrarrestraba: block_audit_mutation no se toca;
-- el asiento de cada decision sigue escribiendose en audit_events por la politica audit_insert.

grant update on public.profiles to authenticated;
